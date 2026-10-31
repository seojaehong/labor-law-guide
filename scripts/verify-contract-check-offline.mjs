// 근로계약서 점검 오프라인판 실브라우저 확인 — file:// 로 열어 합성 예시 → 결과 렌더 → 요청 캡처.
//   node scripts/build-contract-check-offline.mjs && node scripts/verify-contract-check-offline.mjs
// file:// 문서 자신을 뺀 요청이 1건이라도 있거나 결과가 안 그려지면 exit 1.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const file = resolve(process.argv[2] ?? 'dist-offline/contract-check.html');
const pageUrl = pathToFileURL(file).href;

const browser = await chromium.launch();
const page = await browser.newPage();
const requests = [];
const consoleErrors = [];
page.on('request', (r) => {
  if (r.url() !== pageUrl) requests.push(`${r.method()} ${r.url()}`);
});
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(pageUrl);
await page.click('#cc-sample');
await page.waitForSelector('#cc-out section.result');
const sections = await page.locator('#cc-out section.result').count();
const items = await page.locator('#cc-out li.finding').count();
// 잘못된 JSON 도 바깥 요청 없이 안내만 한다
await page.fill('#cc-input', '{ 깨진 입력');
await page.click('#cc-run');
const errText = await page.textContent('#cc-error');
await browser.close();

console.log(JSON.stringify({ sections, items, errText, requests, consoleErrors }, null, 2));
const ok = sections === 4 && items > 0 && requests.length === 0 && consoleErrors.length === 0 && !!errText;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
