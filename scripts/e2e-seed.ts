import { eq } from 'drizzle-orm';
import { ClientService } from '../src/clients/service.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { passwordCredentials, users } from '../src/db/schema.js';
import { hashPassword } from '../src/security/password.js';

if (process.env.NODE_ENV === 'production') throw new Error('E2E seed cannot run in production');

const config = loadConfig();
const { db, sql } = createDatabase(config, true);
const clients = new ClientService(db);
const origin = process.env.E2E_TEST_APP_URL ?? 'http://localhost:5173';
const definitions = [
	['A', 'project-a'],
	['B', 'project-b'],
	['C', 'project-c'],
] as const;

try {
	for (const [label, key] of definitions) {
		const created = await clients.create({
			projectKey: `e2e-${key}`,
			name: `Y.auth Test — Project ${label}`,
			type: 'public',
			firstParty: true,
			allowLoopbackRedirects: true,
			redirectUris: [`${origin}/callback/${key}`],
			postLogoutRedirectUris: [`${origin}/`],
			allowedScopes: ['openid', 'profile', 'email', 'offline_access', 'y_auth.sessions'],
		});
		process.stdout.write(`VITE_CLIENT_${label}_ID=${created.clientId}\n`);
	}

	const adminEmail = 'e2e-admin@example.com';
	const adminPassword = '123456';
	const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, adminEmail)).limit(1);
	if (!existing) {
		const [admin] = await db
			.insert(users)
			.values({
				email: adminEmail,
				normalizedEmail: adminEmail,
				displayName: 'E2E Admin',
				isAdmin: true,
			})
			.returning({ id: users.id });
		if (!admin) throw new Error('Admin seed failed');
		await db.insert(passwordCredentials).values({
			userId: admin.id,
			passwordHash: await hashPassword(adminPassword, config),
		});
	}
	process.stdout.write(`E2E_ADMIN_EMAIL=${adminEmail}\n`);
	process.stdout.write(`E2E_ADMIN_PASSWORD=${adminPassword}\n`);
} finally {
	await sql.end({ timeout: 5 });
}
