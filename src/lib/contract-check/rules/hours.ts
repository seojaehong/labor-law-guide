// 근로시간 규칙 — 주 52시간 상한·휴게시간·야간근로 가산.
//
// WH-52CAP: weekly_actual_hours > 52 violation, == 52.0 risk(여유 0), < 52 ok
// WH-BREAK: 4h당 30분·8h당 1h 총량 미달 violation, 총량 충족해도 10분 미만 조각 있으면 risk
// NIGHT-WORK: night_work=true인데 NIGHT 임금항목 없으면 risk, false면 ok

import { dayWorkMinutes } from '../normalize';
import type { Contract, Finding } from '../types';
import { makeFinding, type RuleFn } from './index';

export const WEEKLY_CAP_HOURS = 52.0;
export const BREAK_FRAGMENT_MIN = 10;

const round2 = (x: number) => Math.round(x * 100) / 100;

export const ruleWh52Cap: RuleFn = (contract) => {
  const actual = contract.work_time?.weekly_actual_hours;
  if (actual == null) return makeFinding('WH-52CAP', 'needs_data', '주간 실근로시간 산정 불가');
  if (actual > WEEKLY_CAP_HOURS) {
    return makeFinding(
      'WH-52CAP',
      'violation',
      `실근로 주 ${actual}h > 한도 52h (초과 ${round2(actual - WEEKLY_CAP_HOURS)}h)`,
    );
  }
  if (actual === WEEKLY_CAP_HOURS) {
    return makeFinding('WH-52CAP', 'risk', `실근로 주 ${actual}h — 한도 여유 0, 초과 즉시 위반`);
  }
  return makeFinding('WH-52CAP', 'ok', `실근로 주 ${actual}h ≤ 한도 52h`);
};

/** 근로기준법 §54: 4시간당 30분, 8시간당 1시간 이상. */
function requiredBreakMinutes(dayMinutes: number): number {
  if (dayMinutes >= 8 * 60) return 60;
  if (dayMinutes >= 4 * 60) return 30;
  return 0;
}

export const ruleWhBreak: RuleFn = (contract) => {
  const wt = contract.work_time ?? {};
  const breaks = wt.breaks ?? [];
  const { start, end } = wt;
  if (!start || !end || breaks.length === 0) {
    return makeFinding('WH-BREAK', 'needs_data', '근무시간대 또는 휴게 내역 미기재');
  }
  const total = wt.break_total_minutes || breaks.reduce((sum, b) => sum + (b.minutes ?? 0), 0);
  const dayMinutes = dayWorkMinutes(start, end, breaks);
  const required = requiredBreakMinutes(dayMinutes);
  if (total < required) {
    return makeFinding(
      'WH-BREAK',
      'violation',
      `휴게 총량 ${total}분 < 법정 최소 ${required}분 (1일 실근로 ${round2(dayMinutes / 60)}h)`,
    );
  }
  const fragments = breaks.filter((b) => (b.minutes ?? 0) < BREAK_FRAGMENT_MIN);
  if (fragments.length > 0) {
    const sizes = fragments.map((b) => `${b.minutes}분`).join('·');
    return makeFinding(
      'WH-BREAK',
      'risk',
      `총량 ${total}분 충족하나 10분 미만 조각 ${fragments.length}건(${sizes}) 분할 — 실질 휴게 인정 곤란`,
    );
  }
  return makeFinding('WH-BREAK', 'ok', `휴게 총량 ${total}분 ≥ 법정 ${required}분, 조각 분할 없음`);
};

export const ruleNightWork: RuleFn = (contract) => {
  const night = contract.work_time?.night_work;
  if (night == null) return makeFinding('NIGHT-WORK', 'needs_data', '야간근로 여부 미기재');
  if (!night) return makeFinding('NIGHT-WORK', 'ok', '야간근로 없음');
  const hasNightItem = (contract.wage?.items ?? []).some((i) =>
    String(i.code ?? '').includes('NIGHT'),
  );
  if (hasNightItem) return makeFinding('NIGHT-WORK', 'ok', '야간근로 가산 항목 명시됨');
  return makeFinding(
    'NIGHT-WORK',
    'risk',
    '야간근로 있으나 NIGHT 가산 항목 없음 — 가산수당 지급근거 불명',
  );
};

export const HOURS_RULES: RuleFn[] = [ruleWh52Cap, ruleWhBreak, ruleNightWork];

export function runHoursRules(contract: Contract): Finding[] {
  return HOURS_RULES.map((rule) => rule(contract));
}
