// 달력·구독 화면 점검 — node scripts/laws/shoot_cal.mjs [base]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3317';
const out = process.env.SHOT_DIR ?? '.';
const browser = await chromium.launch();
const errors = [];
const page = async (opts) => {
  const p = await (await browser.newContext(opts)).newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return p;
};

const d = await page({ viewport: { width: 1360, height: 1000 } });
await d.goto(`${base}/laws?mode=cal`, { waitUntil: 'networkidle' });
await d.waitForSelector('.lr-cal');
await d.click('[aria-label^="2026. 10. 8."]');
await d.evaluate(() => document.querySelector('.lr-toolbar')?.scrollIntoView());
await d.screenshot({ path: `${out}/cal_desktop.png` });
await d.getByRole('button', { name: '캘린더 구독' }).click();
await d.waitForSelector('.lr-sub-pop');
const subUrl = await d.locator('.lr-sub-url').innerText();
const google = await d.getByRole('link', { name: '구글 캘린더' }).getAttribute('href');
await d.screenshot({ path: `${out}/cal_subscribe.png` });

const m = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(`${base}/laws?mode=cal`, { waitUntil: 'networkidle' });
await m.waitForSelector('.lr-cal');
await m.evaluate(() => document.querySelector('.lr-cal')?.scrollIntoView());
await m.screenshot({ path: `${out}/cal_mobile.png` });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const feed = await (await fetch(`${base}/laws/calendar.ics?rules=1`)).text();
console.log(JSON.stringify({ subUrl, google, overflow, feedEvents: (feed.match(/BEGIN:VEVENT/g) || []).length, errors: errors.slice(0, 6) }, null, 1));
await browser.close();
