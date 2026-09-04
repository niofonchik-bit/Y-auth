import { and, eq, isNotNull, lt, or } from 'drizzle-orm';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { emailVerificationTokens, oidcRecords, passwordResetTokens, userSessions, users } from '../src/db/schema.js';

const config = loadConfig();
const { db, sql } = createDatabase(config, true);
const now = new Date();
const retention = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
try {
	const result = await db.transaction(async (tx) => ({
		passwordTokens: (
			await tx
				.delete(passwordResetTokens)
				.where(
					or(lt(passwordResetTokens.expiresAt, now), and(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.usedAt, retention))),
				)
				.returning({ id: passwordResetTokens.id })
		).length,
		verificationTokens: (
			await tx
				.delete(emailVerificationTokens)
				.where(
					or(
						lt(emailVerificationTokens.expiresAt, now),
						and(isNotNull(emailVerificationTokens.usedAt), lt(emailVerificationTokens.usedAt, retention)),
					),
				)
				.returning({ id: emailVerificationTokens.id })
		).length,
		sessions: (
			await tx
				.delete(userSessions)
				.where(
					or(lt(userSessions.absoluteExpiresAt, retention), and(isNotNull(userSessions.revokedAt), lt(userSessions.revokedAt, retention))),
				)
				.returning({ id: userSessions.id })
		).length,
		oidcRecords: (await tx.delete(oidcRecords).where(lt(oidcRecords.expiresAt, now)).returning({ id: oidcRecords.id })).length,
		users: (
			await tx
				.delete(users)
				.where(
					and(
						eq(users.status, 'deactivated'),
						isNotNull(users.deletionRequestedAt),
						isNotNull(users.purgeAfter),
						lt(users.purgeAfter, now),
					),
				)
				.returning({ id: users.id })
		).length,
	}));
	process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
	await sql.end({ timeout: 5 });
}
