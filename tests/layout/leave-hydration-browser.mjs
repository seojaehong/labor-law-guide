import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Run against the production fixture or an authorized Preview; never suppress React errors.
const base = process.env.LEAVE_QA_URL || 'http://127.0.0.1:3126';
const evidence = 'docs/design-visuals/annual-leave-20261005';
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || 'C:/Users/iceam/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const errors = [], checks = [];
try {
  for (const [timezoneId, locale] of [['UTC', 'ko-KR'], ['Asia/Seoul', 'ko-KR'], ['America/Los_Angeles', 'en-US']]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId, locale, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin || url.pathname.startsWith('/api/')) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ url: page.url(), timezoneId, locale, message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|server rendered|#418/i.test(message.text())) errors.push({ url: page.url(), timezoneId, locale, message: message.text() });
    });
    for (let cycle = 0; cycle < 8; cycle++) {
      for (const route of ['/tools', '/tools/leave', '/tools/leave/advanced', '/tools/leave/settlement']) {
        assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
        const before = await page.locator('#site-main').innerText();
        const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        await page.getByRole('button', { name: wasDark ? '라이트 모드로 전환' : '다크 모드로 전환', exact: true }).click();
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), !wasDark);
        assert.equal(await page.locator('#site-main').innerText(), before);
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), !wasDark);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        checks.push({ timezoneId, locale, cycle, route, themeToggle: true, reloadTheme: true, overflow: false });
      }
    }
    await page.goto(base + '/tools/leave', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.setItem('work-patterns.leave.workspaces.v1', JSON.stringify([{ id: 'qa', name: '합성검증사업장', kind: 'own', remember: false }]));
      localStorage.setItem('work-patterns.leave.workspace.active.v1', JSON.stringify('qa'));
      localStorage.setItem('work-patterns.leave.audience.v1', JSON.stringify('employer'));
      sessionStorage.setItem('work-patterns.leave.members.v1:qa', JSON.stringify([{ name: '합성직원', hireDate: '2023-10-05' }]));
    });
    await page.reload({ waitUntil: 'networkidle' });
    const input = page.getByLabel('이름과 입사일 붙여넣기');
    assert.equal(await input.inputValue(), '합성직원\t2023-10-05');
    const draft = '합성직원\t2023-10-05\t16';
    await input.fill(draft);
    for (let cycle = 0; cycle < 6; cycle++) {
      await page.locator('.editorial-nav-controls button').first().click();
      assert.equal(await input.inputValue(), draft);
      assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('work-patterns.leave.members.v1:qa'))[0].name), '합성직원');
    }
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await input.inputValue(), '합성직원\t2023-10-05'); // Roster stores names/hire dates, not ledger amounts.
    checks.push({ timezoneId, locale, liveInputAcrossThemeToggles: true, sessionRosterAcrossReload: true });
    if (timezoneId === 'UTC') {
      await page.screenshot({ path: `${evidence}/calculator-hydration-fixed-390.png` });
      await page.goto(base + '/tools/leave/advanced', { waitUntil: 'networkidle' });
      await page.getByLabel('연차 사용기간 종료일').fill('2026-12-31');
      await page.screenshot({ path: `${evidence}/promotion-hydration-fixed-390.png` });
    }
    await context.close();
  }
  fs.writeFileSync(`${evidence}/hydration-regression.json`, JSON.stringify({ base, checks, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log(`Hydration regression passed: ${checks.length} scenarios, 192 document loads, 3 timezone/locale combinations, zero React errors.`);
} finally {
  await browser.close();
}
