import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuditService } from '../audit/service.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { verifyCsrf } from '../security/csrf.js';
import type { SessionService } from '../sessions/service.js';
import { createBearerAuthenticator, requireBrowserSession } from '../shared/auth.js';
import { AppError } from '../shared/errors.js';
import { desc, eq } from 'drizzle-orm';
import { auditEvents, externalIdentities, userSessions, users } from '../db/schema.js';
import type { AccountService } from './service.js';
import type { MfaService } from '../mfa/service.js';

interface CsrfBody {
	csrfToken?: string;
}

function requireCsrf(request: FastifyRequest, submitted: unknown, config: AppConfig): void {
	if (!verifyCsrf(request, submitted, config)) {
		throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
	}
}

export async function registerAccountRoutes(
	app: FastifyInstance,
	dependencies: {
		db: Database;
		account: AccountService;
		sessions: SessionService;
		audit: AuditService;
		config: AppConfig;
		mfa: MfaService;
	},
) {
	const { db, account, sessions, audit, config, mfa } = dependencies;
	const authenticateBearer = createBearerAuthenticator(config, db);

	app.get('/api/v1/account', async (request) => {
		const auth = await requireBrowserSession(request, sessions);
		return {
			id: auth.user.id,
			email: auth.user.email,
			displayName: auth.user.displayName,
			emailVerified: auth.user.emailVerifiedAt !== null,
			status: auth.user.status,
			isAdmin: auth.user.isAdmin,
			locale: auth.user.locale,
			avatarUrl: auth.user.avatarObjectKey ? `/avatars/${auth.user.id}?v=${auth.user.avatarVersion}` : null,
			createdAt: auth.user.createdAt,
		};
	});

	app.patch<{ Body: CsrfBody & { displayName: string | null; locale?: 'en' | 'ru' } }>('/api/v1/account', async (request) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.updateProfile(auth.user.id, { displayName: request.body.displayName, locale: request.body.locale ?? auth.user.locale });
		return { updated: true };
	});

	app.post<{
		Body: CsrfBody & { currentPassword: string; newPassword: string };
	}>('/api/v1/account/change-password', async (request, reply) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.changePassword(auth, request.body.currentPassword, request.body.newPassword, request, reply);
		return { changed: true };
	});

	app.get('/api/v1/account/security', async (request) => {
		const auth = await requireBrowserSession(request, sessions);
		return { mfa: await mfa.status(auth.user.id), emailVerified: Boolean(auth.user.emailVerifiedAt), passwordSet: true };
	});

	app.post<{ Body: CsrfBody & { currentPassword: string } }>('/api/v1/account/mfa/setup', async (request) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.verifyCurrentPassword(auth.user.id, request.body.currentPassword);
		return mfa.beginSetup(auth.user.id, auth.user.email);
	});

	app.post<{ Body: CsrfBody & { code: string } }>('/api/v1/account/mfa/enable', async (request) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		return { enabled: true, recoveryCodes: await mfa.enable(auth.user.id, request.body.code) };
	});

	app.post<{ Body: CsrfBody & { currentPassword: string; code: string } }>('/api/v1/account/mfa/disable', async (request) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.verifyCurrentPassword(auth.user.id, request.body.currentPassword);
		await mfa.verify(auth.user.id, request.body.code);
		await mfa.disable(auth.user.id);
		return { disabled: true };
	});

	app.post<{
		Body: CsrfBody & { currentPassword: string; newEmail: string };
	}>('/api/v1/account/change-email', async (request) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.changeEmail(auth, request.body.newEmail, request.body.currentPassword, request);
		return { changed: true, emailVerified: false };
	});

	app.post<{ Body: CsrfBody & { currentPassword: string } }>('/api/v1/account/deactivate', async (request, reply) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.deactivate(auth, request.body.currentPassword, request);
		sessions.clearCookie(reply);
		return { deactivated: true };
	});

	app.post<{ Body: CsrfBody & { currentPassword: string; confirmation: string } }>('/api/v1/account/delete-request', async (request, reply) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		const purgeAfter = await account.scheduleDeletion(auth, request.body.currentPassword, request.body.confirmation, request);
		sessions.clearCookie(reply);
		return { scheduled: true, purgeAfter };
	});

	app.post<{ Body: CsrfBody & { currentPassword: string } }>('/api/v1/account/export', async (request, reply) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await account.verifyCurrentPassword(auth.user.id, request.body.currentPassword);
		const [profile, identities, ownSessions, ownAudit] = await Promise.all([
			db
				.select({
					id: users.id,
					email: users.email,
					displayName: users.displayName,
					locale: users.locale,
					emailVerifiedAt: users.emailVerifiedAt,
					createdAt: users.createdAt,
				})
				.from(users)
				.where(eq(users.id, auth.user.id)),
			db
				.select({
					provider: externalIdentities.provider,
					providerEmail: externalIdentities.providerEmail,
					createdAt: externalIdentities.createdAt,
					lastUsedAt: externalIdentities.lastUsedAt,
				})
				.from(externalIdentities)
				.where(eq(externalIdentities.userId, auth.user.id)),
			db
				.select({
					id: userSessions.id,
					createdAt: userSessions.createdAt,
					lastSeenAt: userSessions.lastSeenAt,
					expiresAt: userSessions.expiresAt,
					lastIp: userSessions.lastIp,
					revokedAt: userSessions.revokedAt,
				})
				.from(userSessions)
				.where(eq(userSessions.userId, auth.user.id)),
			db
				.select({
					type: auditEvents.type,
					createdAt: auditEvents.createdAt,
					success: auditEvents.success,
					reasonCode: auditEvents.reasonCode,
				})
				.from(auditEvents)
				.where(eq(auditEvents.targetUserId, auth.user.id))
				.orderBy(desc(auditEvents.createdAt))
				.limit(500),
		]);
		await audit.write({ type: 'account.data.exported', success: true, actorUserId: auth.user.id, targetUserId: auth.user.id, request });
		return reply
			.header('Content-Disposition', 'attachment; filename="y-auth-account.json"')
			.send({ exportedAt: new Date(), profile: profile[0], externalIdentities: identities, sessions: ownSessions, securityHistory: ownAudit });
	});

	app.get('/api/v1/account/sessions', async (request) => {
		const auth = await requireBrowserSession(request, sessions);
		const list = await sessions.list(auth.user.id);
		return {
			items: list.map((session) => ({
				...session,
				current: session.id === auth.session.id,
			})),
		};
	});

	app.delete<{ Params: { id: string }; Body: CsrfBody }>('/api/v1/account/sessions/:id', async (request, reply) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		await sessions.revoke(auth.user.id, request.params.id, 'user_revoked');
		if (request.params.id === auth.session.id) sessions.clearCookie(reply);
		await audit.write({
			type: 'session.revoked',
			success: true,
			actorUserId: auth.user.id,
			targetUserId: auth.user.id,
			sessionId: request.params.id,
			request,
		});
		return { revoked: true };
	});

	app.post<{ Body: CsrfBody }>('/api/v1/account/sessions/revoke-others', async (request) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		return {
			revoked: await sessions.revokeOthers(auth.user.id, auth.session.id),
		};
	});

	app.post<{ Body: CsrfBody }>('/api/v1/account/logout-everywhere', async (request, reply) => {
		requireCsrf(request, request.body.csrfToken, config);
		const auth = await requireBrowserSession(request, sessions);
		const revoked = await sessions.revokeAll(auth.user.id, 'logout_everywhere');
		sessions.clearCookie(reply);
		await audit.write({
			type: 'logout.everywhere',
			success: true,
			actorUserId: auth.user.id,
			targetUserId: auth.user.id,
			request,
		});
		return { revoked };
	});

	app.get('/api/v1/me/sessions', async (request) => {
		const identity = await authenticateBearer(request);
		if (!identity.scope.has('y_auth.sessions')) {
			throw new AppError(403, 'INSUFFICIENT_SCOPE', 'The y_auth.sessions scope is required');
		}
		return { items: await sessions.list(identity.userId) };
	});

	app.delete<{ Params: { id: string } }>('/api/v1/me/sessions/:id', async (request) => {
		const identity = await authenticateBearer(request);
		if (!identity.scope.has('y_auth.sessions')) {
			throw new AppError(403, 'INSUFFICIENT_SCOPE', 'The y_auth.sessions scope is required');
		}
		await sessions.revoke(identity.userId, request.params.id, 'trusted_client_revoked');
		return { revoked: true };
	});

	app.post('/api/v1/me/sessions/revoke-others', async (request) => {
		const identity = await authenticateBearer(request);
		if (!identity.scope.has('y_auth.sessions')) {
			throw new AppError(403, 'INSUFFICIENT_SCOPE', 'The y_auth.sessions scope is required');
		}
		const currentSid = typeof identity.payload.sid === 'string' ? identity.payload.sid : null;
		const ownSessions = await sessions.list(identity.userId);
		const current = ownSessions.find((session) => session.sid === currentSid);
		if (!current) throw new AppError(409, 'CURRENT_SESSION_UNKNOWN', 'Current session could not be resolved');
		return {
			revoked: await sessions.revokeOthers(identity.userId, current.id),
		};
	});

	app.post('/api/v1/me/logout-everywhere', async (request) => {
		const identity = await authenticateBearer(request);
		if (!identity.scope.has('y_auth.sessions')) {
			throw new AppError(403, 'INSUFFICIENT_SCOPE', 'The y_auth.sessions scope is required');
		}
		return {
			revoked: await sessions.revokeAll(identity.userId, 'trusted_client_logout_everywhere'),
		};
	});
}
