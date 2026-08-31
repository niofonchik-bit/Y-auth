import { z } from 'zod';

const MIN_SECRET_BYTES = 32;

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  AUTH_ISSUER: z.string().url(),
  AUTH_WEB_DEV_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  OIDC_JWKS: z.string().min(1),
  OIDC_COOKIE_KEYS: z.string().min(1),
  SESSION_HMAC_SECRET: z.string().min(MIN_SECRET_BYTES),
  CSRF_HMAC_SECRET: z.string().min(MIN_SECRET_BYTES),
  RATE_LIMIT_HMAC_SECRET: z.string().min(MIN_SECRET_BYTES),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  CAPTCHA_MODE: z.enum(['off', 'adaptive', 'always_registration']).default('adaptive'),
  ENABLE_SWAGGER: booleanString,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.string().default('false'),
  ACCESS_TOKEN_TTL_SECONDS: positiveInteger(600),
  AUTHORIZATION_CODE_TTL_SECONDS: positiveInteger(120),
  SSO_IDLE_TTL_SECONDS: positiveInteger(604_800),
  SSO_ABSOLUTE_TTL_SECONDS: positiveInteger(2_592_000),
  REFRESH_TOKEN_TTL_SECONDS: positiveInteger(7_776_000),
  PASSWORD_RESET_TTL_SECONDS: positiveInteger(900),
  SESSION_ACTIVITY_INTERVAL_SECONDS: positiveInteger(300),
  ARGON2_MEMORY_KIB: positiveInteger(19_456),
  ARGON2_ITERATIONS: positiveInteger(2),
  ARGON2_PARALLELISM: positiveInteger(1),
});

type RawConfig = z.infer<typeof schema>;

export interface AppConfig extends RawConfig {
  isProduction: boolean;
  issuer: URL;
  jwks: { keys: Array<Record<string, unknown>> };
  oidcCookieKeys: string[];
  trustProxy: false | number;
}

function parseJwks(value: string): AppConfig['jwks'] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('OIDC_JWKS must be valid JSON');
  }

  const result = z
    .object({ keys: z.array(z.record(z.string(), z.unknown())).min(1) })
    .safeParse(parsed);
  if (!result.success) {
    throw new Error('OIDC_JWKS must contain at least one JWK');
  }

  const privateSigningKeys = result.data.keys.filter((key) => typeof key.d === 'string');
  if (privateSigningKeys.length === 0) {
    throw new Error('OIDC_JWKS must contain an asymmetric private signing key');
  }

  for (const key of result.data.keys) {
    if (typeof key.kid !== 'string' || key.kid.length === 0) {
      throw new Error('Every OIDC JWK must have a kid');
    }
  }

  return result.data;
}

function parseTrustProxy(value: string): false | number {
  if (value === 'false') return false;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 1 || hops > 3) {
    throw new Error('TRUST_PROXY must be false or a hop count from 1 to 3');
  }
  return hops;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = schema.parse(environment);
  const issuer = new URL(raw.AUTH_ISSUER);
  const isProduction = raw.NODE_ENV === 'production';
  const oidcCookieKeys = raw.OIDC_COOKIE_KEYS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    oidcCookieKeys.length < 2 ||
    oidcCookieKeys.some((value) => value.length < MIN_SECRET_BYTES)
  ) {
    throw new Error('OIDC_COOKIE_KEYS must contain at least two comma-separated 32+ byte keys');
  }
  if (isProduction && issuer.protocol !== 'https:') {
    throw new Error('Production AUTH_ISSUER must use HTTPS');
  }
  if (isProduction && issuer.origin !== 'https://auth.niofon.com') {
    throw new Error('Production AUTH_ISSUER must be exactly https://auth.niofon.com');
  }
  if (raw.REFRESH_TOKEN_TTL_SECONDS <= raw.ACCESS_TOKEN_TTL_SECONDS) {
    throw new Error('Refresh token TTL must be longer than access token TTL');
  }
  if (raw.SSO_ABSOLUTE_TTL_SECONDS < raw.SSO_IDLE_TTL_SECONDS) {
    throw new Error('SSO absolute TTL must not be shorter than idle TTL');
  }
  if (raw.ARGON2_MEMORY_KIB < 19_456 || raw.ARGON2_ITERATIONS < 2 || raw.ARGON2_PARALLELISM < 1) {
    throw new Error('Argon2id parameters are below the built-in security floor');
  }
  if (
    isProduction &&
    raw.CAPTCHA_MODE !== 'off' &&
    (!raw.TURNSTILE_SECRET_KEY || !raw.TURNSTILE_SITE_KEY)
  ) {
    throw new Error(
      'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required when CAPTCHA is enabled in production',
    );
  }

  return {
    ...raw,
    isProduction,
    issuer,
    jwks: parseJwks(raw.OIDC_JWKS),
    oidcCookieKeys,
    trustProxy: parseTrustProxy(raw.TRUST_PROXY),
  };
}
