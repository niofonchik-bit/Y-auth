import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuditService } from '../audit/service.js';
import type { PolicyResolver } from '../clients/policy.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { emailVerificationTokens, passwordCredentials, passwordResetTokens, users } from '../db/schema.js';
import type { MailProvider } from '../mail/provider.js';
import type { MfaService } from '../mfa/service.js';
import type { CaptchaProvider } from '../security/captcha.js';
import { randomToken, sha256 } from '../security/crypto.js';
import { hashPassword, MAX_PASSWORD_LENGTH, passwordNeedsRehash, validatePassword, verifyPassword } from '../security/password.js';
import type { DistributedRateLimiter } from '../security/rate-limit.js';
import type { SessionService } from '../sessions/service.js';
import { AppError } from '../shared/errors.js';

const emailSchema = z.email().max(320);
const INVALID_CREDENTIALS = 'Invalid email or password';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export class AuthService {
	private readonly dummyHash: Promise<string>;

	constructor(
		private readonly db: Database,
		private readonly config: AppConfig,
		private readonly policies: PolicyResolver,
		private readonly rateLimiter: DistributedRateLimiter,
		private readonly sessions: SessionService,
		private readonly audit: AuditService,
		private readonly mail: MailProvider,
		private readonly captcha: CaptchaProvider | null,
		private readonly mfa: MfaService,
	) {
		this.dummyHash = hashPassword(randomToken(18), config);
	}

	private async enforceCaptcha(required: boolean, token: string | undefined, request: FastifyRequest): Promise<void> {
		if (!required) return;
		if (this.config.CAPTCHA_MODE === 'off') return;
		if (!token) {
			await this.audit.write({
				type: 'captcha.required',
				success: false,
				request,
			});
			throw new AppError(403, 'CAPTCHA_REQUIRED', 'Complete the security check');
		}
		if (!this.captcha || !(await this.captcha.verify(token, request.ip))) {
			await this.audit.write({
				type: 'captcha.failed',
				success: false,
				request,
			});
			throw new AppError(403, 'CAPTCHA_FAILED', 'Security check failed');
		}
	}

	async captchaRequired(kind: 'login' | 'registration', clientId: string | undefined, ip: string): Promise<boolean> {
		if (this.config.CAPTCHA_MODE === 'off') return false;
		const policy = await this.policies.resolve(clientId);
		if (policy.captchaMode === 'off') return false;
		if (policy.captchaMode === 'always_registration') return kind === 'registration';
		const attempts = await this.rateLimiter.peek(kind === 'login' ? 'login-ip' : 'registration-ip', ip);
		return attempts >= 3;
	}

	async register(
		input: {
			email: string;
			password: string;
			displayName?: string;
			clientId?: string;
			captchaToken?: string;
		},
		request: FastifyRequest,
		reply: FastifyReply,
	) {
		const registrationLimit = await this.rateLimiter.consume('registration-ip', request.ip, 5, 3_600);
		const normalizedEmail = normalizeEmail(input.email);
		if (!emailSchema.safeParse(normalizedEmail).success) {
			throw new AppError(400, 'REGISTRATION_FAILED', 'Unable to create account');
		}
		const policy = await this.policies.resolve(input.clientId);
		await this.enforceCaptcha(
			policy.captchaMode === 'always_registration' || (policy.captchaMode === 'adaptive' && registrationLimit.remaining <= 2),
			input.captchaToken,
			request,
		);
		if (!policy.registrationEnabled) {
			throw new AppError(403, 'REGISTRATION_DISABLED', 'Registration is disabled');
		}
		const passwordError = validatePassword(input.password, {
			minLength: policy.minPasswordLength,
			maxLength: MAX_PASSWORD_LENGTH,
		});
		if (passwordError) throw new AppError(400, 'PASSWORD_POLICY_FAILED', passwordError);
		const passwordHash = await hashPassword(input.password, this.config);

		let user: typeof users.$inferSelect;
		try {
			user = await this.db.transaction(async (tx) => {
				const [created] = await tx
					.insert(users)
					.values({
						email: input.email.trim(),
						normalizedEmail,
						displayName: input.displayName?.trim() || null,
					})
					.returning();
				if (!created) throw new Error('User insert did not return a row');
				await tx.insert(passwordCredentials).values({ userId: created.id, passwordHash });
				return created;
			});
		} catch (error) {
			if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
				throw new AppError(409, 'REGISTRATION_FAILED', 'Unable to create account');
			}
			throw error;
		}

		const sessionId = await this.sessions.create(user.id, request, reply);
		await this.audit.write({
			type: 'user.registered',
			success: true,
			actorUserId: user.id,
			targetUserId: user.id,
			sessionId,
			request,
		});
		await this.issueEmailVerification(user.id, request).catch(async () => {
			await this.audit.write({ type: 'email.verification.failed', success: false, targetUserId: user.id, request });
		});
		return { user, sessionId };
	}

	async issueEmailVerification(userId: string, request: FastifyRequest): Promise<void> {
		await this.rateLimiter.consume('email-verification-user', userId, 5, 3_600);
		const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!user || user.status !== 'active' || user.emailVerifiedAt) return;
		const token = randomToken(32);
		const expiresAt = new Date(Date.now() + this.config.EMAIL_VERIFICATION_TTL_SECONDS * 1_000);
		await this.db.transaction(async (tx) => {
			await tx
				.update(emailVerificationTokens)
				.set({ usedAt: new Date() })
				.where(and(eq(emailVerificationTokens.userId, user.id), isNull(emailVerificationTokens.usedAt)));
			await tx.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt });
		});
		await this.mail.sendEmailVerification({
			email: user.email,
			displayName: user.displayName,
			locale: user.locale,
			verificationUrl: `${this.config.issuer.origin}/verify-email?token=${encodeURIComponent(token)}`,
		});
		await this.audit.write({ type: 'email.verification.sent', success: true, targetUserId: user.id, request });
	}

	async verifyEmail(token: string, request: FastifyRequest): Promise<void> {
		await this.rateLimiter.consume('email-verification-ip', request.ip, 30, 900);
		const [record] = await this.db
			.select()
			.from(emailVerificationTokens)
			.where(
				and(
					eq(emailVerificationTokens.tokenHash, sha256(token)),
					isNull(emailVerificationTokens.usedAt),
					gt(emailVerificationTokens.expiresAt, new Date()),
				),
			)
			.limit(1);
		if (!record) throw new AppError(400, 'VERIFICATION_TOKEN_INVALID', 'Verification link is invalid or expired');
		await this.db.transaction(async (tx) => {
			await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, record.id));
			await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, record.userId));
		});
		await this.audit.write({ type: 'email.verified', success: true, targetUserId: record.userId, request });
	}

	async login(
		input: { email: string; password: string; captchaToken?: string; mfaCode?: string; keepSignedIn?: boolean },
		request: FastifyRequest,
		reply: FastifyReply,
	) {
		const normalizedEmail = normalizeEmail(input.email);
		const [accountLimit, ipLimit] = await Promise.all([
			this.rateLimiter.consume('login-account-ip', `${normalizedEmail}|${request.ip}`, 5, 600),
			this.rateLimiter.consume('login-ip', request.ip, 30, 600),
		]);
		const policy = await this.policies.resolve();
		await this.enforceCaptcha(
			policy.captchaMode === 'adaptive' && (accountLimit.remaining <= 1 || ipLimit.remaining <= 26),
			input.captchaToken,
			request,
		);
		const [result] = await this.db
			.select({ user: users, credential: passwordCredentials })
			.from(users)
			.innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
			.where(eq(users.normalizedEmail, normalizedEmail))
			.limit(1);
		const hash = result?.credential.passwordHash ?? (await this.dummyHash);
		const valid = await verifyPassword(hash, input.password);
		if (!result || !valid || result.user.status !== 'active') {
			await this.audit.write({
				type: 'login.failed',
				success: false,
				...(result ? { targetUserId: result.user.id } : {}),
				reasonCode: 'INVALID_CREDENTIALS',
				request,
			});
			throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
		}

		if (passwordNeedsRehash(result.credential.passwordHash, this.config)) {
			const replacement = await hashPassword(input.password, this.config);
			await this.db
				.update(passwordCredentials)
				.set({ passwordHash: replacement, updatedAt: new Date() })
				.where(eq(passwordCredentials.userId, result.user.id));
		}
		const mfaEnabled = await this.mfa.hasEnabled(result.user.id);
		let secondFactor: 'otp' | 'recovery' | null = null;
		if (mfaEnabled) {
			if (!input.mfaCode) throw new AppError(401, 'MFA_REQUIRED', 'Two-factor authentication is required');
			secondFactor = await this.mfa.verify(result.user.id, input.mfaCode);
		}
		const sessionId = await this.sessions.create(result.user.id, request, reply, input.keepSignedIn ?? false);
		await this.audit.write({
			type: 'login.succeeded',
			success: true,
			actorUserId: result.user.id,
			targetUserId: result.user.id,
			sessionId,
			request,
		});
		return { user: result.user, sessionId, amr: secondFactor ? ['pwd', secondFactor, 'mfa'] : ['pwd'] };
	}

	async requestPasswordReset(email: string, request: FastifyRequest): Promise<void> {
		const normalizedEmail = normalizeEmail(email);
		await Promise.all([
			this.rateLimiter.consume('password-reset-account', normalizedEmail, 5, 3_600),
			this.rateLimiter.consume('password-reset-ip', request.ip, 20, 3_600),
		]);
		const [user] = await this.db
			.select()
			.from(users)
			.where(and(eq(users.normalizedEmail, normalizedEmail), eq(users.status, 'active')))
			.limit(1);
		if (!user) {
			await this.audit.write({
				type: 'password.reset.requested',
				success: true,
				request,
			});
			return;
		}

		const token = randomToken(32);
		const expiresAt = new Date(Date.now() + this.config.PASSWORD_RESET_TTL_SECONDS * 1_000);
		await this.db.transaction(async (tx) => {
			await tx
				.update(passwordResetTokens)
				.set({ usedAt: new Date() })
				.where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
			await tx.insert(passwordResetTokens).values({
				userId: user.id,
				tokenHash: sha256(token),
				expiresAt,
			});
		});
		await this.audit.write({
			type: 'password.reset.requested',
			success: true,
			targetUserId: user.id,
			request,
		});
		await this.mail.sendPasswordReset({
			email: user.email,
			displayName: user.displayName,
			resetUrl: `${this.config.issuer.origin}/reset-password?token=${encodeURIComponent(token)}`,
			expiresInMinutes: Math.ceil(this.config.PASSWORD_RESET_TTL_SECONDS / 60),
		});
	}

	async completePasswordReset(token: string, password: string, request: FastifyRequest): Promise<void> {
		await this.rateLimiter.consume('password-reset-complete-ip', request.ip, 10, 900);
		const [reset] = await this.db
			.select({ token: passwordResetTokens, user: users })
			.from(passwordResetTokens)
			.innerJoin(users, eq(users.id, passwordResetTokens.userId))
			.where(
				and(
					eq(passwordResetTokens.tokenHash, sha256(token)),
					isNull(passwordResetTokens.usedAt),
					gt(passwordResetTokens.expiresAt, new Date()),
					eq(users.status, 'active'),
				),
			)
			.limit(1);
		if (!reset) throw new AppError(400, 'RESET_TOKEN_INVALID', 'Reset link is invalid or expired');
		const policy = await this.policies.resolve();
		const error = validatePassword(password, {
			minLength: policy.minPasswordLength,
			maxLength: MAX_PASSWORD_LENGTH,
		});
		if (error) throw new AppError(400, 'PASSWORD_POLICY_FAILED', error);
		const passwordHash = await hashPassword(password, this.config);

		await this.db.transaction(async (tx) => {
			await tx.update(passwordCredentials).set({ passwordHash, updatedAt: new Date() }).where(eq(passwordCredentials.userId, reset.user.id));
			await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, reset.token.id));
			await tx
				.update(users)
				.set({
					sessionVersion: reset.user.sessionVersion + 1,
					updatedAt: new Date(),
				})
				.where(eq(users.id, reset.user.id));
		});
		await this.sessions.revokeAll(reset.user.id, 'password_reset');
		await this.audit.write({
			type: 'password.reset.completed',
			success: true,
			targetUserId: reset.user.id,
			request,
		});
	}
}
