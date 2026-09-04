import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { issueCsrf, verifyCsrf } from '../security/csrf.js';
import { AppError } from '../shared/errors.js';
import { requireBrowserSession } from '../shared/auth.js';
import type { SessionService } from '../sessions/service.js';
import type { AuthService } from './service.js';

interface ResetRequestBody {
	email: string;
	csrfToken?: string;
}

interface ResetCompleteBody {
	token: string;
	password: string;
	csrfToken?: string;
}

interface DirectLoginBody {
	email: string;
	password: string;
	captchaToken?: string;
	mfaCode?: string;
	keepSignedIn?: boolean;
	csrfToken?: string;
}

interface TokenBody {
	token: string;
	csrfToken?: string;
}

interface RegisterBody {
	email: string;
	password: string;
	displayName?: string;
	csrfToken?: string;
}

export async function registerAuthRoutes(app: FastifyInstance, dependencies: { auth: AuthService; config: AppConfig; sessions: SessionService }) {
	app.get('/api/v1/csrf', async (_request, reply) => ({
		csrfToken: issueCsrf(reply, dependencies.config),
	}));

	app.get('/api/v1/auth/login-context', async (request, reply) => ({
		csrfToken: issueCsrf(reply, dependencies.config),
		captchaRequired: await dependencies.auth.captchaRequired('login', undefined, request.ip),
		turnstileSiteKey: dependencies.config.TURNSTILE_SITE_KEY || null,
	}));

	app.post<{ Body: DirectLoginBody }>(
		'/api/v1/auth/login',
		{
			schema: {
				body: {
					type: 'object',
					required: ['email', 'password', 'csrfToken'],
					additionalProperties: false,
					properties: {
						email: { type: 'string', maxLength: 320 },
						password: {
							type: 'string',
							minLength: 1,
							maxLength: 256,
						},
						captchaToken: { type: 'string', maxLength: 4096 },
						mfaCode: { type: 'string', minLength: 6, maxLength: 32 },
						keepSignedIn: { type: 'boolean' },
						csrfToken: { type: 'string' },
					},
				},
			},
		},
		async (request, reply) => {
			if (!verifyCsrf(request, request.body.csrfToken, dependencies.config)) {
				throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
			}
			const result = await dependencies.auth.login(request.body, request, reply);
			return {
				user: {
					id: result.user.id,
					email: result.user.email,
					isAdmin: result.user.isAdmin,
				},
			};
		},
	);

	app.post<{ Body: RegisterBody }>('/api/v1/auth/register', async (request, reply) => {
		if (!verifyCsrf(request, request.body.csrfToken, dependencies.config)) throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		const result = await dependencies.auth.register(request.body, request, reply);
		return { user: { id: result.user.id, email: result.user.email } };
	});

	app.post<{ Body: ResetRequestBody }>(
		'/api/v1/auth/password-reset/request',
		{
			schema: {
				body: {
					type: 'object',
					required: ['email', 'csrfToken'],
					additionalProperties: false,
					properties: {
						email: { type: 'string', maxLength: 320 },
						csrfToken: { type: 'string' },
					},
				},
			},
		},
		async (request) => {
			if (!verifyCsrf(request, request.body.csrfToken, dependencies.config)) {
				throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
			}
			await dependencies.auth.requestPasswordReset(request.body.email, request);
			return {
				message: 'If an account exists, password reset instructions have been sent.',
			};
		},
	);

	app.post<{ Body: TokenBody }>('/api/v1/auth/email/verify', async (request) => {
		if (!verifyCsrf(request, request.body.csrfToken, dependencies.config)) {
			throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		}
		await dependencies.auth.verifyEmail(request.body.token, request);
		return { verified: true };
	});

	app.post<{ Body: { csrfToken?: string } }>('/api/v1/auth/email/resend', async (request) => {
		if (!verifyCsrf(request, request.body.csrfToken, dependencies.config)) {
			throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		}
		const session = await requireBrowserSession(request, dependencies.sessions);
		await dependencies.auth.issueEmailVerification(session.user.id, request);
		return { sent: true };
	});

	app.post<{ Body: ResetCompleteBody }>(
		'/api/v1/auth/password-reset/complete',
		{
			schema: {
				body: {
					type: 'object',
					required: ['token', 'password', 'csrfToken'],
					additionalProperties: false,
					properties: {
						token: {
							type: 'string',
							minLength: 20,
							maxLength: 200,
						},
						password: {
							type: 'string',
							minLength: 1,
							maxLength: 256,
						},
						csrfToken: { type: 'string' },
					},
				},
			},
		},
		async (request) => {
			if (!verifyCsrf(request, request.body.csrfToken, dependencies.config)) {
				throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
			}
			await dependencies.auth.completePasswordReset(request.body.token, request.body.password, request);
			return { completed: true };
		},
	);
}
