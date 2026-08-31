import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { AppConfig } from '../config/env.js';
import * as schema from './schema.js';

export function createDatabase(config: AppConfig, direct = false) {
	const sql = postgres(direct ? config.DATABASE_DIRECT_URL : config.DATABASE_URL, {
		prepare: false,
		max: direct ? 1 : 4,
		idle_timeout: 20,
		connect_timeout: 10,
	});

	return {
		db: drizzle(sql, { schema }),
		sql,
	};
}

export type Database = ReturnType<typeof createDatabase>['db'];
