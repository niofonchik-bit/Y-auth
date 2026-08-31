import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';

const config = loadConfig();
const { db, sql } = createDatabase(config, true);

try {
  await migrate(db, { migrationsFolder: './migrations' });
  process.stdout.write('Migrations completed successfully.\n');
} finally {
  await sql.end({ timeout: 5 });
}
