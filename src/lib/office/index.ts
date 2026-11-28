// k-labor/office — 라이브러리 입구(최소판). SafeClaw·변환 작업자·MCP 도구가 모두 이 함수를 부른다.
// ★ 결과 모양은 하나다: { ok:true, data, files?, warnings, meta } | { ok:false, code, message, details?, warnings, meta }
// ★ 던지지 않는다. 한도(Limits)는 부르는 쪽이 전부 주입한다(DEFAULT_LIMITS 를 그대로 넘겨도 된다).
// ★ PRESERVATION_LOSS 는 경고 + 바이트 반환이 기본이고, strict:true 일 때만 실패다.
// fs·네트워크 없음. MCP SDK·popbill·tesseract 의존 없음.
import { createHash } from 'node:crypto';
import { checkLimits, DEFAULT_LIMITS, type Limits } from './limits';
import type { Warning } from './types';
import { inspectXlsx as engineInspect, type InspectXlsxResult } from './xlsx/inspect';
import { extractXlsxRows as engineExtract, type ExtractXlsxResult } from './xlsx/extract';
import { fillXlsxTemplate as engineFill, type FillCell, type FillHiddenColumns, type FillRows, type PreservedReport } from './xlsx/fill';
import { makeXlsxFromSpec as engineMake, type XlsxSpec } from './xlsx/make';
import { makeBroadcastPptx as engineBroadcast, type BroadcastOptions, type BroadcastSlideInfo, type OpinionResult } from './pptx/broadcast';
import { makeEducationPptx as engineEducation, type EducationOptions, type EducationSlideInfo, type EducationSnapshot, type EducationSummary } from './pptx/education';
import { makeTbmPptx as engineTbm, type TbmOptions, type TbmPick, type TbmSlideInfo, type TbmSnapshot } from './pptx/tbm';
import { makeMeetingPptx as engineMeeting, type MeetingChange, type MeetingOptions, type MeetingSlideInfo, type MeetingSnapshot, type OverflowEstimate, type PriorItem } from './pptx/meeting';
import { extractPptx as engineExtractPptx, type PptxSlide } from './pptx/extract';

export { DEFAULT_LIMITS };
export type { Limits, Warning };
export type { XlsxSheetInfo, XlsxValidation, XlsxInputCandidate } from './xlsx/inspect';
export type { ExtractedCell, ExtractedRow, XlsxRaw } from './xlsx/extract';
export type { FillCell, FillHiddenColumns, FillRows, FillValue, PreservedItem, PreservedReport } from './xlsx/fill';
export type { XlsxSpec, XlsxSpecSheet, XlsxSpecColumn } from './xlsx/make';
export type {
  MeetingSnapshot,
  MeetingOptions,
  MeetingSlideInfo,
  MeetingChange,
  OverflowEstimate,
  PriorItem,
  HazardItem,
  MeetingPhoto,
  MeetingOpinion,
  MeetingQuestion,
  MeetingAttendee,
  MeetingDecision,
  MeetingAction,
  MeetingDeferred,
  MeetingBestPractice,
  MeetingAnchor,
  MeetingStatus,
} from './pptx/meeting';
export type { PptxSlide, PptxShape } from './pptx/extract';
export type { BroadcastOptions, BroadcastSlideInfo, OpinionResult } from './pptx/broadcast';
export type { EducationCase, EducationCourse, EducationOptions, EducationQuiz, EducationSlideInfo, EducationSnapshot, EducationSummary } from './pptx/education';
export type { TbmSnapshot, TbmTask, TbmHazard, TbmAcceptability, TbmOptions, TbmSlideInfo, TbmPick } from './pptx/tbm';
// 덱 디자인 프리셋(quiet·field·app·report·story) — 프리셋 데이터와 「이 스냅숏을 담을 수 있나」 거르기
export { DESIGN_IDS, DESIGN_DECK_KINDS, getDeckDesign, designsFor, designErrors, contrastRatio } from './pptx/design/index';
export type { DesignId, DesignDeckKind, DeckDesign, DesignFit } from './pptx/design/index';
// 덱 테마 계약 — 순수 함수라 결과 틀(run) 밖에서 바로 내보낸다
export { getDeckTheme, DECK_RULES, DECK_KINDS, COLOR_ROLES } from './pptx/theme/index';
export type {
  DeckKind,
  DeckTheme,
  DeckThemeOptions,
  DeckThemeOverride,
  DeckFonts,
  DeckTypeScale,
  DeckRulesData,
  TitleStyle,
  TypeProfile,
  TableStyle,
  TableStyleName,
  PaperName,
  ColorRole,
} from './pptx/theme/index';

/** 실패 코드 — 열린 유니언(새 코드가 생겨도 받는 쪽 타입이 깨지지 않는다) */
export type ErrorCode =
  | 'INVALID_ARGS'
  | 'INPUT_TOO_LARGE'
  | 'ZIP_TOO_LARGE'
  | 'WORKLOAD_TOO_LARGE'
  | 'UNSUPPORTED_INPUT'
  | 'OVERFLOW'
  | 'PRESERVATION_LOSS'
  | 'OUTPUT_TOO_LARGE'
  | 'WRITE_FAILED'
  | 'INTERNAL'
  | (string & {});

/** 엔진 출처 — 빌드 때 상수로 박는다(소스에서 바로 돌면 commit·dirty 가 null) */
export interface EngineInfo {
  name: 'k-labor/office';
  version: string;
  commit: string | null;
  dirty: boolean | null;
}

export interface Meta {
  op: OfficeOp;
  engine: EngineInfo;
}

export interface OutputFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  size: number;
  sha256: string;
}

export type Ok<T> = { ok: true; data: T; files?: OutputFile[]; warnings: Warning[]; meta: Meta };
export type Fail = { ok: false; code: ErrorCode; message: string; details?: unknown; warnings: Warning[]; meta: Meta };
export type Result<T> = Ok<T> | Fail;

/** 모든 함수가 받는 공통 맥락. limits 는 칸 전부 필수 */
export interface OfficeContext {
  limits: Limits;
}

export const OFFICE_OPS = ['xlsx.inspect', 'xlsx.extract', 'xlsx.fill', 'xlsx.make', 'pptx.meeting', 'pptx.extract', 'pptx.tbm', 'pptx.broadcast', 'pptx.education'] as const;
export type OfficeOp = (typeof OFFICE_OPS)[number];

declare const __K_LABOR_OFFICE_ENGINE__: EngineInfo | undefined;
export const ENGINE: EngineInfo = Object.freeze(
  typeof __K_LABOR_OFFICE_ENGINE__ !== 'undefined' ? __K_LABOR_OFFICE_ENGINE__ : { name: 'k-labor/office' as const, version: '0.0.0-source', commit: null, dirty: null },
);

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const meta = (op: OfficeOp): Meta => ({ op, engine: ENGINE });
const notices = (list: string[] | undefined): Warning[] => (list ?? []).map((message) => ({ code: 'NOTICE', message }));

function failure(op: OfficeOp, code: ErrorCode, message: string, details?: unknown, warnings: Warning[] = []): Fail {
  return details === undefined ? { ok: false, code, message, warnings, meta: meta(op) } : { ok: false, code, message, details, warnings, meta: meta(op) };
}

function file(name: string, mime: string, bytes: Uint8Array): OutputFile {
  return { name, mime, bytes, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** 공통 앞뒤 처리 — 한도 검사, 바이트 검사, 예외를 INTERNAL 로 */
async function run<T>(op: OfficeOp, ctx: OfficeContext | undefined, bytes: Uint8Array | null, body: (limits: Limits) => Promise<Result<T>>): Promise<Result<T>> {
  const bad = checkLimits(ctx?.limits);
  if (bad) return failure(op, 'INVALID_ARGS', bad);
  const limits = ctx!.limits;
  if (bytes !== null) {
    if (!(bytes instanceof Uint8Array)) return failure(op, 'INVALID_ARGS', '입력은 Uint8Array 여야 합니다.');
    if (bytes.length > limits.maxInputBytes) return failure(op, 'INPUT_TOO_LARGE', `입력이 ${limits.maxInputBytes} 바이트를 넘습니다.`, { bytes: bytes.length });
  }
  try {
    const r = await body(limits);
    if (r.ok && r.files?.some((f) => f.size > limits.maxOutputBytes)) {
      return failure(op, 'OUTPUT_TOO_LARGE', `결과가 ${limits.maxOutputBytes} 바이트를 넘습니다.`, { bytes: Math.max(...r.files.map((f) => f.size)) }, r.warnings);
    }
    return r;
  } catch (e) {
    return failure(op, 'INTERNAL', `엔진 내부 오류: ${(e as Error)?.message ?? String(e)}`);
  }
}

/** 엔진의 열기 실패(needsReview·코드)를 Fail 로 */
function openFail(op: OfficeOp, r: { code?: string; reason?: string; needsReview?: boolean }): Fail {
  const code = (r.code ?? (r.needsReview ? 'UNSUPPORTED_INPUT' : 'INVALID_ARGS')) as ErrorCode;
  return failure(op, code, r.reason ?? '처리하지 못했습니다.', code === 'UNSUPPORTED_INPUT' ? { needsReview: true } : undefined);
}

// ── xlsx

export type InspectXlsxData = Pick<InspectXlsxResult, 'sheets' | 'definedNames' | 'inputCandidates'>;

/** xlsx 서식 구조(시트·병합·수식 수·조건부서식·유효성·인쇄·그림·이름정의) */
export function inspectXlsx(bytes: Uint8Array, ctx: OfficeContext): Promise<Result<InspectXlsxData>> {
  return run('xlsx.inspect', ctx, bytes, async (limits) => {
    const r = await engineInspect(bytes, limits);
    if (!r.ok) return openFail('xlsx.inspect', r);
    return { ok: true, data: { sheets: r.sheets, definedNames: r.definedNames, inputCandidates: r.inputCandidates }, warnings: [], meta: meta('xlsx.inspect') };
  });
}

export interface ExtractXlsxOptions extends OfficeContext {
  sheet?: string;
  headerRow?: number;
  maxRows?: number;
}
export type ExtractXlsxData = Pick<ExtractXlsxResult, 'headers' | 'rows'> & { sheet: string };

/** 머리행 아래 행을 칸 주소·원문 값·수식·캐시값·병합 출처와 함께 읽는다 */
export function extractXlsxRows(bytes: Uint8Array, opts: ExtractXlsxOptions): Promise<Result<ExtractXlsxData>> {
  return run('xlsx.extract', opts, bytes, async (limits) => {
    const r = await engineExtract(bytes, { sheet: opts.sheet, headerRow: opts.headerRow, maxRows: opts.maxRows }, limits);
    if (!r.ok) return openFail('xlsx.extract', r);
    return { ok: true, data: { sheet: r.sheet!, headers: r.headers, rows: r.rows }, warnings: notices(r.warnings), meta: meta('xlsx.extract') };
  });
}

export interface FillXlsxOptions extends OfficeContext {
  cells?: FillCell[];
  rows?: FillRows;
  /** 숨길 열(시트별 열 문자) — 보존 비교에서 의도한 변경 */
  hiddenColumns?: FillHiddenColumns[];
  /** true 면 보존 손실(PRESERVATION_LOSS) 시 바이트 없이 실패. 기본 false = 경고 + 바이트 */
  strict?: boolean;
  /** 결과 파일 이름(기본 filled.xlsx) */
  outName?: string;
}
export interface FillXlsxData {
  changedCells: { sheet: string; cell: string }[];
  preserved: PreservedReport;
  fullCalcOnLoad: boolean;
  /** 덮어쓴 옛 글을 지워 비운 공유 문자열(<si>) 수(§2-7) */
  clearedSharedStrings?: number;
}

/** 원본 서식 그대로 지정 칸·표 행만 채운다. 결과 파일은 files[0] */
export function fillXlsxTemplate(bytes: Uint8Array, opts: FillXlsxOptions): Promise<Result<FillXlsxData>> {
  return run('xlsx.fill', opts, bytes, async (limits) => {
    if (!opts.cells?.length && !opts.rows && !opts.hiddenColumns?.length) return failure('xlsx.fill', 'INVALID_ARGS', 'cells·rows·hiddenColumns 중 하나를 주세요.');
    const r = await engineFill(bytes, { cells: opts.cells, rows: opts.rows, hiddenColumns: opts.hiddenColumns }, limits, opts.strict === true);
    if (!r.ok || !r.bytes) {
      const details: Record<string, unknown> = {};
      if (r.needsReview) details.needsReview = true;
      if (r.overflowRows !== undefined) details.overflowRows = r.overflowRows;
      if (r.preserved) details.preserved = r.preserved;
      return failure('xlsx.fill', (r.code ?? 'INVALID_ARGS') as ErrorCode, r.reason ?? '채우지 못했습니다.', Object.keys(details).length ? details : undefined, r.issues);
    }
    return {
      ok: true,
      data: { changedCells: r.changedCells, preserved: r.preserved!, fullCalcOnLoad: r.fullCalcOnLoad, clearedSharedStrings: r.clearedSharedStrings },
      files: [file(opts.outName ?? 'filled.xlsx', XLSX_MIME, r.bytes)],
      warnings: r.issues,
      meta: meta('xlsx.fill'),
    };
  });
}

export interface MakeXlsxOptions extends OfficeContext {
  outName?: string;
}

/** 사양(JSON)으로 xlsx 를 만든다. 결과 파일은 files[0] */
export function makeXlsxFromSpec(spec: XlsxSpec, opts: MakeXlsxOptions): Promise<Result<{ sheets: string[] }>> {
  return run('xlsx.make', opts, null, async () => {
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.sheets)) return failure('xlsx.make', 'INVALID_ARGS', 'spec.sheets 배열을 주세요.');
    const r = await engineMake(spec);
    if (!r.ok) return failure('xlsx.make', 'INVALID_ARGS', r.errors.join(' / '), { errors: r.errors });
    return { ok: true, data: { sheets: spec.sheets.map((s) => s.name) }, files: [file(opts.outName ?? 'spec.xlsx', XLSX_MIME, r.bytes)], warnings: [], meta: meta('xlsx.make') };
  });
}

// ── pptx

export interface MeetingPptxOptions extends OfficeContext, MeetingOptions {
  outName?: string;
}
export interface MeetingPptxData {
  slides: MeetingSlideInfo[];
  overflowEstimates: OverflowEstimate[];
  changes?: MeetingChange[];
  carryOver?: PriorItem[];
}

/** 회의 스냅숏 → 위험성평가 회의 덱(pre = 회의 전 검토안, final = 회의 후 확정본). 결과 파일은 files[0] */
export function makeMeetingPptx(snapshot: MeetingSnapshot, opts: MeetingPptxOptions): Promise<Result<MeetingPptxData>> {
  return run('pptx.meeting', opts, null, async () => {
    const r = await engineMeeting(snapshot, { kind: opts.kind, fontFace: opts.fontFace, layout: opts.layout, design: opts.design });
    if (!r.ok || !r.bytes) return failure('pptx.meeting', 'INVALID_ARGS', (r.errors ?? ['덱을 만들지 못했습니다.']).join(' / '), { errors: r.errors ?? [] }, notices(r.warnings));
    const data: MeetingPptxData = { slides: r.slides, overflowEstimates: r.overflowEstimates };
    if (r.changes) data.changes = r.changes;
    if (r.carryOver) data.carryOver = r.carryOver;
    return { ok: true, data, files: [file(opts.outName ?? 'meeting.pptx', PPTX_MIME, r.bytes)], warnings: notices(r.warnings), meta: meta('pptx.meeting') };
  });
}

export interface TbmPptxOptions extends OfficeContext, TbmOptions {
  outName?: string;
}
export interface TbmPptxData {
  slides: TbmSlideInfo[];
  picks: TbmPick[];
  overflowEstimates: OverflowEstimate[];
}

/** TBM 스냅숏 → 작업별 TBM 카드 덱(전파 덱). 결과 파일은 files[0] */
export function makeTbmPptx(snapshot: TbmSnapshot, opts: TbmPptxOptions): Promise<Result<TbmPptxData>> {
  return run('pptx.tbm', opts, null, async () => {
    const r = await engineTbm(snapshot, { maxHazards: opts.maxHazards, signatureRows: opts.signatureRows, fontFace: opts.fontFace, layout: opts.layout, design: opts.design });
    if (!r.ok || !r.bytes) return failure('pptx.tbm', 'INVALID_ARGS', (r.errors ?? ['덱을 만들지 못했습니다.']).join(' / '), { errors: r.errors ?? [] }, notices(r.warnings));
    const data: TbmPptxData = { slides: r.slides, picks: r.picks, overflowEstimates: r.overflowEstimates };
    return { ok: true, data, files: [file(opts.outName ?? 'tbm.pptx', PPTX_MIME, r.bytes)], warnings: notices(r.warnings), meta: meta('pptx.tbm') };
  });
}

export interface BroadcastPptxOptions extends OfficeContext, BroadcastOptions {
  outName?: string;
}
export interface BroadcastPptxData {
  slides: BroadcastSlideInfo[];
  opinionResults: OpinionResult[];
  overflowEstimates: OverflowEstimate[];
}

/** 확정 회의 스냅숏 → 회의 결과 전파본(근로자 공유 덱). 결과 파일은 files[0] */
export function makeBroadcastPptx(snapshot: MeetingSnapshot, opts: BroadcastPptxOptions): Promise<Result<BroadcastPptxData>> {
  return run('pptx.broadcast', opts, null, async () => {
    const r = await engineBroadcast(snapshot, { signatureRows: opts.signatureRows, fontFace: opts.fontFace, layout: opts.layout, design: opts.design });
    if (!r.ok || !r.bytes) return failure('pptx.broadcast', 'INVALID_ARGS', (r.errors ?? ['덱을 만들지 못했습니다.']).join(' / '), { errors: r.errors ?? [] }, notices(r.warnings));
    const data: BroadcastPptxData = { slides: r.slides, opinionResults: r.opinionResults, overflowEstimates: r.overflowEstimates };
    return { ok: true, data, files: [file(opts.outName ?? 'broadcast.pptx', PPTX_MIME, r.bytes)], warnings: notices(r.warnings), meta: meta('pptx.broadcast') };
  });
}

export interface EducationPptxOptions extends OfficeContext, EducationOptions {
  outName?: string;
}
export interface EducationPptxData {
  slides: EducationSlideInfo[];
  summary?: EducationSummary;
  shown: string[];
  omitted: string[];
  overflowEstimates: OverflowEstimate[];
}

/** 위험성평가 결과 → 안전보건교육 교안(규칙 별표 5 제1호 가목·다목). 결과 파일은 files[0] */
export function makeEducationPptx(snapshot: EducationSnapshot, opts: EducationPptxOptions): Promise<Result<EducationPptxData>> {
  return run('pptx.education', opts, null, async () => {
    const r = await engineEducation(snapshot, { topN: opts.topN, signatureRows: opts.signatureRows, fontFace: opts.fontFace, layout: opts.layout, design: opts.design });
    if (!r.ok || !r.bytes) return failure('pptx.education', 'INVALID_ARGS', (r.errors ?? ['덱을 만들지 못했습니다.']).join(' / '), { errors: r.errors ?? [] }, notices(r.warnings));
    const data: EducationPptxData = { slides: r.slides, summary: r.summary, shown: r.shown, omitted: r.omitted, overflowEstimates: r.overflowEstimates };
    return { ok: true, data, files: [file(opts.outName ?? 'education.pptx', PPTX_MIME, r.bytes)], warnings: notices(r.warnings), meta: meta('pptx.education') };
  });
}

/** pptx 장별 도형 글자·표·notes */
export function extractPptx(bytes: Uint8Array, ctx: OfficeContext): Promise<Result<{ slides: PptxSlide[] }>> {
  return run('pptx.extract', ctx, bytes, async (limits) => {
    const r = await engineExtractPptx(bytes, limits);
    if (!r.ok) return openFail('pptx.extract', r);
    return { ok: true, data: { slides: r.slides }, warnings: [], meta: meta('pptx.extract') };
  });
}
