import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type Provider from 'oidc-provider';
import type { AuditService } from '../audit/service.js';
import type { AuthService } from '../auth/service.js';
import type { PolicyResolver } from '../clients/policy.js';
import type { AppConfig } from '../config/env.js';
import { issueCsrf, verifyCsrf } from '../security/csrf.js';
import type { DistributedRateLimiter } from '../security/rate-limit.js';
import type { SessionService } from '../sessions/service.js';
import { AppError } from '../shared/errors.js';

interface InteractionParams {
	uid: string;
}

interface InteractionForm {
	csrfToken?: string;
	email?: string;
	password?: string;
	mfaCode?: string;
	keepSignedIn?: string;
	displayName?: string;
	captchaToken?: string;
	decision?: 'allow' | 'deny';
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

async function finish(
	provider: Provider,
	request: FastifyRequest,
	reply: FastifyReply,
	result: Parameters<Provider['interactionFinished']>[2],
	mergeWithLastSubmission = false,
): Promise<void> {
	reply.hijack();
	await provider.interactionFinished(request.raw, reply.raw, result, {
		mergeWithLastSubmission,
	});
}

async function acceptFirstPartyConsent(provider: Provider, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
	const details = await provider.interactionDetails(request.raw, reply.raw);
	const clientId = stringValue(details.params.client_id);
	if (details.prompt.name !== 'consent' || !clientId || !details.session?.accountId) return false;
	const client = await provider.Client.find(clientId);
	if (!client || client.metadata().y_auth_first_party !== true) return false;

	let grant = details.grantId ? await provider.Grant.find(details.grantId) : undefined;
	if (!grant)
		grant = new provider.Grant({
			accountId: details.session.accountId,
			clientId,
		});
	const requestedScope = stringValue(details.params.scope) ?? 'openid';
	grant.addOIDCScope(requestedScope);
	const audience = client.metadata().y_auth_audience;
	if (typeof audience === 'string') grant.addResourceScope(audience, requestedScope);
	const grantId = await grant.save();
	await finish(provider, request, reply, { consent: { grantId } }, true);
	return true;
}

export async function registerOidcRoutes(
	app: FastifyInstance,
	dependencies: {
		provider: Provider;
		auth: AuthService;
		sessions: SessionService;
		policies: PolicyResolver;
		limiter: DistributedRateLimiter;
		audit: AuditService;
		config: AppConfig;
	},
) {
	const { provider, auth, sessions, policies, limiter, audit, config } = dependencies;

	app.get<{ Params: InteractionParams }>('/interaction/:uid', async (request, reply) => {
		const details = await provider.interactionDetails(request.raw, reply.raw);
		if (details.prompt.name === 'login') {
			const active = await sessions.authenticate(request);
			if (active) {
				await finish(provider, request, reply, {
					login: {
						accountId: active.user.id,
						remember: true,
						amr: ['pwd'],
					},
				});
				return;
			}
		}
		if (await acceptFirstPartyConsent(provider, request, reply)) return;
		if (!config.isProduction && config.AUTH_WEB_DEV_URL) {
			return reply.redirect(`${config.AUTH_WEB_DEV_URL.replace(/\/$/, '')}${request.url}`);
		}
		return reply.sendFile('index.html');
	});

	app.get<{ Params: InteractionParams }>('/api/v1/interactions/:uid', async (request, reply) => {
		const details = await provider.interactionDetails(request.raw, reply.raw);
		const clientId = stringValue(details.params.client_id);
		const client = clientId ? await provider.Client.find(clientId) : undefined;
		const policy = await policies.resolve(clientId);
		const [loginCaptchaRequired, registrationCaptchaRequired] = await Promise.all([
			auth.captchaRequired('login', clientId, request.ip),
			auth.captchaRequired('registration', clientId, request.ip),
		]);
		return {
			uid: details.uid,
			prompt: details.prompt.name,
			client: client
				? {
						id: client.clientId,
						name: client.clientName ?? client.clientId,
						firstParty: client.metadata().y_auth_first_party === true,
					}
				: null,
			requestedScopes: (stringValue(details.params.scope) ?? 'openid').split(' ').filter(Boolean),
			registrationEnabled: policy.registrationEnabled,
			minPasswordLength: policy.minPasswordLength,
			loginCaptchaRequired,
			registrationCaptchaRequired,
			turnstileSiteKey: config.TURNSTILE_SITE_KEY ?? null,
			csrfToken: issueCsrf(reply, config),
		};
	});

	app.post<{ Params: InteractionParams; Body: InteractionForm }>('/interaction/:uid/consent', async (request, reply) => {
		if (!verifyCsrf(request, request.body.csrfToken, config)) throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		const details = await provider.interactionDetails(request.raw, reply.raw);
		const clientId = stringValue(details.params.client_id);
		const accountId = details.session?.accountId;
		if (details.prompt.name !== 'consent' || !clientId || !accountId) throw new AppError(409, 'INTERACTION_MISMATCH', 'Consent is not expected');
		if (request.body.decision === 'deny') {
			await audit.write({ type: 'oidc.consent.denied', success: true, actorUserId: accountId, metadata: { clientId }, request });
			await finish(provider, request, reply, { error: 'access_denied', error_description: 'The user denied access' });
			return;
		}
		let grant = details.grantId ? await provider.Grant.find(details.grantId) : undefined;
		if (!grant) grant = new provider.Grant({ accountId, clientId });
		const requestedScope = stringValue(details.params.scope) ?? 'openid';
		grant.addOIDCScope(requestedScope);
		const client = await provider.Client.find(clientId);
		const audience = client?.metadata().y_auth_audience;
		if (typeof audience === 'string') grant.addResourceScope(audience, requestedScope);
		const grantId = await grant.save();
		await audit.write({
			type: 'oidc.consent.allowed',
			success: true,
			actorUserId: accountId,
			metadata: { clientId, scopes: requestedScope.split(' ') },
			request,
		});
		await finish(provider, request, reply, { consent: { grantId } }, true);
	});

	app.post<{ Params: InteractionParams; Body: InteractionForm }>('/interaction/:uid/login', async (request, reply) => {
		if (!verifyCsrf(request, request.body.csrfToken, config)) {
			throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		}
		const details = await provider.interactionDetails(request.raw, reply.raw);
		if (details.prompt.name !== 'login') {
			throw new AppError(409, 'INTERACTION_MISMATCH', 'Login is not expected for this interaction');
		}
		let result: Awaited<ReturnType<AuthService['login']>>;
		try {
			result = await auth.login(
				{
					email: request.body.email ?? '',
					password: request.body.password ?? '',
					...(request.body.captchaToken ? { captchaToken: request.body.captchaToken } : {}),
					...(request.body.mfaCode ? { mfaCode: request.body.mfaCode } : {}),
					keepSignedIn: request.body.keepSignedIn === 'true',
				},
				request,
				reply,
			);
		} catch (error) {
			if (error instanceof AppError) {
				return reply.redirect(`/interaction/${encodeURIComponent(request.params.uid)}?interactionError=${encodeURIComponent(error.code)}`);
			}
			throw error;
		}
		await finish(provider, request, reply, {
			login: {
				accountId: result.user.id,
				remember: true,
				amr: result.amr,
			},
		});
	});

	app.post<{ Params: InteractionParams; Body: InteractionForm }>('/interaction/:uid/register', async (request, reply) => {
		if (!verifyCsrf(request, request.body.csrfToken, config)) {
			throw new AppError(403, 'CSRF_INVALID', 'Security token is invalid');
		}
		const details = await provider.interactionDetails(request.raw, reply.raw);
		if (details.prompt.name !== 'create' && details.prompt.name !== 'login') {
			throw new AppError(409, 'INTERACTION_MISMATCH', 'Registration is not expected for this interaction');
		}
		const clientId = stringValue(details.params.client_id);
		const displayName = request.body.displayName;
		let result: Awaited<ReturnType<AuthService['register']>>;
		try {
			result = await auth.register(
				{
					email: request.body.email ?? '',
					password: request.body.password ?? '',
					...(displayName === undefined ? {} : { displayName }),
					...(clientId === undefined ? {} : { clientId }),
					...(request.body.captchaToken ? { captchaToken: request.body.captchaToken } : {}),
				},
				request,
				reply,
			);
		} catch (error) {
			if (error instanceof AppError) {
				return reply.redirect(`/interaction/${encodeURIComponent(request.params.uid)}?interactionError=${encodeURIComponent(error.code)}`);
			}
			throw error;
		}
		await finish(provider, request, reply, {
			...(details.prompt.name === 'create' ? { create: {} } : {}),
			login: {
				accountId: result.user.id,
				remember: true,
				amr: ['pwd'],
			},
		});
	});

	const callback = provider.callback();
	app.use((request, response, next) => {
		const path = (request.url ?? '').split('?')[0] ?? '';
		if (!path.startsWith('/oauth/') && !path.startsWith('/.well-known/')) {
			next();
			return;
		}
		const incomingHostname = request.headers.host?.split(':')[0];
		if (config.isProduction && incomingHostname !== config.issuer.hostname) {
			response.statusCode = 400;
			response.setHeader('Content-Type', 'application/json; charset=utf-8');
			response.end(
				JSON.stringify({
					error: 'invalid_request',
					error_description: 'Invalid request host',
				}),
			);
			return;
		}
		request.headers.host = config.issuer.host;
		request.headers['x-forwarded-host'] = config.issuer.host;
		request.headers['x-forwarded-proto'] = config.issuer.protocol.slice(0, -1);
		const run = async () => {
			if (path === '/oauth/token') {
				const forwarded = config.trustProxy === false ? undefined : request.headers['x-forwarded-for'];
				const ip =
					typeof forwarded === 'string'
						? forwarded.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown'
						: request.socket.remoteAddress || 'unknown';
				const authorization = request.headers.authorization;
				let clientId = 'public';
				if (authorization?.startsWith('Basic ')) {
					try {
						clientId = Buffer.from(authorization.slice(6), 'base64').toString('utf8').split(':')[0] || 'confidential';
					} catch {
						clientId = 'invalid-basic-auth';
					}
				}
				await limiter.consume('oauth-token', `${clientId}|${ip}`, 120, 60);
			}
			await callback(request, response);
		};
		run().catch(async (error: unknown) => {
			if (error instanceof AppError) {
				await audit
					.write({
						type: 'rate_limit.triggered',
						success: false,
						reasonCode: error.code,
						metadata: { endpoint: path },
					})
					.catch(() => undefined);
				response.statusCode = error.statusCode;
				response.setHeader('Content-Type', 'application/json; charset=utf-8');
				response.end(
					JSON.stringify({
						error: error.statusCode === 429 ? 'slow_down' : 'temporarily_unavailable',
						error_description: error.message,
					}),
				);
				return;
			}
			next(error instanceof Error ? error : new Error('OIDC request failed'));
		});
	});
}
