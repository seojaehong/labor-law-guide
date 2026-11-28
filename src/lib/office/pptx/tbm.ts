// TBM 카드 덱 — 위험성평가 원장에서 고른 작업별 위험을 작업 전에 근로자에게 전하는 덱(전파 덱 3종 중 1).
// 근거: 고시 제16조①3(매 작업일 공유) · 법 제36조④ 후단(중대재해 우려 요인 작업 전 상시 주지).
// 문장은 입력 원문 그대로 싣는다(지어 쓰지 않음). 실명 칸 없음 — 서명란은 빈칸. fs·네트워크 없음.
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';
import { capacityOf, textUnits } from './text-units';
import type { MeetingAnchor, OverflowEstimate } from './meeting';
import { DESIGN_IDS, getDeckDesign, isDesignId, type DeckDesign, type DesignId } from './design/index';
import { bodyRoomFor, drawHead } from './design/head';
import { koSlide } from './design/lang';
import { drawSign, type ListRow, type ListSpec } from './design/lists';
import { checkCallout, drawCallout, listPages, pickLayout, type Kit, type Page } from './design/deck';

export const TBM_TEMPLATE_VERSION = 'tbm-v0';

export type TbmAcceptability = 'unacceptable' | 'conditional' | 'acceptable';

export interface TbmHazard {
  id: string;
  situation: string;
  cause?: string;
  consequence?: string;
  measures: string[];
  acceptability?: TbmAcceptability;
  kind?: 'new' | 'changed' | 'unchanged';
  /** 중대재해 우려 요인(법 제36조④ 후단) */
  seriousConcern?: boolean;
  frequency?: number;
  severity?: number;
  grade?: string;
  anchors?: string[];
}

export interface TbmTask {
  id: string;
  /** 공정·작업 이름 */
  process: string;
  place?: string;
  hazards: TbmHazard[];
  /** 확인 질문 원문(1~2개 권장). 없으면 손으로 적을 빈 줄 */
  questions?: string[];
}

export interface TbmSnapshot {
  site: string;
  workDate: string;
  basisDate: string;
  cycle?: string;
  revision?: string;
  tasks: TbmTask[];
  anchors?: MeetingAnchor[];
}

export interface TbmOptions {
  /** 장당 위험 개수 1~3. 기본 3 */
  maxHazards?: number;
  /** 서명란 행 수 1~20. 기본 8 */
  signatureRows?: number;
  fontFace?: string;
  /** 판형. 기본 A4 가로 — 단 design 을 고르고 판형을 주지 않으면 16:9 */
  layout?: 'A4' | '16:9';
  /** 디자인 프리셋. 미지정이면 지금 출력 그대로 */
  design?: DesignId;
}

export interface TbmSlideInfo {
  no: number;
  code: string;
  taskId: string;
  title: string;
  anchors: string[];
}

export interface TbmPick {
  taskId: string;
  shown: string[];
  omitted: string[];
}

export interface TbmPptxResult {
  ok: boolean;
  bytes?: Uint8Array;
  slides: TbmSlideInfo[];
  picks: TbmPick[];
  overflowEstimates: OverflowEstimate[];
  warnings: string[];
  errors?: string[];
}

const T = MEETING_THEME;
const ACC_LABEL: Record<TbmAcceptability, string> = { unacceptable: '허용 불가', conditional: '조건부', acceptable: '허용' };
const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrs = (v: unknown) => Array.isArray(v) && v.every(isStr);
const optStr = (v: unknown) => v === undefined || isStr(v);
const optNum = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v));

/** 입력 모양 검사 — 던지지 않고 errors 로 */
function validate(s: unknown, opts: TbmOptions): string[] {
  const e: string[] = [];
  if (!s || typeof s !== 'object') return ['스냅숏이 객체가 아니다'];
  const o = s as Record<string, unknown>;
  for (const k of ['site', 'workDate', 'basisDate']) if (!isStr(o[k]) || !(o[k] as string).trim()) e.push(`${k}: 글자 필수`);
  for (const k of ['cycle', 'revision']) if (!optStr(o[k])) e.push(`${k}: 글자여야 한다`);
  if (o.anchors !== undefined && !(Array.isArray(o.anchors) && o.anchors.every((a) => a && isStr((a as MeetingAnchor).id)))) e.push('anchors: {id} 배열이어야 한다');
  const mh = opts.maxHazards ?? 3;
  if (!Number.isInteger(mh) || mh < 1 || mh > 3) e.push('maxHazards 는 1~3');
  const sr = opts.signatureRows ?? 8;
  if (!Number.isInteger(sr) || sr < 1 || sr > 20) e.push('signatureRows 는 1~20');
  if (!Array.isArray(o.tasks) || !o.tasks.length) {
    e.push('tasks: 작업이 하나 이상 있어야 한다');
    return e;
  }
  (o.tasks as unknown[]).forEach((t, i) => {
    const at = `tasks[${i}]`;
    if (!t || typeof t !== 'object') return e.push(`${at}: 객체여야 한다`);
    const tk = t as Record<string, unknown>;
    const name = isStr(tk.id) ? tk.id : at;
    if (!isStr(tk.id) || !tk.id.trim()) e.push(`${at}.id: 글자 필수`);
    if (!isStr(tk.process) || !tk.process.trim()) e.push(`${name}.process: 글자 필수`);
    if (!optStr(tk.place)) e.push(`${name}.place: 글자여야 한다`);
    if (tk.questions !== undefined && !isStrs(tk.questions)) e.push(`${name}.questions: 글자 배열이어야 한다`);
    if (!Array.isArray(tk.hazards) || !tk.hazards.length) return e.push(`${name}: 위험요인이 없다 — 원장에서 이 작업의 위험요인을 먼저 고른다`);
    (tk.hazards as unknown[]).forEach((h, j) => {
      const ht = `${name}.hazards[${j}]`;
      if (!h || typeof h !== 'object') return e.push(`${ht}: 객체여야 한다`);
      const hz = h as Record<string, unknown>;
      if (!isStr(hz.id) || !hz.id.trim()) e.push(`${ht}.id: 글자 필수`);
      if (!isStr(hz.situation) || !hz.situation.trim()) e.push(`${ht}.situation: 글자 필수`);
      if (!isStrs(hz.measures)) e.push(`${ht}.measures: 글자 배열 필수`);
      for (const k of ['cause', 'consequence', 'grade']) if (!optStr(hz[k])) e.push(`${ht}.${k}: 글자여야 한다`);
      for (const k of ['frequency', 'severity']) if (!optNum(hz[k])) e.push(`${ht}.${k}: 숫자여야 한다`);
      if (hz.acceptability !== undefined && !(hz.acceptability as string in ACC_LABEL)) e.push(`${ht}.acceptability: unacceptable·conditional·acceptable 중 하나`);
      if (hz.kind !== undefined && !['new', 'changed', 'unchanged'].includes(hz.kind as string)) e.push(`${ht}.kind: new·changed·unchanged 중 하나`);
      if (hz.seriousConcern !== undefined && typeof hz.seriousConcern !== 'boolean') e.push(`${ht}.seriousConcern: 참·거짓이어야 한다`);
      if (hz.anchors !== undefined && !isStrs(hz.anchors)) e.push(`${ht}.anchors: 글자 배열이어야 한다`);
    });
  });
  return e;
}

/** 고르는 순서(설계 §3): 허용 불가 → 조건부 → 신규·변경 → 중대재해 우려 → 위험도 큰 것 → 입력 순 */
function rank(h: TbmHazard, i: number): number[] {
  const acc = h.acceptability === 'unacceptable' ? 0 : h.acceptability === 'conditional' ? 1 : 2;
  const fresh = h.kind === 'new' || h.kind === 'changed' ? 0 : 1;
  const serious = h.seriousConcern ? 0 : 1;
  const risk = typeof h.frequency === 'number' && typeof h.severity === 'number' ? -(h.frequency * h.severity) : 0;
  return [acc, fresh, serious, risk, i];
}

/** 고르는 순서대로 n 개 + 나머지. 교안(education)도 같은 순서를 쓴다 */
export function pick(hazards: TbmHazard[], n: number): { shown: TbmHazard[]; omitted: TbmHazard[] } {
  const order = hazards
    .map((h, i) => ({ h, k: rank(h, i) }))
    .sort((a, b) => {
      for (let x = 0; x < a.k.length; x++) if (a.k[x] !== b.k[x]) return a.k[x] - b.k[x];
      return 0;
    })
    .map((x) => x.h);
  return { shown: order.slice(0, n), omitted: order.slice(n) };
}

export async function makeTbmPptx(snapshot: TbmSnapshot, opts: TbmOptions = {}): Promise<TbmPptxResult> {
  const errors = validate(snapshot, opts);
  if (opts.design !== undefined && !isDesignId(opts.design)) errors.push(`design 은 ${DESIGN_IDS.join('·')} 중 하나(받은 값 ${String(opts.design)})`);
  if (errors.length) return { ok: false, slides: [], picks: [], overflowEstimates: [], warnings: [], errors };
  if (opts.design) return makeTbmDesign(snapshot, opts, getDeckDesign(opts.design));

  const maxHazards = opts.maxHazards ?? 3;
  const signatureRows = opts.signatureRows ?? 8;
  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const warnings: string[] = [];
  const anchorMap = new Map((snapshot.anchors ?? []).map((a) => [a.id, a]));

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
  const X0 = 0.45;
  const contentW = W - X0 * 2;
  const leftW = contentW * 0.62;
  const rx = X0 + leftW + 0.3;
  const rw = contentW - leftW - 0.3;

  const slides: TbmSlideInfo[] = [];
  const picks: TbmPick[] = [];
  const overflow: OverflowEstimate[] = [];
  const check = (no: number, code: string, ref: string, field: string, text: string | undefined, widthIn: number, fontPt: number, maxLines: number) => {
    if (!text) return;
    const capacity = capacityOf(widthIn, fontPt, maxLines);
    if (textUnits(text) > capacity) overflow.push({ slide: no, code, ref, field, chars: text.length, capacity });
  };

  const SITU_PT = T.typeScale.h2 + 3; // 현장에서 읽어 주는 글 — 회의 덱보다 크게
  const BODY_PT = T.typeScale.body + 2;
  const NONE = { type: 'none' as const };
  const INNER = { type: 'solid' as const, pt: T.table.innerLinePt, color: T.colors.line };
  const RULE = { type: 'solid' as const, pt: T.table.ruleLinePt, color: T.colors.primary };

  snapshot.tasks.forEach((task, ti) => {
    const no = ti + 1;
    const code = `T${no}`;
    const { shown, omitted } = pick(task.hazards, maxHazards);
    picks.push({ taskId: task.id, shown: shown.map((h) => h.id), omitted: omitted.map((h) => h.id) });
    const anchors = [...new Set(shown.flatMap((h) => h.anchors ?? []))];
    for (const a of anchors) if (!anchorMap.has(a)) warnings.push(`anchors 에 없는 근거 id: ${a}`);
    const title = task.place ? `${task.process}  ·  ${task.place}` : task.process;
    slides.push({ no, code, taskId: task.id, title, anchors });
    if (!task.questions?.length) warnings.push(`${task.id}: 확인 질문이 없어 빈 줄로 둔다(지어 쓰지 않음)`);

    const slide = pptx.addSlide();
    slide.background = { color: T.colors.bg };
    slide.addText(`작업 전 안전점검(TBM)  ·  ${snapshot.workDate}${snapshot.cycle ? `  ·  ${snapshot.cycle}` : ''}`, {
      x: X0, y: 0.28, w: W - 0.9, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, color: T.colors.accent, charSpacing: 0.5,
    });
    slide.addText(title, { objectName: 'title', x: X0, y: 0.55, w: W - 0.9, h: 0.6, fontFace, fontSize: T.typeScale.title + 4, bold: true, color: T.colors.primary });
    slide.addText(`오늘 이 작업에서 조심할 것 ${shown.length}가지`, { x: X0, y: 1.15, w: leftW, h: 0.34, fontFace, fontSize: T.typeScale.lead, color: T.colors.muted });

    // 왼쪽 — 위험 블록(색 띠는 뜻에만: 허용 불가 빨강 · 조건부 황토 · 그 밖 파랑)
    const top = 1.6;
    const bottom = H - 0.95;
    const blockH = Math.min(2.1, (bottom - top) / shown.length);
    shown.forEach((h, k) => {
      const y = top + k * blockH;
      const bar = h.acceptability === 'unacceptable' ? T.colors.negative : h.acceptability === 'conditional' ? T.colors.caution : T.colors.accent;
      slide.addShape(pptx.ShapeType.rect, { x: X0, y, w: leftW, h: blockH - 0.12, fill: { color: T.colors.band }, line: { color: T.colors.band, width: 0 } });
      slide.addShape(pptx.ShapeType.rect, { x: X0, y, w: 0.08, h: blockH - 0.12, fill: { color: bar }, line: { color: bar, width: 0 } });
      const chips = [
        h.acceptability && h.acceptability !== 'acceptable' ? ACC_LABEL[h.acceptability] : '',
        h.kind === 'new' ? '신규' : h.kind === 'changed' ? '변경' : '',
        h.seriousConcern ? '중대재해 우려' : '',
      ].filter(Boolean);
      const cc = [h.cause, h.consequence].filter(Boolean).join(' → ');
      const tw = leftW - 0.45;
      slide.addText(
        [
          { text: `${k + 1}  `, options: { bold: true, color: bar, fontSize: SITU_PT } },
          { text: h.situation, options: { bold: true, color: T.colors.primary, fontSize: SITU_PT, breakLine: !chips.length } },
          ...(chips.length ? [{ text: `   ${chips.join(' · ')}`, options: { bold: true, color: bar, fontSize: T.typeScale.kicker, breakLine: true } }] : []),
          ...(cc ? [{ text: cc, options: { color: T.colors.muted, fontSize: T.typeScale.body, breakLine: true } }] : []),
          { text: '대책  ', options: { bold: true, color: T.colors.text, fontSize: BODY_PT } },
          { text: h.measures.length ? h.measures.join('  /  ') : '-', options: { color: T.colors.text, fontSize: BODY_PT } },
        ],
        { x: X0 + 0.25, y: y + 0.08, w: tw, h: blockH - 0.28, fontFace, valign: 'top', lineSpacingMultiple: T.lineSpacing },
      );
      check(no, code, h.id, 'situation', h.situation, tw, SITU_PT, 2);
      check(no, code, h.id, 'measures', h.measures.join('  /  '), tw, BODY_PT, 2);
    });
    if (omitted.length) {
      slide.addText(`외 ${omitted.length}건 — 위험성평가표에서 확인`, { x: X0, y: bottom - 0.02, w: leftW, h: 0.3, fontFace, fontSize: T.typeScale.body, color: T.colors.muted });
    }

    // 오른쪽 — 확인 질문 + 서명란(빈칸)
    const qs = task.questions?.length ? task.questions.slice(0, 2) : ['', ''];
    if ((task.questions?.length ?? 0) > 2) warnings.push(`${task.id}: 확인 질문은 앞 2개만 싣는다`);
    slide.addText('확인 질문', { x: rx, y: 1.15, w: rw, h: 0.34, fontFace, fontSize: T.typeScale.h2, bold: true, color: T.colors.primary });
    slide.addShape(pptx.ShapeType.rect, { x: rx, y: 1.6, w: rw, h: 1.7, fill: { color: T.colors.band }, line: { color: T.colors.band, width: 0 } });
    slide.addText(
      qs.flatMap((q, i) => [{ text: `${i + 1}. ${q || '______________________'}\n`, options: { color: q ? T.colors.text : T.colors.muted, fontSize: BODY_PT } }]),
      { x: rx + 0.15, y: 1.7, w: rw - 0.3, h: 1.5, fontFace, valign: 'top', lineSpacingMultiple: 1.4 },
    );
    qs.forEach((q, i) => check(no, code, task.id, `questions[${i}]`, q, rw - 0.3, BODY_PT, 2));

    slide.addText('확인 서명', { x: rx, y: 3.5, w: rw, h: 0.34, fontFace, fontSize: T.typeScale.h2, bold: true, color: T.colors.primary });
    const headCell = (t: string) => ({ text: t, options: { bold: true, fill: { color: T.table.headerFill }, color: T.colors.primary, align: 'center' } });
    const rows: { text: string; options?: Record<string, unknown> }[][] = [[headCell('번호'), headCell('소속·역할'), headCell('서명')]];
    for (let r = 1; r <= signatureRows; r++) rows.push([{ text: String(r), options: { align: 'center' } }, { text: '' }, { text: '' }]);
    const styled = rows.map((row, ri) =>
      row.map((cell) => ({
        ...cell,
        options: { color: T.colors.text, margin: [2, 5, 2, 5], ...cell.options, border: [ri <= 1 ? RULE : INNER, NONE, ri === 0 || ri === rows.length - 1 ? RULE : INNER, NONE] },
      })),
    );
    const rowH = Math.min(0.4, (H - 0.95 - 3.95) / (signatureRows + 1));
    slide.addTable(styled as never, { x: rx, y: 3.95, w: rw, colW: [rw * 0.18, rw * 0.42, rw * 0.4], rowH, fontFace, fontSize: T.typeScale.table, valign: 'middle' });

    // 꼬리
    slide.addShape(pptx.ShapeType.line, { x: X0, y: H - 0.5, w: contentW, h: 0, line: { color: T.colors.line, width: 0.5 } });
    slide.addText(`${snapshot.site}  ·  작업 전 안전점검(TBM)`, { x: X0, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    slide.addText(
      `데이터 기준 ${snapshot.basisDate}${snapshot.revision ? ` · ${snapshot.revision}` : ''} · ${TBM_TEMPLATE_VERSION}   ${no}`,
      { x: X0 + contentW / 2, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted, align: 'right' },
    );
    slide.addNotes(
      anchors.length
        ? ['근거 anchor:', ...anchors.map((a) => {
            const m = anchorMap.get(a);
            return `- ${a}${m ? ` — ${[m.source, m.location].filter(Boolean).join(' ')}` : ''}`;
          })].join('\n')
        : '근거 anchor: 없음',
    );
  });

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, picks, overflowEstimates: overflow, warnings };
}

/** 프리셋 판 TBM 위험 목록 칸 — 그리기와 designsFor 가 같이 쓴다 */
export const TBM_DESIGN_SPEC: Omit<ListSpec, 'area'> = {
  code: 'T',
  cols: [
    { key: 'flags', caption: '구분', ratio: 1.3, status: true, keep: true },
    { key: 'situation', caption: '위험', ratio: 2.6, dot: true },
    { key: 'cause', caption: '원인 → 결과', ratio: 1.9 },
    { key: 'measures', caption: '대책', ratio: 2.6 },
  ],
  stripe: true,
};
/** 왼쪽 위험 목록 폭 비율 · 오른쪽 칸 사이 간격(px) */
export const TBM_LEFT = 0.6;
export const TBM_GAP = 48;

export function tbmDesignRows(shown: TbmHazard[]): ListRow[] {
  return shown.map((h, k) => {
    const chips = [
      h.acceptability && h.acceptability !== 'acceptable' ? ACC_LABEL[h.acceptability] : '',
      h.kind === 'new' ? '신규' : h.kind === 'changed' ? '변경' : '',
      h.seriousConcern ? '중대재해 우려' : '',
    ].filter(Boolean);
    const tone = h.acceptability === 'unacceptable' ? 'negative' : h.acceptability === 'conditional' ? 'caution' : 'ink2';
    return {
      id: h.id,
      cells: [
        { text: [String(k + 1), ...chips].join(' · '), bold: true, color: tone },
        { text: h.situation, bold: true },
        { text: [h.cause, h.consequence].filter(Boolean).join(' → ') || '-' },
        { text: h.measures.length ? h.measures.join('  /  ') : '-' },
      ],
    };
  });
}

/** 작업 장 제목 — 기본 출력과 같다 */
export const tbmTitle = (task: TbmTask) => (task.place ? `${task.process}  ·  ${task.place}` : task.process);

// ───── 프리셋 판(design) — 작업마다 한 장(글이 길면 이어지는 장) · 왼쪽 위험 목록 · 오른쪽 확인 질문 + 서명란 ─────
// 고르는 순서·싣는 글·확인 질문 2개·노트(근거 anchor)는 기본 출력과 같다. 글 언어 ko-KR.
async function makeTbmDesign(snapshot: TbmSnapshot, opts: TbmOptions, D: DeckDesign): Promise<TbmPptxResult> {
  const maxHazards = opts.maxHazards ?? 3;
  const signatureRows = opts.signatureRows ?? 8;
  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const warnings: string[] = [];
  const overflow: OverflowEstimate[] = [];
  const slides: TbmSlideInfo[] = [];
  const picks: TbmPick[] = [];
  const anchorMap = new Map((snapshot.anchors ?? []).map((a) => [a.id, a]));
  const pptx = new PptxGenJS();
  const { S } = pickLayout(pptx, opts.layout, true);
  const kit: Kit = { pptx, d: D, s: S, fontFace };
  const X = D.head.left;
  const BW = D.head.right - D.head.left;
  const leftW = BW * TBM_LEFT;
  const rx = X + leftW + TBM_GAP;
  const rw = BW - leftW - TBM_GAP;
  const meta = `작업 전 안전점검(TBM)  ·  ${snapshot.workDate}${snapshot.cycle ? `  ·  ${snapshot.cycle}` : ''}`;
  const notesOf = (anchors: string[]) =>
    anchors.length
      ? ['근거 anchor:', ...anchors.map((a) => {
          const m = anchorMap.get(a);
          return `- ${a}${m ? ` — ${[m.source, m.location].filter(Boolean).join(' ')}` : ''}`;
        })].join('\n')
      : '근거 anchor: 없음';

  snapshot.tasks.forEach((task, ti) => {
    const code = `T${ti + 1}`;
    const { shown, omitted } = pick(task.hazards, maxHazards);
    picks.push({ taskId: task.id, shown: shown.map((h) => h.id), omitted: omitted.map((h) => h.id) });
    const anchors = [...new Set(shown.flatMap((h) => h.anchors ?? []))];
    for (const a of anchors) if (!anchorMap.has(a)) warnings.push(`anchors 에 없는 근거 id: ${a}`);
    if (!task.questions?.length) warnings.push(`${task.id}: 확인 질문이 없어 빈 줄로 둔다(지어 쓰지 않음)`);
    if ((task.questions?.length ?? 0) > 2) warnings.push(`${task.id}: 확인 질문은 앞 2개만 싣는다`);
    const title = tbmTitle(task);
    const lead = `오늘 이 작업에서 조심할 것 ${shown.length}가지${omitted.length ? `  ·  외 ${omitted.length}건 — 위험성평가표에서 확인` : ''}`;
    const page = (pi: number, n: number, override?: string): Page => {
      const t = override ?? `${title}${n > 1 ? ` (${pi + 1}/${n})` : ''}`;
      const slide = koSlide(pptx.addSlide());
      const no = slides.length + 1;
      slides.push({ no, code, taskId: task.id, title: t, anchors });
      const box = drawHead(pptx, slide, D, S, {
        no, meta, title: t, lead, fontFace, grow: true,
        footLeft: `${snapshot.site}  ·  작업 전 안전점검(TBM)`,
        footRight: `데이터 기준 ${snapshot.basisDate}${snapshot.revision ? ` · ${snapshot.revision}` : ''} · ${TBM_TEMPLATE_VERSION}   ${no}`,
      });
      (slide as unknown as { addNotes(t: string): void }).addNotes(notesOf(anchors));
      return { slide, no, box };
    };
    const pages = listPages({
      kit, code, cap: maxHazards, emptyText: '', overflow, warnings,
      roomPx: bodyRoomFor(D, S, { title: `${title} (9/9)`, lead, grow: true }),
      spec: { ...TBM_DESIGN_SPEC, code, area: { x: X, w: leftW } },
      rows: tbmDesignRows(shown),
      newPage: (pi, n) => page(pi, n),
    });
    // 오른쪽 — 확인 질문(입력 원문, 없으면 빈 줄) + 확인 서명(빈칸). 첫 장에만
    const p = pages[0];
    const ctx = { ...kit, slide: p.slide };
    const top = p.box.top / S.k;
    const qs = task.questions?.length ? task.questions.slice(0, 2) : ['', ''];
    const qParts = [
      { text: '확인 질문', bold: true, breakLine: true },
      ...qs.map((q, i) => ({ text: `${i + 1}. ${q || '______________________'}`, tone: q ? ('ink' as const) : ('ink2' as const), breakLine: i < qs.length - 1 })),
    ];
    const qh = drawCallout(ctx, { x: rx, y: top, w: rw }, qParts);
    const room = (p.box.bottom - p.box.top) / S.k;
    checkCallout(kit, p.no, code, task.id, 'questions', qs.join(' '), rw, qh, room, overflow, warnings);
    const labelY = top + qh + 28;
    const labelH = D.tokens.type.label * 1.3;
    p.slide.addText('확인 서명', { x: S.x(rx), y: S.y(labelY), w: S.x(rw), h: S.y(labelH), fontFace, fontSize: S.pt(D.tokens.type.label), bold: true, color: D.tokens.colors.ink, valign: 'middle', margin: 0 });
    const signTop = labelY + labelH + 12;
    const signOpts = { headers: ['번호', '소속·역할', '서명'], ratios: [0.9, 2.1, 2.0] };
    const r = drawSign(ctx, { ...p.box, top: S.y(signTop) }, signatureRows, { ...signOpts, area: { x: rx, w: rw }, tables: 1 });
    if (r.shrunk) warnings.push(`${code}(${D.id}) ${p.no}장: 서명란 ${r.drawn}행이 본문 높이에 들도록 글자를 ${r.pt}pt 로 줄였다`);
    // 본문 높이에 다 들지 않으면 남은 행은 이어지는 장(본문 전체 폭, 두 표)에 — 번호는 이어서
    let next = r.drawn + 1;
    let rest = r.rest;
    if (rest > 0) warnings.push(`${code}(${D.id}) ${p.no}장: 서명란 ${signatureRows}행 중 ${r.drawn}행만 본문 높이에 들어 ${rest}행은 이어지는 장에 실었다`);
    while (rest > 0) {
      const q = page(0, 1, `${title} — 확인 서명(이어서)`);
      const rr = drawSign({ ...kit, slide: q.slide }, q.box, rest, { ...signOpts, startNo: next });
      next += rr.drawn;
      rest = rr.rest;
    }
  });

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, picks, overflowEstimates: overflow, warnings };
}
