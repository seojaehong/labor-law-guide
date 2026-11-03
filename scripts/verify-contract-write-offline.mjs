// 근로계약서 작성 오프라인판 실브라우저 확인 — file:// 로 열어 입력 → 임금 구성 → 엑셀·한글·PDF 내려받기 → 요청 캡처.
//   npm.cmd run verify:contract-write-offline   (빌드 + 이 스크립트)
//   node scripts/verify-contract-write-offline.mjs [html 경로] [--keep <폴더>]   --keep 이면 받은 파일을 그 폴더에 둔다
// 아래 중 하나라도 어긋나면 exit 1:
//   file:// 문서 자신을 뺀 요청 0 · 콘솔 오류 0 · 의정부 표본 금액 · 파트 표본 금액 · 세 파일 내려받기(파일 머리 바이트).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const keepAt = args.indexOf('--keep');
const keep = keepAt >= 0 ? resolve(args[keepAt + 1]) : null;
const file = resolve(args.find((a, i) => !a.startsWith('--') && i !== keepAt + 1) ?? 'dist-offline/contract-write.html');
const pageUrl = pathToFileURL(file).href;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const checks = {};
const requests = [];
const consoleErrors = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('request', (r) => {
    const u = r.url();
    if (u !== pageUrl && !u.startsWith('blob:')) requests.push(`${r.method()} ${u}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(pageUrl);
  const text = async () => ((await page.textContent('#cw-result')) ?? '').replace(/\s+/g, ' ');

  checks.empty = (await text()).includes('입력이 필요합니다: 사업체명, 근로자 성명, 계약 시작일, 근무장소, 업무, 월 임금 총액');
  const fill = (label, v) => page.getByLabel(label, { exact: true }).fill(v);
  await fill('사업체명', '합성테스트 사업장');
  await fill('근로자 성명', '합성근로자');
  await fill('계약 시작일', '2026-03-01');
  await fill('작성일', '2026-02-26');
  await fill('근무장소', '합성테스트 본점');
  await fill('업무', '홀 서비스');
  await page.getByRole('button', { name: '금', exact: true }).click();
  await fill('출근 시각', '10:00');
  await fill('퇴근 시각', '22:00');
  await fill('하루 휴게시간(분)', '155');
  await fill('연간 공휴일 근무 예정 일수', '22');
  await fill('월 임금 총액(원)', '2600000');
  const monthly = await text();
  checks.monthly = /기본급\(주휴포함\)\(잔액\)166\.85시간1,870,364원/.test(monthly.replace(/ /g, '')) && monthly.includes('414,013원') && monthly.includes('통상시급 11,209.99원');
  checks.monthlyFeedback = monthly.includes('손볼 항목이 없습니다');

  const got = {};
  for (const [label, ext, magic] of [['엑셀로 받기', 'xlsx', 'PK'], ['한글로 받기', 'hwpx', 'PK'], ['PDF로 받기', 'pdf', '%PDF']]) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: label, exact: true }).click()]);
    const buf = readFileSync(await dl.path());
    got[ext] = buf.subarray(0, magic.length).toString() === magic;
    if (keep) {
      mkdirSync(keep, { recursive: true });
      writeFileSync(join(keep, `contract-write-offline.${ext}`), buf);
    }
  }
  checks.downloads = got.xlsx && got.hwpx && got.pdf;

  await page.getByLabel('임금 형태', { exact: true }).selectOption('hourly');
  await page.getByRole('button', { name: '금', exact: true }).click();
  await fill('출근 시각', '11:00');
  await fill('퇴근 시각', '17:00');
  await fill('하루 휴게시간(분)', '30');
  await fill('연간 공휴일 근무 예정 일수', '16');
  await fill('시간당 지급액(원)', '13000');
  const part = (await text()).replace(/ /g, '');
  checks.part = part.includes('기본급(잔액)5.5시간58,293원') && part.includes('주휴수당1.1시간11,658원') && part.includes('78,000원') && part.includes('통상시급10,598.60원');
} finally {
  await browser.close();
}
checks.requests0 = requests.length === 0;
checks.console0 = consoleErrors.length === 0;
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
console.log(JSON.stringify({ file, checks, requests, consoleErrors }, null, 1));
console.log(failed.length ? `FAIL ${failed.join(', ')}` : 'PASS contract-write offline');
process.exit(failed.length ? 1 : 0);
