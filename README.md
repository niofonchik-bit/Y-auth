# Y.auth

Centralized OpenID Connect Identity Provider for several independent applications. Y.auth implements Authorization Code + PKCE, persistent grants and sessions, rotating refresh tokens, account recovery, client isolation, an administration console, audit events, and a React account UI.

## Requirements

- Node.js 24
- PostgreSQL 16+ (a direct URL for migrations and a pooled PgBouncer URL for runtime)
- Redis 7+

No containers are required.

## Start locally

```bash
cp .env.example .env
npm ci
npm run secrets:generate
npm run keys:generate
npm run db:migrate
npm run admin:create
npm run dev
```

In a second terminal run `npm run dev:web`. Set `AUTH_WEB_DEV_URL=http://localhost:5174` while using the Vite development server. Open `http://localhost:3000/login?returnTo=/admin` to enter the administration console.

## Production

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

Production validates HTTPS issuer and secret configuration at startup. Never reuse development database, Redis, keys, cookies, or OAuth clients in production. Run migrations against `DATABASE_DIRECT_URL`; application traffic uses `DATABASE_URL` with prepared statements disabled for PgBouncer transaction mode.

## Quality commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:security
npm run test:e2e
npm run benchmark
```

Integration and browser tests require disposable PostgreSQL and Redis instances. The integration suite refuses to reset a database unless `ALLOW_TEST_DATABASE_RESET=true` and `TEST_DATABASE_URL`, `TEST_DATABASE_DIRECT_URL`, and `TEST_REDIS_URL` are explicitly provided.

## Structure

- `src/oidc` — provider configuration and persistent adapter
- `src/auth`, `src/sessions`, `src/account` — identity lifecycle
- `src/admin`, `src/clients`, `src/audit` — administration and policy
- `src/security` — hashing, CSRF, CAPTCHA, rate limits, URI validation
- `src/web` — React user and administrator UI
- `migrations` — reviewed SQL migrations
- `tests` — unit, integration, security, and browser coverage

See [EXAMPLE.md](EXAMPLE.md) for client integration patterns and the separately supplied `Y-auth-setup.md` for complete deployment instructions.
