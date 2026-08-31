export interface ApiErrorBody {
	error?: { code?: string; message?: string; requestId?: string };
}

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
	) {
		super(message);
	}
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		credentials: 'same-origin',
		...init,
		headers: {
			...(init?.body ? { 'Content-Type': 'application/json' } : {}),
			...init?.headers,
		},
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
		throw new ApiError(body.error?.message ?? `Request failed (${response.status})`, response.status, body.error?.code);
	}
	return response.json() as Promise<T>;
}

export async function csrfToken(): Promise<string> {
	return (await api<{ csrfToken: string }>('/api/v1/csrf')).csrfToken;
}
