import { defineConfig } from 'vite';

export default defineConfig({
  root: 'tests/e2e/fixture',
  server: { port: 5173, host: '127.0.0.1' },
});
