// 「내 취업규칙 점검」 기간 점검 화면 점검 — 예시 본문 + 2025.1.1. ~ 오늘, docx 내려받기까지. node scripts/laws/shoot_period.mjs [base]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3317';
const out = process.env.SHOT_DIR ?? '.';
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`${base}/laws`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /내 취업규칙 붙여넣고 점검/ }).first().click();
await p.waitForSelector('.lr-period');
await p.screenshot({ path: `${out}/period_empty.png` });
const emptyCount = await p.locator('.lr-verdict').count();
await p.getByRole('button', { name: '예시로 해보기' }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/period_sample.png` });
const cards = await p.locator('.lr-verdict').count();
const badges = await p.locator('.lr-verdict .lr-badge').allInnerTexts();
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /신구대조표 docx/ }).click()]);
const path = `${out}/${dl.suggestedFilename()}`;
await dl.saveAs(path);
// 기준일을 「공포된 예정분 전부」로
await p.getByRole('button', { name: '공포된 예정분 전부' }).click();
await p.waitForTimeout(300);
const cardsFuture = await p.locator('.lr-verdict').count();
// 모바일
const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await m.newPage();
await mp.goto(`${base}/laws`, { waitUntil: 'networkidle' });
await mp.getByRole('button', { name: /내 취업규칙 붙여넣고 점검/ }).first().click();
await mp.getByRole('button', { name: '예시로 해보기' }).click();
await mp.waitForTimeout(400);
await mp.screenshot({ path: `${out}/period_mobile.png`, fullPage: false });
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(JSON.stringify({ emptyCount, cards, badges, cardsFuture, docx: path, overflow, errors }, null, 1));
await browser.close();
