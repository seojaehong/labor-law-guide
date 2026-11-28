import { expect, test } from '@playwright/test';

// 육아기 근로시간 단축 급여·장려금 계산기 — 합성 값만. 바깥 요청은 막는다.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto('/tools/childcare-reduction');
});

const result = (page: import('@playwright/test').Page) => page.locator('section[aria-live]').first();

test('빈 화면은 금액 대신 더 알려 줄 사실을 보여 준다', async ({ page }) => {
  await expect(result(page)).toContainText('더 알려 주면 계산하는 것');
});

test('칸을 채우면 원 단위 금액이 나오고, 휴대폰 폭에서 계산 과정을 펼쳐도 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel(/^월 통상임금/).fill('3000000');
  await page.getByLabel('단축 전 1주 소정근로시간', { exact: true }).fill('40');
  await page.getByLabel('단축 후 1주 소정근로시간', { exact: true }).fill('24');
  await page.getByLabel('단축 시작일', { exact: true }).fill('2027-02-01');
  await page.getByLabel(/^단축 종료일/).fill('2027-07-31');
  await page.getByRole('group', { name: /우선지원대상기업입니까/ }).getByLabel('예', { exact: true }).check();
  await expect(result(page)).toContainText(/한 달 [\d,]+원/);
  await expect(result(page)).toContainText('사업주 장려금 월액');
  await page.getByText('계산 과정', { exact: true }).click();
  await expect(page.locator('table')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
