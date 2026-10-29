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
  'midyear-settlement': {
    path: '/tools/midyear-settlement',
    journey: async (p, step) => {
      const fill = async (v: Record<string, string>) => {
        for (const [label, x] of Object.entries(v)) await p.getByLabel(label).fill(x);
      };
      step('범위 먼저', '먼저 위 경우에 해당하는 것이 있는지', await answer(p));
      await p.getByLabel('하나라도 있다', { exact: true }).check();
      step('범위 밖 조건 = 멈춤', '이 도구가 계산하지 않습니다', await answer(p));
      await p.getByLabel('하나도 없다', { exact: true }).check();
      await p.getByLabel('퇴사한 해').selectOption('2026');
      step('급여 칸 비어 있음', '받은 급여 합계를 넣어 주세요', await answer(p));
      // S2 — 결정세액이 달라 A·B 를 나란히(고르지 않음, 261029 결정). A +21,840 추징 / B −74,896 → −74,890 환급(0 쪽 버림)
      await fill({ '받은 급여 합계': '26000000', '비과세 급여 합계': '1200000', 국민연금: '1178000', 건강보험료: '891560', 장기요양보험료: '117240', 고용보험료: '223200', '이미 낸 소득세': '300000', '이미 낸 지방소득세': '29980', '퇴직월 간이세액': '31000' });
      step('S2 A·B 나란히', /신청했다면\(A\) 퇴직월에 소득세 21,840원을 더 내는.*지방소득세는 2,200원을 더 내는.*신청하지 않았다면\(B\) 퇴직월에 소득세 74,890원을 돌려받는.*지방소득세는 7,470원을 돌려받는.*어느 쪽인지는 근로자가 건강·장기요양·고용보험료 소득공제를 신청했는지로 정해집니다.*보험료 소득공제\(A\)로 계산하면 소득세 \+21,840원/, await answer(p));
      step('S2 하나를 고르는 문구 없음', /^(?![\s\S]*(?:유리한|작은 쪽|가정))/, await answer(p));
      // S3 — A·B 둘 다 추징 · A 근로소득세액공제 한도 68.4만 · 간이세액 먼저 뗀 경우 A −99,540 / B +68,500
      await fill({ '받은 급여 합계': '41000000', '비과세 급여 합계': '1000000', 국민연금: '1900000', 건강보험료: '1438000', 장기요양보험료: '188960', 고용보험료: '360000', '이미 낸 소득세': '1500000', '이미 낸 지방소득세': '150000', '퇴직월 간이세액': '160000' });
      step('S3 A·B 나란히', /신청했다면\(A\) 퇴직월에 소득세 60,450원을 더 내는.*지방소득세는 6,040원을 더 내는.*신청하지 않았다면\(B\) 퇴직월에 소득세 228,500원을 더 내는.*지방소득세는 22,850원을 더 내는.*어느 쪽인지는.*영수증의 차감징수세액은 A −99,540원, B \+68,500원/, await answer(p));
      await fill({ '받은 급여 합계': '121200000', '비과세 급여 합계': '1200000' });
      step('총급여 1.2억 = 멈춤', '1억 2천만원 이상이라', await answer(p));
    },
  },
  'ordinary-wage-check': {
    path: '/tools/ordinary-wage-check',
    journey: async (p, step) => {
      // 첫 화면 = 기본급 2,500,000(매달) + 정기상여금 2,500,000(격월, 지급일 재직자에게만)
      const date = p.getByLabel(/연장근로 등을 제공한 날/);
      await date.fill('2025-03-01');
      step('새 기준 — 재직조건부 상여도 들어가는 쪽(45,000,000 ÷ 12 ÷ 209)', /항목은 2개입니다.*17,942\.58원/, await answer(p));
      await date.fill('2024-12-18');
      step('2024-12-18 제공분 — 종전 기준(고정성)으로 상여 빠짐', /항목은 1개입니다.*11,961\.72원.*병행사건/, await answer(p));
      await p.locator('section[aria-label="항목 2"]').getByLabel(/퇴직해도 그때까지 근무일수에 비례해 지급한다/).check();
      step('종전 기준이라도 근무일수 비례 지급이면 상여 들어감', /항목은 2개입니다.*17,942\.58원/, await answer(p));
      await date.fill('2025-03-01');
      await p.getByLabel('더할 항목').selectOption('family');
      await p.getByRole('button', { name: '항목 더하기' }).click();
      const fam = p.locator('section[aria-label="항목 3"]');
      await fam.getByLabel(/1회 지급액/).fill('60000');
      step('답이 빈 항목은 보류로 합계에서 뺌', /1개는 입력만으로 가리기 어려워 합계에서 뺐습니다/, await answer(p));
      await fam.getByRole('group', { name: /^지급 대상/ }).getByLabel('아니오', { exact: true }).check();
      step('부양가족 차등 가족수당 — 빠지는 쪽, 합계 그대로', /항목은 2개입니다.*17,942\.58원/, await answer(p));
      step('가족수당 항목 문장', '새 기준으로도 통상임금에서 빠지는 쪽으로 볼 요소가 있습니다', (await fam.innerText()).replace(/\s+/g, ' '));
      await fam.getByLabel(/모두에게 주는 1회 기본금액/).fill('20000');
      step('기본금액을 넣으면 정해진 주기만 남아 보류(지급 대상·대가 답과 상관없음)', /답이 비어 있는 질문: 정해진 주기 /, (await fam.innerText()).replace(/\s+/g, ' '));
      await fam.getByRole('group', { name: /^정해진 주기/ }).getByLabel('예', { exact: true }).check();
      step('모두에게 주는 기본금액 2만원만 들어감(45,240,000 ÷ 12 ÷ 209)', /항목은 3개입니다.*18,038\.28원/, await answer(p));
    },
  },
  'wage-delay-interest': {
    path: '/tools/wage-delay-interest',
    journey: async (p, step) => {
      const item = (n: number) => p.locator(`section[aria-label="항목 ${n}"]`);
      const fillItem = async (n: number, v: { amount?: string; due?: string; paid?: string }) => {
        if (v.amount !== undefined) await item(n).getByLabel('금액(원)').fill(v.amount);
        if (v.due !== undefined) await item(n).getByLabel(/^정기지급일\(/).fill(v.due);
        if (v.paid !== undefined) await item(n).getByLabel(/^지급한 날/).fill(v.paid);
      };
      const retire = p.getByLabel('마지막 근무일(사망이면 사망일)');
      step('마지막 근무일 없음', '마지막 근무일(또는 사망일)을 넣어 주세요', await answer(p));
      // C — 재직 중 2호: 정기지급일 1.25 → 30일
      await p.getByLabel('재직 중이다').check();
      await fillItem(1, { amount: '3000000', due: '2026-01-25', paid: '2026-02-24' });
      step('C 재직 중 정기지급일 다음 날부터 30일', '지연이자는 모두 49,315원', await answer(p));
      // E1 — 부칙 §2: 2025.10.23 전 정기지급일은 재직 중 0
      await fillItem(1, { due: '2025-09-25', paid: '2025-11-25' });
      step('E1 시행 전 정기지급일 · 재직 중', /지연이자가 붙지 않습니다.*부칙 제2조/, await answer(p));
      // E2 — 같은 임금을 못 받고 퇴직 → 1호
      await p.getByLabel('퇴직했다(또는 사망)').check();
      await retire.fill('2025-12-31');
      await item(1).getByLabel(/정기지급일이 정해진 임금/).check();
      await fillItem(1, { paid: '2026-02-27' });
      step('E2 퇴직하면 마지막 근무일 + 14 기준', /72,328원.*제37조 제1항 제1호/, await answer(p));
      // D — 2호 이자가 붙은 뒤 퇴직(§37②): 마지막 근무일 + 14(60,821원)로 다시 잡지 않는다
      await retire.fill('2026-06-10');
      await fillItem(1, { due: '2026-05-25', paid: '2026-07-31' });
      step('D 정기지급일 기준 유지', /^(?!.*60,821원).*110,136원.*제37조 제2항/, await answer(p));
      // A·B — 1호 퇴직금
      await item(1).getByLabel(/퇴직금\(일시금\)/).check();
      await retire.fill('2026-03-31');
      await fillItem(1, { amount: '10000000', paid: '2026-06-30' });
      step('A 마지막 근무일 + 14 → 77일', '지연이자는 모두 421,917원', await answer(p));
      await fillItem(1, { paid: '2026-04-14' });
      step('B1 14일째 지급 = 0원', '지연이자가 붙지 않습니다', await answer(p));
      await fillItem(1, { paid: '2026-04-15' });
      step('B2 15일째 지급 = 1일분', '지연이자는 모두 5,479원', await answer(p));
      // 퇴사 정리(/exit)와 같은 기한 — 마지막 근무일 3.30이면 기한 4.13, 4.14 지급은 1일분
      await retire.fill('2026-03-30');
      await fillItem(1, { paid: '2026-04-14' });
      step('퇴사 정리와 같은 기한(3.30 → 4.13)', '지연이자는 모두 5,479원', await answer(p));
      // F — 적용 제외 기간: 뺀 값과 빼지 않은 값을 같이, 단정하지 않는다
      await retire.fill('2026-01-31');
      await fillItem(1, { amount: '20000000', paid: '2026-12-31' });
      step('F 제외 없음 · 기준일 토요일 미루지 않음', '지연이자는 모두 3,506,849원', await answer(p));
      await p.getByLabel('적용 제외 사유가 있었던 기간을 뺀다').check();
      await p.getByLabel('적용 제외 시작일').fill('2026-02-15');
      await p.getByLabel('적용 제외 끝나는 날').fill('2026-09-30');
      step('F 제외 228일', /빼면 1,008,219원, 빼지 않으면 3,506,849원.*이 기간은 적용하지 않을 수 있습니다/, await answer(p));
      await p.getByLabel('적용 제외 시작일').fill('2026-01-01');
      await p.getByLabel('적용 제외 끝나는 날').fill('2026-02-14');
      step('F 제외 기간이 지연 기간 밖', /3,506,849원.*겹치지 않아.*이 기간은 적용하지 않을 수 있습니다/, await answer(p));
      await p.getByLabel('적용 제외 사유가 있었던 기간을 뺀다').uncheck();
      // G — 여러 건: 항목마다 원 미만 버림 후 합계(합계 후 버리면 305,807원)
      await retire.fill('2026-02-20');
      await fillItem(1, { amount: '2345678', paid: '2026-04-10' });
      await p.getByRole('button', { name: '항목 더하기' }).click();
      await fillItem(2, { amount: '4000000', paid: '2026-03-20' });
      await p.getByRole('button', { name: '항목 더하기' }).click();
      await fillItem(3, { amount: '6000000', paid: '2026-05-15' });
      step('G 세 건 합계', /지연이자는 모두 305,805원.*44,985원.*30,684원.*230,136원/, await answer(p));
    },
  },
  'leave-pay': {
    path: '/tools/leave-pay',
    journey: async (p, step) => {
      // 첫 화면 = 5명 이상 · 재직 중 · 통상 근로자 주 40h·1일 8h · 월급 2,600,000 · 남은 5일
      const weekly = p.getByLabel('1주 소정근로시간', { exact: true });
      const paid = p.getByLabel(/^회사가 지급했거나/);
      step('월 2,600,000 ÷ 209 × 8 × 5 = 497,607(원 미만 마지막에 버림)', '미사용 연차수당은 497,607원입니다', await answer(p));
      await paid.fill('400000');
      step('회사 지급액과 대조', '회사 지급액 400,000원보다 97,607원 많습니다', await answer(p));
      await paid.fill('');
      await p.getByLabel('4명 이하', { exact: true }).check();
      step('상시 4명 이하 = 계산하지 않음(별표1)', /법정 연차수당을 계산하지 않습니다.*4명 이하/, await answer(p));
      await p.getByLabel('5명 이상', { exact: true }).check();
      await weekly.fill('14');
      step('주 14시간 = 계산하지 않음(§18③)', '15시간 미만', await answer(p));
      await weekly.fill('40');
      await p.getByLabel('했다', { exact: true }).check();
      step('촉진했다 — 금액 그대로 + 「했다면」 안내', /497,607원.*지급 의무가 없을 수 있습니다.*빼지 않은 값/, await answer(p));
      await p.getByLabel('퇴직하면서', { exact: true }).check();
      step('퇴직 시 — 14일 이내(§36)', /퇴직 시 미사용 연차수당은 497,607원.*14일 이내/, await answer(p));
      await p.getByLabel('입사일로 발생 누계를 센다').check();
      await p.getByLabel(/^월급\(/).fill('3135000');
      await p.getByLabel('입사일', { exact: true }).fill('2025-11-01');
      await p.getByLabel('마지막 재직일').fill('2026-10-31');
      step('1년 근로 직후 종료 = 11일(2021다227100)', '1,320,000원', await answer(p));
      await p.getByLabel('마지막 재직일').fill('2026-11-01');
      step('366일째 재직 = 26일(2022다245419)', '3,120,000원', await answer(p));
      await p.getByLabel('입사일', { exact: true }).fill('2016-01-01');
      await p.getByLabel('마지막 재직일').fill('2017-01-01');
      step('1년차가 2018. 5. 29. 전 = 월 연차가 15일에 포함(구 §60③, 법제처 18-0067)', '1,800,000원', await answer(p));
      await p.getByLabel('단시간 근로자').check();
      await p.getByLabel('시급', { exact: true }).check();
      await p.getByLabel(/^시급\(/).fill('11000');
      await weekly.fill('23');
      await p.getByLabel('통상 근로자라면 생겼을 연차일수').fill('16');
      step('단시간 16 × 23/40 × 8 = 73.6 → 74시간 × 11,000(별표2)', /814,000원.*남은 연차 74시간/, await answer(p));
    },
  },
  'daily-worker-tax': {
    path: '/tools/daily-worker-tax',
    journey: async (p, step) => {
      // 기대값 = tests/unit/calc-daily-worker-tax.test.ts 사례(리서치 독립 스크립트 값). 지급 건마다 section[aria-label="지급 N"], 줄마다 group 「줄 N」
      const pay = (n: number) => p.locator(`section[aria-label="지급 ${n}"]`);
      const line = (n: number, j: number) => pay(n).getByRole('group', { name: `줄 ${j}`, exact: true });
      const fill = async (n: number, j: number, wage: string, days: string) => {
        await line(n, j).getByLabel('일급(원)').fill(wage);
        await line(n, j).getByLabel('일수').fill(days);
      };
      step('일용근로자 여부를 먼저 묻는다', '먼저 일용근로자인지 골라 주세요', await answer(p));
      await p.getByLabel('3개월(건설공사 종사자는 1년) 이상 계속 고용되어 있다', { exact: true }).check();
      step('3개월 이상 계속 고용 = 계산하지 않음 · 간이세액표', /계산하지 않습니다.*간이세액표/, await answer(p));
      await p.getByLabel('일용근로자다', { exact: true }).check();
      step('일급 없음', '지급 1의 일급을 넣어 주세요', await answer(p));
      await fill(1, 1, '200000', '1');
      step('A 200,000 × 1일 = 1,350 / 130', '예상 원천징수 소득세는 1,350원, 지방소득세는 130원입니다', await answer(p));
      await fill(1, 1, '200000', '7');
      step('B 서식 예시 7일 = 9,450 / 945 → 940', '9,450원, 지방소득세는 940원', await answer(p));
      await fill(1, 1, '180000', '1');
      step('D 180,000 × 1일 = 810원 → 소액부징수 0', /소득세는 0원입니다.*810원이 1,000원 미만이라 징수하지 않습니다/, await answer(p));
      await fill(1, 1, '180000', '5');
      step('E 같은 5일을 한 번에 지급 = 4,050 / 400', '4,050원, 지방소득세는 400원', await answer(p));
      await fill(1, 1, '187037', '1');
      step('I1 187,037 = 999.999원 → 0', /999\.999원이 1,000원 미만/, await answer(p));
      await fill(1, 1, '187038', '1');
      step('I2 187,038 = 1,000 / 100', '1,000원, 지방소득세는 100원', await answer(p));
      await fill(1, 1, '150000', '3');
      step('G 15만원 이하 = 과세표준 0(소액부징수가 아님)', /0원입니다.*과세표준이 0원/, await answer(p));
      await fill(1, 1, '187170', '3');
      step('K 끝수 순서로 갈리면 두 값', /3,010원, 지방소득세는 300원.*먼저 버리고 더하면 소득세 3,000원.*확인하지 못해/, await answer(p));
      // J — 날별 일급이 다르면 날마다 계산(평균 175,000 × 2 로 넣으면 1,350)
      await fill(1, 1, '100000', '1');
      await pay(1).getByRole('button', { name: '일급이 다른 날 더하기' }).click();
      await fill(1, 2, '250000', '1');
      step('J 100,000 + 250,000 = 2,700 / 270', '2,700원, 지방소득세는 270원', await answer(p));
      await line(1, 2).getByRole('button', { name: '줄 빼기' }).click();
      // L — 지급 2건: 2일분 1,620 / 160 + 1일분 810 → 0
      await fill(1, 1, '180000', '2');
      await p.getByRole('button', { name: '지급 더하기' }).click();
      await fill(2, 1, '180000', '1');
      step('L 지급 2건 = 1,620 / 160, 1일분은 0', /지급 2건의 예상 원천징수 소득세는 모두 1,620원, 지방소득세는 160원.*지급 2 — 1일분 180,000원: 세액 810원 → 1,000원 미만이라 0원/, await answer(p));
      // F — 같은 5일을 매일 지급(5건) = 모두 0
      await fill(1, 1, '180000', '1');
      for (const n of [3, 4, 5]) {
        await p.getByRole('button', { name: '지급 더하기' }).click();
        await fill(n, 1, '180000', '1');
      }
      step('F 매일 지급 5건 = 모두 0', '지급 5건의 예상 원천징수 소득세는 모두 0원, 지방소득세는 0원입니다', await answer(p));
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
