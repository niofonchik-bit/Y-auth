import { defineConfig } from '@playwright/test';

const webServer =
  process.env.E2E_EXTERNAL === 'true'
    ? {}
    : {
        webServer: [
          {
            command: 'npm run dev',
            port: 3000,
            reuseExistingServer: !process.env.CI,
          },
          {
            command: 'npm run test:e2e:fixture',
            port: 5173,
            reuseExistingServer: !process.env.CI,
          },
        ],
      };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_TEST_APP_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  ...webServer,
});
