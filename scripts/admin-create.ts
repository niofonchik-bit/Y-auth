import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { normalizeEmail } from '../src/auth/service.js';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { passwordCredentials, users } from '../src/db/schema.js';
import { hashPassword, MAX_PASSWORD_LENGTH, validatePassword } from '../src/security/password.js';

async function hiddenPrompt(label: string): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode)
    throw new Error('A TTY is required for secure password input');
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';
  return new Promise((resolve, reject) => {
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
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

const config = loadConfig();
const { db, sql } = createDatabase(config, true);
const readline = createInterface({ input: stdin, output: stdout });

try {
  const email = (await readline.question('Admin email: ')).trim();
  const normalizedEmail = normalizeEmail(email);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.normalizedEmail, normalizedEmail))
    .limit(1);
  if (existing) {
    const confirmation = (
      await readline.question(`Promote ${existing.email} to administrator? Type YES: `)
    ).trim();
    if (confirmation !== 'YES') throw new Error('Promotion cancelled');
    await db
      .update(users)
      .set({ isAdmin: true, updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    stdout.write('Existing user promoted to administrator.\n');
  } else {
    readline.pause();
    const password = await hiddenPrompt('Admin password: ');
    const confirmation = await hiddenPrompt('Repeat password: ');
    if (password !== confirmation) throw new Error('Passwords do not match');
    const error = validatePassword(password, { minLength: 6, maxLength: MAX_PASSWORD_LENGTH });
    if (error) throw new Error(error);
    const passwordHash = await hashPassword(password, config);
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email, normalizedEmail, isAdmin: true })
        .returning({ id: users.id });
      if (!user) throw new Error('User insert failed');
      await tx.insert(passwordCredentials).values({ userId: user.id, passwordHash });
    });
    stdout.write('Administrator created.\n');
  }
} finally {
  readline.close();
  await sql.end({ timeout: 5 });
}
