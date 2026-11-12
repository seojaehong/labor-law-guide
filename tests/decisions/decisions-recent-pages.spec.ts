import { expect, test } from '@playwright/test';
// 허브 「최근 판정례·법원 판례」 쪽 넘기기(261112). 픽스처는 날짜 있는 사건 40건 → 1쪽 30건, 2쪽 10건.
const rows = 'main li a[href^="/decisions/fixture-"]';
test.beforeEach(async ({ request, context }) => {
  await context.route('**/*', route => { const url=new URL(route.request().url()); return ['127.0.0.1','localhost'].includes(url.hostname) && !url.pathname.startsWith('/api/') ? route.continue() : route.abort(); });
  await request.get('http://127.0.0.1:4319/control?fail=0');
});
test('hub recent list pages 30 at a time and keeps ?page= in the URL', async ({ page }) => {
  await page.goto('/decisions');
  await expect(page.locator(rows)).toHaveCount(30);
  const first = await page.locator(rows).evaluateAll(els => els.map(e => e.getAttribute('href')));
  const pager = page.getByRole('navigation', { name: '최근 판정례 페이지' });
  await expect(pager).toContainText('1 페이지');
  await pager.getByRole('link', { name: '다음 →', exact: true }).click();
  await expect(page).toHaveURL(/\/decisions\?page=2$/);
  await expect(page.locator(rows)).toHaveCount(10);
  const second = await page.locator(rows).evaluateAll(els => els.map(e => e.getAttribute('href')));
  expect(second.filter(x => first.includes(x))).toEqual([]);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, follow');
  await expect(pager).toContainText('2 페이지');
  await expect(pager.getByRole('link', { name: '다음 →', exact: true })).toHaveCount(0);
  await pager.getByRole('link', { name: '← 이전', exact: true }).click();
  await expect(page).toHaveURL(/\/decisions$/);
  await expect(page.locator(rows)).toHaveCount(30);
  await page.goto('/decisions?page=9');
  await expect(page.getByText('이 페이지에 결과가 없습니다.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/decisions?page=2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
