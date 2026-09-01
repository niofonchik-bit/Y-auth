const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface RedirectUriOptions {
	allowLoopbackRedirects: boolean;
}

export function validateRedirectUri(value: string, options: RedirectUriOptions): string | null {
	if (value.includes('*')) return 'Wildcard redirect URIs are not allowed.';

	let uri: URL;
	try {
		uri = new URL(value);
	} catch {
		return 'Redirect URI must be an absolute URL.';
	}

	if (uri.username || uri.password || uri.hash) return 'Credentials and fragments are not allowed.';
	if (uri.protocol === 'https:') return null;
	if (uri.protocol === 'http:' && LOOPBACK_HOSTS.has(uri.hostname)) {
		return options.allowLoopbackRedirects ? null : 'Loopback redirect URIs are disabled for this client.';
	}
	return 'HTTPS is required outside loopback development redirects.';
}

export function redirectOrigin(value: string): string | null {
	try {
		const uri = new URL(value);
		return uri.protocol === 'http:' || uri.protocol === 'https:' ? uri.origin : null;
	} catch {
		return null;
	}
}
