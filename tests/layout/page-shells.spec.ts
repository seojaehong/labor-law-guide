import { test, expect } from './layout-test';
const captureOnly = process.env.LAYOUT_CAPTURE_ONLY === '1';
const pages = [
  { url: '/decisions', shell: '.layout-list' },
  { url: '/blog', shell: '.layout-list' },
  { url: '/contact', shell: '.layout-tool' },
  { url: '/subsidy', shell: '.layout-tool' },
  { url: '/tools/contract-check', shell: '.layout-tool' },
  { url: '/stats', shell: '.layout-tool' },
];
for (const { url, shell } of pages) {
  test(`${url}: responsive shell and no horizontal page overflow`, async ({ page, blockedApiRequests }, testInfo) => {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await page.evaluate(async () => { await document.fonts.ready; });
    const size = await page.evaluate(() => ({ width: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    await testInfo.attach('page-width', { body: JSON.stringify({ url, ...size }), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`${url.replaceAll('/', '-')}.png`), fullPage: true, animations: 'disabled' });
    expect(blockedApiRequests).toEqual([]);
    if (!captureOnly) {
      await expect(page.locator(shell).first()).toBeVisible();
      expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1);
    }
  });
}
