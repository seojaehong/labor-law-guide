import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const fontMode = process.env.LAYOUT_FONT_MODE === 'fallback' ? 'fallback' : 'primary';
const fontCssUrl = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css';
const fontPath = '/__layout-fixture__/PretendardVariable.woff2';
const localFont = readFileSync('node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2');

export const test = base.extend<{ blockedApiRequests: string[] }>({
  blockedApiRequests: async ({ context, baseURL }, provideFixture) => {
    const blocked: string[] = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      // Fulfill the exact production font stylesheet with the installed package.
      // No request reaches the CDN; the font binary also comes from local disk.
      if (url.href === fontCssUrl && fontMode === 'primary') {
        return route.fulfill({ contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: `@font-face{font-family:'Pretendard Variable';font-style:normal;font-weight:45 920;font-display:swap;src:url('${baseURL}${fontPath}') format('woff2');}` });
      }
      if (url.origin === new URL(baseURL!).origin && url.pathname === fontPath && fontMode === 'primary') {
        return route.fulfill({ contentType: 'font/woff2', body: localFont });
      }
      // Fail closed: no browser API, provider, analytics or remote requests.
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        blocked.push(`${route.request().method()} ${url.pathname}`);
        return route.abort('blockedbyclient');
      }
      if (url.origin !== new URL(baseURL!).origin) return route.abort('blockedbyclient');
      return route.continue();
    });
    await provideFixture(blocked);
  },
  page: async ({ page, blockedApiRequests, colorScheme }, provideFixture) => {
    // Referencing the fixture installs the request guard before any navigation.
    void blockedApiRequests;
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      document.documentElement?.classList.toggle('dark', theme === 'dark');
    }, colorScheme === 'dark' ? 'dark' : 'light');
    await provideFixture(page);
  },
});
export { expect };
