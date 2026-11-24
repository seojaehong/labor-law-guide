import { test, expect } from './layout-test';

// 261124 재홍님 결정 「도구 먼저」 — 390×844 첫 화면(스크롤 0) 안에 대표 도구 4개가 보여야 한다.
// 종전에는 검색 띠와 AI 지면이 위에 있어 도구 지면 제목이 y=880(첫 화면 밖)이었다.
// 고정 상단(로고 줄 + 탭 줄) 밑에 가리지 않고, 뷰포트 아래 끝을 넘지 않아야 「보인다」로 센다.
const REP = ['/tools/severance.html', '/tools/weekly-holiday-pay', '/tools/notice-pay', '/exit'];

test.describe('home first screen at 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('four representative tools sit inside the first screen', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
    const navBottom = await page.locator('nav.glass-nav').evaluate(el => el.getBoundingClientRect().bottom);
    for (const href of REP) {
      const link = page.locator(`#site-main a[href="${href}"]`).first();
      await expect(link, href).toBeVisible();
      const box = await link.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; });
      expect(box.top, `${href} top`).toBeGreaterThanOrEqual(navBottom);
      expect(box.bottom, `${href} bottom`).toBeLessThanOrEqual(844);
      expect(box.height, `${href} touch height`).toBeGreaterThanOrEqual(44);
    }
  });
});
