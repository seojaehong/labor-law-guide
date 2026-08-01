// 근로계약서 파일(사진·PDF·DOCX·XLSX·HWPX) → 스키마 규격 계약 JSON 추출 API.
// - 이미지·판독 결과는 저장하지 않는다. 로그에도 본문·파일명을 남기지 않는다(상태코드/에러 종류만).
// - env(ANTHROPIC_API_KEY)가 없으면 기능 전체가 501로 닫힌다.
// - 개인정보(성명·생년월일·주민번호·주소·연락처)는 프롬프트에서 요구하지도, 응답에 담지도 않는다.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isTurnstileEnabled, verifyTurnstile } from '@/lib/turnstile';
import { detectDocKind, extractDocText } from '@/lib/contract-check/extract-text';
import type { Contract, WageItemCode } from '@/lib/contract-check/types';

export const runtime = 'nodejs';
// 사진 여러 장 판독은 기본 실행시간(10~15s)을 넘긴다. 불변식: REQUEST_TIMEOUT_MS < maxDuration
// — 우리 abort가 먼저 터져야 플랫폼 타임아웃(비 JSON 응답) 대신 502 JSON이 나간다.
export const maxDuration = 60;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// 손글씨 계약서 판독 품질이 필요해 사이트 기본(haiku)보다 상위 모델 사용 — RALPH-README §v2 지정.
const ANTHROPIC_MODEL = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 45_000;

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ── 문서 파일 ────────────────────────────────────────────────────────
// PDF는 Claude가 네이티브로 읽지만 **페이지가 이미지처럼 과금된다**(장당 1,500~4,784 토큰).
// 20쪽 스캔본이면 한 번에 3만~9.5만 입력토큰 = 600~2,000원이라, 건당 40원을 가정한
// 전역 캡(300건/일)이 통째로 무의미해진다. 그래서 바이트가 아니라 **페이지 수**로 막는다.
// 근로계약서는 1~3쪽이다.
const MAX_PDF_PAGES = 8;
const MAX_DOC_BYTES = 4 * 1024 * 1024;
const IP_DAILY_LIMIT = parseInt(process.env.CONTRACT_CHECK_IP_DAILY_LIMIT || '5', 10);
// 비용 폭주 1차 방어선. 비전 판독 1건 ≈ 25~50원 → 300건이면 하루 최대 1.5만원 선에서 멈춘다.
const GLOBAL_DAILY_LIMIT = parseInt(process.env.CONTRACT_CHECK_GLOBAL_DAILY_LIMIT || '300', 10);

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

const SYSTEM_PROMPT = `당신은 대한민국 근로계약서를 판독하는 노무 전문가입니다.
제공된 자료(사진·PDF·문서에서 추출한 본문)에서 아래 체크리스트 항목만 읽어 JSON 하나로 반환합니다.

[판독 체크리스트]
1. 계약기간: 시작일·종료일(YYYY-MM-DD), 기간의 정함이 없으면 indefinite=true
2. 수습: 적용 여부, 기간(개월), 수습기간 임금 비율(%)
3. 취업장소·담당업무 기재 여부
4. 근로시간: 주 근무일수, 시업·종업 시각(HH:MM), 요일별로 다르면 variants, 휴게시간(분), 야간(22시~06시) 근로 여부
5. 근로일별 시간이 다른 단시간이면 daily_schedules(요일·시업·종업)
6. 임금: 월 총액, 구성항목별 금액(기본급·연장·휴일/추가·연차수당 등)과 산출근거 기재 여부, 임금지급일, 지급방법
7. 주휴일: 요일이 특정되어 있는지, 연차유급휴가 조항 유무
8. 문제조항: 아래 태그 사전에 해당하는 조항이 있으면 risk_clauses에 담는다(태그는 사전에 있는 값만 사용)
   - 금품청산: 퇴직 후 14일을 넘겨 금품을 지급한다는 약정
   - 조건부지급: 물품 반납·방문 등 조건을 붙여 임금을 지급한다는 조항
   - 즉시해고: 예고 없이 즉시 해고할 수 있다는 문구
   - 자동만료: 특정 사유 발생 시 계약이 자동 종료·만료된다는 조항
   - 부제소: 이의제기·소송을 하지 않기로 하는 특약
   - 위약예정: 위약금·손해배상액을 미리 정해두는 조항

[판독 원칙]
- 자료에서 확인되지 않거나 확신이 없는 값은 반드시 null. 추측·기본값으로 채우지 않는다.
- 수습이 없거나 확인되지 않으면 probation은 {"applied": false} 또는 null만 쓰고, months·wage_rate_pct는 절대 넣지 않는다.
- 취업장소/담당업무/주휴일/연차 조항은 "기재되어 있는가"를 본다. 조항이 보이면 그대로 요약한 짧은 문자열, 안 보이면 null.
- 성명·생년월일·주민등록번호·주소·연락처·사업자번호는 읽지도, 반환하지도 않는다.
- 금액은 숫자만(콤마·원 제거). 시각은 "09:00" 형식.
- 판독이 흐릿하거나 애매한 항목은 notes 배열에 한국어 한 줄로 남긴다.

[출력 형식] 설명·코드펜스 없이 JSON 객체 하나만 출력한다.
{
  "period": {"start_date": null, "end_date": null, "indefinite": null,
             "probation": {"applied": null, "months": null, "wage_rate_pct": null}},
  "job": {"location": null, "duty": null},
  "work_time": {"days_per_week": null, "start": null, "end": null,
                "variants": [{"per_week": 0, "start": "", "end": ""}],
                "breaks": [{"minutes": 0}],
                "daily_schedules": [{"day": "월", "start": "", "end": ""}],
                "night_work": null},
  "wage": {"monthly_total": null,
           "items": [{"code": "BASE", "label": "기본급", "amount": 0, "basis_hours": null, "basis_text": null}],
           "payday": null, "payment_method": null},
  "holidays_leave": {"weekly_rest": null, "weekly_rest_day_specified": null, "annual_leave_clause": null},
  "risk_clauses": [{"clause_ref": "제5조", "text": "조항 요약", "tags": ["즉시해고"]}],
  "notes": []
}`;

const USER_INSTRUCTION =
  '위 사진은 근로계약서입니다. 체크리스트에 따라 판독하고 지정된 JSON 객체 하나만 출력하세요.';

// 텍스트 경로(DOCX·XLSX·HWPX)는 '사진'이라고 하면 모델이 이미지를 찾는다.
const DOC_INSTRUCTION =
  '위 본문은 근로계약서입니다. 체크리스트에 따라 판독하고 지정된 JSON 객체 하나만 출력하세요. 표가 탭·개행으로 펼쳐져 있을 수 있으니 항목과 값의 짝을 신중히 맞추세요.';

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

// ── 레이트리밋 ───────────────────────────────────────────────────────

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'yh-bok-default-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * 이 사이트는 Cloudflare → Vercel 2단이다. Vercel이 보는 `x-forwarded-for`의 첫 항목은
 * **Cloudflare 엣지 IP**이고 PoP·커넥션마다 달라질 수 있다 → 그걸 키로 쓰면 카운터가
 * 매번 새 행에 쌓여 리밋이 영원히 안 걸린다(실제로 그렇게 됐다).
 * 진짜 클라이언트 IP는 `cf-connecting-ip`에 온다. 이걸 최우선으로 본다.
 */
function extractIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const first = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * 챗이 쓰는 공용 카운터(`incr_rate_limit`)를 그대로 재사용한다.
 * 전용 RPC(`incr_contract_check_rate_limit`)를 따로 만들었더니 프로덕션에서 조용히 fail-open 됐다 —
 * 원인 후보(마이그레이션 미적용/타 프로젝트 적용/반환 shape 불일치)를 밖에서 구분할 수 없었다.
 * scope는 기존에 쓰이던 값('ip'·'global')만 쓰고 key만 `cc:` 네임스페이스로 분리해 스키마 변경 없이 붙인다.
 *
 * DB 오류 시에는 fail-open — 리밋 고장으로 사용자를 막지 않는다(src/lib/rate-limit.ts와 동일).
 * 다만 삼키지 않고 로그를 남긴다. 조용한 fail-open이 곧 무제한이라는 걸 이번에 겪었다.
 */
async function underLimit(scope: 'ip' | 'global', key: string, max: number): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[contract-check/extract] rate limit skipped: supabase env missing');
    return true;
  }

  try {
    const db = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await db.rpc('incr_rate_limit', {
      p_scope: scope,
      p_key: key,
      p_max: max,
    });
    if (error || !data) {
      console.error('[contract-check/extract] rate limit fail-open', scope, error?.message ?? 'no data');
      return true;
    }
    // RETURNS TABLE/SETOF면 PostgREST가 배열로 준다 → data.allowed가 undefined가 되고
    // `!== false`는 true로 흘러 조용히 무제한이 된다. 배열을 먼저 편다.
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; count?: number }
      | undefined;
    if (!row || typeof row.allowed !== 'boolean') {
      // 여기까지 오면 RPC는 성공했는데 우리가 shape을 잘못 읽고 있는 것이다.
      // 조용히 통과시키면 원인 규명이 다시 불가능해지므로 반드시 남긴다.
      console.error(
        '[contract-check/extract] rate limit shape mismatch',
        scope,
        JSON.stringify(data).slice(0, 200),
      );
      return true;
    }
    // 판정이 실제로 내려진 경우에만 한 줄. 키가 누적되는지 로그로 확인 가능해야 한다.
    console.log('[contract-check/extract] rate limit', scope, key, row.count ?? '?', row.allowed);
    return row.allowed;
  } catch (err) {
    console.error(
      '[contract-check/extract] rate limit exception',
      scope,
      err instanceof Error ? err.message : 'unknown',
    );
    return true;
  }
}

// ── 핸들러 ───────────────────────────────────────────────────────────

function json(status: number, body: Obj): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

type UploadFile = { size: number; type: string; name?: string; arrayBuffer: () => Promise<ArrayBuffer> };

function isFile(v: FormDataEntryValue): v is FormDataEntryValue & UploadFile {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as UploadFile).size === 'number' &&
    typeof (v as UploadFile).arrayBuffer === 'function'
  );
}

export async function POST(req: Request): Promise<Response> {
  // env 게이트 — 키가 없으면 기능 전체가 닫힌다(폼 수동 입력으로 폴백).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(501, {
      error: 'not_configured',
      message: '사진 자동 인식을 준비 중입니다. 아래 폼에 직접 입력해 주세요.',
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: 'bad_request', message: '이미지 파일을 업로드해 주세요.' });
  }

  const files = form.getAll('images').filter(isFile);
  if (files.length === 0) {
    return json(400, { error: 'no_image', message: '계약서 파일을 1개 이상 올려 주세요.' });
  }

  // 이미지는 여러 장을 이어 붙일 수 있지만(계약서 앞·뒷장), 문서 파일은 그 자체로 전문이라
  // 1개만 받는다. 섞어 올리면 어느 쪽이 정본인지 알 수 없다.
  const isImage = (f: UploadFile) => ALLOWED_MEDIA_TYPES.includes(f.type);
  const images = files.filter(isImage);
  const others = files.filter((f) => !isImage(f));

  if (others.length > 0 && images.length > 0) {
    return json(400, {
      error: 'mixed_upload',
      message: '사진과 문서 파일은 함께 올릴 수 없습니다. 한 가지만 골라 올려 주세요.',
    });
  }
  if (others.length > 1) {
    return json(400, { error: 'too_many_docs', message: '문서 파일은 1개만 올릴 수 있습니다.' });
  }
  if (images.length > MAX_IMAGES) {
    return json(400, { error: 'too_many_images', message: `사진은 최대 ${MAX_IMAGES}장까지 올릴 수 있습니다.` });
  }

  for (const file of images) {
    // 크기 검사를 먼저 — 초과 파일은 바이트를 읽지 않는다.
    if (file.size > MAX_IMAGE_BYTES) {
      return json(413, { error: 'file_too_large', message: '사진 1장당 5MB까지 올릴 수 있습니다.' });
    }
  }

  const doc = others[0];
  const docKind = doc ? detectDocKind(doc.name ?? '', doc.type) : null;
  const isPdf = !!doc && (doc.type === 'application/pdf' || (doc.name ?? '').toLowerCase().endsWith('.pdf'));

  if (doc) {
    if (!isPdf && !docKind) {
      return json(415, {
        error: 'unsupported_type',
        message:
          'JPG·PNG·WEBP 사진, PDF, DOCX, XLSX, HWPX만 인식할 수 있습니다. 한글(.hwp) 문서는 「PDF로 저장」해서 올려 주세요.',
      });
    }
    if (doc.size > MAX_DOC_BYTES) {
      return json(413, {
        error: 'file_too_large',
        message: '문서 파일은 4MB까지 올릴 수 있습니다. 쪽수를 줄이거나 PDF로 저장해 다시 시도해 주세요.',
      });
    }
  }

  const ip = extractIp(req);

  // 봇 차단 — 카운터를 올리기 전에 건다. env 미설정이면 자동 패스(로컬·베타).
  if (isTurnstileEnabled()) {
    const token = form.get('turnstileToken');
    const ts = await verifyTurnstile(typeof token === 'string' ? token : null, ip);
    if (!ts.skipped && !ts.success) {
      return json(403, {
        error: 'bot_check_failed',
        message: '자동 확인에 실패했습니다. 잠시 후 다시 시도하시거나 아래 폼에 직접 입력해 주세요.',
      });
    }
  }

  // 전역 캡을 먼저 본다 — 여기서 막혀야 개별 카운터가 올라가지 않는다.
  if (!(await underLimit('global', 'cc_all', GLOBAL_DAILY_LIMIT))) {
    return json(429, {
      error: 'rate_limited',
      message:
        '오늘 사진 인식 이용량이 많아 잠시 중단되었습니다. 아래 폼에 직접 입력하시거나 전문가 상담을 이용해 주세요.',
    });
  }

  if (!(await underLimit('ip', `cc:${hashIp(ip)}`, IP_DAILY_LIMIT))) {
    return json(429, {
      error: 'rate_limited',
      message: `사진 인식은 하루 ${IP_DAILY_LIMIT}회까지 이용할 수 있습니다. 내일 다시 시도하시거나, 아래 폼에 직접 입력하거나 전문가 상담을 이용해 주세요.`,
    });
  }

  try {
    const blocks: Obj[] = [];

    if (doc && isPdf) {
      const buf = await doc.arrayBuffer();
      // 페이지 수를 먼저 센다 — 상한을 넘으면 Anthropic 호출 자체를 하지 않는다(비용 방어).
      let pages = 0;
      try {
        const { PDFDocument } = await import('pdf-lib');
        pages = (await PDFDocument.load(buf, { ignoreEncryption: true })).getPageCount();
      } catch {
        return json(400, {
          error: 'pdf_unreadable',
          message: 'PDF를 열지 못했습니다. 암호가 걸려 있지 않은지 확인하시거나 사진으로 올려 주세요.',
        });
      }
      if (pages > MAX_PDF_PAGES) {
        return json(413, {
          error: 'too_many_pages',
          message: `PDF는 ${MAX_PDF_PAGES}쪽까지 인식할 수 있습니다(올리신 파일 ${pages}쪽). 근로계약서 부분만 남겨 다시 올려 주세요.`,
        });
      }
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(buf).toString('base64') },
      });
      blocks.push({ type: 'text', text: USER_INSTRUCTION });
    } else if (doc && docKind) {
      // 텍스트층이 있는 형식은 평문으로 뽑아 보낸다 — 이미지로 보내는 것보다 싸고 정확하다.
      let text: string;
      try {
        text = await extractDocText(docKind, await doc.arrayBuffer());
      } catch {
        return json(400, {
          error: 'doc_unreadable',
          message: '문서에서 글자를 읽지 못했습니다. PDF로 저장하거나 사진으로 올려 주세요.',
        });
      }
      blocks.push({ type: 'text', text: `아래는 근로계약서 파일에서 추출한 본문입니다.\n\n---\n${text}\n---` });
      blocks.push({ type: 'text', text: DOC_INSTRUCTION });
    } else {
      for (const file of images) {
        const data = Buffer.from(await file.arrayBuffer()).toString('base64');
        blocks.push({ type: 'image', source: { type: 'base64', media_type: file.type, data } });
      }
      blocks.push({ type: 'text', text: USER_INSTRUCTION });
    }

    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        // claude-sonnet-5는 temperature·top_p·top_k를 받지 않는다(보내면 400). 판독 일관성은 프롬프트로 잡는다.
        // thinking을 생략하면 adaptive가 기본 ON이고, max_tokens는 사고+응답 합계 상한이라 JSON이 잘린다.
        thinking: { type: 'disabled' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: blocks }],
      }),
    });

    if (!resp.ok) {
      // 4xx는 요청 스펙 위반이고 본문에 계약서 내용이 실리지 않는다 → 진단용으로 type·message만 남긴다.
      // (status만 남겼더니 400의 원인이 temperature인지 모델명인지 구분되지 않아 왕복이 한 번 더 필요했다)
      let detail = '';
      if (resp.status >= 400 && resp.status < 500) {
        const raw = await resp.text().catch(() => '');
        try {
          const e = (JSON.parse(raw) as { error?: { type?: string; message?: string } }).error;
          detail = `${e?.type ?? ''} ${e?.message ?? ''}`.trim().slice(0, 300);
        } catch {
          detail = raw.slice(0, 200);
        }
      }
      console.error('[contract-check/extract] upstream status', resp.status, detail);
      return json(502, {
        error: 'extract_failed',
        message: '사진 인식에 실패했습니다. 잠시 후 다시 시도하시거나 아래 폼에 직접 입력해 주세요.',
      });
    }

    const data = (await resp.json()) as { content?: Array<{ type?: string; text?: string }> };
    // 첫 블록이 text가 아닐 수 있다(thinking 등) — 첫 text 블록을 고른다.
    const text = (data?.content ?? []).find((b) => b?.type === 'text')?.text ?? '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonPayload(text));
    } catch {
      return json(502, {
        error: 'parse_failed',
        message: '계약서 내용을 읽지 못했습니다. 더 밝고 선명한 사진으로 다시 시도하거나 아래 폼에 직접 입력해 주세요.',
      });
    }

    const result = sanitizeExtracted(parsed);
    if (!result) {
      return json(502, {
        error: 'parse_failed',
        message: '계약서 내용을 읽지 못했습니다. 더 밝고 선명한 사진으로 다시 시도하거나 아래 폼에 직접 입력해 주세요.',
      });
    }

    // 이미지·추출 결과는 저장하지 않는다 — 응답으로만 돌려주고 끝.
    return json(200, { contract: result.contract, notes: result.notes });
  } catch (err) {
    console.error('[contract-check/extract] error', err instanceof Error ? err.name : 'unknown');
    return json(502, {
      error: 'extract_failed',
      message: '사진 인식에 실패했습니다. 잠시 후 다시 시도하시거나 아래 폼에 직접 입력해 주세요.',
    });
  }
}
