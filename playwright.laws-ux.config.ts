import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/e2e', testMatch: ['laws-selected-export.spec.ts', 'laws-url-state.spec.ts'], workers: 1, timeout: 60000,
 use: { baseURL: 'http://127.0.0.1:3137', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined },
 webServer: { command: 'npm run dev -- --webpack -H 127.0.0.1 -p 3137', url: 'http://127.0.0.1:3137/laws', timeout: 180000,
 env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-placeholder-not-a-secret' } }
});
