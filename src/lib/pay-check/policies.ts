// 원본: ~/dev/pay-exception-check @3263456
// The four calculation policies (spec §5). Integer arithmetic on 원 with an exact fraction:
// a result that is not a whole 원 needs the company's rounding rule, which the core never guesses.

import type { Confirmed, PolicyId } from "./types";

export type Rounding = "FLOOR" | "ROUND" | "CEIL";

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

/** Exact value or a rounding decision. A non-whole result without a confirmed rounding rule is not an amount. */
export function toWon(f: Fraction, rounding: Rounding | null): number | null {
  if (f.num % f.den === 0) return f.num / f.den;
  if (!rounding) return null;
  const x = f.num / f.den;
  return rounding === "FLOOR" ? Math.floor(x) : rounding === "CEIL" ? Math.ceil(x) : Math.round(x);
}

function need(c: Confirmed, keys: string[]): string[] {
  return keys.filter((k) => num(c, k) === null);
}

function rounding(c: Confirmed): Rounding | null {
  const r = c.rounding;
  return r === "FLOOR" || r === "ROUND" || r === "CEIL" ? r : null;
}

function finish(f: Fraction, c: Confirmed, grounds: string[]): PolicyOutcome {
  const amount = toWon(f, rounding(c));
  if (amount === null) return { ok: false, reason: "ROUNDING_RULE_NOT_CONFIRMED", missing: ["rounding"] };
  return { ok: true, amount, grounds };
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
      return finish({ num: Math.round(r * h * 100), den: 100 }, c, [`시급 ${won(r)} × 유급시간 ${h}시간 (HOUR_ACTUAL)`]);
    }
    case "DAY_30": {
      const m = num(c, "monthly_base_pay")!, d = num(c, "eligible_days")!;
      return finish({ num: Math.round(m * d * 100), den: 3000 }, c, [`월 기본급 ${won(m)} ÷ 30 × 인정일수 ${d}일 (DAY_30)`]);
    }
    case "ABSENCE_HOUR": {
      const r = num(c, "hourly_rate")!, h = num(c, "unpaid_absence_hours")!;
      return finish({ num: Math.round(r * h * 100), den: 100 }, c, [`시급 ${won(r)} × 무급 결근 ${h}시간 (ABSENCE_HOUR)`]);
    }
    case "WEEKLY_HOLIDAY_FIXED": {
      // 시행령 [별표 2] 2호나목: 1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상 근로자의 총 소정근로일수
      const r = num(c, "hourly_rate")!, h4 = num(c, "four_week_scheduled_hours")!;
      const d4 = num(c, "full_time_scheduled_days_4w")!, w = num(c, "holiday_weeks")!;
      if (d4 <= 0) return { ok: false, reason: "POLICY_FIELD_MISSING", missing: ["full_time_scheduled_days_4w"] };
      const daily = h4 / d4;
      return finish({ num: Math.round(r * h4 * w * 100), den: d4 * 100 }, c, [
        `1일 소정근로시간 = 4주 소정근로시간 ${h4}시간 ÷ 통상 근로자 4주 소정근로일 ${d4}일 = ${Math.round(daily * 100) / 100}시간`,
        `시급 ${won(r)} × 1일 소정근로시간 × 주휴 ${w}주분 (WEEKLY_HOLIDAY_FIXED)`,
      ]);
    }
  }
}
