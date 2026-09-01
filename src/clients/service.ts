import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { oauthClientPostLogoutRedirectUris, oauthClientRedirectUris, oauthClients, oidcRecords } from '../db/schema.js';
import { hashClientSecret, randomToken } from '../security/crypto.js';
import { validateRedirectUri } from '../security/uri.js';
import { AppError } from '../shared/errors.js';

const PROJECT_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export interface ClientInput {
	projectKey: string;
	name: string;
	type: 'public' | 'confidential';
	firstParty: boolean;
	allowLoopbackRedirects: boolean;
	redirectUris: string[];
	postLogoutRedirectUris: string[];
	allowedScopes: string[];
	accessTokenAudience?: string;
	registrationEnabledOverride?: boolean | null;
	minPasswordLengthOverride?: number | null;
}

export interface ClientUpdateInput {
	projectKey: string;
	name: string;
	firstParty: boolean;
	allowLoopbackRedirects: boolean;
	redirectUris: string[];
	postLogoutRedirectUris: string[];
}

export interface CreatedClient {
	clientId: string;
	clientSecret: string | null;
}

function normalizeProjectKey(value: unknown): string {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function uniqueUris(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return [
		...new Set(
			values
				.filter((value): value is string => typeof value === 'string')
				.map((value) => value.trim())
				.filter(Boolean),
		),
	];
}

function isProjectKeyConflict(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const postgresError = error as { code?: string; constraint_name?: string };
	return postgresError.code === '23505' && postgresError.constraint_name === 'oauth_clients_project_key_unique';
}

function clientMetadata(id: string, clientId: string, input: ClientInput, secretHash: string | null, enabled = true): Record<string, unknown> {
	return {
		client_id: clientId,
		client_name: input.name,
		client_secret: secretHash ?? undefined,
		token_endpoint_auth_method: input.type === 'public' ? 'none' : 'client_secret_basic',
		redirect_uris: input.redirectUris,
		post_logout_redirect_uris: input.postLogoutRedirectUris,
		response_types: ['code'],
		grant_types: ['authorization_code', 'refresh_token'],
		application_type: 'web',
		scope: input.allowedScopes.join(' '),
		y_auth_id: id,
		y_auth_enabled: enabled,
		y_auth_first_party: input.firstParty,
		y_auth_audience: input.accessTokenAudience ?? `urn:y-auth:client:${clientId}`,
	};
}

export class ClientService {
	constructor(private readonly db: Database) {}

	private validate(input: ClientInput): void {
		if (!PROJECT_KEY_PATTERN.test(input.projectKey)) {
			throw new AppError(
				400,
				'INVALID_PROJECT_KEY',
				'Project key must be 1-64 characters and contain only lowercase letters, numbers and hyphens',
			);
		}
		if (!input.name) throw new AppError(400, 'CLIENT_NAME_REQUIRED', 'Client name is required');
		if (input.type !== 'public' && input.type !== 'confidential') {
			throw new AppError(400, 'INVALID_CLIENT_TYPE', 'Client type must be public or confidential');
		}
		if (input.redirectUris.length === 0) {
			throw new AppError(400, 'REDIRECT_URI_REQUIRED', 'At least one redirect URI is required');
		}
		for (const uri of [...input.redirectUris, ...input.postLogoutRedirectUris]) {
			const error = validateRedirectUri(uri, {
				allowLoopbackRedirects: input.allowLoopbackRedirects,
			});
			if (error) throw new AppError(400, 'INVALID_REDIRECT_URI', error);
		}
		if (!input.allowedScopes.includes('openid')) {
			throw new AppError(400, 'OPENID_SCOPE_REQUIRED', 'The openid scope is required');
		}
		if (
			input.minPasswordLengthOverride !== undefined &&
			input.minPasswordLengthOverride !== null &&
			(input.minPasswordLengthOverride < 6 || input.minPasswordLengthOverride > 256)
		) {
			throw new AppError(400, 'INVALID_PASSWORD_POLICY', 'Password minimum must be between 6 and 256');
		}
	}

	private async assertProjectKeyAvailable(projectKey: string, currentId?: string): Promise<void> {
		const [existing] = await this.db.select({ id: oauthClients.id }).from(oauthClients).where(eq(oauthClients.projectKey, projectKey)).limit(1);
		if (existing && existing.id !== currentId) {
			throw new AppError(409, 'PROJECT_KEY_EXISTS', 'A client with this project key already exists');
		}
	}

	private normalizeInput(input: ClientInput): ClientInput {
		return {
			...input,
			projectKey: normalizeProjectKey(input.projectKey),
			name: typeof input.name === 'string' ? input.name.trim() : '',
			firstParty: input.firstParty === true,
			allowLoopbackRedirects: input.allowLoopbackRedirects === true,
			redirectUris: uniqueUris(input.redirectUris),
			postLogoutRedirectUris: uniqueUris(input.postLogoutRedirectUris),
			allowedScopes: Array.isArray(input.allowedScopes)
				? [...new Set(input.allowedScopes.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0))]
				: [],
			...(typeof input.accessTokenAudience === 'string' && input.accessTokenAudience.trim()
				? { accessTokenAudience: input.accessTokenAudience.trim() }
				: {}),
		};
	}

	async create(input: ClientInput): Promise<CreatedClient> {
		const normalizedInput = this.normalizeInput(input);
		this.validate(normalizedInput);
		await this.assertProjectKeyAvailable(normalizedInput.projectKey);

		const id = randomUUID();
		const clientId = `ya_${randomToken(18)}`;
		const clientSecret = normalizedInput.type === 'confidential' ? randomToken(48) : null;
		const secretHash = clientSecret ? hashClientSecret(clientSecret) : null;
		const audience = normalizedInput.accessTokenAudience || `urn:y-auth:client:${clientId}`;
		const storedInput = { ...normalizedInput, accessTokenAudience: audience };

		try {
			await this.db.transaction(async (tx) => {
				await tx.insert(oauthClients).values({
					id,
					clientId,
					projectKey: storedInput.projectKey,
					name: storedInput.name,
					type: storedInput.type,
					firstParty: storedInput.firstParty,
					allowLoopbackRedirects: storedInput.allowLoopbackRedirects,
					allowedScopes: storedInput.allowedScopes,
					grantTypes: ['authorization_code', 'refresh_token'],
					responseTypes: ['code'],
					accessTokenAudience: audience,
					clientSecretHash: secretHash,
					registrationEnabledOverride: storedInput.registrationEnabledOverride ?? null,
					minPasswordLengthOverride: storedInput.minPasswordLengthOverride ?? null,
				});
				await tx.insert(oauthClientRedirectUris).values(storedInput.redirectUris.map((uri) => ({ clientId: id, uri })));
				if (storedInput.postLogoutRedirectUris.length > 0) {
					await tx.insert(oauthClientPostLogoutRedirectUris).values(
						storedInput.postLogoutRedirectUris.map((uri) => ({
							clientId: id,
							uri,
						})),
					);
				}
				await tx.insert(oidcRecords).values({
					model: 'Client',
					id: clientId,
					payload: clientMetadata(id, clientId, storedInput, secretHash),
				});
			});
		} catch (error) {
			if (isProjectKeyConflict(error)) {
				throw new AppError(409, 'PROJECT_KEY_EXISTS', 'A client with this project key already exists');
			}
			throw error;
		}

		return { clientId, clientSecret };
	}

	async get(clientId: string) {
		const [client] = await this.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
		if (!client) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');

		const [redirectUris, postLogoutRedirectUris] = await Promise.all([
			this.db.select({ uri: oauthClientRedirectUris.uri }).from(oauthClientRedirectUris).where(eq(oauthClientRedirectUris.clientId, client.id)),
			this.db
				.select({ uri: oauthClientPostLogoutRedirectUris.uri })
				.from(oauthClientPostLogoutRedirectUris)
				.where(eq(oauthClientPostLogoutRedirectUris.clientId, client.id)),
		]);

		return {
			clientId: client.clientId,
			projectKey: client.projectKey,
			name: client.name,
			type: client.type,
			enabled: client.enabled,
			firstParty: client.firstParty,
			allowLoopbackRedirects: client.allowLoopbackRedirects,
			redirectUris: redirectUris.map(({ uri }) => uri),
			postLogoutRedirectUris: postLogoutRedirectUris.map(({ uri }) => uri),
			allowedScopes: client.allowedScopes,
			accessTokenAudience: client.accessTokenAudience,
			registrationEnabledOverride: client.registrationEnabledOverride,
			minPasswordLengthOverride: client.minPasswordLengthOverride,
			createdAt: client.createdAt,
			lastUsedAt: client.lastUsedAt,
		};
	}

	async update(clientId: string, input: ClientUpdateInput): Promise<void> {
		const [client] = await this.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
		if (!client) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');

		const merged = this.normalizeInput({
			projectKey: input.projectKey,
			name: input.name,
			type: client.type,
			firstParty: input.firstParty,
			allowLoopbackRedirects: input.allowLoopbackRedirects,
			redirectUris: input.redirectUris,
			postLogoutRedirectUris: input.postLogoutRedirectUris,
			allowedScopes: client.allowedScopes,
			accessTokenAudience: client.accessTokenAudience,
			registrationEnabledOverride: client.registrationEnabledOverride,
			minPasswordLengthOverride: client.minPasswordLengthOverride,
		});
		this.validate(merged);
		await this.assertProjectKeyAvailable(merged.projectKey, client.id);

		try {
			await this.db.transaction(async (tx) => {
				await tx
					.update(oauthClients)
					.set({
						projectKey: merged.projectKey,
						name: merged.name,
						firstParty: merged.firstParty,
						allowLoopbackRedirects: merged.allowLoopbackRedirects,
						updatedAt: new Date(),
					})
					.where(eq(oauthClients.id, client.id));

				await tx.delete(oauthClientRedirectUris).where(eq(oauthClientRedirectUris.clientId, client.id));
				await tx.delete(oauthClientPostLogoutRedirectUris).where(eq(oauthClientPostLogoutRedirectUris.clientId, client.id));

				await tx.insert(oauthClientRedirectUris).values(merged.redirectUris.map((uri) => ({ clientId: client.id, uri })));
				if (merged.postLogoutRedirectUris.length > 0) {
					await tx.insert(oauthClientPostLogoutRedirectUris).values(
						merged.postLogoutRedirectUris.map((uri) => ({
							clientId: client.id,
							uri,
						})),
					);
				}

				await tx
					.update(oidcRecords)
					.set({
						payload: clientMetadata(client.id, client.clientId, merged, client.clientSecretHash, client.enabled),
					})
					.where(and(eq(oidcRecords.model, 'Client'), eq(oidcRecords.id, client.clientId)));
			});
		} catch (error) {
			if (isProjectKeyConflict(error)) {
				throw new AppError(409, 'PROJECT_KEY_EXISTS', 'A client with this project key already exists');
			}
			throw error;
		}
	}

	async regenerateSecret(clientId: string): Promise<string> {
		const [client] = await this.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
		if (!client || client.type !== 'confidential') {
			throw new AppError(404, 'CONFIDENTIAL_CLIENT_NOT_FOUND', 'Confidential client not found');
		}

		const redirectUris = await this.db
			.select({ uri: oauthClientRedirectUris.uri })
			.from(oauthClientRedirectUris)
			.where(eq(oauthClientRedirectUris.clientId, client.id));
		const logoutUris = await this.db
			.select({ uri: oauthClientPostLogoutRedirectUris.uri })
			.from(oauthClientPostLogoutRedirectUris)
			.where(eq(oauthClientPostLogoutRedirectUris.clientId, client.id));
		const secret = randomToken(48);
		const secretHash = hashClientSecret(secret);
		const input: ClientInput = {
			projectKey: client.projectKey,
			name: client.name,
			type: client.type,
			firstParty: client.firstParty,
			allowLoopbackRedirects: client.allowLoopbackRedirects,
			redirectUris: redirectUris.map(({ uri }) => uri),
			postLogoutRedirectUris: logoutUris.map(({ uri }) => uri),
			allowedScopes: client.allowedScopes,
			accessTokenAudience: client.accessTokenAudience,
			registrationEnabledOverride: client.registrationEnabledOverride,
			minPasswordLengthOverride: client.minPasswordLengthOverride,
		};

		await this.db.transaction(async (tx) => {
			await tx.update(oauthClients).set({ clientSecretHash: secretHash, updatedAt: new Date() }).where(eq(oauthClients.id, client.id));
			await tx
				.update(oidcRecords)
				.set({
					payload: clientMetadata(client.id, client.clientId, input, secretHash, client.enabled),
				})
				.where(and(eq(oidcRecords.model, 'Client'), eq(oidcRecords.id, client.clientId)));
		});
		return secret;
	}

	async setEnabled(clientId: string, enabled: boolean): Promise<void> {
		const [record] = await this.db.select({ id: oauthClients.id }).from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
		if (!record) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found');

		await this.db.transaction(async (tx) => {
			await tx.update(oauthClients).set({ enabled, updatedAt: new Date() }).where(eq(oauthClients.id, record.id));
			const [oidc] = await tx
				.select({ payload: oidcRecords.payload })
				.from(oidcRecords)
				.where(and(eq(oidcRecords.model, 'Client'), eq(oidcRecords.id, clientId)))
				.limit(1);
			if (oidc) {
				await tx
					.update(oidcRecords)
					.set({
						payload: { ...oidc.payload, y_auth_enabled: enabled },
					})
					.where(and(eq(oidcRecords.model, 'Client'), eq(oidcRecords.id, clientId)));
			}
		});
	}

	async list(limit: number, offset: number) {
		return this.db
			.select({
				id: oauthClients.id,
				clientId: oauthClients.clientId,
				projectKey: oauthClients.projectKey,
				name: oauthClients.name,
				type: oauthClients.type,
				enabled: oauthClients.enabled,
				firstParty: oauthClients.firstParty,
				allowLoopbackRedirects: oauthClients.allowLoopbackRedirects,
				allowedScopes: oauthClients.allowedScopes,
				accessTokenAudience: oauthClients.accessTokenAudience,
				createdAt: oauthClients.createdAt,
				lastUsedAt: oauthClients.lastUsedAt,
			})
			.from(oauthClients)
			.limit(limit)
			.offset(offset);
	}
}
