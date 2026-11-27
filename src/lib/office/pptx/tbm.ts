// TBM 카드 덱 — 위험성평가 원장에서 고른 작업별 위험을 작업 전에 근로자에게 전하는 덱(전파 덱 3종 중 1).
// 근거: 고시 제16조①3(매 작업일 공유) · 법 제36조④ 후단(중대재해 우려 요인 작업 전 상시 주지).
// 문장은 입력 원문 그대로 싣는다(지어 쓰지 않음). 실명 칸 없음 — 서명란은 빈칸. fs·네트워크 없음.
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';
import { capacityOf, textUnits, type MeetingAnchor, type OverflowEstimate } from './meeting';

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
  layout?: 'A4' | '16:9';
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
  if (errors.length) return { ok: false, slides: [], picks: [], overflowEstimates: [], warnings: [], errors };

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
