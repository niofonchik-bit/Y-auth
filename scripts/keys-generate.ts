import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';

const { privateKey } = await generateKeyPair('RS256', {
	modulusLength: 3072,
	extractable: true,
});
const privateJwk = await exportJWK(privateKey);
privateJwk.kid = randomUUID();
privateJwk.use = 'sig';
privateJwk.alg = 'RS256';

process.stdout.write(`OIDC_JWKS=${JSON.stringify({ keys: [privateJwk] })}\n`);
process.stdout.write('Store this value in the environment. It was not written to disk.\n');
