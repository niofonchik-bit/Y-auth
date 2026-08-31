import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { createLocalJWKSet, type JSONWebKeySet, type JWTPayload, jwtVerify } from 'jose';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { oauthClients, users } from '../db/schema.js';
import type { AuthenticatedSession, SessionService } from '../sessions/service.js';
import { AppError } from './errors.js';

export async function requireBrowserSession(request: FastifyRequest, sessions: SessionService): Promise<AuthenticatedSession> {
	const auth = await sessions.authenticate(request);
	if (!auth) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
	return auth;
}

export async function requireAdmin(request: FastifyRequest, sessions: SessionService): Promise<AuthenticatedSession> {
	const auth = await requireBrowserSession(request, sessions);
	if (!auth.user.isAdmin) throw new AppError(403, 'ADMIN_REQUIRED', 'Administrator access required');
	return auth;
}

export interface BearerIdentity {
	userId: string;
	clientId: string;
	scope: Set<string>;
	payload: JWTPayload;
}

export function createBearerAuthenticator(config: AppConfig, db: Database) {
	const keySet = createLocalJWKSet(config.jwks as JSONWebKeySet);
	return async (request: FastifyRequest): Promise<BearerIdentity> => {
		const header = request.headers.authorization;
		if (!header?.startsWith('Bearer ')) {
			throw new AppError(401, 'BEARER_TOKEN_REQUIRED', 'Bearer token required');
		}
		const token = header.slice('Bearer '.length);
		let verified: Awaited<ReturnType<typeof jwtVerify>>;
		try {
			verified = await jwtVerify(token, keySet, {
				issuer: config.issuer.origin,
			});
		} catch {
			throw new AppError(401, 'TOKEN_INVALID', 'Access token is invalid');
		}
		const clientId = verified.payload.client_id;
		const userId = verified.payload.sub;
		if (typeof clientId !== 'string' || typeof userId !== 'string') {
			throw new AppError(401, 'TOKEN_INVALID', 'Access token is invalid');
		}
		const [client] = await db
			.select({
				audience: oauthClients.accessTokenAudience,
				enabled: oauthClients.enabled,
			})
			.from(oauthClients)
			.where(eq(oauthClients.clientId, clientId))
			.limit(1);
		const [user] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
		const audience = Array.isArray(verified.payload.aud) ? verified.payload.aud : [verified.payload.aud];
		if (!client?.enabled || user?.status !== 'active' || !audience.includes(client.audience)) {
			throw new AppError(401, 'TOKEN_INVALID', 'Access token is invalid');
		}
		return {
			userId,
			clientId,
			scope: new Set(typeof verified.payload.scope === 'string' ? verified.payload.scope.split(' ') : []),
			payload: verified.payload,
		};
	};
}
