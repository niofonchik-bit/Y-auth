import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import middie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { registerAccountRoutes } from './account/routes.js';
import { AccountService } from './account/service.js';
import { registerAdminRoutes } from './admin/routes.js';
import { AuditService } from './audit/service.js';
import { registerAvatarRoutes } from './avatar/routes.js';
import { AvatarService } from './avatar/service.js';
import { registerAuthRoutes } from './auth/routes.js';
import { AuthService } from './auth/service.js';
import { PolicyResolver } from './clients/policy.js';
import { ClientService } from './clients/service.js';
import { type AppConfig, loadConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { oauthClientRedirectUris, oauthClients } from './db/schema.js';
import { registerHealthRoutes } from './health/routes.js';
import { registerGoogleRoutes } from './google/routes.js';
import { GoogleIdentityService } from './google/service.js';
import { ResendMailProvider } from './mail/provider.js';
import { MfaService } from './mfa/service.js';
import { createOidcProvider } from './oidc/provider.js';
import { registerOidcRoutes } from './oidc/routes.js';
import { createCaptchaProvider } from './security/captcha.js';
import { DistributedRateLimiter } from './security/rate-limit.js';
import { SessionService } from './sessions/service.js';
import { AppError, sendError } from './shared/errors.js';
import { VERSION } from './version.js';

export function sanitizedPath(rawUrl?: string): string | undefined {
	if (!rawUrl) return undefined;
	try {
		return new URL(rawUrl, 'http://local').pathname;
	} catch {
		return rawUrl.split('?')[0];
	}
}

export function loggerOptions(config: AppConfig) {
	return {
		level: config.LOG_LEVEL,
		redact: {
			paths: [
				'req.headers.authorization',
				'req.headers.cookie',
				'res.headers.set-cookie',
				'body.password',
				'body.currentPassword',
				'body.newPassword',
				'body.token',
				'body.client_secret',
				'*.password',
				'*.passwordHash',
				'*.accessToken',
				'*.refreshToken',
				'*.idToken',
				'*.clientSecret',
			],
			censor: '[REDACTED]',
		},
		serializers: {
			req: (request: { method?: string; url?: string; id?: string }) => ({
				method: request.method ?? 'UNKNOWN',
				path: sanitizedPath(request.url) ?? '/',
				requestId: request.id ?? 'unassigned',
			}),
		},
	};
}

export async function buildApp(environment?: NodeJS.ProcessEnv) {
	const config = loadConfig(environment);
	const trustedHops = config.trustProxy;
	const app: FastifyInstance = Fastify({
		logger: loggerOptions(config),
		trustProxy: trustedHops === false ? false : (_address, hop) => hop < trustedHops,
		requestIdHeader: 'x-request-id',
		bodyLimit: 64 * 1024,
	});
	const { db, sql } = createDatabase(config);
	const redis = new Redis(config.REDIS_URL, {
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		enableOfflineQueue: false,
		connectTimeout: 5_000,
	});
	const redisPing = async () => {
		try {
			if (redis.status === 'wait') await redis.connect();
			return (await redis.ping()) === 'PONG';
		} catch {
			return false;
		}
	};

	const audit = new AuditService(db);
	const sessions = new SessionService(db, config);
	const policies = new PolicyResolver(db);
	const clients = new ClientService(db);
	const limiter = new DistributedRateLimiter(redis, config);
	const mail = new ResendMailProvider(config);
	const captcha = createCaptchaProvider(config);
	const mfa = new MfaService(db, config, audit);
	const auth = new AuthService(db, config, policies, limiter, sessions, audit, mail, captcha, mfa);
	const account = new AccountService(db, config, policies, sessions, audit);
	const provider = createOidcProvider(config, db, sessions, audit);
	const google = new GoogleIdentityService(db, redis, config, audit);
	const avatars = new AvatarService(db, config, audit);
	const trustedClientOrigin = async (origin: string) => {
		let parsed: URL;
		try {
			parsed = new URL(origin);
		} catch {
			return false;
		}
		const uris = await db
			.select({ uri: oauthClientRedirectUris.uri })
			.from(oauthClientRedirectUris)
			.innerJoin(oauthClients, eq(oauthClients.id, oauthClientRedirectUris.clientId))
			.where(eq(oauthClients.enabled, true))
			.limit(1_000);
		return uris.some(({ uri }) => {
			try {
				return new URL(uri).origin === parsed.origin;
			} catch {
				return false;
			}
		});
	};

	await app.register(middie);
	await app.register(cookie);
	await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
	await app.register(formbody);
	await app.register(helmet, {
		global: true,
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", ...(config.TURNSTILE_SITE_KEY ? ['https://challenges.cloudflare.com'] : [])],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", 'data:'],
				connectSrc: ["'self'", ...(config.TURNSTILE_SITE_KEY ? ['https://challenges.cloudflare.com'] : [])],
				frameSrc: config.TURNSTILE_SITE_KEY ? ['https://challenges.cloudflare.com'] : ["'none'"],
				frameAncestors: ["'none'"],
				formAction: null,
				baseUri: ["'none'"],
				objectSrc: ["'none'"],
			},
		},
		referrerPolicy: { policy: 'no-referrer' },
		hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
	});
	app.addHook('onSend', async (request, reply, payload) => {
		reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
		const origin = request.headers.origin;
		if (origin && request.url.startsWith('/api/v1/me/') && (await trustedClientOrigin(origin))) {
			reply.header('Access-Control-Allow-Origin', origin);
			reply.header('Vary', 'Origin');
		}
		return payload;
	});

	if (config.ENABLE_SWAGGER) {
		await app.register(swagger, {
			openapi: {
				info: { title: 'Y.auth API', version: VERSION },
				servers: [{ url: config.issuer.origin }],
			},
		});
		await app.register(swaggerUi, { routePrefix: '/api/docs' });
	}

	app.addHook('onRequest', async (request) => {
		if (config.isProduction) {
			const hostname = request.headers.host?.split(':')[0];
			if (hostname !== config.issuer.hostname) {
				throw new AppError(400, 'INVALID_HOST', 'Invalid request host');
			}
		}
	});

	app.setErrorHandler((error: FastifyError, request, reply) => {
		if (error instanceof AppError) {
			void sendError(reply, request, error);
			return;
		}
		request.log.error({ err: error }, 'Request failed');
		void reply.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({
			error: {
				code: error.statusCode && error.statusCode < 500 ? 'REQUEST_INVALID' : 'INTERNAL_ERROR',
				message: error.statusCode && error.statusCode < 500 ? error.message : 'Internal server error',
				requestId: request.id,
			},
		});
	});

	await registerHealthRoutes(app, { db, redisPing });
	await registerAuthRoutes(app, { auth, config, sessions });
	await registerAvatarRoutes(app, { avatars, sessions, config });
	await registerGoogleRoutes(app, { google, sessions, provider, config });
	app.options('/api/v1/me/*', async (request, reply) => {
		const origin = request.headers.origin;
		if (!origin || !(await trustedClientOrigin(origin))) {
			throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed');
		}
		return reply
			.header('Access-Control-Allow-Origin', origin)
			.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
			.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
			.header('Access-Control-Max-Age', '600')
			.header('Vary', 'Origin')
			.status(204)
			.send();
	});
	await registerAccountRoutes(app, { db, account, sessions, audit, config, mfa });
	await registerAdminRoutes(app, {
		db,
		clients,
		sessions,
		audit,
		config,
		redisPing,
	});
	await registerOidcRoutes(app, {
		provider,
		auth,
		sessions,
		policies,
		limiter,
		audit,
		config,
	});

	const webRoot = join(process.cwd(), 'dist', 'web');
	if (existsSync(join(webRoot, 'index.html'))) {
		await app.register(fastifyStatic, { root: webRoot, wildcard: false, index: false });
		app.get('/', (_request, reply) => reply.sendFile('index.html'));
		app.get('/login', (_request, reply) => reply.sendFile('index.html'));
		app.get('/register', (_request, reply) => reply.sendFile('index.html'));
		app.get('/*', (_request, reply) => reply.sendFile('index.html'));
	} else {
		app.get('/', async () => ({
			name: 'Y.auth',
			version: VERSION,
			ui: 'Run npm run dev:web',
		}));
	}

	app.addHook('onClose', async () => {
		redis.disconnect();
		await sql.end({ timeout: 5 });
	});

	return app;
}
