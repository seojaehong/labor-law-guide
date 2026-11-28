// 대책 장(B3) 글 칸 높이 — 그리기(parts.drawB3Page)·장 나누기(broadcast)·고르기(designsFor)가 같은 값을 쓴다.
// 글이 시안 줄 수를 넘으면 칸(표 행·카드)을 늘리고, 늘린 높이로 한 장에 몇 건 싣는지 정한다(말줄임 없음).
// 줄 수 = capacityOf(한 줄 글자 수 추정, 보수적) · 줄 높이 = 1.2 × 글자 크기(× 줄간격). 261128 PowerPoint 실측(BoundHeight)과 맞춘 값.
// 좌표는 1920×1080 시안 px. fs·네트워크 없음.
import { capacityOf, textUnits } from '../meeting';
import type { DeckDesign, DesignScale } from './index';

export const LINE_H = 1.2;

export interface B3Text {
  id: string;
  risk: string;
  measure: string;
  owner: string;
  due: string;
}

export type B3Field = 'risk' | 'measure' | 'owner';

export interface FieldFit {
  field: B3Field;
  text: string;
  /** 글 칸 폭·글자 크기(px) */
  wPx: number;
  px: number;
  /** 시안이 잡은 줄 수 */
  lines: number;
  /** 이 글에 필요한 줄 수 */
  need: number;
}

/**
 * 낱말 단위 줄바꿈(ko-KR) 줄 수 — 띄어쓰기에서만 끊고, 한 줄보다 긴 낱말은 새 줄에서 시작해 낱자로 끊는다.
 * PowerPoint 실측(261128): 「1 가나다…(띄어쓰기 없는 80자)」는 「1」만 첫 줄에 두고 긴 낱말을 다음 줄로 넘긴다.
 */
export function wrapLines(text: string, perLine: number): number {
  let total = 0;
  for (const para of text.split('\n')) {
    let lines = 1;
    let cur = 0;
    for (const w of para.split(' ')) {
      const wu = textUnits(w);
      const sp = cur > 0 ? textUnits(' ') : 0;
      if (cur + sp + wu <= perLine) cur += sp + wu;
      else if (wu <= perLine) {
        lines++;
        cur = wu;
      } else {
        if (cur > 0) lines++;
        const extra = Math.ceil(wu / perLine) - 1;
        lines += extra;
        cur = wu - extra * perLine;
      }
    }
    total += lines;
  }
  return Math.max(1, total);
}

export function linesOf(text: string, wPx: number, px: number, s: DesignScale): number {
  if (!text) return 1;
  return wrapLines(text, capacityOf(s.x(wPx), s.pt(px), 1));
}

/** 표 칸 위아래 여백 4pt+4pt 를 px 로 */
const tableMarginPx = (s: DesignScale) => 8 / (s.k * 72);

interface Opt {
  shrunk: boolean;
  /** 이 장에 그리는 카드 수(「외 N건」 칸 포함) — story 카드 폭이 이것으로 정해진다 */
  count: number;
}

/** 글 칸마다 폭·크기·시안 줄 수·필요 줄 수 */
export function b3Fields(d: DeckDesign, s: DesignScale, a: B3Text, o: Opt): FieldFit[] {
  const slot = d.slots.B3;
  const px = o.shrunk ? slot.textPxShrunk : slot.textPx;
  const f = (field: B3Field, text: string, wPx: number, size: number, lines: number): FieldFit => ({ field, text, wPx, px: size, lines, need: linesOf(text, wPx, size, s) });
  if (slot.part === 'hairline-table' || slot.part === 'report-grid') {
    const report = slot.part === 'report-grid';
    const pad = report ? 36 : 12;
    return [
      f('risk', report ? a.risk : `● ${a.risk}`, slot.cols[0] - 2 * pad, px, 2),
      f('measure', a.measure, slot.measureW, px, slot.measureMaxLines),
      f('owner', a.owner, slot.cols[2] - 2 * pad, px, 1),
    ];
  }
  if (slot.part === 'row-cards') {
    const [, cr, , cm, , co] = slot.cols;
    return [f('risk', a.risk, cr - 56, px, 2), f('measure', a.measure, cm - 56, px, slot.measureMaxLines), f('owner', a.owner, co - 56, o.shrunk ? 28 : 32, 1)];
  }
  if (slot.part === 'checklist-cards') {
    const [, cm, co] = slot.cols;
    return [f('risk', a.risk, cm - 20, 26, 1), f('measure', a.measure, cm, px, slot.measureMaxLines), f('owner', `담당  ${a.owner}`, co - 40, 26, 1)];
  }
  const iw = storyCardW(d, o.count) - 72;
  return [f('risk', a.risk, iw, px, 2), f('measure', a.measure, iw, px, slot.measureMaxLines), f('owner', a.owner, iw, px, 1)];
}

/** story 카드 안 줄높이·칸 사이(시안 c5-story: line-height 1.3 · gap 22px) */
export const STORY_LINE = 1.3;
export const STORY_GAP = 22;

/** story 카드 폭(px) — 이 장 카드 수로 본문 폭을 나눈다 */
export function storyCardW(d: DeckDesign, count: number): number {
  const slot = d.slots.B3;
  const gap = slot.gap ?? 48;
  const k = Math.max(1, count);
  return (slot.w - (k - 1) * gap) / k;
}

export interface B3ItemLayout {
  /** 표 행·카드 높이(px). story 는 장 안 모든 카드가 같은 높이 */
  h: number;
  /** 칸을 시안보다 늘렸는지 */
  grown: boolean;
  fields: Record<B3Field, FieldFit>;
  /** 부품별 칸 높이(px) — 그리기가 쓴다 */
  riskH: number;
  measureH: number;
  ownerH: number;
  /** 카드 위에서 잰 y(px) — row-cards 기한 · checklist-cards 대책. 다른 부품은 0 */
  subY: number;
}

export interface B3PageLayout {
  items: B3ItemLayout[];
  moreH: number;
  /** 본문 시작에서 마지막 요소 끝까지(px) */
  total: number;
  /** story 카드 폭(px) */
  cardW: number;
}

/** 한 장 분량의 높이 계산. more > 0 이면 「외 N건」 칸 포함 */
export function b3PageLayout(d: DeckDesign, s: DesignScale, items: B3Text[], o: { shrunk: boolean; more: number }): B3PageLayout {
  const slot = d.slots.B3;
  const itemH = o.shrunk ? slot.itemHShrunk : slot.itemH;
  const px = o.shrunk ? slot.textPxShrunk : slot.textPx;
  const count = items.length + (o.more ? 1 : 0);
  const gap = slot.gap ?? 24;
  const fitsOf = (a: B3Text) => {
    const list = b3Fields(d, s, a, { shrunk: o.shrunk, count });
    return Object.fromEntries(list.map((x) => [x.field, x])) as Record<B3Field, FieldFit>;
  };
  const lh = (x: FieldFit, spc = 1) => x.need * LINE_H * x.px * spc;

  if (slot.part === 'hairline-table' || slot.part === 'report-grid') {
    const mv = tableMarginPx(s);
    const rows = items.map((a) => {
      const fields = fitsOf(a);
      const need = Math.max(lh(fields.risk), lh(fields.measure), lh(fields.owner), LINE_H * px) + mv;
      const h = Math.max(itemH, need);
      return { h, grown: h > itemH, fields, riskH: h, measureH: h, ownerH: h, subY: 0 };
    });
    const headH = slot.part === 'report-grid' ? 76 : 60;
    const moreH = o.more ? Math.min(itemH, 88) : 0;
    return { items: rows, moreH, total: headH + rows.reduce((t, r) => t + r.h, 0) + moreH, cardW: slot.w };
  }

  if (slot.part === 'row-cards') {
    const capY = o.shrunk ? 10 : 18;
    const valY = o.shrunk ? 40 : 54;
    const datePx = o.shrunk ? Math.min(slot.datePx, slot.textPxShrunk) : slot.datePx;
    const rows = items.map((a) => {
      const fields = fitsOf(a);
      const valNeed = Math.max(lh(fields.risk, 1.05), lh(fields.measure, 1.05));
      const ownerText = lh(fields.owner);
      const ownerH = fields.owner.need <= 1 ? 40 : ownerText + 4;
      // 기한은 담당 아래 — 보통 크기 한 줄은 시안 자리(valY) 그대로, 축소·여러 줄이면 담당 글 끝 아래로 민다
      const dueY = fields.owner.need <= 1 && !o.shrunk ? valY : Math.max(valY, capY + ownerText + 4);
      const h = Math.max(itemH, valY + valNeed, dueY + datePx * 1.3 + 4);
      const grown = h > itemH;
      const valH = grown ? h - valY : h - valY - 10;
      return { h, grown, fields, riskH: valH, measureH: valH, ownerH, subY: dueY };
    });
    const moreH = o.more ? itemH : 0;
    const total = 76 + rows.reduce((t, r) => t + r.h + gap, 0) + (o.more ? moreH : -gap);
    return { items: rows, moreH, total, cardW: slot.w };
  }

  if (slot.part === 'checklist-cards') {
    const my0 = o.shrunk ? 54 : 60;
    const rows = items.map((a) => {
      const fields = fitsOf(a);
      const riskH = fields.risk.need <= 1 ? 38 : lh(fields.risk) + 4;
      const my = my0 + (riskH - 38);
      const mNeed = lh(fields.measure);
      const badgeH = fields.owner.need <= 1 ? 72 : lh(fields.owner) + 24;
      const h = Math.max(itemH, my + mNeed + 4, badgeH + 16);
      const grown = h > itemH;
      return { h, grown, fields, riskH, measureH: grown ? h - my - 4 : itemH - my - 8, ownerH: badgeH, subY: my };
    });
    const moreH = o.more ? itemH : 0;
    const total = rows.reduce((t, r) => t + r.h + gap, 0) + (o.more ? moreH : -gap);
    return { items: rows, moreH, total, cardW: slot.w };
  }

  // deadline-timeline — 카드가 가로로 놓여 장 안 카드 높이를 하나로 맞춘다
  const cardW = storyCardW(d, count);
  const per = items.map((a) => {
    const fields = fitsOf(a);
    // 시안(c5 .card gap 22 · .field.act padding-top 22 · 줄높이 1.3) — 위험 칸은 글 줄 수만큼, 그 아래 22px 에 구분선
    const riskH = fields.risk.need * STORY_LINE * px;
    const measureH = Math.max(px * 4, fields.measure.need * STORY_LINE * px);
    const ownerH = Math.max(40, lh(fields.owner));
    const measureEnd = 58 + riskH + STORY_GAP + STORY_GAP + 34 + measureH;
    const need = measureEnd + 10 + 30 + ownerH + 22;
    return { need, fields, riskH, measureH, ownerH };
  });
  const h = Math.max(itemH, ...per.map((p) => p.need));
  const rows = per.map((p) => ({ h, grown: h > itemH, fields: p.fields, riskH: p.riskH, measureH: p.measureH, ownerH: p.ownerH, subY: 0 }));
  return { items: rows, moreH: o.more ? h : 0, total: h + 72 + 30 + 44, cardW };
}

/** 시안 줄 수를 넘는 글 칸(보통 크기 기준) — designsFor 가 이유로 쓴다 */
export function b3LongFields(d: DeckDesign, s: DesignScale, items: B3Text[]): { id: string; field: B3Field; need: number; lines: number }[] {
  const count = Math.min(items.length, d.slots.B3.maxItems);
  const out: { id: string; field: B3Field; need: number; lines: number }[] = [];
  for (const a of items) for (const x of b3Fields(d, s, a, { shrunk: false, count })) if (x.need > x.lines) out.push({ id: a.id, field: x.field, need: x.need, lines: x.lines });
  return out;
}
