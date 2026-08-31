import { buildApp } from './app.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.fatal({ err: error }, 'Y.auth failed to start');
  process.exitCode = 1;
}
