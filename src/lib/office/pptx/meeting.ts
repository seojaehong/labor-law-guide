// 회의 PPTX — 스냅숏(JSON) → 회의 전 검토안 덱(바이트). fs·네트워크 없음.
// 사양 = .ralph/spec-office-v0.md §3·§4. 판형 기본 A4 가로(29.7×21.0cm).
// 넘침 정밀 판정은 엔진 밖(PowerPoint 검수)이다 — 여기서는 칸 글자 수로 추정만 한다.
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';
import { capacityOf, textUnits } from './text-units';
import { DESIGN_IDS, getDeckDesign, isDesignId, type DeckDesign, type DesignColorKey, type DesignId } from './design/index';
import { bodyRoomFor, color, drawHead } from './design/head';
import { koSlide } from './design/lang';
import { drawList, drawListEmpty, listLayout, type ListRow, type ListSpec } from './design/lists';
import { drawB1, type Kpi } from './design/parts';
import { LINE_H, wrapLines } from './design/b3-geometry';
import { calloutHeight, checkCallout, drawCallout, listPages, pickLayout, recordChecks, type Kit, type Page } from './design/deck';

export const MEETING_TEMPLATE_VERSION = 'meeting-v0';

export type MeetingStatus = { label: '초안' } | { label: '확정'; version: number };

export interface MeetingAnchor {
  id: string;
  source?: string;
  location?: string;
}

export interface PriorItem {
  id: string;
  hazard: string;
  frequency?: number;
  severity?: number;
  grade?: string;
  measure?: string;
  owner?: string;
  due?: string;
  /** 완료 · 미완료 · 기한초과 · 재조치 */
  status: string;
  result?: string;
  verifier?: string;
  scaleId?: string;
  legal?: string;
  effect?: string;
  residual?: string;
  anchors?: string[];
  /** 같은 위험요인에 조치가 여러 건이라 id 에 「#n」 을 붙였을 때 원래 위험요인 ID(회차 대비 변화는 이것으로 맞춘다) */
  hazardId?: string;
}

export interface HazardItem {
  id: string;
  situation: string;
  cause: string;
  consequence: string;
  tags?: string[];
  measures?: { technical?: string; education?: string; management?: string };
  frequency?: number;
  severity?: number;
  grade?: string;
  /** new · changed · unchanged */
  kind?: string;
  sourceType?: string;
  anchors?: string[];
}

export interface MeetingPhoto {
  itemId: string;
  side: 'before' | 'after';
  /** base64(데이터 URL 머리 없이) */
  data: string;
  mime?: string;
}

export interface MeetingOpinion {
  id: string;
  from: string;
  text: string;
  relatedIds?: string[];
  anchors?: string[];
}

export interface MeetingQuestion {
  id: string;
  question: string;
  targetIds?: string[];
  options?: string[];
  anchors?: string[];
}

export interface MeetingAttendee {
  role: string;
  name?: string;
  /** 근로자대표 여부. 없으면 role 에 「근로자대표」 가 있는지로 본다 */
  workerRepresentative?: boolean;
}

export interface MeetingDecision {
  id: string;
  questionId?: string;
  targetIds?: string[];
  decision: string;
  reason?: string;
  anchors?: string[];
}

export interface MeetingAction {
  id: string;
  /** 대상 위험요인 ID(다음 회차 이월 ID). 없으면 id */
  targetId?: string;
  hazard?: string;
  measure: string;
  owner?: string;
  due?: string;
  verifier?: string;
  anchors?: string[];
}

export interface MeetingDeferred {
  id: string;
  hazard?: string;
  reason: string;
  reevaluateBy?: string;
  anchors?: string[];
}

export interface MeetingBestPractice {
  id: string;
  title: string;
  text: string;
  anchors?: string[];
}

export interface MeetingSnapshot {
  kind?: 'pre' | 'final';
  site: string;
  cycle: string;
  meetingDate?: string;
  basisDate: string;
  period?: string;
  author?: string;
  revision?: string;
  status: MeetingStatus;
  scaleId: string;
  scaleName: string;
  agenda?: string[];
  safetyCase?: string;
  prior: PriorItem[];
  hazards: HazardItem[];
  photos: MeetingPhoto[];
  opinions: MeetingOpinion[];
  questions: MeetingQuestion[];
  attendees?: { planned?: MeetingAttendee[]; actual?: MeetingAttendee[] };
  anchors: MeetingAnchor[];
  /** 확정본: 실제 회의일 · 다음 적용기간 */
  actualMeetingDate?: string;
  nextPeriod?: string;
  decisions?: MeetingDecision[];
  actions?: MeetingAction[];
  deferred?: MeetingDeferred[];
  bestPractices?: MeetingBestPractice[];
}

export interface MeetingOptions {
  kind?: 'pre' | 'final';
  /** 글꼴. 기본 「맑은 고딕」 */
  fontFace?: string;
  /** 판형. 기본 A4 가로 — 단 design 을 고르고 판형을 주지 않으면 16:9 */
  layout?: 'A4' | '16:9';
  /** 디자인 프리셋. 미지정이면 지금 출력 그대로 */
  design?: DesignId;
}

export interface MeetingSlideInfo {
  no: number;
  code: string;
  title: string;
  anchors: string[];
}

export interface OverflowEstimate {
  slide: number;
  code: string;
  ref: string;
  field: string;
  chars: number;
  capacity: number;
}

export interface MeetingChange {
  id: string;
  priorRisk: number | null;
  currentRisk: number | null;
  delta: number | '비교 안 함' | '현재 평가 없음' | '산정 불가';
}

export interface MeetingPptxResult {
  ok: boolean;
  bytes?: Uint8Array;
  slides: MeetingSlideInfo[];
  overflowEstimates: OverflowEstimate[];
  changes?: MeetingChange[];
  /** 확정본 F7 — 다음 회차 prior[] 로 그대로 넣을 수 있는 이월 목록 */
  carryOver?: PriorItem[];
  warnings: string[];
  errors?: string[];
}

const P4_ROWS_PER_SLIDE = 6;
const P6_CARDS_PER_SLIDE = 4;
// 표 장 쪽 나눔(G4 Act on 10) — 한 장에 넣는 행 수. 긴 글 칸이 있는 표는 적게, 짧은 칸뿐인 표는 많이
const ROWS_PER_SLIDE = { P7: 8, P8: 10, P9: 8, P10: 14, F3: 8, F5: 8, F6: 6, F7: 10, F8: 12 } as const;

/** n 개씩 나눈다. 비면 빈 쪽 하나 */
function paginate<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  if (!out.length) out.push([]);
  return out;
}

// ── 입력 모양 검사(G4 Act on 8) — 원격 스키마가 느슨해도 엔진이 던지지 않고 errors 로 돌린다
type Kind = 'string' | 'string?' | 'number?' | 'boolean?' | 'strings?' | 'object?';
const S = 'string' as const;
const SO = 'string?' as const;
const NO = 'number?' as const;
const AO = 'strings?' as const;
const ITEM_SHAPES: Record<string, Record<string, Kind>> = {
  prior: { id: S, hazard: S, status: S, frequency: NO, severity: NO, grade: SO, measure: SO, owner: SO, due: SO, result: SO, verifier: SO, scaleId: SO, legal: SO, effect: SO, residual: SO, anchors: AO, hazardId: SO },
  hazards: { id: S, situation: S, cause: SO, consequence: SO, tags: AO, measures: 'object?', frequency: NO, severity: NO, grade: SO, kind: SO, sourceType: SO, anchors: AO },
  photos: { itemId: S, side: S, data: SO, mime: SO },
  opinions: { id: S, from: SO, text: S, relatedIds: AO, anchors: AO },
  questions: { id: S, question: S, targetIds: AO, options: AO, anchors: AO },
  anchors: { id: S, source: SO, location: SO },
  decisions: { id: S, questionId: SO, targetIds: AO, decision: S, reason: SO, anchors: AO },
  actions: { id: S, targetId: SO, hazard: SO, measure: SO, owner: SO, due: SO, verifier: SO, anchors: AO },
  deferred: { id: S, hazard: SO, reason: SO, reevaluateBy: SO, anchors: AO },
  bestPractices: { id: S, title: S, text: S, anchors: AO },
};
const ATTENDEE_SHAPE: Record<string, Kind> = { role: S, name: SO, workerRepresentative: 'boolean?' };
const TOP_SHAPE: Record<string, Kind> = {
  site: S, cycle: S, basisDate: S, scaleId: S, scaleName: S, meetingDate: SO, period: SO, author: SO, revision: SO, agenda: AO, safetyCase: SO, actualMeetingDate: SO, nextPeriod: SO,
};

function kindOk(v: unknown, k: Kind): boolean {
  if (k.endsWith('?') && (v === undefined || v === null)) return true;
  switch (k) {
    case 'string':
    case 'string?':
      return typeof v === 'string';
    case 'number?':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean?':
      return typeof v === 'boolean';
    case 'strings?':
      return Array.isArray(v) && v.every((x) => typeof x === 'string');
    case 'object?':
      return typeof v === 'object' && v !== null && !Array.isArray(v);
  }
}

function checkShape(o: unknown, shape: Record<string, Kind>, at: string, errors: string[]): void {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) {
    errors.push(`${at}: 객체여야 한다`);
    return;
  }
  for (const [key, k] of Object.entries(shape)) {
    const v = (o as Record<string, unknown>)[key];
    if (!kindOk(v, k)) errors.push(`${at}.${key}: ${k.replace('?', '')}${k === 'strings?' ? '(글자 배열)' : ''} 이어야 한다`);
  }
}

function checkTypes(s: unknown): string[] {
  const errors: string[] = [];
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return ['snapshot 은 객체여야 한다'];
  const snap = s as Record<string, unknown>;
  checkShape(snap, TOP_SHAPE, 'snapshot', errors);
  const st = snap.status as Record<string, unknown> | undefined;
  if (typeof st !== 'object' || st === null) errors.push('status 는 {label} 객체여야 한다');
  else if (st.label === '확정' && !(typeof st.version === 'number' && Number.isInteger(st.version) && st.version >= 1)) {
    // 검토안이든 확정본이든 「확정」 배지에는 판 번호가 있어야 한다(「확정 vundefined」 방지)
    errors.push('status 가 확정이면 version(1 이상 정수)이 있어야 한다');
  }
  for (const [key, shape] of Object.entries(ITEM_SHAPES)) {
    const list = snap[key];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) {
      errors.push(`${key} 는 배열이어야 한다`);
      continue;
    }
    list.forEach((o, i) => checkShape(o, shape, `${key}[${i}]`, errors));
  }
  const att = snap.attendees as Record<string, unknown> | undefined | null;
  if (att !== undefined && att !== null) {
    if (typeof att !== 'object' || Array.isArray(att)) errors.push('attendees 는 객체여야 한다');
    else
      for (const k of ['planned', 'actual']) {
        const list = att[k];
        if (list === undefined || list === null) continue;
        if (!Array.isArray(list)) errors.push(`attendees.${k} 는 배열이어야 한다`);
        else list.forEach((o, i) => checkShape(o, ATTENDEE_SHAPE, `attendees.${k}[${i}]`, errors));
      }
  }
  return errors.slice(0, 50);
}
const T = MEETING_THEME;
// 표 본문 하한 10pt(rules.json profiles.reading.min.table)
const FONT_PT = T.typeScale.table;
const NONE = { type: 'none' as const };
const INNER = { type: 'solid' as const, pt: T.table.innerLinePt, color: T.colors.line };
const RULE = { type: 'solid' as const, pt: T.table.ruleLinePt, color: T.colors.primary };
const HEAD_FILL = { color: T.table.headerFill };

type Slide = ReturnType<PptxGenJS['addSlide']>;
type Cell = { text: string; options?: Record<string, unknown> };

// 글자 폭 추정은 잎 모듈(text-units)에 — 여기서 다시 내보내 기존 가져오기를 그대로 둔다
export { textUnits, capacityOf };

function badgeText(status: MeetingStatus): string {
  return status.label === '확정' ? `확정 v${status.version}` : '초안';
}

function validate(s: MeetingSnapshot, kind: string): string[] {
  const errors: string[] = [];
  if (kind !== 'pre' && kind !== 'final') errors.push(`kind ${kind} 은 pre·final 중 하나`);
  if (kind === 'final') {
    if (s.status?.label !== '확정' || typeof s.status.version !== 'number') errors.push('확정본은 status {label:확정, version} 이어야 한다');
    for (const a of s.actions ?? []) if (!a.measure?.trim()) errors.push(`actions ${a.id}: measure 가 비었다`);
    for (const d of s.deferred ?? []) if (!d.reason?.trim()) errors.push(`deferred ${d.id}: reason 이 비었다`);
  }
  if (!s.site?.trim()) errors.push('site 가 비었다');
  if (!s.cycle?.trim()) errors.push('cycle 이 비었다');
  if (!s.basisDate?.trim()) errors.push('basisDate 가 비었다');
  if (!s.scaleId?.trim()) errors.push('scaleId 가 비었다');
  if (!s.status || (s.status.label !== '초안' && s.status.label !== '확정')) errors.push('status.label 은 초안·확정 중 하나');
  const dup = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id?.trim()) errors.push(`${label} 에 빈 id`);
      else if (seen.has(id)) errors.push(`${label} id 중복: ${id}`);
      seen.add(id);
    }
  };
  dup('prior', (s.prior ?? []).map((p) => p.id));
  dup('hazards', (s.hazards ?? []).map((h) => h.id));
  dup('anchors', (s.anchors ?? []).map((a) => a.id));
  dup('decisions', (s.decisions ?? []).map((d) => d.id));
  dup('actions', (s.actions ?? []).map((a) => a.id));
  dup('deferred', (s.deferred ?? []).map((d) => d.id));
  for (const p of s.photos ?? []) {
    if (p.side !== 'before' && p.side !== 'after') errors.push(`photos ${p.itemId}: side 는 before·after`);
    if (!p.data) errors.push(`photos ${p.itemId}: data 가 비었다`);
  }
  return errors;
}

/** 회의 스냅숏 검사(모양 + 내용). 같은 스냅숏을 받는 다른 덱(전파본)이 회의 덱과 같은 기준으로 거른다 */
export function meetingSnapshotErrors(s: unknown, kind: 'pre' | 'final'): string[] {
  const typeErrors = checkTypes(s);
  if (typeErrors.length) return typeErrors;
  return validate(s as MeetingSnapshot, kind);
}

function uniq(list: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  for (const l of list) for (const a of l ?? []) if (!out.includes(a)) out.push(a);
  return out;
}

function risk(f?: number, s?: number): number | null {
  return typeof f === 'number' && typeof s === 'number' ? f * s : null;
}

export async function makeMeetingPptx(
  snapshot: MeetingSnapshot,
  opts: MeetingOptions = {},
): Promise<MeetingPptxResult> {
  const kind = opts.kind ?? snapshot?.kind ?? 'pre';
  const typeErrors = checkTypes(snapshot);
  if (typeErrors.length) return { ok: false, slides: [], overflowEstimates: [], warnings: [], errors: typeErrors };
  snapshot = { ...snapshot };
  for (const k of ['prior', 'hazards', 'photos', 'opinions', 'questions', 'anchors'] as const) if (!Array.isArray(snapshot[k])) (snapshot as unknown as Record<string, unknown[]>)[k] = [];
  const errors = validate(snapshot, kind);
  if (opts.design !== undefined && !isDesignId(opts.design)) errors.push(`design 은 ${DESIGN_IDS.join('·')} 중 하나(받은 값 ${String(opts.design)})`);
  if (errors.length) return { ok: false, slides: [], overflowEstimates: [], warnings: [], errors };

  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const pre = kind === 'pre';
  const warnings: string[] = [];
  const anchorMap = new Map(snapshot.anchors.map((a) => [a.id, a]));
  const allRefs = uniq([
    ...snapshot.prior.map((p) => p.anchors),
    ...snapshot.hazards.map((h) => h.anchors),
    ...snapshot.opinions.map((o) => o.anchors),
    ...snapshot.questions.map((q) => q.anchors),
    ...(kind === 'final'
      ? [
          ...(snapshot.decisions ?? []).map((d) => d.anchors),
          ...(snapshot.actions ?? []).map((a) => a.anchors),
          ...(snapshot.deferred ?? []).map((d) => d.anchors),
          ...(snapshot.bestPractices ?? []).map((b) => b.anchors),
        ]
      : []),
  ]);
  for (const a of allRefs) if (!anchorMap.has(a)) warnings.push(`anchors 에 없는 근거 id: ${a}`);
  if (opts.design) return makeMeetingDesign(snapshot, pre, opts, getDeckDesign(opts.design), warnings, anchorMap);

  const pptx = new PptxGenJS();
  let W = 11.69;
  let H = 8.27;
  if (opts.layout === '16:9') {
    pptx.layout = 'LAYOUT_WIDE';
    W = 13.33;
    H = 7.5;
  } else {
    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: W, height: H });
    pptx.layout = 'A4_LANDSCAPE';
  }
  // 좌우 여백 0.45in — 머리·꼬리·표가 같은 세로 기준선에 선다
  const X0 = 0.45;
  const contentW = W - X0 * 2;

  const slides: MeetingSlideInfo[] = [];
  const overflow: OverflowEstimate[] = [];
  const badge = badgeText(snapshot.status);

  const check = (no: number, code: string, ref: string, field: string, text: string | undefined, widthIn: number, maxLines: number, fontPt = FONT_PT) => {
    if (!text) return;
    const capacity = capacityOf(widthIn, fontPt, maxLines);
    if (textUnits(text) > capacity) overflow.push({ slide: no, code, ref, field, chars: text.length, capacity });
  };

  const confirmed = snapshot.status.label === '확정';
  /** 머리 = 키커(장 번호·회차) + 제목(라벨) + 요점 줄(선택) · 오른쪽 위 상태 배지 · 꼬리 = 가는 선 + 사업장·기준일·쪽 */
  const coverPanelX = W * 0.66;
  const newSlide = (code: string, title: string, anchors: string[], lead?: string, cover?: string): { slide: Slide; no: number } => {
    const slide = pptx.addSlide();
    const no = slides.length + 1;
    slides.push({ no, code, title, anchors });
    slide.background = { color: T.colors.bg };
    const label = title.replace(/^[PF]\d+\s*/, '');
    if (cover) {
      // 카탈로그 1 표지 — 오른쪽 1/3 남색 패널을 먼저 깔고(배지가 그 위에 온다), 큰 제목이 title 도형
      slide.addShape(pptx.ShapeType.rect, { x: coverPanelX, y: 0, w: W - coverPanelX, h: H, fill: { color: T.colors.primary }, line: { color: T.colors.primary, width: 0 } });
      slide.addText(cover, { objectName: 'title', x: 0.7, y: 2.3, w: coverPanelX - 1.2, h: 0.9, fontFace, fontSize: T.typeScale.cover, bold: true, color: T.colors.primary });
    } else {
      slide.addText(`${code}  ·  ${snapshot.cycle}`, { x: 0.45, y: 0.28, w: W - 2.6, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, color: T.colors.accent, charSpacing: 0.5 });
      slide.addText(label, { objectName: 'title', x: 0.45, y: 0.55, w: W - 2.6, h: 0.55, fontFace, fontSize: T.typeScale.title, bold: true, color: T.colors.primary });
      if (lead) slide.addText(lead, { objectName: 'lead', x: 0.45, y: 1.08, w: W - 0.9, h: 0.36, fontFace, fontSize: T.typeScale.lead, color: T.colors.muted, valign: 'top' });
    }
    slide.addText(badge, {
      objectName: 'badge', x: W - 1.65, y: 0.32, w: 1.2, h: 0.34, fontFace, fontSize: T.typeScale.kicker, bold: true, align: 'center', valign: 'middle',
      color: confirmed ? T.colors.bg : T.colors.caution,
      fill: { color: confirmed ? T.colors.positive : T.colors.bg },
      line: { color: confirmed ? T.colors.positive : T.colors.caution, width: 1 },
      rectRadius: 0.17, shape: pptx.ShapeType.roundRect,
    });
    // 표지는 꼬리를 흰 영역(패널 왼쪽)에만 둔다 — 선이 남색 패널을 가로지르지 않게
    const footW = (cover ? coverPanelX - 0.45 : W - 0.45) - 0.45;
    slide.addShape(pptx.ShapeType.line, { x: 0.45, y: H - 0.5, w: footW, h: 0, line: { color: T.colors.line, width: 0.5 } });
    slide.addText(`${snapshot.site}  ·  위험성평가 회의`, { x: 0.45, y: H - 0.46, w: footW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    slide.addText(
      `데이터 기준 ${snapshot.basisDate} · ${snapshot.revision ?? '-'} · ${MEETING_TEMPLATE_VERSION}   ${no}`,
      { x: 0.45 + footW / 2, y: H - 0.46, w: footW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted, align: 'right' },
    );
    const notes = anchors.length
      ? ['근거 anchor:', ...anchors.map((a) => {
          const m = anchorMap.get(a);
          return `- ${a}${m ? ` — ${[m.source, m.location].filter(Boolean).join(' ')}` : ''}`;
        })].join('\n')
      : '근거 anchor: 없음';
    slide.addNotes(notes);
    return { slide, no };
  };

  /** 가는 선 표(rules.json tables.styles.line) — 머리행 옅은 채움 + 아래 굵은 선, 안쪽 가로선만, 세로선 없음, 맨 아래 굵은 선 */
  const lineTable = (rows: Cell[][]): Cell[][] =>
    rows.map((row, ri) =>
      row.map((cell) => {
        const top = ri === 0 ? RULE : ri === 1 ? RULE : INNER;
        const bottom = ri === 0 || ri === rows.length - 1 ? RULE : INNER;
        return { ...cell, options: { color: T.colors.text, margin: [3, 5, 3, 5], ...cell.options, border: [top, NONE, bottom, NONE] } };
      }),
    );
  const table = (slide: Slide, rows: Cell[][], colW: number[], y: number) => {
    slide.addTable(lineTable(rows) as never, { x: 0.45, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace, fontSize: FONT_PT, valign: 'middle' });
  };
  const head = (labels: string[]): Cell[] => labels.map((t) => ({ text: t, options: { bold: true, fill: HEAD_FILL, color: T.colors.primary, align: 'center' } }));
  const c = (t: string | number | undefined | null): Cell => ({ text: t === undefined || t === null || t === '' ? '-' : String(t) });
  /** 상태 칸 — 색은 뜻에만: 완료 초록 · 미완료·기한초과 빨강 · 재조치 주황 */
  const statusColor = (st?: string) => (st === '완료' ? T.colors.positive : st === '미완료' || st === '기한초과' ? T.colors.negative : st === '재조치' ? T.colors.caution : T.colors.text);
  const sc = (st?: string): Cell => ({ text: st || '-', options: { bold: !!st, color: statusColor(st), align: 'center' } });
  /** 열 폭 비율을 본문 폭에 맞춰 늘린다 */
  const fit = (ratio: number[]) => {
    const sum = ratio.reduce((a, b) => a + b, 0);
    return ratio.map((r) => (r / sum) * contentW);
  };
  /** 빈 장 안내 — 표 대신 옅은 띠 한 줄 */
  const emptyNote = (slide: Slide, text: string, y = 1.75) =>
    slide.addText(text, { x: X0, y, w: contentW, h: 0.7, fontFace, fontSize: T.typeScale.body, color: T.colors.muted, align: 'center', valign: 'middle', fill: { color: T.colors.band } });

  // P1 표지
  if (pre) {
    // 카탈로그 1 표지 — 왼쪽 제목·메타, 오른쪽 1/3 남색 패널(회차·상태)
    const { slide } = newSlide('P1', 'P1 표지', [], undefined, '회의 전 검토안');
    const panelX = coverPanelX;
    slide.addText([
      { text: '회차\n', options: { fontSize: T.typeScale.kicker, color: 'A6C4EE', bold: true } },
      { text: `${snapshot.cycle}\n\n`, options: { fontSize: T.typeScale.h2 + 4, color: T.colors.bg, bold: true } },
      { text: '상태\n', options: { fontSize: T.typeScale.kicker, color: 'A6C4EE', bold: true } },
      { text: badge, options: { fontSize: T.typeScale.h2 + 4, color: T.colors.bg, bold: true } },
    ], { x: panelX + 0.45, y: H * 0.38, w: W - panelX - 0.9, h: 2.4, fontFace, valign: 'top' });
    slide.addText('위험성평가 회의', { x: 0.7, y: 1.9, w: panelX - 1.2, h: 0.4, fontFace, fontSize: T.typeScale.h2, bold: true, color: T.colors.accent });
    slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 3.45, w: 1.0, h: 0, line: { color: T.colors.accent, width: 2 } });
    const meta: [string, string][] = [
      ['사업장', snapshot.site],
      ['회의 예정일', snapshot.meetingDate ?? '-'],
      ['데이터 기준일', snapshot.basisDate],
      ['적용기간', snapshot.period ?? '-'],
      ['작성자', snapshot.author ?? '-'],
    ];
    slide.addText(
      meta.flatMap(([k, v]) => [
        { text: `${k}   `, options: { color: T.colors.muted, fontSize: T.typeScale.body } },
        { text: `${v}\n`, options: { color: T.colors.text, fontSize: T.typeScale.body + 1, bold: true } },
      ]),
      { x: 0.7, y: 3.7, w: panelX - 1.2, h: 2.4, fontFace, valign: 'top', lineSpacingMultiple: 1.5 },
    );
  }

  // P2 회의 개요
  if (pre) {
    // 카탈로그 2 목차형 — 왼쪽 큰 번호 의제 목록, 오른쪽 참석 예정 표 + 안전 사례 상자
    const { slide } = newSlide('P2', 'P2 회의 개요', []);
    const agenda = snapshot.agenda?.length
      ? snapshot.agenda
      : ['전회 조치 이행 확인', '신규·변경 위험요인 검토', '근로자 의견 검토', '결정 필요 사항'];
    const leftW = contentW * 0.55;
    const rowH = Math.min(0.8, (H - 2.6) / Math.max(agenda.length, 1));
    slide.addText('의제', { x: X0, y: 1.3, w: leftW, h: 0.35, fontFace, fontSize: T.typeScale.h2, bold: true, color: T.colors.primary });
    agenda.forEach((a, i) => {
      const y = 1.8 + i * rowH;
      slide.addText(String(i + 1).padStart(2, '0'), { x: X0, y, w: 0.8, h: rowH - 0.1, fontFace, fontSize: 26, bold: true, color: T.colors.accent, valign: 'middle' });
      slide.addText(a, { x: X0 + 0.9, y, w: leftW - 1.0, h: rowH - 0.1, fontFace, fontSize: T.typeScale.h2, color: T.colors.text, valign: 'middle' });
      slide.addShape(pptx.ShapeType.line, { x: X0, y: y + rowH - 0.05, w: leftW - 0.2, h: 0, line: { color: T.colors.line, width: 0.5 } });
    });
    const rx = X0 + leftW + 0.3;
    const rw = contentW - leftW - 0.3;
    slide.addText('참석 예정', { x: rx, y: 1.3, w: rw, h: 0.35, fontFace, fontSize: T.typeScale.h2, bold: true, color: T.colors.primary });
    const planned = snapshot.attendees?.planned ?? [];
    const rows: Cell[][] = [head(['역할', '참석 예정자'])];
    for (const a of planned) rows.push([c(a.role), c(a.name)]);
    if (!planned.length) rows.push([c('참석 예정자 미입력'), c('')]);
    slide.addTable(lineTable(rows) as never, { x: rx, y: 1.8, w: rw, colW: [rw * 0.45, rw * 0.55], fontFace, fontSize: FONT_PT, valign: 'middle' });
    const caseY = H - 2.3;
    slide.addShape(pptx.ShapeType.rect, { x: rx, y: caseY, w: rw, h: 1.55, fill: { color: T.colors.band }, line: { color: T.colors.band, width: 0 } });
    slide.addShape(pptx.ShapeType.rect, { x: rx, y: caseY, w: 0.06, h: 1.55, fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 } });
    slide.addText([
      { text: '안전 사례\n', options: { bold: true, color: T.colors.primary, fontSize: T.typeScale.body } },
      { text: snapshot.safetyCase ?? '(선택 — 비워 둠)', options: { color: snapshot.safetyCase ? T.colors.text : T.colors.muted, fontSize: T.typeScale.body } },
    ], { x: rx + 0.2, y: caseY + 0.1, w: rw - 0.3, h: 1.35, fontFace, valign: 'top' });
  }

  // P3 한눈 요약
  if (pre) {
    const count = (st: string) => snapshot.prior.filter((p) => p.status === st).length;
    const candidates = snapshot.hazards.filter((h) => h.kind === 'new' || h.kind === 'changed').length;
    const unchanged = snapshot.hazards.filter((h) => h.kind === 'unchanged').length;
    // 카탈로그 5 KPI 큰 숫자 3개 — 전회 조치(C) · 신규·변경 후보(P) · 결정 필요(A). 강조는 한 곳: 못 끝낸 전회 조치가 있으면 그 카드
    const total = snapshot.prior.length;
    const done = count('완료');
    const open = total - done;
    const questions = snapshot.questions.length;
    const lead = `전회 조치 ${total}건 중 ${done}건 완료 · 신규·변경 후보 ${candidates}건 · 결정 필요 ${questions}건`;
    const { slide } = newSlide('P3', 'P3 한눈 요약', uniq([...snapshot.prior.map((p) => p.anchors), ...snapshot.hazards.map((h) => h.anchors)]), lead);
    const gap = 0.3;
    const cardW = (W - 0.9 - gap * 2) / 3;
    const cardY = 1.75;
    const cardH = 4.0;
    const cards: { kicker: string; big: string; unit: string; note: string; hot: boolean }[] = [
      {
        kicker: '확인 · 전회 조치',
        big: total ? `${done}/${total}` : '0',
        unit: total ? '완료' : '건',
        note: total ? `미완료 ${count('미완료')} · 기한초과 ${count('기한초과')} · 재조치 ${count('재조치')}` : '전회 항목 없음',
        hot: open > 0,
      },
      { kicker: '평가 · 신규·변경 후보', big: String(candidates), unit: '건', note: `변동 없음 ${unchanged}건`, hot: false },
      { kicker: '개선 · 결정 필요', big: String(questions), unit: '건', note: questions ? '이번 회의에서 정할 것' : '정할 것 없음', hot: false },
    ];
    cards.forEach((k, i) => {
      const x = 0.45 + i * (cardW + gap);
      const edge = k.hot ? T.colors.negative : T.colors.line;
      slide.addShape(pptx.ShapeType.rect, { x, y: cardY, w: cardW, h: cardH, fill: { color: k.hot ? 'FBF1EF' : T.colors.bg }, line: { color: edge, width: k.hot ? 1.5 : 0.75 } });
      slide.addShape(pptx.ShapeType.rect, { x, y: cardY, w: cardW, h: 0.08, fill: { color: k.hot ? T.colors.negative : T.colors.primary }, line: { color: k.hot ? T.colors.negative : T.colors.primary, width: 0 } });
      slide.addText(k.kicker, { x: x + 0.3, y: cardY + 0.3, w: cardW - 0.6, h: 0.35, fontFace, fontSize: T.typeScale.body, bold: true, color: T.colors.muted });
      slide.addText([
        { text: k.big, options: { fontSize: T.typeScale.kpi, bold: true, color: k.hot ? T.colors.negative : T.colors.primary } },
        { text: ` ${k.unit}`, options: { fontSize: T.typeScale.h2, bold: true, color: T.colors.muted } },
      ], { x: x + 0.3, y: cardY + 0.8, w: cardW - 0.6, h: 1.8, fontFace, valign: 'middle' });
      slide.addShape(pptx.ShapeType.line, { x: x + 0.3, y: cardY + 2.85, w: cardW - 0.6, h: 0, line: { color: T.colors.line, width: 0.5 } });
      slide.addText(k.note, { x: x + 0.3, y: cardY + 3.0, w: cardW - 0.6, h: 0.7, fontFace, fontSize: T.typeScale.body, color: T.colors.text, valign: 'top' });
    });
    // 결론 바 — 척도와 비교 기준
    slide.addText(
      [
        { text: '척도  ', options: { bold: true, color: 'A6C4EE' } },
        { text: `${snapshot.scaleName}`, options: { bold: true, color: T.colors.bg } },
        { text: '     회차 대비 증감은 같은 척도일 때만 비교합니다', options: { color: T.colors.bg } },
      ],
      { x: 0.45, y: cardY + cardH + 0.35, w: W - 0.9, h: 0.6, fontFace, fontSize: T.typeScale.body, fill: { color: T.colors.primary }, valign: 'middle', inset: 0.25 },
    );
  }

  // P4 전회 이행 현황(6행씩)
  if (pre) {
    const colW = fit([0.6, 2.0, 0.45, 0.45, 0.8, 1.6, 1.0, 0.95, 0.7, 1.5, 1.0]);
    const pages: PriorItem[][] = [];
    for (let i = 0; i < snapshot.prior.length; i += P4_ROWS_PER_SLIDE) pages.push(snapshot.prior.slice(i, i + P4_ROWS_PER_SLIDE));
    if (!pages.length) pages.push([]);
    pages.forEach((items, pi) => {
      const title = pi === 0 ? 'P4 전회 이행 현황' : 'P4 전회 이행 현황 (계속)';
      const { slide, no } = newSlide('P4', title, uniq(items.map((p) => p.anchors)));
      const rows: Cell[][] = [head(['ID', '위험요인', '빈도', '강도', '등급', '전회 대책', '1차 조치자', '기한', '상태', '조치결과', '2차 확인자'])];
      for (const p of items) {
        rows.push([c(p.id), c(p.hazard), c(p.frequency), c(p.severity), c(p.grade), c(p.measure), c(p.owner), c(p.due), sc(p.status), c(p.result), c(p.verifier)]);
        check(no, 'P4', p.id, 'hazard', p.hazard, colW[1], 4);
        check(no, 'P4', p.id, 'measure', p.measure, colW[5], 4);
        check(no, 'P4', p.id, 'result', p.result, colW[9], 4);
      }
      if (!items.length) rows.push([c('전회 항목 없음'), ...Array.from({ length: 10 }, () => c(''))]);
      table(slide, rows, colW, 1.15);
    });
  }

  // P5 조치 전·후(완료 항목당 1장)
  if (pre) {
    const done = snapshot.prior.filter((p) => p.status === '완료');
    if (!done.length) emptyNote(newSlide('P5', 'P5 조치 전·후 — 해당 항목 없음', []).slide, '전회 조치 중 완료된 항목이 없어 전·후 비교 장이 없습니다');
    for (const p of done) {
      // 카탈로그 6 As-Is/To-Be — 왼쪽 회색 머리 「조치 전」, 오른쪽 남색 머리 「조치 후」, 가운데 화살표
      const { slide, no } = newSlide('P5', `P5 조치 전·후 — ${p.id}`, uniq([p.anchors]), `${p.id}  ${p.hazard}`);
      check(no, 'P5', p.id, 'hazard', p.hazard, contentW, 1, T.typeScale.lead);
      const gapX = 0.5;
      const boxW = (contentW - gapX) / 2;
      const photoY = 2.05;
      const photoH = H - 4.6;
      (['before', 'after'] as const).forEach((side, i) => {
        const x = X0 + i * (boxW + gapX);
        const headFill = side === 'before' ? T.colors.line : T.colors.primary;
        slide.addText(side === 'before' ? '조치 전' : '조치 후', { x, y: 1.6, w: boxW, h: 0.4, fontFace, fontSize: T.typeScale.body, bold: true, align: 'center', valign: 'middle', color: side === 'before' ? T.colors.primary : T.colors.bg, fill: { color: headFill } });
        const photo = snapshot.photos.find((ph) => ph.itemId === p.id && ph.side === side);
        if (photo) {
          slide.addImage({ data: `${photo.mime ?? 'image/png'};base64,${photo.data}`, x, y: photoY, w: boxW, h: photoH, sizing: { type: 'contain', w: boxW, h: photoH } });
        } else {
          slide.addText('사진 없음', { x, y: photoY, w: boxW, h: photoH, fontFace, fontSize: T.typeScale.h2, align: 'center', valign: 'middle', color: T.colors.muted, fill: { color: T.colors.band }, line: { color: T.colors.line, width: 0.5, dashType: 'dash' } });
        }
      });
      slide.addText('▶', { x: X0 + boxW, y: photoY + photoH / 2 - 0.25, w: gapX, h: 0.5, fontFace, fontSize: 18, color: T.colors.accent, align: 'center', valign: 'middle' });
      const legalY = photoY + photoH + 0.15;
      slide.addText([
        { text: '법조  ', options: { bold: true, color: T.colors.caution } },
        { text: p.legal ?? '-', options: { color: T.colors.text } },
      ], { x: X0, y: legalY, w: contentW, h: 0.32, fontFace, fontSize: T.typeScale.body, valign: 'middle' });
      const rows: Cell[][] = [
        head(['조치 결과', '효과', '잔여 위험', '확인']),
        [c(p.result), c(p.effect), c(p.residual), c(p.verifier)],
      ];
      const colW = fit([2, 1, 1, 1]);
      table(slide, rows, colW, legalY + 0.42);
      check(no, 'P5', p.id, 'result', p.result, colW[0], 3);
    }
  }

  // P6 신규·변경 후보(카드 2×2)
  if (pre) {
    const cands = snapshot.hazards.filter((h) => h.kind === 'new' || h.kind === 'changed');
    const pages: HazardItem[][] = [];
    for (let i = 0; i < cands.length; i += P6_CARDS_PER_SLIDE) pages.push(cands.slice(i, i + P6_CARDS_PER_SLIDE));
    if (!pages.length) pages.push([]);
    pages.forEach((items, pi) => {
      const { slide, no } = newSlide('P6', pi === 0 ? 'P6 신규·변경 후보' : 'P6 신규·변경 후보 (계속)', uniq(items.map((h) => h.anchors)));
      if (!items.length) emptyNote(slide, '이번 회차 신규·변경 위험요인 후보가 없습니다');
      // 카드 2×2 — 머리 띠(신규/변경 칩 · 위험성 칩) + 제목(상황) + 라벨·값 본문. ID 는 카드 아래 작은 글씨(긴 UUID 가 제목을 차지하지 않게)
      const gapC = 0.3;
      const cw = (contentW - gapC) / 2;
      const top = 1.2;
      const ch = (H - 0.75 - top - gapC) / 2;
      items.forEach((h, i) => {
        const x = X0 + (i % 2) * (cw + gapC);
        const y = top + Math.floor(i / 2) * (ch + gapC);
        const m = h.measures ?? {};
        const isNew = h.kind === 'new';
        const kindColor = isNew ? T.colors.accent : T.colors.caution;
        slide.addShape(pptx.ShapeType.rect, { x, y, w: cw, h: ch, fill: { color: T.colors.bg }, line: { color: T.colors.line, width: 0.75 } });
        slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h: ch, fill: { color: kindColor }, line: { color: kindColor, width: 0 } });
        slide.addText(isNew ? '신규' : '변경', { x: x + 0.25, y: y + 0.15, w: 0.65, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, align: 'center', valign: 'middle', color: T.colors.bg, fill: { color: kindColor } });
        const r = risk(h.frequency, h.severity);
        slide.addText(`빈도 ${h.frequency ?? '-'} × 강도 ${h.severity ?? '-'} = ${r ?? '-'}  ·  ${h.grade ?? '-'}`, { x: x + 1.0, y: y + 0.15, w: cw - 1.2, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, color: T.colors.primary, valign: 'middle' });
        slide.addText(h.situation, { x: x + 0.25, y: y + 0.5, w: cw - 0.45, h: 0.5, fontFace, fontSize: T.typeScale.h2 - 1, bold: true, color: T.colors.primary, valign: 'top' });
        const lab = (k: string, v?: string) => [
          { text: `${k}  `, options: { bold: true, color: T.colors.muted } },
          { text: `${v || '-'}\n`, options: { color: T.colors.text } },
        ];
        slide.addText(
          [
            ...lab('원인', h.cause),
            ...lab('결과', h.consequence),
            ...lab('대책·기술', m.technical),
            ...lab('대책·교육', m.education),
            ...lab('대책·관리', m.management),
          ],
          { x: x + 0.25, y: y + 1.0, w: cw - 0.45, h: ch - 1.35, fontFace, fontSize: FONT_PT, valign: 'top', lineSpacingMultiple: 1.15 },
        );
        slide.addText(`${h.id}  ·  출처 ${h.sourceType ?? '-'}${h.tags?.length ? `  ·  ${h.tags.join('·')}` : ''}`, { x: x + 0.25, y: y + ch - 0.33, w: cw - 0.45, h: 0.25, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted, valign: 'middle' });
        for (const f of ['situation', 'cause', 'consequence'] as const) check(no, 'P6', h.id, f, h[f], cw - 0.45, 2);
      });
    });
  }

  // P7 근로자 의견
  if (pre) {
    paginate(snapshot.opinions, ROWS_PER_SLIDE.P7).forEach((items, pi) => {
      const { slide, no } = newSlide('P7', pi === 0 ? 'P7 근로자 의견' : 'P7 근로자 의견 (계속)', uniq(items.map((o) => o.anchors)));
      const colW = [0.8, 2.0, contentW - 4.6, 1.8];
      const rows: Cell[][] = [head(['ID', '의견자', '의견', '관련 ID'])];
      for (const o of items) {
        rows.push([c(o.id), c(o.from), c(o.text), c((o.relatedIds ?? []).join(', '))]);
        check(no, 'P7', o.id, 'text', o.text, colW[2], 3);
      }
      if (!items.length) rows.push([c('의견 없음'), c(''), c(''), c('')]);
      table(slide, rows, colW, 1.15);
    });
  }

  // P8 회차 대비 변화 — 같은 척도 ID 일 때만 증감
  const changes: MeetingChange[] = [];
  if (pre) {
    const colW = [0.8, 3.6, 1.6, 1.6, 1.6, contentW - 9.2];
    const rowsAll: { cells: Cell[]; anchors: (string[] | undefined)[]; p: PriorItem }[] = [];
    for (const { p, cur, pr, cr, delta } of priorChanges(snapshot)) {
      changes.push({ id: p.id, priorRisk: pr, currentRisk: cr, delta });
      rowsAll.push({
        p,
        anchors: [p.anchors, cur?.anchors],
        cells: [
          c(p.id), c(p.hazard), c(pr !== null ? `${pr} (${p.grade ?? '-'})` : p.grade), c(cr !== null ? `${cr} (${cur?.grade ?? '-'})` : cur?.grade),
          typeof delta === 'number'
            ? { text: delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '0', options: { bold: delta !== 0, align: 'center', color: delta > 0 ? T.colors.negative : delta < 0 ? T.colors.positive : T.colors.muted } }
            : { text: delta, options: { align: 'center', color: T.colors.muted } },
          c(p.scaleId === snapshot.scaleId ? snapshot.scaleName : `전회 ${p.scaleId ?? '미상'}`),
        ],
      });
    }
    paginate(rowsAll, ROWS_PER_SLIDE.P8).forEach((page, pi) => {
      const rows: Cell[][] = [head(['ID', '위험요인', '전회 위험도', '현재 위험도', '증감', '척도']), ...page.map((x) => x.cells)];
      if (!page.length) rows.push([c('비교 항목 없음'), c(''), c(''), c(''), c(''), c('')]);
      const { slide, no } = newSlide('P8', pi === 0 ? 'P8 회차 대비 변화' : 'P8 회차 대비 변화 (계속)', uniq(page.flatMap((x) => x.anchors)));
      for (const { p } of page) check(no, 'P8', p.id, 'hazard', p.hazard, colW[1], 2);
      table(slide, rows, colW, 1.15);
    });
  }

  // P9 결정 필요 사항
  if (pre) {
    const prMap = new Map<string, string[] | undefined>([
      ...snapshot.prior.map((p) => [p.id, p.anchors] as [string, string[] | undefined]),
      ...snapshot.hazards.map((h) => [h.id, h.anchors] as [string, string[] | undefined]),
    ]);
    const colW = [0.8, contentW - 7.3, 1.6, 2.4, 2.5];
    paginate(snapshot.questions, ROWS_PER_SLIDE.P9).forEach((items, pi) => {
      const anchors = uniq(items.flatMap((q) => [q.anchors, ...(q.targetIds ?? []).map((t) => prMap.get(t))]));
      const { slide, no } = newSlide('P9', pi === 0 ? 'P9 결정 필요 사항' : 'P9 결정 필요 사항 (계속)', anchors);
      const rows: Cell[][] = [head(['ID', '질문', '대상 ID', '선택지', '결정'])];
      for (const q of items) {
        // 결정 칸은 회의에서 적는 자리 — 옅은 채움으로 기입란임을 보인다
        rows.push([c(q.id), c(q.question), c((q.targetIds ?? []).join(', ')), c((q.options ?? []).join(' / ')), { text: '', options: { fill: { color: T.colors.band } } }]);
        check(no, 'P9', q.id, 'question', q.question, colW[1], 3);
      }
      if (!items.length) rows.push([c('결정 필요 사항 없음'), c(''), c(''), c(''), { text: '' }]);
      table(slide, rows, colW, 1.15);
    });
  }

  // P10 근거 목록
  if (pre) {
    paginate(snapshot.anchors, ROWS_PER_SLIDE.P10).forEach((items, pi) => {
      const { slide } = newSlide('P10', pi === 0 ? 'P10 근거 목록' : 'P10 근거 목록 (계속)', items.map((a) => a.id));
      const rows: Cell[][] = [head(['근거 ID', '출처', '위치'])];
      for (const a of items) rows.push([c(a.id), c(a.source), c(a.location)]);
      if (!items.length) rows.push([c('근거 없음'), c(''), c('')]);
      table(slide, rows, [2.0, 5.0, contentW - 7.0], 1.15);
    });
  }

  const carryOver = pre ? undefined : buildFinal();

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return {
    ok: true,
    bytes: new Uint8Array(out as ArrayBuffer),
    slides,
    overflowEstimates: overflow,
    ...(pre ? { changes } : { carryOver }),
    warnings,
  };

  // ───── 회의 후 확정본 F1~F8 ─────
  function buildFinal(): PriorItem[] {
    const hzMap = new Map(snapshot.hazards.map((h) => [h.id, h]));
    const prMap = new Map(snapshot.prior.map((p) => [p.id, p]));
    const refAnchors = (id: string) => uniq([prMap.get(id)?.anchors, hzMap.get(id)?.anchors]);
    const hazardOf = (id: string, given?: string) => given ?? hzMap.get(id)?.situation ?? prMap.get(id)?.hazard;
    const decisions = snapshot.decisions ?? [];
    const deferred = snapshot.deferred ?? [];
    const best = snapshot.bestPractices ?? [];
    const actions = actionsByDue(snapshot);

    // F1 표지
    {
      // 카탈로그 1 표지 — P1 과 같은 틀, 오른쪽 패널에 회차·확정 버전·다음 적용기간
      const { slide } = newSlide('F1', 'F1 표지', [], undefined, '회의 후 확정본');
      const panelX = coverPanelX;
      slide.addText([
        { text: '회차\n', options: { fontSize: T.typeScale.kicker, color: 'A6C4EE', bold: true } },
        { text: `${snapshot.cycle}\n\n`, options: { fontSize: T.typeScale.h2 + 4, color: T.colors.bg, bold: true } },
        { text: '확정 버전\n', options: { fontSize: T.typeScale.kicker, color: 'A6C4EE', bold: true } },
        { text: `${badge}\n\n`, options: { fontSize: T.typeScale.h2 + 4, color: T.colors.bg, bold: true } },
        { text: '다음 적용기간\n', options: { fontSize: T.typeScale.kicker, color: 'A6C4EE', bold: true } },
        { text: snapshot.nextPeriod ?? '-', options: { fontSize: T.typeScale.h2, color: T.colors.bg, bold: true } },
      ], { x: panelX + 0.45, y: H * 0.3, w: W - panelX - 0.9, h: 3.2, fontFace, valign: 'top' });
      slide.addText('위험성평가 회의', { x: 0.7, y: 1.9, w: panelX - 1.2, h: 0.4, fontFace, fontSize: T.typeScale.h2, bold: true, color: T.colors.accent });
      slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 3.45, w: 1.0, h: 0, line: { color: T.colors.accent, width: 2 } });
      const meta: [string, string][] = [
        ['사업장', snapshot.site],
        ['실제 회의일', snapshot.actualMeetingDate ?? '-'],
        ['데이터 기준일', snapshot.basisDate],
        ['작성자', snapshot.author ?? '-'],
      ];
      slide.addText(
        meta.flatMap(([k, v]) => [
          { text: `${k}   `, options: { color: T.colors.muted, fontSize: T.typeScale.body } },
          { text: `${v}\n`, options: { color: T.colors.text, fontSize: T.typeScale.body + 1, bold: true } },
        ]),
        { x: 0.7, y: 3.7, w: panelX - 1.2, h: 2.4, fontFace, valign: 'top', lineSpacingMultiple: 1.5 },
      );
    }

    // F2 참석(예정 vs 실제)
    {
      const { slide } = newSlide('F2', 'F2 참석', []);
      const isRep = (a: MeetingAttendee) => a.workerRepresentative ?? a.role.includes('근로자대표');
      // 2단 비교 — 예정 / 실제 표, 아래 근로자대표 참여 결론 바(참여 = 초록, 불참 = 빨강)
      const gapF = 0.4;
      const half = (contentW - gapF) / 2;
      (['planned', 'actual'] as const).forEach((k, i) => {
        const list = snapshot.attendees?.[k] ?? [];
        const label = k === 'planned' ? '참석 예정' : '실제 참석';
        const rows: Cell[][] = [head(['역할', label])];
        for (const a of list) rows.push([c(a.role), c(a.name)]);
        if (!list.length) rows.push([c(`${label} 미입력`), c('')]);
        slide.addTable(lineTable(rows) as never, { x: X0 + i * (half + gapF), y: 1.3, w: half, colW: [half * 0.45, half * 0.55], fontFace, fontSize: FONT_PT, valign: 'middle' });
      });
      const repActual = (snapshot.attendees?.actual ?? []).some(isRep);
      const repColor = repActual ? T.colors.positive : T.colors.negative;
      slide.addText(`근로자대표 참여: ${repActual ? '예' : '아니오'}`, { x: X0, y: H - 1.35, w: contentW, h: 0.55, fontFace, fontSize: T.typeScale.body + 1, bold: true, color: T.colors.bg, fill: { color: repColor }, valign: 'middle', inset: 0.25 });
    }

    // F3 확정 결정
    paginate(decisions, ROWS_PER_SLIDE.F3).forEach((items, pi) => {
      const anchors = uniq(items.flatMap((d) => [d.anchors, ...(d.targetIds ?? []).map(refAnchors)]));
      const { slide, no } = newSlide('F3', pi === 0 ? 'F3 확정 결정' : 'F3 확정 결정 (계속)', anchors);
      const colW = [0.8, 1.0, 1.6, contentW - 7.4, 4.0];
      const rows: Cell[][] = [head(['ID', '질문 ID', '대상 ID', '결정', '사유'])];
      for (const d of items) {
        rows.push([c(d.id), c(d.questionId), c((d.targetIds ?? []).join(', ')), c(d.decision), c(d.reason)]);
        check(no, 'F3', d.id, 'decision', d.decision, colW[3], 3);
        check(no, 'F3', d.id, 'reason', d.reason, colW[4], 3);
      }
      if (!items.length) rows.push([c('확정 결정 없음'), c(''), c(''), c(''), c('')]);
      table(slide, rows, colW, 1.15);
    });

    // F4 조치 계획(기한순, 6행씩)
    {
      const colW = [0.8, 0.9, 2.4, contentW - 8.5, 1.6, 1.0, 1.8];
      const pages: MeetingAction[][] = [];
      for (let i = 0; i < actions.length; i += P4_ROWS_PER_SLIDE) pages.push(actions.slice(i, i + P4_ROWS_PER_SLIDE));
      if (!pages.length) pages.push([]);
      pages.forEach((items, pi) => {
        const anchors = uniq(items.flatMap((a) => [a.anchors, refAnchors(a.targetId ?? a.id)]));
        const { slide, no } = newSlide('F4', pi === 0 ? 'F4 조치 계획' : 'F4 조치 계획 (계속)', anchors);
        const rows: Cell[][] = [head(['ID', '대상 ID', '위험요인', '대책', '1차 조치자', '기한', '2차 확인자'])];
        for (const a of items) {
          const tid = a.targetId ?? a.id;
          const hz = hazardOf(tid, a.hazard);
          rows.push([c(a.id), c(tid), c(hz), c(a.measure), c(a.owner), c(a.due), c(a.verifier)]);
          check(no, 'F4', a.id, 'hazard', hz, colW[2], 4);
          check(no, 'F4', a.id, 'measure', a.measure, colW[3], 4);
        }
        if (!items.length) rows.push([c('조치 계획 없음'), ...Array.from({ length: 6 }, () => c(''))]);
        table(slide, rows, colW, 1.15);
      });
    }

    // F5 보류·재평가
    paginate(deferred, ROWS_PER_SLIDE.F5).forEach((items, pi) => {
      const anchors = uniq(items.flatMap((d) => [d.anchors, refAnchors(d.id)]));
      const { slide, no } = newSlide('F5', pi === 0 ? 'F5 보류·재평가' : 'F5 보류·재평가 (계속)', anchors);
      const colW = [0.8, 3.6, contentW - 6.2, 1.8];
      const rows: Cell[][] = [head(['ID', '위험요인', '보류 사유', '재평가 기한'])];
      for (const d of items) {
        rows.push([c(d.id), c(hazardOf(d.id, d.hazard)), c(d.reason), c(d.reevaluateBy)]);
        check(no, 'F5', d.id, 'reason', d.reason, colW[2], 3);
      }
      if (!items.length) rows.push([c('보류 항목 없음'), c(''), c(''), c('')]);
      table(slide, rows, colW, 1.15);
    });

    // F6 우수 사례(선택 — 없으면 장을 만들지 않는다)
    if (best.length) {
      paginate(best, ROWS_PER_SLIDE.F6).forEach((items, pi) => {
        const { slide, no } = newSlide('F6', pi === 0 ? 'F6 우수 사례' : 'F6 우수 사례 (계속)', uniq(items.map((b) => b.anchors)));
        const colW = [0.8, 2.8, contentW - 3.6];
        const rows: Cell[][] = [head(['ID', '사례', '내용'])];
        for (const b of items) {
          rows.push([c(b.id), c(b.title), c(b.text)]);
          check(no, 'F6', b.id, 'text', b.text, colW[2], 4);
        }
        table(slide, rows, colW, 1.15);
      });
    }

    // F7 다음 회차로 넘길 목록 — prior[] 와 같은 키
    const carry: PriorItem[] = carryOverOf(snapshot, actions, warnings);
    {
      const colW = [0.8, 3.2, contentW - 7.2, 1.0, 1.0, 1.2];
      paginate(carry, ROWS_PER_SLIDE.F7).forEach((items, pi) => {
        const { slide, no } = newSlide('F7', pi === 0 ? 'F7 다음 회차로 넘길 목록' : 'F7 다음 회차로 넘길 목록 (계속)', uniq(items.map((p) => p.anchors)));
        const rows: Cell[][] = [head(['ID', '위험요인', '대책·비고', '기한', '상태', '척도'])];
        for (const p of items) {
          rows.push([c(p.id), c(p.hazard), c(p.measure ?? p.result), c(p.due), c(p.status), c(p.scaleId ?? '미상')]);
          check(no, 'F7', p.id, 'hazard', p.hazard, colW[1], 3);
        }
        if (!items.length) rows.push([c('이월 항목 없음'), c(''), c(''), c(''), c(''), c('')]);
        table(slide, rows, colW, 1.15);
      });
    }

    // F8 근거·버전
    paginate(snapshot.anchors, ROWS_PER_SLIDE.F8).forEach((items, pi) => {
      const { slide } = newSlide('F8', pi === 0 ? 'F8 근거·버전' : 'F8 근거·버전 (계속)', items.map((a) => a.id));
      slide.addText(
        `확정 버전 ${badge} · revision ${snapshot.revision ?? '-'} · template ${MEETING_TEMPLATE_VERSION} · 척도 ${snapshot.scaleName}(${snapshot.scaleId})`,
        { x: X0, y: 1.15, w: contentW, h: 0.32, fontFace, fontSize: T.typeScale.body, color: T.colors.muted },
      );
      const rows: Cell[][] = [head(['근거 ID', '출처', '위치'])];
      for (const a of items) rows.push([c(a.id), c(a.source), c(a.location)]);
      if (!items.length) rows.push([c('근거 없음'), c(''), c('')]);
      table(slide, rows, [2.0, 5.0, contentW - 7.0], 1.55);
    });

    return carry;
  }
}

/** P8 회차 대비 변화 — 같은 척도 ID 일 때만 증감. 기본 출력·프리셋 판이 같이 쓴다 */
export function priorChanges(snapshot: MeetingSnapshot): { p: PriorItem; cur?: HazardItem; pr: number | null; cr: number | null; delta: MeetingChange['delta'] }[] {
  const hz = new Map(snapshot.hazards.map((h) => [h.id, h]));
  return snapshot.prior.map((p) => {
    const cur = hz.get(p.hazardId ?? p.id);
    const pr = risk(p.frequency, p.severity);
    const cr = cur ? risk(cur.frequency, cur.severity) : null;
    let delta: MeetingChange['delta'];
    if (p.scaleId !== snapshot.scaleId) delta = '비교 안 함';
    else if (!cur) delta = '현재 평가 없음';
    else if (pr === null || cr === null) delta = '산정 불가';
    else delta = cr - pr;
    return { p, cur, pr, cr, delta };
  });
}

/** 기한 오름차순(기한 없는 행은 끝, 같은 기한은 입력 순서) — F4·F7 과 프리셋 판이 같이 쓴다 */
export function actionsByDue(snapshot: MeetingSnapshot): MeetingAction[] {
  return (snapshot.actions ?? [])
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      if (!x.a.due && !y.a.due) return x.i - y.i;
      if (!x.a.due) return 1;
      if (!y.a.due) return -1;
      return x.a.due < y.a.due ? -1 : x.a.due > y.a.due ? 1 : x.i - y.i;
    })
    .map((x) => x.a);
}

/** F7 다음 회차로 넘길 목록(prior[] 와 같은 키) — 그리기와 따로 계산해 기본 출력·프리셋 판이 같은 값을 돌려준다 */
export function carryOverOf(snapshot: MeetingSnapshot, actions: MeetingAction[], warnings: string[]): PriorItem[] {
  const hzMap = new Map(snapshot.hazards.map((h) => [h.id, h]));
  const prMap = new Map(snapshot.prior.map((p) => [p.id, p]));
  const refAnchors = (id: string) => uniq([prMap.get(id)?.anchors, hzMap.get(id)?.anchors]);
  const hazardOf = (id: string, given?: string) => given ?? hzMap.get(id)?.situation ?? prMap.get(id)?.hazard;
  const deferred = snapshot.deferred ?? [];
  const carry: PriorItem[] = [];
    // 척도는 지어내지 않는다(G4 Act on 5) — 이번 회차에 평가한 위험요인이면 이번 척도, 전회 항목이면 전회에 적힌 척도,
    // 그 밖(척도 미상)이면 scaleId 를 비워 두어 다음 회차 P8 이 「비교 안 함」 으로 처리하게 한다
    const scoreOf = (id: string) => {
      const h = hzMap.get(id);
      if (h) return { frequency: h.frequency, severity: h.severity, grade: h.grade, scaleId: snapshot.scaleId };
      const p = prMap.get(id);
      if (p) {
        if (!p.scaleId && (p.frequency !== undefined || p.severity !== undefined || p.grade !== undefined)) {
          warnings.push(`F7 이월 ${id}: 전회 척도가 적혀 있지 않아 척도를 비워 둡니다(다음 회차 증감 비교 안 함).`);
        }
        return { frequency: p.frequency, severity: p.severity, grade: p.grade, scaleId: p.scaleId };
      }
      return {};
    };
    // 같은 위험요인에 조치가 여러 건이면 모두 넘긴다(G4 Act on 13) — 둘째부터 id 에 「#n」 을 붙이고 hazardId 에 원래 ID 를 둔다
    const seen = new Map<string, number>();
    const push = (item: PriorItem) => {
      const base = item.id;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      if (n > 1) {
        let id = `${base}#${n}`;
        for (let k = n; carry.some((x) => x.id === id); k++) id = `${base}#${k + 1}`;
        item = { ...item, id, hazardId: base };
        warnings.push(`F7 이월 ${base}: 같은 위험요인의 이월이 여러 건이라 ${id} 로 넘깁니다.`);
      }
      if (!item.hazard) {
        warnings.push(`F7 이월 ${item.id}: 위험요인 글이 없다`);
        item.hazard = '(위험요인 미기재)';
      }
      carry.push(compact(item));
    };
    for (const a of actions) {
      const tid = a.targetId ?? a.id;
      push({
        id: tid,
        hazard: hazardOf(tid, a.hazard) ?? '',
        ...scoreOf(tid),
        measure: a.measure,
        owner: a.owner,
        due: a.due,
        status: '미완료',
        verifier: a.verifier,
        anchors: uniq([a.anchors, refAnchors(tid)]),
      });
    }
    for (const d of deferred) {
      push({
        id: d.id,
        hazard: hazardOf(d.id, d.hazard) ?? '',
        ...scoreOf(d.id),
        due: d.reevaluateBy,
        status: '미완료',
        result: `보류 — ${d.reason}`,
        anchors: uniq([d.anchors, refAnchors(d.id)]),
      });
    }
  return carry;
}

// ───── 프리셋 판(design) — 전 장 프리셋 머리(상태 배지 포함)·목록 부품 · 글 언어 ko-KR ─────
// 장 종류·순서·싣는 글·노트(근거 anchor)·결과 데이터(changes·carryOver)는 기본 출력과 같다.
// 표는 목록 부품으로 — 칸은 글 줄 수만큼 늘리고 본문 높이로 장을 나눈다(말줄임 없음).
async function makeMeetingDesign(
  snapshot: MeetingSnapshot,
  pre: boolean,
  opts: MeetingOptions,
  D: DeckDesign,
  warnings: string[],
  anchorMap: Map<string, MeetingAnchor>,
): Promise<MeetingPptxResult> {
  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const pptx = new PptxGenJS();
  const { S } = pickLayout(pptx, opts.layout, true);
  const kit: Kit = { pptx, d: D, s: S, fontFace };
  const X = D.head.left;
  const BW = D.head.right - D.head.left;
  const slides: MeetingSlideInfo[] = [];
  const overflow: OverflowEstimate[] = [];
  const badge = badgeText(snapshot.status);
  /** 장 나누기 여유(px) — PowerPoint 가 표 행을 추정보다 조금 높게 그린다(COM 실측 최대 4pt) */
  const SAFE = 12;
  const badgeTone = snapshot.status.label === '확정' ? ('positive' as const) : ('caution' as const);
  const v = (t: string | number | undefined | null) => (t === undefined || t === null || t === '' ? '-' : String(t));
  const titled = (t: string, pi: number, n: number) => (n > 1 ? `${t} (${pi + 1}/${n})` : t);
  const notesOf = (anchors: string[]) =>
    anchors.length
      ? ['근거 anchor:', ...anchors.map((a) => {
          const m = anchorMap.get(a);
          return `- ${a}${m ? ` — ${[m.source, m.location].filter(Boolean).join(' ')}` : ''}`;
        })].join('\n')
      : '근거 anchor: 없음';
  const page = (code: string, title: string, anchors: string[], lead?: string): Page => {
    const slide = koSlide(pptx.addSlide());
    const no = slides.length + 1;
    slides.push({ no, code, title: `${code} ${title}`, anchors });
    const box = drawHead(pptx, slide, D, S, {
      no,
      meta: `${code}  ·  위험성평가 회의  ·  ${snapshot.cycle}`,
      title,
      lead,
      fontFace,
      grow: true,
      badge: { text: badge, tone: badgeTone },
      footLeft: `${snapshot.site}  ·  위험성평가 회의`,
      footRight: `데이터 기준 ${snapshot.basisDate} · ${snapshot.revision ?? '-'} · ${MEETING_TEMPLATE_VERSION}   ${no}`,
    });
    (slide as unknown as { addNotes(t: string): void }).addNotes(notesOf(anchors));
    return { slide, no, box };
  };
  type Item = { row: ListRow; anchors: (string[] | undefined)[] };
  const list = (code: string, title: string, spec: Omit<ListSpec, 'code'>, items: Item[], cap: number, emptyText: string, o: { lead?: string; offsetPx?: number; after?: (p: Page) => void } = {}) => {
    const am = new Map(items.map((x) => [x.row.id, x.anchors]));
    return listPages({
      kit,
      code,
      spec: { ...spec, code },
      rows: items.map((x) => x.row),
      cap,
      emptyText,
      overflow,
      warnings,
      offsetPx: o.offsetPx,
      roomPx: bodyRoomFor(D, S, { title: `${title} (9/9)`, lead: o.lead, grow: true }) - SAFE,
      newPage: (pi, n, rows) => {
        const p = page(code, titled(title, pi, n), uniq(rows.flatMap((r) => am.get(r.id) ?? [])), o.lead);
        o.after?.(p);
        return p;
      },
    });
  };
  const col = (key: string, caption: string, ratio: number, more: { status?: boolean; dot?: boolean } = {}) => ({ key, caption, ratio, ...more });
  const statusTone = (st?: string): DesignColorKey => (st === '완료' ? 'positive' : st === '미완료' || st === '기한초과' ? 'negative' : st === '재조치' ? 'caution' : 'ink');
  const roomOf = (p: Page) => (p.box.bottom - p.box.top) / S.k;
  const cover = (code: string, title: string, rows: [string, string][]) => {
    const p = page(code, title, [], `${snapshot.site}  ·  위험성평가 회의`);
    const parts = rows.flatMap(([k, val], i) => [
      { text: `${k}   `, tone: 'ink2' as const },
      { text: val, bold: true, breakLine: i < rows.length - 1 },
    ]);
    const h = drawCallout({ ...kit, slide: p.slide }, { x: X, y: p.box.top / S.k, w: BW }, parts);
    checkCallout(kit, p.no, code, 'cover', 'meta', parts.map((x) => x.text).join(''), BW, h, roomOf(p), overflow, warnings);
  };
  /** 본문 일부 폭에 목록 하나(장 나누기 없이 — 개요·참석 장). 그린 높이(px) */
  const areaList = (p: Page, spec: ListSpec, rows: ListRow[], emptyText: string): number => {
    const ctx = { ...kit, slide: p.slide };
    if (!rows.length) {
      drawListEmpty(ctx, p.box, emptyText, spec.area);
      return 120;
    }
    const L = drawList(ctx, p.box, spec, rows);
    if (L.total > roomOf(p)) warnings.push(`${spec.code}(${D.id}) ${p.no}장: 목록이 본문 높이를 넘는다 — 원문 그대로 실었으니 입력에서 줄여 주세요`);
    return L.total;
  };
  const attendeeRows = (list: MeetingAttendee[], k: string): ListRow[] => list.map((a, i) => ({ id: `${k}[${i}]`, cells: [{ text: a.role, bold: true }, { text: v(a.name) }] }));

  if (pre) {
    // P1 표지
    cover('P1', '회의 전 검토안', [
      ['회차', snapshot.cycle],
      ['상태', badge],
      ['사업장', snapshot.site],
      ['회의 예정일', v(snapshot.meetingDate)],
      ['데이터 기준일', snapshot.basisDate],
      ['적용기간', v(snapshot.period)],
      ['작성자', v(snapshot.author)],
    ]);

    // P2 회의 개요 — 왼쪽 의제 목록, 오른쪽 참석 예정 목록 + 안전 사례 상자
    // 의제가 길면 장을 나눈다. 안전 사례 상자가 참석 목록 아래 들지 않으면 이어지는 장에 본문 폭으로
    {
      const gap = 48;
      const lw = BW * 0.55;
      const rx = X + lw + gap;
      const rw = BW - lw - gap;
      const agenda = snapshot.agenda?.length ? snapshot.agenda : ['전회 조치 이행 확인', '신규·변경 위험요인 검토', '근로자 의견 검토', '결정 필요 사항'];
      const parts = [
        { text: '안전 사례', bold: true, breakLine: true },
        { text: snapshot.safetyCase ?? '(선택 — 비워 둠)', tone: snapshot.safetyCase ? ('ink' as const) : ('ink2' as const) },
      ];
      let safetyLater = false;
      list(
        'P2',
        '회의 개요',
        { area: { x: X, w: lw }, cols: [col('no', '순서', 1), col('agenda', '의제', 6)] },
        agenda.map((a, i) => ({ anchors: [], row: { id: `agenda[${i}]`, cells: [{ text: String(i + 1).padStart(2, '0'), bold: true, color: 'accentText' }, { text: a, bold: true }] } })),
        8,
        '',
        {
          after: (p) => {
            if (slides.filter((x) => x.code === 'P2').length > 1) return;
            const h = areaList(p, { code: 'P2', area: { x: rx, w: rw }, cols: [col('role', '역할', 1), col('name', '참석 예정자', 1.2)] }, attendeeRows(snapshot.attendees?.planned ?? [], 'planned'), '참석 예정자 미입력');
            const ch = calloutHeight(kit, rw, parts);
            if (h + 32 + ch > roomOf(p) - SAFE) {
              safetyLater = true;
              return;
            }
            drawCallout({ ...kit, slide: p.slide }, { x: rx, y: p.box.top / S.k + h + 32, w: rw }, parts);
          },
        },
      );
      if (safetyLater) {
        const p = page('P2', '회의 개요 — 안전 사례', []);
        const ch = drawCallout({ ...kit, slide: p.slide }, { x: X, y: p.box.top / S.k, w: BW }, parts);
        checkCallout(kit, p.no, 'P2', 'safetyCase', 'safetyCase', snapshot.safetyCase ?? '', BW, ch, roomOf(p), overflow, warnings);
      }
    }

    // P3 한눈 요약 — 요약 수 부품(B1). 강조는 한 곳: 못 끝낸 전회 조치가 있으면 그 수
    {
      const count = (st: string) => snapshot.prior.filter((x) => x.status === st).length;
      const candidates = snapshot.hazards.filter((h) => h.kind === 'new' || h.kind === 'changed').length;
      const unchanged = snapshot.hazards.filter((h) => h.kind === 'unchanged').length;
      const total = snapshot.prior.length;
      const done = count('완료');
      const open = total - done;
      const questions = snapshot.questions.length;
      const lead = `전회 조치 ${total}건 중 ${done}건 완료 · 신규·변경 후보 ${candidates}건 · 결정 필요 ${questions}건`;
      const p = page('P3', '한눈 요약', uniq([...snapshot.prior.map((x) => x.anchors), ...snapshot.hazards.map((h) => h.anchors)]), lead);
      const kpis: Kpi[] = [
        { key: 'prior', label: total ? `확인 · 전회 조치 ${total}건 중 완료` : '확인 · 전회 조치', value: String(done), risk: open > 0 },
        { key: 'candidates', label: '평가 · 신규·변경 후보', value: String(candidates), risk: false },
        { key: 'questions', label: questions ? '개선 · 이번 회의에서 정할 것' : '개선 · 정할 것 없음', value: String(questions), risk: false },
      ];
      const note = `${total ? `미완료 ${count('미완료')} · 기한초과 ${count('기한초과')} · 재조치 ${count('재조치')}` : '전회 항목 없음'} · 변동 없음 ${unchanged}건 · 척도 ${snapshot.scaleName} — 회차 대비 증감은 같은 척도일 때만 비교합니다`;
      const r = drawB1({ ...kit, slide: p.slide }, kpis, { note, accentKey: open > 0 ? 'prior' : '', mutedKey: '', flowLabels: ['확인할 것', '정할 것'] });
      if (r.shrunk.length) warnings.push(`P3(${D.id}): 한 번 축소 — ${r.shrunk.join(', ')}`);
      recordChecks(p.no, 'P3', D.id, r.checks, overflow, warnings);
    }

    // P4 전회 이행 현황 — 11칸 그대로(촘촘)
    list(
      'P4',
      '전회 이행 현황',
      {
        dense: true,
        cols: [col('id', 'ID', 0.6), col('hazard', '위험요인', 2.0, { dot: true }), col('frequency', '빈도', 0.45), col('severity', '강도', 0.45), col('grade', '등급', 0.8), col('measure', '전회 대책', 1.6), col('owner', '1차 조치자', 1.0), col('due', '기한', 0.95), col('status', '상태', 0.7, { status: true }), col('result', '조치결과', 1.5), col('verifier', '2차 확인자', 1.0)],
      },
      snapshot.prior.map((x) => ({
        anchors: [x.anchors],
        row: { id: x.id, cells: [{ text: x.id }, { text: x.hazard, bold: true }, { text: v(x.frequency) }, { text: v(x.severity) }, { text: v(x.grade) }, { text: v(x.measure) }, { text: v(x.owner) }, { text: v(x.due) }, { text: v(x.status), bold: !!x.status, color: statusTone(x.status) }, { text: v(x.result) }, { text: v(x.verifier) }] },
      })),
      6,
      '전회 항목 없음',
    );

    // P5 조치 전·후(완료 항목당 1장) — 사진 둘 · 법조 줄 · 조치 결과 목록
    {
      const done = snapshot.prior.filter((x) => x.status === '완료');
      if (!done.length) {
        const p = page('P5', '조치 전·후 — 해당 항목 없음', []);
        drawListEmpty({ ...kit, slide: p.slide }, p.box, '전회 조치 중 완료된 항목이 없어 전·후 비교 장이 없습니다');
      }
      const C = (k: DesignColorKey) => color(D, k);
      for (const it of done) {
        const p = page('P5', `조치 전·후 — ${it.id}`, uniq([it.anchors]), `${it.id}  ${it.hazard}`);
        const ctx = { ...kit, slide: p.slide };
        const top = p.box.top / S.k;
        const rspec: ListSpec = { code: 'P5', cols: [col('result', '조치 결과', 2), col('effect', '효과', 1), col('residual', '잔여 위험', 1), col('verifier', '확인', 1)] };
        const rrows: ListRow[] = [{ id: it.id, cells: [{ text: v(it.result) }, { text: v(it.effect) }, { text: v(it.residual) }, { text: v(it.verifier) }] }];
        const listH = listLayout(D, S, rspec, rrows).total;
        const body = D.tokens.type.body;
        const legal = `법조  ${it.legal ?? '-'}`;
        const legalH = wrapLines(legal, capacityOf(S.x(BW), S.pt(body), 1)) * body * LINE_H + 8;
        const labelH = D.tokens.type.label * 1.6;
        const photoH = Math.max(160, roomOf(p) - labelH - 12 - 28 - legalH - 28 - listH);
        const gap = 72;
        const bw = (BW - gap) / 2;
        const py = top + labelH + 12;
        (['before', 'after'] as const).forEach((side, i) => {
          const x = X + i * (bw + gap);
          p.slide.addText(side === 'before' ? '조치 전' : '조치 후', { x: S.x(x), y: S.y(top), w: S.x(bw), h: S.y(labelH), fontFace, fontSize: S.pt(D.tokens.type.label), bold: true, color: C(side === 'before' ? 'ink2' : 'ink'), valign: 'middle', margin: 0 });
          p.slide.addShape(pptx.ShapeType.line, { x: S.x(x), y: S.y(top + labelH + 4), w: S.x(bw), h: 0, line: { color: C(side === 'before' ? 'line' : 'rule'), width: S.pt(side === 'before' ? 1 : 2) } });
          const photo = snapshot.photos.find((ph) => ph.itemId === it.id && ph.side === side);
          if (photo)
            (p.slide as unknown as { addImage(o: Record<string, unknown>): void }).addImage({ data: `${photo.mime ?? 'image/png'};base64,${photo.data}`, x: S.x(x), y: S.y(py), w: S.x(bw), h: S.y(photoH), sizing: { type: 'contain', w: S.x(bw), h: S.y(photoH) } });
          else
            p.slide.addText('사진 없음', { x: S.x(x), y: S.y(py), w: S.x(bw), h: S.y(photoH), fontFace, fontSize: S.pt(D.tokens.type.label), align: 'center', valign: 'middle', color: C('ink2'), fill: { color: C('surface') }, line: { color: C('line'), width: Math.max(0.5, S.pt(1)), dashType: 'dash' }, margin: 0 });
        });
        p.slide.addText('▶', { x: S.x(X + bw), y: S.y(py + photoH / 2 - 30), w: S.x(gap), h: S.y(60), fontFace, fontSize: S.pt(D.tokens.type.label), color: C('accentText'), align: 'center', valign: 'middle', margin: 0 });
        const ly = py + photoH + 28;
        p.slide.addText(
          [
            { text: '법조  ', options: { bold: true, color: C('caution') } },
            { text: it.legal ?? '-', options: { color: C('ink') } },
          ],
          { x: S.x(X), y: S.y(ly), w: S.x(BW), h: S.y(legalH), fontFace, fontSize: S.pt(body), valign: 'top', margin: 0 },
        );
        drawList(ctx, { ...p.box, top: S.y(ly + legalH + 28) }, rspec, rrows);
        if (labelH + 12 + photoH + 28 + legalH + 28 + listH > roomOf(p)) warnings.push(`P5(${D.id}) ${p.no}장: ${it.id} 조치 결과 글이 길어 사진 칸이 최소 높이로 줄었고 본문 높이를 넘는다 — 원문 그대로 실었으니 입력에서 줄여 주세요`);
      }
    }

    // P6 신규·변경 후보 — 목록 카드(신규/변경 · 위험성 · 원인→결과 · 대책 3종 · ID·출처)
    list(
      'P6',
      '신규·변경 후보',
      { dense: true, stripe: true, cols: [col('kind', '구분', 0.7, { status: true }), col('situation', '위험', 2.2, { dot: true }), col('risk', '위험성', 1.4), col('cause', '원인 → 결과', 2.0), col('measures', '대책', 2.6), col('id', 'ID·출처', 1.3)] },
      snapshot.hazards
        .filter((h) => h.kind === 'new' || h.kind === 'changed')
        .map((h) => {
          const m = h.measures ?? {};
          const ms = ([['기술', m.technical], ['교육', m.education], ['관리', m.management]] as const).filter(([, t]) => t).map(([k, t]) => `${k}: ${t}`).join(' / ');
          return {
            anchors: [h.anchors],
            row: {
              id: h.id,
              cells: [
                { text: h.kind === 'new' ? '신규' : '변경', bold: true, color: h.kind === 'new' ? 'accentText' : 'caution' },
                { text: h.situation, bold: true },
                { text: `빈도 ${h.frequency ?? '-'} × 강도 ${h.severity ?? '-'} = ${risk(h.frequency, h.severity) ?? '-'}  ·  ${h.grade ?? '-'}` },
                { text: `${v(h.cause)} → ${v(h.consequence)}` },
                { text: ms || '-' },
                { text: `${h.id}  ·  출처 ${h.sourceType ?? '-'}${h.tags?.length ? `  ·  ${h.tags.join('·')}` : ''}` },
              ],
            },
          };
        }),
      4,
      '이번 회차 신규·변경 위험요인 후보가 없습니다',
    );

    // P7 근로자 의견
    list(
      'P7',
      '근로자 의견',
      { cols: [col('id', 'ID', 0.8), col('from', '의견자', 2.0), col('text', '의견', 5.0), col('relatedIds', '관련 ID', 1.8)] },
      snapshot.opinions.map((o) => ({ anchors: [o.anchors], row: { id: o.id, cells: [{ text: o.id }, { text: o.from, bold: true }, { text: o.text }, { text: v((o.relatedIds ?? []).join(', ')) }] } })),
      8,
      '의견 없음',
    );
  }

  // P8 회차 대비 변화 — 같은 척도 ID 일 때만 증감(값은 기본 출력과 같은 함수)
  const changes: MeetingChange[] = [];
  if (pre) {
    const items: Item[] = priorChanges(snapshot).map(({ p, cur, pr, cr, delta }) => {
      changes.push({ id: p.id, priorRisk: pr, currentRisk: cr, delta });
      const num = typeof delta === 'number';
      return {
        anchors: [p.anchors, cur?.anchors],
        row: {
          id: p.id,
          cells: [
            { text: p.id },
            { text: p.hazard, bold: true },
            { text: v(pr !== null ? `${pr} (${p.grade ?? '-'})` : p.grade) },
            { text: v(cr !== null ? `${cr} (${cur?.grade ?? '-'})` : cur?.grade) },
            num ? { text: delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '0', bold: delta !== 0, color: delta > 0 ? 'negative' : delta < 0 ? 'positive' : 'ink2' } : { text: String(delta), color: 'ink2' },
            { text: p.scaleId === snapshot.scaleId ? snapshot.scaleName : `전회 ${p.scaleId ?? '미상'}` },
          ],
        },
      };
    });
    list('P8', '회차 대비 변화', { cols: [col('id', 'ID', 0.8), col('hazard', '위험요인', 3.6, { dot: true }), col('priorRisk', '전회 위험도', 1.6), col('currentRisk', '현재 위험도', 1.6), col('delta', '증감', 1.4, { status: true }), col('scale', '척도', 1.8)] }, items, 10, '비교 항목 없음');

    // P9 결정 필요 사항 — 결정 칸은 회의에서 적는 빈칸
    const refMap = new Map<string, string[] | undefined>([...snapshot.prior.map((x) => [x.id, x.anchors] as [string, string[] | undefined]), ...snapshot.hazards.map((h) => [h.id, h.anchors] as [string, string[] | undefined])]);
    list(
      'P9',
      '결정 필요 사항',
      { cols: [col('id', 'ID', 0.8), col('question', '질문', 4.0), col('targetIds', '대상 ID', 1.6), col('options', '선택지', 2.4), col('decision', '결정(회의에서 적는다)', 2.5)] },
      snapshot.questions.map((q) => ({
        anchors: [q.anchors, ...(q.targetIds ?? []).map((t) => refMap.get(t))],
        row: { id: q.id, cells: [{ text: q.id }, { text: q.question, bold: true }, { text: v((q.targetIds ?? []).join(', ')) }, { text: v((q.options ?? []).join(' / ')) }, { text: '' }] },
      })),
      8,
      '결정 필요 사항 없음',
    );

    // P10 근거 목록
    list('P10', '근거 목록', { cols: [col('id', '근거 ID', 2.0), col('source', '출처', 5.0), col('location', '위치', 3.0)] }, snapshot.anchors.map((a) => ({ anchors: [[a.id]], row: { id: a.id, cells: [{ text: a.id, bold: true }, { text: v(a.source) }, { text: v(a.location) }] } })), 14, '근거 없음');
  }

  let carryOver: PriorItem[] | undefined;
  if (!pre) {
    const hzMap = new Map(snapshot.hazards.map((h) => [h.id, h]));
    const prMap = new Map(snapshot.prior.map((x) => [x.id, x]));
    const refAnchors = (id: string) => uniq([prMap.get(id)?.anchors, hzMap.get(id)?.anchors]);
    const hazardOf = (id: string, given?: string) => given ?? hzMap.get(id)?.situation ?? prMap.get(id)?.hazard;
    const actions = actionsByDue(snapshot);

    // F1 표지
    cover('F1', '회의 후 확정본', [
      ['회차', snapshot.cycle],
      ['확정 버전', badge],
      ['다음 적용기간', v(snapshot.nextPeriod)],
      ['사업장', snapshot.site],
      ['실제 회의일', v(snapshot.actualMeetingDate)],
      ['데이터 기준일', snapshot.basisDate],
      ['작성자', v(snapshot.author)],
    ]);

    // F2 참석 — 예정 / 실제 두 목록 + 근로자대표 참여 상자(참여 = 긍정색, 불참 = 부정색)
    {
      const p = page('F2', '참석', []);
      const gap = 48;
      const half = (BW - gap) / 2;
      const hs = (['planned', 'actual'] as const).map((k, i) => {
        const label = k === 'planned' ? '참석 예정' : '실제 참석';
        return areaList(p, { code: 'F2', area: { x: X + i * (half + gap), w: half }, cols: [col('role', '역할', 1), col('name', label, 1.2)] }, attendeeRows(snapshot.attendees?.[k] ?? [], k), `${label} 미입력`);
      });
      const isRep = (a: MeetingAttendee) => a.workerRepresentative ?? a.role.includes('근로자대표');
      const rep = (snapshot.attendees?.actual ?? []).some(isRep);
      const y = p.box.top / S.k + Math.max(...hs) + 32;
      drawCallout({ ...kit, slide: p.slide }, { x: X, y, w: BW }, [{ text: `근로자대표 참여: ${rep ? '예' : '아니오'}`, bold: true, tone: rep ? 'positive' : 'negative' }]);
    }

    // F3 확정 결정
    list(
      'F3',
      '확정 결정',
      { cols: [col('id', 'ID', 0.8), col('questionId', '질문 ID', 1.0), col('targetIds', '대상 ID', 1.6), col('decision', '결정', 4.0), col('reason', '사유', 4.0)] },
      (snapshot.decisions ?? []).map((d) => ({ anchors: [d.anchors, ...(d.targetIds ?? []).map(refAnchors)], row: { id: d.id, cells: [{ text: d.id }, { text: v(d.questionId) }, { text: v((d.targetIds ?? []).join(', ')) }, { text: d.decision, bold: true }, { text: v(d.reason) }] } })),
      8,
      '확정 결정 없음',
    );

    // F4 조치 계획(기한순)
    list(
      'F4',
      '조치 계획',
      { dense: true, cols: [col('id', 'ID', 0.8), col('targetId', '대상 ID', 0.9), col('hazard', '위험요인', 2.4, { dot: true }), col('measure', '대책', 3.2), col('owner', '1차 조치자', 1.6), col('due', '기한', 1.0), col('verifier', '2차 확인자', 1.8)] },
      actions.map((a) => {
        const tid = a.targetId ?? a.id;
        return { anchors: [a.anchors, refAnchors(tid)], row: { id: a.id, cells: [{ text: a.id }, { text: tid }, { text: v(hazardOf(tid, a.hazard)), bold: true }, { text: a.measure }, { text: v(a.owner) }, { text: v(a.due) }, { text: v(a.verifier) }] } };
      }),
      6,
      '조치 계획 없음',
    );

    // F5 보류·재평가
    list(
      'F5',
      '보류·재평가',
      { cols: [col('id', 'ID', 0.8), col('hazard', '위험요인', 3.6, { dot: true }), col('reason', '보류 사유', 4.0), col('reevaluateBy', '재평가 기한', 1.8)] },
      (snapshot.deferred ?? []).map((d) => ({ anchors: [d.anchors, refAnchors(d.id)], row: { id: d.id, cells: [{ text: d.id }, { text: v(hazardOf(d.id, d.hazard)), bold: true }, { text: d.reason }, { text: v(d.reevaluateBy) }] } })),
      8,
      '보류 항목 없음',
    );

    // F6 우수 사례(선택 — 없으면 장을 만들지 않는다)
    const best = snapshot.bestPractices ?? [];
    if (best.length)
      list('F6', '우수 사례', { cols: [col('id', 'ID', 0.8), col('title', '사례', 2.8), col('text', '내용', 6.4)] }, best.map((b) => ({ anchors: [b.anchors], row: { id: b.id, cells: [{ text: b.id }, { text: b.title, bold: true }, { text: b.text }] } })), 6, '');

    // F7 다음 회차로 넘길 목록 — 값은 기본 출력과 같은 함수
    carryOver = carryOverOf(snapshot, actions, warnings);
    list(
      'F7',
      '다음 회차로 넘길 목록',
      { cols: [col('id', 'ID', 1.2), col('hazard', '위험요인', 3.0, { dot: true }), col('measure', '대책·비고', 3.2), col('due', '기한', 1.0), col('status', '상태', 1.0, { status: true }), col('scaleId', '척도', 1.2)] },
      carryOver.map((x) => ({ anchors: [x.anchors], row: { id: x.id, cells: [{ text: x.id }, { text: x.hazard, bold: true }, { text: v(x.measure ?? x.result) }, { text: v(x.due) }, { text: v(x.status), bold: true, color: statusTone(x.status) }, { text: x.scaleId ?? '미상' }] } })),
      10,
      '이월 항목 없음',
    );

    // F8 근거·버전 — 버전 줄(상자) + 근거 목록
    const ver = `확정 버전 ${badge} · revision ${snapshot.revision ?? '-'} · template ${MEETING_TEMPLATE_VERSION} · 척도 ${snapshot.scaleName}(${snapshot.scaleId})`;
    const verH = calloutHeight(kit, BW, [{ text: ver }], D.tokens.type.note);
    list(
      'F8',
      '근거·버전',
      { cols: [col('id', '근거 ID', 2.0), col('source', '출처', 5.0), col('location', '위치', 3.0)] },
      snapshot.anchors.map((a) => ({ anchors: [[a.id]], row: { id: a.id, cells: [{ text: a.id, bold: true }, { text: v(a.source) }, { text: v(a.location) }] } })),
      12,
      '근거 없음',
      { offsetPx: verH + 24, after: (p) => drawCallout({ ...kit, slide: p.slide }, { x: X, y: p.box.top / S.k, w: BW }, [{ text: ver, tone: 'ink2' }], { px: D.tokens.type.note }) },
    );
  }

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, overflowEstimates: overflow, ...(pre ? { changes } : { carryOver }), warnings };
}

/** 값이 undefined 인 키를 뺀다(이월 목록을 prior[] 입력으로 깔끔하게) */
function compact<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
