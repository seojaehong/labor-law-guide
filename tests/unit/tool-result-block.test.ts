// 계산기 공용 결과 블록(261124) — 결과 글자 모델(result.ts)을 고정한다.
// ① 숫자는 바뀌지 않는다: 261124 이전 화면에서 실측한 글자(주석)와 같아야 한다.
// ② 기준일은 코드의 실제 값(rates.ts from·checked, exit-worker-data CHECKED)에서만 나온다.
// ③ 0원·해당 없음에도 다음 할 일이 있고, 링크는 실제로 있는 경로다.
// ④ 결과 문장에 금지어가 없다(tool-banned-words 의 ROOTS 밖 파일이라 여기서 본다).
// 화면 렌더 시험 기반(jsdom)이 없어 컴포넌트는 소스 글자로만 본다(contract-write-card.test.ts 와 같은 방식).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CHECKED } from '@/content/exit-worker-data';
import { rateOn } from '@/content/rates';
import { TOOLS } from '@/content/tools-registry';
import { calculateEntitlement } from '@/lib/leave/annual-leave';
import { calcNoticePay } from '@/lib/calc/notice-pay';
import { checkMinWage } from '@/lib/calc/min-wage';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { ResultView } from '@/components/tool-result/result-view';
import { dotDate, minWageAsOf } from '@/components/tool-result/result-view';
import { defaultWageNote, weeklyHolidayView, weeklyHoursWarning } from '@/app/tools/weekly-holiday-pay/result';
import { exitResultView } from '@/app/exit/result';
import { estimateLeavePay, estimateSeverance, severanceCheck } from '@/app/exit/exit-calc';
import { noticePayView } from '@/app/tools/notice-pay/result';
import { minWageView } from '@/app/tools/min-wage/result';

const MIN_2026 = rateOn('minWageHourly', '2026-11-24')!;
const MIN_2027 = rateOn('minWageHourly', '2027-01-01')!;

function weekly(hourlyWage: number, weeklyHours: number, fullAttendance = true) {
  const r = calcWeeklyHoliday({ hourlyWage, weeklyHours, fullAttendance, fullTimeDays: 5 });
  return { r, v: weeklyHolidayView({ r, hourlyWage, weeklyHours, fullTimeDays: 5, minWage: MIN_2026 }) };
}

function exitView() {
  // 합성 입력 — 마지막 근무일 2026-11-30, 입사 2023-03-02, 월 3,000,000, 주 40시간, 남은 연차 5일
  const hire = '2023-03-02';
  const last = '2026-11-30';
  const check = severanceCheck(hire, last, 40);
  const sev = estimateSeverance(hire, last, 3_000_000);
  const lv = estimateLeavePay(3_000_000, 40, 5);
  const ent = calculateEntitlement({ hireDate: hire, asOf: last });
  return exitResultView({ check, sev, lv, ent, unusedLeaveDays: 5 });
}

const allText = (v: ResultView) => [
  v.status, ...v.verdict, ...(v.meta ?? []), ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.formula ?? '', ...(v.warnings ?? []), ...v.basis.map((b) => b.label), ...v.asOf, v.caveat ?? '', v.nextNote ?? '', ...v.next.map((n) => n.label),
].join('\n');

/** 다음 할 일 링크가 실제로 있는가 — 도구 목록, 앱 경로(page.tsx), 정적 파일, 같은 쪽 안 닻(#) */
function hrefExists(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (TOOLS.some((t) => t.href === href)) return true;
  if (href.endsWith('.html')) return existsSync(`public${href}`);
  return existsSync(`src/app${href}/page.tsx`);
}

describe('주휴수당 결과 블록 — 숫자 고정', () => {
  it('시급 12,000원 × 주 20시간 = 1주 48,000원, 한 달 평균 약 208,571원(261124 이전 화면 실측)', () => {
    const { v } = weekly(12_000, 20);
    expect(v.amounts.map((a) => a.value)).toEqual(['48,000원', '약 208,571원']);
    expect(v.formula).toContain('시급 12,000원 × 하루 4시간');
    expect(v.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
  });
  it('주 40시간 최저임금 = 82,560원(verify-llg 기본 단계)', () => {
    expect(weekly(MIN_2026.value, 40).v.amounts[0].value).toBe('82,560원');
  });
});

describe('주휴수당 — 0원 결과에도 다음 할 일', () => {
  it('주 14시간: 없음 + 계약서·실제 근무 안내 + 실제 경로 링크', () => {
    const { v } = weekly(12_000, 14);
    expect(v.verdict[0]).toBe('1주 14시간이면 주휴수당이 없습니다.');
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toMatch(/계약서에 적힌 시간과 실제로 일하는 시간/);
    expect(v.next.length).toBeGreaterThanOrEqual(1);
    expect(v.next.length).toBeLessThanOrEqual(2);
  });
  it('결근한 주: 없음 + 다음 할 일', () => {
    const { v } = weekly(12_000, 40, false);
    expect(v.verdict[0]).toBe('이번 주는 주휴수당이 없습니다.');
    expect(v.nextNote).toBeTruthy();
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
});

describe('주휴수당 — 비현실 입력 경고(계산은 그대로)', () => {
  it('주 40시간은 경고 없음, 40.5시간부터 경고', () => {
    expect(weeklyHoursWarning(40)).toBeNull();
    expect(weeklyHoursWarning(40.5)).toMatch(/주 40시간/);
  });
  it('주 100시간: 경고가 뜨고 금액은 계산식 그대로(하루 8시간분)', () => {
    const { r, v } = weekly(12_000, 100);
    expect(r.amount).toBe(96_000);
    expect(v.amounts[0].value).toBe('96,000원');
    expect(v.warnings?.some((w) => w.includes('1주 100시간'))).toBe(true);
  });
  it('주 20시간에는 경고가 없다', () => {
    expect(weekly(12_000, 20).v.warnings).toEqual([]);
  });
});

describe('기준일 — 코드의 실제 값에서만', () => {
  it('주휴수당 시급 기본값 출처 = rates.ts 의 2026년 최저임금 줄', () => {
    const note = defaultWageNote(MIN_2026)!;
    expect(note).toContain('10,320원');
    expect(note).toContain('2026년 최저임금');
    expect(note).toContain(MIN_2026.basis);
    expect(note).toContain(MIN_2026.checked.replace(/-/g, '.'));
    expect(defaultWageNote(null)).toBeNull();
  });
  it('주휴수당 기준일 = 최저임금 고시 확인일', () => {
    expect(weekly(12_000, 20).v.asOf).toEqual([`2026년 최저임금(시간당 10,320원) 기준 · 확인 ${dotDate(MIN_2026.checked)}`]);
  });
  it('해는 오늘이 아니라 고시 적용 시작일(from)에서 읽는다', () => {
    expect(minWageAsOf({ from: '2027-01-01', value: 10_700, checked: '2026-10-28' })).toBe('2027년 최저임금(시간당 10,700원) 기준 · 확인 2026.10.28.');
  });
  it('/exit 기준일 = exit-worker-data CHECKED', () => {
    expect(exitView().asOf).toEqual([`법제처 현행 법령 원문 기준 · 확인 ${CHECKED}`]);
  });
  it('해고예고수당은 근거 데이터가 없어 기준일을 비운다', () => {
    const r = calcNoticePay({ unit: 'month', amount: 2_156_880, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30' });
    expect(noticePayView({ r, dailyHours: 8, hire: '2025-01-02', dismissal: '2026-11-30' }).asOf).toEqual([]);
  });
});

describe('/exit 결과 블록 — 숫자 고정(261124 이전 화면 실측)', () => {
  const v = exitView();
  it('요건 판정과 재직일수', () => {
    expect(v.verdict[0]).toBe('퇴직금 요건(계속근로 1년 이상, 주 15시간 이상)에 해당하는 입력입니다');
    expect(v.meta?.[0]).toBe('재직 1,370일 · 계속근로 1년 이상 · 4주 평균 주 15시간 이상');
  });
  it('퇴직금 11,136,535원 · 1일 평균임금 98,901원 = 9,000,000원 ÷ 91일 × 30일 × 1370일 ÷ 365', () => {
    expect(v.amounts[0]).toEqual({
      label: '퇴직금 추정',
      value: '11,136,535원',
      note: ['1일 평균임금 98,901원 = 9,000,000원 ÷ 91일', '× 30일 × 1370일 ÷ 365'],
    });
  });
  it('연차수당 574,163원 · 1일 통상임금 114,832.54원 × 5일 · 법정 연차 16일', () => {
    expect(v.amounts[1].value).toBe('574,163원');
    expect(v.amounts[1].note).toEqual([
      '1일 통상임금 114,832.54원 × 5일(원 미만은 마지막에 올림)',
      '참고 · 마지막 근무일 기준 법정 연차 발생 16일(근속 3년 · 15일 + 가산 1일)',
    ]);
  });
  it('요건 미달이면 해당 없음 + 금품 청산 다음 할 일', () => {
    const check = severanceCheck('2026-03-02', '2026-11-30', 40);
    const nv = exitResultView({ check, sev: null, lv: null, ent: null });
    expect(nv.amounts[0].value).toBe('해당 없음');
    expect(nv.nextNote).toMatch(/14일 안/);
    expect(nv.next.map((n) => n.href)).toContain('#checklist');
  });
});

describe('해고예고수당·최저임금 결과 블록 — 숫자 고정', () => {
  it('해고예고수당 2,476,800원(예고 없음)', () => {
    const r = calcNoticePay({ unit: 'month', amount: 2_156_880, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30' });
    const v = noticePayView({ r, dailyHours: 8, hire: '2025-01-02', dismissal: '2026-11-30' });
    expect(v.amounts[0].value).toBe('2,476,800원');
    expect(v.formula).toContain('1일 통상임금 82,560원(시간당 10,320원 × 8시간) × 30일');
  });
  it('해고예고수당 3개월 미만: 없음 + 다음 할 일', () => {
    const r = calcNoticePay({ unit: 'month', amount: 2_156_880, weeklyHours: 40, dailyHours: 8, hireDate: '2026-09-02', dismissalDate: '2026-11-30' });
    const v = noticePayView({ r, dailyHours: 8, hire: '2026-09-02', dismissal: '2026-11-30' });
    expect(v.verdict).toEqual(['해고예고수당이 없습니다.', '계속 근로한 기간이 3개월이 되지 않았습니다.']);
    expect(v.nextNote).toMatch(/제27조/);
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
  it('최저임금 월 2,156,880원: 2026 이상 · 2027 79,420원 부족, 해마다 기준일 한 줄', () => {
    const rows = [MIN_2026, MIN_2027].map((rate) => ({
      year: Number(rate.from.slice(0, 4)),
      rate,
      r: checkMinWage({ unit: 'month', amount: 2_156_880, monthlyBonus: 0, monthlyWelfareCash: 0, weeklyHours: 40, dailyHours: 8, minHourly: rate.value }),
    }));
    const v = minWageView(rows, 'month');
    expect(v.verdict).toEqual(['2026년 최저임금(시간당 10,320원) 이상입니다.', '2027년 최저임금(시간당 10,700원)보다 한 달 79,420원 적습니다.']);
    expect(v.amounts[0].value).toBe('10,320원');
    expect(v.formula).toBe('한 달 2,156,880원 ÷ 209시간 = 시간당 10,320원');
    expect(v.asOf).toEqual([minWageAsOf(MIN_2026), minWageAsOf(MIN_2027)]);
    expect(v.nextNote).toBeTruthy();
  });
});

describe('공통 — 링크·금지어', () => {
  const views: ResultView[] = [
    weekly(12_000, 20).v, weekly(12_000, 14).v, weekly(12_000, 40, false).v, weekly(9_000, 100).v,
    exitView(),
    exitResultView({ check: severanceCheck('2026-03-02', '2026-11-30', 10), sev: null, lv: estimateLeavePay(1_000_000, 10, 3), ent: null, unusedLeaveDays: 3 }),
  ];
  it('다음 할 일은 1~2개이고 실제로 있는 경로다', () => {
    for (const v of views) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거 조문은 법제처 주소다', () => {
    for (const v of views) for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조$/);
  });
  it('결과 문장에 금지어·느낌표가 없다', () => {
    for (const v of views) {
      expect(bannedHits(allText(v))).toEqual([]);
      expect(allText(v)).not.toMatch(/!/);
    }
  });
  it('ResultBlock 은 aria-live 영역이고 금액은 tabular-nums 다', () => {
    const tsx = readFileSync('src/components/tool-result/ResultBlock.tsx', 'utf8');
    const css = readFileSync('src/components/tool-result/ResultBlock.module.css', 'utf8');
    expect(tsx).toMatch(/aria-live="polite"/);
    expect(css).toMatch(/\.amountValue\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/\.amountValue\s*\{[^}]*font-size:\s*30px/);
  });
});

describe('적용 — 네 계산기가 공용 블록을 쓴다', () => {
  it.each([
    'src/app/tools/weekly-holiday-pay/WeeklyHolidayClient.tsx',
    'src/app/exit/ExitClient.tsx',
    'src/app/tools/notice-pay/NoticePayClient.tsx',
    'src/app/tools/min-wage/MinWageClient.tsx',
  ])('%s', (p) => {
    const src = readFileSync(p, 'utf8');
    expect(src).toMatch(/<ResultBlock /);
    expect(src).not.toMatch(/<AnswerCard /);
  });
  it('주휴수당 라디오 라벨은 44px 히트 영역', () => {
    const src = readFileSync('src/app/tools/weekly-holiday-pay/WeeklyHolidayClient.tsx', 'utf8');
    const radios = src.match(/<label[^>]*>\s*<input type="radio"/g) ?? [];
    expect(radios.length).toBe(2);
    expect(src).toMatch(/const radioLabel = '[^']*min-h-\[44px\]/);
    for (const r of radios) expect(r).toMatch(/className=\{radioLabel\}/);
  });
});
