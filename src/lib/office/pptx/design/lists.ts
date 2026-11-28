// 전파 덱 나머지 장 — B2(새로 생기거나 바뀐 위험)·B4(의견 처리 결과)·B5(지난 대책 이행)·B6(미룬 것)과 B7(공유 확인 서명란)을
// 프리셋의 디자인 언어로 그린다. 시안(c1~c5)은 요약·대책 장 2장뿐이라 대책 장(B3) 문법을 따라 짠다.
//   hairline  가는선 표(quiet)         grid      격자 표 + 남색 머리 띠(report)
//   rowcard   검정 테두리 행 카드 + 노랑 범례 칩 · 위험 줄무늬(field)
//   chipcard  둥근 회색 카드 + 상태 알약(app)    storycard  흰 둥근 카드 + 라벨 위·값 아래(story)
// 정보 구조(칸·순서)는 기본 출력과 같다. 글은 원문 그대로, 말줄임 없음 — 칸은 글 줄 수만큼 늘리고 넘치면 다음 장으로.
// 높이 계산(listLayout)은 그리기·장 나누기·시험이 같이 쓴다. 좌표는 1920×1080 시안 px. fs·네트워크 없음.
import type { DeckPptx, DeckSlide } from './slide-types';
import type { DeckDesign, DesignColorKey, DesignScale } from './index';
import { color, type HeadBox } from './head';
import { LINE_H, linesOf } from './b3-geometry';
import { capacityOf, textUnits } from '../text-units';

export type ListFamily = 'hairline' | 'grid' | 'rowcard' | 'chipcard' | 'storycard';

export function listFamily(d: DeckDesign): ListFamily {
  switch (d.slots.B3.part) {
    case 'hairline-table':
      return 'hairline';
    case 'report-grid':
      return 'grid';
    case 'row-cards':
      return 'rowcard';
    case 'checklist-cards':
      return 'chipcard';
    default:
      return 'storycard';
  }
}

export interface ListCol {
  /** 스냅숏 필드 이름 — 넘침 후보(overflowEstimates)의 field 로 쓴다(기본 출력과 같은 이름) */
  key: string;
  caption: string;
  ratio: number;
  /** 상태 칸(신규·변경, 완료·미완료 …) — 카드 부품은 알약·테두리 캡슐로 */
  status?: boolean;
  /** 위험 점(app) — 위험 칸 라벨 앞 */
  dot?: boolean;
}
export interface ListCell {
  text: string;
  color?: DesignColorKey;
  bold?: boolean;
}
export interface ListRow {
  id: string;
  cells: ListCell[];
}
export interface ListSpec {
  code: string;
  cols: ListCol[];
  /** field 행 카드 왼쪽 위험 줄무늬(B2) */
  stripe?: boolean;
  /** 본문 일부 폭에만 그릴 때 왼쪽 x·폭(px). 없으면 제목 영역 좌우 끝 그대로 */
  area?: { x: number; w: number };
  /** 칸이 많은 회의 표(전회 이행 11칸 등) — 표 글자 크기(tokens.type.table)·좁은 여백. 칸·순서는 그대로 */
  dense?: boolean;
  /** field 범례 칩 글. 없으면 칸 이름을 「 · 」로 잇는다. 본문 폭에 한 줄로 들지 않으면 범례를 그리지 않는다 */
  legend?: string;
}

interface Ctx {
  pptx: DeckPptx;
  slide: DeckSlide;
  d: DeckDesign;
  s: DesignScale;
  fontFace: string;
}

const LEGEND_PX = 28;
/** field 범례 글 — 본문 폭에 한 줄로 들 때만(아니면 빈 문자열 = 범례 없음) */
function legendOf(spec: ListSpec, W: number): string {
  const text = spec.legend ?? spec.cols.map((col) => col.caption).join(' · ');
  return textUnits(text) * LEGEND_PX + 64 <= W ? text : '';
}

/** 부품별 치수(px) */
function metrics(d: DeckDesign, spec?: ListSpec) {
  const base = metricsBase(d, spec?.area?.w ?? d.head.right - d.head.left);
  if (base.fam === 'rowcard' && spec && !legendOf(spec, base.W)) base.legendH = 0;
  if (!spec?.dense) return base;
  // 칸이 많은 표 — 표 글자 크기·좁은 여백·작은 최소 행 높이(칸·순서는 그대로)
  const px = d.tokens.type.table;
  const capPx = Math.min(base.capPx, 22);
  const isTable = base.fam === 'hairline' || base.fam === 'grid';
  return {
    ...base,
    px,
    capPx: isTable ? Math.min(base.capPx, 24) : capPx,
    headH: isTable ? 52 : base.headH,
    minRow: isTable ? 56 : 84,
    padX: isTable ? 8 : 0,
    padT: isTable ? 0 : 12,
    padB: isTable ? 0 : 14,
    padL: isTable ? 0 : Math.min(base.padL, 24),
    padR: isTable ? 0 : Math.min(base.padR, 24),
    colGap: isTable ? 0 : 16,
    gap: isTable ? 0 : Math.min(base.gap, 14),
    capGap: isTable ? 0 : 4,
  };
}

function metricsBase(d: DeckDesign, W: number) {
  const fam = listFamily(d);
  const t = d.tokens.type;
  switch (fam) {
    case 'hairline':
      return { fam, W, px: t.body, capPx: t.meta, headH: 60, minRow: 96, padX: 12, padT: 0, padB: 0, padL: 0, padR: 0, colGap: 0, gap: 0, legendH: 0, capGap: 0 };
    case 'grid':
      return { fam, W, px: t.body, capPx: 26, headH: 76, minRow: 100, padX: 36, padT: 0, padB: 0, padL: 0, padR: 0, colGap: 0, gap: 0, legendH: 0, capGap: 0 };
    case 'rowcard':
      return { fam, W, px: t.body, capPx: 28, headH: 0, minRow: 132, padX: 0, padT: 18, padB: 22, padL: 28, padR: 28, colGap: 56, gap: d.slots.B3.gap ?? 24, legendH: 76, capGap: 6 };
    case 'chipcard':
      return { fam, W, px: t.body, capPx: 24, headH: 0, minRow: 120, padX: 0, padT: 22, padB: 22, padL: 40, padR: 40, colGap: 32, gap: d.slots.B3.gap ?? 24, legendH: 0, capGap: 6 };
    default:
      return { fam, W, px: t.body, capPx: 22, headH: 0, minRow: 120, padX: 0, padT: 26, padB: 26, padL: 36, padR: 36, colGap: 40, gap: 20, legendH: 0, capGap: 8 };
  }
}

const STRIPE_W = 24;
/** 상태 알약·캡슐 안쪽 여백(px) */
const PILL_PAD_X = 20;
const PILL_PAD_Y = 12;
/** 알약을 이만큼 올려 알약 안 글이 옆 칸 값과 거의 같은 줄에 오게(칸 높이는 알약 여백까지 잡아 둔다) */
const PILL_LIFT = 8;

export interface ListRowLayout {
  h: number;
  /** 칸마다 글 줄 수 */
  lines: number[];
}
export interface ListLayout {
  /** 칸 폭(px) — 표는 칸 전체, 카드는 글 칸 */
  colW: number[];
  /** 칸 왼쪽 x(px, 본문 왼쪽 기준) */
  colX: number[];
  /** 글 칸 폭(px) — 표는 좌우 여백을 뺀 값 */
  textW: number[];
  px: number;
  capPx: number;
  /** 표 머리 행 또는 범례 칩 높이(px) */
  headH: number;
  rows: ListRowLayout[];
  gap: number;
  /** 본문 시작에서 마지막 요소 끝까지(px) */
  total: number;
}

/** 한 행만으로 본문 높이를 넘을 때 — 칸마다 본문 높이에 드는 줄 수로 잰 담을 수 있는 글자 수(넘침 후보 판정) */
export function listCapacity(d: DeckDesign, s: DesignScale, spec: ListSpec, row: ListRow, roomPx: number): { key: string; text: string; capacity: number }[] {
  const m = metrics(d, spec);
  const L = listLayout(d, s, spec, [row]);
  const isTable = m.fam === 'hairline' || m.fam === 'grid';
  const avail = roomPx - L.headH - (isTable ? 8 / (s.k * 72) : m.padT + m.capPx * LINE_H + m.capGap + m.padB);
  const lines = Math.max(1, Math.floor(avail / (LINE_H * m.px)));
  return spec.cols.map((col, ci) => ({ key: col.key, text: row.cells[ci].text, capacity: capacityOf(s.x(L.textW[ci]), s.pt(m.px), lines) }));
}

/** 한 장 분량의 칸 폭·행 높이 */
export function listLayout(d: DeckDesign, s: DesignScale, spec: ListSpec, rows: ListRow[]): ListLayout {
  const m = metrics(d, spec);
  const sum = spec.cols.reduce((a, c) => a + c.ratio, 0);
  const lead = m.fam === 'rowcard' && spec.stripe ? STRIPE_W : 0;
  const inner = m.W - m.padL - m.padR - lead - (spec.cols.length - 1) * m.colGap;
  const colW = spec.cols.map((c) => (c.ratio / sum) * inner);
  const colX: number[] = [];
  let x = m.padL + lead;
  for (const w of colW) {
    colX.push(x);
    x += w + m.colGap;
  }
  const isTable = m.fam === 'hairline' || m.fam === 'grid';
  const status = (i: number) => !!spec.cols[i].status && !isTable && m.fam !== 'rowcard';
  const textW = colW.map((w, i) => (isTable ? w - 2 * m.padX : status(i) ? w - 2 * PILL_PAD_X : w - (spec.cols[i].dot && m.fam === 'chipcard' ? 20 : 0)));
  const mv = 8 / (s.k * 72); // 표 칸 위아래 여백 4pt+4pt
  const lay = rows.map((r) => {
    const lines = r.cells.map((c, i) => linesOf(c.text, textW[i], m.px, s));
    const textH = Math.max(...lines.map((n, i) => n * LINE_H * m.px + (status(i) ? 2 * PILL_PAD_Y : 0)));
    const need = isTable ? textH + mv : m.padT + m.capPx * LINE_H + m.capGap + textH + m.padB;
    return { h: Math.max(m.minRow, need), lines };
  });
  const headH = isTable ? m.headH : m.legendH;
  const total = headH + lay.reduce((t, r) => t + r.h, 0) + Math.max(0, lay.length - 1) * m.gap;
  return { colW, colX, textW, px: m.px, capPx: m.capPx, headH, rows: lay, gap: m.gap, total };
}

/**
 * 목록을 장으로 나눈다 — 한 장 cap 행 이하이면서 본문 높이(roomPx) 안. 말줄임 없음, 모든 행이 어느 장엔가 실린다.
 * 한 행만으로도 높이를 넘으면 그 행을 한 장에 싣고 overPage 로 알린다.
 */
export function planList(d: DeckDesign, s: DesignScale, spec: ListSpec, rows: ListRow[], roomPx: number, cap: number): { pages: ListRow[][]; overPage: string[] } {
  const pages: ListRow[][] = [];
  const overPage: string[] = [];
  let cur: ListRow[] = [];
  for (const r of rows) {
    const next = [...cur, r];
    if (cur.length && (next.length > cap || listLayout(d, s, spec, next).total > roomPx)) {
      pages.push(cur);
      cur = [r];
    } else cur = next;
    if (cur.length === 1 && listLayout(d, s, spec, cur).total > roomPx) overPage.push(r.id);
  }
  pages.push(cur);
  return { pages, overPage };
}

const noLine = (c: string) => ({ color: c, width: 0 });

/** 한 장 분량의 목록을 그린다 — 표(hairline·grid) 또는 카드(rowcard·chipcard·storycard) */
export function drawList(c: Ctx, box: HeadBox, spec: ListSpec, rows: ListRow[]): ListLayout {
  const { d, s, pptx, slide, fontFace } = c;
  const C = (k: DesignColorKey) => color(d, k);
  const m = metrics(d, spec);
  const L = listLayout(d, s, spec, rows);
  const X = spec.area?.x ?? d.head.left;
  const top = box.top / s.k;
  const hairW = Math.max(0.5, s.pt(d.tokens.lines.hair));

  if (m.fam === 'hairline' || m.fam === 'grid') {
    const grid = m.fam === 'grid';
    const NONE = { type: 'none' as const };
    const hair = { type: 'solid' as const, pt: Math.max(0.5, s.pt(1)), color: C('line') };
    const rule = { type: 'solid' as const, pt: s.pt(2), color: C('rule') };
    const heavy = { type: 'solid' as const, pt: s.pt(grid ? 3 : 2), color: C('rule') };
    const padX = s.pt(m.padX);
    const n = spec.cols.length;
    const side = (ci: number) => (grid ? [ci === n - 1 ? NONE : hair, ci === 0 ? NONE : hair] : [NONE, NONE]);
    const headCells = spec.cols.map((col, ci) => ({
      text: col.caption,
      options: {
        fontSize: s.pt(m.capPx),
        bold: grid,
        color: grid ? C('accentText') : C('ink2'),
        align: col.status ? 'center' : 'left',
        ...(grid ? { fill: { color: C('band') } } : {}),
        border: [grid ? heavy : NONE, side(ci)[0], rule, side(ci)[1]],
        margin: [4, padX, 4, padX],
      },
    }));
    const body = rows.map((r, ri) =>
      r.cells.map((cell, ci) => ({
        text: cell.text,
        options: {
          fontSize: s.pt(m.px),
          bold: !!cell.bold,
          color: C(cell.color ?? 'ink'),
          align: spec.cols[ci].status ? 'center' : 'left',
          border: [hair, side(ci)[0], ri === rows.length - 1 ? heavy : hair, side(ci)[1]],
          margin: [4, padX, 4, padX],
        },
      })),
    );
    slide.addTable([headCells, ...body] as never, {
      objectName: `part:list-${m.fam}`,
      x: s.x(X),
      y: box.top,
      w: s.x(m.W),
      colW: L.colW.map((w) => s.x(w)),
      rowH: [s.y(L.headH), ...L.rows.map((r) => s.y(r.h))],
      fontFace,
      valign: 'middle',
    });
    return L;
  }

  let y = top;
  const legend = m.fam === 'rowcard' ? legendOf(spec, m.W) : '';
  if (legend) {
    // 범례 칩 — 이 장의 유일한 노랑 면(위험 줄무늬 제외)
    const lw = Math.min(m.W, legend.length * 30 + 64);
    slide.addShape(pptx.ShapeType.rect, { x: s.x(X), y: s.y(y), w: s.x(lw), h: s.y(58), fill: { color: C('accent') }, line: noLine(C('accent')) });
    slide.addText(legend, { x: s.x(X + 24), y: s.y(y), w: s.x(lw - 48), h: s.y(58), fontFace, fontSize: s.pt(LEGEND_PX), bold: true, color: C('onAccent'), valign: 'middle', margin: 0 });
    y += m.legendH;
  }
  rows.forEach((r, ri) => {
    const g = L.rows[ri];
    const cy = y;
    y += g.h + m.gap;
    if (m.fam === 'rowcard') {
      slide.addShape(pptx.ShapeType.rect, { objectName: 'part:list-rowcard', x: s.x(X), y: s.y(cy), w: s.x(m.W), h: s.y(g.h), fill: { color: C('bg') }, line: { color: C('ink'), width: s.pt(d.tokens.lines.rule) } });
      if (spec.stripe) {
        const bands = 6;
        for (let b = 0; b < bands; b++) {
          const fill = b % 2 ? C('ink') : C('accent');
          slide.addShape(pptx.ShapeType.rect, { x: s.x(X), y: s.y(cy + (b * g.h) / bands), w: s.x(STRIPE_W), h: s.y(g.h / bands), fill: { color: fill }, line: noLine(fill) });
        }
      }
      for (let ci = 1; ci < spec.cols.length; ci++) {
        const lx = X + L.colX[ci] - m.colGap / 2;
        slide.addShape(pptx.ShapeType.line, { x: s.x(lx), y: s.y(cy), w: 0, h: s.y(g.h), line: { color: C('ink'), width: s.pt(d.tokens.lines.hair) } });
      }
    } else if (m.fam === 'chipcard') {
      slide.addShape(pptx.ShapeType.roundRect, { objectName: 'part:list-chipcard', x: s.x(X), y: s.y(cy), w: s.x(m.W), h: s.y(g.h), rectRadius: s.y(Math.min(d.tokens.radius.card, g.h / 2)), fill: { color: C('surface') }, line: noLine(C('surface')) });
    } else {
      slide.addShape(pptx.ShapeType.roundRect, { objectName: 'part:list-storycard', x: s.x(X), y: s.y(cy), w: s.x(m.W), h: s.y(g.h), rectRadius: s.y(Math.min(d.tokens.radius.card, g.h / 2)), fill: { color: C('surface') }, line: { color: C('line'), width: hairW } });
    }
    const capY = cy + m.padT;
    const valY = capY + m.capPx * LINE_H + m.capGap;
    spec.cols.forEach((col, ci) => {
      const cell = r.cells[ci];
      const x0 = X + L.colX[ci];
      const cw = L.colW[ci];
      let cx = x0;
      if (col.dot && m.fam === 'chipcard') {
        slide.addShape(pptx.ShapeType.ellipse, { x: s.x(x0), y: s.y(capY + (m.capPx * LINE_H - 10) / 2), w: s.x(10), h: s.y(10), fill: { color: C('risk') }, line: noLine(C('risk')) });
        cx += 20;
      }
      slide.addText(col.caption, { x: s.x(cx), y: s.y(capY), w: s.x(cw - (cx - x0)), h: s.y(m.capPx * LINE_H), fontFace, fontSize: s.pt(m.capPx), bold: m.fam === 'storycard', color: C('ink2'), valign: 'top', margin: 0 });
      const lines = g.lines[ci];
      const th = lines * LINE_H * m.px;
      const textColor = C(cell.color ?? 'ink');
      if (col.status && m.fam !== 'rowcard') {
        // 상태 — app 은 흰 알약, story 는 테두리 캡슐(글 폭만큼)
        // 한 줄이면 글 폭만큼(capacityOf 여유 0.1in 포함), 여러 줄이면 칸 폭 그대로
        const iw = lines > 1 ? L.textW[ci] : Math.min(L.textW[ci], (textUnits(cell.text) + 1) * m.px + 0.1 / s.k);
        const pw = iw + 2 * PILL_PAD_X;
        const ph = th + 2 * PILL_PAD_Y;
        const pill = m.fam === 'chipcard' ? { fill: { color: C('bg') }, line: noLine(C('bg')) } : { fill: { color: C('surface') }, line: { color: C('ink2'), width: Math.max(0.75, s.pt(1.5)) } };
        slide.addShape(pptx.ShapeType.roundRect, { objectName: 'part:status', x: s.x(x0), y: s.y(valY - PILL_LIFT), w: s.x(pw), h: s.y(ph), rectRadius: s.y(Math.min(ph / 2, 28)), ...pill });
        slide.addText(cell.text, { x: s.x(x0 + PILL_PAD_X), y: s.y(valY - PILL_LIFT + PILL_PAD_Y), w: s.x(iw), h: s.y(th), fontFace, fontSize: s.pt(m.px), bold: true, color: textColor, valign: 'top', margin: 0 });
        return;
      }
      slide.addText(cell.text, { x: s.x(cx), y: s.y(valY), w: s.x(L.textW[ci]), h: s.y(th), fontFace, fontSize: s.pt(m.px), bold: m.fam === 'rowcard' || !!cell.bold, color: textColor, valign: 'top', margin: 0 });
    });
  });
  return L;
}

/** 목록이 비었을 때 한 줄 안내 — 프리셋 면 문법으로 */
export function drawListEmpty(c: Ctx, box: HeadBox, text: string, area?: { x: number; w: number }): void {
  const { d, s, pptx, slide, fontFace } = c;
  const C = (k: DesignColorKey) => color(d, k);
  const fam = listFamily(d);
  const X = area?.x ?? d.head.left;
  const W = area?.w ?? d.head.right - d.head.left;
  const h = 120;
  const y = box.top / s.k;
  const shape = { objectName: `part:empty-${fam}`, x: s.x(X), y: s.y(y), w: s.x(W), h: s.y(h) };
  if (fam === 'hairline') {
    for (const ly of [y, y + h]) slide.addShape(pptx.ShapeType.line, { x: s.x(X), y: s.y(ly), w: s.x(W), h: 0, line: { color: C('line'), width: Math.max(0.5, s.pt(1)) } });
    slide.addText(text, { ...shape, fontFace, fontSize: s.pt(d.tokens.type.body), color: C('ink2'), valign: 'middle', margin: 0 });
    return;
  }
  if (fam === 'grid') slide.addShape(pptx.ShapeType.rect, { ...shape, fill: { color: C('bg') }, line: { color: C('accent'), width: Math.max(0.5, s.pt(1)) } });
  else if (fam === 'rowcard') slide.addShape(pptx.ShapeType.rect, { ...shape, fill: { color: C('bg') }, line: { color: C('ink'), width: s.pt(d.tokens.lines.rule) } });
  else if (fam === 'chipcard') slide.addShape(pptx.ShapeType.roundRect, { ...shape, rectRadius: s.y(Math.min(d.tokens.radius.card, h / 2)), fill: { color: C('surface') }, line: noLine(C('surface')) });
  else slide.addShape(pptx.ShapeType.roundRect, { ...shape, rectRadius: s.y(d.tokens.radius.card), fill: { color: C('surface') }, line: { color: C('line'), width: Math.max(0.5, s.pt(1)) } });
  slide.addText(text, { x: s.x(X + 40), y: s.y(y), w: s.x(W - 80), h: s.y(h), fontFace, fontSize: s.pt(d.tokens.type.body), bold: fam === 'rowcard', color: C(fam === 'rowcard' ? 'ink' : 'ink2'), valign: 'middle', margin: 0 });
}

/**
 * B7 공유 확인 서명란(빈칸) — 두 표를 나란히. 표 문법은 프리셋별:
 * hairline 가는선 · grid 남색 머리 띠+굵은 바깥선 · rowcard 굵은 검정 격자+노랑 머리 · chipcard 회색 머리·가는 가로선 · storycard 흰 칸·가는 격자.
 * 행이 많으면 글자를 줄여 본문 높이에 맞춘다(하한 8pt) — 줄였으면 그 크기(pt)를 돌려준다.
 */
export interface SignOptions {
  /** 본문 일부 폭(px). 없으면 제목 영역 좌우 끝 */
  area?: { x: number; w: number };
  /** 칸 이름(첫 칸은 번호). 기본 번호·소속·역할·날짜·서명 */
  headers?: string[];
  /** 칸 폭 비율. 기본 0.9·2.0·1.5·1.1 */
  ratios?: number[];
  /** 표 개수 — 2 면 둘로 나눠 나란히(기본), 1 이면 한 표 */
  tables?: 1 | 2;
}

export function drawSign(c: Ctx, box: HeadBox, signatureRows: number, o: SignOptions = {}): { pt: number; shrunk: boolean } {
  const { d, s, slide, fontFace } = c;
  const C = (k: DesignColorKey) => color(d, k);
  const fam = listFamily(d);
  const X = o.area?.x ?? d.head.left;
  const W = o.area?.w ?? d.head.right - d.head.left;
  const gapX = 56;
  const tables = o.tables ?? 2;
  const half = Math.ceil(signatureRows / tables);
  const headers = o.headers ?? ['번호', '소속·역할', '날짜', '서명'];
  const base = o.ratios ?? [0.9, 2.0, 1.5, 1.1]; // 번호 칸은 「번호」·두 자리 수가 한 줄에 들 만큼
  const sum = base.reduce((a, b) => a + b, 0);
  const tw = tables === 2 ? (W - gapX) / 2 : W;
  const colW = base.map((w) => s.x((w / sum) * tw));
  const room = box.bottom - box.top; // in
  const rowH = Math.min(s.y(96), room / (half + 1));
  const want = s.pt(d.tokens.type.table);
  // 칸 위아래 여백 2pt+2pt · 줄높이 1.2
  const fitPt = Math.floor(((rowH * 72 - 4) / LINE_H) * 2) / 2;
  const pt = Math.max(8, Math.min(want, fitPt));
  const NONE = { type: 'none' as const };
  const ln = (k: DesignColorKey, px: number) => ({ type: 'solid' as const, pt: Math.max(0.5, s.pt(px)), color: C(k) });
  const style = {
    hairline: { headFill: null, headColor: 'ink2', headBold: false, top: ln('rule', 2), mid: ln('rule', 2), inner: ln('line', 1), bottom: ln('rule', 2), side: NONE, outer: NONE },
    grid: { headFill: 'band', headColor: 'accentText', headBold: true, top: ln('rule', 3), mid: ln('rule', 2), inner: ln('line', 1), bottom: ln('rule', 3), side: ln('line', 1), outer: ln('rule', 3) },
    rowcard: { headFill: 'accent', headColor: 'onAccent', headBold: true, top: ln('ink', d.tokens.lines.rule), mid: ln('ink', d.tokens.lines.rule), inner: ln('ink', d.tokens.lines.hair), bottom: ln('ink', d.tokens.lines.rule), side: ln('ink', d.tokens.lines.hair), outer: ln('ink', d.tokens.lines.rule) },
    chipcard: { headFill: 'surface', headColor: 'ink2', headBold: true, top: NONE, mid: NONE, inner: ln('line', 1), bottom: ln('line', 1), side: NONE, outer: NONE },
    storycard: { headFill: 'surface', headColor: 'ink2', headBold: true, top: ln('line', 1), mid: ln('ink', 2), inner: ln('line', 1), bottom: ln('line', 1), side: ln('line', 1), outer: ln('line', 1) },
  }[fam];
  for (let part = 0; part < tables; part++) {
    const start = part * half;
    const n = Math.min(half, signatureRows - start);
    if (n <= 0) break;
    const lastCol = headers.length - 1;
    const cellBorder = (ri: number, ci: number, rows: number) => [
      ri === 0 ? style.top : ri === 1 ? style.mid : style.inner,
      ci === lastCol ? style.outer : style.side,
      ri === 0 ? style.mid : ri === rows - 1 ? style.bottom : style.inner,
      ci === 0 ? style.outer : style.side,
    ];
    const total = n + 1;
    const head = headers.map((t, ci) => ({
      text: t,
      options: { bold: style.headBold, color: C(style.headColor as DesignColorKey), align: 'center', ...(style.headFill ? { fill: { color: C(style.headFill as DesignColorKey) } } : {}), border: cellBorder(0, ci, total), margin: [2, 5, 2, 5] },
    }));
    const body = Array.from({ length: n }, (_, i) =>
      [String(start + i + 1), ...headers.slice(1).map(() => '')].map((t, ci) => ({
        text: t,
        options: { color: C('ink'), align: ci === 0 ? 'center' : 'left', ...(fam === 'storycard' ? { fill: { color: C('surface') } } : {}), border: cellBorder(i + 1, ci, total), margin: [2, 5, 2, 5] },
      })),
    );
    slide.addTable([head, ...body] as never, {
      objectName: `part:sign-${fam}`,
      x: s.x(X + part * (tw + gapX)),
      y: box.top,
      w: s.x(tw),
      colW,
      rowH,
      fontFace,
      fontSize: pt,
      valign: 'middle',
    });
  }
  return { pt, shrunk: pt < want };
}
