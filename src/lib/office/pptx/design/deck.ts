// 프리셋 판 덱 공용 — 판형 고르기 · 목록 장 나누기(planList → drawList, 넘침 후보 기록) · 안내 상자(callout).
// 전파·회의·TBM·교안 덱이 같이 쓴다(덱마다 따로 짜지 않는다). 좌표는 1920×1080 시안 px. fs·네트워크 없음.
import type { DeckPptx, DeckSlide } from './slide-types';
import { designScale, type DeckDesign, type DesignColorKey, type DesignScale } from './index';
import { color, type HeadBox } from './head';
import { LINE_H, wrapLines } from './b3-geometry';
import { drawList, drawListEmpty, listCapacity, listFamily, planList, type ListRow, type ListSpec } from './lists';
import { capacityOf, textUnits } from '../text-units';
import type { OverflowEstimate } from '../meeting';

export interface Kit {
  pptx: DeckPptx;
  d: DeckDesign;
  s: DesignScale;
  fontFace: string;
}
export interface Page {
  slide: DeckSlide;
  no: number;
  box: HeadBox;
}

interface LayoutHost {
  layout: string;
  defineLayout(o: { name: string; width: number; height: number }): void;
}

/** 판형 — 기본 A4 가로, 단 프리셋을 고르고 판형을 주지 않으면 16:9. 돌려준 W·H(in) 와 프리셋 배율 */
export function pickLayout(pptx: LayoutHost, layout: 'A4' | '16:9' | undefined, design: boolean): { W: number; H: number; S: DesignScale } {
  if (layout === '16:9' || (design && layout === undefined)) {
    pptx.layout = 'LAYOUT_WIDE';
    return { W: 13.33, H: 7.5, S: designScale(13.33, 7.5) };
  }
  pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
  pptx.layout = 'A4_LANDSCAPE';
  return { W: 11.69, H: 8.27, S: designScale(11.69, 8.27) };
}

/** 머리 아래 본문 높이(px) — 머리가 한 줄일 때(요점 줄 유무로) */
export function roomPxOf(d: DeckDesign, s: DesignScale, lead: boolean): number {
  return (s.H - s.y(1080 - d.foot.y) - s.y((d.foot.rule ? d.foot.rulePx + 8 : 0) + 16) - s.y(lead ? d.head.bodyTopWithLead : d.head.bodyTop)) / s.k;
}

export interface ListPagesArgs {
  kit: Kit;
  code: string;
  spec: ListSpec;
  rows: ListRow[];
  /** 한 장 최대 행 수 */
  cap: number;
  emptyText: string;
  /** 장 하나를 연다(제목에 (n/m) 를 붙이는 것은 부르는 쪽) */
  newPage: (pageIndex: number, pageCount: number) => Page;
  /** 본문 높이(px). 없으면 newPage 와 같은 머리(lead 여부)로 잰 roomPxOf */
  roomPx: number;
  overflow: OverflowEstimate[];
  warnings: string[];
  /** 장마다 목록 시작을 본문 위에서 이만큼 내린다(px) — 목록 위에 다른 부품이 있을 때 */
  offsetPx?: number;
}

/**
 * 목록 장 — 칸은 글 줄 수만큼 늘리고 본문 높이로 장을 나눈다. 말줄임 없음.
 * 한 행만으로 본문 높이를 넘으면 원문 그대로 싣고, 본문 높이에 들지 않는 칸만 넘침 후보로 남긴다.
 */
export function listPages(a: ListPagesArgs): Page[] {
  const { kit, code, spec } = a;
  const room = a.roomPx - (a.offsetPx ?? 0);
  const plan = planList(kit.d, kit.s, spec, a.rows, room, a.cap);
  return plan.pages.map((page, pi, all) => {
    const p = a.newPage(pi, all.length);
    const box = a.offsetPx ? { ...p.box, top: p.box.top + kit.s.y(a.offsetPx) } : p.box;
    const ctx = { ...kit, slide: p.slide };
    if (!page.length) {
      drawListEmpty(ctx, box, a.emptyText, spec.area);
      return p;
    }
    drawList(ctx, box, spec, page);
    for (const r of page.filter((x) => plan.overPage.includes(x.id))) {
      for (const k of listCapacity(kit.d, kit.s, spec, r, room)) if (textUnits(k.text) > k.capacity) a.overflow.push({ slide: p.no, code, ref: r.id, field: k.key, chars: k.text.length, capacity: k.capacity });
      a.warnings.push(`${code}(${kit.d.id}) ${p.no}장: ${r.id} 한 행의 글만으로도 본문 높이를 넘는다 — 원문 그대로 실었으니 입력에서 줄여 주세요`);
    }
    return p;
  });
}

/** 부품이 돌려준 글자 칸 점검(TextCheck) → 넘침 후보 · 경고(글은 자르지 않고 어느 칸이 넘치는지만 알린다) */
export function recordChecks(
  no: number,
  code: string,
  designId: string,
  checks: { ref: string; field: string; text: string; wIn: number; pt: number; lines: number }[],
  overflow: OverflowEstimate[],
  warnings: string[],
): void {
  const over: string[] = [];
  for (const k of checks) {
    if (!k.text) continue;
    const capacity = capacityOf(k.wIn, k.pt, k.lines);
    if (textUnits(k.text) > capacity) {
      overflow.push({ slide: no, code, ref: k.ref, field: k.field, chars: k.text.length, capacity });
      over.push(`${k.ref}.${k.field}`);
    }
  }
  if (over.length) warnings.push(`${code}(${designId}) ${no}장: ${over.join('·')} 글이 칸보다 길다 — 원문은 그대로 실었으니 입력에서 줄여 주세요`);
}

/** 안내 상자 하나가 본문 높이를 넘으면 넘침 후보로 — 상자 글은 나눠 싣지 않는다(문단 중간을 자르지 않음) */
export function checkCallout(kit: Kit, no: number, code: string, ref: string, field: string, text: string, wPx: number, hPx: number, roomPx: number, overflow: OverflowEstimate[], warnings: string[]): void {
  if (hPx <= roomPx) return;
  const px = kit.d.tokens.type.body;
  const lines = Math.max(1, Math.floor((roomPx - 52) / (px * LINE_H)));
  overflow.push({ slide: no, code, ref, field, chars: text.length, capacity: capacityOf(kit.s.x(wPx - 80), kit.s.pt(px), lines) });
  warnings.push(`${code}(${kit.d.id}) ${no}장: ${ref} ${field} 글이 본문 높이를 넘는다 — 원문 그대로 실었으니 입력에서 줄여 주세요`);
}

export type Tone ='ink' | 'ink2' | 'positive' | 'caution' | 'negative' | 'accentText';
export interface CalloutPart {
  text: string;
  bold?: boolean;
  tone?: Tone;
  /** 이 조각 뒤에서 줄을 바꾼다 */
  breakLine?: boolean;
}

/** 안내 상자 높이(px) — 글 줄 수만큼(위아래 여백 포함). 그리기와 장 나누기가 같이 쓴다 */
export function calloutHeight(kit: Kit, wPx: number, parts: CalloutPart[], px = kit.d.tokens.type.body): number {
  const fam = listFamily(kit.d);
  const padX = fam === 'hairline' ? 0 : 40;
  const padY = fam === 'hairline' ? 18 : 26;
  const lines = paragraphs(parts).reduce((n, para) => n + wrapLines(para, capacityOf(kit.s.x(wPx - 2 * padX), kit.s.pt(px), 1)), 0);
  return lines * px * LINE_H + 2 * padY;
}

function paragraphs(parts: CalloutPart[]): string[] {
  const out: string[] = [''];
  for (const p of parts) {
    out[out.length - 1] += p.text;
    if (p.breakLine) out.push('');
  }
  if (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * 안내 상자 — 프리셋 면 문법(가는선 위아래 · 남색 테두리 · 검정 굵은 테두리 · 회색 둥근 면 · 흰 둥근 면+가는선).
 * 글은 원문 그대로, 칸은 글 줄 수만큼 높인다. 그린 높이(px)를 돌려준다.
 */
export function drawCallout(c: Kit & { slide: DeckSlide }, at: { x: number; y: number; w: number }, parts: CalloutPart[], o: { px?: number; name?: string } = {}): number {
  const { d, s, slide, pptx, fontFace } = c;
  const C = (k: DesignColorKey) => color(d, k);
  const fam = listFamily(d);
  const px = o.px ?? d.tokens.type.body;
  const h = calloutHeight(c, at.w, parts, px);
  const padX = fam === 'hairline' ? 0 : 40;
  const shape = { objectName: o.name ?? `part:callout-${fam}`, x: s.x(at.x), y: s.y(at.y), w: s.x(at.w), h: s.y(h) };
  const hair = Math.max(0.5, s.pt(1));
  if (fam === 'hairline') {
    for (const ly of [at.y, at.y + h]) slide.addShape(pptx.ShapeType.line, { x: s.x(at.x), y: s.y(ly), w: s.x(at.w), h: 0, line: { color: C(ly === at.y ? 'rule' : 'line'), width: ly === at.y ? s.pt(2) : hair } });
  } else if (fam === 'grid') slide.addShape(pptx.ShapeType.rect, { ...shape, fill: { color: C('bg') }, line: { color: C('accent'), width: hair } });
  else if (fam === 'rowcard') slide.addShape(pptx.ShapeType.rect, { ...shape, fill: { color: C('bg') }, line: { color: C('ink'), width: s.pt(d.tokens.lines.rule) } });
  else if (fam === 'chipcard') slide.addShape(pptx.ShapeType.roundRect, { ...shape, rectRadius: s.y(Math.min(d.tokens.radius.card, h / 2)), fill: { color: C('surface') }, line: { color: C('surface'), width: 0 } });
  else slide.addShape(pptx.ShapeType.roundRect, { ...shape, rectRadius: s.y(Math.min(d.tokens.radius.card, h / 2)), fill: { color: C('surface') }, line: { color: C('line'), width: hair } });
  slide.addText(
    parts.map((p) => ({ text: p.text, options: { bold: p.bold ?? fam === 'rowcard', color: C(p.tone ?? 'ink'), breakLine: p.breakLine } })),
    { x: s.x(at.x + padX), y: s.y(at.y), w: s.x(at.w - 2 * padX), h: s.y(h), fontFace, fontSize: s.pt(px), valign: 'middle', margin: 0 },
  );
  return h;
}
