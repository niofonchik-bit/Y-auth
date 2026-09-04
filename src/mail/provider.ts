import type { AppConfig } from '../config/env.js';

export interface PasswordResetMessage {
	email: string;
	displayName: string | null;
	resetUrl: string;
	expiresInMinutes: number;
}

export interface EmailVerificationMessage {
	email: string;
	displayName: string | null;
	verificationUrl: string;
	locale: 'en' | 'ru';
}

export interface MailProvider {
	readonly configured: boolean;
	sendPasswordReset(message: PasswordResetMessage): Promise<void>;
	sendEmailVerification(message: EmailVerificationMessage): Promise<void>;
}

export class ResendMailProvider implements MailProvider {
	readonly configured: boolean;

	constructor(private readonly config: AppConfig) {
		this.configured = Boolean(config.RESEND_API_KEY && config.MAIL_FROM);
	}

	async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
		if (!this.configured) {
			if (this.config.isProduction) throw new Error('Mail provider is not configured');
			return;
		}
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: this.config.MAIL_FROM,
				to: [message.email],
				subject: 'Reset your Y.auth password',
				text: `Open this link within ${message.expiresInMinutes} minutes: ${message.resetUrl}`,
			}),
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok) throw new Error(`Resend rejected password reset email (${response.status})`);
	}

	async sendEmailVerification(message: EmailVerificationMessage): Promise<void> {
		if (!this.configured) {
			if (this.config.isProduction) throw new Error('Mail provider is not configured');
			return;
		}
		const russian = message.locale === 'ru';
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: this.config.MAIL_FROM,
				to: [message.email],
				subject: russian ? 'Подтвердите email в Y.auth' : 'Verify your Y.auth email',
				text: russian
					? `Откройте ссылку для подтверждения email: ${message.verificationUrl}`
					: `Open this link to verify your email: ${message.verificationUrl}`,
			}),
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok) throw new Error(`Resend rejected verification email (${response.status})`);
	}
}
