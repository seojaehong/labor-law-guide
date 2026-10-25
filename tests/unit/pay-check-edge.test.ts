// 12건 밖의 경계 (원본: ~/dev/pay-exception-check @c6c988d test/edge.test.ts, extractor slot 묶음 제외).
// 끝수 처리(방법·단위), [별표 2] 1일 소정근로시간, 15시간 선, 공제 부호, 결근 주 주휴(I4), 확인 항목(C1~C3), 마지막 소정근로일 범위,
// 결과 카드에 내부 코드가 보이지 않음·확인된 항목을 다시 묻지 않음(미리보기 E2E).

import { describe, expect, it } from "vitest";
import { forbiddenHits, renderCard } from "@/lib/pay-check/card";
import { check } from "@/lib/pay-check/check";
import type { CheckInput, CheckResult } from "@/lib/pay-check/types";

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
    expect(leave("FLOOR", 10, 833_330).grounds).toContain("끝수 처리: 버림 · 10원 단위 (회사 기준, 사용자 확인)");
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

  const mj = (extra: Record<string, string | boolean | null | undefined>) => {
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

  it("company basis: 기준 없음 → stop · 기준은 있고 문서 미확인(없음·null·false) → 참고 계산 + 확인 상태 · true → 확인 상태 없음 (261022 결정)", () => {
    expect(check({ scenario: "MID_JOIN", policy_id: null, confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: "2026-04-16", hourly_rate: 10000, paid_hours: 80, payslip_amount: 800000, calculation_basis_documented: true } }).reasons).toEqual(["COMPANY_BASIS_NOT_CONFIRMED"]);
    for (const v of [undefined, null, false]) {
      const r = mj({ calculation_basis_documented: v });
      expect([r.status, r.expected_amount, r.reasons]).toEqual(["MATCH", 800000, ["COMPARED_EQUAL", "BASIS_NOT_DOCUMENTED"]]);
      expect(r.open_confirmations).toHaveLength(1);
      expect(r.observation.startsWith("참고 계산입니다.")).toBe(true);
      expect(renderCard(r)).toContain("계산 기준 문서 미확인");
    }
    const ok = mj({});
    expect([ok.expected_amount, ok.open_confirmations, ok.reasons]).toEqual([800000, [], ["COMPARED_EQUAL"]]);
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
    // 미지정 확인(false)은 대조하되 「주휴일 확인 필요」를 남긴다 (261022 결정, 제17조·제55조).
    const no = hwd(false);
    expect([no.status, no.reasons]).toEqual(["MATCH", ["COMPARED_EQUAL", "WEEKLY_HOLIDAY_NOT_DESIGNATED"]]);
    expect(no.open_confirmations[0]).toContain("주휴일 확인 필요");
    expect(no.citations).toContain("근로기준법 제17조");
    expect(forbiddenHits(renderCard(no))).toEqual([]);
    const yes = hwd(true);
    expect([yes.status, yes.open_confirmations, yes.citations]).toEqual(["MATCH", [], expect.not.arrayContaining(["근로기준법 제17조"])]);
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

describe("E2E 결과 카드: 사람에게 보이는 문장에 내부 코드가 없다", () => {
  // 화면에 나가는 칸만 본다. reasons·policy_id 는 기계용이라 화면에 그리지 않는다.
  const visible = (r: CheckResult) =>
    [r.observation, ...r.grounds, ...r.conditions, ...r.evidence_needed, r.required_question ?? "", ...r.citations, renderCard(r)].join("\n");
  const C = (scenario: CheckInput["scenario"], policy_id: CheckInput["policy_id"], confirmed: CheckInput["confirmed"]): CheckInput => ({ scenario, policy_id, confirmed });
  const period = { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30" };
  const join = { ...period, employment_start: "2026-04-16", hourly_rate: 10000, paid_hours: 80, payslip_amount: 800000, calculation_basis_documented: true };
  const join30 = { ...period, employment_start: "2026-04-21", monthly_base_pay: 2_500_000, eligible_days: 10, payslip_amount: 833_330, calculation_basis_documented: true, rounding: "FLOOR", rounding_unit: 10 };
  const leave = { ...period, employment_end: "2026-04-10", last_scheduled_workday: "2026-04-10", paid_holiday_treatment: "paid", monthly_base_pay: 2_500_000, eligible_days: 10, payslip_amount: 833_330, calculation_basis_documented: true, rounding: "FLOOR", rounding_unit: 10 };
  const ab = { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 80000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, calculation_basis_documented: true };
  const hwc = { four_week_scheduled_hours: 60, averaging_weeks: 4, full_time_scheduled_days_4w: 20, holiday_weeks: 1, all_scheduled_days_attended: true, employment_continued_for_7_days: true, weekly_holiday_designated: true, calculation_basis_documented: true, hourly_rate: 10000, payslip_weekly_holiday_pay: 30000 };
  const cases: [string, CheckInput][] = [
    ["입사 · 일치(시간 기준)", C("MID_JOIN", "HOUR_ACTUAL", join)],
    ["입사 · 어긋남(시간 기준)", C("MID_JOIN", "HOUR_ACTUAL", { ...join, payslip_amount: 790000 })],
    ["입사 · 일치(30일 기준, 버림 10원)", C("MID_JOIN", "DAY_30", join30)],
    ["입사 · 어긋남(30일 기준, 올림 10원)", C("MID_JOIN", "DAY_30", { ...join30, rounding: "CEIL" })],
    ["입사 · 끝수 미확인", C("MID_JOIN", "DAY_30", { ...join30, rounding: null, rounding_unit: null })],
    ["입사 · 기준 미확인", C("MID_JOIN", null, join)],
    ["입사 · 다른 예외의 기준", C("MID_JOIN", "ABSENCE_HOUR", join)],
    ["입사 · 읽을 수 없는 날짜", C("MID_JOIN", "HOUR_ACTUAL", { ...join, employment_start: "2026.04.16" })],
    ["입사 · 입사일 없음", C("MID_JOIN", "HOUR_ACTUAL", { ...join, employment_start: null })],
    ["입사 · 급여기간 없음", C("MID_JOIN", "HOUR_ACTUAL", { ...join, pay_period_start: null })],
    ["입사 · 값 비어 있음", C("MID_JOIN", "HOUR_ACTUAL", { ...join, paid_hours: null, payslip_amount: null })],
    ["입사 · 범위 밖", C("MID_JOIN", "HOUR_ACTUAL", { ...join, employment_start: "2026-04-01" })],
    ["퇴사 · 일치(30일 기준, 버림 10원)", C("MID_LEAVE", "DAY_30", leave)],
    ["퇴사 · 어긋남(30일 기준, 반올림 100원)", C("MID_LEAVE", "DAY_30", { ...leave, rounding: "ROUND", rounding_unit: 100 })],
    ["퇴사 · 마지막 소정근로일 미확인", C("MID_LEAVE", "DAY_30", { ...leave, last_scheduled_workday: null })],
    ["퇴사 · 마지막 소정근로일 범위 밖", C("MID_LEAVE", "DAY_30", { ...leave, last_scheduled_workday: "2026-04-20" })],
    ["퇴사 · 기준 문서 미확인(참고 계산)", C("MID_LEAVE", "DAY_30", { ...leave, calculation_basis_documented: false })],
    ["퇴사 · 다른 예외의 기준", C("MID_LEAVE", "WEEKLY_HOLIDAY_FIXED", leave)],
    ["퇴사 · 범위 밖", C("MID_LEAVE", "DAY_30", { ...leave, employment_end: "2026-04-30" })],
    ["결근 · 일치", C("ABSENCE_DEDUCTION", "ABSENCE_HOUR", ab)],
    ["결근 · 어긋남", C("ABSENCE_DEDUCTION", "ABSENCE_HOUR", { ...ab, payslip_absence_deduction: -90000 })],
    ["결근 · 소정근로일 미확인", C("ABSENCE_DEDUCTION", "ABSENCE_HOUR", { ...ab, scheduled_workday_confirmed: null })],
    ["결근 · 유급휴가", C("ABSENCE_DEDUCTION", "ABSENCE_HOUR", { ...ab, paid_leave_or_holiday: true })],
    ["결근 · 기준 미확인", C("ABSENCE_DEDUCTION", null, ab)],
    ["결근 · 다른 예외의 기준", C("ABSENCE_DEDUCTION", "DAY_30", ab)],
    ["결근 · 범위 밖", C("ABSENCE_DEDUCTION", "ABSENCE_HOUR", { ...ab, unpaid_absence_hours: 0, payslip_absence_deduction: 0 })],
    ["주휴 · 일치", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", hwc)],
    ["주휴 · 어긋남", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, payslip_weekly_holiday_pay: 0 })],
    ["주휴 · 2주 평균(해석 문장)", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, four_week_scheduled_hours: 32, averaging_weeks: 2, full_time_scheduled_days_4w: 10, payslip_weekly_holiday_pay: 32000 })],
    ["주휴 · 끝수 적용", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, hourly_rate: 10001, four_week_scheduled_hours: 61, rounding: "FLOOR", rounding_unit: 10, payslip_weekly_holiday_pay: 30500 })],
    ["주휴 · 대타", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, temporary_actual_hours_in_one_week: 20 })],
    ["주휴 · 지정 미확인", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, weekly_holiday_designated: null })],
    ["주휴 · 개근 미확인", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, all_scheduled_days_attended: null })],
    ["주휴 · 평균 주수 없음", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, averaging_weeks: null })],
    ["주휴 · 기준 미확인", C("HOURLY_WEEKLY_HOLIDAY", null, hwc)],
    ["주휴 · 다른 예외의 기준", C("HOURLY_WEEKLY_HOLIDAY", "HOUR_ACTUAL", hwc)],
    ["주휴 · 범위 밖", C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", { ...hwc, four_week_scheduled_hours: 56 })],
  ];

  it("4 시나리오가 일치·어긋남·확인 필요·범위 밖을 모두 거친다", () => {
    for (const s of ["MID_JOIN", "MID_LEAVE", "ABSENCE_DEDUCTION", "HOURLY_WEEKLY_HOLIDAY"] as const) {
      const seen = new Set(cases.filter(([, i]) => i.scenario === s).map(([, i]) => check(i).status));
      expect([...seen].sort(), s).toEqual(["MATCH", "NEEDS_CONFIRMATION", "OUTSIDE_SCOPE", "POTENTIAL_MISMATCH"]);
    }
  });
  it("끝수가 실제로 적용된 경우가 들어 있다", () => {
    const rounded = cases.map(([, i]) => check(i)).filter((r) => r.grounds.some((g) => g.startsWith("끝수 처리")));
    expect(rounded.length).toBeGreaterThanOrEqual(3);
  });
  for (const [name, input] of cases) {
    it(`${name}: 대문자 코드(정책 id·끝수 방법·날짜 형식)가 보이지 않는다`, () => {
      expect(visible(check(input))).not.toMatch(/[A-Z_]{3,}/);
    });
  }
  it("정책은 사이트 화면과 같은 한글 이름으로, 끝수 방법은 버림·반올림·올림으로 적는다", () => {
    const g = (i: CheckInput) => check(i).grounds.join("\n");
    expect(g(C("MID_JOIN", "HOUR_ACTUAL", join))).toContain("(시간 기준)");
    expect(g(C("MID_LEAVE", "DAY_30", leave))).toContain("(30일 기준)");
    expect(g(C("ABSENCE_DEDUCTION", "ABSENCE_HOUR", ab))).toContain("(시간 단위 결근 공제)");
    expect(g(C("HOURLY_WEEKLY_HOLIDAY", "WEEKLY_HOLIDAY_FIXED", hwc))).toContain("(주휴 고정 스케줄)");
    expect(g(C("MID_LEAVE", "DAY_30", { ...leave, rounding: "ROUND", rounding_unit: 100 }))).toContain("끝수 처리: 반올림 · 100원 단위");
    expect(g(C("MID_JOIN", "DAY_30", { ...join30, rounding: "CEIL" }))).toContain("끝수 처리: 올림 · 10원 단위");
    expect(check(C("MID_JOIN", "HOUR_ACTUAL", { ...join, payslip_amount: 790000 })).observation).toContain("확인한 기준(시간 기준)");
  });
});

describe("E2E 결과 카드: 물어보는 것은 아직 확인되지 않은 것뿐이다", () => {
  const asked = (r: CheckResult) => [r.observation, r.required_question ?? "", ...r.evidence_needed].join("\n");
  const hwc = { four_week_scheduled_hours: 60, averaging_weeks: 4, full_time_scheduled_days_4w: 20, holiday_weeks: 1, all_scheduled_days_attended: true, employment_continued_for_7_days: true, weekly_holiday_designated: true, calculation_basis_documented: true, hourly_rate: 10000, payslip_weekly_holiday_pay: 0 };
  const hwRun = (extra: Record<string, number | boolean | null> = {}) =>
    check({ scenario: "HOURLY_WEEKLY_HOLIDAY", policy_id: "WEEKLY_HOLIDAY_FIXED", confirmed: { ...hwc, ...extra } });

  it("주휴 어긋남: 계속근로·주휴일 지정·개근을 모두 확인했으면 그것을 다시 묻지 않는다", () => {
    const r = hwRun();
    expect(r.status).toBe("POTENTIAL_MISMATCH");
    const q = [r.required_question ?? "", ...r.evidence_needed].join("\n");
    expect(q).not.toMatch(/주휴일 지정|주휴일을 정한|개근|계속근로/);
    expect(r.required_question).toMatch(/몇 주분|1일 소정근로시간/);
  });
  it("주휴: 계속근로만 확인했으면 주휴일 지정만 묻는다", () => {
    const r = hwRun({ weekly_holiday_designated: null });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(asked(r)).toContain("주휴일 지정");
    expect(asked(r)).not.toMatch(/계속근로|계약 기간/);
  });
  it("주휴: 주휴일 지정만 확인했으면 계속근로만 묻는다", () => {
    const r = hwRun({ employment_continued_for_7_days: false });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(asked(r)).toContain("계속근로");
    expect(asked(r)).not.toMatch(/주휴일 지정|주휴일을 정한/);
  });

  const ab = (extra: Record<string, boolean | null | undefined>) => {
    const confirmed: Record<string, number | boolean | null> = { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 80000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, calculation_basis_documented: true };
    for (const [k, v] of Object.entries(extra)) if (v === undefined) delete confirmed[k]; else confirmed[k] = v;
    return check({ scenario: "ABSENCE_DEDUCTION", policy_id: "ABSENCE_HOUR", confirmed });
  };
  it("결근: 소정근로일을 확인했으면 유급휴가·휴일 여부만 묻는다", () => {
    const r = ab({ paid_leave_or_holiday: undefined });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(asked(r)).toMatch(/유급휴가|휴가 승인 기록/);
    expect(asked(r)).not.toMatch(/소정근로일|근무표/);
  });
  it("결근: 유급휴가·휴일이 아니었음을 확인했으면 소정근로일 여부만 묻는다", () => {
    const r = ab({ scheduled_workday_confirmed: null });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(asked(r)).toMatch(/소정근로일|근무표/);
    expect(asked(r)).not.toMatch(/유급휴가|휴가 승인 기록/);
  });
  it("결근: 공제 기준이 확인됐으면 공제 기준 조항을 묻지 않고, 확인 전이면 함께 묻는다", () => {
    expect(asked(ab({ scheduled_workday_confirmed: null }))).not.toContain("공제 기준");
    expect(ab({ scheduled_workday_confirmed: null, calculation_basis_documented: null }).required_question).toContain("공제 기준");
  });

  const ml = (extra: Record<string, string | boolean | null>) =>
    check({
      scenario: "MID_LEAVE",
      policy_id: "DAY_30",
      confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_end: "2026-04-15", last_scheduled_workday: "2026-04-15", paid_holiday_treatment: "paid", monthly_base_pay: 3000000, eligible_days: 15, payslip_amount: 1500000, calculation_basis_documented: true, ...extra },
    });
  it("퇴사: 마지막 소정근로일·계산 기준을 확인했으면 유급휴일 처리만 묻는다", () => {
    const r = ml({ paid_holiday_treatment: null });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    expect(asked(r)).toContain("유급휴일 처리");
    expect(asked(r)).not.toMatch(/마지막 소정근로일|마지막 근무일|계산 기준/);
  });
  it("퇴사: 유급휴일 처리를 확인했으면 마지막 소정근로일만 묻는다", () => {
    const r = ml({ last_scheduled_workday: null });
    expect(asked(r)).toContain("마지막 소정근로일");
    expect(asked(r)).not.toMatch(/유급휴일|계산 기준/);
  });

  it("입사 어긋남(시간 기준): 확인된 산정 기준을 다시 묻지 않는다", () => {
    const r = check({ scenario: "MID_JOIN", policy_id: "HOUR_ACTUAL", confirmed: { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: "2026-04-16", hourly_rate: 10000, paid_hours: 80, payslip_amount: 790000, calculation_basis_documented: true } });
    expect(r.status).toBe("POTENTIAL_MISMATCH");
    expect([r.required_question ?? "", ...r.evidence_needed].join("\n")).not.toMatch(/산정 기준|계산 기준/);
  });

  // 30일 기준도 시간 기준과 같은 원칙: 확인된 기준 조항은 다시 요구하지 않는다.
  const d30 = (s: "MID_JOIN" | "MID_LEAVE", payslip: number) =>
    check({
      scenario: s,
      policy_id: "DAY_30",
      confirmed: s === "MID_JOIN"
        ? { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_start: "2026-04-21", monthly_base_pay: 2_500_000, eligible_days: 10, payslip_amount: payslip, calculation_basis_documented: true, rounding: "FLOOR", rounding_unit: 10 }
        : { pay_period_start: "2026-04-01", pay_period_end: "2026-04-30", employment_end: "2026-04-10", last_scheduled_workday: "2026-04-10", paid_holiday_treatment: "paid", monthly_base_pay: 2_500_000, eligible_days: 10, payslip_amount: payslip, calculation_basis_documented: true, rounding: "FLOOR", rounding_unit: 10 },
    });
  for (const s of ["MID_JOIN", "MID_LEAVE"] as const) {
    it(`${s} 일치(30일 기준): 확인된 기준을 다시 묻지 않고 달라지면 다시 확인하라고만 한다`, () => {
      const r = d30(s, 833_330);
      expect(r.status).toBe("MATCH");
      expect(r.required_question).toContain("인정일수나 기준이 달라지면 다시 확인");
      expect(r.required_question).not.toMatch(/같은지/);
      expect(r.evidence_needed).toEqual([]);
    });
    it(`${s} 어긋남(30일 기준): 명세서가 쓴 인정일수·기준 일수를 묻고 기준 조항을 자료로 다시 요구하지 않는다`, () => {
      const r = d30(s, 800_000);
      expect(r.status).toBe("POTENTIAL_MISMATCH");
      expect(r.required_question).toMatch(/명세서가 .*인정일수를 며칠로, 몇 일 기준으로 계산했는지/);
      expect(r.evidence_needed.join("\n")).not.toMatch(/조항|계산 기준/);
      expect(r.evidence_needed.join("\n")).toContain("명세서");
    });
  }

  it("주휴 어긋남: 이미 넣은 주수를 묻지 않고, 확인된 약정시간 근로계약서를 자료로 다시 요구하지 않는다", () => {
    const r = hwRun();
    expect(r.required_question).not.toMatch(/몇 주분/);
    expect(r.required_question).toContain("명세서가 1일 소정근로시간을 몇 시간으로 계산했는지");
    expect(r.evidence_needed.join("\n")).not.toMatch(/근로계약서/);
    expect(r.evidence_needed).toContain("명세서 주휴수당 계산 내역");
  });

  it("결근 모름: 문의 문장은 기록 이름이 아니라 그날이 유급휴가·휴일이었는지를 묻는다", () => {
    const r = ab({ paid_leave_or_holiday: undefined });
    expect(r.required_question).not.toMatch(/휴가 승인 기록/);
    expect(r.required_question).toMatch(/그날이 .*유급휴가·유급휴일이었는지/);
    const both = ab({ paid_leave_or_holiday: null, scheduled_workday_confirmed: null });
    expect(both.required_question).toMatch(/그날이 소정근로일이었는지, 유급휴가·유급휴일이었는지/);
    expect(both.required_question).not.toMatch(/휴가 승인 기록|근무표/);
  });
});
