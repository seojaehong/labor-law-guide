// 12건 밖의 경계 (원본: ~/dev/pay-exception-check @ea0b75c test/edge.test.ts, extractor slot 묶음 제외).
// 끝수 처리(방법·단위), [별표 2] 1일 소정근로시간, 15시간 선, 공제 부호, 결근 주 주휴(I4), 확인 항목(C1~C3), 마지막 소정근로일 범위.

import { describe, expect, it } from "vitest";
import { forbiddenHits, renderCard } from "@/lib/pay-check/card";
import { check } from "@/lib/pay-check/check";

const hw = (extra: Record<string, number | boolean | null> = {}) =>
  check({
    scenario: "HOURLY_WEEKLY_HOLIDAY",
    policy_id: "WEEKLY_HOLIDAY_FIXED",
    confirmed: {
      four_week_scheduled_hours: 60,
      averaging_weeks: 4,
      full_time_scheduled_days_4w: 20,
      holiday_weeks: 1,
      all_scheduled_days_attended: true,
      employment_continued_for_7_days: true,
      weekly_holiday_designated: true,
      calculation_basis_documented: true,
      hourly_rate: 10000,
      payslip_weekly_holiday_pay: 30000,
      ...extra,
    },
  });

describe("weekly holiday (근로기준법 제18조제3항, 시행령 [별표 2])", () => {
  it("1-day hours divide by the full-time worker's days, not the part-timer's", () => {
    // 4주 60시간, 본인 주 3일 근무, 통상 근로자 4주 20일 → 1일 3시간 (본인 일수로 나누면 5시간)
    const r = hw({ scheduled_days_per_week: 3 });
    expect(r.status).toBe("MATCH");
    expect(r.expected_amount).toBe(30000);
  });
  it("a 4-week average just under 15 hours is outside the comparison", () => {
    expect(hw({ four_week_scheduled_hours: 59.96 }).status).toBe("OUTSIDE_SCOPE");
    expect(hw({ four_week_scheduled_hours: 60 }).status).toBe("MATCH");
  });
  it("without the full-time days it asks instead of guessing", () => {
    const r = hw({ full_time_scheduled_days_4w: null });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(r.expected_amount).toBeNull();
    expect(r.required_question).toContain("통상 근로자의 소정근로일수");
  });
  it("attendance not confirmed → asks for the timesheet", () => {
    expect(hw({ all_scheduled_days_attended: false }).reasons).toEqual(["FACT_UNCONFIRMED:attendance"]);
  });
  it("a month item covering 4 weeks is compared as 4 weeks", () => {
    const r = hw({ holiday_weeks: 4, payslip_weekly_holiday_pay: 120000 });
    expect([r.status, r.expected_amount]).toEqual(["MATCH", 120000]);
  });
});

describe("rounding is the company's, never the core's", () => {
  const leave = (rounding?: string, unit?: number, payslip = 833_333, base = 2_500_000) =>
    check({
      scenario: "MID_LEAVE",
      policy_id: "DAY_30",
      confirmed: {
        pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", last_scheduled_workday: "2026-04-10", paid_holiday_treatment: "paid", employment_end: "2026-04-10",
        monthly_base_pay: base, eligible_days: 10, payslip_amount: payslip, calculation_basis_documented: true,
        ...(rounding ? { rounding } : {}), ...(unit !== undefined ? { rounding_unit: unit } : {}),
      },
    });
  it("2,500,000 ÷ 30 × 10 is not a whole 원 → asks for the rounding rule and its unit", () => {
    const r = leave();
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(r.reasons).toEqual(["ROUNDING_RULE_NOT_CONFIRMED"]);
    expect(r.expected_amount).toBeNull();
    expect(r.evidence_needed).toEqual(["끝수 처리 방법(버림·반올림·올림)", "끝수 처리 단위(1원·10원·100원)"]);
  });
  it("method given but unit missing → asks for the unit only", () => {
    const r = leave("FLOOR");
    expect([r.status, r.expected_amount, r.evidence_needed]).toEqual(["NEEDS_CONFIRMATION", null, ["끝수 처리 단위(1원·10원·100원)"]]);
    expect(leave(undefined, 10).evidence_needed).toEqual(["끝수 처리 방법(버림·반올림·올림)"]);
  });
  it("an unknown unit (5원) is not a unit", () => {
    expect(leave("FLOOR", 5).expected_amount).toBeNull();
  });
  it("with a confirmed FLOOR at 1원 it compares 833,333", () => {
    expect([leave("FLOOR", 1).status, leave("FLOOR", 1).expected_amount]).toEqual(["MATCH", 833333]);
    expect([leave("CEIL", 1).status, leave("CEIL", 1).difference]).toEqual(["POTENTIAL_MISMATCH", 1]);
  });
  it("10원·100원 단위: FLOOR → 833,330 · 833,300, ROUND 100 → 833,300, CEIL 10 → 833,340", () => {
    expect([leave("FLOOR", 10, 833_330).status, leave("FLOOR", 10, 833_330).expected_amount]).toEqual(["MATCH", 833330]);
    expect(leave("FLOOR", 100, 833_300).expected_amount).toBe(833300);
    expect(leave("ROUND", 100, 833_300).expected_amount).toBe(833300);
    expect(leave("CEIL", 10, 833_340).expected_amount).toBe(833340);
    expect(leave("FLOOR", 10, 833_330).grounds).toContain("끝수 처리: FLOOR · 10원 단위 (회사 기준, 사용자 확인)");
  });
  it("a whole 원 result: no unit → as it is; a 10원 unit applies to it too", () => {
    // 2,500,050 ÷ 30 × 10 = 833,350 (나누어떨어짐)
    expect(leave(undefined, undefined, 833_350, 2_500_050).expected_amount).toBe(833350);
    // 2,500,020 ÷ 30 × 10 = 833,340: 100원 단위면 끝수가 생긴다
    expect(leave(undefined, 100, 833_300, 2_500_020).expected_amount).toBeNull();
    expect(leave("FLOOR", 100, 833_300, 2_500_020).expected_amount).toBe(833300);
    expect(leave("FLOOR", 10, 833_340, 2_500_020).expected_amount).toBe(833340);
  });
});

describe("scope and sign", () => {
  it("a deduction printed as −80,000 is compared by its size", () => {
    const r = check({
      scenario: "ABSENCE_DEDUCTION",
      policy_id: "ABSENCE_HOUR",
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: -80000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, calculation_basis_documented: true },
    });
    expect([r.status, r.difference]).toEqual(["MATCH", 0]);
  });
  it("over-deduction has the same polarity as under-payment (positive)", () => {
    const r = check({
      scenario: "ABSENCE_DEDUCTION",
      policy_id: "ABSENCE_HOUR",
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 100000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, calculation_basis_documented: true },
    });
    expect([r.status, r.difference]).toEqual(["POTENTIAL_MISMATCH", 20000]);
  });
  it("a day confirmed as paid leave is not compared as an absence", () => {
    const r = check({
      scenario: "ABSENCE_DEDUCTION",
      policy_id: "ABSENCE_HOUR",
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 80000, scheduled_workday_confirmed: true, paid_leave_or_holiday: true, calculation_basis_documented: true },
    });
    expect([r.status, r.expected_amount, r.reasons[0]]).toEqual(["NEEDS_CONFIRMATION", null, "DAY_IS_PAID_LEAVE_OR_HOLIDAY"]);
  });
  it("a policy from another exception is not used", () => {
    const r = check({ scenario: "MID_JOIN", policy_id: "ABSENCE_HOUR", confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: "2026-04-16", hourly_rate: 1, unpaid_absence_hours: 1, payslip_amount: 1, calculation_basis_documented: true } });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(r.reasons).toEqual(["POLICY_NOT_FOR_SCENARIO:ABSENCE_HOUR"]);
  });
  it("leaving the day after the period ends is not a mid-month leave", () => {
    const r = check({ scenario: "MID_LEAVE", policy_id: "DAY_30", confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_end: "2026-05-01" } });
    expect(r.status).toBe("OUTSIDE_SCOPE");
  });
});

describe("I4 a week with an unpaid absence: its 주휴 is not part of this comparison", () => {
  const ab = (deduction: number) =>
    check({
      scenario: "ABSENCE_DEDUCTION",
      policy_id: "ABSENCE_HOUR",
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: deduction, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, calculation_basis_documented: true },
    });
  it("both a match and a mismatch say so, and cite 시행령 제30조제1항", () => {
    for (const r of [ab(80000), ab(100000)]) {
      expect(r.conditions.some((t) => t.includes("유급 주휴일이 생기지 않을 수 있습니다") && t.includes("이 결근 공제 대조에는 들어 있지 않으니"))).toBe(true);
      expect(r.citations).toEqual(["근로기준법 시행령 제30조제1항"]);
      expect(forbiddenHits(renderCard(r))).toEqual([]);
    }
  });
});

// ── 외부 검토 C1~C3 (261022) ──

describe("C1 a confirmation that is not given is not a confirmation", () => {
  const ab = (v?: boolean | null) =>
    check({
      scenario: "ABSENCE_DEDUCTION",
      policy_id: "ABSENCE_HOUR",
      confirmed: {
        unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 80000, scheduled_workday_confirmed: true, calculation_basis_documented: true,
        ...(v === undefined ? {} : { paid_leave_or_holiday: v }),
      },
    });
  it("paid leave: missing → stop, null → stop, false (확인: 아니었음) → compare, true (유급휴가였음) → stop", () => {
    expect([ab().status, ab().expected_amount]).toEqual(["NEEDS_CONFIRMATION", null]);
    expect(ab(null).status).toBe("NEEDS_CONFIRMATION");
    expect([ab(false).status, ab(false).expected_amount]).toEqual(["MATCH", 80000]);
    expect(ab(true).reasons).toEqual(["DAY_IS_PAID_LEAVE_OR_HOLIDAY"]);
  });

  const ml = (extra: Record<string, string | null | undefined>) => {
    const confirmed: Record<string, string | number | boolean | null> = {
      pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_end: "2026-04-15",
      last_scheduled_workday: "2026-04-15", paid_holiday_treatment: "paid",
      monthly_base_pay: 3000000, eligible_days: 15, payslip_amount: 1500000, calculation_basis_documented: true,
    };
    for (const [k, v] of Object.entries(extra)) if (v === undefined) delete confirmed[k]; else confirmed[k] = v;
    return check({ scenario: "MID_LEAVE", policy_id: "DAY_30", confirmed });
  };
  it("leave month: last workday or paid-holiday treatment missing or null → no amount", () => {
    expect(ml({}).status).toBe("MATCH");
    for (const k of ["last_scheduled_workday", "paid_holiday_treatment"]) {
      expect(ml({ [k]: undefined }).expected_amount).toBeNull();
      expect(ml({ [k]: null }).expected_amount).toBeNull();
    }
  });
  it("no pay period → no scope decision and no amount", () => {
    expect(ml({ pay_period_start: undefined }).reasons).toEqual(["FACT_MISSING:pay_period"]);
    expect(ml({ pay_period_start: null }).reasons).toEqual(["FACT_MISSING:pay_period"]);
    expect(ml({ pay_period_end: "2026-03-31" }).reasons).toEqual(["FACT_MISSING:pay_period"]);
  });
  it("leave month: an unreadable last workday is not a last workday", () => {
    const r = ml({ last_scheduled_workday: "2026.04.15" });
    expect([r.status, r.reasons, r.expected_amount]).toEqual(["NEEDS_CONFIRMATION", ["FACT_UNKNOWN:last_scheduled_workday"], null]);
    expect(ml({ paid_holiday_treatment: "모름" }).reasons).toEqual(["FACT_UNKNOWN:paid_holiday_treatment"]);
  });
  it("leave month: a last workday after the leave date or before the pay period → FACT_INVALID_DATE, no amount", () => {
    for (const d of ["2026-04-16", "2026-04-30", "2026-03-31"]) {
      const r = ml({ last_scheduled_workday: d });
      expect([r.status, r.reasons, r.expected_amount], d).toEqual(["NEEDS_CONFIRMATION", ["FACT_INVALID_DATE:last_scheduled_workday"], null]);
    }
    // 경계: 급여기간 첫날·퇴사일 당일은 마지막 소정근로일이 될 수 있다
    expect(ml({ last_scheduled_workday: "2026-04-01" }).reasons).not.toContain("FACT_INVALID_DATE:last_scheduled_workday");
    expect(ml({ last_scheduled_workday: "2026-04-15" }).status).toBe("MATCH");
  });

  const mj = (extra: Record<string, string | null | undefined>) => {
    const confirmed: Record<string, string | number | boolean | null> = {
      pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: "2026-04-16",
      hourly_rate: 10000, paid_hours: 80, payslip_amount: 800000, calculation_basis_documented: true,
    };
    for (const [k, v] of Object.entries(extra)) if (v === undefined) delete confirmed[k]; else confirmed[k] = v;
    return check({ scenario: "MID_JOIN", policy_id: "HOUR_ACTUAL", confirmed });
  };
  it("join month: start date missing or null → asks; no pay period → asks", () => {
    expect(mj({}).status).toBe("MATCH");
    expect(mj({ employment_start: undefined }).reasons).toEqual(["FACT_MISSING:employment_start"]);
    expect(mj({ employment_start: null }).reasons).toEqual(["FACT_MISSING:employment_start"]);
    expect(mj({ pay_period_start: undefined }).reasons).toEqual(["FACT_MISSING:pay_period"]);
    expect(mj({ pay_period_end: null }).expected_amount).toBeNull();
  });

  it("company basis documented: missing → stop, null → stop, false → stop, true → compare", () => {
    expect(mj({ calculation_basis_documented: undefined }).reasons).toEqual(["COMPANY_BASIS_NOT_CONFIRMED"]);
    expect(mj({ calculation_basis_documented: null }).reasons).toEqual(["COMPANY_BASIS_NOT_CONFIRMED"]);
    const no = check({ scenario: "MID_JOIN", policy_id: "HOUR_ACTUAL", confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: "2026-04-16", hourly_rate: 10000, paid_hours: 80, payslip_amount: 800000, calculation_basis_documented: false } });
    expect([no.status, no.expected_amount, no.reasons]).toEqual(["NEEDS_CONFIRMATION", null, ["COMPANY_BASIS_NOT_CONFIRMED"]]);
    expect(mj({}).expected_amount).toBe(800000);
  });

  it("weekly holiday designation: missing → stop, null → stop, false·true (답함) → compare", () => {
    const hwd = (v?: boolean | null) => {
      const r = hw(v === undefined ? {} : { weekly_holiday_designated: v });
      return r;
    };
    const missing = check({
      scenario: "HOURLY_WEEKLY_HOLIDAY",
      policy_id: "WEEKLY_HOLIDAY_FIXED",
      confirmed: { four_week_scheduled_hours: 60, averaging_weeks: 4, full_time_scheduled_days_4w: 20, holiday_weeks: 1, all_scheduled_days_attended: true, employment_continued_for_7_days: true, calculation_basis_documented: true, hourly_rate: 10000, payslip_weekly_holiday_pay: 30000 },
    });
    expect([missing.status, missing.reasons, missing.expected_amount]).toEqual(["NEEDS_CONFIRMATION", ["FACT_UNCONFIRMED:continuity_or_holiday"], null]);
    expect(hwd(null).reasons).toEqual(["FACT_UNCONFIRMED:continuity_or_holiday"]);
    expect(hwd(false).status).toBe("MATCH");
    expect(hwd(true).status).toBe("MATCH");
  });
});

describe("C2 dates must be real YYYY-MM-DD dates", () => {
  const leave = (end: string) =>
    check({ scenario: "MID_LEAVE", policy_id: "DAY_30", confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_end: end } });
  it("2026.04.15 · 2026-4-30 · 2026-02-30 are not compared as strings", () => {
    for (const bad of ["2026.04.15", "2026-4-30", "2026-02-30"]) {
      const r = leave(bad);
      expect(r.status).toBe("NEEDS_CONFIRMATION");
      expect(r.reasons).toEqual(["FACT_INVALID_DATE:employment_end"]);
    }
  });
  it("an unreadable pay period is not a period", () => {
    const r = check({ scenario: "MID_JOIN", policy_id: "HOUR_ACTUAL", confirmed: { pay_period_start: "2026.04.01", pay_period_end: "2026-04-30", employment_start: "2026-04-16" } });
    expect(r.reasons).toEqual(["FACT_MISSING:pay_period"]);
    const feb = check({ scenario: "MID_JOIN", policy_id: "HOUR_ACTUAL", confirmed: { pay_period_start: "2026-02-01", pay_period_end: "2026-02-30", employment_start: "2026-02-16" } });
    expect(feb.reasons).toEqual(["FACT_MISSING:pay_period"]);
  });
  it("join date 2026.04.16 · 2026-4-16 · 2026-02-30 → FACT_INVALID_DATE", () => {
    for (const bad of ["2026.04.16", "2026-4-16", "2026-02-30"]) {
      const r = check({ scenario: "MID_JOIN", policy_id: "HOUR_ACTUAL", confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: bad } });
      expect([r.status, r.reasons, r.expected_amount]).toEqual(["NEEDS_CONFIRMATION", ["FACT_INVALID_DATE:employment_start"], null]);
    }
  });
  it("a real leap day is a date", () => {
    const r = check({ scenario: "MID_LEAVE", policy_id: "DAY_30", confirmed: { pay_period_start: "2028-02-01", pay_period_end: "2028-02-29", employment_end: "2028-02-29" } });
    expect(r.reasons).toEqual(["NOT_MID_PERIOD:ends_on_or_after_period"]);
  });
});

describe("C3 근로기준법 제18조제3항: 4주 미만 근로면 그 기간으로 평균", () => {
  it("2 weeks, 32 hours → 16 hours a week: compared, not excluded", () => {
    const r = hw({ four_week_scheduled_hours: 32, averaging_weeks: 2, full_time_scheduled_days_4w: 10, payslip_weekly_holiday_pay: 32000 });
    expect([r.status, r.expected_amount]).toEqual(["MATCH", 32000]);
    // 근거 문장은 평균을 낸 실제 주수를 적는다(4주라고 쓰지 않는다)
    expect(r.grounds[0]).toContain("2주 소정근로시간 32시간");
    expect(r.grounds.join("\n")).not.toContain("4주 소정근로시간");
    // [별표 2] 제2호나목은 4주만 말한다: 그 기간으로 나눈 것은 제18조제3항의 평균 기간을 따른 해석이라고 적는다
    expect(r.grounds[0]).toContain("법 제18조제3항의 평균 기간을 따른 계산");
    expect(r.grounds[0]).toContain("해석");
  });
  it("4 weeks: the 1-day hours sentence cites [별표 2] 제2호나목 directly, with no interpretation note", () => {
    const r = hw();
    expect(r.grounds[0]).toContain("4주 소정근로시간 60시간");
    expect(r.grounds[0]).toContain("[별표 2] 제2호나목");
    expect(r.grounds[0]).not.toContain("해석");
  });
  it("averaging weeks absent, 0 or more than 4 → asks, no amount", () => {
    const absent = check({
      scenario: "HOURLY_WEEKLY_HOLIDAY",
      policy_id: "WEEKLY_HOLIDAY_FIXED",
      confirmed: { four_week_scheduled_hours: 60, full_time_scheduled_days_4w: 20, holiday_weeks: 1, all_scheduled_days_attended: true, employment_continued_for_7_days: true, weekly_holiday_designated: true, calculation_basis_documented: true, hourly_rate: 10000, payslip_weekly_holiday_pay: 30000 },
    });
    for (const r of [absent, hw({ averaging_weeks: 0 }), hw({ averaging_weeks: 5 })]) {
      expect([r.status, r.reasons, r.expected_amount]).toEqual(["NEEDS_CONFIRMATION", ["FACT_MISSING:averaging_weeks"], null]);
    }
  });
  it("2 weeks, 28 hours → 14 hours a week: outside", () => {
    expect(hw({ four_week_scheduled_hours: 28, averaging_weeks: 2, full_time_scheduled_days_4w: 10 }).status).toBe("OUTSIDE_SCOPE");
  });
  it("without the number of weeks it asks", () => {
    const r = hw({ averaging_weeks: null });
    expect([r.status, r.reasons[0], r.expected_amount]).toEqual(["NEEDS_CONFIRMATION", "FACT_MISSING:averaging_weeks", null]);
  });
});
