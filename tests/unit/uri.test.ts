import { describe, expect, it } from 'vitest';
import { validateRedirectUri } from '../../src/security/uri.js';

describe('redirect URI validation', () => {
	it('requires exact absolute URIs and rejects wildcards', () => {
		expect(validateRedirectUri('https://app.example/callback', { allowLoopbackRedirects: false })).toBeNull();
		expect(validateRedirectUri('https://*.example/callback', { allowLoopbackRedirects: false })).toContain('Wildcard');
		expect(validateRedirectUri('/callback', { allowLoopbackRedirects: false })).toContain('absolute');
	});

	it('requires an explicit per-client flag for HTTP loopback redirects', () => {
		expect(validateRedirectUri('http://localhost:5173/callback', { allowLoopbackRedirects: false })).toContain('disabled');
		expect(validateRedirectUri('http://localhost:5173/callback', { allowLoopbackRedirects: true })).toBeNull();
		expect(validateRedirectUri('http://127.0.0.1:5173/callback', { allowLoopbackRedirects: true })).toBeNull();
		expect(validateRedirectUri('http://[::1]:5173/callback', { allowLoopbackRedirects: true })).toBeNull();
	});

	it('never allows HTTP on non-loopback hosts', () => {
		expect(validateRedirectUri('http://example.com/callback', { allowLoopbackRedirects: true })).toContain('HTTPS');
		expect(validateRedirectUri('http://192.168.1.10:5173/callback', { allowLoopbackRedirects: true })).toContain('HTTPS');
		expect(validateRedirectUri('http://localhost.example.com/callback', { allowLoopbackRedirects: true })).toContain('HTTPS');
	});
});
