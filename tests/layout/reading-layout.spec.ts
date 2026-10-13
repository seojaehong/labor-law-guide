import { test, expect, fontMode } from './layout-test';
import { measureReading } from './measure-reading';

const captureOnly = process.env.LAYOUT_CAPTURE_ONLY === '1';
const readings = [
  { name: 'blog', url: '/blog/news-20261003-01', scope: '.blog-content', sidebar: true },
  { name: 'case', url: '/cases/layout-case', scope: 'article', sidebar: true },
  { name: 'interpretation', url: '/interpretations/layout-interpretation', scope: 'article', sidebar: true },
  { name: 'decision', url: '/decisions/layout-decision', scope: '#decision-summary', sidebar: false },
];
for (const reading of readings) {
  test(`${reading.name}: actual text lines, width, sidebar, overflow`, async ({ page, colorScheme, blockedApiRequests }, testInfo) => {
    const response = await page.goto(reading.url);
    expect(response?.status()).toBe(200);
    await expect(page.locator(reading.scope).first()).toBeVisible();
    await page.evaluate(async primary => {
      if (primary) await document.fonts.load('18px \"Pretendard Variable\"', '한글水');
      await document.fonts.ready;
    }, fontMode === 'primary');
    // ThemeToggle hydrates from the matching localStorage value set before load.
    await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /dark/ : /^(?!.*\bdark\b).*$/);
    const metrics = await measureReading(page, reading.scope);
    await testInfo.attach('rendered-line-measurements', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`${reading.name}.png`), fullPage: true, animations: 'disabled' });
    console.log(JSON.stringify({ test: testInfo.title, project: testInfo.project.name, metrics }));
    expect(blockedApiRequests, 'This read-only reading test must not attempt any API request').toEqual([]);
    expect(metrics.fontStatus).toBe('loaded');
    const primaryFaces = metrics.fontFaces.filter(face => face.family.replaceAll(/[\"']/g, '') === 'Pretendard Variable' && face.status === 'loaded');
    if (fontMode === 'primary') {
      expect(primaryFaces.length, 'Real local Pretendard font is loaded, not merely an idle FontFaceSet').toBeGreaterThan(0);
      expect(metrics.primaryFontAvailable).toBe(true);
    } else {
      expect(primaryFaces, 'Fallback probe intentionally blocks the primary font').toEqual([]);
    }
    for (const measurement of metrics.measures) expect(measurement.missing, `${measurement.prefix} fixture exists`).toBe(false);
    if (captureOnly) return; // Baseline captures old geometry, not an invented passing baseline.
    expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth + 1);
    expect(metrics.root.scrollWidth).toBeLessThanOrEqual(metrics.root.clientWidth + 1);
    for (const measurement of metrics.measures) {
      if (measurement.missing) continue;
      expect(measurement.fontSize).toBeGreaterThanOrEqual(17);
      expect(measurement.fontSize).toBeLessThanOrEqual(18.1);
      expect(measurement.lineHeight / measurement.fontSize).toBeGreaterThanOrEqual(1.75);
      expect(measurement.scrollWidth).toBeLessThanOrEqual(measurement.clientWidth + 1);
      expect(measurement.lineCount).toBeGreaterThan(3);
      if (metrics.viewport.width >= 768) {
        expect(measurement.rect.width).toBeGreaterThan(0);
        expect(measurement.rect.width).toBeLessThanOrEqual(metrics.main.width + 1);
        if (measurement.prefix === '전각한글측정') {
          expect(measurement.medianHangulPerCompleteLine).toBeGreaterThanOrEqual(32);
          expect(measurement.medianHangulPerCompleteLine).toBeLessThanOrEqual(40);
        }
      } else {
        expect(measurement.rect.width).toBeGreaterThan(0);
        expect(measurement.rect.width).toBeLessThan(metrics.viewport.width);
        if (measurement.prefix === '전각한글측정') {
          expect(measurement.medianHangulPerCompleteLine).toBeGreaterThanOrEqual(15);
          expect(measurement.medianHangulPerCompleteLine).toBeLessThanOrEqual(23);
        }
      }
    }
    if (reading.sidebar) {
      expect(metrics.sidebar).not.toBeNull();
      expect(metrics.sidebarContent).not.toBeNull();
      expect(metrics.sidebarContent?.position).toBe(metrics.viewport.width >= 1152 ? 'sticky' : 'static');
      if (metrics.sidebar && metrics.viewport.width >= 1152) {
        expect(metrics.sidebar.x).toBeGreaterThanOrEqual(metrics.main.right + 20);
        const cap = parseFloat(metrics.mainMaxInlineSize);
        expect(Number.isFinite(cap), 'Reading column has a resolved font-relative cap').toBe(true);
        expect(metrics.main.width).toBeCloseTo(cap, 0);
      } else if (metrics.sidebar) {
        expect(metrics.sidebar.y).toBeGreaterThanOrEqual(metrics.main.bottom - 1);
      }
    }
    if (reading.name === 'blog') {
      expect(metrics.tableScrollers.length).toBeGreaterThan(0);
      const wideTable = page.locator('.reading-table-scroll').filter({ hasText: '넓은 표 시작' });
      await expect(wideTable).toHaveCount(1);
      expect(await wideTable.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await wideTable.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => wideTable.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await expect(wideTable.getByText('첫 셀 확인')).toHaveCount(1);
      await expect(wideTable.getByText('마지막 셀 확인')).toHaveCount(1);
      for (const scroller of metrics.tableScrollers) {
        expect(scroller.overflowX).toBe('auto');
        expect(scroller.role).toBe('region');
        expect(scroller.tabindex).toBe('0');
      }
    }
  });
}

test('long-content overflow remains contained at 200% text sizing', async ({ page }, testInfo) => {
  await page.goto('/blog/news-20261003-01');
  await page.evaluate(async primary => {
    if (primary) await document.fonts.load('18px \"Pretendard Variable\"', '한글水');
    await document.fonts.ready;
    document.documentElement.style.fontSize = '200%';
  }, fontMode === 'primary');
  const metrics = await measureReading(page, '.blog-content');
  await testInfo.attach('text-size-200-percent', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('blog-text-200-percent.png'), fullPage: true, animations: 'disabled' });
  if (!captureOnly) expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth + 1);
});
