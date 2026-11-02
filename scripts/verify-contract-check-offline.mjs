// 근로계약서 점검 오프라인판 실브라우저 확인 — file:// 로 열어 합성 예시 → 결과 렌더 → 요청 캡처.
//   npm.cmd run verify:contract-check-offline   (빌드 + 이 스크립트)
//   node scripts/verify-contract-check-offline.mjs [html 경로]
// PLAYWRIGHT_CHROMIUM_EXECUTABLE 이 있으면 그 크롬을 쓴다.
// 아래 중 하나라도 어긋나면 exit 1:
//   file:// 문서 자신을 뺀 요청 0 · 콘솔 오류 0 · 결과 4절 · 규칙 이름·근거 조문·수정 방향이 화면에 보임 ·
//   바닥줄(빌드 정보·면책 문구) · 빈 양식 → 점검 · 빈 목록 거절 · 깨진 JSON 안내 · 덮어쓰기 전 확인 창.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const file = resolve(process.argv[2] ?? 'dist-offline/contract-check.html');
const pageUrl = pathToFileURL(file).href;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const checks = {};
const requests = [];
const consoleErrors = [];
const dialogs = [];
try {
  const page = await browser.newPage();
  page.on('request', (r) => {
    if (r.url() !== pageUrl) requests.push(`${r.method()} ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept().catch(() => {});
  });

  await page.goto(pageUrl);
  const footer = (await page.textContent('footer')) ?? '';
  checks.footerBuild = /빌드 \d{4}-\d{2}-\d{2} · 커밋 \S+ · 규칙 카탈로그 \S+ · 최저시급 수록 \d{4}~\d{4}/.test(footer);
  checks.footerDisclaimer = footer.includes('법률 판단이 아닙니다');

  // 합성 예시 — 빈 입력이므로 확인 창 없이 들어간다
  await page.click('#cc-sample');
  await page.waitForSelector('#cc-out section.result');
  checks.sections = await page.locator('#cc-out section.result').count();
  checks.items = await page.locator('#cc-out li.finding').count();
  const outText = (await page.textContent('#cc-out')) ?? '';
  checks.ruleName = outText.includes('최저임금 충족') && outText.includes('수습 감액 기준 확인');
  checks.statute = outText.includes('최저임금법 §6');
  checks.amend = (await page.locator('#cc-out p.amend').count()) > 0 && outText.includes('수정 방향:');
  checks.noDialogYet = dialogs.length === 0;

  // 사람이 고친 내용 위에 빈 양식을 넣으면 확인 창이 뜬다
  await page.fill('#cc-input', '{"contract_id": "사람이 쓴 것"}');
  await page.click('#cc-blank');
  checks.confirmShown = dialogs.length === 1;
  const blank = await page.inputValue('#cc-input');
  checks.blankInserted = blank.includes('"work_time"') && blank.includes('"basis_hours"');
  await page.click('#cc-run');
  await page.waitForSelector('#cc-out section.result');
  checks.blankRuns = (await page.textContent('#cc-out'))?.includes('입력하면 점검합니다') ?? false;

  // 빈 목록은 거절한다
  await page.fill('#cc-input', '[]');
  await page.click('#cc-run');
  checks.emptyRejected = ((await page.textContent('#cc-error')) ?? '').includes('빈 목록') &&
    (await page.locator('#cc-out section.result').count()) === 0;

  // 잘못된 JSON 도 바깥 요청 없이 안내만 한다
  await page.fill('#cc-input', '{ 깨진 입력');
  await page.click('#cc-run');
  checks.brokenJson = ((await page.textContent('#cc-error')) ?? '').includes('JSON 형식');
} finally {
  await browser.close();
}

console.log(JSON.stringify({ checks, dialogs, requests, consoleErrors }, null, 2));
const ok =
  checks.sections === 4 &&
  checks.items > 0 &&
  Object.entries(checks).every(([k, v]) => k === 'sections' || k === 'items' || v === true) &&
  requests.length === 0 &&
  consoleErrors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
