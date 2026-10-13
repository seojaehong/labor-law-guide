// 특정 URL 상태 한 장 — node scripts/laws/shoot_view.mjs "<query>" <out.png> [open-id]
import { chromium } from '@playwright/test';

const [query, file, openId] = process.argv.slice(2);
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1360, height: 1000 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`http://localhost:3317/laws?${query}`, { waitUntil: 'networkidle' });
if (openId) {
  await p.click(`[id="${openId}"] .lr-row`);
  await p.waitForSelector(`[id="${openId}"] .lr-artcard`);
  await p.evaluate((id) => { document.getElementById(id).scrollIntoView({ block: 'start' }); window.scrollBy(0, -150); }, openId);
} else {
  await p.evaluate(() => document.querySelector('.lr-toolbar')?.scrollIntoView());
}
await p.screenshot({ path: file });
console.log(JSON.stringify({ cards: await p.locator('.lr-card').count(), errors }));
await browser.close();
