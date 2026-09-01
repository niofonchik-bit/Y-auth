import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { Redis } from 'ioredis';
import { exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClientService } from '../../src/clients/service.js';
import { type AppConfig, loadConfig } from '../../src/config/env.js';
import { createDatabase, type Database } from '../../src/db/client.js';
import { oidcRecords, users } from '../../src/db/schema.js';
import { DistributedRateLimiter } from '../../src/security/rate-limit.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_REDIS_URL && process.env.ALLOW_TEST_DATABASE_RESET === 'true');

describe.skipIf(!enabled)('PostgreSQL and Redis integration', () => {
	let config: AppConfig;
	let db: Database;
	let sqlClient: ReturnType<typeof createDatabase>['sql'];
	let redis: Redis;

	beforeAll(async () => {
		const { privateKey } = await generateKeyPair('RS256', {
			extractable: true,
		});
		const jwk = await exportJWK(privateKey);
		jwk.kid = 'integration';
		config = loadConfig({
			NODE_ENV: 'test',
			AUTH_ISSUER: 'http://localhost:3000',
			DATABASE_URL: process.env.TEST_DATABASE_URL,
			DATABASE_DIRECT_URL: process.env.TEST_DATABASE_URL,
			REDIS_URL: process.env.TEST_REDIS_URL,
			OIDC_JWKS: JSON.stringify({ keys: [jwk] }),
			OIDC_COOKIE_KEYS: `${'a'.repeat(40)},${'b'.repeat(40)}`,
			SESSION_HMAC_SECRET: 's'.repeat(40),
			CSRF_HMAC_SECRET: 'c'.repeat(40),
			RATE_LIMIT_HMAC_SECRET: 'r'.repeat(40),
			CAPTCHA_MODE: 'off',
		});
		const database = createDatabase(config, true);
		db = database.db;
		sqlClient = database.sql;
		await migrate(db, { migrationsFolder: './migrations' });
		redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
	});

	afterAll(async () => {
		await redis.quit();
		await sqlClient.end({ timeout: 5 });
	});

	it('applies migrations and enforces normalized email uniqueness during parallel registration', async () => {
		const normalizedEmail = `race-${randomUUID()}@example.com`;
		const inserts = await Promise.allSettled([
			db.insert(users).values({ email: normalizedEmail, normalizedEmail }),
			db.insert(users).values({
				email: normalizedEmail.toUpperCase(),
				normalizedEmail,
			}),
		]);
		expect(inserts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		const [result] = await db.select({ value: count() }).from(users).where(eq(users.normalizedEmail, normalizedEmail));
		expect(result?.value).toBe(1);
	});

	it('allows different clients to use the same loopback callback while keeping separate client IDs', async () => {
		const clients = new ClientService(db);
		const callback = 'http://localhost:5173/callback';
		const suffix = randomUUID();
		const base = {
			type: 'public' as const,
			firstParty: true,
			allowLoopbackRedirects: true,
			redirectUris: [callback],
			postLogoutRedirectUris: ['http://localhost:5173/'],
			allowedScopes: ['openid', 'profile', 'email'],
		};

		const projectA = await clients.create({
			...base,
			projectKey: `integration-a-${suffix}`,
			name: 'Integration Project A',
		});
		const projectB = await clients.create({
			...base,
			projectKey: `integration-b-${suffix}`,
			name: 'Integration Project B',
		});

		expect(projectA.clientId).not.toBe(projectB.clientId);
		const [recordA] = await db.select({ payload: oidcRecords.payload }).from(oidcRecords).where(eq(oidcRecords.id, projectA.clientId)).limit(1);
		const [recordB] = await db.select({ payload: oidcRecords.payload }).from(oidcRecords).where(eq(oidcRecords.id, projectB.clientId)).limit(1);

		expect(recordA?.payload.redirect_uris).toEqual([callback]);
		expect(recordB?.payload.redirect_uris).toEqual([callback]);
	});

	it('shares rate-limit state through Redis and fails at the configured threshold', async () => {
		const limiterA = new DistributedRateLimiter(redis, config);
		const limiterB = new DistributedRateLimiter(redis, config);
		const identity = randomUUID();
		await limiterA.consume('integration', identity, 2, 30);
		await limiterB.consume('integration', identity, 2, 30);
		await expect(limiterA.consume('integration', identity, 2, 30)).rejects.toMatchObject({
			statusCode: 429,
		});
	});
});
