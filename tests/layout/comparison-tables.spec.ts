import { test, expect } from './layout-test';

test('mobile comparison tables scroll internally while two-column tables stay fitted', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/blog/news-20261003-01');
  // Test-only synthetic cells inside the real compiled reading surface. Keep the
  // original stress fixture byte-identical for historical capture provenance.
  await page.locator('.blog-content').evaluate(root => {
    const region = (columns: string[]) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'reading-table-scroll';
      wrapper.tabIndex = 0;
      const table = document.createElement('table');
      const head = table.createTHead().insertRow();
      for (const text of columns) { const th = document.createElement('th'); th.textContent = text; head.append(th); }
      const row = table.createTBody().insertRow();
      for (const text of columns) row.insertCell().textContent = text + ' 확인 내용';
      wrapper.append(table); root.append(wrapper);
    };
    region(['비교항목', '종전 기준', '개정 기준', '실무 확인']);
    region(['두열항목', '내용']);
  });
  const four = page.locator('.reading-table-scroll').filter({ has: page.getByRole('columnheader', { name: '비교항목', exact: true }) });
  const two = page.locator('.reading-table-scroll').filter({ has: page.getByRole('columnheader', { name: '두열항목', exact: true }) });
  await expect(four).toHaveAttribute('tabindex', '0');
  expect(await four.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await four.locator('table').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(560);
  expect(await two.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await four.focus();
  await page.keyboard.press('ArrowRight');
  expect(await four.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1024, height: 900 });
  expect(await four.locator('table').evaluate(el => getComputedStyle(el).minInlineSize)).toBe('0px');
});
