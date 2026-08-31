import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { loadEnvFile } from 'node:process';

try {
	loadEnvFile('.env');
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
		throw error;
	}
}

const databaseUrl = process.env.DATABASE_DIRECT_URL;

if (!databaseUrl) {
	throw new Error('DATABASE_DIRECT_URL is required');
}

const sql = postgres(databaseUrl, {
	prepare: false,
	max: 1,
	idle_timeout: 20,
	connect_timeout: 10,
});

const db = drizzle(sql);

try {
	await migrate(db, {
		migrationsFolder: './migrations',
	});

	process.stdout.write('Migrations completed successfully.\n');
} finally {
	await sql.end({ timeout: 5 });
}
