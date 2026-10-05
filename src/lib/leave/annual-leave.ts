/**
 * 한국 연차휴가 발생일수 — 입사일 기준 참조 계산.
 *
 * ⚠️ 이 구현은 `hrms/regional/south_korea/annual_leave.py` 와 **의도적으로 독립**이다.
 *    같은 규칙을 두 번 구현해 서로 대조하기 위한 것이다(교차 검증).
 *    두 구현이 다른 값을 내면 그 자체가 신호다 — 한쪽을 복사해 맞추지 말 것.
 *
 * 규칙 (근로기준법 제60조)
 *   · 1년 미만          계속근로 1개월당 1일, 최대 11일
 *   · 1년 이상          15일
 *   · 3년 이상          2년마다 1일 가산, 상한 25일
 *
 * 다루지 않는 것 — 화면에서 "지원 범위 밖"으로 표시해야 한다
 *   · 출근율 80% 미만        · 회계연도 기준 운영
 *   · 육아휴직·병휴직 등 특수 출결   · 회사 추가 부여분
 *   · 이월·사용분을 뺀 잔여일수     ← 이 도구는 「발생」만 본다
 */

export type LeaveBasis = "hire-date";

export interface EntitlementInput {
  hireDate: string; // YYYY-MM-DD
  asOf: string; // YYYY-MM-DD
}

export interface EntitlementResult {
  /** 총 발생일수 */
  days: number;
  /** 어떤 규칙이 적용됐는지 — 화면에 근거로 보여준다 */
  basisLabel: string;
  /** 계속근로 개월 수(1년 미만일 때만 의미) */
  completedMonths: number;
  /** 근속 연수(만) */
  serviceYears: number;
}

const MAX_FIRST_YEAR_DAYS = 11;
const BASE_DAYS = 15;
const MAX_DAYS = 25;

function parse(date: string, label: string): Date {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`${label}이 올바른 날짜 형식(YYYY-MM-DD)이 아닙니다`);
  }

  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) {
    throw new Error(`${label}이 올바른 날짜가 아닙니다`);
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label}이 올바른 날짜가 아닙니다`);
  }
  return parsed;
}

/** 만 나이 계산과 같은 방식 — 기념일이 지났는지로 센다 */
function completedYears(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const anniversary = new Date(
    Date.UTC(to.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  );
  if (to < anniversary) years -= 1;
  return years;
}

function completedMonths(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function calculateEntitlement(input: EntitlementInput): EntitlementResult {
  const hire = parse(input.hireDate, "입사일");
  const asOf = parse(input.asOf, "기준일");

  if (asOf < hire) {
    throw new Error("기준일이 입사일보다 빠릅니다");
  }

  const years = completedYears(hire, asOf);
  const months = completedMonths(hire, asOf);

  // 1년 미만 — 개월당 1일, 상한 11
  if (years < 1) {
    const days = Math.min(months, MAX_FIRST_YEAR_DAYS);
    return {
      days,
      basisLabel: `1년 미만 · 계속근로 ${months}개월 → 개월당 1일(상한 11일)`,
      completedMonths: months,
      serviceYears: years,
    };
  }

  // 1년 이상 — 15일 + 3년차부터 2년마다 1일, 상한 25
  const bonus = Math.floor((years - 1) / 2);
  const raw = BASE_DAYS + bonus;
  const days = Math.min(raw, MAX_DAYS);
  const capped = raw > MAX_DAYS;

  return {
    days,
    basisLabel: capped
      ? `근속 ${years}년 · 15일 + 가산 ${bonus}일 = ${raw}일 → 상한 25일 적용`
      : `근속 ${years}년 · 15일 + 가산 ${bonus}일`,
    completedMonths: months,
    serviceYears: years,
  };
}

export type ComparisonVerdict = "match" | "diff" | "error";

export interface ComparisonRow {
  name: string;
  hireDate: string;
  /** 회사 대장에 적혀 있던 값 */
  recordedDays: number;
  /** 우리 계산값 */
  calculatedDays: number;
  diff: number;
  verdict: ComparisonVerdict;
  basisLabel: string;
  /** 계산 실패 시 사유 — 실패를 「일치」로 처리하지 않는다 */
  errorMessage?: string;
}

export function compareRow(
  row: { name: string; hireDate: string; recordedDays: number },
  asOf: string
): ComparisonRow {
  try {
    const result = calculateEntitlement({ hireDate: row.hireDate, asOf });
    const diff = row.recordedDays - result.days;
    return {
      name: row.name,
      hireDate: row.hireDate,
      recordedDays: row.recordedDays,
      calculatedDays: result.days,
      diff,
      verdict: diff === 0 ? "match" : "diff",
      basisLabel: result.basisLabel,
    };
  } catch (e) {
    // 실패는 반드시 실패로 남긴다. 일치로 넘어가면 안 된다.
    return {
      name: row.name,
      hireDate: row.hireDate,
      recordedDays: row.recordedDays,
      calculatedDays: NaN,
      diff: NaN,
      verdict: "error",
      basisLabel: "-",
      errorMessage: e instanceof Error ? e.message : "계산 실패",
    };
  }
}
