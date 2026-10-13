import { test, expect } from '@playwright/test';
const response = (question: string) => ({ faqs: [{ id: 999, unified_category: '연차유급휴가', question, answer: 'Synthetic answer' }], total: 1 });
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
});
test('late earlier FAQ response cannot replace the latest search result', async ({ page }) => {
  let releaseOld!: () => Promise<void>;
  let oldStarted!: () => void;
  const started = new Promise<void>(resolve => oldStarted = resolve);
  await page.route('**/api/faq?*', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'old') { releaseOld = () => route.fulfill({ json: response('Old result') }); oldStarted(); }
    else await route.fulfill({ json: response('Latest result') });
  });
  await page.goto('/faq');
  await page.locator('input').first().fill('old'); await started;
  await page.locator('input').first().fill('new');
  await expect(page.getByRole('button', { name: 'Latest result' })).toBeVisible();
  const completed = page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === 'old');
  await releaseOld(); await (await completed).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole('button', { name: 'Latest result' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Old result' })).toHaveCount(0);
});
test('category change cancels pending search for the former category', async ({ page }) => {
  const categories: (string | null)[] = [];
  await page.route('**/api/faq?*', async route => {
    categories.push(new URL(route.request().url()).searchParams.get('category'));
    await route.fulfill({ json: response('All category result') });
  });
  await page.goto('/faq/' + encodeURIComponent('연차유급휴가'));
  await page.locator('input').first().fill('new');
  await page.getByRole('button', { name: '전체', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'All category result' })).toBeVisible();
  await page.waitForTimeout(650); // Cross the 400ms debounce deadline for the previous category.
  expect(categories).toEqual([null]);
});
