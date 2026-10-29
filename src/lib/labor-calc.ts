// Phase 3.1: 노무 계산기 — Python 급여자동화 src/ 모듈을 TS로 포팅
// Source: /home/ubuntu/onedrive/_10_고객/_active/급여자동화/src/{severance,minimum_wage,payroll_calc}.py
// 산식 정확성: 실제 매장 급여 처리에 사용 중인 검증된 코드와 동일

import { calcSeverance as severanceEngine } from './calc/severance';
import { calcRetirementTax as retirementTaxEngine } from './calc/retirement-tax';
import { checkMinWage as minWageEngine } from './calc/min-wage';
import { rateOn } from '@/content/rates';
import { todayKst } from './tool-kit';
import { severanceLeavePay } from './chat/severance-link';

// ────────────── 1. 최저임금 ──────────────
// 정본 = src/lib/calc/min-wage.ts(시행령 §5① 환산) + src/content/rates.ts(고시 금액). /tools/min-wage 와 같은 답을 낸다.
// 고시가 없는 해는 다른 해 값으로 대신하지 않고 오류를 낸다.
const DEFAULT_MONTHLY_HOURS = 209; // 주40h + 주휴8h = 월 209h

export function checkMinWage(input: {
  base_pay: number;
  fixed_allowances?: number;
  year?: number;
  weekly_hours?: number;
}) {
  const year = input.year || Number(todayKst().slice(0, 4));
  const rate = rateOn('minWageHourly', `${year}-01-01`);
  if (!rate) throw new Error(`${year}년 최저임금 고시를 찾지 못했습니다. 고시된 해만 계산합니다.`);
  const weekly_hours = input.weekly_hours || 40;
  const r = minWageEngine({ unit: 'month', amount: input.base_pay + (input.fixed_allowances || 0), weeklyHours: weekly_hours, minHourly: rate.value });
  const won = (n: number) => n.toLocaleString('ko-KR');
  return {
    ok: r.meets,
    actual: r.counted,
    min_monthly: r.required,
    min_hourly: rate.value,
    monthly_hours: r.hours,
    actual_hourly: r.hourly,
    shortfall: r.shortfall,
    message: r.meets
      ? `${year}년 최저임금 이상 (시간당 ${won(r.hourly)}원 ≥ ${won(rate.value)}원)`
      : `${year}년 최저임금보다 한 달 ${won(r.shortfall)}원 적음 (시간당 ${won(r.hourly)}원 < ${won(rate.value)}원)`,
    legal_basis: `최저임금법 제5조·제6조, 시행령 제5조 제1항 / ${rate.basis} 시간급 ${won(rate.value)}원 (주 ${weekly_hours}시간 → 월 ${r.hours}시간 환산 ${won(r.required)}원)`,
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

// ────────────── 4-tax. 퇴직소득세 ──────────────
// 정본 엔진(src/lib/calc/retirement-tax.ts) — /tools/retirement-tax·/tools/severance.html 과 같은 값을 낸다. 여기서는 응답 키만 잇는다.
// 키는 예전 그대로(snake_case). svc_deduction 은 근속연수공제 표 값(소득세법 §48①1)이고,
// 퇴직급여가 그보다 적을 때의 상한(§48②)은 after_deduction(= 퇴직급여 − 적용 공제)에 들어간다 — 예전 출력과 같다.
// 엔진이 계산하지 않는 경우(2022. 12. 31. 이전 퇴사 등)는 엔진 오류를 그대로 던진다. calcSeverance 가 받아 이유만 남긴다.
const RETIREMENT_TAX_BASIS =
  '소득세법 제48조 제1항 제1호(근속연수공제)·제2호(환산급여공제) · 제48조 제2항(근속연수공제는 퇴직급여까지) · 제14조 제6항(과세표준) · ' +
  '제55조 제1항·제2항(기본세율, 환산산출세액 × 근속연수 ÷ 12) · 시행령 제105조 제1항(근속연수 — 마지막 근무일까지, 1년 미만은 1년) · ' +
  '국고금 관리법 제47조(10원 미만 버림) · 지방세법 제103조의13 제1항(지방소득세 = 소득세 × 10%) / ' +
  '환산급여 = (퇴직급여 − 근속연수공제) × 12 ÷ 근속연수 / 2023. 1. 1. 이후 퇴사만 계산(법률 제19196호 부칙 제13조·제14조)';

export function calcRetirementTax(severance_pay: number, hire_date: string, last_work_date: string) {
  const r = retirementTaxEngine({ pay: severance_pay, hireDate: hire_date, lastWorkDate: last_work_date });
  return {
    severance_pay,
    service_years: r.years,
    svc_deduction: r.serviceDeductionTable,
    after_deduction: severance_pay - r.serviceDeduction,
    converted_wage: r.converted,
    cw_deduction: r.convertedDeduction,
    tax_base: r.taxBase,
    converted_tax: r.convertedTax,
    income_tax: r.incomeTax,
    local_tax: r.localTax,
    total_tax: r.total,
    legal_basis: RETIREMENT_TAX_BASIS,
  };
}

export function calcSeverance(input: {
  hire_date: string; // YYYY-MM-DD
  last_work_date: string;
  wages_3months: [number, number, number]; // 전3, 전2, 전1
  annual_bonus?: number;
  /** 퇴직 전 1년 동안 받은 연차수당 총액(3/12 를 평균임금에 넣는다) */
  annual_leave_pay?: number;
  /** 예전 인자 — annual_leave_pay 가 없을 때만 1일 수당 × 일수로 본다 */
  unused_annual_leave_days?: number;
  annual_leave_daily_wage?: number;
  ordinary_daily_wage?: number;
  include_tax?: boolean; // true 시 퇴직소득세 함께 계산
}) {
  // 정본 엔진(src/lib/calc/severance.ts) — /tools/severance.html·/exit 와 같은 값을 낸다
  const r = severanceEngine({
    hireDate: input.hire_date,
    lastWorkDate: input.last_work_date,
    wageTotal: input.wages_3months.reduce((a, b) => a + b, 0),
    annualBonus: input.annual_bonus || 0,
    annualLeavePay: severanceLeavePay(input),
    dailyOrdinaryWage: input.ordinary_daily_wage || 0,
  });
  const severance_pay = r.amount;

  const result: {
    hire_date: string;
    last_work_date: string;
    retirement_date: string;
    service_days: number;
    eligible: boolean;
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
    retirement_date: r.retirementDate,
    service_days: r.serviceDays,
    eligible: r.eligible,
    three_months_start: r.segments[0].from,
    total_days_3m: r.periodDays,
    wage_total: input.wages_3months.reduce((a, b) => a + b, 0),
    bonus_addition: r.bonusAdd,
    annual_leave_addition: r.leaveAdd,
    avg_wage_base: r.baseTotal,
    daily_avg_wage: r.dailyAverage,
    applied_daily_wage: r.dailyApplied,
    wage_type: r.applied === 'ordinary' ? '통상임금' : '평균임금',
    severance_pay,
    legal_basis:
      '근로자퇴직급여 보장법 제8조 + 시행령 제3조 / ' +
      '퇴직금 = 1일평균임금 × 30 × 재직일수 ÷ 365 (고용노동부 퇴직금 계산기와 같은 끝수: 평균임금 소수 둘째 자리 올림, 퇴직금 원 단위 반올림) / ' +
      '평균임금 = 퇴직 직전 3개월 임금총액 / 총일수 (상여금·연차수당 가산) / 통상임금이 더 높으면 통상임금 사용' +
      (r.eligible ? '' : ' / ★ 계속근로 1년 미만 — 퇴직급여법 제4조 제1항에 따라 퇴직금 지급 대상이 아니다(금액은 참고값)'),
  };

  if (input.include_tax) {
    // 퇴직소득세 엔진은 마지막 근무일을 퇴사일로 받는다(국세청 프로그램 「퇴사일」). 계산기는 퇴직일에서 하루 빼서 같은 날을 넘긴다
    try {
      const tax = calcRetirementTax(severance_pay, input.hire_date, input.last_work_date);
      result.tax = tax;
      result.net_severance = severance_pay - tax.total_tax;
    } catch (e) {
      // 퇴직금은 그대로 내고 세액은 비운다 — 종전 표를 쓸 2022년 이전 퇴사를 현행 표로 계산하지 않는다(법률 제19196호 부칙 제13조·제14조)
      result.legal_basis += ` / ★ 퇴직소득세는 계산하지 않았다 — ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return result;
}

// ────────────── 5. 법조항 lookup ──────────────
import { supabaseAdmin } from './supabase-server';
import { supabase } from './supabase';
const db = supabaseAdmin || supabase;

// ★ 2026-10-06 — 1,200 에서 올렸다. 2026-09-03 에 QA 패킷이 **정확히 이 값**으로
// 자르다가 코퍼스 12% 가 영향받았다(노조법 시행령 별표1 50% 소실, 노조법 제81조
// 운영비 원조 고려요소 2개 소실, 공무원노조법 제17조 준용목록 통째 소실).
// 조문은 원칙을 앞에, 예외·준용·세부기준을 뒤에 쓴다 — 뒤를 자르면 단서가 사라진다.
// 이 함수는 조문 **하나**만 돌려주므로 넉넉히 둔다. 실측 3,000자 초과는 9건(0.15%).
const LAW_BODY_LIMIT = 4000;

// select 문자열이 길면 supabase-js 가 행 타입을 GenericStringError 로 추론한다.
// 명시적으로 적어 둔다.
type LawArticleRow = {
  law_name: string;
  article_number: number;
  sub_number: number | null;
  article_label: string;
  article_title: string | null;
  raw_title: string | null;
  body: string | null;
  effective_date: string | null;
  law_kind: string | null;
  is_deleted: boolean | null;
  is_heading: boolean | null;
  is_byeolpyo: boolean | null;
};

/**
 * 법조항 조회. 2026-10-05 로 본문까지 돌려준다.
 *
 * 종전에는 `.eq(article_number).maybeSingle()` 로 제목만 읽었다. 그 테이블에
 * 93종 7,887행(본문 982만자)을 적재하면서 **`maybeSingle()` 이 깨진다** —
 * `(법령, 조번호)` 가 유일하지 않기 때문이다.
 *   · 제105조 와 제105조의2 가 둘 다 `article_number = 105`
 *   · 별표 1 과 제1조 가 둘 다 1
 *   · 장·절 표제가 조문과 같은 번호를 쓴다
 * 실측 — 2행 이상인 조합이 1,584건(해당 4,456행)이다.
 *
 * 그래서 `article_label`(제105조 / 제105조의2 / 별표 1 / 서식 3)로 좁히고,
 * 본문 조문을 우선한다(표제·별표는 뒤로). `sub` 로 가지번호를 받는다 —
 * **직장 내 괴롭힘이 제76조의2·제76조의3** 이라 가지번호 없이는 핵심 조항을 못 찾는다.
 */
export async function lookupLawArticle(input: {
  law: string;
  article: number;
  sub?: number;
}) {
  const label = `제${input.article}조${input.sub ? `의${input.sub}` : ''}`;
  const { data, error } = await db
    .from('law_articles')
    .select(
      'law_name, article_number, sub_number, article_label, article_title, raw_title, body, ' +
        'effective_date, law_kind, is_deleted, is_heading, is_byeolpyo'
    )
    .eq('law_name', input.law)
    .eq('article_label', label)
    // 표제·별표보다 본문 조문을 먼저 — 표제는 제목이 비어 있어 뒤로 밀린다
    .order('is_heading', { ascending: true })
    .order('is_byeolpyo', { ascending: true })
    .order('ordinal', { ascending: true })
    .limit(1);

  const row = (data as LawArticleRow[] | null)?.[0];
  if (error || !row) {
    return {
      exists: false,
      law: input.law,
      article: input.article,
      sub: input.sub,
      message: `${input.law} ${label}는 캐시에 없습니다. 법제처(law.go.kr) 직접 확인 권장.`,
    };
  }

  // 삭제된 조문도 「없다」가 아니다 — 삭제됐다는 사실이 답이다
  if (row.is_deleted) {
    return {
      exists: true,
      deleted: true,
      law: row.law_name,
      article: row.article_number,
      sub: row.sub_number ?? undefined,
      title: null,
      body: row.body,
      effective_date: row.effective_date,
      message: `${row.law_name} ${label}는 삭제된 조문입니다 — ${row.body}. 다른 조문으로 옮겨졌는지 확인이 필요합니다.`,
    };
  }

  const title = row.article_title || row.raw_title || null;
  const body = (row.body || '').slice(0, LAW_BODY_LIMIT);
  const cut = (row.body || '').length > LAW_BODY_LIMIT;
  return {
    exists: true,
    law: row.law_name,
    article: row.article_number,
    sub: row.sub_number ?? undefined,
    title,
    body,
    truncated: cut,
    law_kind: row.law_kind,
    effective_date: row.effective_date,
    message:
      `${row.law_name} ${label}${title ? ` (${title})` : ''} — 시행 ${row.effective_date ?? '미확인'}, ` +
      `법제처 원문${cut ? ' (★ 뒷부분이 잘렸다. 조문은 예외·준용·세부기준을 뒤에 쓰므로 ' +
        '단서가 더 있을 수 있다. 전문은 law.go.kr)' : ''}\n${body}`,
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
