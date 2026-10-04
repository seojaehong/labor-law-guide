import { test, expect } from './layout-test';

test('contact inputs have names and mobile-sized targets without submitting', async ({ page }) => {
  await page.goto('/contact');
  for (const label of ['이름 *', '연락처 *', '이메일 (자동 회신용)', '문의 유형', '문의 내용 *']) {
    const control = page.getByLabel(label, { exact: true });
    await expect(control).toBeVisible();
    const metrics = await control.evaluate(el => ({ height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize) }));
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.font).toBeGreaterThanOrEqual(16);
  }
  await expect(page.getByLabel('연락처 *', { exact: true })).toHaveAttribute('type', 'tel');
});
