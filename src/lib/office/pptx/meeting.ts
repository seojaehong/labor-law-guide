// 회의 PPTX — 스냅숏(JSON) → 회의 전 검토안 덱(바이트). fs·네트워크 없음.
// 사양 = .ralph/spec-office-v0.md §3·§4. 판형 기본 A4 가로(29.7×21.0cm).
// 넘침 정밀 판정은 엔진 밖(PowerPoint 검수)이다 — 여기서는 칸 글자 수로 추정만 한다.
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';

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
  /** 판형. 기본 A4 가로 */
  layout?: 'A4' | '16:9';
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
const BORDER = INNER;
const HEAD_FILL = { color: T.table.headerFill };

type Slide = ReturnType<PptxGenJS['addSlide']>;
type Cell = { text: string; options?: Record<string, unknown> };

/** 글자 폭 단위: 한글·전각 1, ASCII 0.55 */
function textUnits(s: string): number {
  let u = 0;
  for (const ch of s) u += ch.charCodeAt(0) < 128 ? 0.55 : 1;
  return u;
}

function capacityOf(widthIn: number, fontPt: number, maxLines: number): number {
  const perLine = Math.max(1, Math.floor(((widthIn - 0.1) * 72) / fontPt));
  return perLine * maxLines;
}

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
  const contentW = W - 0.6;

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
      if (lead) slide.addText(lead, { objectName: 'lead', x: 0.45, y: 1.08, w: W - 0.9, h: 0.36, fontFace, fontSize: T.typeScale.lead, color: T.colors.muted });
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
    const { slide } = newSlide('P2', 'P2 회의 개요', []);
    const agenda = snapshot.agenda?.length
      ? snapshot.agenda
      : ['전회 조치 이행 확인', '신규·변경 위험요인 검토', '근로자 의견 검토', '결정 필요 사항'];
    slide.addText(['의제', ...agenda.map((a, i) => `${i + 1}. ${a}`)].join('\n'), { x: 0.3, y: 1.2, w: 5.2, h: 3.2, fontFace, fontSize: 12, valign: 'top' });
    const planned = snapshot.attendees?.planned ?? [];
    const rows: Cell[][] = [head(['역할', '참석 예정자'])];
    for (const a of planned) rows.push([c(a.role), c(a.name)]);
    if (!planned.length) rows.push([c('참석 예정자 미입력'), c('')]);
    slide.addTable(rows as never, { x: 5.8, y: 1.2, w: W - 6.1, colW: [2.4, W - 8.5], fontFace, fontSize: FONT_PT, border: BORDER });
    slide.addText(`안전 사례: ${snapshot.safetyCase ?? '(선택 — 비워 둠)'}`, { x: 0.3, y: 4.8, w: contentW, h: 1.2, fontFace, fontSize: 11, valign: 'top' });
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
    const colW = [0.6, 2.0, 0.45, 0.45, 0.8, 1.6, 1.0, 0.95, 0.7, 1.5, 1.0];
    const pages: PriorItem[][] = [];
    for (let i = 0; i < snapshot.prior.length; i += P4_ROWS_PER_SLIDE) pages.push(snapshot.prior.slice(i, i + P4_ROWS_PER_SLIDE));
    if (!pages.length) pages.push([]);
    pages.forEach((items, pi) => {
      const title = pi === 0 ? 'P4 전회 이행 현황' : 'P4 전회 이행 현황 (계속)';
      const { slide, no } = newSlide('P4', title, uniq(items.map((p) => p.anchors)));
      const rows: Cell[][] = [head(['ID', '위험요인', '빈도', '강도', '등급', '전회 대책', '1차 조치자', '기한', '상태', '조치결과', '2차 확인자'])];
      for (const p of items) {
        rows.push([c(p.id), c(p.hazard), c(p.frequency), c(p.severity), c(p.grade), c(p.measure), c(p.owner), c(p.due), c(p.status), c(p.result), c(p.verifier)]);
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
    if (!done.length) newSlide('P5', 'P5 조치 전·후 — 해당 항목 없음', []);
    for (const p of done) {
      const { slide, no } = newSlide('P5', `P5 조치 전·후 — ${p.id}`, uniq([p.anchors]));
      slide.addText(`${p.id}  ${p.hazard}`, { x: 0.3, y: 1.05, w: contentW, h: 0.5, fontFace, fontSize: 11, bold: true });
      check(no, 'P5', p.id, 'hazard', p.hazard, contentW, 2, 11);
      const boxW = (contentW - 0.3) / 2;
      (['before', 'after'] as const).forEach((side, i) => {
        const x = 0.3 + i * (boxW + 0.3);
        slide.addText(side === 'before' ? '조치 전' : '조치 후', { x, y: 1.6, w: boxW, h: 0.3, fontFace, fontSize: 10, bold: true, align: 'center' });
        const photo = snapshot.photos.find((ph) => ph.itemId === p.id && ph.side === side);
        if (photo) {
          slide.addImage({ data: `${photo.mime ?? 'image/png'};base64,${photo.data}`, x, y: 1.95, w: boxW, h: 3.4 });
        } else {
          slide.addText('사진 없음', { x, y: 1.95, w: boxW, h: 3.4, fontFace, fontSize: 14, align: 'center', valign: 'middle', color: '888888', fill: { color: 'F2F2F2' }, line: { color: 'BBBBBB', width: 0.75 } });
        }
      });
      slide.addText(`법조: ${p.legal ?? '-'}`, { x: 0.3, y: 5.5, w: contentW, h: 0.35, fontFace, fontSize: 10, fill: { color: 'FFF4D6' } });
      const rows: Cell[][] = [
        head(['조치 결과', '효과', '잔여 위험', '확인']),
        [c(p.result), c(p.effect), c(p.residual), c(p.verifier)],
      ];
      const colW = [contentW * 0.4, contentW * 0.2, contentW * 0.2, contentW * 0.2];
      table(slide, rows, colW, 6.0);
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
      if (!items.length) slide.addText('신규·변경 후보 없음', { x: 0.3, y: 1.2, w: contentW, h: 0.5, fontFace, fontSize: 12 });
      const cw = (contentW - 0.3) / 2;
      const ch = 3.0;
      items.forEach((h, i) => {
        const x = 0.3 + (i % 2) * (cw + 0.3);
        const y = 1.15 + Math.floor(i / 2) * (ch + 0.2);
        const m = h.measures ?? {};
        const body = [
          `${h.id} [${h.kind === 'new' ? '신규' : '변경'}] 출처: ${h.sourceType ?? '-'}${h.tags?.length ? ` · ${h.tags.join('·')}` : ''}`,
          `상황: ${h.situation}`,
          `원인: ${h.cause ?? '-'}`,
          `결과: ${h.consequence ?? '-'}`,
          `빈도 ${h.frequency ?? '-'} · 강도 ${h.severity ?? '-'} · 등급 ${h.grade ?? '-'}`,
          `대책(기술): ${m.technical ?? '-'}`,
          `대책(교육): ${m.education ?? '-'}`,
          `대책(관리): ${m.management ?? '-'}`,
        ].join('\n');
        slide.addText(body, { x, y, w: cw, h: ch, fontFace, fontSize: FONT_PT, valign: 'top', line: { color: 'BBBBBB', width: 0.75 } });
        for (const f of ['situation', 'cause', 'consequence'] as const) check(no, 'P6', h.id, f, h[f], cw, 2);
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
    const hz = new Map(snapshot.hazards.map((h) => [h.id, h]));
    const colW = [0.8, 3.6, 1.6, 1.6, 1.6, contentW - 9.2];
    const rowsAll: { cells: Cell[]; anchors: (string[] | undefined)[]; p: PriorItem }[] = [];
    const items = snapshot.prior;
    for (const p of items) {
      const cur = hz.get(p.hazardId ?? p.id);
      const pr = risk(p.frequency, p.severity);
      const cr = cur ? risk(cur.frequency, cur.severity) : null;
      let delta: MeetingChange['delta'];
      if (p.scaleId !== snapshot.scaleId) delta = '비교 안 함';
      else if (!cur) delta = '현재 평가 없음';
      else if (pr === null || cr === null) delta = '산정 불가';
      else delta = cr - pr;
      changes.push({ id: p.id, priorRisk: pr, currentRisk: cr, delta });
      rowsAll.push({
        p,
        anchors: [p.anchors, cur?.anchors],
        cells: [
          c(p.id), c(p.hazard), c(pr !== null ? `${pr} (${p.grade ?? '-'})` : p.grade), c(cr !== null ? `${cr} (${cur?.grade ?? '-'})` : cur?.grade),
          c(typeof delta === 'number' ? (delta > 0 ? `+${delta}` : String(delta)) : delta),
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
        rows.push([c(q.id), c(q.question), c((q.targetIds ?? []).join(', ')), c((q.options ?? []).join(' / ')), { text: '' }]);
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
    // 기한 오름차순(기한 없는 행은 끝, 같은 기한은 입력 순서)
    const actions = (snapshot.actions ?? [])
      .map((a, i) => ({ a, i }))
      .sort((x, y) => {
        if (!x.a.due && !y.a.due) return x.i - y.i;
        if (!x.a.due) return 1;
        if (!y.a.due) return -1;
        return x.a.due < y.a.due ? -1 : x.a.due > y.a.due ? 1 : x.i - y.i;
      })
      .map((x) => x.a);

    // F1 표지
    {
      const { slide } = newSlide('F1', 'F1 표지', []);
      slide.addText('위험성평가 회의 후 확정본', { x: 0.6, y: 1.6, w: W - 1.2, h: 0.8, fontFace, fontSize: 28, bold: true, color: '1F2A44' });
      const lines = [
        `사업장: ${snapshot.site}`,
        `회차: ${snapshot.cycle}`,
        `실제 회의일: ${snapshot.actualMeetingDate ?? '-'}`,
        `데이터 기준일: ${snapshot.basisDate}`,
        `확정 버전: ${badge}`,
        `다음 적용기간: ${snapshot.nextPeriod ?? '-'}`,
        `작성자: ${snapshot.author ?? '-'}`,
      ];
      slide.addText(lines.join('\n'), { x: 0.6, y: 2.7, w: W - 1.2, h: 3.6, fontFace, fontSize: 14, valign: 'top' });
    }

    // F2 참석(예정 vs 실제)
    {
      const { slide } = newSlide('F2', 'F2 참석', []);
      const isRep = (a: MeetingAttendee) => a.workerRepresentative ?? a.role.includes('근로자대표');
      const half = (contentW - 0.3) / 2;
      (['planned', 'actual'] as const).forEach((k, i) => {
        const list = snapshot.attendees?.[k] ?? [];
        const label = k === 'planned' ? '참석 예정' : '실제 참석';
        const rows: Cell[][] = [head(['역할', label])];
        for (const a of list) rows.push([c(a.role), c(a.name)]);
        if (!list.length) rows.push([c(`${label} 미입력`), c('')]);
        slide.addTable(rows as never, { x: 0.3 + i * (half + 0.3), y: 1.2, w: half, colW: [half * 0.5, half * 0.5], fontFace, fontSize: FONT_PT, border: BORDER });
      });
      const repActual = (snapshot.attendees?.actual ?? []).some(isRep);
      slide.addText(`근로자대표 참여: ${repActual ? '예' : '아니오'}`, { x: 0.3, y: H - 1.2, w: contentW, h: 0.4, fontFace, fontSize: 12, bold: true, fill: { color: repActual ? 'E2F0D9' : 'FBE5D6' } });
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
    const carry: PriorItem[] = [];
    {
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
        { x: 0.3, y: 1.1, w: contentW, h: 0.35, fontFace, fontSize: 10 },
      );
      const rows: Cell[][] = [head(['근거 ID', '출처', '위치'])];
      for (const a of items) rows.push([c(a.id), c(a.source), c(a.location)]);
      if (!items.length) rows.push([c('근거 없음'), c(''), c('')]);
      table(slide, rows, [2.0, 5.0, contentW - 7.0], 1.55);
    });

    return carry;
  }
}

/** 값이 undefined 인 키를 뺀다(이월 목록을 prior[] 입력으로 깔끔하게) */
function compact<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
