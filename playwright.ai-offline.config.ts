import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', testMatch: 'ai-sanction-offline.spec.ts', timeout: 45000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3188', launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: {
    command: 'node scripts/testing/offline-dev.cjs',
    url: 'http://127.0.0.1:3188/sanction', reuseExistingServer: false, timeout: 120000,
    env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-placeholder', SUPABASE_SERVICE_ROLE_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '' },
  },
});
