import { defineConfig } from '@playwright/test';

const label = process.env.LAYOUT_ARTIFACT_LABEL || 'after';
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Invalid LAYOUT_ARTIFACT_LABEL');

export default defineConfig({
  testDir: './tests/layout',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  outputDir: `test-results/layout/${label}`,
  reporter: [['list'], ['json', { outputFile: `test-results/layout/${label}/results.json` }]],
  use: {
    baseURL: 'http://127.0.0.1:3124',
    browserName: 'chromium',
    serviceWorkers: 'block',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [1440, 1280, 1024, 768, 390].flatMap(width =>
    (['light', 'dark'] as const).map(colorScheme => ({
      name: `${width}-${colorScheme}`,
      use: { viewport: { width, height: 1000 }, colorScheme },
    })),
  ),
  webServer: {
    command: 'node tests/layout/start-local.mjs',
    url: 'http://127.0.0.1:3124/blog/news-20261003-01',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
