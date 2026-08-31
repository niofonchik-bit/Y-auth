# Y.auth integration examples

All clients use discovery from `https://auth.niofon.com/.well-known/openid-configuration`. Register every redirect and post-logout URI exactly; never use wildcards.

## React SPA

Install `oidc-client-ts`, keep tokens in session storage, and use Authorization Code + PKCE:

```ts
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

export const auth = new UserManager({
	authority: 'https://auth.niofon.com',
	client_id: 'PROJECT_A_CLIENT_ID',
	redirect_uri: `${location.origin}/callback`,
	post_logout_redirect_uri: location.origin,
	response_type: 'code',
	scope: 'openid profile email offline_access api',
	userStore: new WebStorageStateStore({
		store: sessionStorage,
		prefix: 'project-a:',
	}),
});

export const login = () => auth.signinRedirect();
export const register = () => auth.signinRedirect({ prompt: 'create' });
export const logoutThisClient = () => auth.signoutRedirect();
```

On `/callback`, call `await auth.signinRedirectCallback()` and replace the history entry. Never render or log raw tokens.

## Frontend + Backend

Use a confidential client only on the backend. The browser receives an application session cookie; the backend alone performs the code exchange and stores the refresh token encrypted. Generate `state`, `nonce`, and the PKCE verifier per attempt, bind them to the browser session, and accept the callback only once. Never ship the client secret in JavaScript.

## Express/Fastify backend

Validate access tokens locally against discovery JWKS and require both issuer and resource audience:

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer = 'https://auth.niofon.com';
const jwks = createRemoteJWKSet(new URL(`${issuer}/jwks`));

export async function verifyApiToken(authorization?: string) {
	if (!authorization?.startsWith('Bearer ')) throw new Error('Bearer token required');
	const { payload } = await jwtVerify(authorization.slice(7), jwks, {
		issuer,
		audience: 'https://api.example.com',
		algorithms: ['RS256'],
	});
	if (!payload.sub) throw new Error('Subject required');
	return payload;
}
```

Do not call the user-info endpoint on every API request. Cache JWKS through the library, reject unexpected algorithms, and authorize scopes separately from token validation.

## Electron

Treat Electron as a public native client: create PKCE and state in the main process, open the authorization URL with `shell.openExternal`, receive the redirect on a short-lived loopback HTTP listener, verify state, exchange the code without a client secret, and close the listener. Keep refresh tokens in the operating-system credential vault (for example, through `keytar`), never in the renderer or localStorage. Use a unique loopback port and an exact registered callback URI.

## Logout

- RP-initiated logout ends the current Y.auth browser session and the selected client session.
- Revoking one client grant invalidates that client's refresh family without signing out other projects.
- “Logout everywhere” revokes every user session and related grants.
- Deactivation increments session state and blocks existing sessions and refreshes.
