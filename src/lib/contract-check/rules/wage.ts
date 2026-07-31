// 임금 수치 규칙 — 최저임금·산출근거 정합·연장수당 가산율/충분성·휴일 포괄 충분성.
//
// MINWAGE: 통상시급 ≥ start_date 연도의 최저시급
// WAGE-MATH: item.amount ≟ 통상시급 × basis_hours × (rate_multiplier or 1.0) ±10원
// OT-RATE: OT_* 항목 rate_multiplier 미표기 → risk
// OT-COVER: OT_* basis_hours 합 ≥ weekly_overtime_hours × 4.345 × 1.5
// HOLIDAY-COVER: HOLIDAY_EXTRA 환산H(amount÷통상시급) ≥ 공휴일 예정 근무H × 1.5
//   (public_holiday_note "N일/M.MH" 파싱, 불가 시 needs_data)

import minwageJson from '@/lib/contract-check/data/minwage_table.json';
import type { Contract, Finding, WageItem } from '../types';
import { makeFinding, type RuleFn } from './index';

export const MINWAGE_TABLE: Record<string, number> = minwageJson;

export const WAGE_MATH_TOLERANCE = 10;
export const WEEKS_PER_MONTH = 4.345;
export const OT_PREMIUM_RATE = 1.5;
export const HOLIDAY_PREMIUM_RATE = 1.5;
const HOLIDAY_NOTE_RE = /(\d+)\s*일\s*\/\s*(\d+(?:\.\d+)?)\s*H/;

const round1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (n: number) => n.toLocaleString('ko-KR');

export const ruleMinwage: RuleFn = (contract) => {
  const rate = contract.wage?.ordinary_hourly_rate;
  const start = contract.period?.start_date;
  if (rate == null || !start) {
    return makeFinding('MINWAGE', 'needs_data', '통상시급 또는 계약 시작일 미기재');
  }
  const year = start.slice(0, 4);
  const minimum = MINWAGE_TABLE[year];
  if (minimum === undefined) {
    return makeFinding(
      'MINWAGE',
      'needs_data',
      `${year}년 최저시급 미등록 — minwage_table.json 갱신 필요`,
    );
  }
  if (rate >= minimum) {
    return makeFinding('MINWAGE', 'ok', `통상시급 ${fmt(rate)} ≥ ${year}년 최저시급 ${fmt(minimum)}`);
  }
  return makeFinding(
    'MINWAGE',
    'violation',
    `통상시급 ${fmt(rate)} < ${year}년 최저시급 ${fmt(minimum)} (시간당 ${fmt(minimum - rate)}원 미달)`,
  );
};

export const ruleWageMath: RuleFn = (contract) => {
  const wage = contract.wage ?? {};
  const rate = wage.ordinary_hourly_rate;
  const items = wage.items ?? [];
  if (rate == null || items.length === 0) {
    return makeFinding('WAGE-MATH', 'needs_data', '통상시급 또는 임금 구성항목 없음');
  }
  const mismatches: string[] = [];
  for (const item of items) {
    const { amount, basis_hours: hours } = item;
    if (amount == null || hours == null) continue;
    const expected = Math.round(rate * hours * (item.rate_multiplier ?? 1.0));
    const diff = amount - expected;
    if (Math.abs(diff) > WAGE_MATH_TOLERANCE) {
      mismatches.push(
        `${item.code} ${fmt(amount)} ≠ 기대 ${fmt(expected)} (차액 ${diff > 0 ? '+' : ''}${fmt(diff)})`,
      );
    }
  }
  if (mismatches.length > 0) {
    return makeFinding('WAGE-MATH', 'violation', mismatches.join(' / '));
  }
  return makeFinding('WAGE-MATH', 'ok', '전 항목 산출근거-금액 정합 (±10원)');
};

function otItems(contract: Contract): WageItem[] {
  return (contract.wage?.items ?? []).filter((i) => String(i.code ?? '').startsWith('OT_'));
}

export const ruleOtRate: RuleFn = (contract) => {
  const ots = otItems(contract);
  if (ots.length === 0) return makeFinding('OT-RATE', 'ok', '연장근로 항목 없음');
  const missing = ots.filter((i) => i.rate_multiplier == null).map((i) => i.code);
  if (missing.length > 0) {
    return makeFinding('OT-RATE', 'risk', `${missing.join('·')} 가산율 미표기 — 환산시간 여부 불명`);
  }
  return makeFinding('OT-RATE', 'ok', '연장 항목 가산율 명시됨');
};

export const ruleOtCover: RuleFn = (contract) => {
  const weeklyOt = contract.work_time?.weekly_overtime_hours;
  if (weeklyOt == null) {
    return makeFinding('OT-COVER', 'needs_data', '주간 연장근로시간 산정 불가');
  }
  const required = round1(weeklyOt * WEEKS_PER_MONTH * OT_PREMIUM_RATE);
  const agreed = round1(otItems(contract).reduce((sum, i) => sum + (i.basis_hours ?? 0), 0));
  if (agreed >= required) {
    return makeFinding('OT-COVER', 'ok', `필요 ${required}H ≤ 약정 ${agreed}H (환산시간 해석 시)`);
  }
  return makeFinding(
    'OT-COVER',
    'violation',
    `약정 연장환산 ${agreed}H < 필요 ${required}H (부족 ${round1(required - agreed)}H)`,
  );
};

export const ruleHolidayCover: RuleFn = (contract) => {
  const wage = contract.wage ?? {};
  const extras = (wage.items ?? []).filter((i) => i.code === 'HOLIDAY_EXTRA');
  const note = wage.public_holiday_note;
  if (extras.length === 0 && !note && !wage.inclusive_wage) {
    return makeFinding('HOLIDAY-COVER', 'ok', '포괄임금 휴일근로 약정 없음 — 비적용');
  }
  const match = HOLIDAY_NOTE_RE.exec(note ?? '');
  if (!match) {
    return makeFinding(
      'HOLIDAY-COVER',
      'needs_data',
      "공휴일 예정 근무('N일/M.MH') 파싱 불가 — public_holiday_note 확인 필요",
    );
  }
  const days = parseInt(match[1], 10);
  const planned = parseFloat(match[2]);
  const rate = wage.ordinary_hourly_rate;
  if (rate == null) {
    return makeFinding('HOLIDAY-COVER', 'needs_data', '통상시급 미기재 — 환산 불가');
  }
  const required = round1(planned * HOLIDAY_PREMIUM_RATE);
  const agreed = round1(extras.reduce((sum, i) => sum + (i.amount ?? 0), 0) / rate);
  if (agreed >= required) {
    return makeFinding(
      'HOLIDAY-COVER',
      'ok',
      `공휴일 ${days}일 ${planned}H×1.5=${required}H ≤ HOLIDAY_EXTRA 환산 ${agreed}H`,
    );
  }
  return makeFinding(
    'HOLIDAY-COVER',
    'violation',
    `HOLIDAY_EXTRA 환산 ${agreed}H < 필요 ${required}H` +
      ` (공휴일 ${days}일 ${planned}H×1.5) — 부족 ${round1(required - agreed)}H`,
  );
};

export const WAGE_RULES: RuleFn[] = [
  ruleMinwage,
  ruleWageMath,
  ruleOtRate,
  ruleOtCover,
  ruleHolidayCover,
];

export function runWageRules(contract: Contract): Finding[] {
  return WAGE_RULES.map((rule) => rule(contract));
}
