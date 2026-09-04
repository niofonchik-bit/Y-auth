import { and, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import * as oidc from 'openid-client';
import type { AuditService } from '../audit/service.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { externalIdentities, users } from '../db/schema.js';
import { normalizeEmail } from '../auth/service.js';
import { AppError } from '../shared/errors.js';

interface Correlation {
	verifier: string;
	nonce: string;
	returnTo: string;
	interactionUid?: string;
	purpose: 'login' | 'link';
	linkUserId?: string;
}

export function safeReturnTo(value: string | undefined): string {
	if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/account/profile';
	const allowed = ['/account', '/admin'];
	return allowed.some((prefix) => value === prefix || value.startsWith(`${prefix}/`)) ? value : '/account/profile';
}

export class GoogleIdentityService {
	private configuration?: Promise<oidc.Configuration>;

	constructor(
		private readonly db: Database,
		private readonly redis: Redis,
		private readonly config: AppConfig,
		private readonly audit: AuditService,
	) {}

	private client(): Promise<oidc.Configuration> {
		if (!this.config.GOOGLE_AUTH_ENABLED || !this.config.GOOGLE_CLIENT_ID || !this.config.GOOGLE_CLIENT_SECRET) {
			throw new AppError(503, 'GOOGLE_AUTH_DISABLED', 'Google sign-in is disabled');
		}
		this.configuration ??= oidc.discovery(new URL('https://accounts.google.com'), this.config.GOOGLE_CLIENT_ID, this.config.GOOGLE_CLIENT_SECRET);
		return this.configuration;
	}

	async start(input: Omit<Correlation, 'verifier' | 'nonce'>): Promise<URL> {
		const client = await this.client();
		if (this.redis.status === 'wait') await this.redis.connect();
		const verifier = oidc.randomPKCECodeVerifier();
		const nonce = oidc.randomNonce();
		const state = oidc.randomState();
		const correlation: Correlation = { ...input, returnTo: safeReturnTo(input.returnTo), verifier, nonce };
		await this.redis.set(`google:state:${state}`, JSON.stringify(correlation), 'EX', 600, 'NX');
		const url = oidc.buildAuthorizationUrl(client, {
			redirect_uri: this.config.GOOGLE_REDIRECT_URI ?? '',
			scope: 'openid email profile',
			response_type: 'code',
			code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
			code_challenge_method: 'S256',
			state,
			nonce,
			prompt: 'select_account',
		});
		return url;
	}

	async callback(currentUrl: URL): Promise<{ user: typeof users.$inferSelect; correlation: Correlation }> {
		const state = currentUrl.searchParams.get('state');
		if (!state) throw new AppError(400, 'GOOGLE_STATE_INVALID', 'Google state is missing');
		const raw = await this.redis.getdel(`google:state:${state}`);
		if (!raw) throw new AppError(400, 'GOOGLE_STATE_INVALID', 'Google sign-in expired or was already used');
		const correlation = JSON.parse(raw) as Correlation;
		const client = await this.client();
		let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
		try {
			tokens = await oidc.authorizationCodeGrant(client, currentUrl, {
				pkceCodeVerifier: correlation.verifier,
				expectedState: state,
				expectedNonce: correlation.nonce,
			});
		} catch {
			throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google identity could not be verified');
		}
		const claims = tokens.claims();
		const subject = claims?.sub;
		const email = claims?.email;
		const verified = claims?.email_verified === true;
		if (!subject || typeof email !== 'string' || !verified)
			throw new AppError(401, 'GOOGLE_IDENTITY_INVALID', 'Google must provide a verified email');
		const [identity] = await this.db
			.select({ identity: externalIdentities, user: users })
			.from(externalIdentities)
			.innerJoin(users, eq(users.id, externalIdentities.userId))
			.where(and(eq(externalIdentities.provider, 'google'), eq(externalIdentities.providerSubject, subject)))
			.limit(1);
		if (identity) {
			if (identity.user.status !== 'active') throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'Account is deactivated');
			await this.db
				.update(externalIdentities)
				.set({ lastUsedAt: new Date(), updatedAt: new Date() })
				.where(eq(externalIdentities.id, identity.identity.id));
			return { user: identity.user, correlation };
		}
		const normalizedEmail = normalizeEmail(email);
		const [sameEmail] = await this.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, normalizedEmail)).limit(1);
		if (sameEmail)
			throw new AppError(409, 'GOOGLE_LINK_CONFIRMATION_REQUIRED', 'Sign in with your existing Y.auth account before linking Google');
		const user = await this.db.transaction(async (tx) => {
			const [created] = await tx
				.insert(users)
				.values({ email, normalizedEmail, displayName: typeof claims.name === 'string' ? claims.name : null, emailVerifiedAt: new Date() })
				.returning();
			if (!created) throw new Error('Google user insert failed');
			await tx.insert(externalIdentities).values({
				userId: created.id,
				provider: 'google',
				providerSubject: subject,
				providerEmail: email,
				providerEmailVerified: true,
				lastUsedAt: new Date(),
			});
			return created;
		});
		await this.audit.write({ type: 'auth.google.succeeded', success: true, actorUserId: user.id, targetUserId: user.id });
		return { user, correlation };
	}
}
