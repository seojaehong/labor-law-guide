// 법정 숫자 한 곳. 값마다 적용 시작일(from)·끝나는 날(until, 근거가 기간을 정할 때만)·근거·확인한 날을 둔다.
// 기준일에 맞는 줄이 없으면 null 이다 — 다른 해 값으로 조용히 대신하지 않는다.
// 끝나는 날이 60일 안으로 다가오면 tests/unit/rates.test.ts 가 실패한다. 다음 고시를 원문으로 확인해 줄을 더한다.
// 요율은 정수 「100만분의 n」으로 둔다(4.75% = 47_500) — 원 단위 계산을 정수로 하기 위해서다.

export interface Rate {
  from: string;
  until?: string;
  value: number;
  basis: string;
  checked: string;
}

const NPS_ACT = '국민연금법 부칙 <제20903호, 2025. 4. 2.> 제4조제1항';

const TABLE = {
  /** 최저임금 시간급(원) */
  minWageHourly: [
    { from: '2026-01-01', until: '2026-12-31', value: 10_320, basis: '2026년 적용 최저임금 고시(고용노동부, 2025. 8. 5.)', checked: '2026-10-28' },
    { from: '2027-01-01', until: '2027-12-31', value: 10_700, basis: '2027년 적용 최저임금 고시(고용노동부, 2026. 8. 5.)', checked: '2026-10-28' },
  ],
  /** 국민연금 사업장가입자 기여금(근로자 몫) — 기준소득월액의 100만분의 n */
  npsEmployeePerMillion: [
    { from: '2026-01-01', until: '2026-12-31', value: 47_500, basis: `${NPS_ACT} 제1호(1만분의 475)`, checked: '2026-10-28' },
    { from: '2027-01-01', until: '2027-12-31', value: 50_000, basis: `${NPS_ACT} 제2호(1만분의 500)`, checked: '2026-10-28' },
    { from: '2028-01-01', until: '2028-12-31', value: 52_500, basis: `${NPS_ACT} 제3호(1만분의 525)`, checked: '2026-10-28' },
    { from: '2029-01-01', until: '2029-12-31', value: 55_000, basis: `${NPS_ACT} 제4호(1만분의 550)`, checked: '2026-10-28' },
    { from: '2030-01-01', until: '2030-12-31', value: 57_500, basis: `${NPS_ACT} 제5호(1만분의 575)`, checked: '2026-10-28' },
    { from: '2031-01-01', until: '2031-12-31', value: 60_000, basis: `${NPS_ACT} 제6호(1만분의 600)`, checked: '2026-10-28' },
    { from: '2032-01-01', until: '2032-12-31', value: 62_500, basis: `${NPS_ACT} 제7호(1만분의 625)`, checked: '2026-10-28' },
    { from: '2033-01-01', value: 65_000, basis: '국민연금법 제88조제3항(1천분의 65)', checked: '2026-10-28' },
  ],
  /** 국민연금 기준소득월액 하한(원) */
  npsIncomeFloor: [
    { from: '2026-07-01', until: '2027-06-30', value: 410_000, basis: '국민연금 기준소득월액 하한액과 상한액(보건복지부 고시 제2026-31호)', checked: '2026-10-28' },
  ],
  /** 국민연금 기준소득월액 상한(원) */
  npsIncomeCap: [
    { from: '2026-07-01', until: '2027-06-30', value: 6_590_000, basis: '국민연금 기준소득월액 하한액과 상한액(보건복지부 고시 제2026-31호)', checked: '2026-10-28' },
  ],
  /** 건강보험료 근로자 몫 — 보수월액의 100만분의 n(보험료율 1만분의 719의 절반) */
  healthEmployeePerMillion: [
    { from: '2026-01-01', value: 35_950, basis: '국민건강보험법 시행령 제44조제1항(1만분의 719)·법 제76조제1항(절반 부담). 2027년 동결(건정심 2026. 9. 8.)', checked: '2026-10-28' },
  ],
  /** 장기요양보험료 근로자 몫 — 보수월액의 100만분의 n(보험료율 100만분의 9,448의 절반) */
  ltcEmployeePerMillion: [
    { from: '2026-01-01', value: 4_724, basis: '노인장기요양보험법 시행령 제4조(100만분의 9,448)', checked: '2026-10-28' },
  ],
  /** 고용보험(실업급여) 근로자 몫 — 보수의 100만분의 n(1천분의 18의 절반) */
  employmentEmployeePerMillion: [
    { from: '2026-01-01', value: 9_000, basis: '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령 제12조제1항제2호(1천분의 18)', checked: '2026-10-28' },
  ],
} satisfies Record<string, Rate[]>;

export type RateKey = keyof typeof TABLE;
export const RATES: Record<RateKey, Rate[]> = TABLE;


/** date(YYYY-MM-DD)에 적용되는 줄. 없으면 null */
export function rateOn(key: RateKey, date: string): Rate | null {
  return RATES[key].find((r) => r.from <= date && (r.until === undefined || date <= r.until)) ?? null;
}
