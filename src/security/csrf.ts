import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { constantEqual, hmacSha256, randomToken } from './crypto.js';

const COOKIE_BASE = 'y-auth-csrf';

export function csrfCookieName(config: AppConfig): string {
	return config.isProduction ? `__Host-${COOKIE_BASE}` : COOKIE_BASE;
}

export function issueCsrf(reply: FastifyReply, config: AppConfig): string {
	const nonce = randomToken(24);
	const token = `${nonce}.${hmacSha256(config.CSRF_HMAC_SECRET, nonce)}`;
	reply.setCookie(csrfCookieName(config), token, {
		path: '/',
		secure: config.isProduction,
		httpOnly: false,
		sameSite: 'strict',
	});
	return token;
}

export function verifyCsrf(request: FastifyRequest, submitted: unknown, config: AppConfig): boolean {
	if (typeof submitted !== 'string') return false;
	const cookie = request.cookies[csrfCookieName(config)];
	if (!cookie || !constantEqual(cookie, submitted)) return false;
	const [nonce, signature, extra] = submitted.split('.');
	return Boolean(nonce && signature && !extra && constantEqual(signature, hmacSha256(config.CSRF_HMAC_SECRET, nonce)));
}
