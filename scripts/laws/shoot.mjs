// /laws 화면 점검 스크린샷 — 데스크톱(펼침)·모바일·다크. node scripts/laws/shoot.mjs [base]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3317';
const out = process.env.SHOT_DIR ?? '.';
const browser = await chromium.launch();
const errors = [];

async function page(opts) {
  const ctx = await browser.newContext({ ...opts, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return p;
}

// 데스크톱 — 첫 화면
const d = await page({ viewport: { width: 1360, height: 900 } });
await d.goto(`${base}/laws`, { waitUntil: 'networkidle' });
const navH = await d.evaluate(() => document.querySelector('nav.glass-nav')?.getBoundingClientRect().height);
await d.screenshot({ path: `${out}/laws_desktop_top.png` });

// 남녀고용평등법 11.27. 펼치기 → 취업규칙 상자·비교
await d.click('#\\30 00130-20261127 .lr-row');
await d.waitForSelector('#\\30 00130-20261127 .lr-artcard');
await d.locator('#\\30 00130-20261127').scrollIntoViewIfNeeded();
await d.evaluate(() => document.getElementById('000130-20261127').scrollIntoView({ block: 'start' }));
await d.evaluate(() => window.scrollBy(0, -140));
await d.screenshot({ path: `${out}/laws_desktop_open.png` });
// 난임치료휴가 조문으로
await d.evaluate(() => document.querySelector('[id="000130-20261127~0018031"]')?.scrollIntoView({ block: 'center' }));
await d.screenshot({ path: `${out}/laws_desktop_diff.png` });

// 신구대조 복사 → 클립보드 확인
await d.click('#\\30 00130-20261127 .lr-detail-bar .lr-btn:not(.lr-btn-ghost)');
const clip = await d.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e));

// 검색 / 키
await d.keyboard.press('/');
await d.keyboard.type('연차');
await d.waitForTimeout(300);
const hits = await d.locator('.lr-card').count();

// 내 취업규칙 점검 — 예시로 해보기
await d.keyboard.press('Escape');
await d.evaluate(() => window.scrollTo(0, 0));
await d.getByRole('button', { name: '내 취업규칙 붙여넣고 점검' }).click();
await d.getByRole('button', { name: '예시로 해보기' }).click();
await d.waitForSelector('.lr-verdict');
const verdicts = await d.locator('.lr-check-sum .n').allInnerTexts();
await d.screenshot({ path: `${out}/laws_check.png` });
await d.keyboard.press('Escape');

// 모바일
const m = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(`${base}/laws`, { waitUntil: 'networkidle' });
await m.screenshot({ path: `${out}/laws_mobile_top.png` });
await m.click('#\\30 01872-20261210 .lr-row');
await m.waitForSelector('#\\30 01872-20261210 .lr-artcard');
await m.evaluate(() => document.getElementById('001872-20261210').scrollIntoView({ block: 'start' }));
await m.evaluate(() => window.scrollBy(0, -150));
await m.screenshot({ path: `${out}/laws_mobile_open.png` });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// 다크
const k = await page({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
await k.addInitScript(() => localStorage.setItem('theme', 'dark'));
await k.goto(`${base}/laws`, { waitUntil: 'networkidle' });
await k.click('#\\30 01872-20261008 .lr-row');
await k.waitForSelector('#\\30 01872-20261008 .lr-artcard');
await k.evaluate(() => window.scrollTo(0, 520));
await k.screenshot({ path: `${out}/laws_dark.png` });

// 모바일 점검
await m.evaluate(() => window.scrollTo(0, 0));
await m.getByRole('button', { name: '내 취업규칙 붙여넣고 점검' }).click();
await m.getByRole('button', { name: '예시로 해보기' }).click();
await m.waitForSelector('.lr-verdict');
await m.evaluate(() => document.querySelector('.lr-check-out')?.scrollIntoView());
await m.screenshot({ path: `${out}/laws_mobile_check.png` });

console.log(JSON.stringify({ navH, hits, overflow, verdicts, clip: clip.slice(0, 160), errors: errors.slice(0, 8) }, null, 1));
await browser.close();
