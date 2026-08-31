import type { FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('HTTP security boundaries', () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		const { privateKey } = await generateKeyPair('RS256', {
			extractable: true,
		});
		const jwk = await exportJWK(privateKey);
		jwk.kid = 'security-test';
		app = await buildApp({
			NODE_ENV: 'test',
			AUTH_ISSUER: 'http://localhost:3000',
			DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:65432/unused',
			DATABASE_DIRECT_URL: 'postgresql://unused:unused@127.0.0.1:65432/unused',
			REDIS_URL: 'redis://127.0.0.1:65433',
			OIDC_JWKS: JSON.stringify({ keys: [jwk] }),
			OIDC_COOKIE_KEYS: `${'a'.repeat(40)},${'b'.repeat(40)}`,
			SESSION_HMAC_SECRET: 's'.repeat(40),
			CSRF_HMAC_SECRET: 'c'.repeat(40),
			RATE_LIMIT_HMAC_SECRET: 'r'.repeat(40),
			CAPTCHA_MODE: 'off',
			ENABLE_SWAGGER: 'false',
		});
		await app.ready();
	});

	afterAll(async () => app.close());

	it('sets defensive headers and never enables wildcard CORS', async () => {
		const response = await app.inject({
			method: 'GET',
			url: '/health/live',
			headers: { origin: 'https://evil.example' },
		});
		expect(response.statusCode).toBe(200);
		expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
		expect(response.headers['permissions-policy']).toContain('camera=()');
		expect(response.headers['access-control-allow-origin']).not.toBe('*');
	});

	it('rejects state-changing cookie endpoints without CSRF before processing data', async () => {
		const response = await app.inject({
			method: 'PATCH',
			url: '/api/v1/account',
			payload: { displayName: 'Attacker' },
		});
		expect(response.statusCode).toBe(403);
		expect(response.json()).toMatchObject({
			error: { code: 'CSRF_INVALID' },
		});
	});

	it('publishes canonical OIDC endpoints and prompt=create support', async () => {
		const response = await app.inject({
			method: 'GET',
			url: '/.well-known/openid-configuration',
		});
		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({
			issuer: 'http://localhost:3000',
			authorization_endpoint: 'http://localhost:3000/oauth/authorize',
			token_endpoint: 'http://localhost:3000/oauth/token',
			jwks_uri: 'http://localhost:3000/oauth/jwks',
			code_challenge_methods_supported: ['S256'],
		});
		expect(response.json().prompt_values_supported).toContain('create');
	});
});
