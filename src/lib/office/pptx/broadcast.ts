// 회의 결과 전파본 — 확정된 회의 스냅숏(회의 덱 final 과 같은 입력)을 근로자에게 전하는 덱으로 다시 그린다(전파 덱 3종 중 2).
// 근거: 법 제36조④ 전단(평가 결과 공유) · 규칙 제37조의3 2호(이행 결과 포함) · 고시 제17조(공유 방법).
// 문장은 스냅숏 원문 그대로(지어 쓰지 않음). 확인 서명란은 빈칸. fs·네트워크 없음.
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';
import { capacityOf, meetingSnapshotErrors, textUnits, type MeetingSnapshot, type OverflowEstimate } from './meeting';

export const BROADCAST_TEMPLATE_VERSION = 'broadcast-v0';

export interface BroadcastOptions {
  /** 공유 확인 서명란 행 수 1~30. 기본 12 */
  signatureRows?: number;
  fontFace?: string;
  layout?: 'A4' | '16:9';
}

export interface BroadcastSlideInfo {
  no: number;
  code: string;
  title: string;
}

export interface OpinionResult {
  opinionId: string;
  /** 이어진 결정 원문(여럿이면 「 / 」로). 없으면 「이번 회의에서 결정 없음」 */
  result: string;
  decisionIds: string[];
}

export interface BroadcastPptxResult {
  ok: boolean;
  bytes?: Uint8Array;
  slides: BroadcastSlideInfo[];
  opinionResults: OpinionResult[];
  overflowEstimates: OverflowEstimate[];
  warnings: string[];
  errors?: string[];
}

const T = MEETING_THEME;
const NO_DECISION = '이번 회의에서 결정 없음';
const ROWS = { B2: 6, B3: 7, B4: 6, B5: 8, B6: 7 } as const;

function paginate<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  if (!out.length) out.push([]);
  return out;
}

/** 의견 → 결정: 의견의 relatedIds 와 결정의 targetIds 가 겹치거나, 결정의 질문이 그 대상을 가리키면 이어진 것으로 본다 */
export function opinionResultsOf(s: MeetingSnapshot): OpinionResult[] {
  const qTargets = new Map((s.questions ?? []).map((q) => [q.id, q.targetIds ?? []]));
  return (s.opinions ?? []).map((o) => {
    const rel = new Set(o.relatedIds ?? []);
    const hit = (s.decisions ?? []).filter((d) => {
      const targets = [...(d.targetIds ?? []), ...(d.questionId ? (qTargets.get(d.questionId) ?? []) : [])];
      return targets.some((t) => rel.has(t));
    });
    return { opinionId: o.id, result: hit.length ? hit.map((d) => d.decision).join(' / ') : NO_DECISION, decisionIds: hit.map((d) => d.id) };
  });
}

export async function makeBroadcastPptx(snapshot: MeetingSnapshot, opts: BroadcastOptions = {}): Promise<BroadcastPptxResult> {
  const fail = (errors: string[]): BroadcastPptxResult => ({ ok: false, slides: [], opinionResults: [], overflowEstimates: [], warnings: [], errors });
  if (!snapshot || typeof snapshot !== 'object') return fail(['snapshot 은 객체여야 한다']);
  if ((snapshot as MeetingSnapshot).status?.label !== '확정') return fail(['전파본은 확정된 회의 스냅숏(status 확정)에서만 만든다 — 초안을 근로자에게 전하지 않는다']);
  const signatureRows = opts.signatureRows ?? 12;
  if (!Number.isInteger(signatureRows) || signatureRows < 1 || signatureRows > 30) return fail(['signatureRows 는 1~30']);
  const s: MeetingSnapshot = { ...snapshot };
  for (const k of ['prior', 'hazards', 'photos', 'opinions', 'questions', 'anchors'] as const) if (!Array.isArray(s[k])) (s as unknown as Record<string, unknown[]>)[k] = [];
  const errors = meetingSnapshotErrors(s, 'final');
  if (errors.length) return fail(errors);

  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
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
  const slides: BroadcastSlideInfo[] = [];
  const overflow: OverflowEstimate[] = [];
  const BODY = T.typeScale.body + 2; // 근로자가 읽는 글 — 회의 덱 표보다 크게
  const NONE = { type: 'none' as const };
  const INNER = { type: 'solid' as const, pt: T.table.innerLinePt, color: T.colors.line };
  const RULE = { type: 'solid' as const, pt: T.table.ruleLinePt, color: T.colors.primary };
  const meetingDay = s.actualMeetingDate ?? s.meetingDate ?? s.basisDate;

  const newSlide = (code: string, title: string, lead?: string) => {
    const slide = pptx.addSlide();
    const no = slides.length + 1;
    slides.push({ no, code, title });
    slide.background = { color: T.colors.bg };
    slide.addText(`위험성평가 회의 결과 안내  ·  ${s.cycle}  ·  회의 ${meetingDay}`, { x: X0, y: 0.28, w: W - 0.9, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, color: T.colors.accent, charSpacing: 0.5 });
    slide.addText(title, { objectName: 'title', x: X0, y: 0.55, w: W - 0.9, h: 0.6, fontFace, fontSize: T.typeScale.title + 2, bold: true, color: T.colors.primary });
    if (lead) slide.addText(lead, { x: X0, y: 1.12, w: contentW, h: 0.34, fontFace, fontSize: T.typeScale.lead, color: T.colors.muted });
    slide.addShape(pptx.ShapeType.line, { x: X0, y: H - 0.5, w: contentW, h: 0, line: { color: T.colors.line, width: 0.5 } });
    slide.addText(`${s.site}  ·  위험성평가 결과 공유`, { x: X0, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    slide.addText(`데이터 기준 ${s.basisDate} · 확정 v${(s.status as { version: number }).version} · ${BROADCAST_TEMPLATE_VERSION}   ${no}`, {
      x: X0 + contentW / 2, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted, align: 'right',
    });
    return { slide, no };
  };
  const fit = (ratio: number[]) => {
    const sum = ratio.reduce((a, b) => a + b, 0);
    return ratio.map((r) => (r / sum) * contentW);
  };
  const c = (v: string | number | undefined | null) => ({ text: v === undefined || v === null || v === '' ? '-' : String(v) });
  const head = (labels: string[]) => labels.map((t) => ({ text: t, options: { bold: true, fill: { color: T.table.headerFill }, color: T.colors.primary, align: 'center' } }));
  const table = (slide: ReturnType<typeof pptx.addSlide>, rows: { text: string; options?: Record<string, unknown> }[][], colW: number[], y = 1.6) => {
    const styled = rows.map((row, ri) =>
      row.map((cell) => ({ ...cell, options: { color: T.colors.text, margin: [4, 6, 4, 6], ...cell.options, border: [ri <= 1 ? RULE : INNER, NONE, ri === 0 || ri === rows.length - 1 ? RULE : INNER, NONE] } })),
    );
    slide.addTable(styled as never, { x: X0, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace, fontSize: BODY, valign: 'middle' });
  };
  const emptyNote = (slide: ReturnType<typeof pptx.addSlide>, text: string) =>
    slide.addText(text, { x: X0, y: 1.75, w: contentW, h: 0.7, fontFace, fontSize: BODY, color: T.colors.muted, align: 'center', valign: 'middle', fill: { color: T.colors.band } });
  const check = (no: number, code: string, ref: string, field: string, text: string | undefined, widthIn: number, maxLines: number) => {
    if (!text) return;
    const capacity = capacityOf(widthIn, BODY, maxLines);
    if (textUnits(text) > capacity) overflow.push({ slide: no, code, ref, field, chars: text.length, capacity });
  };

  const changed = s.hazards.filter((h) => h.kind === 'new' || h.kind === 'changed');
  const actions = s.actions ?? [];
  const deferred = s.deferred ?? [];
  const opinionResults = opinionResultsOf(s);
  const situationOf = new Map(s.hazards.map((h) => [h.id, h.situation]));
  const priorOf = new Map(s.prior.map((p) => [p.id, p.hazard]));

  // B1 한눈 요약 — 큰 숫자 4개
  {
    const { slide } = newSlide('B1', '이번 회의에서 정한 것', `${s.site} · 회의 ${meetingDay} · 다음 적용기간 ${s.nextPeriod ?? '-'}`);
    const reflected = opinionResults.filter((o) => o.decisionIds.length).length;
    const kpis: [string, string][] = [
      ['새로 생기거나 바뀐 위험', `${changed.length}`],
      ['이번에 정한 대책', `${actions.length}`],
      ['근로자 의견 중 결정이 난 것', `${reflected}/${opinionResults.length}`],
      ['다음으로 미룬 것', `${deferred.length}`],
    ];
    const cw = (contentW - 0.3 * 3) / 4;
    kpis.forEach(([label, value], i) => {
      const x = X0 + i * (cw + 0.3);
      slide.addShape(pptx.ShapeType.rect, { x, y: 1.9, w: cw, h: 2.6, fill: { color: T.colors.band }, line: { color: T.colors.band, width: 0 } });
      slide.addShape(pptx.ShapeType.rect, { x, y: 1.9, w: cw, h: 0.06, fill: { color: T.colors.primary }, line: { color: T.colors.primary, width: 0 } });
      slide.addText(label, { x: x + 0.2, y: 2.1, w: cw - 0.4, h: 0.5, fontFace, fontSize: T.typeScale.body, bold: true, color: T.colors.muted });
      slide.addText(value, { x: x + 0.2, y: 2.8, w: cw - 0.4, h: 1.2, fontFace, fontSize: T.typeScale.kpi - 6, bold: true, color: T.colors.primary });
    });
    slide.addText('자세한 내용은 다음 장부터 이어집니다. 궁금한 점은 관리감독자에게 물어 주세요.', { x: X0, y: 5.0, w: contentW, h: 0.4, fontFace, fontSize: BODY, color: T.colors.text });
  }

  // B2 새로 생기거나 바뀐 위험
  paginate(changed, ROWS.B2).forEach((page, pi, all) => {
    const { slide, no } = newSlide('B2', `새로 생기거나 바뀐 위험${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`);
    if (!page.length) return emptyNote(slide, '이번 회차에 새로 생기거나 바뀐 위험요인 없음');
    const w = fit([0.9, 4.2, 2.6, 1.5]);
    table(slide, [head(['구분', '위험', '원인 → 결과', '위험성']), ...page.map((h) => [
      { text: h.kind === 'new' ? '신규' : '변경', options: { bold: true, align: 'center', color: h.kind === 'new' ? T.colors.accent : T.colors.caution } },
      c(h.situation), c([h.cause, h.consequence].filter(Boolean).join(' → ')), c(h.grade),
    ])], w);
    page.forEach((h) => check(no, 'B2', h.id, 'situation', h.situation, w[1], 2));
  });

  // B3 꼭 지킬 대책 — 대상 위험 원문·대책·담당·기한
  paginate(actions, ROWS.B3).forEach((page, pi, all) => {
    const { slide, no } = newSlide('B3', `이번에 정한 대책${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`, '담당과 기한까지 정했습니다. 기한 전이라도 위험하면 바로 알려 주세요.');
    if (!page.length) return emptyNote(slide, '이번 회의에서 새로 정한 대책 없음');
    const w = fit([3.2, 3.4, 1.8, 1.3]);
    table(slide, [head(['대상 위험', '대책', '담당', '기한']), ...page.map((a) => {
      const target = a.targetId ?? a.id;
      return [c(a.hazard ?? situationOf.get(target) ?? priorOf.get(target) ?? target), c(a.measure), c(a.owner), c(a.due)];
    })], w);
    page.forEach((a) => check(no, 'B3', a.id, 'measure', a.measure, w[1], 2));
  });

  // B4 근로자 의견 반영 결과
  const opinionById = new Map(s.opinions.map((o) => [o.id, o]));
  paginate(opinionResults, ROWS.B4).forEach((page, pi, all) => {
    const { slide, no } = newSlide('B4', `여러분 의견은 이렇게 처리했습니다${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`);
    if (!page.length) return emptyNote(slide, '이번 회차에 받은 근로자 의견 없음');
    const w = fit([5.2, 3.5]);
    table(slide, [head(['의견', '결과']), ...page.map((r) => [
      c(opinionById.get(r.opinionId)?.text),
      { text: r.result, options: { bold: r.decisionIds.length > 0, color: r.decisionIds.length ? T.colors.positive : T.colors.muted } },
    ])], w);
    page.forEach((r) => check(no, 'B4', r.opinionId, 'text', opinionById.get(r.opinionId)?.text, w[0], 2));
  });

  // B5 지난 조치 이행 결과(규칙 제37조의3 2호)
  paginate(s.prior, ROWS.B5).forEach((page, pi, all) => {
    const { slide } = newSlide('B5', `지난번 대책은 어떻게 됐나${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`);
    if (!page.length) return emptyNote(slide, '지난 회차에서 넘어온 조치 없음');
    const color = (st: string) => (st === '완료' ? T.colors.positive : st === '미완료' || st === '기한초과' ? T.colors.negative : st === '재조치' ? T.colors.caution : T.colors.text);
    table(slide, [head(['위험', '상태', '조치 결과']), ...page.map((p) => [c(p.hazard), { text: p.status || '-', options: { bold: true, align: 'center', color: color(p.status) } }, c(p.result)])], fit([4.4, 1.2, 3.6]));
  });

  // B6 다음으로 미룬 것
  paginate(deferred, ROWS.B6).forEach((page, pi, all) => {
    const { slide } = newSlide('B6', `다음으로 미룬 것${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`, '미룬 동안에도 위험은 남아 있습니다. 작업 전에 한 번 더 확인해 주세요.');
    if (!page.length) return emptyNote(slide, '다음 회차로 미룬 것 없음');
    table(slide, [head(['위험', '미룬 이유', '다시 볼 날']), ...page.map((d) => [c(d.hazard ?? situationOf.get(d.id) ?? priorOf.get(d.id) ?? d.id), c(d.reason), c(d.reevaluateBy)])], fit([3.8, 3.8, 1.4]));
  });

  // B7 공유 확인 서명(빈칸)
  {
    const { slide } = newSlide('B7', '공유 확인', '위 내용을 듣거나 읽었으면 서명해 주세요. 새로 오셨거나 작업이 바뀐 분은 작업 전에 확인합니다.');
    const half = Math.ceil(signatureRows / 2);
    const colW = [0.6, 2.0, 1.5, 1.2];
    const tw = colW.reduce((a, b) => a + b, 0);
    for (let part = 0; part < 2; part++) {
      const start = part * half;
      const n = Math.min(half, signatureRows - start);
      if (n <= 0) break;
      const rows = [head(['번호', '소속·역할', '날짜', '서명']), ...Array.from({ length: n }, (_, i) => [{ text: String(start + i + 1), options: { align: 'center' } }, { text: '' }, { text: '' }, { text: '' }])];
      const styled = rows.map((row, ri) => row.map((cell) => ({ ...cell, options: { color: T.colors.text, margin: [2, 5, 2, 5], ...(cell as { options?: object }).options, border: [ri <= 1 ? RULE : INNER, NONE, ri === 0 || ri === rows.length - 1 ? RULE : INNER, NONE] } })));
      const rowH = Math.min(0.42, (H - 0.95 - 1.7) / (half + 1));
      slide.addTable(styled as never, { x: X0 + part * (tw + 0.4), y: 1.7, w: tw, colW, rowH, fontFace, fontSize: T.typeScale.table, valign: 'middle' });
    }
  }

  if (!actions.length) warnings.push('actions 가 비어 B3 을 「없음」으로 두었다');
  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, opinionResults, overflowEstimates: overflow, warnings };
}
