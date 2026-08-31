import { describe, expect, it } from 'vitest';
import { loggerOptions, sanitizedPath } from '../../src/app.js';
import type { AppConfig } from '../../src/config/env.js';

describe('sensitive logging', () => {
  it('removes query strings from logged paths', () => {
    expect(sanitizedPath('/reset-password?token=secret')).toBe('/reset-password');
    expect(sanitizedPath('/oauth/authorize?code=secret')).toBe('/oauth/authorize');
  });

  it('redacts credentials and tokens', () => {
    const options = loggerOptions({ LOG_LEVEL: 'info' } as AppConfig);
    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.token',
        '*.refreshToken',
        '*.clientSecret',
      ]),
    );
  });
});
