/**
 * 미사용 연차수당 — **금액 계산 엔진**.
 *
 * 🔒 이 모듈은 화면·API·CSV 어디에도 붙이지 않는다(2026-09-23 재홍님 지시).
 *    급여대장 연동 시 쓰기 위해 만들어만 둔다.
 *    노출하려면 제우스의 출시 게이트를 먼저 통과해야 한다.
 *
 * ★ 설계의 핵심: **통상임금을 우리가 산정하지 않는다.**
 *    위험한 것은 `일수 × 단가` 곱셈이 아니라 「무엇이 통상임금인가」다.
 *    산입 범위는 그 자체가 분쟁의 중심이고(2024 전합 이후 특히), 우리가 정하면
 *    그 숫자가 근거로 쓰이고 책임이 따라온다.
 *    → **단가는 입력받고, 어떤 값을 썼는지 결과에 그대로 남긴다.**
 *
 * 법적 근거
 *   근기법 §60 — 연차유급휴가
 *   §60⑤ 단서 — 사용자는 휴가를 주어야 하고, 미사용분은 수당으로 정산한다는 실무 관행
 *   수당의 단가를 통상임금으로 볼지 평균임금으로 볼지는 취업규칙·단협에 따른다
 *   → 그래서 `rateBasis` 를 입력받아 **무엇을 기준으로 삼았는지 기록**한다.
 */

export type RateBasis = "ordinary-wage" | "average-wage" | "custom";

export interface AllowanceInput {
  /** 미사용일수 — leave-ledger / leave-usage 에서 온 값 */
  unusedDays: number;
  /**
   * 1일 단가(원). **우리가 산정하지 않는다.** 급여대장이나 담당자가 준 값.
   * 시간급만 있는 경우 `dailyRate = hourlyRate * hoursPerDay` 로 호출자가 환산해 넣는다.
   */
  dailyRate: number;
  /** 그 단가가 무엇인지 — 결과에 그대로 표시된다 */
  rateBasis: RateBasis;
  /** 단가의 출처 설명 (예: "2026-09 급여대장 통상임금") */
  rateSource: string;
  /** 원 단위 처리 방식. 기본은 버림(근로자에게 불리하지 않게 하려면 호출자가 정한다) */
  rounding?: "floor" | "round" | "ceil";
}

export type AllowanceVerdict = "calculated" | "insufficient-input";

export interface AllowanceResult {
  verdict: AllowanceVerdict;
  /** 계산된 금액(원). insufficient-input 이면 null */
  amount: number | null;
  unusedDays: number;
  dailyRate: number;
  rateBasis: RateBasis;
  rateSource: string;
  /** 화면·문서에 그대로 붙일 산식 문장 */
  formulaNote: string;
  /** 왜 계산할 수 없는지 */
  blockedReason?: string;
}

const BASIS_LABEL: Record<RateBasis, string> = {
  "ordinary-wage": "통상임금",
  "average-wage": "평균임금",
  custom: "별도 기준",
};

export function rateBasisLabel(basis: RateBasis): string {
  return BASIS_LABEL[basis];
}

function applyRounding(value: number, mode: AllowanceInput["rounding"]): number {
  if (mode === "ceil") return Math.ceil(value);
  if (mode === "round") return Math.round(value);
  return Math.floor(value);
}

/**
 * 미사용수당 금액.
 *
 * 하지 않는 것
 *   · 통상임금 산정 (입력받는다)
 *   · 소멸시효로 인한 차감 (제우스 게이트: 개별 일수를 시효와 연결 금지)
 *   · 연차촉진으로 인한 지급의무 소멸 판정 (적법성은 사실인정)
 *   → 이 세 가지를 반영하려면 **호출자가 unusedDays 를 조정해서 넣어야 한다.**
 *      엔진이 몰래 깎지 않는다.
 */
export function calculateAllowance(input: AllowanceInput): AllowanceResult {
  const { unusedDays, dailyRate, rateBasis, rateSource } = input;

  const base: Omit<AllowanceResult, "verdict" | "amount" | "formulaNote"> = {
    unusedDays,
    dailyRate,
    rateBasis,
    rateSource,
  };

  if (!Number.isFinite(unusedDays) || unusedDays < 0) {
    return {
      ...base,
      verdict: "insufficient-input",
      amount: null,
      formulaNote: "-",
      blockedReason: "미사용일수가 유효하지 않습니다",
    };
  }
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return {
      ...base,
      verdict: "insufficient-input",
      amount: null,
      formulaNote: "-",
      blockedReason:
        "1일 단가가 없습니다. 통상임금은 이 도구가 산정하지 않으므로 급여대장에서 받아야 합니다",
    };
  }
  if (!rateSource || !rateSource.trim()) {
    return {
      ...base,
      verdict: "insufficient-input",
      amount: null,
      formulaNote: "-",
      blockedReason:
        "단가의 출처가 비어 있습니다. 어떤 값을 썼는지 남기지 않으면 금액을 내지 않습니다",
    };
  }

  const raw = unusedDays * dailyRate;
  const amount = applyRounding(raw, input.rounding);

  return {
    ...base,
    verdict: "calculated",
    amount,
    formulaNote: `${unusedDays}일 × ${dailyRate.toLocaleString("ko-KR")}원(${BASIS_LABEL[rateBasis]}, ${rateSource}) = ${amount.toLocaleString("ko-KR")}원`,
  };
}

/** 시간급만 있을 때 호출자가 쓰는 보조 함수 — 소정근로시간을 반드시 받는다 */
export function dailyRateFromHourly(hourlyRate: number, hoursPerDay: number): number {
  if (!Number.isFinite(hourlyRate) || !Number.isFinite(hoursPerDay) || hoursPerDay <= 0) {
    return NaN;
  }
  return hourlyRate * hoursPerDay;
}
