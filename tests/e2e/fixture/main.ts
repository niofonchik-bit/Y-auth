import { type User, UserManager, WebStorageStateStore } from 'oidc-client-ts';

const issuer = import.meta.env.VITE_AUTH_ISSUER ?? 'http://localhost:3000';
const definitions = [
	['Project A', 'project-a', import.meta.env.VITE_CLIENT_A_ID],
	['Project B', 'project-b', import.meta.env.VITE_CLIENT_B_ID],
	['Project C', 'project-c', import.meta.env.VITE_CLIENT_C_ID],
] as const;

const clients = definitions.map(([name, key, clientId]) => ({
	name,
	key,
	manager: new UserManager({
		authority: issuer,
		client_id: clientId,
		redirect_uri: `${window.location.origin}/callback`,
		post_logout_redirect_uri: `${window.location.origin}/`,
		response_type: 'code',
		scope: 'openid profile email offline_access y_auth.sessions',
		userStore: new WebStorageStateStore({
			store: sessionStorage,
			prefix: `e2e:${key}:user:`,
		}),
		stateStore: new WebStorageStateStore({
			store: sessionStorage,
			prefix: `e2e:${key}:state:`,
		}),
		automaticSilentRenew: false,
		monitorSession: false,
	}),
}));

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Fixture root is missing');

async function api<T>(user: User, path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${issuer}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${user.access_token}`,
			...init?.headers,
		},
	});
	if (!response.ok) throw new Error(`API returned ${response.status}`);
	return response.json() as Promise<T>;
}

function button(label: string, action: () => Promise<void>): HTMLButtonElement {
	const element = document.createElement('button');
	element.textContent = label;
	element.addEventListener('click', () => {
		element.disabled = true;
		action().catch((error: unknown) => {
			const message = document.createElement('p');
			message.textContent = error instanceof Error ? error.message : 'Action failed';
			element.parentElement?.append(message);
			element.disabled = false;
		});
	});
	return element;
}

async function signIn(client: (typeof clients)[number], register = false) {
	sessionStorage.setItem('e2e:callback-client', client.key);

	await client.manager.signinRedirect(
		register
			? {
					prompt: 'create',
				}
			: undefined,
	);
}

async function render(): Promise<void> {
	app.replaceChildren();
	for (const client of clients) {
		const user = await client.manager.getUser();
		const section = document.createElement('section');
		const heading = document.createElement('h2');
		heading.textContent = client.name;
		const status = document.createElement('p');
		status.textContent = user && !user.expired ? 'Authenticated' : 'Anonymous';
		section.append(heading, status);
		if (user && !user.expired) {
			const email = document.createElement('p');
			email.textContent = String(user.profile.email ?? '');
			section.append(
				email,
				button('View sessions', async () => {
					const result = await api<{
						items: Array<{ lastSeenAt: string }>;
					}>(user, '/api/v1/me/sessions');
					const detail = document.createElement('p');
					detail.textContent = `Last active ${result.items[0]?.lastSeenAt ?? 'unknown'}`;
					section.append(detail);
				}),
				button('Logout everywhere', async () => {
					if (!window.confirm('Log out everywhere?')) return;
					await api(user, '/api/v1/me/logout-everywhere', {
						method: 'POST',
					});
					await Promise.all(clients.map(({ manager }) => manager.removeUser()));
					await render();
				}),
			);
		} else {
			section.append(
				button('Login', () => signIn(client)),
				button('Register', () => signIn(client, true)),
			);
		}
		app.append(section);
	}
}

if (window.location.pathname === '/callback') {
	const callbackClient = sessionStorage.getItem('e2e:callback-client');
	const client = clients.find(({ key }) => key === callbackClient);

	if (!client) {
		throw new Error('Unknown callback client');
	}

	await client.manager.signinRedirectCallback();

	sessionStorage.removeItem('e2e:callback-client');

	window.location.replace('/');
} else {
	await render();
}
