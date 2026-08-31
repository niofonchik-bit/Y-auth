import { describe, expect, it } from 'vitest';
import { hashClientSecret, verifyClientSecret } from '../../src/security/crypto.js';
import { validateRedirectUri } from '../../src/security/uri.js';

describe('security regressions', () => {
	it('rejects open redirect patterns', () => {
		for (const value of [
			'https://example.com/*',
			'https://*.example.com/callback',
			'javascript:alert(1)',
			'https://user:pass@example.com/callback',
			'https://example.com/callback#token',
		]) {
			expect(validateRedirectUri(value, true), value).not.toBeNull();
		}
	});

	it('never authenticates a raw or malformed stored client secret', () => {
		expect(verifyClientSecret('plain-secret', 'plain-secret')).toBe(false);
		expect(verifyClientSecret(hashClientSecret('correct'), 'wrong')).toBe(false);
	});
});
