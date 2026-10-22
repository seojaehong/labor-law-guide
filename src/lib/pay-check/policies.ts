// 원본: ~/dev/pay-exception-check @c6c988d
// The four calculation policies (spec §5). Integer arithmetic on 원 with an exact fraction:
// a result that is not a whole 원 needs the company's rounding rule, which the core never guesses.

import type { Confirmed, PolicyId } from "./types";

export type Rounding = "FLOOR" | "ROUND" | "CEIL";

/** 사람에게 보이는 이름. 사이트 입력 화면(build-input.ts)과 같은 이름을 쓴다. 코드는 화면에 내보내지 않는다. */
export const POLICY_NAME: Record<PolicyId, string> = {
  HOUR_ACTUAL: "시간 기준",
  DAY_30: "30일 기준",
  ABSENCE_HOUR: "시간 단위 결근 공제",
  WEEKLY_HOLIDAY_FIXED: "주휴 고정 스케줄",
};
export const ROUNDING_NAME: Record<Rounding, string> = { FLOOR: "버림", ROUND: "반올림", CEIL: "올림" };

export interface Fraction {
  num: number;
  den: number;
}

export type PolicyOutcome =
  | { ok: true; amount: number; grounds: string[] }
  | { ok: false; reason: string; missing: string[] };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function num(c: Confirmed, k: string): number | null {
  const v = c[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 끝수 처리 단위(원). 읽기 단계 산수 검사(extract/arith.ts)도 이 목록을 쓴다. */
export const ROUNDING_UNITS = [1, 10, 100] as const;
export type RoundingUnit = (typeof ROUNDING_UNITS)[number];

/**
 * Exact value or a rounding decision (외부 검토 I1).
 * A whole 원 with no unit given stays as it is. Otherwise the company's method and unit are both needed;
 * a unit of 10 or 100 also applies to a whole-원 result. Returns the names of what is missing instead of guessing.
 */
export function toWon(f: Fraction, rounding: Rounding | null, unit: RoundingUnit | null = null): number | string[] {
  const x = f.num / f.den;
  if (f.num % f.den === 0 && (unit === null || x % unit === 0)) return x;
  const missing = [...(rounding ? [] : ["rounding"]), ...(unit ? [] : ["rounding_unit"])];
  if (missing.length) return missing;
  const g = rounding === "FLOOR" ? Math.floor : rounding === "CEIL" ? Math.ceil : Math.round;
  return g(x / unit!) * unit!;
}

function need(c: Confirmed, keys: string[]): string[] {
  return keys.filter((k) => num(c, k) === null);
}

function rounding(c: Confirmed): Rounding | null {
  const r = c.rounding;
  return r === "FLOOR" || r === "ROUND" || r === "CEIL" ? r : null;
}

function roundingUnit(c: Confirmed): RoundingUnit | null {
  const u = c.rounding_unit;
  return (ROUNDING_UNITS as readonly unknown[]).includes(u) ? (u as RoundingUnit) : null;
}

function finish(f: Fraction, c: Confirmed, grounds: string[]): PolicyOutcome {
  const how = rounding(c), unit = roundingUnit(c);
  const amount = toWon(f, how, unit);
  if (typeof amount !== "number") return { ok: false, reason: "ROUNDING_RULE_NOT_CONFIRMED", missing: amount };
  const note = amount === f.num / f.den ? [] : [`끝수 처리: ${ROUNDING_NAME[how!]} · ${unit}원 단위 (회사 기준, 사용자 확인)`];
  return { ok: true, amount, grounds: [...grounds, ...note] };
}

export const POLICY_FIELDS: Record<PolicyId, string[]> = {
  HOUR_ACTUAL: ["hourly_rate", "paid_hours"],
  DAY_30: ["monthly_base_pay", "eligible_days"],
  ABSENCE_HOUR: ["hourly_rate", "unpaid_absence_hours"],
  WEEKLY_HOLIDAY_FIXED: ["hourly_rate", "four_week_scheduled_hours", "full_time_scheduled_days_4w", "holiday_weeks"],
};

export function applyPolicy(id: PolicyId, c: Confirmed): PolicyOutcome {
  const missing = need(c, POLICY_FIELDS[id]);
  if (missing.length) return { ok: false, reason: "POLICY_FIELD_MISSING", missing };
  switch (id) {
    case "HOUR_ACTUAL": {
      const r = num(c, "hourly_rate")!, h = num(c, "paid_hours")!;
      return finish({ num: Math.round(r * h * 100), den: 100 }, c, [`시급 ${won(r)} × 유급시간 ${h}시간 (${POLICY_NAME.HOUR_ACTUAL})`]);
    }
    case "DAY_30": {
      const m = num(c, "monthly_base_pay")!, d = num(c, "eligible_days")!;
      return finish({ num: Math.round(m * d * 100), den: 3000 }, c, [`월 기본급 ${won(m)} ÷ 30 × 인정일수 ${d}일 (${POLICY_NAME.DAY_30})`]);
    }
    case "ABSENCE_HOUR": {
      const r = num(c, "hourly_rate")!, h = num(c, "unpaid_absence_hours")!;
      return finish({ num: Math.round(r * h * 100), den: 100 }, c, [`시급 ${won(r)} × 무급 결근 ${h}시간 (${POLICY_NAME.ABSENCE_HOUR})`]);
    }
    case "WEEKLY_HOLIDAY_FIXED": {
      // 시행령 [별표 2] 제2호나목: 1일 소정근로시간 수 = 4주 동안의 소정근로시간 ÷ 그 기간의 통상 근로자의 총 소정근로일 수 (4주만 정한다).
      // 근로기준법 제18조제3항: 15시간 판정의 평균 기간 = 4주(4주 미만으로 근로하면 그 기간). 판정은 check.ts 가 한다.
      // 4주 미만 근로자에게 같은 나눗셈을 그 기간으로 하는 것은 제18조제3항의 평균 기간을 따른 해석이라, 근거 문장에 그렇게 적는다.
      const r = num(c, "hourly_rate")!, h4 = num(c, "four_week_scheduled_hours")!;
      const d4 = num(c, "full_time_scheduled_days_4w")!, w = num(c, "holiday_weeks")!;
      if (d4 <= 0) return { ok: false, reason: "POLICY_FIELD_MISSING", missing: ["full_time_scheduled_days_4w"] };
      const daily = h4 / d4;
      const weeks = num(c, "averaging_weeks") ?? 4;
      const basis = weeks === 4
        ? "(시행령 [별표 2] 제2호나목)"
        : `(시행령 [별표 2] 제2호나목은 4주 기준이다. ${weeks}주 근로라 같은 나눗셈을 그 기간으로 했다. 법 제18조제3항의 평균 기간을 따른 계산이며 이 도구의 해석이다)`;
      return finish({ num: Math.round(r * h4 * w * 100), den: d4 * 100 }, c, [
        `1일 소정근로시간 = ${weeks}주 소정근로시간 ${h4}시간 ÷ 같은 기간 통상 근로자 소정근로일 ${d4}일 = ${Math.round(daily * 100) / 100}시간 ${basis}`,
        `시급 ${won(r)} × 1일 소정근로시간 × 주휴 ${w}주분 (${POLICY_NAME.WEEKLY_HOLIDAY_FIXED})`,
      ]);
    }
  }
}
