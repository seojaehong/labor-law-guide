import { defineConfig } from '@playwright/test';

// Isolated regression suite: no live Supabase account or paid API keys required.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'laws-url-state.spec.ts',
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3129',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --webpack --hostname 127.0.0.1 -p 3129',
    url: 'http://127.0.0.1:3129/laws',
    reuseExistingServer: false,
    timeout: 240000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      RESEND_API_KEY: '',
    },
  },
});
