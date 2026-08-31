import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { issueCsrf, verifyCsrf } from '../security/csrf.js';
import { AppError } from '../shared/errors.js';
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
	csrfToken?: string;
}

export async function registerAuthRoutes(app: FastifyInstance, dependencies: { auth: AuthService; config: AppConfig }) {
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
