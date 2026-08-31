import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const valid = {
	NODE_ENV: 'development',
	AUTH_ISSUER: 'http://localhost:3000',
	DATABASE_URL: 'postgresql://test',
	DATABASE_DIRECT_URL: 'postgresql://test',
	REDIS_URL: 'redis://localhost:6379',
	OIDC_JWKS: JSON.stringify({
		keys: [{ kty: 'RSA', kid: 'test', d: 'private' }],
	}),
	OIDC_COOKIE_KEYS: `${'a'.repeat(40)},${'b'.repeat(40)}`,
	SESSION_HMAC_SECRET: 's'.repeat(40),
	CSRF_HMAC_SECRET: 'c'.repeat(40),
	RATE_LIMIT_HMAC_SECRET: 'r'.repeat(40),
};

describe('startup configuration', () => {
	it('loads typed TTL values', () => {
		const config = loadConfig(valid);
		expect(config.ACCESS_TOKEN_TTL_SECONDS).toBe(600);
		expect(config.SSO_ABSOLUTE_TTL_SECONDS).toBeGreaterThan(config.SSO_IDLE_TTL_SECONDS);
	});

	it('rejects HTTP and the wrong canonical issuer in production', () => {
		expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow('HTTPS');
		expect(() =>
			loadConfig({
				...valid,
				NODE_ENV: 'production',
				AUTH_ISSUER: 'https://other.example',
			}),
		).toThrow('exactly');
	});

	it('rejects Argon2id parameters below the security floor', () => {
		expect(() => loadConfig({ ...valid, ARGON2_MEMORY_KIB: '1024' })).toThrow('security floor');
	});
});
