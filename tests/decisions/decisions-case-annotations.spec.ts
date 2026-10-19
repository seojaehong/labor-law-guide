import { expect, test } from '@playwright/test';

for (const depth of [0, 1, 2]) {
  test(`case references preserve legal text and keep markup inert at encoding depth ${depth}`, async ({ page }) => {
    await page.request.get('http://127.0.0.1:4319/control?fail=0');
    await page.goto(`/cases/ilabor_annotation_${depth}`);
    await expect(page.getByRole('heading', { name: '법령 인용 회귀 검증', exact: true })).toBeVisible();
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: '참조 법령', exact: true }) });
    await expect(section).toContainText('근로기준법 제23조 제1항');
    await expect(section).not.toContainText('law_cite');
    await expect(section).toContainText('<script>window.__annotationExecuted=true</script>');
    await expect(section.locator('script, law_cite, a')).toHaveCount(0);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', '요약 근로기준법 제23조');
    expect(await page.evaluate(() => Reflect.get(window, '__annotationExecuted'))).toBeUndefined();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(section).toBeVisible();
  });
}
