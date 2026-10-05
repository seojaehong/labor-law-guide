/**
 * 연차 — 출근율 80%(A2) · 회계연도 첫해 비례부여(A3) · 소멸시효 안내(A6).
 *
 * 세 가지를 한 파일에 둔 이유: 모두 「판정하지 않고 조건을 드러내는」 성격이라
 * 같은 규율을 공유한다.
 */

import { calculateEntitlement } from "./annual-leave";

/* ═══════════════════════════════════════════════════════════════
   A2. 출근율 80% 미만 — 근기법 제60조 제1항·제2항
   ─────────────────────────────────────────────────────────────
   §60① 1년간 80% 이상 출근 → 15일
   §60② 1년 미만이거나 80% 미만 출근 → 1개월 개근마다 1일

   ⚠️ 출근율 자체는 우리가 계산하지 않는다.
      소정근로일수에서 무엇을 빼는지(육아휴직·업무상재해·쟁의행위 등)는
      사안마다 다르고 다툼이 있다. **비율을 입력받는다.**
   ═══════════════════════════════════════════════════════════════ */

export type AttendanceVerdict = "normal" | "reduced" | "unknown";

export interface AttendanceResult {
  verdict: AttendanceVerdict;
  /** 적용되는 발생일수 */
  days: number | null;
  ratio: number | null;
  note: string;
}

export const ATTENDANCE_THRESHOLD = 0.8;

export function applyAttendanceRatio(params: {
  hireDate: string;
  asOf: string;
  /** 0~1. 모르면 undefined — 추정하지 않는다 */
  attendanceRatio?: number;
}): AttendanceResult {
  const base = calculateEntitlement({ hireDate: params.hireDate, asOf: params.asOf });

  // 1년 미만은 출근율과 무관하게 월 단위 발생(§60②)
  if (base.serviceYears < 1) {
    return {
      verdict: "normal",
      days: base.days,
      ratio: params.attendanceRatio ?? null,
      note: "계속근로 1년 미만은 출근율과 무관하게 1개월 개근마다 1일입니다(§60②).",
    };
  }

  if (params.attendanceRatio === undefined || Number.isNaN(params.attendanceRatio)) {
    return {
      verdict: "unknown",
      days: null,
      ratio: null,
      note: "출근율이 입력되지 않았습니다. 소정근로일수에서 무엇을 제외할지는 사안마다 달라 이 도구가 계산하지 않습니다.",
    };
  }

  if (params.attendanceRatio >= ATTENDANCE_THRESHOLD) {
    return {
      verdict: "normal",
      days: base.days,
      ratio: params.attendanceRatio,
      note: `출근율 ${(params.attendanceRatio * 100).toFixed(1)}% — 80% 이상이므로 ${base.days}일이 발생합니다(§60①).`,
    };
  }

  // 80% 미만 — 연차(15일+) 대신 월 단위만
  return {
    verdict: "reduced",
    days: null,
    ratio: params.attendanceRatio,
    note: `출근율 ${(params.attendanceRatio * 100).toFixed(1)}% — 80% 미만입니다. §60① 의 15일이 아니라 §60② 의 「1개월 개근 시 1일」이 적용되며, 개근한 달 수를 알아야 일수가 나옵니다. 이 도구는 월별 개근 여부를 받지 않으므로 일수를 내지 않습니다.`,
  };
}

/* ═══════════════════════════════════════════════════════════════
   A3. 회계연도 첫해 비례부여 — 근로개선정책과-5352 (2011-12-19)
   ─────────────────────────────────────────────────────────────
   "회계연도를 기준으로 휴가를 계산할 경우 연도 중 입사자에게 불리하지 않게
    휴가를 부여하려면, 입사한 지 1년이 되지 못한 근로자에 대하여도 다음연도에
    입사년도의 근속기간에 비례하여 유급휴가를 부여하고 이후 연도부터는 회계연도를
    기준으로 …"

   최영우 교재 산정 예: 2024-07-01 입사 → 2025-01-01 자로 15일 × 6개월/12개월 = 7.5일
   ═══════════════════════════════════════════════════════════════ */

export interface ProratedResult {
  /** 비례부여 일수 */
  days: number;
  /** 입사년도에 근무한 개월 수 */
  monthsInHireYear: number;
  formula: string;
  note: string;
}

export function proratedFirstFiscalYear(params: {
  hireDate: string;
  /** 회계연도 시작 월·일 (기본 1/1) */
  fiscalStartMonth?: number;
  fiscalStartDay?: number;
  /** 소수점 처리 — 기본은 반올림하지 않고 그대로 둔다(7.5일 같은 값이 실제로 쓰인다) */
  round?: "none" | "up" | "half-up";
}): ProratedResult {
  const [y, m, d] = params.hireDate.split("-").map(Number);
  const fm = params.fiscalStartMonth ?? 1;
  const fd = params.fiscalStartDay ?? 1;

  // 입사일부터 다음 회계연도 시작 전날까지의 개월 수
  const hire = new Date(Date.UTC(y, m - 1, d));
  const nextFiscalStart =
    m > fm || (m === fm && d >= fd)
      ? new Date(Date.UTC(y + 1, fm - 1, fd))
      : new Date(Date.UTC(y, fm - 1, fd));

  let months =
    (nextFiscalStart.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
    (nextFiscalStart.getUTCMonth() - hire.getUTCMonth());
  if (nextFiscalStart.getUTCDate() < hire.getUTCDate()) months -= 1;
  months = Math.max(0, Math.min(12, months));

  const raw = (15 * months) / 12;
  const days =
    params.round === "up"
      ? Math.ceil(raw)
      : params.round === "half-up"
        ? Math.round(raw)
        : Math.round(raw * 100) / 100;

  return {
    days,
    monthsInHireYear: months,
    formula: `15일 × ${months}개월 / 12개월 = ${days}일`,
    note: "연도 중 입사자에게 불리하지 않도록 다음 회계연도 시작일에 근속기간에 비례해 부여하는 방식입니다(근로개선정책과-5352). 1년 미만 월 단위 연차(§60②)는 이와 별개로 발생합니다.",
  };
}

/* ═══════════════════════════════════════════════════════════════
   A6. 소멸시효 — **일반 안내만**. 개별 일수를 시효와 연결하지 않는다.
   ─────────────────────────────────────────────────────────────
   🔒 제우스 출시 게이트 (2026-09-23)
      · "N일은 3년 지난 분일 수 있음" 금지 — 「가능성」 단서를 붙여도 동일
      · 발생일·사용기간 종료일·퇴직일 중 하나를 자동 기산점으로 삼는 것 금지
      · 소멸·지급제외·청구불가 배지, 차감, 제외 체크박스, 내보내기 필드 금지
      이유: 회사가 그 표시를 근거로 지급을 거절하는 데 쓸 수 있다.
   ═══════════════════════════════════════════════════════════════ */

/** 화면·문서에 그대로 넣는 문장. 개별 숫자를 절대 넣지 않는다 */
export const PRESCRIPTION_NOTICE =
  "미사용수당 청구권의 소멸시효는 별도 검토가 필요합니다. 이 도구는 시효 완성 여부를 판단하거나 이를 이유로 정산일수를 차감하지 않습니다.";

/**
 * 소멸시효 관련 출력을 만들려는 시도를 막는 가드.
 * 개발 중 실수로 개별 일수를 시효와 엮으면 여기서 걸린다.
 */
export function assertNoPrescriptionMath(payload: unknown): void {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  const banned = [
    /\d+\s*일[^.]{0,12}(시효|소멸)/,
    /(시효|소멸)[^.]{0,12}\d+\s*일/,
    /3년\s*지난/,
    /청구\s*불가/,
    /지급\s*제외/,
  ];
  for (const re of banned) {
    if (re.test(text)) {
      throw new Error(
        `소멸시효를 개별 일수와 연결하는 출력이 감지됐습니다. 제우스 출시 게이트 위반입니다: ${re}`
      );
    }
  }
}
