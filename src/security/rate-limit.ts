import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../shared/errors.js';
import { hmacSha256 } from './crypto.js';

const LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

export interface LimitResult {
	remaining: number;
	retryAfter: number;
}

export class DistributedRateLimiter {
	constructor(
		private readonly redis: Redis,
		private readonly config: AppConfig,
	) {}

	private async ensureConnected(): Promise<void> {
		if (this.redis.status === 'wait') {
			await this.redis.connect();
		}
	}

	async consume(bucket: string, identity: string, limit: number, windowSeconds: number): Promise<LimitResult> {
		const safeIdentity = hmacSha256(this.config.RATE_LIMIT_HMAC_SECRET, identity);
		try {
			await this.ensureConnected();

			const result = await this.redis.eval(LUA, 1, `y-auth:limit:${bucket}:${safeIdentity}`, windowSeconds);
			if (!Array.isArray(result)) throw new Error('Unexpected Redis response');
			const count = Number(result[0]);
			const retryAfter = Math.max(1, Number(result[1]));
			if (count > limit) {
				throw new AppError(429, 'RATE_LIMITED', `Too many requests. Retry in ${retryAfter} seconds.`);
			}
			return { remaining: Math.max(0, limit - count), retryAfter };
		} catch (error) {
			if (error instanceof AppError) throw error;
			throw new AppError(503, 'SECURITY_STORE_UNAVAILABLE', 'Security service is temporarily unavailable');
		}
	}

	async peek(bucket: string, identity: string): Promise<number> {
		const safeIdentity = hmacSha256(this.config.RATE_LIMIT_HMAC_SECRET, identity);
		try {
			await this.ensureConnected();

			return Number((await this.redis.get(`y-auth:limit:${bucket}:${safeIdentity}`)) ?? 0);
		} catch {
			throw new AppError(503, 'SECURITY_STORE_UNAVAILABLE', 'Security service is temporarily unavailable');
		}
	}
}
