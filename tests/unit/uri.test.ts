import { describe, expect, it } from 'vitest';
import { validateRedirectUri } from '../../src/security/uri.js';

describe('redirect URI validation', () => {
  it('requires exact absolute URIs and rejects wildcards', () => {
    expect(validateRedirectUri('https://app.example/callback', true)).toBeNull();
    expect(validateRedirectUri('https://*.example/callback', true)).toContain('Wildcard');
    expect(validateRedirectUri('/callback', false)).toContain('absolute');
  });

  it('allows HTTP only on development loopback', () => {
    expect(validateRedirectUri('http://localhost:5173/callback', false)).toBeNull();
    expect(validateRedirectUri('http://127.0.0.1:5173/callback', false)).toBeNull();
    expect(validateRedirectUri('http://localhost:5173/callback', true)).toContain('HTTPS');
    expect(validateRedirectUri('http://example.com/callback', false)).toContain('HTTPS');
  });
});
