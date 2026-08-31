import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { Database } from '../db/client.js';
import { oidcRecords, userSessions, users } from '../db/schema.js';

export function createPostgresAdapter(db: Database) {
	return class PostgresOidcAdapter implements Adapter {
		constructor(private readonly model: string) {}

		async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
			if (typeof payload.sessionUid === 'string') {
				const [session] = await db
					.select({ revokedAt: userSessions.revokedAt })
					.from(userSessions)
					.where(eq(userSessions.oidcUid, payload.sessionUid))
					.limit(1);
				if (session?.revokedAt) throw new Error('Cannot issue an artifact for a revoked session');
			}
			if (
				typeof payload.accountId === 'string' &&
				(this.model === 'AuthorizationCode' || this.model === 'AccessToken' || this.model === 'RefreshToken')
			) {
				const [user] = await db.select({ status: users.status }).from(users).where(eq(users.id, payload.accountId)).limit(1);
				if (user?.status === 'deactivated') throw new Error('Cannot issue an artifact for a deactivated user');
			}
			const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null;
			const record = {
				model: this.model,
				id,
				payload: { ...payload },
				grantId: payload.grantId ?? null,
				userCode: payload.userCode ?? null,
				uid: payload.uid ?? null,
				expiresAt,
				consumedAt: null,
			};
			await db
				.insert(oidcRecords)
				.values(record)
				.onConflictDoUpdate({
					target: [oidcRecords.model, oidcRecords.id],
					set: record,
				});
		}

		async find(id: string): Promise<AdapterPayload | undefined> {
			const [record] = await db
				.select()
				.from(oidcRecords)
				.where(
					and(
						eq(oidcRecords.model, this.model),
						eq(oidcRecords.id, id),
						or(isNull(oidcRecords.expiresAt), gt(oidcRecords.expiresAt, new Date())),
					),
				)
				.limit(1);
			if (!record || (this.model === 'Client' && record.payload.y_auth_enabled === false)) return undefined;
			return record.consumedAt
				? {
						...record.payload,
						consumed: Math.floor(record.consumedAt.getTime() / 1_000),
					}
				: record.payload;
		}

		async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
			return this.findBy('userCode', userCode);
		}

		async findByUid(uid: string): Promise<AdapterPayload | undefined> {
			return this.findBy('uid', uid);
		}

		private async findBy(field: 'uid' | 'userCode', value: string): Promise<AdapterPayload | undefined> {
			const column = field === 'uid' ? oidcRecords.uid : oidcRecords.userCode;
			const [record] = await db
				.select()
				.from(oidcRecords)
				.where(
					and(
						eq(oidcRecords.model, this.model),
						eq(column, value),
						or(isNull(oidcRecords.expiresAt), gt(oidcRecords.expiresAt, new Date())),
					),
				)
				.limit(1);
			if (!record) return undefined;
			return record.consumedAt
				? {
						...record.payload,
						consumed: Math.floor(record.consumedAt.getTime() / 1_000),
					}
				: record.payload;
		}

		async consume(id: string): Promise<void> {
			await db
				.update(oidcRecords)
				.set({ consumedAt: new Date() })
				.where(and(eq(oidcRecords.model, this.model), eq(oidcRecords.id, id)));
		}

		async destroy(id: string): Promise<void> {
			await db.delete(oidcRecords).where(and(eq(oidcRecords.model, this.model), eq(oidcRecords.id, id)));
		}

		async revokeByGrantId(grantId: string): Promise<void> {
			await db.delete(oidcRecords).where(eq(oidcRecords.grantId, grantId));
		}
	};
}
