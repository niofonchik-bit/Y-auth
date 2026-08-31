import { describe, expect, it } from 'vitest';
import { hashClientSecret, randomToken, sha256, verifyClientSecret } from '../../src/security/crypto.js';

describe('security tokens', () => {
	it('generates 256-bit reset tokens and stores only deterministic hashes', () => {
		const token = randomToken(32);
		expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		expect(sha256(token)).toHaveLength(64);
		expect(sha256(token)).not.toContain(token);
	});

	it('verifies high-entropy client-secret digests', () => {
		const stored = hashClientSecret('secret-value');
		expect(stored).not.toContain('secret-value');
		expect(verifyClientSecret(stored, 'secret-value')).toBe(true);
		expect(verifyClientSecret(stored, 'other-value')).toBe(false);
	});
});
