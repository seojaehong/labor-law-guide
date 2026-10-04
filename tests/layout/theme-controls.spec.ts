import { test, expect } from './layout-test';

test('desktop and mobile theme controls share state across the navigation breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/');
  await expect(page.locator('nav button[aria-label$="모드로 전환"]')).toHaveCount(2);
  const dark = await page.locator('html').evaluate(el => el.classList.contains('dark'));
  await page.getByRole('button', { name: dark ? '라이트 모드로 전환' : '다크 모드로 전환', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  const mobile = page.getByRole('button', { name: dark ? '다크 모드로 전환' : '라이트 모드로 전환', exact: true });
  await expect(mobile).toBeVisible();
  await mobile.click();
  await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*\bdark\b)/);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('button', { name: dark ? '라이트 모드로 전환' : '다크 모드로 전환', exact: true })).toBeVisible();
});
