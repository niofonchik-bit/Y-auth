import argon2 from 'argon2';

export const MAX_PASSWORD_LENGTH = 256;

export interface PasswordPolicy {
	minLength: number;
	maxLength: number;
}

export interface PasswordHashingConfig {
	ARGON2_MEMORY_KIB: number;
	ARGON2_ITERATIONS: number;
	ARGON2_PARALLELISM: number;
}

export function validatePassword(password: string, policy: PasswordPolicy): string | null {
	if (password.length < policy.minLength) return `Password must contain at least ${policy.minLength} characters`;
	if (password.length > policy.maxLength) return `Password must contain at most ${policy.maxLength} characters`;
	return null;
}

function options(config: PasswordHashingConfig) {
	return {
		type: argon2.argon2id,
		memoryCost: config.ARGON2_MEMORY_KIB,
		timeCost: config.ARGON2_ITERATIONS,
		parallelism: config.ARGON2_PARALLELISM,
	} as const;
}

export function hashPassword(password: string, config: PasswordHashingConfig): Promise<string> {
	return argon2.hash(password, options(config));
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
	return argon2.verify(hash, password);
}

export function passwordNeedsRehash(hash: string, config: PasswordHashingConfig): boolean {
	return argon2.needsRehash(hash, options(config));
}
