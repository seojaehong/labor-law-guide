// Phase 3.1: 노무 계산기 — Python 급여자동화 src/ 모듈을 TS로 포팅
// Source: /home/ubuntu/onedrive/_10_고객/_active/급여자동화/src/{severance,minimum_wage,payroll_calc}.py
// 산식 정확성: 실제 매장 급여 처리에 사용 중인 검증된 코드와 동일

// ────────────── 1. 최저임금 ──────────────
const MINIMUM_WAGE_HOURLY: Record<number, number> = {
  2024: 9_860,
  2025: 10_030,
  2026: 10_320,
};
const DEFAULT_MONTHLY_HOURS = 209; // 주40h + 주휴8h = 월 209h

export function getMinWage(year: number): number {
  if (MINIMUM_WAGE_HOURLY[year]) return MINIMUM_WAGE_HOURLY[year];
  const latest = Math.max(...Object.keys(MINIMUM_WAGE_HOURLY).map(Number));
  return MINIMUM_WAGE_HOURLY[latest];
}

export function checkMinWage(input: {
  base_pay: number;
  fixed_allowances?: number;
  year?: number;
  monthly_hours?: number;
}) {
  const year = input.year || 2026;
  const monthly_hours = input.monthly_hours || DEFAULT_MONTHLY_HOURS;
  const min_hourly = getMinWage(year);
  const min_monthly = min_hourly * monthly_hours;
  const actual = input.base_pay + (input.fixed_allowances || 0);
  const shortfall = Math.max(min_monthly - actual, 0);
  const actual_hourly = monthly_hours > 0 ? Math.floor(actual / monthly_hours) : 0;
  return {
    ok: actual >= min_monthly,
    actual,
    min_monthly,
    min_hourly,
    actual_hourly,
    shortfall,
    message:
      actual >= min_monthly
        ? `최저임금 충족 (시급 ${actual_hourly.toLocaleString('ko-KR')}원 ≥ ${min_hourly.toLocaleString('ko-KR')}원)`
        : `최저임금 미달 ${shortfall.toLocaleString('ko-KR')}원 부족 (시급 ${actual_hourly.toLocaleString('ko-KR')}원 < ${min_hourly.toLocaleString('ko-KR')}원)`,
    legal_basis: `최저임금법 제5조, 제6조 / 2026년 시급 ${min_hourly.toLocaleString('ko-KR')}원 (월 ${monthly_hours}h 환산 ${min_monthly.toLocaleString('ko-KR')}원)`,
  };
}

// ────────────── 2. 통상임금 ──────────────
export function calcOrdinaryWage(input: {
  monthly_fixed_pay: number; // 매월 정기·일률 지급 임금 (기본급 + 고정수당)
  monthly_hours?: number; // 월 통상근로시간 (기본 209)
}) {
  const monthly_hours = input.monthly_hours || DEFAULT_MONTHLY_HOURS;
  const ordinary_monthly = input.monthly_fixed_pay;
  const ordinary_hourly = monthly_hours > 0 ? Math.floor(ordinary_monthly / monthly_hours) : 0;
  const ordinary_daily = ordinary_hourly * 8;
  return {
    ordinary_monthly,
    ordinary_hourly,
    ordinary_daily,
    legal_basis:
      '근로기준법 시행령 제6조 / 통상임금 = 정기·일률·고정 임금 / 월 소정근로시간(209h, 주40h+주휴) / ' +
      '2024.12.19 대법원 전원합의체 판결(2020다247190)로 "고정성" 요건 폐기, 정기성·일률성만 충족하면 인정.',
  };
}

// ────────────── 3. 연장·야간·휴일수당 ──────────────
export function calcOvertime(input: {
  ordinary_hourly: number;
  overtime_hours?: number; // 연장근로 시간
  night_hours?: number; // 야간근로 시간 (22:00~06:00)
  holiday_hours_within_8?: number; // 휴일 8시간 이내
  holiday_hours_over_8?: number; // 휴일 8시간 초과
}) {
  const h = input.ordinary_hourly;
  const overtime_pay = Math.floor(h * 1.5 * (input.overtime_hours || 0));
  const night_pay = Math.floor(h * 0.5 * (input.night_hours || 0)); // 가산 0.5
  const holiday_pay_normal = Math.floor(h * 1.5 * (input.holiday_hours_within_8 || 0));
  const holiday_pay_extra = Math.floor(h * 2.0 * (input.holiday_hours_over_8 || 0));
  const total = overtime_pay + night_pay + holiday_pay_normal + holiday_pay_extra;
  return {
    overtime_pay,
    night_pay,
    holiday_pay_within_8: holiday_pay_normal,
    holiday_pay_over_8: holiday_pay_extra,
    total,
    legal_basis:
      '근로기준법 제56조 / 연장: 통상임금×1.5 / 야간(22~06시): 가산 0.5 (총 1.5) / ' +
      '휴일 8h 이내: 1.5 / 휴일 8h 초과: 2.0',
  };
}

// ────────────── 4. 퇴직금 ──────────────
function _subtractMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - months);
  return r;
}

function _diffDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}

// 윤년 고려 정밀 재직 fraction — HTML calcPreciseServiceFraction 동치
function _preciseServiceFraction(start: Date, end: Date) {
  let fullYears = 0;
  const cur = new Date(start);
  while (true) {
    const next = new Date(cur);
    next.setFullYear(next.getFullYear() + 1);
    if (next <= end) {
      fullYears++;
      cur.setTime(next.getTime());
    } else break;
  }
  const remainDays = Math.round((end.getTime() - cur.getTime()) / 86400000);
  const nextAnniv = new Date(cur);
  nextAnniv.setFullYear(nextAnniv.getFullYear() + 1);
  const daysInYear = Math.round((nextAnniv.getTime() - cur.getTime()) / 86400000);
  return { fullYears, remainDays, daysInYear, fraction: fullYears + remainDays / daysInYear };
}

// 1년 미만 올림 근속연수 — HTML calcServiceYears 동치 (퇴직소득세용)
function _ceilServiceYears(start: Date, end: Date): number {
  let years = 0;
  const t = new Date(start);
  while (true) {
    t.setFullYear(t.getFullYear() + 1);
    if (t <= end) years++;
    else break;
  }
  const exact = new Date(start);
  exact.setFullYear(exact.getFullYear() + years);
  if (exact.getTime() < end.getTime()) years++;
  return Math.max(years, 1);
}

// ────────────── 4-tax. 퇴직소득세 (소득세법 시행령 제203조의5/6 + 제55조) ──────────────
const _TAX_RATES = [
  { limit: 14_000_000, rate: 0.06, cumulative: 0 },
  { limit: 50_000_000, rate: 0.15, cumulative: 840_000 },
  { limit: 88_000_000, rate: 0.24, cumulative: 6_240_000 },
  { limit: 150_000_000, rate: 0.35, cumulative: 15_360_000 },
  { limit: 300_000_000, rate: 0.38, cumulative: 37_060_000 },
  { limit: 500_000_000, rate: 0.40, cumulative: 94_060_000 },
  { limit: 1_000_000_000, rate: 0.42, cumulative: 174_060_000 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.45, cumulative: 384_060_000 },
];

function _serviceYearDeduction(years: number): number {
  if (years <= 5) return 1_000_000 * years;
  if (years <= 10) return 5_000_000 + 2_000_000 * (years - 5);
  if (years <= 20) return 15_000_000 + 2_500_000 * (years - 10);
  return 40_000_000 + 3_000_000 * (years - 20);
}

function _convertedWageDeduction(cw: number): number {
  if (cw <= 0) return 0;
  if (cw <= 8_000_000) return cw;
  if (cw <= 70_000_000) return 8_000_000 + (cw - 8_000_000) * 0.6;
  if (cw <= 100_000_000) return 45_200_000 + (cw - 70_000_000) * 0.55;
  if (cw <= 300_000_000) return 61_700_000 + (cw - 100_000_000) * 0.45;
  return 151_700_000 + (cw - 300_000_000) * 0.35;
}

function _incomeTaxByRate(taxBase: number): number {
  if (taxBase <= 0) return 0;
  for (let i = 0; i < _TAX_RATES.length; i++) {
    if (taxBase <= _TAX_RATES[i].limit) {
      const prev = i === 0 ? 0 : _TAX_RATES[i - 1].limit;
      return _TAX_RATES[i].cumulative + (taxBase - prev) * _TAX_RATES[i].rate;
    }
  }
  return 0;
}

export function calcRetirementTax(severance_pay: number, service_years: number) {
  const svc_deduction = _serviceYearDeduction(service_years);
  const after_deduction = Math.max(severance_pay - svc_deduction, 0);
  const converted_wage = service_years > 0 ? Math.floor((after_deduction * 12) / service_years) : 0;
  const cw_deduction = Math.floor(_convertedWageDeduction(converted_wage));
  const tax_base = Math.max(converted_wage - cw_deduction, 0);
  const converted_tax = Math.floor(_incomeTaxByRate(tax_base));
  const income_tax = Math.floor(Math.floor((converted_tax * service_years) / 12) / 10) * 10;
  const local_tax = Math.floor(Math.floor(income_tax * 0.1) / 10) * 10;
  return {
    severance_pay,
    service_years,
    svc_deduction,
    after_deduction,
    converted_wage,
    cw_deduction,
    tax_base,
    converted_tax,
    income_tax,
    local_tax,
    total_tax: income_tax + local_tax,
    legal_basis:
      '소득세법 시행령 제203조의5(근속연수공제) · 제203조의6(환산급여공제) · 소득세법 제55조(기본세율) / ' +
      '환산급여 = (퇴직급여 - 근속연수공제) × 12 / 근속연수 / 산출세액 × 근속연수/12 = 소득세 / 지방소득세 = 소득세 × 10%',
  };
}

export function calcSeverance(input: {
  hire_date: string; // YYYY-MM-DD
  last_work_date: string;
  wages_3months: [number, number, number]; // 전3, 전2, 전1
  annual_bonus?: number;
  unused_annual_leave_days?: number;
  annual_leave_daily_wage?: number;
  ordinary_daily_wage?: number;
  include_tax?: boolean; // true 시 퇴직소득세 함께 계산
}) {
  const hire = new Date(input.hire_date);
  const last_work = new Date(input.last_work_date);
  const retirement = new Date(last_work.getTime() + 86400000); // last_work + 1
  const service_days = _diffDays(retirement, hire);
  const three_months_start = _subtractMonths(retirement, 3);
  const total_days_3m = _diffDays(retirement, three_months_start);

  const wage_total = input.wages_3months.reduce((a, b) => a + b, 0);
  const bonus_addition = Math.floor(((input.annual_bonus || 0) * 3) / 12);
  const annual_leave_addition = Math.floor(
    ((input.annual_leave_daily_wage || 0) * (input.unused_annual_leave_days || 0) * 3) / 12
  );

  const avg_wage_base = wage_total + bonus_addition + annual_leave_addition;
  const daily_avg_wage = total_days_3m > 0 ? avg_wage_base / total_days_3m : 0;

  let applied_daily_wage = daily_avg_wage;
  let wage_type = '평균임금';
  if ((input.ordinary_daily_wage || 0) > daily_avg_wage) {
    applied_daily_wage = input.ordinary_daily_wage as number;
    wage_type = '통상임금';
  }

  // 정밀 재직 fraction (윤년 고려) — last_work 기준
  const svc = _preciseServiceFraction(hire, last_work);
  const severance_raw = applied_daily_wage * 30 * svc.fraction;
  const severance_pay = Math.floor(severance_raw);

  const result: {
    hire_date: string;
    last_work_date: string;
    retirement_date: string;
    service_days: number;
    service_full_years: number;
    service_remain_days: number;
    service_fraction: number;
    three_months_start: string;
    total_days_3m: number;
    wage_total: number;
    bonus_addition: number;
    annual_leave_addition: number;
    avg_wage_base: number;
    daily_avg_wage: number;
    applied_daily_wage: number;
    wage_type: string;
    severance_pay: number;
    legal_basis: string;
    tax?: ReturnType<typeof calcRetirementTax>;
    net_severance?: number;
  } = {
    hire_date: input.hire_date,
    last_work_date: input.last_work_date,
    retirement_date: retirement.toISOString().slice(0, 10),
    service_days,
    service_full_years: svc.fullYears,
    service_remain_days: svc.remainDays,
    service_fraction: Number(svc.fraction.toFixed(6)),
    three_months_start: three_months_start.toISOString().slice(0, 10),
    total_days_3m,
    wage_total,
    bonus_addition,
    annual_leave_addition,
    avg_wage_base,
    daily_avg_wage: Math.round(daily_avg_wage),
    applied_daily_wage: Math.round(applied_daily_wage),
    wage_type,
    severance_pay,
    legal_basis:
      '근로자퇴직급여 보장법 제8조 + 시행령 제3조 / ' +
      '퇴직금 = 1일평균임금 × 30 × 재직 fraction (윤년 고려: fullYears + remainDays/daysInYear) / ' +
      '평균임금 = 퇴직 직전 3개월 임금총액 / 총일수 (상여금·연차수당 가산) / 통상임금이 더 높으면 통상임금 사용',
  };

  if (input.include_tax) {
    const service_years = _ceilServiceYears(hire, last_work);
    const tax = calcRetirementTax(severance_pay, service_years);
    result.tax = tax;
    result.net_severance = severance_pay - tax.total_tax;
  }
  return result;
}

// ────────────── 5. 법조항 lookup ──────────────
import { supabaseAdmin } from './supabase-server';
import { supabase } from './supabase';
const db = supabaseAdmin || supabase;

export async function lookupLawArticle(input: { law: string; article: number }) {
  const { data, error } = await db
    .from('law_articles')
    .select('law_name, article_number, raw_title')
    .eq('law_name', input.law)
    .eq('article_number', input.article)
    .maybeSingle();
  if (error || !data) {
    return {
      exists: false,
      law: input.law,
      article: input.article,
      message: `${input.law} 제${input.article}조는 캐시에 없습니다. 법제처(law.go.kr) 직접 확인 권장.`,
    };
  }
  return {
    exists: true,
    law: data.law_name,
    article: data.article_number,
    title: data.raw_title,
    message: `${data.law_name} 제${data.article_number}조 (${data.raw_title || '제목 미수집'}) — 캐시 확인됨`,
  };
}

// ────────────── 6. 유사 판례 검색 ──────────────
export async function searchSimilarCases(input: { query_text: string; embedding: number[]; max_count?: number }) {
  const max_count = input.max_count || 3;
  const { data, error } = await db.rpc('search_similar_cases_hybrid', {
    query: input.query_text.slice(0, 500),
    query_embedding: input.embedding,
    category: '',
    limit: max_count,
    semantic_weight: 0.6,
  });
  if (error || !Array.isArray(data)) return { count: 0, cases: [] };
  return {
    count: data.length,
    cases: data.map((c: { id: string; title: string; decision_date?: string; decision_result?: string; holding_summary?: string }) => ({
      id: c.id,
      title: c.title,
      date: c.decision_date,
      result: c.decision_result,
      summary: (c.holding_summary || '').slice(0, 240),
    })),
  };
}
