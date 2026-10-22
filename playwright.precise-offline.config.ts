import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', testMatch: 'laws-precise-offline.spec.ts', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3189', launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: { command: 'node scripts/testing/precise-offline-dev.cjs', url: 'http://127.0.0.1:3189/laws', timeout: 120000, reuseExistingServer: false },
});
