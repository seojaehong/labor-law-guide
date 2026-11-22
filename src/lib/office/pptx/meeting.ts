// 회의 PPTX — 스냅숏(JSON) → 회의 전 검토안 덱(바이트). fs·네트워크 없음.
// 사양 = .ralph/spec-office-v0.md §3·§4. 판형 기본 A4 가로(29.7×21.0cm).
// 넘침 정밀 판정은 엔진 밖(PowerPoint 검수)이다 — 여기서는 칸 글자 수로 추정만 한다.
import PptxGenJS from 'pptxgenjs';

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
  warnings: string[];
  errors?: string[];
}

const P4_ROWS_PER_SLIDE = 6;
const P6_CARDS_PER_SLIDE = 4;
const FONT_PT = 9;
const BORDER = { type: 'solid' as const, pt: 0.5, color: '999999' };
const HEAD_FILL = { color: 'E7ECF3' };

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
  if (kind !== 'pre') errors.push(`kind ${kind} 은 아직 지원하지 않는다(pre 만)`);
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
  const kind = opts.kind ?? snapshot.kind ?? 'pre';
  const errors = validate(snapshot, kind);
  if (errors.length) return { ok: false, slides: [], overflowEstimates: [], warnings: [], errors };

  const fontFace = opts.fontFace ?? '맑은 고딕';
  const warnings: string[] = [];
  const anchorMap = new Map(snapshot.anchors.map((a) => [a.id, a]));
  const allRefs = uniq([
    ...snapshot.prior.map((p) => p.anchors),
    ...snapshot.hazards.map((h) => h.anchors),
    ...snapshot.opinions.map((o) => o.anchors),
    ...snapshot.questions.map((q) => q.anchors),
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

  const newSlide = (code: string, title: string, anchors: string[]): { slide: Slide; no: number } => {
    const slide = pptx.addSlide();
    const no = slides.length + 1;
    slides.push({ no, code, title, anchors });
    slide.addText(`${code}  ${title.replace(/^P\d+\s*/, '')}`, { x: 0.3, y: 0.2, w: W - 2.2, h: 0.5, fontFace, fontSize: 18, bold: true, color: '1F2A44' });
    slide.addText(badge, { x: W - 1.7, y: 0.22, w: 1.4, h: 0.4, fontFace, fontSize: 12, bold: true, align: 'center', color: 'FFFFFF', fill: { color: 'C0504D' } });
    slide.addText(`${snapshot.site} · ${snapshot.cycle}`, { x: 0.3, y: 0.7, w: W - 0.6, h: 0.3, fontFace, fontSize: 10, color: '555555' });
    slide.addText(
      `데이터 기준 ${snapshot.basisDate} · revision ${snapshot.revision ?? '-'} · template ${MEETING_TEMPLATE_VERSION} · ${no}쪽`,
      { x: 0.3, y: H - 0.45, w: W - 0.6, h: 0.3, fontFace, fontSize: 8, color: '777777' },
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

  const table = (slide: Slide, rows: Cell[][], colW: number[], y: number) => {
    slide.addTable(rows as never, { x: 0.3, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace, fontSize: FONT_PT, border: BORDER, valign: 'middle' });
  };
  const head = (labels: string[]): Cell[] => labels.map((t) => ({ text: t, options: { bold: true, fill: HEAD_FILL, align: 'center' } }));
  const c = (t: string | number | undefined | null): Cell => ({ text: t === undefined || t === null || t === '' ? '-' : String(t) });

  // P1 표지
  {
    const { slide } = newSlide('P1', 'P1 표지', []);
    slide.addText('위험성평가 회의 전 검토안', { x: 0.6, y: 1.6, w: W - 1.2, h: 0.8, fontFace, fontSize: 28, bold: true, color: '1F2A44' });
    const lines = [
      `사업장: ${snapshot.site}`,
      `회차: ${snapshot.cycle}`,
      `회의 예정일: ${snapshot.meetingDate ?? '-'}`,
      `데이터 기준일: ${snapshot.basisDate}`,
      `적용기간: ${snapshot.period ?? '-'}`,
      `작성자: ${snapshot.author ?? '-'}`,
      `상태: ${badge}`,
    ];
    slide.addText(lines.join('\n'), { x: 0.6, y: 2.7, w: W - 1.2, h: 3.6, fontFace, fontSize: 14, valign: 'top' });
  }

  // P2 회의 개요
  {
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
  {
    const count = (st: string) => snapshot.prior.filter((p) => p.status === st).length;
    const candidates = snapshot.hazards.filter((h) => h.kind === 'new' || h.kind === 'changed').length;
    const unchanged = snapshot.hazards.filter((h) => h.kind === 'unchanged').length;
    const { slide } = newSlide('P3', 'P3 한눈 요약', uniq([...snapshot.prior.map((p) => p.anchors), ...snapshot.hazards.map((h) => h.anchors)]));
    const rows: Cell[][] = [
      head(['항목', '값']),
      [c('전회 조치 — 완료'), c(count('완료'))],
      [c('전회 조치 — 미완료'), c(count('미완료'))],
      [c('전회 조치 — 기한초과'), c(count('기한초과'))],
      [c('전회 조치 — 재조치'), c(count('재조치'))],
      [c('신규·변경 후보 수'), c(candidates)],
      [c('결정 필요 수'), c(snapshot.questions.length)],
      [c('척도'), c(snapshot.scaleName)],
      [c('변동 없음'), c(`${unchanged}건`)],
    ];
    table(slide, rows, [4, 4], 1.2);
  }

  // P4 전회 이행 현황(6행씩)
  {
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
  {
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
  {
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
          `원인: ${h.cause}`,
          `결과: ${h.consequence}`,
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
  {
    const { slide, no } = newSlide('P7', 'P7 근로자 의견', uniq(snapshot.opinions.map((o) => o.anchors)));
    const colW = [0.8, 2.0, contentW - 4.6, 1.8];
    const rows: Cell[][] = [head(['ID', '의견자', '의견', '관련 ID'])];
    for (const o of snapshot.opinions) {
      rows.push([c(o.id), c(o.from), c(o.text), c((o.relatedIds ?? []).join(', '))]);
      check(no, 'P7', o.id, 'text', o.text, colW[2], 3);
    }
    if (!snapshot.opinions.length) rows.push([c('의견 없음'), c(''), c(''), c('')]);
    table(slide, rows, colW, 1.15);
  }

  // P8 회차 대비 변화 — 같은 척도 ID 일 때만 증감
  const changes: MeetingChange[] = [];
  {
    const hz = new Map(snapshot.hazards.map((h) => [h.id, h]));
    const colW = [0.8, 3.6, 1.6, 1.6, 1.6, contentW - 9.2];
    const rows: Cell[][] = [head(['ID', '위험요인', '전회 위험도', '현재 위험도', '증감', '척도'])];
    const anchors: (string[] | undefined)[] = [];
    const items = snapshot.prior;
    for (const p of items) {
      const cur = hz.get(p.id);
      const pr = risk(p.frequency, p.severity);
      const cr = cur ? risk(cur.frequency, cur.severity) : null;
      let delta: MeetingChange['delta'];
      if (p.scaleId !== snapshot.scaleId) delta = '비교 안 함';
      else if (!cur) delta = '현재 평가 없음';
      else if (pr === null || cr === null) delta = '산정 불가';
      else delta = cr - pr;
      changes.push({ id: p.id, priorRisk: pr, currentRisk: cr, delta });
      anchors.push(p.anchors, cur?.anchors);
      rows.push([
        c(p.id), c(p.hazard), c(pr !== null ? `${pr} (${p.grade ?? '-'})` : p.grade), c(cr !== null ? `${cr} (${cur?.grade ?? '-'})` : cur?.grade),
        c(typeof delta === 'number' ? (delta > 0 ? `+${delta}` : String(delta)) : delta),
        c(p.scaleId === snapshot.scaleId ? snapshot.scaleName : `전회 ${p.scaleId ?? '미상'}`),
      ]);
    }
    if (!items.length) rows.push([c('비교 항목 없음'), c(''), c(''), c(''), c(''), c('')]);
    const { slide, no } = newSlide('P8', 'P8 회차 대비 변화', uniq(anchors));
    for (const p of items) check(no, 'P8', p.id, 'hazard', p.hazard, colW[1], 2);
    table(slide, rows, colW, 1.15);
  }

  // P9 결정 필요 사항
  {
    const prMap = new Map<string, string[] | undefined>([
      ...snapshot.prior.map((p) => [p.id, p.anchors] as [string, string[] | undefined]),
      ...snapshot.hazards.map((h) => [h.id, h.anchors] as [string, string[] | undefined]),
    ]);
    const anchors = uniq(snapshot.questions.flatMap((q) => [q.anchors, ...(q.targetIds ?? []).map((t) => prMap.get(t))]));
    const { slide, no } = newSlide('P9', 'P9 결정 필요 사항', anchors);
    const colW = [0.8, contentW - 7.3, 1.6, 2.4, 2.5];
    const rows: Cell[][] = [head(['ID', '질문', '대상 ID', '선택지', '결정'])];
    for (const q of snapshot.questions) {
      rows.push([c(q.id), c(q.question), c((q.targetIds ?? []).join(', ')), c((q.options ?? []).join(' / ')), { text: '' }]);
      check(no, 'P9', q.id, 'question', q.question, colW[1], 3);
    }
    if (!snapshot.questions.length) rows.push([c('결정 필요 사항 없음'), c(''), c(''), c(''), { text: '' }]);
    table(slide, rows, colW, 1.15);
  }

  // P10 근거 목록
  {
    const { slide } = newSlide('P10', 'P10 근거 목록', snapshot.anchors.map((a) => a.id));
    const rows: Cell[][] = [head(['근거 ID', '출처', '위치'])];
    for (const a of snapshot.anchors) rows.push([c(a.id), c(a.source), c(a.location)]);
    if (!snapshot.anchors.length) rows.push([c('근거 없음'), c(''), c('')]);
    table(slide, rows, [2.0, 5.0, contentW - 7.0], 1.15);
  }

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, overflowEstimates: overflow, changes, warnings };
}
