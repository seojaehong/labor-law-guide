// 고용형태 특칙 — 기간제법 §4(사용기간 2년)·§6(단시간 초과근로 12시간).
//
// FIXED-TERM-2Y: 기간제만 적용. 계약기간이 2년 초과(end ≥ start+2년, 양끝 포함이라
//   end == start+2년이면 2년+1일) → risk(무기계약 간주 검토).
//   2년 이하는 ok — 갱신이력은 데이터에 없으므로 detail에 "갱신 누계 별도 확인".
// PART-TIME-OT: 단시간만 적용, 상시 4인 이하(employee_count_5plus=false)는 비적용(기간제법 시행령 §2 별표1),
//   미기재면 detail 에 「5인 이상 사업장 전제」. 소정 = normalize 의 weekly_scheduled_hours(근로일별 시간, 휴게 차감).
//   근로일별 시간이 없거나 믿을 수 없으면(weekly_scheduled_source !== 'daily') 소정=실근로로 보아 초과 0 — 행 수가 주 근무일수와
//   다르면 그 사실(DAILY_MISMATCH_NOTE)을, 행이 없거나 결손이면 「근로일별 시간 미명시」를 적는다.
//   초과 = normalize.partTimeExcessHours(포괄 총액 역산 D 와 같은 함수) > 12H → violation(§6①),
//   12H 이내 초과는 partTimePremium(금액 기준, 261101 법리 E)으로 ok·risk·needs_data(§6③ 50% 가산).
//   근로일별 행 합이 출근·퇴근 칸 합보다 길면(normalize.dailyHoursConflict) 단시간 여부도 소정·실근로도 정하지 않고 두 시간을
//   적어 needs_data(261102 K3) — 상시 4인 이하면 그래도 비적용.

import {
  DAILY_MISMATCH_NOTE,
  FIXED_TERM_TYPES,
  OT_PREMIUM_RATE,
  PART_TIME_TYPES,
  WAGE_MATH_TOLERANCE,
  WEEKS_PER_MONTH,
  dailyHoursConflict,
  dailyScheduleState,
  partTimeExcessHours,
} from '../normalize';
import type { Contract, Finding } from '../types';
import { makeFinding, type RuleFn } from './index';

export const FIXED_TERM_LIMIT_YEARS = 2;
export const PART_TIME_OT_LIMIT_HOURS = 12;
const DAYS_PER_YEAR = 365.25;
const MS_PER_DAY = 86400000;

const round1 = (x: number) => Math.round(x * 10) / 10;

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

function addYears(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const result = new Date(Date.UTC(y, m, d.getUTCDate()));
  // 2/29 → 2/28
  if (result.getUTCMonth() !== m) return new Date(Date.UTC(y, m, 28));
  return result;
}

function fmtH(hours: number): string {
  // 초과시간은 반올림 전 값(5.6667)으로 계산하고 표시만 소수 둘째 자리로
  return String(Math.round(hours * 100) / 100);
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

export const ruleFixedTerm2y: RuleFn = (contract) => {
  const empType = contract.employee?.employment_type ?? '';
  if (!FIXED_TERM_TYPES.has(empType)) {
    return makeFinding('FIXED-TERM-2Y', 'ok', '기간제 아님 — 비적용');
  }
  const period = contract.period ?? {};
  const start = parseDate(period.start_date);
  const end = parseDate(period.end_date);
  if (!start || !end) {
    return makeFinding('FIXED-TERM-2Y', 'needs_data', '계약 시작일·종료일 미기재 — 기간 산정 불가');
  }
  const years = round1(((end.getTime() - start.getTime()) / MS_PER_DAY + 1) / DAYS_PER_YEAR);
  if (end.getTime() >= addYears(start, FIXED_TERM_LIMIT_YEARS).getTime()) {
    return makeFinding(
      'FIXED-TERM-2Y',
      'risk',
      `계약기간 ${years}년 > 2년 — 무기계약 간주 검토(기간제법 §4②)`,
    );
  }
  return makeFinding('FIXED-TERM-2Y', 'ok', `계약기간 ${years}년 ≤ 2년 — 갱신 누계 별도 확인`);
};

type Premium =
  | { kind: 'ok'; text: string }
  | { kind: 'missing' | 'low' | 'short'; text: string }
  | { kind: 'unknown'; text: string };

/** 단시간 초과근로 가산(기간제법 §6③) 충분성 — 이름이 아니라 금액으로 본다(261101 법리 E).
 * OT_* 항목만 본다. 가산율이 적혀 있고 1.5 미만이면 불인정. 그 밖에는 Σ지급액 ≥ 통상시급 × 초과H × 4.345 × 1.5(±10원).
 * 통상시급을 모르면 환산시간 Σbasis_hours×(가산율 or 1) ≥ 초과H × 4.345 × 1.5 로 본다.
 * 금액이 모자라도 항목에 가산율·시간이 모두 없으면(사이트 폼 연장수당 모양) 판단 불가 — needs_data. */
export function partTimePremium(contract: Contract, excess: number): Premium {
  const ots = (contract.wage?.items ?? []).filter((i) => String(i.code ?? '').startsWith('OT_'));
  if (ots.length === 0) return { kind: 'missing', text: '초과근로 가산 지급 항목 없음' };
  const low = ots.find((i) => i.rate_multiplier != null && i.rate_multiplier < OT_PREMIUM_RATE);
  if (low) return { kind: 'low', text: `${low.label ?? low.code} 가산율 ${low.rate_multiplier} < 1.5` };
  const requiredH = round1(excess * WEEKS_PER_MONTH * OT_PREMIUM_RATE);
  const rate = contract.wage?.ordinary_hourly_rate;
  const paid = ots.reduce((s, i) => s + (i.amount ?? 0), 0);
  if (rate != null) {
    const required = Math.round(rate * excess * WEEKS_PER_MONTH * OT_PREMIUM_RATE);
    const compare = `초과근로 지급액 ${fmt(paid)}원 / 필요 ${fmt(required)}원(통상시급 ${fmt(rate)}×${fmtH(excess)}H×4.345×1.5)`;
    if (paid >= required - WAGE_MATH_TOLERANCE) return { kind: 'ok', text: `${compare} 충족` };
    const noInfo = ots.every((i) => i.rate_multiplier == null && i.basis_hours == null);
    return noInfo
      ? { kind: 'unknown', text: `${compare} — 금액만으로는 미달이나 가산 대상 시간을 알 수 없음` }
      : { kind: 'short', text: `${compare} — 부족` };
  }
  const covered = round1(ots.reduce((s, i) => s + (i.basis_hours ?? 0) * (i.rate_multiplier ?? 1), 0));
  if (covered >= requiredH) return { kind: 'ok', text: `초과근로 환산 ${covered}H ≥ 필요 ${requiredH}H` };
  return { kind: 'unknown', text: `통상시급 미상 — 초과근로 환산 ${covered}H, 필요 ${requiredH}H` };
}

export const rulePartTimeOt: RuleFn = (contract) => {
  const empType = contract.employee?.employment_type ?? '';
  // 행이 칸보다 길면 행으로 정한 고용형태(통상)도 믿을 수 없다 — 「단시간 아님」으로 넘기지 않는다
  const conflict = dailyHoursConflict(contract);
  if (!PART_TIME_TYPES.has(empType) && !conflict) {
    return makeFinding('PART-TIME-OT', 'ok', '단시간 아님 — 비적용');
  }
  const fivePlus = contract.workplace?.employee_count_5plus;
  if (fivePlus === false) {
    return makeFinding(
      'PART-TIME-OT',
      'ok',
      '상시 4인 이하 사업장 — 비적용(기간제법 시행령 §2 별표1: 제3장 중 §7만 적용)',
    );
  }
  const premise = fivePlus == null ? ' (상시 5인 이상 사업장 전제)' : '';
  if (conflict) {
    return makeFinding('PART-TIME-OT', 'needs_data', `${conflict} — 소정·실근로시간 확인 필요${premise}`);
  }
  const actual = contract.work_time?.weekly_actual_hours;
  if (actual == null) {
    return makeFinding('PART-TIME-OT', 'needs_data', `주간 실근로시간 산정 불가${premise}`);
  }
  // 근로일별 시간을 믿을 수 있을 때만(normalize 출처 daily — 행이 모두 유효하고 행 수 = 주 근무일수) 소정으로 본다
  const workTime = contract.work_time ?? {};
  const fromDaily = workTime.weekly_scheduled_source === 'daily';
  const contracted = fromDaily ? workTime.weekly_scheduled_hours : null;
  if (contracted == null) {
    const why = dailyScheduleState(workTime) === 'mismatch' ? DAILY_MISMATCH_NOTE : '근로일별 시간 미명시';
    return makeFinding('PART-TIME-OT', 'ok', `${why} — 소정=실근로 ${fmtH(actual)}H로 보아 초과 없음${premise}`);
  }
  const excess = partTimeExcessHours(contract) ?? 0;
  const head = `소정 주 ${fmtH(contracted)}H(근로일별 시간, 휴게 제외) 대비 실근로 ${fmtH(actual)}H`;
  if (excess <= 0) {
    return makeFinding('PART-TIME-OT', 'ok', `${head} — 초과근로 없음${premise}`);
  }
  const premium = partTimePremium(contract, excess);
  if (excess > PART_TIME_OT_LIMIT_HOURS) {
    return makeFinding(
      'PART-TIME-OT',
      'violation',
      `${head} — 초과 ${fmtH(excess)}H > 한도 ${PART_TIME_OT_LIMIT_HOURS}H(기간제법 §6①)` +
        (premium.kind === 'ok' ? '' : ` / 50% 가산(§6③): ${premium.text}`) +
        premise,
    );
  }
  const within = `초과 ${fmtH(excess)}H ≤ 한도 ${PART_TIME_OT_LIMIT_HOURS}H`;
  if (premium.kind === 'ok') {
    return makeFinding('PART-TIME-OT', 'ok', `${within}, 50% 가산 — ${premium.text}${premise}`);
  }
  if (premium.kind === 'unknown') {
    const why = contract.wage?.ordinary_hourly_rate == null ? '통상시급을 알 수 없어' : '연장 항목의 시간·가산율이 없어';
    return makeFinding(
      'PART-TIME-OT',
      'needs_data',
      `${within} — ${why} 통상임금 50% 가산(기간제법 §6③) 충족 여부 판단 불가: ${premium.text}${premise}`,
    );
  }
  return makeFinding(
    'PART-TIME-OT',
    'risk',
    `${within}이나 통상임금 50% 이상 가산(기간제법 §6③) 근거 부족 — ${premium.text}${premise}`,
  );
};

export const EMPLOYMENT_RULES: RuleFn[] = [ruleFixedTerm2y, rulePartTimeOt];

export function runEmploymentRules(contract: Contract): Finding[] {
  return EMPLOYMENT_RULES.map((rule) => rule(contract));
}
