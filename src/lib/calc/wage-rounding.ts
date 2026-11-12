// 통상임금 끝수 규칙 — 시간급·1일 통상임금으로 수당을 내는 사이트 계산기는 모두 이 파일을 쓴다(261112 재홍님 결정 「추천안대로」).
//   해고예고수당(notice-pay) · 연차수당(leave-pay, leave-allowance, /exit 추정) · 휴업수당(shutdown-allowance) · 공휴일 수당(holiday-pay)
//   · 주휴수당(weekly-holiday)
//   아직 따르지 않는 곳: 챗봇 도구 calc_ordinary_wage·calc_overtime(src/lib/labor-calc.ts — 통상시급을 원 단위로 버린다.
//   도구 정의가 통상시급을 정수로 받게 되어 있어 챗봇 쪽과 함께 고친다).
//
// 규칙
//   1. 시간급·1일 통상임금은 끝수를 버리거나 반올림하지 않는다. 곱셈을 먼저 하고 나눗셈은 한 번만 한다
//      (월급 × 1일 소정근로시간 × 일수 ÷ 기준시간 — 시간급을 먼저 내서 곱하면 끝수 오차가 일수만큼 커진다).
//   2. 원 미만은 근로자가 받을 마지막 금액에서 한 번만 올린다(원 미만 올림).
//   3. 화면에는 중간값을 소수 둘째 자리까지 보인다. 계산은 보인 값이 아니라 끝수 그대로의 값으로 한다.
//
// 근거
//   · 근로기준법·시행령에 통상임금 끝수 규정이 없다. 고용노동부도 같은 취지다 — 임금복지과-183(2010. 3. 15.)
//     「소수점 이하 자리 수 및 처리법(반올림 등)에 대하여는 별도 규정된 바 없으므로」(최저임금 환산 시간 수 질의).
//   · 수당 조문은 하한이다 — §26 「30일분 이상의 통상임금」, §46① 「100분의 70 이상의 수당」, §56 「금액 이상을 가산」.
//     버리거나 반올림하면 정확한 값보다 적어질 수 있다(3,000,000 ÷ 209 × 8 × 30 = 3,444,976.08 → 버리면 0.08원 모자란다).
//   · 퇴직연금복지과-777(2009. 4. 1.) — 평균임금은 「소수점 이하까지 나오더라도 계산하여야 하며」, 줄이더라도
//     「근로자에게 불이익이 없도록 … 올림을 하는 것이 타당」. 평균임금 해석이라 통상임금에 바로 쓰이지는 않지만 같은 방향을 따른다.
//   방향(올림)은 법령이 정한 것이 아니라 위 하한 문언과 해석 취지에 맞춘 설계 선택이다.
//
// 이 파일은 import 없이 홀로 선다.

/**
 * 부동소수 잡음만 지운다 — 참값이 정수인데 487,999.9999… 이나 …000.0000001 로 나온 것을 정수로 돌린다.
 * 버림에서는 1원이 빠지고 올림에서는 1원이 더 붙는다. 참값의 소수 부분은 1/(기준시간 × 100) 단위보다 굵어 1e-6 안쪽에 오지 않는다.
 */
export function snapWon(x: number): number {
  const r = Math.round(x);
  return Math.abs(x - r) < 1e-6 ? r : x;
}

/** 지급액 — 끝수 그대로의 금액에서 원 미만을 한 번 올린다. 음수는 0 으로 보지 않는다(호출자가 막는다) */
export function payableWon(exact: number): number {
  return Math.ceil(snapWon(exact));
}

/** 시간급 통상임금 = 단위 기간 금액 ÷ 기준시간(근로기준법 시행령 §6②). 끝수 그대로 */
export function hourlyOrdinaryWage(amount: number, unitHours: number): number {
  return amount / unitHours;
}

/** 1일 통상임금 = 시간급 × 1일 소정근로시간(시행령 §6③). 곱셈 먼저(금액 × 1일 시간 ÷ 기준시간), 끝수 그대로 */
export function dailyOrdinaryWage(amount: number, dailyHours: number, unitHours: number): number {
  return snapWon((amount * dailyHours) / unitHours);
}

/** 올림 나눗셈(음이 아닌 정수, BigInt) — 정수로 셈하는 엔진(휴업수당)이 원 미만을 올릴 때 */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - BigInt(1)) / b;
}

/** 화면 표시 — 소수 둘째 자리까지(셋째 자리에서 반올림), 천 단위 쉼표. 계산에는 쓰지 않는다 */
export function dec2(n: number): string {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
