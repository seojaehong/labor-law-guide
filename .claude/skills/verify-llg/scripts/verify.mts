// labor-law-guide(일의 무늬) 계산 도구를 사용자처럼 돌려 증거를 남긴다.
// 실행(저장소 루트): node .claude/skills/verify-llg/scripts/verify.mts <doctor|drive|list> [--feature <id>|all] [--base <url>] [--out <dir>]
// 합성 입력만 쓴다. 입력·결과는 서버에 저장되지 않는 브라우저 계산이다.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bannedHits } from '../../../../src/lib/tool-kit/banned.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const cmd = args[0] ?? 'list';
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = (opt('base', 'https://yellowenvelope.kr') as string).replace(/\/$/, '');
const RUN = opt('run', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)) as string;
const OUT = resolve(opt('out', `artifacts/verify-llg/${RUN}`) as string);
const VIEWPORTS = [{ name: 'pc', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }];

type Page = any;
type Step = { name: string; expect: string | RegExp; got: string; ok: boolean };
type Journey = (p: Page, step: (name: string, expect: string | RegExp, got: string) => void) => Promise<void>;

const answer = async (p: Page, sel = 'section[aria-live]') => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();

// 기능마다 경로와 사용자 동작. 기대값은 손으로 센 값이다(features/<id>.md 와 같다).
const FEATURES: Record<string, { path: string; journey: Journey }> = {
  headcount: {
    path: '/tools/headcount',
    journey: async (p, step) => {
      step('첫 화면 답', /5인 이상|5인 이상 사업장이 되는 날이 없습니다/, await answer(p));
    },
  },
  'weekly-holiday-pay': {
    path: '/tools/weekly-holiday-pay',
    journey: async (p, step) => {
      const inputs = p.locator('input[inputmode]');
      step('기본 주 40시간', '82,560원', await answer(p));
      await inputs.nth(0).fill('10320');
      await inputs.nth(1).fill('22.5');
      step('주 22.5시간', '46,440원', await answer(p));
      await inputs.nth(1).fill('14');
      step('주 14시간(15시간 미만)', '주휴수당이 없습니다', await answer(p));
      await inputs.nth(1).fill('40');
      await p.getByLabel('빠진 날이 있다').check();
      step('결근한 주', '이번 주는 주휴수당이 없습니다', await answer(p));
    },
  },
  'min-wage': {
    path: '/tools/min-wage',
    journey: async (p, step) => {
      const amt = p.locator('input[inputmode=numeric]').first();
      step('월 2,156,880 / 2026 이상 · 2027 부족', /2026년 최저임금\(시간당 10,320원\) 이상.*79,420원 적습니다/, await answer(p));
      await amt.fill('2156879');
      step('1원 모자람', '한 달 1원 적습니다', await answer(p));
      await p.getByLabel('시급', { exact: true }).check();
      await p.locator('input[inputmode=numeric]').first().fill('9288');
      await p.locator('summary', { hasText: '수습' }).click();
      await p.getByLabel('수습 기간이다').check();
      await p.getByLabel(/1년 이상/).check();
      await p.getByLabel(/3개월이 지나지 않았다/).check();
      step('수습 90%', '수습 기준(최저임금 10,320원의 90%, 시간당 9,288원) 이상', await answer(p));
      await p.getByLabel(/단순노무 종사자/).check();
      step('단순노무는 감액 없음', '2026년 최저임금(시간당 10,320원)보다 1시간 1,032원 적습니다', await answer(p));
    },
  },
  'notice-pay': {
    path: '/tools/notice-pay',
    journey: async (p, step) => {
      const d = p.locator('input[type=date]');
      step('입사일 없음', '입사일을 넣어 주세요', await answer(p));
      await d.nth(0).fill('2025-01-02');
      await d.nth(1).fill('2026-11-30');
      step('예고 없음', '2,476,800원', await answer(p));
      await p.getByLabel('알렸다', { exact: true }).check();
      await p.locator('input[type=date]').nth(2).fill('2026-11-01');
      step('29일 전 예고 = 30일분 전액', /2,476,800원.*30일분 전액/, await answer(p));
      await p.locator('input[type=date]').nth(2).fill('2026-10-31');
      step('30일 전 예고', '해고예고수당이 없습니다', await answer(p));
      await p.getByLabel('알리지 않았다').check();
      await d.nth(0).fill('2026-09-02');
      step('3개월 미만', '3개월이 되지 않았습니다', await answer(p));
      await d.nth(0).fill('2025-11-30');
      await d.nth(1).fill('2026-02-28');
      step('11.30 입사 → 2.28 해고(그 달 말일에 3개월)', '2,476,800원', await answer(p));
    },
  },
  severance: {
    path: '/tools/severance.html',
    journey: async (p, step) => {
      await p.fill('#startDate', '2023-01-01');
      await p.fill('#endDate', '2026-01-01');
      await p.dispatchEvent('#endDate', 'change');
      await p.fill('#wage1', '9000000');
      await p.dispatchEvent('#wage1', 'input');
      await p.click('button.btn-primary:has-text("계산하기")');
      await p.waitForSelector('#resultArea:visible');
      step('퇴직금 계산기(고용노동부 계산기 값)', '97,826.09 × 30 × 1,096일 ÷ 365 = 8,812,389원', await answer(p, '#resultArea'));
      await p.goto(`${BASE}/tools/severance.html`, { waitUntil: 'networkidle' });
      await p.fill('#startDate', '2021-06-01');
      await p.fill('#endDate', '2026-05-31');
      await p.dispatchEvent('#endDate', 'change');
      const periods = await p.evaluate(() => [1, 2, 3].map((i) => document.getElementById('periodText' + i)?.textContent).join(' '));
      step('5.31 퇴직 → 3.1부터', '3.1~3.31 4.1~4.30 5.1~5.30', periods);
      // 챗봇 답 끝 링크(src/lib/chat/severance-link.ts)와 같은 모양 — 퇴직일 = 마지막 근무일 다음 날, ?run=1 자동 계산
      await p.goto(`${BASE}/tools/severance.html?start=2023-01-01&end=2026-01-01&w1=3000000&w2=3000000&w3=3000000&run=1`, { waitUntil: 'networkidle' });
      await p.waitForSelector('#resultArea:visible');
      step('챗봇 링크로 연 계산기 = 챗봇 답', /8,812,389원/, await answer(p, '#resultArea'));
    },
  },
  exit: {
    path: '/exit',
    journey: async (p, step) => {
      const form = p.locator('section[aria-label="입력"]');
      await form.locator('input[type=date]').nth(0).fill('2025-12-31');
      await form.locator('input[type=date]').nth(1).fill('2023-01-01');
      await form.locator('input[inputmode=numeric]').fill('3000000');
      await form.locator('input[inputmode=decimal]').first().fill('40');
      step('퇴직금 추정(정본 엔진)', '8,812,389원', await answer(p, 'section[aria-label="확인용 추정"]'));
    },
  },
  'take-home-pay': {
    path: '/tools/take-home-pay',
    journey: async (p, step) => {
      const pay = p.getByLabel(/^월 급여/);
      const meal = p.getByLabel(/^식대/);
      step('기본 300만·식대 20만·1인', '예상 실수령액은 2,665,440원', await answer(p));
      await meal.fill('250000');
      step('식대 25만 — 20만까지만 비과세', '예상 실수령액은 2,665,440원', await answer(p));
      await meal.fill('');
      step('식대 없음', '예상 실수령액은 2,626,700원', await answer(p));
      await p.getByLabel(/국민연금 공제 대상이 아님/).check();
      step('국민연금 공제 대상 아님', '예상 실수령액은 2,769,200원', await answer(p));
      await p.getByLabel(/국민연금 공제 대상이 아님/).uncheck();
      await p.getByLabel('만 65세 이후 새로 고용됨').check();
      step('65세 이후 새로 고용', '예상 실수령액은 2,653,700원', await answer(p));
      await p.getByLabel('만 65세 이후 새로 고용됨').uncheck();
      await pay.fill('2650000');
      await p.getByLabel('120%', { exact: true }).check();
      step('265만 · 120%', '예상 실수령액은 2,334,480원', await answer(p));
      await p.getByLabel('80%', { exact: true }).check();
      step('265만 · 80%', '예상 실수령액은 2,353,830원', await answer(p));
      await p.getByLabel('100%', { exact: true }).check();
      await pay.fill('4000000');
      await meal.fill('200000');
      await p.getByLabel(/^공제대상가족 수/).fill('4');
      await p.getByLabel(/8세 이상 20세 이하 자녀 수/).fill('2');
      step('400만·식대 20만·4인·자녀 2', '예상 실수령액은 3,599,140원', await answer(p));
      await p.getByLabel(/8세 이상 20세 이하 자녀 수/).fill('4');
      step('자녀가 가족 − 1 보다 많음', '자녀 수는 공제대상가족 수에서 본인을 뺀 수보다 많을 수 없습니다', await answer(p));
      await p.getByLabel(/8세 이상 20세 이하 자녀 수/).fill('0');
      await p.getByLabel(/^공제대상가족 수/).fill('1');
      await meal.fill('');
      await pay.fill('10000001');
      step('과세 급여 1,000만원 초과 — 표 밖', '소득세를 계산하지 않습니다', await answer(p));
    },
  },
  'retirement-tax': {
    path: '/tools/retirement-tax',
    journey: async (p, step) => {
      const pay = p.getByLabel('퇴직급여(원)');
      const hire = p.getByLabel('입사일');
      const last = p.getByLabel('퇴사일(마지막 근무일)');
      step('퇴직급여 없음', '퇴직급여를 넣어 주세요', await answer(p));
      await pay.fill('60000000');
      await hire.fill('2014-01-02');
      await last.fill('2026-07-15');
      step('13년(151개월) · 10원 절사', /691,990원.*69,190원/, await answer(p));
      await pay.fill('20000000');
      await hire.fill('2021-08-01');
      await last.fill('2026-07-31');
      step('정확히 5년(기념일 전날 퇴사)', /280,000원.*28,000원.*5년\(60개월\)/, await answer(p));
      await last.fill('2026-08-01');
      step('기념일 퇴사 = 6년', /216,000원.*21,600원.*6년\(61개월\)/, await answer(p));
      await pay.fill('2500000');
      await hire.fill('2023-07-03');
      await last.fill('2026-07-02');
      step('퇴직급여 < 근속연수공제 = 0원', /0원입니다.*근속연수공제/, await answer(p));
      await pay.fill('20000000');
      await hire.fill('2018-01-02');
      await last.fill('2022-12-31');
      step('2022. 12. 31. 퇴사 = 계산하지 않음', '2023년 1월 1일 이후 퇴사만', await answer(p));
      await last.fill('2023-01-01');
      step('2023. 1. 1. 퇴사 = 계산', '280,000원', await answer(p));
    },
  },
};

async function api(step: (n: string, e: string | RegExp, g: string) => void) {
  const r = await fetch(`${BASE}/api/tools/calc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'calc_severance', args: { hire_date: '2023-01-01', last_work_date: '2025-12-31', wages_3months: [3000000, 3000000, 3000000] } }),
  }).then((x) => x.json());
  step('챗봇 계산 API 퇴직금', '8812389', String(r?.result?.severance_pay));
}

async function drive(id: string) {
  const f = FEATURES[id];
  if (!f) throw new Error(`없는 기능: ${id} (list 로 확인)`);
  const browser = await chromium.launch();
  const report: any[] = [];
  try {
    for (const vp of VIEWPORTS) {
      const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors: string[] = [];
      p.on('console', (m: any) => m.type() === 'error' && errors.push(m.text()));
      p.on('pageerror', (e: any) => errors.push(String(e)));
      p.on('dialog', (d: any) => d.dismiss());
      const steps: Step[] = [];
      const step = (name: string, expect: string | RegExp, got: string) =>
        steps.push({ name, expect: String(expect), got, ok: typeof expect === 'string' ? got.includes(expect) : expect.test(got) });
      const res = await p.goto(`${BASE}${f.path}`, { waitUntil: 'networkidle' });
      await f.journey(p, step);
      if (id === 'severance' && vp.name === 'pc') await api(step);
      const text = await p.evaluate(() => (document.querySelector('main') ?? document.body).innerText);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      mkdirSync(OUT, { recursive: true });
      const shot = resolve(OUT, `${id}-${vp.name}.png`);
      await p.screenshot({ path: shot, fullPage: true });
      const banned = bannedHits(text);
      report.push({ feature: id, viewport: vp.name, url: `${BASE}${f.path}`, http: res?.status(), steps, banned, overflow, consoleErrors: errors, screenshot: shot });
      await p.close();
    }
  } finally {
    await browser.close();
  }
  return report;
}

function verdict(rows: any[]) {
  return rows.every((r) => r.http === 200 && r.steps.every((s: Step) => s.ok) && r.banned.length === 0 && !r.overflow && r.consoleErrors.length === 0);
}

if (cmd === 'list') {
  console.log(Object.entries(FEATURES).map(([k, v]) => `${k}\t${v.path}`).join('\n'));
} else if (cmd === 'doctor') {
  const rows: string[] = [];
  let ok = true;
  for (const [id, f] of Object.entries(FEATURES)) {
    const r = await fetch(`${BASE}${f.path}`, { redirect: 'manual' });
    ok &&= r.status === 200;
    rows.push(`${r.status}\t${id}\t${BASE}${f.path}`);
  }
  if (BASE.includes('yellowenvelope.kr')) {
    try {
      const sha = execFileSync('git', ['rev-parse', 'origin/master'], { encoding: 'utf8' }).trim();
      const st = execFileSync('gh', ['api', `repos/seojaehong/labor-law-guide/commits/${sha}/status`, '--jq', '.state'], { encoding: 'utf8' }).trim();
      rows.push(`deploy\torigin/master ${sha.slice(0, 7)} = ${st}`);
      ok &&= st === 'success';
    } catch (e) {
      rows.push(`deploy\t확인 못 함: ${(e as Error).message.split('\n')[0]}`);
      ok = false;
    }
  }
  console.log(rows.join('\n'));
  console.log(ok ? 'doctor: OK' : 'doctor: NOT OK');
  process.exit(ok ? 0 : 1);
} else if (cmd === 'drive') {
  const which = opt('feature', 'all') as string;
  const ids = which === 'all' ? Object.keys(FEATURES) : which.split(',');
  const all: any[] = [];
  for (const id of ids) all.push(...(await drive(id)));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ base: BASE, run: RUN, rows: all }, null, 1));
  for (const r of all) {
    const bad = r.steps.filter((s: Step) => !s.ok);
    console.log(`${bad.length || r.banned.length || r.overflow || r.consoleErrors.length || r.http !== 200 ? 'FAIL' : 'PASS'}\t${r.feature}\t${r.viewport}\tsteps ${r.steps.length - bad.length}/${r.steps.length}\tbanned ${r.banned.length}\toverflow ${r.overflow}\tconsole ${r.consoleErrors.length}`);
    for (const s of bad) console.log(`  ✗ ${s.name}: 기대 ${s.expect} / 실제 ${s.got.slice(0, 200)}`);
    if (r.banned.length) console.log(`  ✗ 금지어 ${r.banned.join(',')}`);
    for (const e of r.consoleErrors) console.log(`  ✗ console ${e.slice(0, 200)}`);
  }
  const ok = verdict(all);
  console.log(`evidence: ${OUT}`);
  console.log(ok ? 'drive: PASS' : 'drive: FAIL');
  process.exit(ok ? 0 : 1);
} else {
  console.error('사용법: verify.mts <list|doctor|drive> [--feature <id>|all] [--base <url>] [--out <dir>]');
  process.exit(2);
}
