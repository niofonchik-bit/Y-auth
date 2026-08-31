import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../../src/auth/service.js';

describe('email normalization', () => {
  it('trims and compares case-insensitively', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('does not apply provider-specific aliases', () => {
    expect(normalizeEmail('user+tag@gmail.com')).toBe('user+tag@gmail.com');
    expect(normalizeEmail('first.last@gmail.com')).toBe('first.last@gmail.com');
  });
});
