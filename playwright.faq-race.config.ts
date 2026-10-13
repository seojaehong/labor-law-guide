import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/layout',testMatch:'faq-race.spec.ts',workers:1,reporter:[['list'],['json',{outputFile:'docs/design-visuals/faq-race-results.json'}]],use:{baseURL:'http://127.0.0.1:3126',viewport:{width:390,height:844},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}}});
