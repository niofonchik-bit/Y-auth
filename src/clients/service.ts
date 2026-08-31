import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { oauthClientPostLogoutRedirectUris, oauthClientRedirectUris, oauthClients, oidcRecords } from '../db/schema.js';
import { hashClientSecret, randomToken } from '../security/crypto.js';
import { validateRedirectUri } from '../security/uri.js';
import { AppError } from '../shared/errors.js';

export interface ClientInput {
	name: string;
	type: 'public' | 'confidential';
	firstParty: boolean;
	redirectUris: string[];
	postLogoutRedirectUris: string[];
	allowedScopes: string[];
	accessTokenAudience?: string;
	registrationEnabledOverride?: boolean | null;
	minPasswordLengthOverride?: number | null;
}

export interface CreatedClient {
	clientId: string;
	clientSecret: string | null;
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
	constructor(
		private readonly db: Database,
		private readonly production: boolean,
	) {}

	private validate(input: ClientInput): void {
		if (!input.name.trim()) throw new AppError(400, 'CLIENT_NAME_REQUIRED', 'Client name is required');
		if (input.redirectUris.length === 0) {
			throw new AppError(400, 'REDIRECT_URI_REQUIRED', 'At least one redirect URI is required');
		}
		for (const uri of [...input.redirectUris, ...input.postLogoutRedirectUris]) {
			const error = validateRedirectUri(uri, this.production);
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

	async create(input: ClientInput): Promise<CreatedClient> {
		this.validate(input);
		const id = randomUUID();
		const clientId = `ya_${randomToken(18)}`;
		const clientSecret = input.type === 'confidential' ? randomToken(48) : null;
		const secretHash = clientSecret ? hashClientSecret(clientSecret) : null;
		const audience = input.accessTokenAudience?.trim() || `urn:y-auth:client:${clientId}`;

		await this.db.transaction(async (tx) => {
			await tx.insert(oauthClients).values({
				id,
				clientId,
				name: input.name.trim(),
				type: input.type,
				firstParty: input.firstParty,
				allowedScopes: input.allowedScopes,
				grantTypes: ['authorization_code', 'refresh_token'],
				responseTypes: ['code'],
				accessTokenAudience: audience,
				clientSecretHash: secretHash,
				registrationEnabledOverride: input.registrationEnabledOverride ?? null,
				minPasswordLengthOverride: input.minPasswordLengthOverride ?? null,
			});
			await tx.insert(oauthClientRedirectUris).values(input.redirectUris.map((uri) => ({ clientId: id, uri })));
			if (input.postLogoutRedirectUris.length > 0) {
				await tx.insert(oauthClientPostLogoutRedirectUris).values(
					input.postLogoutRedirectUris.map((uri) => ({
						clientId: id,
						uri,
					})),
				);
			}
			await tx.insert(oidcRecords).values({
				model: 'Client',
				id: clientId,
				payload: clientMetadata(id, clientId, { ...input, accessTokenAudience: audience }, secretHash),
			});
		});

		return { clientId, clientSecret };
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
			name: client.name,
			type: client.type,
			firstParty: client.firstParty,
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
				name: oauthClients.name,
				type: oauthClients.type,
				enabled: oauthClients.enabled,
				firstParty: oauthClients.firstParty,
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
