import { eq } from 'drizzle-orm';
import Provider, { type Configuration, interactionPolicy, type KoaContextWithOIDC } from 'oidc-provider';
import type { AuditService } from '../audit/service.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { verifyClientSecret } from '../security/crypto.js';
import { redirectOrigin } from '../security/uri.js';
import type { SessionService } from '../sessions/service.js';
import { createPostgresAdapter } from './adapter.js';

function metadataValue(client: Provider['Client']['prototype'], key: string): unknown {
	return client.metadata()[key];
}

function buildInteractionPolicy() {
	const policy = interactionPolicy.base();
	const create = new interactionPolicy.Prompt(
		{ name: 'create', requestable: true },
		new interactionPolicy.Check(
			'create_requested',
			'The relying party requested account creation',
			(ctx) => ctx.oidc.prompts.has('create') && ctx.oidc.promptPending('create'),
		),
	);
	policy.add(create, 0);
	return policy;
}

export function createOidcProvider(config: AppConfig, db: Database, sessions: SessionService, audit: AuditService): Provider {
	const oidcConfig: Configuration = {
		adapter: createPostgresAdapter(db),
		jwks: config.jwks,
		claims: {
			openid: ['sub'],
			profile: ['name', 'picture'],
			email: ['email', 'email_verified'],
		},
		scopes: ['openid', 'profile', 'email', 'offline_access', 'y_auth.sessions'],
		responseTypes: ['code'],
		clientAuthMethods: ['none', 'client_secret_basic'],
		pkce: { required: () => true },
		rotateRefreshToken: true,
		issueRefreshToken: (_ctx, _client, code) => code.scopes.has('offline_access'),
		conformIdTokenClaims: false,
		findAccount: async (_ctx, accountId) => {
			const [user] = await db
				.select({
					id: users.id,
					email: users.email,
					displayName: users.displayName,
					emailVerifiedAt: users.emailVerifiedAt,
					avatarObjectKey: users.avatarObjectKey,
					avatarVersion: users.avatarVersion,
					status: users.status,
				})
				.from(users)
				.where(eq(users.id, accountId))
				.limit(1);
			if (!user || user.status !== 'active') return undefined;
			return {
				accountId: user.id,
				claims: () => ({
					sub: user.id,
					name: user.displayName ?? user.email,
					picture: user.avatarObjectKey ? `${config.issuer.origin}/avatars/${user.id}?v=${user.avatarVersion}` : undefined,
					email: user.email,
					email_verified: user.emailVerifiedAt !== null,
				}),
			};
		},
		interactions: {
			policy: buildInteractionPolicy(),
			url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
		},
		routes: {
			authorization: '/oauth/authorize',
			token: '/oauth/token',
			userinfo: '/oauth/userinfo',
			revocation: '/oauth/revoke',
			introspection: '/oauth/introspect',
			end_session: '/oauth/logout',
			jwks: '/oauth/jwks',
		},
		features: {
			devInteractions: { enabled: false },
			registration: { enabled: false },
			clientCredentials: { enabled: false },
			deviceFlow: { enabled: false },
			introspection: { enabled: true },
			revocation: { enabled: true },
			userinfo: { enabled: true },
			rpInitiatedLogout: { enabled: true },
			resourceIndicators: {
				enabled: true,
				defaultResource: (_ctx, client) => {
					const audience = metadataValue(client, 'y_auth_audience');
					return typeof audience === 'string' ? audience : undefined;
				},
				getResourceServerInfo: (_ctx, resource, client) => {
					const configuredScope = client.metadata().scope;
					return {
						scope: typeof configuredScope === 'string' ? configuredScope : 'openid',
						audience: resource,
						accessTokenTTL: config.ACCESS_TOKEN_TTL_SECONDS,
						accessTokenFormat: 'jwt',
						jwt: { sign: { alg: 'RS256' } },
					};
				},
				useGrantedResource: () => true,
			},
		},
		extraClientMetadata: {
			properties: ['y_auth_id', 'y_auth_enabled', 'y_auth_first_party', 'y_auth_audience'],
			validator: (_ctx, key, value) => {
				if (key === 'y_auth_enabled' || key === 'y_auth_first_party') {
					if (typeof value !== 'boolean') throw new TypeError(`${key} must be boolean`);
				} else if (typeof value !== 'string') {
					throw new TypeError(`${key} must be a string`);
				}
			},
		},
		extraTokenClaims: (ctx) => ({
			client_id: ctx.oidc.client?.clientId,
			sid: ctx.oidc.entities.Session?.uid,
		}),
		ttl: {
			AccessToken: () => config.ACCESS_TOKEN_TTL_SECONDS,
			AuthorizationCode: () => config.AUTHORIZATION_CODE_TTL_SECONDS,
			RefreshToken: () => config.REFRESH_TOKEN_TTL_SECONDS,
			Session: () => config.SSO_ABSOLUTE_TTL_SECONDS,
			Interaction: 600,
		},
		cookies: {
			keys: config.oidcCookieKeys,
			names: {
				session: config.isProduction ? '__Host-y-auth-oidc' : 'y-auth-oidc',
				interaction: config.isProduction ? '__Host-y-auth-interaction' : 'y-auth-interaction',
				resume: config.isProduction ? '__Secure-y-auth-resume' : 'y-auth-resume',
				state: config.isProduction ? '__Host-y-auth-state' : 'y-auth-state',
			},
			long: {
				path: '/',
				secure: config.isProduction,
				httpOnly: true,
				sameSite: 'lax',
				signed: true,
			},
			short: {
				path: '/',
				secure: config.isProduction,
				httpOnly: true,
				sameSite: 'lax',
				signed: true,
			},
		},
		clientBasedCORS: (_ctx, origin, client) => {
			if (client.tokenEndpointAuthMethod !== 'none') return false;
			const allowedOrigins = (client.redirectUris ?? []).flatMap((uri) => {
				const value = redirectOrigin(uri);
				return value ? [value] : [];
			});
			return allowedOrigins.includes(origin);
		},
		discovery: {
			authorization_endpoint: `${config.issuer.origin}/oauth/authorize`,
			token_endpoint: `${config.issuer.origin}/oauth/token`,
			userinfo_endpoint: `${config.issuer.origin}/oauth/userinfo`,
			revocation_endpoint: `${config.issuer.origin}/oauth/revoke`,
			introspection_endpoint: `${config.issuer.origin}/oauth/introspect`,
			end_session_endpoint: `${config.issuer.origin}/oauth/logout`,
			jwks_uri: `${config.issuer.origin}/oauth/jwks`,
			prompt_values_supported: ['none', 'login', 'consent', 'create'],
			code_challenge_methods_supported: ['S256'],
		},
		enabledJWA: {
			idTokenSigningAlgValues: ['RS256'],
		},
	};

	const provider = new Provider(config.issuer.origin, oidcConfig);
	provider.proxy = true;

	// oidc-provider exposes secret comparison as a public Client method. Replacing only this
	// boundary lets the adapter store a one-way digest instead of recoverable client secrets.
	provider.Client.prototype.compareClientSecret = function compareClientSecret(actual: string) {
		return verifyClientSecret(this.clientSecret ?? '', actual);
	};

	provider.on('session.saved', (session) => {
		if (session.accountId) void sessions.bindOidcSession(session.accountId, session.uid);
	});
	provider.on('authorization.success', (ctx: KoaContextWithOIDC) => {
		const session = ctx.oidc.entities.Session;
		const client = ctx.oidc.client;
		if (session && client) {
			void sessions.bindClient(session.uid, client.clientId, session.authorizations?.[client.clientId]?.grantId);
		}
	});
	provider.on('grant.error', (ctx, error) => {
		if (error.error === 'invalid_grant' && ctx.oidc.params?.grant_type === 'refresh_token') {
			void audit.write({
				type: 'refresh.reused',
				success: false,
				reasonCode: 'INVALID_OR_REUSED_REFRESH_TOKEN',
			});
		}
	});

	return provider;
}
