import { and, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UAParser } from 'ua-parser-js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { oauthClients, oidcRecords, sessionClients, userSessions, users } from '../db/schema.js';
import { hmacSha256, randomToken } from '../security/crypto.js';
import { AppError } from '../shared/errors.js';

export interface AuthenticatedSession {
	session: typeof userSessions.$inferSelect;
	user: typeof users.$inferSelect;
}

export function sessionCookieName(config: AppConfig): string {
	return config.isProduction ? '__Host-y-auth' : 'y-auth';
}

function describeUserAgent(userAgent: string) {
	const result = UAParser(userAgent);
	return {
		browser: [result.browser.name, result.browser.version].filter(Boolean).join(' ') || 'Unknown browser',
		os: [result.os.name, result.os.version].filter(Boolean).join(' ') || 'Unknown OS',
	};
}

export class SessionService {
	constructor(
		private readonly db: Database,
		private readonly config: AppConfig,
	) {}

	private tokenHash(token: string): string {
		return hmacSha256(this.config.SESSION_HMAC_SECRET, token);
	}

	private setCookie(reply: FastifyReply, token: string): void {
		reply.setCookie(sessionCookieName(this.config), token, {
			path: '/',
			secure: this.config.isProduction,
			httpOnly: true,
			sameSite: 'lax',
			maxAge: this.config.SSO_ABSOLUTE_TTL_SECONDS,
		});
	}

	clearCookie(reply: FastifyReply): void {
		reply.clearCookie(sessionCookieName(this.config), { path: '/' });
	}

	async create(userId: string, request: FastifyRequest, reply: FastifyReply): Promise<string> {
		const token = randomToken(32);
		const now = Date.now();
		const [created] = await this.db
			.insert(userSessions)
			.values({
				userId,
				tokenHash: this.tokenHash(token),
				expiresAt: new Date(now + this.config.SSO_IDLE_TTL_SECONDS * 1_000),
				absoluteExpiresAt: new Date(now + this.config.SSO_ABSOLUTE_TTL_SECONDS * 1_000),
				createdIp: request.ip,
				lastIp: request.ip,
				userAgent: request.headers['user-agent'] ?? 'Unknown',
			})
			.returning({ id: userSessions.id });
		if (!created) throw new Error('Session insert did not return a row');
		this.setCookie(reply, token);
		return created.id;
	}

	async authenticate(request: FastifyRequest): Promise<AuthenticatedSession | null> {
		const token = request.cookies[sessionCookieName(this.config)];
		if (!token) return null;
		const now = new Date();
		const [result] = await this.db
			.select({ session: userSessions, user: users })
			.from(userSessions)
			.innerJoin(users, eq(users.id, userSessions.userId))
			.where(
				and(
					eq(userSessions.tokenHash, this.tokenHash(token)),
					isNull(userSessions.revokedAt),
					gt(userSessions.expiresAt, now),
					gt(userSessions.absoluteExpiresAt, now),
					eq(users.status, 'active'),
				),
			)
			.limit(1);
		if (!result) return null;

		const activityThreshold = new Date(now.getTime() - this.config.SESSION_ACTIVITY_INTERVAL_SECONDS * 1_000);
		if (result.session.lastSeenAt < activityThreshold) {
			const idleExpiry = new Date(
				Math.min(now.getTime() + this.config.SSO_IDLE_TTL_SECONDS * 1_000, result.session.absoluteExpiresAt.getTime()),
			);
			await this.db
				.update(userSessions)
				.set({
					lastSeenAt: now,
					lastIp: request.ip,
					expiresAt: idleExpiry,
				})
				.where(and(eq(userSessions.id, result.session.id), lt(userSessions.lastSeenAt, activityThreshold)));
		}
		return result;
	}

	async rotate(sessionId: string, reply: FastifyReply): Promise<void> {
		const token = randomToken(32);
		await this.db
			.update(userSessions)
			.set({ tokenHash: this.tokenHash(token), lastSeenAt: new Date() })
			.where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)));
		this.setCookie(reply, token);
	}

	async bindOidcSession(userId: string, oidcUid: string): Promise<void> {
		const [candidate] = await this.db
			.select({ id: userSessions.id })
			.from(userSessions)
			.where(and(eq(userSessions.userId, userId), isNull(userSessions.oidcUid), isNull(userSessions.revokedAt)))
			.orderBy(desc(userSessions.createdAt))
			.limit(1);
		if (candidate) {
			await this.db.update(userSessions).set({ oidcUid }).where(eq(userSessions.id, candidate.id));
		}
	}

	async bindClient(oidcUid: string, clientId: string, grantId?: string): Promise<void> {
		const [relation] = await this.db
			.select({ sessionId: userSessions.id, clientId: oauthClients.id })
			.from(userSessions)
			.innerJoin(oauthClients, eq(oauthClients.clientId, clientId))
			.where(eq(userSessions.oidcUid, oidcUid))
			.limit(1);
		if (!relation) return;
		await this.db
			.insert(sessionClients)
			.values({
				sessionId: relation.sessionId,
				clientId: relation.clientId,
				grantId: grantId ?? null,
			})
			.onConflictDoUpdate({
				target: [sessionClients.sessionId, sessionClients.clientId],
				set: { grantId: grantId ?? null },
			});
	}

	async list(userId: string) {
		const rows = await this.db
			.select({
				id: userSessions.id,
				createdAt: userSessions.createdAt,
				lastSeenAt: userSessions.lastSeenAt,
				expiresAt: userSessions.expiresAt,
				sid: userSessions.oidcUid,
				createdIp: userSessions.createdIp,
				lastIp: userSessions.lastIp,
				userAgent: userSessions.userAgent,
				revokedAt: userSessions.revokedAt,
			})
			.from(userSessions)
			.where(eq(userSessions.userId, userId))
			.orderBy(desc(userSessions.lastSeenAt))
			.limit(100);

		return rows.map((row) => ({
			...row,
			...describeUserAgent(row.userAgent),
		}));
	}

	async revoke(userId: string, sessionId: string, reason: string): Promise<void> {
		const [session] = await this.db
			.select({ id: userSessions.id, oidcUid: userSessions.oidcUid })
			.from(userSessions)
			.where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)))
			.limit(1);
		if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
		const grants = await this.db.select({ grantId: sessionClients.grantId }).from(sessionClients).where(eq(sessionClients.sessionId, sessionId));
		const grantIds = grants.flatMap(({ grantId }) => (grantId ? [grantId] : []));

		await this.db.transaction(async (tx) => {
			await tx
				.update(userSessions)
				.set({ revokedAt: new Date(), revocationReason: reason })
				.where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)));
			if (grantIds.length > 0) {
				await tx
					.delete(oidcRecords)
					.where(or(inArray(oidcRecords.grantId, grantIds), and(eq(oidcRecords.model, 'Grant'), inArray(oidcRecords.id, grantIds))));
			}
			if (session.oidcUid) {
				await tx.delete(oidcRecords).where(eq(oidcRecords.uid, session.oidcUid));
			}
		});
	}

	async revokeOthers(userId: string, currentSessionId: string): Promise<number> {
		const sessions = await this.db
			.select({ id: userSessions.id })
			.from(userSessions)
			.where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
		const others = sessions.filter(({ id }) => id !== currentSessionId);
		for (const session of others) await this.revoke(userId, session.id, 'logout_others');
		return others.length;
	}

	async revokeAll(userId: string, reason: string): Promise<number> {
		const sessions = await this.db
			.select({ id: userSessions.id })
			.from(userSessions)
			.where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
		for (const session of sessions) await this.revoke(userId, session.id, reason);
		return sessions.length;
	}
}
