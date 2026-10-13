// Pure extraction parsing and sanitization; no environment, I/O or provider calls.
import type { Contract, WageItemCode } from './types';

/** rules/clauses.ts가 인식하는 폐쇄 태그 사전 — 이외 값은 버린다. */
export const RISK_TAGS = ['금품청산', '조건부지급', '즉시해고', '자동만료', '부제소', '위약예정'] as const;

const WAGE_ITEM_CODES: WageItemCode[] = [
  'BASE',
  'OT_WEEKDAY',
  'OT_WEEKEND',
  'ANNUAL_LEAVE',
  'HOLIDAY_EXTRA',
  'NIGHT',
  'MEAL',
  'BONUS',
  'OTHER',
];

/** 추출 결과 — 폼(FormState)이 채울 수 있는 필드만. workplace/employee는 의도적으로 제외. */
export type ExtractedContract = Pick<
  Contract,
  'period' | 'job' | 'work_time' | 'wage' | 'holidays_leave' | 'risk_clauses'
>;

// ── 파싱·정제 ────────────────────────────────────────────────────────

/** 코드펜스·앞뒤 설명이 붙어 와도 JSON 본문만 뽑는다(api/sanction과 동일 전략). */
export function extractJsonPayload(text: string): string {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1).trim();

  return trimmed;
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,\s원]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function arr(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

/**
 * 모델 출력 → 화이트리스트 필드만 남긴 계약 객체.
 * null은 "판독 불가/미확인"을 뜻한다(미기재와 구분하지 않는다) — UI는 비우고 사용자가 확인한다.
 */
export function sanitizeExtracted(raw: unknown): { contract: ExtractedContract; notes: string[] } | null {
  const root = obj(raw);
  if (!root) return null;

  const p = obj(root.period) ?? {};
  const rawProb = obj(p.probation);
  // 수습 미적용/미확인일 때 감액률이 섞이면 MINWAGE-PROBATION 오탐 → applied===true일 때만 유지.
  let probation: ExtractedContract['period']['probation'] = null;
  if (rawProb) {
    const applied = boolOrNull(rawProb.applied);
    if (applied === true) {
      probation = {
        applied: true,
        months: numOrNull(rawProb.months),
        wage_rate_pct: numOrNull(rawProb.wage_rate_pct),
      };
    } else if (applied === false) {
      probation = { applied: false };
    }
  }

  const wt = obj(root.work_time) ?? {};
  const variants = arr(wt.variants, 4)
    .map((v) => obj(v))
    .filter((v): v is Obj => !!v)
    .map((v) => ({ per_week: numOrNull(v.per_week) ?? 0, start: str(v.start, 10) ?? '', end: str(v.end, 10) ?? '' }))
    .filter((v) => v.per_week > 0 && v.start && v.end);

  const breaks = arr(wt.breaks, 4)
    .map((v) => obj(v))
    .filter((v): v is Obj => !!v)
    .map((v) => ({ minutes: numOrNull(v.minutes) ?? 0 }))
    .filter((v) => v.minutes > 0);

  const daily = arr(wt.daily_schedules, 7)
    .map((v) => obj(v))
    .filter((v): v is Obj => !!v)
    .map((v) => ({ day: str(v.day, 4) ?? '', start: str(v.start, 10) ?? '', end: str(v.end, 10) ?? '' }))
    .filter((v) => v.day && v.start && v.end);

  const w = obj(root.wage) ?? {};
  const items = arr(w.items, 12)
    .map((v) => obj(v))
    .filter((v): v is Obj => !!v)
    .map((v) => ({
      code: (WAGE_ITEM_CODES as string[]).includes(String(v.code))
        ? (String(v.code) as WageItemCode)
        : ('OTHER' as WageItemCode),
      label: str(v.label, 40) ?? undefined,
      amount: numOrNull(v.amount) ?? 0,
      basis_hours: numOrNull(v.basis_hours),
      basis_text: str(v.basis_text, 120),
    }))
    .filter((v) => v.amount > 0);

  const hl = obj(root.holidays_leave) ?? {};
  const job = obj(root.job) ?? {};

  const riskClauses = arr(root.risk_clauses, 12)
    .map((v) => obj(v))
    .filter((v): v is Obj => !!v)
    .map((v) => ({
      clause_ref: str(v.clause_ref, 40) ?? '사진 판독',
      text: str(v.text, 300) ?? '',
      tags: arr(v.tags, 6)
        .map((t) => String(t))
        .filter((t): t is (typeof RISK_TAGS)[number] => (RISK_TAGS as readonly string[]).includes(t)),
    }))
    .filter((v) => v.tags.length > 0);

  const notes = arr(root.notes, 10)
    .map((n) => str(n, 200))
    .filter((n): n is string => !!n);

  return {
    contract: {
      period: {
        start_date: str(p.start_date, 20),
        end_date: str(p.end_date, 20),
        indefinite: boolOrNull(p.indefinite),
        probation,
      },
      job: { location: str(job.location, 120), duty: str(job.duty, 120) },
      work_time: {
        days_per_week: numOrNull(wt.days_per_week),
        start: str(wt.start, 10),
        end: str(wt.end, 10),
        variants: variants.length > 0 ? variants : null,
        breaks: breaks.length > 0 ? breaks : null,
        daily_schedules: daily.length > 0 ? daily : null,
        night_work: boolOrNull(wt.night_work),
      },
      wage: {
        monthly_total: numOrNull(w.monthly_total),
        items,
        payday: str(w.payday, 60),
        payment_method: str(w.payment_method, 60),
      },
      holidays_leave: {
        weekly_rest: str(hl.weekly_rest, 60),
        weekly_rest_day_specified: boolOrNull(hl.weekly_rest_day_specified),
        annual_leave_clause: str(hl.annual_leave_clause, 200),
      },
      risk_clauses: riskClauses,
    },
    notes,
  };
}

