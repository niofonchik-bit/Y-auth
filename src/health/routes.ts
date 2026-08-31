import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';

export async function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: { db: Database; redisPing: () => Promise<boolean> },
) {
  app.get('/health/live', async () => ({ status: 'live' }));

  app.get('/health/ready', async (_request, reply) => {
    const [postgres, redis] = await Promise.all([
      dependencies.db
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false),
      dependencies.redisPing(),
    ]);
    const ready = postgres && redis;
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'degraded',
      checks: { postgres: postgres ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    });
  });
}
