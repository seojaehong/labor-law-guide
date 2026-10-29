/**
 * 미사용 연차수당 — **금액 계산 엔진**.
 *
 * 🔓 2026-09-23 「화면·API·CSV 어디에도 붙이지 않는다」 잠금은 2026-10-29 재홍님 결정으로
 *    /tools/leave-pay(src/lib/calc/leave-pay.ts, PR #117)에 한해 풀었다.
 *    다른 화면·API·CSV 에 붙이려면 다시 결정을 받는다.
 *    붙일 때 지키는 것: 단가 입력·출처 기록, 시효·촉진으로 일수를 깎지 않음(tests/unit/calc-leave-pay.test.ts).
 *
 * ★ 설계의 핵심: **통상임금을 우리가 산정하지 않는다.**
 *    위험한 것은 `일수 × 단가` 곱셈이 아니라 「무엇이 통상임금인가」다.
 *    산입 범위는 그 자체가 분쟁의 중심이고(2024 전합 이후 특히), 우리가 정하면
 *    그 숫자가 근거로 쓰이고 책임이 따라온다.
 *    → **단가는 입력받고, 어떤 값을 썼는지 결과에 그대로 남긴다.**
 *
 * 법적 근거
 *   근기법 §60 — 연차유급휴가
 *   미사용수당 청구권 — 법조문에 명문은 없고 판례로 선다. 대법원 2005.5.27. 2003다48549, 48556
 *     (휴가권을 얻은 뒤 쓰기 전에 근로관계가 끝나도 연차휴가수당 청구권은 남는다)
 *     (2026-10-29 정정 — 종전 「§60⑤ 단서」는 오기였다. §60⑤ 단서는 사용자의 시기변경권이다)
 *   §60⑤(2027-06-10부터 §60⑥) — 휴가 기간에는 취업규칙 등에서 정하는 통상임금 또는 평균임금을 지급
 *   정함이 없으면 통상임금으로 산정한다(대법원 2019.10.18. 2018다239110)
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

  // 부동소수 잡음만 지운다 — 단가가 시간급 × 시간(예: 1,159,000 × 8 ÷ 209)이면 참값이 정수인데
  // 곱한 값이 487,999.9999… 가 되어 버림에서 1원이 빠진다(2026-10-29 실측, 600만 입력 중 0.11%).
  // 참값의 소수 부분은 1/기준시간(250 이하) 단위라 1e-6 안쪽에 오지 않으므로 정수가 아닌 값은 건드리지 않는다.
  const product = unusedDays * dailyRate;
  const raw = Math.abs(product - Math.round(product)) < 1e-6 ? Math.round(product) : product;
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
