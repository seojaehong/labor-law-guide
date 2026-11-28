import { chromium, expect, test } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// 크롬 확장(extensions/work24-fill)을 실제로 올려 사이트 → 확장 → 고용24 확인서 화면까지 한 번에 본다.
// 고용24 화면은 같은 칸 id 를 가진 시험 페이지로 바꿔 낀다(로그인·실제 공단 접속 없음, 합성 값).
const EXT = path.resolve('extensions/work24-fill');
const W24 = 'https://www.work24.go.kr/ei/b/b/1500/openHPEIBB1500M06.do';
const FAKE = `<!doctype html><meta charset="utf-8"><title>확인서(시험)</title><body>
<input id="layoffAlwncPdBeginDe"><input id="layoffAlwncPdEndDe"><input id="bfeAppontWorkhr"><input id="afAppontWorkhr">
<input type="radio" name="u" id="odygsAmSelB"><input type="radio" name="u" id="odygsAmSelE"><input id="odygsAm"><input id="appontWorkhr">
<input id="encptIhidnm1" value="(시험 칸)"><input id="layoffAlwncPdMonthCo" readonly><input id="layoffAlwncPdDyct" readonly>
<script>document.getElementById('odygsAm').addEventListener('keyup',e=>{const n=e.target.value.replace(/,/g,'');if(/^\\d+$/.test(n))e.target.value=Number(n).toLocaleString('ko-KR')})</script></body>`;

test('확장: 사이트에서 보낸 7칸 계획이 고용24 확인서 칸에 들어간다(저장 없음, 다른 칸은 안 건드림)', async ({ baseURL }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llg-ext-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    await ctx.route('https://www.work24.go.kr/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE }));
    const page = await ctx.newPage();
    await page.goto(`${baseURL}/tools/childcare-reduction`);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.llgGovFill)).toBe('1');
    await page.getByLabel(/^월 통상임금/).fill('3000000');
    await page.getByLabel('단축 전 1주 소정근로시간', { exact: true }).fill('40');
    await page.getByLabel('단축 후 1주 소정근로시간', { exact: true }).fill('24');
    await page.getByLabel('단축 시작일', { exact: true }).fill('2026-01-05');
    await page.getByLabel(/^단축 종료일/).fill('2026-06-30');
    await page.getByText('고용24 확인서에 넣기(크롬 확장 시험판)').click();
    await page.getByLabel(/^산정기준 단위기간의 월 소정근로시간/).fill('209');
    await page.getByRole('button', { name: '확장으로 보내기' }).click();
    await expect(page.getByText(/보냈습니다/)).toBeVisible();

    const w = await ctx.newPage();
    await w.goto(W24);
    await w.getByRole('button', { name: '칸에 넣기' }).click();
    await expect(w.getByText(/넣었습니다/)).toBeVisible();
    expect(await w.inputValue('#layoffAlwncPdBeginDe')).toBe('2026-01-05');
    expect(await w.inputValue('#odygsAm')).toBe('3,000,000');
    expect(await w.inputValue('#appontWorkhr')).toBe('209');
    expect(await w.isChecked('#odygsAmSelE')).toBe(true);
    expect(await w.inputValue('#encptIhidnm1')).toBe('(시험 칸)');

    // 계획은 한 번 가져가면 지워진다 — 다시 열면 패널이 없다
    const again = await ctx.newPage();
    await again.goto(W24);
    await again.waitForTimeout(800);
    await expect(again.getByRole('button', { name: '칸에 넣기' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
