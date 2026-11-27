import { expect, test, type Page } from '@playwright/test';

// 퇴사 점검표(/exit) 「확인용 추정」 — 261126 재홍님 결정 E3. 합성 값만. 바깥 요청은 막는다.
// 「재직 중 1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적이 있다」를 켜면 퇴직금은 엔진 문장으로 멈추고,
// 계산기 링크(?weeklyHours=40&hoursChanged=1)를 누르면 계산기가 체크가 켜진 채 열린다.

const LABEL = '재직 중 1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적이 있다';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
});

async function fill(page: Page) {
  // 수화(hydration) 전에 넣으면 ?last= 복원 효과가 마지막 근무일을 비운다 — verify-llg 와 같이 networkidle 까지 기다린다
  await page.goto('/exit', { waitUntil: 'networkidle' });
  const form = page.locator('section[aria-label="입력"]');
  await form.locator('input[type=date]').nth(0).fill('2025-12-31');
  await form.locator('input[type=date]').nth(1).fill('2023-01-01');
  await form.locator('input[inputmode=numeric]').fill('3000000');
  await form.locator('input[inputmode=decimal]').first().fill('40');
  const card = page.locator('section[aria-label="확인용 추정"]');
  await expect(card).toContainText('8,812,389원');
  return { form, card };
}

test('켜면 퇴직금은 엔진 문장으로 멈추고 금액을 보이지 않는다 — 끄면 돌아온다', async ({ page }) => {
  const { form, card } = await fill(page);
  const box = form.getByLabel(LABEL);
  await box.check();
  await expect(card).toContainText('이 계산기로 계산하지 않습니다');
  await expect(card).toContainText('퇴직연금복지과-5254');
  await expect(card).toContainText('계산하지 않음');
  await expect(card).not.toContainText('8,812,389원');
  await expect(card).not.toContainText('4주 평균 주 15시간');
  await box.uncheck();
  await expect(card).toContainText('8,812,389원');
  await expect(card).toContainText('4주 평균 주 15시간 이상');
});

test('계산기 링크는 hoursChanged=1 을 싣고, 누르면 계산기가 체크가 켜진 채 열린다', async ({ page }) => {
  const { form, card } = await fill(page);
  await form.getByLabel(LABEL).check();
  const link = card.getByRole('link', { name: '퇴직금 계산기 열기' });
  await expect(link).toHaveAttribute('href', '/tools/severance.html?weeklyHours=40&hoursChanged=1');
  await link.click();
  await expect(page).toHaveURL(/\/tools\/severance\.html\?weeklyHours=40&hoursChanged=1$/);
  await expect(page.locator('#hoursChanged')).toBeChecked();
  await expect(page.locator('#weeklyHours')).toHaveValue('40');
});

test('체크 칸은 390 폭에서도 가로로 넘치지 않고 누를 곳이 44px 이상이다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/exit');
  const label = page.locator('label.ex-check');
  const box = await label.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
