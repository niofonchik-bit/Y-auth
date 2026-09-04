import { count, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuditService } from '../audit/service.js';
import type { ClientInput, ClientService, ClientUpdateInput } from '../clients/service.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { auditEvents, globalSettings, oauthClients, userSessions, users } from '../db/schema.js';
import { verifyCsrf } from '../security/csrf.js';
import type { SessionService } from '../sessions/service.js';
import { requireAdmin } from '../shared/auth.js';
import { AppError } from '../shared/errors.js';
import { VERSION } from '../version.js';

interface CsrfBody {
	csrfToken?: string;
}

function requireCsrf(request: FastifyRequest, token: unknown, config: AppConfig): void {
	if (!verifyCsrf(request, token, config)) throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
}

function pageParams(query: Record<string, unknown>) {
	const pageSize = [25, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 25;
	const page = Math.max(1, Math.floor(Number(query.page) || 1));
	return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function paged<T>(items: T[], page: number, pageSize: number, total: number) {
	return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function registerAdminRoutes(
	app: FastifyInstance,
	dependencies: {
		db: Database;
		clients: ClientService;
		sessions: SessionService;
		audit: AuditService;
		config: AppConfig;
		redisPing: () => Promise<boolean>;
	},
) {
	const { db, clients, sessions, audit, config } = dependencies;

	app.get('/api/v1/meta', async () => ({ name: 'Y.auth', version: VERSION }));

	app.get('/api/v1/admin/dashboard', async (request) => {
		await requireAdmin(request, sessions);
		const [[userCount], [sessionCount], [clientCount], database, redis] = await Promise.all([
			db.select({ value: count() }).from(users),
			db.select({ value: count() }).from(userSessions).where(isNull(userSessions.revokedAt)),
			db.select({ value: count() }).from(oauthClients),
			db
				.execute(sql`select 1`)
				.then(() => true)
				.catch(() => false),
			dependencies.redisPing(),
		]);
		return {
			version: VERSION,
			status: database && redis ? 'ready' : 'degraded',
			postgres: database ? 'up' : 'down',
			redis: redis ? 'up' : 'down',
			users: userCount?.value ?? 0,
			activeSessions: sessionCount?.value ?? 0,
			clients: clientCount?.value ?? 0,
			mailConfigured: Boolean(config.RESEND_API_KEY && config.MAIL_FROM),
		};
	});

	app.get<{ Querystring: Record<string, unknown> }>('/api/v1/admin/clients', async (request) => {
		await requireAdmin(request, sessions);
		const { page, pageSize, limit, offset } = pageParams(request.query);
		const [items, [total]] = await Promise.all([clients.list(limit, offset), db.select({ value: count() }).from(oauthClients)]);
		return paged(items, page, pageSize, total?.value ?? 0);
	});

	app.get<{ Params: { clientId: string } }>('/api/v1/admin/clients/:clientId', async (request) => {
		await requireAdmin(request, sessions);
		return clients.get(request.params.clientId);
	});

	app.post<{ Body: CsrfBody & ClientInput }>('/api/v1/admin/clients', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		const created = await clients.create(request.body);
		await audit.write({
			type: 'client.created',
			success: true,
			actorUserId: admin.user.id,
			metadata: { clientId: created.clientId, projectKey: request.body.projectKey },
			request,
		});
		return created;
	});

	app.patch<{ Params: { clientId: string }; Body: CsrfBody & ClientUpdateInput }>('/api/v1/admin/clients/:clientId', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		await clients.update(request.params.clientId, request.body);
		await audit.write({
			type: 'client.updated',
			success: true,
			actorUserId: admin.user.id,
			metadata: {
				clientId: request.params.clientId,
				projectKey: request.body.projectKey,
			},
			request,
		});
		return { updated: true };
	});

	app.post<{
		Params: { clientId: string };
		Body: CsrfBody & { enabled: boolean };
	}>('/api/v1/admin/clients/:clientId/enabled', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		await clients.setEnabled(request.params.clientId, request.body.enabled);
		await audit.write({
			type: request.body.enabled ? 'client.updated' : 'client.disabled',
			success: true,
			actorUserId: admin.user.id,
			metadata: {
				clientId: request.params.clientId,
				enabled: request.body.enabled,
			},
			request,
		});
		return { enabled: request.body.enabled };
	});

	app.post<{ Params: { clientId: string }; Body: CsrfBody }>('/api/v1/admin/clients/:clientId/regenerate-secret', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		const clientSecret = await clients.regenerateSecret(request.params.clientId);
		await audit.write({
			type: 'client.secret_regenerated',
			success: true,
			actorUserId: admin.user.id,
			metadata: { clientId: request.params.clientId },
			request,
		});
		return { clientSecret };
	});

	app.get<{ Querystring: Record<string, unknown> }>('/api/v1/admin/users', async (request) => {
		await requireAdmin(request, sessions);
		const { page, pageSize, limit, offset } = pageParams(request.query);
		const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
		const where = search ? ilike(users.email, `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`) : undefined;
		const [rows, [total]] = await Promise.all([
			db
				.select({
					id: users.id,
					email: users.email,
					displayName: users.displayName,
					status: users.status,
					isAdmin: users.isAdmin,
					createdAt: users.createdAt,
					deactivatedAt: users.deactivatedAt,
					purgeAfter: users.purgeAfter,
				})
				.from(users)
				.where(where)
				.orderBy(desc(users.createdAt))
				.limit(limit)
				.offset(offset),
			db.select({ value: count() }).from(users).where(where),
		]);
		return paged(rows, page, pageSize, total?.value ?? 0);
	});

	app.get<{ Params: { userId: string } }>('/api/v1/admin/users/:userId', async (request) => {
		await requireAdmin(request, sessions);
		const [user] = await db.select().from(users).where(eq(users.id, request.params.userId)).limit(1);
		if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
		return user;
	});

	app.post<{
		Params: { userId: string };
		Body: CsrfBody & { active: boolean };
	}>('/api/v1/admin/users/:userId/status', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		const active = request.body.active;
		await db
			.update(users)
			.set({
				status: active ? 'active' : 'deactivated',
				deactivatedAt: active ? null : new Date(),
				deletionRequestedAt: null,
				purgeAfter: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, request.params.userId));
		if (!active) await sessions.revokeAll(request.params.userId, 'admin_deactivated');
		await audit.write({
			type: active ? 'user.reactivated' : 'user.deactivated',
			success: true,
			actorUserId: admin.user.id,
			targetUserId: request.params.userId,
			request,
		});
		return { status: active ? 'active' : 'deactivated' };
	});

	app.post<{ Params: { userId: string }; Body: CsrfBody }>('/api/v1/admin/users/:userId/logout-everywhere', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		const revoked = await sessions.revokeAll(request.params.userId, 'admin_logout_everywhere');
		await audit.write({
			type: 'logout.everywhere',
			success: true,
			actorUserId: admin.user.id,
			targetUserId: request.params.userId,
			request,
		});
		return { revoked };
	});

	app.delete<{
		Params: { userId: string };
		Body: CsrfBody & { confirmEmail: string };
	}>('/api/v1/admin/users/:userId', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		const [target] = await db
			.select({ email: users.email, status: users.status })
			.from(users)
			.where(eq(users.id, request.params.userId))
			.limit(1);
		if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
		if (target.email !== request.body.confirmEmail) {
			throw new AppError(400, 'DELETE_CONFIRMATION_INVALID', 'Enter the exact user email to confirm deletion');
		}
		if (admin.user.id === request.params.userId) {
			throw new AppError(409, 'SELF_DELETE_FORBIDDEN', 'An administrator cannot permanently delete the current account');
		}
		if (target.status !== 'deactivated') throw new AppError(409, 'USER_MUST_BE_DEACTIVATED', 'User must be deactivated first');
		const [deleted] = await db.delete(users).where(eq(users.id, request.params.userId)).returning({ id: users.id });
		if (!deleted) throw new AppError(409, 'USER_DELETE_FAILED', 'User was not deleted');
		await audit.write({
			type: 'user.deleted',
			success: true,
			actorUserId: admin.user.id,
			targetUserId: request.params.userId,
			metadata: { deletedUserId: request.params.userId },
			request,
		});
		return { deleted: true };
	});

	app.get<{ Querystring: Record<string, unknown> }>('/api/v1/admin/sessions', async (request) => {
		await requireAdmin(request, sessions);
		const { page, pageSize, limit, offset } = pageParams(request.query);
		const [items, [total]] = await Promise.all([
			db
				.select({
					id: userSessions.id,
					userId: userSessions.userId,
					email: users.email,
					createdAt: userSessions.createdAt,
					lastSeenAt: userSessions.lastSeenAt,
					expiresAt: userSessions.expiresAt,
					lastIp: userSessions.lastIp,
					userAgent: userSessions.userAgent,
					revokedAt: userSessions.revokedAt,
				})
				.from(userSessions)
				.innerJoin(users, eq(users.id, userSessions.userId))
				.orderBy(desc(userSessions.lastSeenAt))
				.limit(limit)
				.offset(offset),
			db.select({ value: count() }).from(userSessions),
		]);
		return paged(items, page, pageSize, total?.value ?? 0);
	});

	app.get<{ Params: { sessionId: string } }>('/api/v1/admin/sessions/:sessionId', async (request) => {
		await requireAdmin(request, sessions);
		const [session] = await db.select().from(userSessions).where(eq(userSessions.id, request.params.sessionId)).limit(1);
		if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
		return session;
	});

	app.delete<{ Params: { sessionId: string }; Body: CsrfBody }>('/api/v1/admin/sessions/:sessionId', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		const [target] = await db
			.select({ userId: userSessions.userId })
			.from(userSessions)
			.where(eq(userSessions.id, request.params.sessionId))
			.limit(1);
		if (!target) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
		await sessions.revoke(target.userId, request.params.sessionId, 'admin_revoked');
		await audit.write({
			type: 'session.revoked',
			success: true,
			actorUserId: admin.user.id,
			targetUserId: target.userId,
			sessionId: request.params.sessionId,
			request,
		});
		return { revoked: true };
	});

	app.get<{ Querystring: Record<string, unknown> }>('/api/v1/admin/audit', async (request) => {
		await requireAdmin(request, sessions);
		const { page, pageSize, limit, offset } = pageParams(request.query);
		const event = typeof request.query.event === 'string' ? request.query.event : undefined;
		const where = event ? eq(auditEvents.type, event) : undefined;
		const [items, [total]] = await Promise.all([
			db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).limit(limit).offset(offset),
			db.select({ value: count() }).from(auditEvents).where(where),
		]);
		return paged(items, page, pageSize, total?.value ?? 0);
	});

	app.get<{ Params: { eventId: string } }>('/api/v1/admin/audit/:eventId', async (request) => {
		await requireAdmin(request, sessions);
		const [event] = await db.select().from(auditEvents).where(eq(auditEvents.id, request.params.eventId)).limit(1);
		if (!event) throw new AppError(404, 'AUDIT_EVENT_NOT_FOUND', 'Audit event not found');
		return event;
	});

	app.get('/api/v1/admin/settings', async (request) => {
		await requireAdmin(request, sessions);
		const [settings] = await db.select().from(globalSettings).where(eq(globalSettings.id, 1)).limit(1);
		return settings;
	});

	app.patch<{
		Body: CsrfBody & {
			registrationEnabled: boolean;
			minPasswordLength: number;
			captchaMode: 'off' | 'adaptive' | 'always_registration';
			accessTokenTtlSeconds: number;
			ssoIdleTtlSeconds: number;
			ssoAbsoluteTtlSeconds: number;
			refreshTokenTtlSeconds: number;
		};
	}>('/api/v1/admin/settings', async (request) => {
		const admin = await requireAdmin(request, sessions);
		requireCsrf(request, request.body.csrfToken, config);
		if (request.body.minPasswordLength < 6 || request.body.minPasswordLength > 256) {
			throw new AppError(400, 'INVALID_PASSWORD_POLICY', 'Password minimum must be between 6 and 256');
		}
		if (request.body.ssoAbsoluteTtlSeconds < request.body.ssoIdleTtlSeconds) {
			throw new AppError(400, 'INVALID_SESSION_POLICY', 'Absolute session TTL must not be shorter than idle TTL');
		}
		if (request.body.refreshTokenTtlSeconds <= request.body.accessTokenTtlSeconds) {
			throw new AppError(400, 'INVALID_TOKEN_POLICY', 'Refresh token TTL must exceed access token TTL');
		}
		const [oldValue] = await db.select().from(globalSettings).where(eq(globalSettings.id, 1)).limit(1);
		const update = {
			registrationEnabled: request.body.registrationEnabled,
			minPasswordLength: request.body.minPasswordLength,
			captchaMode: request.body.captchaMode,
			accessTokenTtlSeconds: request.body.accessTokenTtlSeconds,
			ssoIdleTtlSeconds: request.body.ssoIdleTtlSeconds,
			ssoAbsoluteTtlSeconds: request.body.ssoAbsoluteTtlSeconds,
			refreshTokenTtlSeconds: request.body.refreshTokenTtlSeconds,
			updatedAt: new Date(),
		};
		await db.update(globalSettings).set(update).where(eq(globalSettings.id, 1));
		config.ACCESS_TOKEN_TTL_SECONDS = update.accessTokenTtlSeconds;
		config.SSO_IDLE_TTL_SECONDS = update.ssoIdleTtlSeconds;
		config.SSO_ABSOLUTE_TTL_SECONDS = update.ssoAbsoluteTtlSeconds;
		config.REFRESH_TOKEN_TTL_SECONDS = update.refreshTokenTtlSeconds;
		await audit.write({
			type: 'settings.updated',
			success: true,
			actorUserId: admin.user.id,
			metadata: { oldValue, newValue: update },
			request,
		});
		return update;
	});
}
