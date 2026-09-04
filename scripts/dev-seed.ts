import { loadConfig } from '../src/config/env.js';

const config = loadConfig();
if (config.NODE_ENV === 'production' || config.APP_ENVIRONMENT !== 'development')
	throw new Error('dev:seed is restricted to an explicit development environment');
process.stdout.write('Development seeding is intentionally separate from migrations. Use E2E seed for the small deterministic fixture.\n');
