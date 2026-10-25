// 원본: ~/dev/pay-exception-check @c6c988d
// One worker, one pay month, one exception (spec §1). Decides the status from confirmed values only.
// Order per scenario: scope → facts the exception depends on → company basis → policy → compare.
// NEEDS_CONFIRMATION never carries an amount.

import { applyPolicy, num, POLICY_FIELDS, POLICY_NAME } from "./policies";
import type { CheckInput, CheckResult, Confirmed, PolicyId, Scenario, Status } from "./types";

const POLICIES_FOR: Record<Scenario, PolicyId[]> = {
  MID_JOIN: ["HOUR_ACTUAL", "DAY_30"],
  MID_LEAVE: ["HOUR_ACTUAL", "DAY_30"],
  ABSENCE_DEDUCTION: ["ABSENCE_HOUR"],
  HOURLY_WEEKLY_HOLIDAY: ["WEEKLY_HOLIDAY_FIXED"],
};

/** The payslip item each scenario compares against. */
const PAYSLIP_FIELD: Record<Scenario, string> = {
  MID_JOIN: "payslip_amount",
  MID_LEAVE: "payslip_amount",
  ABSENCE_DEDUCTION: "payslip_absence_deduction",
  HOURLY_WEEKLY_HOLIDAY: "payslip_weekly_holiday_pay",
};

const ITEM: Record<Scenario, string> = {
  MID_JOIN: "입사월 기본급",
  MID_LEAVE: "퇴사월 기본급",
  ABSENCE_DEDUCTION: "결근 공제",
  HOURLY_WEEKLY_HOLIDAY: "주휴수당",
};

const CITATIONS: Record<Scenario, string[]> = {
  MID_JOIN: [],
  MID_LEAVE: [],
  ABSENCE_DEDUCTION: ["근로기준법 시행령 제30조제1항"],
  HOURLY_WEEKLY_HOLIDAY: [
    "근로기준법 제55조제1항",
    "근로기준법 시행령 제30조제1항",
    "근로기준법 제18조제3항",
    "근로기준법 시행령 [별표 2] 제2호나목",
  ],
};

const FIELD_LABEL: Record<string, string> = {
  hourly_rate: "확정 시급",
  paid_hours: "유급 처리된 시간",
  monthly_base_pay: "월 기본급",
  eligible_days: "인정일수",
  unpaid_absence_hours: "무급 결근시간",
  four_week_scheduled_hours: "평균 기간(4주, 4주 미만 근로면 그 기간)의 약정 소정근로시간",
  averaging_weeks: "평균을 낸 주수",
  full_time_scheduled_days_4w: "같은 기간 통상 근로자의 소정근로일수",
  holiday_weeks: "명세서 주휴 항목이 몇 주분인지",
  rounding: "끝수 처리 방법(버림·반올림·올림)",
  rounding_unit: "끝수 처리 단위(1원·10원·100원)",
  payslip_amount: "명세서 금액",
  payslip_absence_deduction: "명세서 결근 공제액",
  payslip_weekly_holiday_pay: "명세서 주휴 금액",
  employment_start: "입사일",
  employment_end: "퇴사일",
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const label = (k: string) => FIELD_LABEL[k] ?? k;
/** 받침 유무로 조사를 고른다: josa("결근 공제", "은", "는") → "결근 공제는" */
function josa(word: string, withFinal: string, without: string) {
  const ch = word.charCodeAt(word.length - 1);
  const hasFinal = ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
  return word + (hasFinal ? withFinal : without);
}
const show = (v: unknown) => (typeof v === "number" ? v.toLocaleString("ko-KR") : String(v));
/** 화면에 나가는 정책 이름. 모르는 id 도 코드 그대로 내보내지 않는다. */
const policyName = (p: string) => POLICY_NAME[p as PolicyId] ?? "고른 계산 기준";
/** 두 낱말을 「과/와」로 잇는다. */
const and = (words: string[]) => (words.length === 2 ? `${josa(words[0]!, "과", "와")} ${words[1]}` : words.join(", "));

interface Partial {
  status: Status;
  reasons: string[];
  question: string | null;
  evidence: string[];
  conditions?: string[];
  observation?: string;
}

function stop(status: Status, reason: string, question: string | null, evidence: string[], observation: string): Partial {
  return { status, reasons: [reason], question, evidence, observation };
}


/** A real calendar date in YYYY-MM-DD, or null. Other spellings (2026.04.15, 2026-4-30) are not compared. */
export function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : null;
}

/** Missing, null and an unreadable date all mean the fact is not confirmed (외부 검토 C1·C2). */
function dateOrStop(c: Confirmed, k: string, what: string, evidence: string): string | Partial {
  const v = isoDate(c[k]);
  if (v) return v;
  const reason = c[k] === undefined || c[k] === null ? `FACT_MISSING:${k}` : `FACT_INVALID_DATE:${k}`;
  return stop("NEEDS_CONFIRMATION", reason, `${what}을 2026-04-15처럼 연-월-일 날짜로 확인해 주세요.`, [evidence], `${what}이 확인된 날짜가 아닙니다.`);
}

/** Pay period, both ends, as real dates in order. */
function periodOrStop(c: Confirmed): { ps: string; pe: string } | Partial {
  const ps = isoDate(c.pay_period_start), pe = isoDate(c.pay_period_end);
  if (!ps || !pe || ps > pe) {
    return stop("NEEDS_CONFIRMATION", "FACT_MISSING:pay_period", "이 명세서의 급여기간(첫날·마지막 날)을 확인해 주세요.", ["급여기간이 적힌 명세서"], "급여기간이 확인되지 않아 중도 입·퇴사 달인지 정할 수 없습니다.");
  }
  return { ps, pe };
}

// ── Scope and facts, per scenario. Returns a stop, or null to go on to the basis gate. ──

function midJoin(c: Confirmed): Partial | null {
  const start = dateOrStop(c, "employment_start", "입사일", "입사일이 적힌 근로계약서");
  if (typeof start !== "string") return start;
  const period = periodOrStop(c);
  if (!("ps" in period)) return period;
  const { ps, pe } = period;
  if (start <= ps) return stop("OUTSIDE_SCOPE", "NOT_MID_PERIOD:starts_on_or_before_period", null, [], "입사일이 급여기간 첫날 이전이라 중도입사 달이 아닙니다. 정상 근무월은 지금 범위 밖입니다.");
  if (start > pe) return stop("OUTSIDE_SCOPE", "NOT_IN_PERIOD:starts_after_period", null, [], "입사일이 이 급여기간 뒤입니다.");
  return null;
}

function midLeave(c: Confirmed): Partial | null {
  const end = dateOrStop(c, "employment_end", "퇴사일", "퇴사일이 적힌 사직서·인사기록");
  if (typeof end !== "string") return end;
  const period = periodOrStop(c);
  if (!("ps" in period)) return period;
  const { ps, pe } = period;
  if (end >= pe) return stop("OUTSIDE_SCOPE", "NOT_MID_PERIOD:ends_on_or_after_period", null, [], "퇴사일이 급여기간 마지막 날 이후라 중도퇴사 달이 아닙니다. 정상 근무월은 지금 범위 밖입니다.");
  if (end < ps) return stop("OUTSIDE_SCOPE", "NOT_IN_PERIOD:ends_before_period", null, [], "퇴사일이 이 급여기간 앞입니다.");
  // Facts the leave month depends on: not given, unknown or unreadable all stop. Never adjust a date.
  const open = [
    ...(isoDate(c.last_scheduled_workday) ? [] : ["last_scheduled_workday"]),
    ...(c.paid_holiday_treatment === "paid" || c.paid_holiday_treatment === "unpaid" ? [] : ["paid_holiday_treatment"]),
  ];
  if (open.length) {
    // 묻는 것은 확인되지 않은 항목뿐이다. 계산 기준은 아직 확인 전일 때만 함께 묻는다.
    const ask: Record<string, { name: string; evidence: string }> = {
      last_scheduled_workday: { name: "마지막 소정근로일", evidence: "마지막 근무일이 적힌 근무표·출퇴근기록" },
      paid_holiday_treatment: { name: "유급휴일 처리", evidence: "퇴사월 유급휴일 처리 내역" },
      basis: { name: "퇴사월 계산 기준", evidence: "퇴사월 계산 기준이 적힌 계약·취업규칙 조항" },
    };
    const items = [...open, ...(c.calculation_basis_documented === true ? [] : ["basis"])].map((k) => ask[k]!);
    const names = items.map((x) => x.name);
    return {
      status: "NEEDS_CONFIRMATION",
      reasons: open.map((k) => `FACT_UNKNOWN:${k}`),
      question: `${josa(names.join(", "), "을", "를")} ${names.length > 1 ? "각각 " : ""}확인해 주세요.`,
      evidence: items.map((x) => x.evidence),
      observation: `${josa(and(open.map((k) => ask[k]!.name)), "이", "가")} 확인되지 않아 퇴사월 대조를 시작하지 않습니다.`,
    };
  }
  // 마지막 소정근로일은 급여기간 첫날부터 퇴사일 사이여야 한다. 밖이면 날짜를 고치지 않고 멈춘다.
  const last = c.last_scheduled_workday as string;
  if (last > end || last < ps) {
    return stop("NEEDS_CONFIRMATION", "FACT_INVALID_DATE:last_scheduled_workday", "마지막 소정근로일이 급여기간 첫날과 퇴사일 사이의 날짜인지 확인해 주세요.", ["마지막 근무일이 적힌 근무표·출퇴근기록", "퇴사일이 적힌 사직서·인사기록"], `마지막 소정근로일 ${last}이 급여기간 첫날 ${ps}부터 퇴사일 ${end} 사이에 있지 않습니다.`);
  }
  return null;
}

function absence(c: Confirmed): Partial | null {
  const h = num(c, "unpaid_absence_hours"), d = num(c, "payslip_absence_deduction");
  if ((h ?? 0) === 0 && (d ?? 0) === 0 && (h !== null || d !== null)) {
    return stop("OUTSIDE_SCOPE", "NO_ABSENCE_AND_NO_DEDUCTION", null, [], "결근시간도 결근 공제도 없습니다. 결근 공제 대조를 시작하지 않습니다.");
  }
  // paid_leave_or_holiday: true = 그날은 유급휴가·휴일이었다 / false = 아니었다(확인함) / 없음·null = 확인 못함.
  // The user says the day was paid leave or a paid holiday: a deduction is not compared as an absence.
  if (c.paid_leave_or_holiday === true) {
    return stop("NEEDS_CONFIRMATION", "DAY_IS_PAID_LEAVE_OR_HOLIDAY", "그날이 유급휴가·유급휴일로 처리됐는데 결근 공제가 들어간 이유를 확인해 주세요.", ["휴가 승인 기록", "결근 공제 기준이 적힌 취업규칙 조항"], "그날은 유급휴가·유급휴일로 확인돼 결근 공제 계산으로 대조하지 않습니다.");
  }
  // 묻는 것은 확인되지 않은 항목뿐이다. 공제 기준은 아직 확인 전일 때만 함께 묻는다.
  const workdayOpen = c.scheduled_workday_confirmed !== true, leaveOpen = c.paid_leave_or_holiday !== false;
  if (workdayOpen || leaveOpen) {
    const basisOpen = c.calculation_basis_documented !== true;
    // 문의 문장은 기록 이름이 아니라 그날의 사실을 묻는다. 기록은 필요한 자료 칸에만 둔다.
    const asks = [...(workdayOpen ? ["소정근로일이었는지"] : []), ...(leaveOpen ? ["유급휴가·유급휴일이었는지"] : [])];
    const facts = [...(workdayOpen ? ["소정근로일인지"] : []), ...(leaveOpen ? ["유급휴가·휴일인지"] : [])];
    return stop(
      "NEEDS_CONFIRMATION",
      "FACT_UNCONFIRMED:scheduled_workday",
      `공제된 그날이 ${asks.join(", ")} 확인해 주세요.${basisOpen ? " 결근 공제 기준 조항도 함께 확인해 주세요." : ""}`,
      [...(workdayOpen ? ["그날의 근무표"] : []), ...(leaveOpen ? ["휴가 승인 기록"] : []), ...(basisOpen ? ["결근 공제 기준이 적힌 취업규칙 조항"] : [])],
      `공제된 날이 ${facts.join(", ")} 확인되지 않았습니다.`,
    );
  }
  return null;
}

function weeklyHoliday(c: Confirmed): Partial | null {
  // A temporary substitute shift is not the agreed schedule unless the contract changed (spec §7).
  if (num(c, "temporary_actual_hours_in_one_week") !== null && c.contract_change_confirmed !== true) {
    return stop("NEEDS_CONFIRMATION", "TEMPORARY_HOURS_NOT_AGREED_HOURS", "대타시간이 계약상 약정시간 변경인지 확인해 주세요.", ["대타 근무가 적힌 근무표", "약정시간 변경을 적은 계약서·문자"], "약정시간과 실제 대타 시간이 다릅니다. 실제 시간만으로 주휴 대조를 시작하지 않습니다.");
  }
  // weekly_holiday_designated: true(지정함)·false(지정 안 함)는 확인된 사실 / 없음·null 은 확인 못함 (외부 검토 C1).
  const continuityOpen = c.employment_continued_for_7_days !== true, designationOpen = typeof c.weekly_holiday_designated !== "boolean";
  if (continuityOpen || designationOpen) {
    // 묻는 것은 확인되지 않은 항목뿐이다.
    const docs = [...(continuityOpen ? ["계약 기간", "계속근로"] : []), ...(designationOpen ? ["주휴일 지정"] : [])];
    const facts = [...(continuityOpen ? ["계속근로"] : []), ...(designationOpen ? ["주휴일 지정"] : [])];
    return stop(
      "NEEDS_CONFIRMATION",
      "FACT_UNCONFIRMED:continuity_or_holiday",
      `${docs.join(", ")} 자료를 확인해 주세요.`,
      [...(continuityOpen ? ["계약 기간이 적힌 근로계약서"] : []), ...(designationOpen ? ["주휴일을 정한 계약·취업규칙 조항"] : [])],
      `그 주의 ${josa(and(facts), "이", "가")} 확인되지 않았습니다.`,
    );
  }
  // 근로기준법 제18조제3항: 4주 동안(4주 미만으로 근로하는 경우에는 그 기간)을 평균한다 (외부 검토 C3).
  const h4 = num(c, "four_week_scheduled_hours"), weeks = num(c, "averaging_weeks");
  if (h4 !== null) {
    if (weeks === null || weeks <= 0 || weeks > 4) {
      return stop("NEEDS_CONFIRMATION", "FACT_MISSING:averaging_weeks", "약정 소정근로시간을 몇 주 동안의 시간으로 셌는지(4주, 또는 근로한 기간이 4주 미만이면 그 주수) 확인해 주세요.", ["근로계약서의 계약 기간", "근무표"], "평균을 낼 기간이 확인되지 않아 1주 평균 시간을 정할 수 없습니다.");
    }
    if (h4 / weeks < 15) {
      return stop("OUTSIDE_SCOPE", "WEEKLY_AVG_UNDER_15", null, [], `${weeks}주 평균 1주 약정 소정근로시간이 ${Math.round((h4 / weeks) * 100) / 100}시간으로 15시간 미만입니다(근로기준법 제18조제3항). 주휴 대조 대상이 아닙니다.`);
    }
  }
  if (c.all_scheduled_days_attended !== true) {
    return stop("NEEDS_CONFIRMATION", "FACT_UNCONFIRMED:attendance", "해당 주 소정근로일을 개근했는지 근무표로 확인해 주세요.", ["해당 주 근무표·출퇴근기록"], "해당 주 개근 여부가 확인되지 않았습니다(시행령 제30조제1항).");
  }
  return null;
}

const FACTS: Record<Scenario, (c: Confirmed) => Partial | null> = {
  MID_JOIN: midJoin,
  MID_LEAVE: midLeave,
  ABSENCE_DEDUCTION: absence,
  HOURLY_WEEKLY_HOLIDAY: weeklyHoliday,
};

const BASIS_QUESTION: Record<Scenario, { q: string; evidence: string[] }> = {
  MID_JOIN: { q: "입사월 급여를 일수·시간 중 어떤 기준으로 계산하는지 적힌 계약/규정을 확인해 주세요.", evidence: ["입사월 계산 기준이 적힌 근로계약서·취업규칙 조항"] },
  MID_LEAVE: { q: "퇴사월 급여를 일수·시간 중 어떤 기준으로 계산하는지 적힌 계약/규정을 확인해 주세요.", evidence: ["퇴사월 계산 기준이 적힌 근로계약서·취업규칙 조항"] },
  ABSENCE_DEDUCTION: { q: "결근 공제를 시간·일 중 어떤 기준으로 하는지 적힌 취업규칙·계약 조항을 확인해 주세요.", evidence: ["결근 공제 기준이 적힌 취업규칙 조항"] },
  HOURLY_WEEKLY_HOLIDAY: { q: "주휴수당 계산 기준(약정 소정근로시간)이 적힌 근로계약서를 확인해 주세요.", evidence: ["근로계약서"] },
};

function afterCompare(s: Scenario, p: PolicyId, match: boolean): { q: string; evidence: string[]; conditions: string[] } {
  if (s === "ABSENCE_DEDUCTION") {
    // 외부 검토 I4: 결근한 주의 주휴는 이 대조 밖이라는 것을 결과에 적는다.
    const week = "무급 결근이 있는 주는 소정근로일 개근이 아니어서 그 주의 유급 주휴일이 생기지 않을 수 있습니다(근로기준법 시행령 제30조제1항). 명세서에서 그 주 주휴수당이 빠졌거나 공제됐다면 이 결근 공제 대조에는 들어 있지 않으니 따로 확인해 주세요.";
    return match
      ? { q: "유급·무급 처리 사유가 달라지면 다시 확인해 주세요.", evidence: [], conditions: ["그날이 유급휴가·유급휴일로 바뀌면 공제 대상이 아닐 수 있습니다.", week] }
      : { q: "결근으로 처리된 시간과 공제 기준이 명세서 계산과 같은지 확인해 주세요.", evidence: ["결근 처리 내역", "결근 공제 기준이 적힌 취업규칙 조항"], conditions: ["회사가 시간 기준이 아닌 다른 기준으로 공제했다면 그 기준으로 다시 대조해야 합니다.", week] };
  }
  if (s === "HOURLY_WEEKLY_HOLIDAY") {
    // 여기까지 오면 계속근로·주휴일 지정·개근은 모두 확인된 값이다. 어긋남이면 아직 다를 수 있는 계산만 묻는다.
    return {
      // 주수(holiday_weeks)와 약정 소정근로시간은 사용자가 넣은 값이다. 명세서가 쓴 1일 소정근로시간만 묻는다.
      q: match ? "주휴일 지정과 개근 처리가 달라지면 다시 확인해 주세요." : "명세서가 1일 소정근로시간을 몇 시간으로 계산했는지 확인해 주세요.",
      evidence: match ? [] : ["명세서 주휴수당 계산 내역"],
      conditions: ["약정시간이 바뀌었거나 통상 근로자의 소정근로일수가 다르면 1일 소정근로시간이 달라집니다."],
    };
  }
  const month = s === "MID_JOIN" ? "입사월" : "퇴사월";
  if (p === "DAY_30") {
    // 30일 기준도 확인된 회사 기준이다. 어긋남이면 명세서가 쓴 인정일수·기준 일수만 묻는다.
    const cond = ["인정일수나 기준 일수(30일)가 다르면 기대값이 달라집니다."];
    return match
      ? { q: "인정일수나 기준이 달라지면 다시 확인해 주세요.", evidence: [], conditions: cond }
      : { q: `명세서가 ${month} 인정일수를 며칠로, 몇 일 기준으로 계산했는지 확인해 주세요.`, evidence: [`명세서 ${month} 급여 계산 내역`], conditions: cond };
  }
  // 시간 기준은 확인된 회사 기준이다. 어긋남이면 명세서가 유급으로 처리한 시간만 묻는다.
  const day = s === "MID_JOIN" ? "입사일" : "퇴사 전 마지막 근무일";
  return match
    ? { q: "유급으로 처리된 시간이 달라지면 다시 확인해 주세요.", evidence: [], conditions: ["유급으로 처리된 시간이 다르면 기대값이 달라집니다."] }
    : { q: `명세서가 ${month} 유급 처리 시간을 몇 시간으로 계산했는지 확인해 주세요.`, evidence: [`${day}의 근무표·출퇴근기록`, `명세서 ${month} 급여 계산 내역`], conditions: ["유급으로 처리된 시간이 다르면 기대값이 달라집니다."] };
}

export function check(input: CheckInput): CheckResult {
  const { scenario: s, confirmed: c, policy_id: p } = input;
  const base = {
    case_id: input.case_id ?? null,
    scenario: s,
    policy_id: p,
    expected_amount: null,
    payslip_amount: null,
    difference: null,
    grounds: [] as string[],
    conditions: [] as string[],
    open_confirmations: [] as string[],
    citations: CITATIONS[s],
  };
  const done = (x: Partial): CheckResult => ({
    ...base,
    status: x.status,
    reasons: x.reasons,
    observation: x.observation ?? "",
    conditions: x.conditions ?? [],
    evidence_needed: x.evidence.slice(0, 3),
    required_question: x.question,
  });

  const fact = FACTS[s](c);
  if (fact) return done(fact);

  // Basis gate: the product never picks a company basis (spec 화면 5).
  // 「기준이 정해져 있음」(policy_id)과 「문서에서 확인함」(calculation_basis_documented)은 다른 사실이다 (261022 결정).
  // 기준이 없으면 멈춘다. 기준은 있는데 문서 확인이 true 가 아니면 참고 계산만 내고 확인 상태를 남긴다.
  const documented = c.calculation_basis_documented === true;
  if (p === null) {
    const b = BASIS_QUESTION[s];
    return done(stop("NEEDS_CONFIRMATION", "COMPANY_BASIS_NOT_CONFIRMED", b.q, b.evidence, `${josa(ITEM[s], "을", "를")} 어떤 기준으로 계산했는지 확인되지 않아 금액을 만들지 않습니다.`));
  }
  if (!POLICIES_FOR[s].includes(p)) {
    return done(stop("NEEDS_CONFIRMATION", `POLICY_NOT_FOR_SCENARIO:${p}`, BASIS_QUESTION[s].q, BASIS_QUESTION[s].evidence, `${josa(policyName(p), "은", "는")} 이 예외의 대조에 쓰지 않습니다.`));
  }

  const out = applyPolicy(p, c);
  const payslipKey = PAYSLIP_FIELD[s];
  const raw = num(c, payslipKey);
  if (!out.ok || raw === null) {
    const missing = out.ok ? [payslipKey] : out.missing;
    if (raw === null && !out.ok) missing.push(payslipKey);
    const names = [...new Set(missing)].map(label);
    return done(stop("NEEDS_CONFIRMATION", out.ok ? `FIELD_MISSING:${payslipKey}` : out.reason, `${josa(names.join(", "), "을", "를")} 확인해 주세요.`, names, `대조에 필요한 값이 비어 있어 금액을 만들지 않습니다: ${names.join(", ")}.`));
  }

  // A deduction is compared by its size: payslips print it as −80,000 or 80,000.
  const payslip = s === "ABSENCE_DEDUCTION" ? Math.abs(raw) : raw;
  // Same polarity for every item: positive = the worker gets less than the confirmed basis gives.
  const diff = s === "ABSENCE_DEDUCTION" ? payslip - out.amount : out.amount - payslip;
  const match = diff === 0;
  const after = afterCompare(s, p, match);
  const basisWord = documented ? "확인한 기준" : "고른 기준";
  const obs = (documented ? "" : "참고 계산입니다. ") + (match
    ? `입력한 기준으로는 명세서 ${ITEM[s]} ${won(payslip)}과 대조됩니다.`
    : `명세서 ${josa(ITEM[s], "은", "는")} ${won(payslip)}이고, ${basisWord}(${policyName(p)})으로 계산하면 ${won(out.amount)}입니다. 차이 ${won(Math.abs(diff))}. 계산 기준이 같다면 차이를 확인해 보세요.`);
  // 확인 상태: 금액을 냈어도 확인되지 않은 채 남은 것은 숨기지 않는다 (261022 결정).
  const open: string[] = [], openReasons: string[] = [], openCites: string[] = [];
  let q = after.q, evidence = after.evidence;
  if (!documented) {
    open.push("계산 기준 문서 미확인 — 고른 기준이 회사 문서에 적혀 있는지 확인하지 못했습니다. 위 금액은 참고 계산이며, 문서에서 확인하기 전까지 확인된 결과로 보지 않습니다.");
    openReasons.push("BASIS_NOT_DOCUMENTED");
    q = `${BASIS_QUESTION[s].q} ${after.q}`;
    evidence = [...BASIS_QUESTION[s].evidence, ...after.evidence];
  }
  if (s === "HOURLY_WEEKLY_HOLIDAY" && c.weekly_holiday_designated === false) {
    open.push("주휴일 확인 필요 — 계약·규칙에 주휴일이 정해져 있지 않은 것으로 확인됐습니다. 이 금액 대조는 주휴일 지정 여부를 쓰지 않는 현재 산식 범위의 결과입니다. 주휴일을 실제로 주었는지와 근로조건을 서면에 적었는지는 따로 확인해야 합니다.");
    openReasons.push("WEEKLY_HOLIDAY_NOT_DESIGNATED");
    openCites.push("근로기준법 제17조");
  }
  return {
    ...base,
    status: match ? "MATCH" : "POTENTIAL_MISMATCH",
    expected_amount: out.amount,
    payslip_amount: payslip,
    difference: diff,
    reasons: [match ? "COMPARED_EQUAL" : "COMPARED_DIFFERENT", ...openReasons],
    observation: obs,
    grounds: [...out.grounds, ...POLICY_FIELDS[p].map((k) => `${label(k)}: ${show(c[k])} (사용자 확인)`)],
    conditions: after.conditions,
    open_confirmations: open,
    evidence_needed: evidence.slice(0, 3),
    required_question: q,
    citations: [...base.citations, ...openCites],
  };
}
