import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/decisions',testMatch:'decisions-*.spec.ts',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:3123',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{},},
  webServer:[
    {command:'node tests/fixtures/decisions-db.mjs',url:'http://127.0.0.1:4319/health',reuseExistingServer:false},
    {command:'npm run dev -- -p 3123 -H 127.0.0.1',url:'http://127.0.0.1:3123/decisions?reason=invalid',reuseExistingServer:false,timeout:180000,env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4319',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-fixture-only'}},
  ],
});
