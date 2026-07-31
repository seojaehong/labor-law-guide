// 사진 추출 결과(API /api/tools/contract-check/extract 응답) → 폼 상태 역매핑 (US-306).
//
// buildContract()의 역방향이지만 대칭이 아니다:
//  - 금액 필드는 top-level이 아니라 wage.items[].code 로 들어온다(BASE/OT_WEEKDAY/HOLIDAY_EXTRA/ANNUAL_LEAVE).
//    폼에 칸이 없는 코드(OT_WEEKEND·NIGHT·MEAL·BONUS·OTHER)는 버리고 warnings로 알린다.
//  - breaks[]는 합계 분으로 접는다(폼은 하루 합계 한 칸).
//  - 날짜/시각은 <input type="date|time">이 요구하는 YYYY-MM-DD·HH:MM 로 정규화한다.
//    정규화에 실패한 값은 "채워지지 않음"으로 처리한다 — 조용히 빈 칸이 되는 것을 막는다.
//  - 지급방법은 폐쇄 선택지(계좌이체·현금)라 자유문구를 키워드로 맞춘다. 못 맞추면 비우고 안내한다.
// null = 판독 불가/미확인 → 비워 두고 하이라이트(filled에 넣지 않는다).

import { CLAUSE_ITEMS, INITIAL, type FormState } from './formState';

export interface ExtractResult {
  form: FormState;
  /** 사진에서 실제로 채워진 FormState 키 — 나머지는 "미인식"으로 하이라이트한다. */
  filled: Set<string>;
  /** 모델이 남긴 판독 메모 */
  notes: string[];
  /** 폼으로 옮기지 못한 값에 대한 안내(한국어) */
  warnings: string[];
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function numText(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,\s원]/g, ''));
    if (Number.isFinite(n)) return String(n);
  }
  return '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-01-01" | "2026.1.1" | "2026년 1월 1일" → "2026-01-01". 실패하면 ''. */
export function normalizeDate(v: unknown): string {
  const s = text(v);
  const m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${y}-${pad(month)}-${pad(day)}`;
}

/** "09:00" | "9:00" | "오전 9시" | "오후 6시 30분" | "18시" → "09:00". 실패하면 ''. */
export function normalizeTime(v: unknown): string {
  const s = text(v);
  if (!s) return '';
  const m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return '';
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  if (/오후|PM|pm/.test(s) && hour < 12) hour += 12;
  if (/오전|AM|am/.test(s) && hour === 12) hour = 0;
  if (hour > 24 || minute > 59) return '';
  if (hour === 24) hour = 0;
  return `${pad(hour)}:${pad(minute)}`;
}

/** 자유문구 지급방법 → 폼 선택지. 못 맞추면 ''. */
export function normalizePaymentMethod(v: unknown): string {
  const s = text(v);
  if (!s) return '';
  if (/계좌|이체|통장|입금|송금|은행/.test(s)) return '계좌이체';
  if (/현금/.test(s)) return '현금';
  return '';
}

type WageFieldKey = 'baseWage' | 'otAmount' | 'holidayExtra' | 'annualLeavePay';

/** 폼에 대응 칸이 있는 임금 항목 코드 → FormState 키 */
const WAGE_FIELD: Record<string, WageFieldKey> = {
  BASE: 'baseWage',
  OT_WEEKDAY: 'otAmount',
  HOLIDAY_EXTRA: 'holidayExtra',
  ANNUAL_LEAVE: 'annualLeavePay',
};

const CLAUSE_TAGS = new Set(CLAUSE_ITEMS.map((c) => c.tag));

/** 추출 응답(JSON) → 폼 상태. 응답이 이상해도 던지지 않고 빈 결과를 돌려준다. */
export function applyExtracted(payload: unknown): ExtractResult {
  const form: FormState = { ...INITIAL, clauses: {}, variants: [...INITIAL.variants], daily: [...INITIAL.daily] };
  const filled = new Set<string>();
  const warnings: string[] = [];

  const root = obj(payload) ?? {};
  const notes = arr(root.notes)
    .map((n) => text(n))
    .filter(Boolean);
  const c = obj(root.contract);
  if (!c) return { form, filled, notes, warnings };

  const mark = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    form[key] = value;
    filled.add(key as string);
  };

  // ── ① 기본 ──
  const period = obj(c.period) ?? {};
  const startDate = normalizeDate(period.start_date);
  const endDate = normalizeDate(period.end_date);
  if (period.indefinite === true) mark('periodType', 'indefinite');
  else if (period.indefinite === false || endDate) mark('periodType', 'fixed');
  if (startDate) mark('startDate', startDate);
  // 종료일은 기간제일 때만 폼에 노출된다.
  if (endDate && form.periodType === 'fixed') mark('endDate', endDate);

  const prob = obj(period.probation);
  if (prob?.applied === true) {
    mark('probation', 'yes');
    const months = numText(prob.months);
    const rate = numText(prob.wage_rate_pct);
    if (months) mark('probationMonths', months);
    if (rate) mark('probationRate', rate);
  } else if (prob?.applied === false) {
    // 수습 없음 — months/wage_rate_pct는 절대 채우지 않는다(MINWAGE-PROBATION 오탐).
    mark('probation', 'no');
  }

  // ── ② 근로시간 ──
  const wt = obj(c.work_time) ?? {};
  const daysPerWeek = numText(wt.days_per_week);
  if (daysPerWeek) mark('daysPerWeek', daysPerWeek);
  const workStart = normalizeTime(wt.start);
  const workEnd = normalizeTime(wt.end);
  if (workStart) mark('workStart', workStart);
  if (workEnd) mark('workEnd', workEnd);
  if (wt.night_work === true) mark('nightWork', 'yes');
  else if (wt.night_work === false) mark('nightWork', 'no');

  // breaks[]는 하루 합계 한 칸으로 접는다.
  const breakTotal = arr(wt.breaks)
    .map((b) => obj(b))
    .reduce((sum, b) => sum + (b ? Number(numText(b.minutes) || 0) : 0), 0);
  if (breakTotal > 0) mark('breakMinutes', String(breakTotal));

  const variants = arr(wt.variants)
    .map((v) => obj(v))
    .filter((v): v is Obj => !!v)
    .map((v) => ({
      perWeek: numText(v.per_week),
      start: normalizeTime(v.start),
      end: normalizeTime(v.end),
    }))
    .filter((v) => v.perWeek && v.start && v.end);
  if (variants.length > 0) {
    mark('hasVariants', true);
    mark('variants', variants);
  }

  const daily = arr(wt.daily_schedules)
    .map((d) => obj(d))
    .filter((d): d is Obj => !!d)
    .map((d) => ({ day: text(d.day), start: normalizeTime(d.start), end: normalizeTime(d.end) }))
    .filter((d) => d.day && d.start && d.end);
  if (daily.length > 0) {
    mark('hasDaily', true);
    mark('daily', daily);
  }

  // ── ③ 임금 구성·지급 ──
  const wage = obj(c.wage) ?? {};
  const monthlyTotal = numText(wage.monthly_total);
  if (monthlyTotal) mark('monthlyTotal', monthlyTotal);

  const dropped: string[] = [];
  let basisSeen = false;
  for (const raw of arr(wage.items)) {
    const item = obj(raw);
    if (!item) continue;
    const amount = numText(item.amount);
    if (!amount || Number(amount) <= 0) continue;
    if (text(item.basis_text)) basisSeen = true;
    const key = WAGE_FIELD[text(item.code)];
    if (!key) {
      dropped.push(text(item.label) || text(item.code) || '기타 수당');
      continue;
    }
    mark(key, amount);
    if (key === 'otAmount') {
      const hours = numText(item.basis_hours);
      if (hours) mark('otHours', hours);
    }
  }
  if (dropped.length > 0) {
    warnings.push(
      `사진에서 읽은 ${dropped.join('·')} 항목은 이 폼에 입력칸이 없어 반영하지 못했습니다. 월급여 총액에 포함되어 있는지 확인해 주세요.`,
    );
  }
  if (basisSeen) mark('basisWritten', true);

  const payday = text(wage.payday);
  if (payday) mark('payday', payday);
  const rawMethod = text(wage.payment_method);
  const method = normalizePaymentMethod(rawMethod);
  if (method) mark('paymentMethod', method);
  else if (rawMethod) {
    warnings.push(`지급방법을 "${rawMethod}"로 읽었지만 선택지에 맞지 않습니다. 직접 골라 주세요.`);
  }

  const hl = obj(c.holidays_leave) ?? {};
  if (hl.weekly_rest_day_specified === true) mark('weeklyRest', 'specified');
  else if (text(hl.weekly_rest)) mark('weeklyRest', 'unspecified');
  if (text(hl.annual_leave_clause)) mark('annualLeaveClause', true);

  const job = obj(c.job) ?? {};
  // 폼은 취업장소·담당업무를 체크박스 하나로 묶지만 REQUIRED-TERMS는 둘을 따로 본다.
  // 한쪽만 읽혔는데 체크하면 나머지 하나의 위반이 "적정"으로 덮인다 → 둘 다 읽혔을 때만 체크.
  if (text(job.location) && text(job.duty)) mark('jobWritten', true);

  // ── ④ 문제조항 ──
  const clauses: Record<string, boolean> = {};
  for (const raw of arr(c.risk_clauses)) {
    const rc = obj(raw);
    if (!rc) continue;
    for (const tag of arr(rc.tags).map((t) => text(t))) {
      if (CLAUSE_TAGS.has(tag)) clauses[tag] = true;
    }
  }
  if (Object.keys(clauses).length > 0) mark('clauses', clauses);

  return { form, filled, notes, warnings };
}
