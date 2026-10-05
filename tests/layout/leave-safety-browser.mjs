import fs from 'node:fs';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { chromium } from '@playwright/test';

const output = 'docs/design-visuals/annual-leave-20261005';
const browser = await chromium.launch({ executablePath: 'C:/Users/iceam/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
await context.route('**/*', route => new URL(route.request().url()).origin !== 'http://127.0.0.1:3126' || new URL(route.request().url()).pathname.startsWith('/api/') ? route.abort() : route.continue());
await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.__copiedLeave = value; } } }));
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:3126/tools/leave', { waitUntil: 'networkidle' });
  await page.getByLabel('기준일', { exact: true }).fill('2026-10-05');
  await page.getByLabel('이름과 입사일 붙여넣기').fill('날짜누락\t\t16\n미래직원\t2027-01-01\t16\n정상일치\t2023-10-05\t16\n차이직원\t2023-10-05\t15\n=1+1\t2023-10-05\t16');
  assert.ok((await page.locator('.lv-roster__note').innerText()).includes('저장되지 않았습니다'));
  assert.equal(await page.locator('.lv-table tbody').innerText().then(text => /NaN|Invalid Date/.test(text)), false);
  await page.getByRole('button', { name: '엑셀로 복사', exact: true }).click();
  const copied = await page.evaluate(() => window.__copiedLeave);
  const lines = copied.split('\r\n').slice(1).map(line => line.split('\t'));
  for (const line of lines.slice(0, 2)) { assert.equal(line[3], ''); assert.equal(line[5], ''); assert.equal(line[6], '계산 불가'); }
  assert.equal(lines[2][6], '일치'); assert.equal(lines[3][6], '차이 있음'); assert.equal(lines[3][5], '-1'); assert.equal(lines[4][0], "'=1+1");
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '엑셀 내려받기', exact: true }).click()]);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const rows = []; sheet.eachRow(row => { if (['미래직원', '정상일치', '차이직원', '=1+1'].includes(String(row.getCell(1).value))) rows.push(row); });
  assert.equal(rows[0].getCell(3).value, ''); assert.equal(rows[0].getCell(5).value, ''); assert.equal(rows[0].getCell(6).value, '계산 불가');
  assert.equal(rows[1].getCell(6).value, '일치'); assert.equal(rows[2].getCell(6).value, '차이 있음'); assert.equal(rows[3].getCell(1).type, ExcelJS.ValueType.String);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/export-error-parity-390.png`, fullPage: true });
  checks.push('screen/clipboard/download failure parity; safe formula text; numeric difference');

  const input = new ExcelJS.Workbook(), source = input.addWorksheet('synthetic');
  source.addRow(['첫직원', '날짜오타', 16]);
  const dateRow = source.addRow(['둘째직원', new Date('2023-10-05T00:00:00Z'), 16]); dateRow.getCell(2).numFmt = 'yyyy-mm-dd';
  await page.locator('input[type=file]').setInputFiles({ name: 'date-and-invalid-first.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await input.xlsx.writeBuffer()) });
  await page.getByText('둘째직원', { exact: true }).waitFor();
  assert.ok((await page.getByLabel('이름과 입사일 붙여넣기').inputValue()).includes('첫직원'));
  assert.ok((await page.getByLabel('이름과 입사일 붙여넣기').inputValue()).includes('2023-10-05'));
  assert.equal(await page.getByLabel('첫 줄은 제목이라 제외').isChecked(), false);
  checks.push('real XLSX date preserved in LA; first invalid employee retained');

  await page.locator('.lv-workspace-options summary').click();
  await page.getByRole('button', { name: /우리 회사 담당자/ }).click();
  await page.getByRole('textbox', { name: '회사 이름' }).fill('합성검증사업장');
  await page.getByRole('button', { name: '사업장 만들기' }).click();
  await page.waitForFunction(() => document.querySelector('.lv-roster__note')?.textContent.includes('저장했습니다'));
  assert.ok(!(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).includes('둘째직원'));
  checks.push('no false save before selection; actual session save confirmed');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('work-patterns.leave.members.v1:')) throw new DOMException('Synthetic storage limit', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByLabel('이름과 입사일 붙여넣기').fill('저장실패검증\t2023-10-05\t16');
  await page.waitForFunction(() => document.querySelector('.lv-roster__note')?.textContent.includes('저장하지 못했습니다'));
  checks.push('storage failure never claims successful save');

  await page.goto('http://127.0.0.1:3126/tools/leave/advanced', { waitUntil: 'networkidle' });
  await page.getByLabel('연차 사용기간 종료일').fill('2026-12-31');
  await page.getByLabel('1차 촉구 발송일').fill('2026-07-01');
  await page.getByLabel('근로자 수령일').fill('2026-07-01');
  await page.getByLabel('근로자 통보일').fill('2026-06-01');
  await page.getByLabel('2차 통보 발송일').fill('2026-01-01');
  assert.ok((await page.locator('.lv-table').first().innerText()).includes('빠릅니다'));
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/promotion-chronology-390.png`, fullPage: true });
  checks.push('reverse promotion dates do not display a normal match');
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${output}/safety-browser.json`, JSON.stringify({ timezone: 'America/Los_Angeles', checks, errors }, null, 2));
  console.log('Safety browser flows passed');
} finally { await browser.close(); }
