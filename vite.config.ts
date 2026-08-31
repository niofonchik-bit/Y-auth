import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
      '/oauth': 'http://localhost:3000',
      '/interaction': 'http://localhost:3000',
      '/.well-known': 'http://localhost:3000',
    },
  },
});
