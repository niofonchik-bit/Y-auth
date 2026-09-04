import { randomBytes } from 'node:crypto';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import type { AuditService } from '../audit/service.js';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { mfaRecoveryCodes, userMfaTotp } from '../db/schema.js';
import { randomToken, sha256 } from '../security/crypto.js';
import { decryptAesGcm, encryptAesGcm } from '../security/encryption.js';
import { AppError } from '../shared/errors.js';

function recoveryCode(): string {
	return (
		randomBytes(12)
			.toString('hex')
			.toUpperCase()
			.match(/.{1,4}/g)
			?.join('-') ?? randomToken(16)
	);
}

export class MfaService {
	constructor(
		private readonly db: Database,
		private readonly config: AppConfig,
		private readonly audit: AuditService,
	) {}

	private key(): string {
		if (!this.config.MFA_ENABLED || !this.config.MFA_ENCRYPTION_KEY) throw new AppError(503, 'MFA_DISABLED', 'MFA is disabled');
		return this.config.MFA_ENCRYPTION_KEY;
	}

	async status(userId: string) {
		const [method] = await this.db.select().from(userMfaTotp).where(eq(userMfaTotp.userId, userId)).limit(1);
		const [remaining] = await this.db
			.select({ count: count() })
			.from(mfaRecoveryCodes)
			.where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
		return { enabled: Boolean(method?.enabledAt), enabledAt: method?.enabledAt ?? null, recoveryCodesRemaining: remaining?.count ?? 0 };
	}

	async beginSetup(userId: string, email: string) {
		const secret = new Secret({ size: 20 });
		const encrypted = encryptAesGcm(secret.base32, this.key());
		await this.db
			.insert(userMfaTotp)
			.values({ userId, secretCiphertext: encrypted.ciphertext, secretIv: encrypted.iv, secretTag: encrypted.tag })
			.onConflictDoUpdate({
				target: userMfaTotp.userId,
				set: {
					secretCiphertext: encrypted.ciphertext,
					secretIv: encrypted.iv,
					secretTag: encrypted.tag,
					enabledAt: null,
					lastAcceptedTimeStep: null,
					updatedAt: new Date(),
				},
			});
		const totp = new TOTP({ issuer: 'Y.auth', label: email, secret, algorithm: 'SHA1', digits: 6, period: 30 });
		return {
			manualSecret: secret.base32,
			otpAuthUrl: totp.toString(),
			qrDataUrl: await QRCode.toDataURL(totp.toString(), { width: 256, margin: 1 }),
		};
	}

	private async method(userId: string) {
		const [method] = await this.db.select().from(userMfaTotp).where(eq(userMfaTotp.userId, userId)).limit(1);
		if (!method) throw new AppError(409, 'MFA_SETUP_REQUIRED', 'Start MFA setup first');
		const secret = decryptAesGcm({ ciphertext: method.secretCiphertext, iv: method.secretIv, tag: method.secretTag }, this.key());
		return {
			method,
			totp: new TOTP({ issuer: 'Y.auth', label: userId, secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 }),
		};
	}

	async enable(userId: string, code: string): Promise<string[]> {
		const { method, totp } = await this.method(userId);
		if (method.enabledAt) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled');
		const delta = totp.validate({ token: code, window: 1 });
		if (delta === null) throw new AppError(400, 'MFA_CODE_INVALID', 'Authenticator code is invalid');
		const step = totp.counter() + delta;
		const codes = Array.from({ length: 10 }, recoveryCode);
		await this.db.transaction(async (tx) => {
			await tx
				.update(userMfaTotp)
				.set({ enabledAt: new Date(), lastUsedAt: new Date(), lastAcceptedTimeStep: step, updatedAt: new Date() })
				.where(eq(userMfaTotp.userId, userId));
			await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
			await tx.insert(mfaRecoveryCodes).values(codes.map((codeValue) => ({ userId, codeHash: sha256(codeValue) })));
		});
		await this.audit.write({ type: 'mfa.totp.enabled', success: true, actorUserId: userId, targetUserId: userId });
		return codes;
	}

	async verify(userId: string, code: string): Promise<'otp' | 'recovery'> {
		const { method, totp } = await this.method(userId);
		if (!method.enabledAt) throw new AppError(409, 'MFA_NOT_ENABLED', 'MFA is not enabled');
		const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
		if (delta !== null) {
			const step = totp.counter() + delta;
			if (method.lastAcceptedTimeStep !== null && step <= method.lastAcceptedTimeStep)
				throw new AppError(400, 'MFA_CODE_REPLAYED', 'Authenticator code has already been used');
			await this.db
				.update(userMfaTotp)
				.set({ lastAcceptedTimeStep: step, lastUsedAt: new Date(), updatedAt: new Date() })
				.where(eq(userMfaTotp.userId, userId));
			return 'otp';
		}
		const [used] = await this.db
			.update(mfaRecoveryCodes)
			.set({ usedAt: new Date() })
			.where(
				and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, sha256(code.toUpperCase())), isNull(mfaRecoveryCodes.usedAt)),
			)
			.returning({ id: mfaRecoveryCodes.id });
		if (!used) throw new AppError(400, 'MFA_CODE_INVALID', 'Authenticator or recovery code is invalid');
		await this.audit.write({ type: 'mfa.recovery.used', success: true, actorUserId: userId, targetUserId: userId });
		return 'recovery';
	}

	async disable(userId: string): Promise<void> {
		await this.db.transaction(async (tx) => {
			await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
			await tx.delete(userMfaTotp).where(eq(userMfaTotp.userId, userId));
		});
		await this.audit.write({ type: 'mfa.totp.disabled', success: true, actorUserId: userId, targetUserId: userId });
	}

	async hasEnabled(userId: string): Promise<boolean> {
		const [result] = await this.db.select({ enabledAt: userMfaTotp.enabledAt }).from(userMfaTotp).where(eq(userMfaTotp.userId, userId)).limit(1);
		return Boolean(result?.enabledAt);
	}
}
