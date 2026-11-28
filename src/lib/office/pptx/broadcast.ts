// 회의 결과 전파본 — 확정된 회의 스냅숏(회의 덱 final 과 같은 입력)을 근로자에게 전하는 덱으로 다시 그린다(전파 덱 3종 중 2).
// 근거: 법 제36조④ 전단(평가 결과 공유) · 규칙 제37조의3 2호(이행 결과 포함) · 고시 제17조(공유 방법).
// 문장은 스냅숏 원문 그대로(지어 쓰지 않음). 확인 서명란은 빈칸. fs·네트워크 없음.
// 디자인 프리셋(design)을 고르면 B1(요약)·B3(대책)은 프리셋 부품 배치로, 나머지 장은 프리셋 제목 영역·색·글자만 받는다.
// 고르지 않으면 지금 출력 그대로(먹색 MEETING_THEME, 슬라이드 XML 이 같음 — 시험으로 고정).
import PptxGenJS from 'pptxgenjs';
import { MEETING_THEME } from './meeting-theme';
import { capacityOf, meetingSnapshotErrors, textUnits, type MeetingSnapshot, type OverflowEstimate } from './meeting';
import { DESIGN_IDS, broadcastKpis, designScale, getDeckDesign, isDesignId, type DeckDesign, type DesignId, type DesignScale } from './design/index';
import { color as designColor, drawHead, type HeadBox } from './design/head';
import { drawB1, drawB3Page, type ActionItem, type TextCheck } from './design/parts';
import { b3PageLayout } from './design/b3-geometry';

export const BROADCAST_TEMPLATE_VERSION = 'broadcast-v0';

export interface BroadcastOptions {
  /** 공유 확인 서명란 행 수 1~30. 기본 12 */
  signatureRows?: number;
  fontFace?: string;
  /** 판형. 기본 A4 가로 — 단 design 을 고르고 판형을 주지 않으면 16:9 */
  layout?: 'A4' | '16:9';
  /** 디자인 프리셋. 미지정이면 지금 출력 그대로 */
  design?: DesignId;
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

/**
 * 대책 목록을 장으로 나눈다 — 넘침 순서: 한 장 한도(maxItems) 안이고 높이도 들면 그대로 → 아니면 한 번만 축소(shrunkMaxItems)
 * → 그래도 넘으면 장마다 「외 N건」 칸을 두고 다음 장으로. 말줄임 없음(모든 대책이 어느 장엔가 실린다).
 * fits(장, 「외 N건」 칸 있음, 축소) — 늘린 칸 높이까지 넣어 그 장이 본문 높이에 드는지. 없으면 건수로만 나눈다.
 * 한 건만으로도 높이를 넘으면 그 한 건을 한 장에 싣는다(넘침 후보로 남는다).
 */
export function planDesignB3<T>(
  items: T[],
  maxItems: number,
  shrunkMaxItems: number,
  fits: (page: T[], more: boolean, shrunk: boolean) => boolean = () => true,
): { shrunk: boolean; pages: { items: T[]; more: number }[] } {
  if (items.length <= maxItems && fits(items, false, false)) return { shrunk: false, pages: [{ items, more: 0 }] };
  const cap = Math.max(2, shrunkMaxItems);
  const pages: { items: T[]; more: number }[] = [];
  let rest = items;
  while (rest.length) {
    if (rest.length <= cap && fits(rest, false, true)) {
      pages.push({ items: rest, more: 0 });
      break;
    }
    if (rest.length === 1) {
      pages.push({ items: rest, more: 0 });
      break;
    }
    let k = Math.min(cap - 1, rest.length - 1);
    while (k > 1 && !fits(rest.slice(0, k), true, true)) k--;
    // 한 건에 「외 N건」 칸까지는 안 들면 그 칸을 빼고 한 건만 싣는다(장 제목의 (n/m) 으로 이어짐을 알린다)
    const more = k === 1 && !fits(rest.slice(0, 1), true, true) ? 0 : rest.length - k;
    pages.push({ items: rest.slice(0, k), more });
    rest = rest.slice(k);
  }
  return { shrunk: true, pages };
}

export async function makeBroadcastPptx(snapshot: MeetingSnapshot, opts: BroadcastOptions = {}): Promise<BroadcastPptxResult> {
  const fail = (errors: string[]): BroadcastPptxResult => ({ ok: false, slides: [], opinionResults: [], overflowEstimates: [], warnings: [], errors });
  if (!snapshot || typeof snapshot !== 'object') return fail(['snapshot 은 객체여야 한다']);
  if ((snapshot as MeetingSnapshot).status?.label !== '확정') return fail(['전파본은 확정된 회의 스냅숏(status 확정)에서만 만든다 — 초안을 근로자에게 전하지 않는다']);
  const signatureRows = opts.signatureRows ?? 12;
  if (!Number.isInteger(signatureRows) || signatureRows < 1 || signatureRows > 30) return fail(['signatureRows 는 1~30']);
  if (opts.design !== undefined && !isDesignId(opts.design)) return fail([`design 은 ${DESIGN_IDS.join('·')} 중 하나(받은 값 ${String(opts.design)})`]);
  const s: MeetingSnapshot = { ...snapshot };
  for (const k of ['prior', 'hazards', 'photos', 'opinions', 'questions', 'anchors'] as const) if (!Array.isArray(s[k])) (s as unknown as Record<string, unknown[]>)[k] = [];
  const errors = meetingSnapshotErrors(s, 'final');
  if (errors.length) return fail(errors);

  const D: DeckDesign | null = opts.design ? getDeckDesign(opts.design) : null;
  const fontFace = opts.fontFace ?? T.fonts.eastAsia;
  const warnings: string[] = [];
  const pptx = new PptxGenJS();
  let W = 11.69;
  let H = 8.27;
  if (opts.layout === '16:9' || (D && opts.layout === undefined)) {
    pptx.layout = 'LAYOUT_WIDE';
    W = 13.33;
    H = 7.5;
  } else {
    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: W, height: H });
    pptx.layout = 'A4_LANDSCAPE';
  }
  const S: DesignScale | null = D ? designScale(W, H) : null;
  const X0 = D && S ? S.x(D.head.left) : 0.45;
  const contentW = D && S ? S.x(D.head.right - D.head.left) : W - X0 * 2;
  const slides: BroadcastSlideInfo[] = [];
  const overflow: OverflowEstimate[] = [];
  // 프리셋을 고르면 색·글자는 프리셋 토큰에서(의미색 negative·positive·caution 은 그대로 둔다)
  const DC = (k: Parameters<typeof designColor>[1]) => designColor(D!, k);
  const P = D
    ? { headFill: DC('band'), headText: DC('ink'), text: DC('ink'), muted: DC('ink2'), line: DC('line'), rule: DC('rule'), accent: DC('accentText'), band: DC('surface') }
    : { headFill: T.table.headerFill, headText: T.colors.primary, text: T.colors.text, muted: T.colors.muted, line: T.colors.line, rule: T.colors.primary, accent: T.colors.accent, band: T.colors.band };
  const BODY = D && S ? S.pt(D.tokens.type.table) : T.typeScale.body + 2; // 근로자가 읽는 글 — 회의 덱 표보다 크게
  const NONE = { type: 'none' as const };
  const INNER = { type: 'solid' as const, pt: T.table.innerLinePt, color: P.line };
  const RULE = { type: 'solid' as const, pt: T.table.ruleLinePt, color: P.rule };
  const meetingDay = s.actualMeetingDate ?? s.meetingDate ?? s.basisDate;
  const metaLine = `위험성평가 회의 결과 안내  ·  ${s.cycle}  ·  회의 ${meetingDay}`;
  const footLeft = `${s.site}  ·  위험성평가 결과 공유`;
  const footRight = (no: number) => `데이터 기준 ${s.basisDate} · 확정 v${(s.status as { version: number }).version} · ${BROADCAST_TEMPLATE_VERSION}   ${no}`;
  const defaultBox: HeadBox = { left: X0, right: X0 + contentW, top: 1.6, bottom: H - 0.6, titleShrunk: false, titleFits: true };

  const newSlide = (code: string, title: string, lead?: string, extra: { metaSuffix?: string; headline?: { text: string; accent?: boolean; breakLine?: boolean }[] } = {}) => {
    const slide = pptx.addSlide();
    const no = slides.length + 1;
    slides.push({ no, code, title });
    if (D && S) {
      const box = drawHead(pptx, slide, D, S, { no, meta: metaLine + (extra.metaSuffix ?? ''), title, lead, fontFace, footLeft, footRight: footRight(no), headline: extra.headline });
      if (!box.titleFits) warnings.push(`${code}(${D.id}): 제목 「${title}」 이 한 번 줄여도 한 줄에 들지 않음`);
      return { slide, no, box };
    }
    slide.background = { color: T.colors.bg };
    slide.addText(metaLine, { x: X0, y: 0.28, w: W - 0.9, h: 0.28, fontFace, fontSize: T.typeScale.kicker, bold: true, color: T.colors.accent, charSpacing: 0.5 });
    slide.addText(title, { objectName: 'title', x: X0, y: 0.55, w: W - 0.9, h: 0.6, fontFace, fontSize: T.typeScale.title + 2, bold: true, color: T.colors.primary });
    if (lead) slide.addText(lead, { x: X0, y: 1.12, w: contentW, h: 0.34, fontFace, fontSize: T.typeScale.lead, color: T.colors.muted });
    slide.addShape(pptx.ShapeType.line, { x: X0, y: H - 0.5, w: contentW, h: 0, line: { color: T.colors.line, width: 0.5 } });
    slide.addText(footLeft, { x: X0, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted });
    slide.addText(footRight(no), {
      x: X0 + contentW / 2, y: H - 0.46, w: contentW / 2, h: 0.28, fontFace, fontSize: T.typeScale.caption, color: T.colors.muted, align: 'right',
    });
    return { slide, no, box: defaultBox };
  };
  const fit = (ratio: number[]) => {
    const sum = ratio.reduce((a, b) => a + b, 0);
    return ratio.map((r) => (r / sum) * contentW);
  };
  // 프리셋은 제목 영역 높이가 달라 한 장 행 수를 남은 높이로 다시 잰다(두 줄 행 기준). 기본 출력은 고정 행 수 그대로
  const rowsOf = (code: keyof typeof ROWS, lead: boolean) => {
    if (!D || !S) return ROWS[code];
    const top = S.y(lead ? D.head.bodyTopWithLead : D.head.bodyTop);
    const bottom = H - S.y(1080 - D.foot.y) - S.y((D.foot.rule ? D.foot.rulePx + 8 : 0) + 16);
    const rowIn = (BODY * 1.2 * 2 + 8) / 72;
    return Math.max(2, Math.min(ROWS[code], Math.floor((bottom - top) / rowIn) - 1));
  };
  const c = (v: string | number | undefined | null) => ({ text: v === undefined || v === null || v === '' ? '-' : String(v) });
  const head = (labels: string[]) => labels.map((t) => ({ text: t, options: { bold: true, fill: { color: P.headFill }, color: P.headText, align: 'center' } }));
  const table = (slide: ReturnType<typeof pptx.addSlide>, rows: { text: string; options?: Record<string, unknown> }[][], colW: number[], y = 1.6) => {
    const styled = rows.map((row, ri) =>
      row.map((cell) => ({ ...cell, options: { color: P.text, margin: [4, 6, 4, 6], ...cell.options, border: [ri <= 1 ? RULE : INNER, NONE, ri === 0 || ri === rows.length - 1 ? RULE : INNER, NONE] } })),
    );
    slide.addTable(styled as never, { x: X0, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace, fontSize: BODY, valign: 'middle' });
  };
  const emptyNote = (slide: ReturnType<typeof pptx.addSlide>, text: string, y = 1.75) =>
    slide.addText(text, { x: X0, y, w: contentW, h: 0.7, fontFace, fontSize: BODY, color: P.muted, align: 'center', valign: 'middle', fill: { color: P.band } });
  const check = (no: number, code: string, ref: string, field: string, text: string | undefined, widthIn: number, maxLines: number) => {
    if (!text) return;
    const capacity = capacityOf(widthIn, BODY, maxLines);
    if (textUnits(text) > capacity) overflow.push({ slide: no, code, ref, field, chars: text.length, capacity });
  };
  const checkParts = (no: number, code: string, list: TextCheck[]) => {
    const over: string[] = [];
    for (const k of list) {
      if (!k.text) continue;
      const capacity = capacityOf(k.wIn, k.pt, k.lines);
      if (textUnits(k.text) > capacity) {
        overflow.push({ slide: no, code, ref: k.ref, field: k.field, chars: k.text.length, capacity });
        over.push(`${k.ref}.${k.field}`);
      }
    }
    // 넘침 1단계(축약 표시) — 글은 자르지 않고 어느 칸이 넘치는지만 알린다
    if (over.length && D) warnings.push(`${code}(${D.id}) ${no}장: ${over.join('·')} 글이 칸보다 길다 — 원문은 그대로 실었으니 입력에서 줄여 주세요`);
  };
  // 프리셋 판에서 본문 시작 y
  const bodyY = (box: HeadBox, fallback: number) => (D ? box.top : fallback);

  const changed = s.hazards.filter((h) => h.kind === 'new' || h.kind === 'changed');
  const actions = s.actions ?? [];
  const deferred = s.deferred ?? [];
  const opinionResults = opinionResultsOf(s);
  const situationOf = new Map(s.hazards.map((h) => [h.id, h.situation]));
  const priorOf = new Map(s.prior.map((p) => [p.id, p.hazard]));

  // B1 한눈 요약 — 큰 숫자 4개
  if (D && S) {
    const reflected = opinionResults.filter((o) => o.decisionIds.length).length;
    const kpis = broadcastKpis(s, reflected, opinionResults.length);
    const headline = D.slots.B1.part === 'chip-grid' ? [{ text: '이번 회의에서', breakLine: true }, { text: `대책 ${actions.length}개`, accent: true }, { text: '를 정했어요' }] : undefined;
    const { slide, no } = newSlide('B1', '이번 회의에서 정한 것', undefined, { metaSuffix: s.nextPeriod ? `  ·  다음 적용기간 ${s.nextPeriod}` : '', headline });
    const r = drawB1({ pptx, slide, d: D, s: S, fontFace }, kpis);
    if (r.shrunk.length) warnings.push(`B1(${D.id}): 한 번 축소 — ${r.shrunk.join(', ')}`);
    checkParts(no, 'B1', r.checks);
  } else {
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
  paginate(changed, rowsOf('B2', false)).forEach((page, pi, all) => {
    const { slide, no, box } = newSlide('B2', `새로 생기거나 바뀐 위험${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`);
    if (!page.length) return emptyNote(slide, '이번 회차에 새로 생기거나 바뀐 위험요인 없음', bodyY(box, 1.75));
    const w = fit([0.9, 4.2, 2.6, 1.5]);
    table(slide, [head(['구분', '위험', '원인 → 결과', '위험성']), ...page.map((h) => [
      { text: h.kind === 'new' ? '신규' : '변경', options: { bold: true, align: 'center', color: h.kind === 'new' ? P.accent : T.colors.caution } },
      c(h.situation), c([h.cause, h.consequence].filter(Boolean).join(' → ')), c(h.grade),
    ])], w, bodyY(box, 1.6));
    page.forEach((h) => check(no, 'B2', h.id, 'situation', h.situation, w[1], 2));
  });

  // B3 꼭 지킬 대책 — 대상 위험 원문·대책·담당·기한
  const B3_LEAD = '담당과 기한까지 정했습니다. 기한 전이라도 위험하면 바로 알려 주세요.';
  const hazardOf = (a: (typeof actions)[number]) => {
    const target = a.targetId ?? a.id;
    return a.hazard ?? situationOf.get(target) ?? priorOf.get(target) ?? target;
  };
  if (D && S) {
    const slot = D.slots.B3;
    let items: ActionItem[] = actions.map((a) => ({ id: a.id, risk: hazardOf(a) || '-', measure: a.measure || '-', owner: a.owner || '-', due: a.due || '-' }));
    if (slot.part === 'deadline-timeline') items = [...items].sort((x, y) => (x.due === '-' ? 1 : y.due === '-' ? -1 : x.due < y.due ? -1 : x.due > y.due ? 1 : 0));
    // 본문 높이(px) — 늘린 칸까지 넣어 한 장에 드는지 잰다
    const roomPx = (H - S.y(1080 - D.foot.y) - S.y((D.foot.rule ? D.foot.rulePx + 8 : 0) + 16) - S.y(D.head.bodyTopWithLead)) / S.k;
    const plan = planDesignB3(items, slot.maxItems, slot.shrunkMaxItems, (page, more, shrunk) => b3PageLayout(D, S, page, { shrunk, more: more ? 1 : 0 }).total <= roomPx);
    plan.pages.forEach((page, pi, all) => {
      const { slide, no, box } = newSlide('B3', `이번에 정한 대책${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`, B3_LEAD);
      if (!page.items.length) return emptyNote(slide, '이번 회의에서 새로 정한 대책 없음', box.top);
      const r = drawB3Page({ pptx, slide, d: D, s: S, fontFace }, box, page.items, { shrunk: plan.shrunk, more: page.more, accentFirst: pi === 0 });
      if (r.grown?.length) warnings.push(`B3(${D.id}) ${no}장: ${r.grown.join('·')} 글이 시안 줄 수보다 길다 — 행·카드 높이를 글 줄 수만큼 잡았다(원문 그대로)`);
      if (r.overPage) warnings.push(`B3(${D.id}) ${no}장: 대책 한 건의 글만으로도 본문 높이를 넘는다 — 입력에서 줄여 주세요`);
      checkParts(no, 'B3', r.checks);
    });
    if (plan.shrunk) {
      const cap = Math.max(2, slot.shrunkMaxItems);
      const first = plan.pages[0];
      const why = items.length > slot.maxItems ? `한 장 ${slot.maxItems}건 한도를 넘어` : '글이 길어 한 장 높이에 다 들지 않아';
      warnings.push(
        `B3(${D.id}): 대책 ${items.length}건 — ${why} 한 번 축소(한 장 ${cap}건)` +
          (plan.pages.length > 1 ? `, ${first.more ? `「외 ${first.more}건」 표기 후 ` : ''}다음 장으로 이어 ${plan.pages.length}장` : ''),
      );
    }
  } else {
    paginate(actions, ROWS.B3).forEach((page, pi, all) => {
      const { slide, no } = newSlide('B3', `이번에 정한 대책${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`, B3_LEAD);
      if (!page.length) return emptyNote(slide, '이번 회의에서 새로 정한 대책 없음');
      const w = fit([3.2, 3.4, 1.8, 1.3]);
      table(slide, [head(['대상 위험', '대책', '담당', '기한']), ...page.map((a) => [c(hazardOf(a)), c(a.measure), c(a.owner), c(a.due)])], w);
      page.forEach((a) => check(no, 'B3', a.id, 'measure', a.measure, w[1], 2));
    });
  }

  // B4 근로자 의견 반영 결과
  const opinionById = new Map(s.opinions.map((o) => [o.id, o]));
  paginate(opinionResults, rowsOf('B4', false)).forEach((page, pi, all) => {
    const { slide, no, box } = newSlide('B4', `여러분 의견은 이렇게 처리했습니다${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`);
    if (!page.length) return emptyNote(slide, '이번 회차에 받은 근로자 의견 없음', bodyY(box, 1.75));
    const w = fit([5.2, 3.5]);
    table(slide, [head(['의견', '결과']), ...page.map((r) => [
      c(opinionById.get(r.opinionId)?.text),
      { text: r.result, options: { bold: r.decisionIds.length > 0, color: r.decisionIds.length ? T.colors.positive : P.muted } },
    ])], w, bodyY(box, 1.6));
    page.forEach((r) => check(no, 'B4', r.opinionId, 'text', opinionById.get(r.opinionId)?.text, w[0], 2));
  });

  // B5 지난 조치 이행 결과(규칙 제37조의3 2호)
  paginate(s.prior, rowsOf('B5', false)).forEach((page, pi, all) => {
    const { slide, box } = newSlide('B5', `지난번 대책은 어떻게 됐나${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`);
    if (!page.length) return emptyNote(slide, '지난 회차에서 넘어온 조치 없음', bodyY(box, 1.75));
    const color = (st: string) => (st === '완료' ? T.colors.positive : st === '미완료' || st === '기한초과' ? T.colors.negative : st === '재조치' ? T.colors.caution : P.text);
    table(slide, [head(['위험', '상태', '조치 결과']), ...page.map((p) => [c(p.hazard), { text: p.status || '-', options: { bold: true, align: 'center', color: color(p.status) } }, c(p.result)])], fit([4.4, 1.2, 3.6]), bodyY(box, 1.6));
  });

  // B6 다음으로 미룬 것
  paginate(deferred, rowsOf('B6', true)).forEach((page, pi, all) => {
    const { slide, box } = newSlide('B6', `다음으로 미룬 것${all.length > 1 ? ` (${pi + 1}/${all.length})` : ''}`, '미룬 동안에도 위험은 남아 있습니다. 작업 전에 한 번 더 확인해 주세요.');
    if (!page.length) return emptyNote(slide, '다음 회차로 미룬 것 없음', bodyY(box, 1.75));
    table(slide, [head(['위험', '미룬 이유', '다시 볼 날']), ...page.map((d) => [c(d.hazard ?? situationOf.get(d.id) ?? priorOf.get(d.id) ?? d.id), c(d.reason), c(d.reevaluateBy)])], fit([3.8, 3.8, 1.4]), bodyY(box, 1.6));
  });

  // B7 공유 확인 서명(빈칸)
  {
    const { slide, box } = newSlide('B7', '공유 확인', '위 내용을 듣거나 읽었으면 서명해 주세요. 새로 오셨거나 작업이 바뀐 분은 작업 전에 확인합니다.');
    const half = Math.ceil(signatureRows / 2);
    const base = [0.6, 2.0, 1.5, 1.2];
    // 프리셋 판은 좌우 여백이 달라 두 표가 본문 폭 안에 들도록 비례로 줄인다
    const shrink = D ? Math.min(1, (contentW - 0.4) / (2 * base.reduce((a, b) => a + b, 0))) : 1;
    const colW = D ? base.map((w) => w * shrink) : base;
    const tw = colW.reduce((a, b) => a + b, 0);
    const top = D ? box.top : 1.7;
    for (let part = 0; part < 2; part++) {
      const start = part * half;
      const n = Math.min(half, signatureRows - start);
      if (n <= 0) break;
      const rows = [head(['번호', '소속·역할', '날짜', '서명']), ...Array.from({ length: n }, (_, i) => [{ text: String(start + i + 1), options: { align: 'center' } }, { text: '' }, { text: '' }, { text: '' }])];
      const styled = rows.map((row, ri) => row.map((cell) => ({ ...cell, options: { color: P.text, margin: [2, 5, 2, 5], ...(cell as { options?: object }).options, border: [ri <= 1 ? RULE : INNER, NONE, ri === 0 || ri === rows.length - 1 ? RULE : INNER, NONE] } })));
      const rowH = D ? Math.min(0.42, (box.bottom - top) / (half + 1)) : Math.min(0.42, (H - 0.95 - 1.7) / (half + 1));
      slide.addTable(styled as never, { x: X0 + part * (tw + 0.4), y: top, w: tw, colW, rowH, fontFace, fontSize: T.typeScale.table, valign: 'middle' });
    }
  }

  if (!actions.length) warnings.push('actions 가 비어 B3 을 「없음」으로 두었다');
  const out = await pptx.write({ outputType: 'arraybuffer' });
  return { ok: true, bytes: new Uint8Array(out as ArrayBuffer), slides, opinionResults, overflowEstimates: overflow, warnings };
}
