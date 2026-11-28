// 위험성평가 교육 교안 — 우리 사업장 위험성평가 결과를 근로자 안전보건교육 자료로 다시 그린다(전파 덱 3종 중 3).
// 근거(261127 법제처 원문 확인, MST 288431 · 시행 2026-08-01): 산업안전보건법 시행규칙 별표 5
//   제1호 가목(근로자 정기교육)·다목(채용 시 교육 및 작업내용 변경 시 교육) 「위험성 평가에 관한 사항」 · 고시 제17조②.
// 문장은 입력 원문 그대로(지어 쓰지 않음). 사례는 입력이 준 것만, 출처를 장에 적는다. 서명부는 빈칸. fs·네트워크 없음.
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';
import { capacityOf, textUnits, type OverflowEstimate } from './meeting';
import { pick, type TbmHazard } from './tbm';
import { DESIGN_IDS, getDeckDesign, isDesignId, type DeckDesign, type DesignId } from './design/index';
import { drawHead } from './design/head';
import { drawB1, type Kpi } from './design/parts';
import { koSlide } from './design/lang';
import { drawSign, type ListRow, type ListSpec } from './design/lists';
import { checkCallout, drawCallout, listPages, pickLayout, recordChecks, roomPxOf, type Kit, type Page } from './design/deck';
import { LINE_H, wrapLines } from './design/b3-geometry';

export const EDUCATION_TEMPLATE_VERSION = 'education-v0';

export type EducationCourse = 'regular' | 'hire' | 'change';

export interface EducationCase {
  id: string;
  title: string;
  text: string;
  accidentType?: string;
  /** 출처(재해 사례집·사내 기록 등). 장에 그대로 적는다 */
  source?: string;
}

export interface EducationQuiz {
  question: string;
  answer?: string;
}

export interface EducationSnapshot {
  site: string;
  basisDate: string;
  educationDate: string;
  course: EducationCourse;
  cycle?: string;
  hazards: TbmHazard[];
  cases?: EducationCase[];
  quiz?: EducationQuiz[];
}

export interface EducationOptions {
  /** 주요 위험 장에 싣는 개수 1~12. 기본 6 */
  topN?: number;
  /** 교육 확인 서명부 행 수 1~30. 기본 16 */
  signatureRows?: number;
  fontFace?: string;
  /** 판형. 기본 A4 가로 — 단 design 을 고르고 판형을 주지 않으면 16:9 */
  layout?: 'A4' | '16:9';
  /** 디자인 프리셋. 미지정이면 지금 출력 그대로 */
  design?: DesignId;
}

export interface EducationSlideInfo {
  no: number;
  code: string;
  title: string;
}

export interface EducationSummary {
  total: number;
  unacceptable: number;
  conditional: number;
  acceptable: number;
  unknown: number;
  /** 재해 유형(consequence) 별 개수, 많은 순(같으면 입력 순) */
  byConsequence: [string, number][];
}

export interface EducationPptxResult {
  ok: boolean;
  bytes?: Uint8Array;
  slides: EducationSlideInfo[];
  summary?: EducationSummary;
  shown: string[];
  omitted: string[];
  overflowEstimates: OverflowEstimate[];
  warnings: string[];
  errors?: string[];
}

const T = MEETING_THEME;
export const COURSE: Record<EducationCourse, { label: string; basis: string }> = {
  regular: { label: '정기교육', basis: '산업안전보건법 시행규칙 별표 5 제1호 가목 「위험성 평가에 관한 사항」' },
  hire: { label: '채용 시 교육', basis: '산업안전보건법 시행규칙 별표 5 제1호 다목 「위험성 평가에 관한 사항」' },
  change: { label: '작업내용 변경 시 교육', basis: '산업안전보건법 시행규칙 별표 5 제1호 다목 「위험성 평가에 관한 사항」' },
};
const ACC_LABEL = { unacceptable: '허용 불가', conditional: '조건부', acceptable: '허용' } as const;
const isStr = (v: unknown): v is string => typeof v === 'string';
const filled = (v: unknown) => isStr(v) && v.trim().length > 0;
const optStr = (v: unknown) => v === undefined || isStr(v);

function validate(s: unknown, opts: EducationOptions): string[] {
  const e: string[] = [];
  if (!s || typeof s !== 'object') return ['스냅숏이 객체가 아니다'];
  const o = s as Record<string, unknown>;
  for (const k of ['site', 'basisDate', 'educationDate']) if (!filled(o[k])) e.push(`${k}: 글자 필수`);
  if (!optStr(o.cycle)) e.push('cycle: 글자여야 한다');
  if (!(isStr(o.course) && o.course in COURSE)) e.push('course: regular·hire·change 중 하나');
  const n = opts.topN ?? 6;
  if (!Number.isInteger(n) || n < 1 || n > 12) e.push('topN 은 1~12');
  const sr = opts.signatureRows ?? 16;
  if (!Number.isInteger(sr) || sr < 1 || sr > 30) e.push('signatureRows 는 1~30');
  if (!Array.isArray(o.hazards) || !o.hazards.length) e.push('hazards: 위험요인이 하나 이상 있어야 한다 — 원장에서 먼저 고른다');
  else
    (o.hazards as unknown[]).forEach((h, i) => {
      const at = `hazards[${i}]`;
      if (!h || typeof h !== 'object') return e.push(`${at}: 객체여야 한다`);
      const hz = h as Record<string, unknown>;
      if (!filled(hz.id)) e.push(`${at}.id: 글자 필수`);
      if (!filled(hz.situation)) e.push(`${at}.situation: 글자 필수`);
      if (!(Array.isArray(hz.measures) && hz.measures.every(isStr))) e.push(`${at}.measures: 글자 배열 필수`);
      for (const k of ['cause', 'consequence', 'grade']) if (!optStr(hz[k])) e.push(`${at}.${k}: 글자여야 한다`);
      if (hz.acceptability !== undefined && !((hz.acceptability as string) in ACC_LABEL)) e.push(`${at}.acceptability: unacceptable·conditional·acceptable 중 하나`);
    });
  if (o.cases !== undefined) {
    if (!Array.isArray(o.cases)) e.push('cases: 배열이어야 한다');
    else
      (o.cases as unknown[]).forEach((c, i) => {
        const cs = (c ?? {}) as Record<string, unknown>;
        for (const k of ['id', 'title', 'text']) if (!filled(cs[k])) e.push(`cases[${i}].${k}: 글자 필수`);
        for (const k of ['accidentType', 'source']) if (!optStr(cs[k])) e.push(`cases[${i}].${k}: 글자여야 한다`);
      });
  }
  if (o.quiz !== undefined) {
    if (!Array.isArray(o.quiz)) e.push('quiz: 배열이어야 한다');
    else
      (o.quiz as unknown[]).forEach((q, i) => {
        const qz = (q ?? {}) as Record<string, unknown>;
        if (!filled(qz.question)) e.push(`quiz[${i}].question: 글자 필수`);
        if (!optStr(qz.answer)) e.push(`quiz[${i}].answer: 글자여야 한다`);
      });
  }
  return e;
}

export function summarize(hazards: TbmHazard[]): EducationSummary {
  const count = (a?: string) => hazards.filter((h) => h.acceptability === a).length;
  const by = new Map<string, number>();
  for (const h of hazards) if (h.consequence?.trim()) by.set(h.consequence.trim(), (by.get(h.consequence.trim()) ?? 0) + 1);
  const byConsequence = [...by.entries()].map((x, i) => ({ x, i })).sort((a, b) => b.x[1] - a.x[1] || a.i - b.i).map((v) => v.x);
  return { total: hazards.length, unacceptable: count('unacceptable'), conditional: count('conditional'), acceptable: count('acceptable'), unknown: count(undefined), byConsequence };
}

export async function makeEducationPptx(snapshot: EducationSnapshot, opts: EducationOptions = {}): Promise<EducationPptxResult> {
  const errors = validate(snapshot, opts);
  if (opts.design !== undefined && !isDesignId(opts.design)) errors.push(`design 은 ${DESIGN_IDS.join('·')} 중 하나(받은 값 ${String(opts.design)})`);
  if (errors.length) return { ok: false, slides: [], shown: [], omitted: [], overflowEstimates: [], warnings: [], errors };
  if (opts.design) return makeEducationDesign(snapshot, opts, getDeckDesign(opts.design));

  const s = snapshot;
  const topN = opts.topN ?? 6;
  const signatureRows = opts.signatureRows ?? 16;
  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const course = COURSE[s.course];
  const warnings: string[] = [];
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
  const BODY = T.typeScale.body + 2;
  const slides: EducationSlideInfo[] = [];
  const overflow: OverflowEstimate[] = [];
  const NONE = { type: 'none' as const };
  const INNER = { type: 'solid' as const, pt: T.table.innerLinePt, color: T.colors.line };
  const RULE = { type: 'solid' as const, pt: T.table.ruleLinePt, color: T.colors.primary };

  const newSlide = (code: string, title: string, lead?: string) => {
    const slide = pptx.addSlide();
    const no = slides.length + 1;
    slides.push({ no, code, title });
    slide.background = { color: T.colors.bg };
    slide.addText(`안전보건교육 · ${course.label} · 위험성평가  ·  ${s.educationDate}`, { x: X0, y: 0.28, w: contentW, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, color: T.colors.accent, charSpacing: 0.5 });
    slide.addText(title, { objectName: 'title', x: X0, y: 0.55, w: contentW, h: 0.6, fontFace, fontSize: T.typeScale.title + 2, bold: true, color: T.colors.primary });
    if (lead) slide.addText(lead, { x: X0, y: 1.12, w: contentW, h: 0.34, fontFace, fontSize: T.typeScale.lead, color: T.colors.muted });
    slide.addShape(pptx.ShapeType.line, { x: X0, y: H - 0.5, w: contentW, h: 0, line: { color: T.colors.line, width: 0.5 } });
    slide.addText(`${s.site}  ·  위험성평가 교육`, { x: X0, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    slide.addText(`데이터 기준 ${s.basisDate}${s.cycle ? ` · ${s.cycle}` : ''} · ${EDUCATION_TEMPLATE_VERSION}   ${no}`, {
      x: X0 + contentW / 2, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted, align: 'right',
    });
    return { slide, no };
  };
  const fit = (ratio: number[]) => {
    const sum = ratio.reduce((a, b) => a + b, 0);
    return ratio.map((r) => (r / sum) * contentW);
  };
  const head = (labels: string[]) => labels.map((t) => ({ text: t, options: { bold: true, fill: { color: T.table.headerFill }, color: T.colors.primary, align: 'center' } }));
  const style = (rows: { text: string; options?: Record<string, unknown> }[][], margin: number[]) =>
    rows.map((row, ri) => row.map((cell) => ({ ...cell, options: { color: T.colors.text, margin, ...cell.options, border: [ri <= 1 ? RULE : INNER, NONE, ri === 0 || ri === rows.length - 1 ? RULE : INNER, NONE] } })));

  const summary = summarize(s.hazards);
  const { shown, omitted } = pick(s.hazards, topN);

  // E1 표지 — 교육 종류·근거
  {
    const { slide } = newSlide('E1', '우리 사업장 위험성평가 결과', `${s.site} · ${course.label} · ${s.educationDate}`);
    slide.addShape(pptx.ShapeType.rect, { x: X0, y: 2.0, w: contentW, h: 2.2, fill: { color: T.colors.band }, line: { color: T.colors.band, width: 0 } });
    slide.addShape(pptx.ShapeType.rect, { x: X0, y: 2.0, w: 0.08, h: 2.2, fill: { color: T.colors.primary }, line: { color: T.colors.primary, width: 0 } });
    slide.addText(
      [
        { text: '이 교육은', options: { fontSize: BODY, color: T.colors.muted, breakLine: true } },
        { text: course.basis, options: { fontSize: BODY + 2, bold: true, color: T.colors.primary, breakLine: true } },
        { text: '에 따라 우리 사업장 위험성평가 결과를 함께 확인하는 시간입니다.', options: { fontSize: BODY, color: T.colors.text } },
      ],
      { x: X0 + 0.35, y: 2.15, w: contentW - 0.6, h: 1.9, fontFace, valign: 'middle', paraSpaceAfter: 6 },
    );
    slide.addText('순서: 결과 요약 → 주요 위험과 대책 → 사고 사례 → 확인 문제 → 교육 확인 서명', { x: X0, y: 4.6, w: contentW, h: 0.4, fontFace, fontSize: BODY, color: T.colors.text });
  }

  // E2 결과 요약 — 허용 여부별 개수 + 재해 유형 상위
  {
    const { slide } = newSlide('E2', '평가 결과 한눈에', `평가한 위험요인 ${summary.total}건`);
    const kpis: [string, number, string][] = [
      ['허용 불가 — 바로 줄여야 할 위험', summary.unacceptable, T.colors.negative],
      ['조건부 — 대책을 지키면 작업 가능', summary.conditional, T.colors.caution],
      ['허용 — 지금 대책 유지', summary.acceptable, T.colors.positive],
    ];
    const cw = (contentW - 0.3 * 2) / 3;
    kpis.forEach(([label, value, color], i) => {
      const x = X0 + i * (cw + 0.3);
      slide.addShape(pptx.ShapeType.rect, { x, y: 1.7, w: cw, h: 1.9, fill: { color: T.colors.band }, line: { color: T.colors.band, width: 0 } });
      slide.addShape(pptx.ShapeType.rect, { x, y: 1.7, w: cw, h: 0.06, fill: { color }, line: { color, width: 0 } });
      slide.addText(label, { x: x + 0.2, y: 1.85, w: cw - 0.4, h: 0.45, fontFace, fontSize: T.typeScale.body, bold: true, color: T.colors.muted });
      slide.addText(String(value), { x: x + 0.2, y: 2.4, w: cw - 0.4, h: 1.0, fontFace, fontSize: T.typeScale.kpi - 6, bold: true, color });
    });
    if (summary.unknown) slide.addText(`허용 여부 판정 전 ${summary.unknown}건`, { x: X0, y: 3.7, w: contentW, h: 0.3, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    const top = summary.byConsequence.slice(0, 5);
    if (top.length) {
      const w = fit([4, 1]);
      slide.addTable(style([head(['많이 나온 재해 유형', '위험요인 수']), ...top.map(([k, v]) => [{ text: k }, { text: `${v}건`, options: { align: 'center' } }])], [4, 6, 4, 6]) as never, {
        x: X0, y: 4.15, w: contentW, colW: w, fontFace, fontSize: BODY, valign: 'middle',
      });
    }
  }

  // E3 주요 위험과 대책 — TBM 과 같은 고르는 순서
  {
    const { slide, no } = newSlide('E3', '꼭 알아야 할 위험과 대책', omitted.length ? `위험이 큰 순서로 ${shown.length}건 — 나머지 ${omitted.length}건은 위험성평가표에서 확인` : undefined);
    const w = fit([1.1, 3.6, 1.2, 3.6]);
    const accColor = (a?: string) => (a === 'unacceptable' ? T.colors.negative : a === 'conditional' ? T.colors.caution : a === 'acceptable' ? T.colors.positive : T.colors.muted);
    const rows = shown.map((h) => [
      { text: h.acceptability ? ACC_LABEL[h.acceptability] : '-', options: { bold: true, align: 'center', color: accColor(h.acceptability) } },
      { text: h.situation },
      { text: h.consequence || '-', options: { align: 'center' } },
      { text: h.measures.length ? h.measures.join(' / ') : '-' },
    ]);
    slide.addTable(style([head(['허용 여부', '위험', '재해 유형', '대책']), ...rows], [4, 6, 4, 6]) as never, { x: X0, y: 1.6, w: contentW, colW: w, fontFace, fontSize: BODY, valign: 'middle' });
    shown.forEach((h) => {
      const text = h.measures.join(' / ');
      const capacity = capacityOf(w[3], BODY, 3);
      if (textUnits(text) > capacity) overflow.push({ slide: no, code: 'E3', ref: h.id, field: 'measures', chars: text.length, capacity });
    });
  }

  // E4 사고 사례 — 입력이 준 것만, 출처 표시
  const cases = s.cases ?? [];
  if (!cases.length) warnings.push('사례가 없어 E4 를 뺐다(사례는 지어 쓰지 않음 — 재해 사례집 등 출처가 있는 것을 넣는다)');
  cases.slice(0, 2).forEach((c, i, all) => {
    const { slide, no } = newSlide('E4', `이런 사고가 있었습니다${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, c.accidentType ? `재해 유형: ${c.accidentType}` : undefined);
    slide.addText(c.title, { x: X0, y: 1.6, w: contentW, h: 0.45, fontFace, fontSize: BODY + 2, bold: true, color: T.colors.primary });
    slide.addText(c.text, { x: X0, y: 2.15, w: contentW, h: H - 3.3, fontFace, fontSize: BODY, color: T.colors.text, valign: 'top', fill: { color: T.colors.band }, margin: 10 });
    slide.addText(`출처: ${c.source?.trim() || '미기재'}`, { x: X0, y: H - 1.0, w: contentW, h: 0.3, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    const capacity = capacityOf(contentW, BODY, 10);
    if (textUnits(c.text) > capacity) overflow.push({ slide: no, code: 'E4', ref: c.id, field: 'text', chars: c.text.length, capacity });
  });
  if (cases.length > 2) warnings.push(`사례 ${cases.length}건 중 2건만 실었다`);

  // E5 확인 문제 — 입력 원문, 없으면 빈 줄
  {
    const quiz = (s.quiz ?? []).slice(0, 5);
    const { slide } = newSlide('E5', '확인 문제', '교육 내용을 이해했는지 함께 확인합니다.');
    if (!quiz.length) {
      warnings.push('확인 문제가 없어 빈 줄로 두었다(지어 쓰지 않음)');
      for (let i = 0; i < 3; i++) {
        slide.addText(`${i + 1}.`, { x: X0, y: 1.8 + i * 1.0, w: 0.4, h: 0.4, fontFace, fontSize: BODY, bold: true, color: T.colors.primary });
        slide.addShape(pptx.ShapeType.line, { x: X0 + 0.45, y: 2.15 + i * 1.0, w: contentW - 0.45, h: 0, line: { color: T.colors.line, width: 0.75 } });
      }
    } else {
      quiz.forEach((q, i) => {
        const y = 1.75 + i * 1.0;
        slide.addText(`${i + 1}. ${q.question}`, { x: X0, y, w: contentW, h: 0.45, fontFace, fontSize: BODY, bold: true, color: T.colors.text });
        slide.addShape(pptx.ShapeType.line, { x: X0 + 0.3, y: y + 0.8, w: contentW - 0.3, h: 0, line: { color: T.colors.line, width: 0.75, dashType: 'dash' } });
      });
      // 답은 발표자 노트에만 — 장에는 빈 줄
      const notes = quiz.map((q, i) => `${i + 1}. ${q.answer?.trim() || '(답 미기재)'}`).join('\n');
      slide.addNotes(`답(입력 원문)\n${notes}`);
    }
  }

  // E6 교육 확인 서명부(빈칸)
  {
    const { slide } = newSlide('E6', '교육 확인 서명부', `${course.label} · ${s.educationDate} · 교육 시간과 교육자는 사업장 기록 서식에 적는다`);
    const half = Math.ceil(signatureRows / 2);
    const colW = [0.6, 2.0, 1.5, 1.2];
    const tw = colW.reduce((a, b) => a + b, 0);
    for (let part = 0; part < 2; part++) {
      const start = part * half;
      const n = Math.min(half, signatureRows - start);
      if (n <= 0) break;
      const rows = [head(['번호', '소속·역할', '날짜', '서명']), ...Array.from({ length: n }, (_, i) => [{ text: String(start + i + 1), options: { align: 'center' } }, { text: '' }, { text: '' }, { text: '' }])];
      const rowH = Math.min(0.42, (H - 0.95 - 1.7) / (half + 1));
      slide.addTable(style(rows, [2, 5, 2, 5]) as never, { x: X0 + part * (tw + 0.4), y: 1.7, w: tw, colW, rowH, fontFace, fontSize: T.typeScale.table, valign: 'middle' });
    }
  }

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return {
    ok: true,
    bytes: new Uint8Array(out as ArrayBuffer),
    slides,
    summary,
    shown: shown.map((h) => h.id),
    omitted: omitted.map((h) => h.id),
    overflowEstimates: overflow,
    warnings,
  };
}

// ───── 프리셋 판(design) — 전 장 프리셋 부품 배치 · 글 언어 ko-KR · 장 순서·내용은 기본 출력과 같다 ─────
// E1 안내 상자 · E2 요약 수 부품(drawB1) + 재해 유형 목록 · E3 목록 · E4 사례 상자 · E5 문제 목록(답은 노트) · E6 서명란.
async function makeEducationDesign(s: EducationSnapshot, opts: EducationOptions, D: DeckDesign): Promise<EducationPptxResult> {
  const topN = opts.topN ?? 6;
  const signatureRows = opts.signatureRows ?? 16;
  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const course = COURSE[s.course];
  const warnings: string[] = [];
  const overflow: OverflowEstimate[] = [];
  const slides: EducationSlideInfo[] = [];
  const pptx = new PptxGenJS();
  const { S } = pickLayout(pptx, opts.layout, true);
  const kit: Kit = { pptx, d: D, s: S, fontFace };
  const X = D.head.left;
  const BW = D.head.right - D.head.left;
  const meta = `안전보건교육 · ${course.label} · 위험성평가  ·  ${s.educationDate}`;
  const page = (code: string, title: string, lead?: string): Page => {
    const slide = koSlide(pptx.addSlide());
    const no = slides.length + 1;
    slides.push({ no, code, title });
    const box = drawHead(pptx, slide, D, S, {
      no,
      meta,
      title,
      lead,
      fontFace,
      grow: true,
      footLeft: `${s.site}  ·  위험성평가 교육`,
      footRight: `데이터 기준 ${s.basisDate}${s.cycle ? ` · ${s.cycle}` : ''} · ${EDUCATION_TEMPLATE_VERSION}   ${no}`,
    });
    return { slide, no, box };
  };
  const titled = (t: string, pi: number, n: number) => `${t}${n > 1 ? ` (${pi + 1}/${n})` : ''}`;
  const summary = summarize(s.hazards);
  const { shown, omitted } = pick(s.hazards, topN);
  const ink2 = D.tokens.colors.ink2;

  // E1 표지 — 교육 종류·근거
  {
    const p = page('E1', '우리 사업장 위험성평가 결과', `${s.site} · ${course.label} · ${s.educationDate}`);
    const top = p.box.top / S.k;
    const parts = [
      { text: '이 교육은', tone: 'ink2' as const, breakLine: true },
      { text: course.basis, bold: true, breakLine: true },
      { text: '에 따라 우리 사업장 위험성평가 결과를 함께 확인하는 시간입니다.' },
    ];
    const h = drawCallout({ ...kit, slide: p.slide }, { x: X, y: top, w: BW }, parts);
    const order = '순서: 결과 요약 → 주요 위험과 대책 → 사고 사례 → 확인 문제 → 교육 확인 서명';
    const note = D.tokens.type.note;
    const oh = wrapLines(order, capacityOf(S.x(BW), S.pt(note), 1)) * note * LINE_H + 12;
    p.slide.addText(order, { x: S.x(X), y: S.y(top + h + 32), w: S.x(BW), h: S.y(oh), fontFace, fontSize: S.pt(D.tokens.type.note), color: ink2, valign: 'top', margin: 0 });
  }

  // E2 결과 요약 — 허용 여부별 개수(요약 수 부품) · 재해 유형 상위는 다음 장 목록
  {
    const p = page('E2', '평가 결과 한눈에', `평가한 위험요인 ${summary.total}건`);
    const kpis: Kpi[] = [
      { key: 'unacceptable', label: '허용 불가 — 바로 줄여야 할 위험', value: String(summary.unacceptable), risk: true },
      { key: 'conditional', label: '조건부 — 대책을 지키면 작업 가능', value: String(summary.conditional), risk: false },
      { key: 'acceptable', label: '허용 — 지금 대책 유지', value: String(summary.acceptable), risk: false },
      ...(summary.unknown ? [{ key: 'unknown', label: '허용 여부 판정 전', value: String(summary.unknown), risk: false }] : []),
    ];
    const r = drawB1({ ...kit, slide: p.slide }, kpis, {
      note: summary.byConsequence.length ? '많이 나온 재해 유형은 다음 장에서 이어 봅니다.' : '',
      accentKey: 'unacceptable',
      mutedKey: 'unknown',
      flowLabels: ['바로 줄일 위험', '대책으로 관리하는 위험'],
    });
    if (r.shrunk.length) warnings.push(`E2(${D.id}): 한 번 축소 — ${r.shrunk.join(', ')}`);
    recordChecks(p.no, 'E2', D.id, r.checks, overflow, warnings);
  }
  const top5 = summary.byConsequence.slice(0, 5);
  if (top5.length)
    listPages({
      kit,
      code: 'E2',
      cap: 5,
      emptyText: '',
      overflow,
      warnings,
      roomPx: roomPxOf(D, S, false),
      spec: { code: 'E2', cols: [{ key: 'consequence', caption: '많이 나온 재해 유형', ratio: 4 }, { key: 'count', caption: '위험요인 수', ratio: 1 }] },
      rows: top5.map(([k, v]) => ({ id: k, cells: [{ text: k, bold: true }, { text: `${v}건` }] })),
      newPage: (pi, n) => page('E2', titled('많이 나온 재해 유형', pi, n)),
    });

  // E3 주요 위험과 대책 — TBM 과 같은 고르는 순서
  {
    const lead = omitted.length ? `위험이 큰 순서로 ${shown.length}건 — 나머지 ${omitted.length}건은 위험성평가표에서 확인` : undefined;
    const tone = (a?: string): 'negative' | 'caution' | 'positive' | 'ink2' => (a === 'unacceptable' ? 'negative' : a === 'conditional' ? 'caution' : a === 'acceptable' ? 'positive' : 'ink2');
    const spec: ListSpec = {
      code: 'E3',
      cols: [
        { key: 'acceptability', caption: '허용 여부', ratio: 1.1, status: true },
        { key: 'situation', caption: '위험', ratio: 3.6, dot: true },
        { key: 'consequence', caption: '재해 유형', ratio: 1.2 },
        { key: 'measures', caption: '대책', ratio: 3.6 },
      ],
    };
    const rows: ListRow[] = shown.map((h) => ({
      id: h.id,
      cells: [
        { text: h.acceptability ? ACC_LABEL[h.acceptability] : '-', bold: true, color: tone(h.acceptability) },
        { text: h.situation, bold: true },
        { text: h.consequence || '-' },
        { text: h.measures.length ? h.measures.join(' / ') : '-' },
      ],
    }));
    listPages({ kit, code: 'E3', spec, rows, cap: 12, emptyText: '', overflow, warnings, roomPx: roomPxOf(D, S, !!lead), newPage: (pi, n) => page('E3', titled('꼭 알아야 할 위험과 대책', pi, n), lead) });
  }

  // E4 사고 사례 — 입력이 준 것만, 출처 표시
  const cases = s.cases ?? [];
  if (!cases.length) warnings.push('사례가 없어 E4 를 뺐다(사례는 지어 쓰지 않음 — 재해 사례집 등 출처가 있는 것을 넣는다)');
  cases.slice(0, 2).forEach((c, i, all) => {
    const p = page('E4', `이런 사고가 있었습니다${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, c.accidentType ? `재해 유형: ${c.accidentType}` : undefined);
    const top = p.box.top / S.k;
    const h = drawCallout({ ...kit, slide: p.slide }, { x: X, y: top, w: BW }, [{ text: c.title, bold: true, breakLine: true }, { text: c.text }]);
    const src = `출처: ${c.source?.trim() || '미기재'}`;
    const sh = D.tokens.type.note * 1.2 + 4;
    p.slide.addText(src, { x: S.x(X), y: S.y(top + h + 20), w: S.x(BW), h: S.y(sh), fontFace, fontSize: S.pt(D.tokens.type.note), color: ink2, valign: 'top', margin: 0 });
    checkCallout(kit, p.no, 'E4', c.id, 'text', c.text, BW, h + 20 + sh, (p.box.bottom - p.box.top) / S.k, overflow, warnings);
  });
  if (cases.length > 2) warnings.push(`사례 ${cases.length}건 중 2건만 실었다`);

  // E5 확인 문제 — 입력 원문, 없으면 빈 줄 · 답은 발표자 노트에만
  {
    const quiz = (s.quiz ?? []).slice(0, 5);
    if (!quiz.length) warnings.push('확인 문제가 없어 빈 줄로 두었다(지어 쓰지 않음)');
    const qs = quiz.length ? quiz.map((q) => q.question) : ['', '', ''];
    const rows: ListRow[] = qs.map((q, i) => ({ id: `quiz[${i}]`, cells: [{ text: q ? `${i + 1}. ${q}` : `${i + 1}.`, bold: true }, { text: '' }] }));
    const lead = '교육 내용을 이해했는지 함께 확인합니다.';
    const pages = listPages({
      kit,
      code: 'E5',
      cap: 5,
      emptyText: '',
      overflow,
      warnings,
      roomPx: roomPxOf(D, S, true),
      spec: { code: 'E5', cols: [{ key: 'question', caption: '문제', ratio: 6 }, { key: 'answer', caption: '답 적는 칸', ratio: 3 }] },
      rows,
      newPage: (pi, n) => page('E5', titled('확인 문제', pi, n), lead),
    });
    if (quiz.length) {
      const notes = quiz.map((q, i) => `${i + 1}. ${q.answer?.trim() || '(답 미기재)'}`).join('\n');
      for (const pg of pages) (pg.slide as unknown as { addNotes(t: string): void }).addNotes(`답(입력 원문)\n${notes}`);
    }
  }

  // E6 교육 확인 서명부(빈칸)
  {
    const p = page('E6', '교육 확인 서명부', `${course.label} · ${s.educationDate} · 교육 시간과 교육자는 사업장 기록 서식에 적는다`);
    const r = drawSign({ ...kit, slide: p.slide }, p.box, signatureRows);
    if (r.shrunk) warnings.push(`E6(${D.id}) ${p.no}장: 서명부 ${signatureRows}행이 본문 높이에 들도록 글자를 ${r.pt}pt 로 줄였다`);
  }

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, summary, shown: shown.map((h) => h.id), omitted: omitted.map((h) => h.id), overflowEstimates: overflow, warnings };
}
