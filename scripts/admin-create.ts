import { loadEnvFile, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import { normalizeEmail } from '../src/auth/service.js';
import { passwordCredentials, users } from '../src/db/schema.js';
import { hashPassword, MAX_PASSWORD_LENGTH, validatePassword } from '../src/security/password.js';

const ARGON2_MEMORY_KIB_MIN = 19_456;
const ARGON2_ITERATIONS_MIN = 2;
const ARGON2_PARALLELISM_MIN = 1;

const environmentSchema = z.object({
	DATABASE_DIRECT_URL: z.string().min(1),

	ADMIN_EMAIL: z.string().email().optional(),
	ADMIN_PASSWORD: z.string().optional(),

	ARGON2_MEMORY_KIB: z.coerce.number().int().positive().default(ARGON2_MEMORY_KIB_MIN),
	ARGON2_ITERATIONS: z.coerce.number().int().positive().default(ARGON2_ITERATIONS_MIN),
	ARGON2_PARALLELISM: z.coerce.number().int().positive().default(ARGON2_PARALLELISM_MIN),
});

function loadEnvironment(): z.infer<typeof environmentSchema> {
	try {
		loadEnvFile('.env');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}

	const environment = environmentSchema.parse(process.env);

	if (
		environment.ARGON2_MEMORY_KIB < ARGON2_MEMORY_KIB_MIN ||
		environment.ARGON2_ITERATIONS < ARGON2_ITERATIONS_MIN ||
		environment.ARGON2_PARALLELISM < ARGON2_PARALLELISM_MIN
	) {
		throw new Error('Argon2id parameters are below the built-in security floor');
	}

	return environment;
}

async function hiddenPrompt(label: string): Promise<string> {
	if (!stdin.isTTY || !stdin.setRawMode) {
		throw new Error('A TTY is required for secure password input');
	}

	stdout.write(label);
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding('utf8');

	let value = '';

	return new Promise((resolve, reject) => {
		const cleanup = () => {
			stdin.off('data', onData);
			stdin.setRawMode(false);
			stdin.pause();
		};

		const onData = (chunk: string) => {
			for (const character of chunk) {
				if (character === '\u0003') {
					cleanup();
					reject(new Error('Cancelled'));
					return;
				}

				if (character === '\r' || character === '\n') {
					cleanup();
					stdout.write('\n');
					resolve(value);
					return;
				}

				if (character === '\u007f' || character === '\b') {
					value = value.slice(0, -1);
				} else {
					value += character;
				}
			}
		};

		stdin.on('data', onData);
	});
}

async function getCredentials(environment: ReturnType<typeof loadEnvironment>): Promise<{ email: string; password: string | null }> {
	if (environment.ADMIN_EMAIL || environment.ADMIN_PASSWORD) {
		if (!environment.ADMIN_EMAIL || !environment.ADMIN_PASSWORD) {
			throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be provided together');
		}

		return {
			email: environment.ADMIN_EMAIL.trim(),
			password: environment.ADMIN_PASSWORD,
		};
	}

	if (!stdin.isTTY) {
		throw new Error('Non-interactive execution requires ADMIN_EMAIL and ADMIN_PASSWORD');
	}

	const readline = createInterface({
		input: stdin,
		output: stdout,
	});

	try {
		const email = (await readline.question('Admin email: ')).trim();

		readline.pause();

		return {
			email,
			password: null,
		};
	} finally {
		readline.close();
	}
}

const environment = loadEnvironment();

const sql = postgres(environment.DATABASE_DIRECT_URL, {
	prepare: false,
	max: 1,
	idle_timeout: 20,
	connect_timeout: 10,
});

const db = drizzle(sql);

try {
	const credentials = await getCredentials(environment);
	const normalizedEmail = normalizeEmail(credentials.email);

	const [existing] = await db.select().from(users).where(eq(users.normalizedEmail, normalizedEmail)).limit(1);

	if (existing) {
		if (!environment.ADMIN_EMAIL) {
			const readline = createInterface({
				input: stdin,
				output: stdout,
			});

			try {
				const confirmation = (await readline.question(`Promote ${existing.email} to administrator? Type YES: `)).trim();

				if (confirmation !== 'YES') {
					throw new Error('Promotion cancelled');
				}
			} finally {
				readline.close();
			}
		}

		await db
			.update(users)
			.set({
				isAdmin: true,
				updatedAt: new Date(),
			})
			.where(eq(users.id, existing.id));

		stdout.write('Existing user promoted to administrator.\n');
	} else {
		let password = credentials.password;

		if (!password) {
			password = await hiddenPrompt('Admin password: ');
			const confirmation = await hiddenPrompt('Repeat password: ');

			if (password !== confirmation) {
				throw new Error('Passwords do not match');
			}
		}

		const error = validatePassword(password, {
			minLength: 6,
			maxLength: MAX_PASSWORD_LENGTH,
		});

		if (error) {
			throw new Error(error);
		}

		const passwordHash = await hashPassword(password, {
			ARGON2_MEMORY_KIB: environment.ARGON2_MEMORY_KIB,
			ARGON2_ITERATIONS: environment.ARGON2_ITERATIONS,
			ARGON2_PARALLELISM: environment.ARGON2_PARALLELISM,
		});

		await db.transaction(async (tx) => {
			const [user] = await tx
				.insert(users)
				.values({
					email: credentials.email,
					normalizedEmail,
					isAdmin: true,
				})
				.returning({ id: users.id });

			if (!user) {
				throw new Error('User insert failed');
			}

			await tx.insert(passwordCredentials).values({
				userId: user.id,
				passwordHash,
			});
		});

		stdout.write('Administrator created.\n');
	}
} finally {
	await sql.end({ timeout: 5 });
}
