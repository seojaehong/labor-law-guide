import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:3123' },
  webServer: {
    command: 'npm run dev -- -p 3123',
    url: 'http://localhost:3123',
    reuseExistingServer: true,
    timeout: 180000,
  },
});
