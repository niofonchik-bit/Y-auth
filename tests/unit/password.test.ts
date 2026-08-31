import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, validatePassword } from '../../src/security/password.js';

describe('password policy', () => {
  it('accepts a simple six-character password by default', () => {
    expect(validatePassword('123456', { minLength: 6, maxLength: MAX_PASSWORD_LENGTH })).toBeNull();
  });

  it('rejects short and oversized values without trimming', () => {
    expect(validatePassword('12345', { minLength: 6, maxLength: MAX_PASSWORD_LENGTH })).toContain(
      'at least 6',
    );
    expect(
      validatePassword('x'.repeat(257), { minLength: 6, maxLength: MAX_PASSWORD_LENGTH }),
    ).toContain('at most 256');
  });
});
