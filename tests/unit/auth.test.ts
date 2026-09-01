import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/env.js';
import type { Database } from '../../src/db/client.js';
import { createBearerAuthenticator } from '../../src/shared/auth.js';

function queryResult<T>(value: T) {
	return {
		from() {
			return this;
		},
		where() {
			return this;
		},
		limit: async () => [value],
	};
}

describe('bearer authentication', () => {
	it('verifies an access token when OIDC_JWKS contains the private signing key', async () => {
		const { privateKey } = await generateKeyPair('RS256', {
			modulusLength: 2048,
			extractable: true,
		});

		const privateJwk = await exportJWK(privateKey);
		privateJwk.kid = 'test-key';
		privateJwk.alg = 'RS256';
		privateJwk.use = 'sig';

		const clientId = 'ya_test';
		const userId = 'test-user';
		const audience = `urn:y-auth:client:${clientId}`;

		const token = await new SignJWT({
			client_id: clientId,
			scope: 'openid profile email y_auth.sessions',
		})
			.setProtectedHeader({
				alg: 'RS256',
				kid: privateJwk.kid,
			})
			.setIssuer('https://auth.niofon.com')
			.setAudience(audience)
			.setSubject(userId)
			.setIssuedAt()
			.setExpirationTime('10m')
			.sign(privateKey);

		const select = vi
			.fn()
			.mockReturnValueOnce(
				queryResult({
					audience,
					enabled: true,
				}),
			)
			.mockReturnValueOnce(
				queryResult({
					status: 'active',
				}),
			);

		const authenticate = createBearerAuthenticator(
			{
				issuer: new URL('https://auth.niofon.com'),
				jwks: {
					keys: [privateJwk],
				},
			} as AppConfig,
			{ select } as unknown as Database,
		);

		const identity = await authenticate({
			headers: {
				authorization: `Bearer ${token}`,
			},
		} as never);

		expect(identity.userId).toBe(userId);
		expect(identity.clientId).toBe(clientId);
		expect(identity.scope).toEqual(new Set(['openid', 'profile', 'email', 'y_auth.sessions']));
		expect(identity.payload.aud).toBe(audience);
	});
});
