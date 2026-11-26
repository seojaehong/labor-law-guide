// 월급 대조 — 엔진(src/lib/pay-check) 결과 위에 얹는 입력 범위·최저임금 확인. 화면(PayCheckClient)과 MCP(check_monthly_pay)가 함께 쓴다.
// 엔진 사본은 원본(~/dev/pay-exception-check)과 내용이 같아야 해서(tests/unit/pay-check-sync.test.ts) 여기서 고치지 않는다.
// 최저시급 표(src/content/rates.ts)는 사이트 쪽 자료라 엔진에 넣지 않는다. 확인 함수는 순수 함수로 두어 나중에 엔진으로 옮길 수 있게 한다.
//
// 규칙
//  - 엔진이 「대조 일치」·「어긋남 가능성」을 냈을 때만 본다. 엔진이 멈춘 결과(확인 필요·범위 밖)는 그대로 둔다.
//  - 멈출 이유는 모두 모은다(하나에서 끊지 않는다). 멈추면 확인 필요로 바꾸고 금액은 비운다(엔진 규칙: 확인 필요는 금액을 싣지 않는다).
//  - 비교하지 못한 전제(급여기간이 없어 최저시급을 정할 수 없음 등)는 멈추지 않고 「확인되지 않은 채 남은 것」에 남긴다.

import { check, isoDate } from '@/lib/pay-check/check';
import { num } from '@/lib/pay-check/policies';
import type { CheckInput, CheckResult, Confirmed } from '@/lib/pay-check/types';
import { rateOn } from '@/content/rates';

interface Stop {
  code: string;
  observation: string;
  question: string;
  evidence: string[];
  citations: string[];
}
interface Note {
  code: string;
  text: string;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const fmt = (n: number) => n.toLocaleString('ko-KR');

/** YYYY-MM-DD 두 날짜 사이 달력일수(양 끝 포함). */
function calendarDays(from: string, to: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(to) - t(from)) / 86_400_000) + 1;
}

/** 중도입사 = 입사일 ~ 급여기간 마지막 날, 중도퇴사 = 급여기간 첫날 ~ 퇴사일. 날짜가 없으면 null(엔진이 이미 멈춘다). */
function employedDays(input: CheckInput): { days: number; from: string; to: string } | null {
  const c = input.confirmed;
  const ps = isoDate(c.pay_period_start), pe = isoDate(c.pay_period_end);
  if (input.scenario === 'MID_JOIN') {
    const s = isoDate(c.employment_start);
    return s && pe ? { days: calendarDays(s, pe), from: s, to: pe } : null;
  }
  if (input.scenario === 'MID_LEAVE') {
    const e = isoDate(c.employment_end);
    return ps && e ? { days: calendarDays(ps, e), from: ps, to: e } : null;
  }
  return null;
}

function rangeStops(input: CheckInput, r: CheckResult): Stop[] {
  const c = input.confirmed, out: Stop[] = [];
  const month = input.scenario === 'MID_JOIN' ? '입사월' : '퇴사월';
  const emp = employedDays(input);
  if (input.policy_id === 'DAY_30') {
    const d = num(c, 'eligible_days')!, m = num(c, 'monthly_base_pay')!;
    if (d < 0) {
      out.push({ code: 'ELIGIBLE_DAYS_OUT_OF_RANGE', observation: `인정일수 ${fmt(d)}일은 0보다 작습니다.`, question: '인정일수를 다시 확인해 주세요.', evidence: [`명세서 ${month} 급여 계산 내역`], citations: [] });
    } else if (emp && d > emp.days) {
      out.push({
        code: 'ELIGIBLE_DAYS_OVER_EMPLOYED_DAYS',
        observation: `인정일수 ${fmt(d)}일이 이 급여기간의 재직 달력일수 ${emp.days}일(${emp.from}~${emp.to})보다 많습니다.`,
        question: `회사가 ${month} 인정일수를 어떻게 셌는지(재직하지 않은 날을 30일에서 빼는 방식인지 등) 확인해 주세요.`,
        evidence: [`명세서 ${month} 급여 계산 내역`, `${month} 계산 기준이 적힌 근로계약서·취업규칙 조항`],
        citations: [],
      });
    }
    if (r.expected_amount !== null && r.expected_amount > m) {
      out.push({
        code: 'EXPECTED_OVER_MONTHLY_BASE',
        observation: `계산값 ${won(r.expected_amount)}이 월 기본급 ${won(m)}보다 많습니다. ${month} 일할 금액은 월 기본급을 넘지 않으므로 입력을 다시 확인해 주세요.`,
        question: '월 기본급과 인정일수를 다시 확인해 주세요.',
        evidence: [`명세서 ${month} 급여 계산 내역`],
        citations: [],
      });
    }
  }
  if (input.policy_id === 'HOUR_ACTUAL') {
    const h = num(c, 'paid_hours')!;
    const cap = emp ? emp.days * 24 : null;
    if (h < 0 || (cap !== null && h > cap)) {
      out.push({
        code: 'PAID_HOURS_OUT_OF_RANGE',
        observation: h < 0
          ? `유급 처리된 시간 ${fmt(h)}시간은 0보다 작습니다.`
          : `유급 처리된 시간 ${fmt(h)}시간이 재직 달력일수 ${emp!.days}일(${emp!.from}~${emp!.to})의 24시간 합계 ${fmt(cap!)}시간보다 많습니다.`,
        question: `명세서가 ${month} 유급 처리 시간을 몇 시간으로 계산했는지 확인해 주세요.`,
        evidence: ['근무표·출퇴근기록', `명세서 ${month} 급여 계산 내역`],
        citations: [],
      });
    }
  }
  if (input.policy_id === 'ABSENCE_HOUR') {
    const h = num(c, 'unpaid_absence_hours')!;
    if (h < 0) {
      out.push({ code: 'ABSENCE_HOURS_OUT_OF_RANGE', observation: `무급 결근시간 ${fmt(h)}시간은 0보다 작습니다.`, question: '무급 결근시간을 다시 확인해 주세요.', evidence: ['결근 처리 내역'], citations: [] });
    }
  }
  return out;
}

/** 근로기준법 제2조제1항제8호: 소정근로시간은 제50조(1주 40시간·1일 8시간) 등의 범위에서 정한 근로시간이다. */
function scheduledHourStops(input: CheckInput): Stop[] {
  if (input.policy_id !== 'WEEKLY_HOLIDAY_FIXED') return [];
  const c = input.confirmed, out: Stop[] = [];
  const h4 = num(c, 'four_week_scheduled_hours')!, d4 = num(c, 'full_time_scheduled_days_4w')!;
  const weeks = num(c, 'averaging_weeks') ?? 4;
  const cites = ['근로기준법 제2조제1항제8호', '근로기준법 제50조'];
  const evidence = ['근로계약서(약정 근로시간)', '근무표'];
  if (h4 > 40 * weeks) {
    out.push({
      code: 'WEEKLY_HOURS_OVER_40',
      observation: `${weeks}주 약정 소정근로시간 ${fmt(h4)}시간은 1주 평균 ${Math.round((h4 / weeks) * 100) / 100}시간으로 40시간을 넘습니다. 소정근로시간은 1주 40시간 범위에서 정하므로(근로기준법 제2조제1항제8호·제50조제1항) 이 값으로 주휴를 계산하지 않습니다.`,
      question: '근로계약서에 적힌 1주 소정근로시간(연장근로를 뺀 시간)을 확인해 주세요.',
      evidence,
      citations: cites,
    });
  }
  if (d4 > 0 && h4 > 8 * d4) {
    out.push({
      code: 'DAILY_HOURS_OVER_8',
      observation: `1일 소정근로시간이 ${fmt(h4)}시간 ÷ ${fmt(d4)}일 = ${Math.round((h4 / d4) * 100) / 100}시간으로 8시간을 넘습니다. 소정근로시간은 1일 8시간 범위에서 정하므로(근로기준법 제2조제1항제8호·제50조제2항) 이 값으로 주휴를 계산하지 않습니다.`,
      question: '약정 소정근로시간과 같은 기간 통상 근로자의 소정근로일수, 탄력적 근로시간제 등 다른 근로시간 제도를 쓰는지 확인해 주세요.',
      evidence,
      citations: cites,
    });
  }
  return out;
}

const HOURLY_POLICIES = new Set(['HOUR_ACTUAL', 'ABSENCE_HOUR', 'WEEKLY_HOLIDAY_FIXED']);

/** 급여기간 양 끝 날짜의 최저시급과 비교한다(해가 바뀌는 기간이면 둘 다). 기준일 값이 표에 없으면 다른 해 값으로 비교하지 않는다. */
function minWage(c: Confirmed, policy: string | null): { stop: Stop | null; note: Note | null } {
  if (!policy || !HOURLY_POLICIES.has(policy)) return { stop: null, note: null };
  const rate = num(c, 'hourly_rate')!;
  const ps = isoDate(c.pay_period_start), pe = isoDate(c.pay_period_end);
  const notCompared = (why: string): { stop: null; note: Note } => ({
    stop: null,
    note: { code: 'MIN_WAGE_NOT_COMPARED', text: `최저임금 비교 안 함 — ${why} 확정 시급이 그 기간의 최저임금 시간급 이상인지는 확인하지 못했습니다.` },
  });
  if (!ps || !pe || ps > pe) return notCompared('급여기간이 입력되지 않아 적용할 최저임금 시간급을 정하지 못했습니다.');
  const lows = [...new Set([ps, pe])].map((d) => ({ d, r: rateOn('minWageHourly', d) }));
  if (lows.some((x) => x.r === null)) return notCompared(`급여기간(${ps}~${pe})에 적용할 최저임금 시간급이 이 도구의 표에 없습니다.`);
  const below = lows.filter((x) => rate < x.r!.value);
  if (!below.length) return { stop: null, note: null };
  const min = Math.max(...below.map((x) => x.r!.value));
  return {
    stop: {
      code: 'MIN_WAGE_BELOW',
      observation: `확정 시급 ${won(rate)}이 급여기간(${ps}~${pe})에 적용되는 최저임금 시간급 ${won(min)}보다 낮습니다(최저임금법 제6조제1항). 이 시급으로는 대조 결과를 내지 않습니다.`,
      question: '확정 시급이 맞는지, 수습 중 감액(최저임금법 제5조제2항)이나 적용 제외 인가(같은 법 제7조)에 해당하는지 확인해 주세요.',
      evidence: ['시급이 적힌 근로계약서'],
      citations: ['최저임금법 제6조제1항', '최저임금법 제5조제2항', '최저임금법 제7조'],
    },
    note: null,
  };
}

export function checkGuarded(input: CheckInput): CheckResult {
  const r = check(input);
  if (r.status !== 'MATCH' && r.status !== 'POTENTIAL_MISMATCH') return r;
  const mw = minWage(input.confirmed, input.policy_id);
  const stops = [...rangeStops(input, r), ...scheduledHourStops(input), ...(mw.stop ? [mw.stop] : [])];
  const notes = mw.note ? [mw.note] : [];
  if (!stops.length) {
    if (!notes.length) return r;
    return { ...r, reasons: [...r.reasons, ...notes.map((n) => n.code)], open_confirmations: [...r.open_confirmations, ...notes.map((n) => n.text)] };
  }
  return {
    ...r,
    status: 'NEEDS_CONFIRMATION',
    expected_amount: null,
    payslip_amount: null,
    difference: null,
    reasons: [...stops.map((s) => s.code), ...notes.map((n) => n.code)],
    observation: stops.map((s) => s.observation).join(' '),
    grounds: [],
    conditions: [],
    open_confirmations: notes.map((n) => n.text),
    evidence_needed: [...new Set(stops.flatMap((s) => s.evidence))].slice(0, 3),
    required_question: [...new Set(stops.map((s) => s.question))].join(' '),
    citations: [...new Set([...r.citations, ...stops.flatMap((s) => s.citations)])],
  };
}

/** MCP·복사본용: 금액이 확인된 결과인지와 확인되지 않은 전제. 엔진·감싸개 결과에서만 읽는다(입력값을 다시 보지 않는다). */
export function unconfirmedPremises(r: CheckResult): { confirmed: boolean; warnings: { code: string; text: string }[] } {
  const codes = r.reasons.filter((x) => x === 'BASIS_NOT_DOCUMENTED' || x === 'WEEKLY_HOLIDAY_NOT_DESIGNATED' || x === 'MIN_WAGE_NOT_COMPARED');
  const warnings = codes.map((code, i) => ({ code, text: r.open_confirmations[i] ?? '' }));
  return { confirmed: (r.status === 'MATCH' || r.status === 'POTENTIAL_MISMATCH') && r.open_confirmations.length === 0, warnings };
}
