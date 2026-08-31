import { randomBytes } from 'node:crypto';

const secret = () => randomBytes(48).toString('base64url');

process.stdout.write(`OIDC_COOKIE_KEYS=${secret()},${secret()}\n`);
process.stdout.write(`SESSION_HMAC_SECRET=${secret()}\n`);
process.stdout.write(`CSRF_HMAC_SECRET=${secret()}\n`);
process.stdout.write(`RATE_LIMIT_HMAC_SECRET=${secret()}\n`);
process.stdout.write('Store these values in the environment. They were not written to disk.\n');
