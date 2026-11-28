// 장 부품 — 전파 덱 B1(요약 수)·B3(대책) 을 프리셋의 부품 배치로 그린다.
// B1: 큰 숫자+목록(quiet) · 2×2 타일(field) · 문장+칩(app) · 요약표(report) · 전후 2블록(story)
// B3: 가는선 표(quiet) · 행 카드 흐름(field) · 체크리스트 카드(app) · 격자 표(report) · 기한 타임라인(story)
// 부품마다 고유 도형 이름(objectName 'part:…')을 단다 — 시험과 PowerPoint 선택 창에서 부품을 찾는 표시.
// 글은 입력 원문 그대로. 말줄임 없음 — 넘치면 한 번만 줄이고, 그래도 넘치면 넘침 후보로 돌려준다.
import type { DeckPptx, DeckSlide } from './slide-types';
import { HERO_BOX, shrinkToFit, type DeckDesign, type DesignScale } from './index';
import { color, type HeadBox } from './head';
import { b3PageLayout, STORY_GAP, wrapLines } from './b3-geometry';
import { capacityOf } from '../meeting';

type Slide = DeckSlide;

export interface Kpi {
  key: string;
  label: string;
  value: string;
  risk: boolean;
}
export interface ActionItem {
  id: string;
  risk: string;
  measure: string;
  owner: string;
  due: string;
}
/** 글자 칸 넘침 점검 대상 — 부르는 쪽이 capacityOf 로 잰다 */
export interface TextCheck {
  ref: string;
  field: string;
  text: string;
  wIn: number;
  pt: number;
  lines: number;
}
export interface PartResult {
  checks: TextCheck[];
  /** 한 번 줄인 칸(경고용) */
  shrunk: string[];
  /** 글이 시안 줄 수보다 길어 칸을 늘린 대책 번호(B3) */
  grown?: string[];
  /** 늘린 칸까지 합쳐 한 장 본문 높이를 넘었으면 true(B3 — 한 건만으로도 넘는 경우) */
  overPage?: boolean;
}

interface Ctx {
  pptx: DeckPptx;
  slide: Slide;
  d: DeckDesign;
  s: DesignScale;
  fontFace: string;
}

const NOTE_B1 = '자세한 내용은 다음 장부터 이어집니다. 궁금한 점은 관리감독자에게 물어 주세요.';
export const moreText = (n: number) => `외 ${n}건 — 다음 장에 이어집니다`;

function noLine(c: string) {
  return { color: c, width: 0 };
}

// ── B1 ──────────────────────────────────────────────────────────────────────

export function drawB1(c: Ctx, kpis: Kpi[]): PartResult {
  const r: PartResult = { checks: [], shrunk: [] };
  const { d, s } = c;
  const slot = d.slots.B1;
  const C = (k: Parameters<typeof color>[1]) => color(d, k);
  const t = d.tokens.type;
  const value = (k: Kpi, wPx: number, px: number, minPx: number) => {
    const f = shrinkToFit(k.value, s.x(wPx), s.pt(px), s.pt(minPx));
    if (f.shrunk) r.shrunk.push(`요약 수 「${k.value}」 ${s.pt(px)}→${f.pt}pt`);
    if (!f.fits) r.checks.push({ ref: k.key, field: 'value', text: k.value, wIn: s.x(wPx), pt: f.pt, lines: 1 });
    return f.pt;
  };
  const { pptx, slide, fontFace } = c;
  const note = (y: number, h: number, px: number, col: string, bold = false) =>
    slide.addText(NOTE_B1, { x: s.x(slot.x), y: s.y(y), w: s.x(slot.w), h: s.y(h), fontFace, fontSize: s.pt(px), color: col, bold, valign: 'middle', margin: 0 });

  if (slot.part === 'kpi-hero-list') {
    const [hero, ...rest] = kpis;
    const heroPt = value(hero, HERO_BOX.wPx, t.hero, HERO_BOX.minPx);
    slide.addText(hero.value, { objectName: 'part:kpi-hero', x: s.x(slot.x), y: s.y(slot.y - t.hero * 0.04), w: s.x(HERO_BOX.wPx), h: s.y(t.hero * 1.2), fontFace, fontSize: heroPt, color: hero.risk && hero.value !== '0' ? C('risk') : C('ink'), valign: 'middle', margin: 0 });
    slide.addText(hero.label, { x: s.x(slot.x), y: s.y(slot.y + t.hero * 1.16 + 8), w: s.x(HERO_BOX.wPx), h: s.y(48), fontFace, fontSize: s.pt(t.label), color: C('ink'), margin: 0 });
    const lx = 1000;
    const lw = slot.x + slot.w - lx;
    const rowH = 124;
    rest.forEach((k, i) => {
      const y = slot.y + 8 + i * rowH;
      slide.addText(k.value, { objectName: i === 0 ? 'part:kpi-list' : undefined, x: s.x(lx), y: s.y(y), w: s.x(slot.valueBoxW), h: s.y(rowH), fontFace, fontSize: value(k, slot.valueBoxW, slot.valuePx, slot.valueMinPx), color: C('ink'), valign: 'middle', margin: 0 });
      slide.addText(k.label, { x: s.x(lx + slot.valueBoxW + 24), y: s.y(y), w: s.x(lw - slot.valueBoxW - 24), h: s.y(rowH), fontFace, fontSize: s.pt(t.label), color: C('ink'), valign: 'middle', margin: 0 });
      slide.addShape(pptx.ShapeType.line, { x: s.x(lx), y: s.y(y + rowH), w: s.x(lw), h: 0, line: { color: C('line'), width: Math.max(0.5, s.pt(d.tokens.lines.hair)) } });
      r.checks.push({ ref: k.key, field: 'label', text: k.label, wIn: s.x(lw - slot.valueBoxW - 24), pt: s.pt(t.label), lines: 1 });
    });
    note(slot.noteY, 44, t.note, C('ink'));
  } else if (slot.part === 'tile-grid') {
    const gap = 28;
    const tw = (slot.w - gap) / 2;
    const th = (slot.h - gap) / 2;
    kpis.forEach((k, i) => {
      const x = slot.x + (i % 2) * (tw + gap);
      const y = slot.y + Math.floor(i / 2) * (th + gap);
      const fill = k.key === 'actions' ? C('accent') : C('bg'); // 강조 면은 한 장에 한 곳
      slide.addShape(pptx.ShapeType.rect, { objectName: 'part:tile-grid', x: s.x(x), y: s.y(y), w: s.x(tw), h: s.y(th), fill: { color: fill }, line: { color: C('ink'), width: s.pt(d.tokens.lines.heavy) } });
      slide.addText(k.label, { x: s.x(x + 40), y: s.y(y + 28), w: s.x(tw - 80), h: s.y(100), fontFace, fontSize: s.pt(t.label), bold: true, color: C('ink'), valign: 'top', margin: 0 });
      r.checks.push({ ref: k.key, field: 'label', text: k.label, wIn: s.x(tw - 80), pt: s.pt(t.label), lines: 2 });
      const vh = slot.valuePx * 1.2; // 한 줄 높이(1.2) — 아래 맞춤이라 글 자리는 그대로, 칸만 글 높이만큼
      slide.addText(k.value, { x: s.x(x + 40), y: s.y(y + th - 20 - vh), w: s.x(slot.valueBoxW), h: s.y(vh), fontFace, fontSize: value(k, slot.valueBoxW, slot.valuePx, slot.valueMinPx), bold: true, color: C('ink'), valign: 'bottom', margin: 0 });
    });
    note(slot.noteY, 60, t.note, C('ink'), true);
  } else if (slot.part === 'chip-grid') {
    const gx = 24;
    const gy = 28;
    const cw = (slot.w - gx) / 2;
    const ch = (slot.h - gy) / 2;
    kpis.forEach((k, i) => {
      const x = slot.x + (i % 2) * (cw + gx);
      const y = slot.y + Math.floor(i / 2) * (ch + gy);
      slide.addShape(pptx.ShapeType.roundRect, { objectName: 'part:chip-grid', x: s.x(x), y: s.y(y), w: s.x(cw), h: s.y(ch), rectRadius: s.y(Math.min(d.tokens.radius.card, ch / 2)), fill: { color: C('surface') }, line: noLine(C('surface')) });
      let lx = x + 40;
      if (k.risk) {
        slide.addShape(pptx.ShapeType.ellipse, { x: s.x(lx), y: s.y(y + ch / 2 - 6), w: s.x(12), h: s.y(12), fill: { color: C('risk') }, line: noLine(C('risk')) });
        lx += 26;
      }
      const lw = x + cw - 48 - slot.valueBoxW - 16 - lx;
      slide.addText(k.label, { x: s.x(lx), y: s.y(y), w: s.x(lw), h: s.y(ch), fontFace, fontSize: s.pt(t.label), color: C('ink2'), valign: 'middle', margin: 0 });
      r.checks.push({ ref: k.key, field: 'label', text: k.label, wIn: s.x(lw), pt: s.pt(t.label), lines: 2 });
      slide.addText(k.value, { x: s.x(x + cw - 48 - slot.valueBoxW), y: s.y(y), w: s.x(slot.valueBoxW), h: s.y(ch), fontFace, fontSize: value(k, slot.valueBoxW, slot.valuePx, slot.valueMinPx), bold: true, color: C('ink'), align: 'right', valign: 'middle', margin: 0 });
    });
    note(slot.noteY, 44, t.note, C('ink2'));
  } else if (slot.part === 'summary-table') {
    const numW = slot.valueBoxW + 72;
    const colW = [s.x(slot.w - numW), s.x(numW)];
    const outer = { type: 'solid' as const, pt: s.pt(2), color: C('accent') };
    const inner = { type: 'solid' as const, pt: Math.max(0.5, s.pt(1)), color: C('line') };
    const pad = s.pt(36);
    const rows = [
      [
        { text: '항목', options: { fontSize: s.pt(t.meta), color: C('ink2'), bold: true, fill: { color: C('band') }, border: [outer, inner, inner, outer], margin: [4, pad, 4, pad] } },
        { text: '수', options: { fontSize: s.pt(t.meta), color: C('ink2'), bold: true, align: 'right', fill: { color: C('band') }, border: [outer, outer, inner, inner], margin: [4, pad, 4, pad] } },
      ],
      ...kpis.map((k, i) => {
        const last = i === kpis.length - 1;
        const key = k.key === 'actions';
        const fill = key ? { fill: { color: C('surface') } } : {};
        return [
          { text: k.label, options: { fontSize: s.pt(t.label), color: C('ink'), bold: key, ...fill, border: [inner, inner, last ? outer : inner, outer], margin: [4, pad, 4, k.risk ? pad + s.pt(28) : pad] } },
          { text: k.value, options: { fontSize: value(k, slot.valueBoxW, slot.valuePx, slot.valueMinPx), bold: true, color: C('accentText'), align: 'right', ...fill, border: [inner, outer, last ? outer : inner, inner], margin: [4, pad, 4, pad] } },
        ];
      }),
    ];
    slide.addTable(rows as never, { objectName: 'part:summary-table', x: s.x(slot.x), y: s.y(slot.y), w: s.x(slot.w), colW, rowH: [s.y(72), ...kpis.map(() => s.y(112))], fontFace, valign: 'middle' });
    kpis.forEach((k, i) => {
      const y = slot.y + 72 + i * 112;
      if (k.risk) slide.addShape(pptx.ShapeType.rect, { x: s.x(slot.x + 36), y: s.y(y + 49), w: s.x(14), h: s.y(14), fill: { color: C('risk') }, line: noLine(C('risk')) });
      if (k.key === 'actions') slide.addShape(pptx.ShapeType.rect, { objectName: 'part:key-bar', x: s.x(slot.x + slot.w - numW), y: s.y(y), w: s.x(8), h: s.y(112), fill: { color: C('accent') }, line: noLine(C('accent')) });
    });
    slide.addShape(pptx.ShapeType.rect, { x: s.x(slot.x), y: s.y(slot.noteY), w: s.x(slot.w), h: s.y(100), fill: { color: C('bg') }, line: { color: C('accent'), width: Math.max(0.5, s.pt(1)) } });
    slide.addText(NOTE_B1, { x: s.x(slot.x + 40), y: s.y(slot.noteY), w: s.x(slot.w - 80), h: s.y(100), fontFace, fontSize: s.pt(t.note), color: C('ink'), valign: 'middle', margin: 0 });
  } else {
    // before-after — 왼쪽 「바뀐 것」 → 화살표 → 오른쪽 「정한 것」(마지막 「다음으로 미룬 것」은 점선 위·보조색)
    const [before, ...after] = kpis;
    const rowH = 132;
    const bw = 600;
    const bh = 60 + rowH + 40;
    const by = slot.y + (slot.h - bh) / 2;
    const block = (x: number, y: number, w: number, h: number) =>
      slide.addShape(pptx.ShapeType.roundRect, { objectName: 'part:before-after', x: s.x(x), y: s.y(y), w: s.x(w), h: s.y(h), rectRadius: s.y(24), fill: { color: C('surface') }, line: { color: C('line'), width: Math.max(0.5, s.pt(1)) } });
    const label = (text: string, x: number, y: number, w: number) => slide.addText(text, { x: s.x(x), y: s.y(y), w: s.x(w), h: s.y(40), fontFace, fontSize: s.pt(t.meta), bold: true, color: C('ink2'), margin: 0 });
    // 시안(c5 .before .kpi) — 「바뀐 것」은 숫자 칸 120px·간격 32px, 위험 표시(⚠)는 라벨 위에 쌓는다
    const row = (k: Kpi, x: number, y: number, w: number, muted: boolean, numW = slot.valueBoxW, numGap = 16) => {
      slide.addText(k.value, { x: s.x(x), y: s.y(y), w: s.x(numW), h: s.y(rowH), fontFace, fontSize: value(k, numW, slot.valuePx, slot.valueMinPx), bold: true, color: muted ? C('ink2') : C('ink'), valign: 'middle', margin: 0 });
      const lx = x + numW + numGap;
      const lw = x + w - lx;
      if (k.risk) {
        const lines = wrapLines(k.label, capacityOf(s.x(lw), s.pt(t.body), 1)); // ko-KR 낱말 줄바꿈 줄 수
        const gy = y + (rowH - (22 + 10 + lines * 1.3 * t.body)) / 2;
        slide.addShape(pptx.ShapeType.triangle, { objectName: 'part:risk-mark', x: s.x(lx), y: s.y(gy), w: s.x(24), h: s.y(22), fill: { color: C('surface') }, line: { color: C('risk'), width: Math.max(0.75, s.pt(2.2)) } });
        slide.addText('!', { x: s.x(lx), y: s.y(gy + 5), w: s.x(24), h: s.y(17), fontFace, fontSize: Math.max(6, s.pt(14)), bold: true, color: C('risk'), align: 'center', valign: 'middle', margin: 0 });
        slide.addText(k.label, { x: s.x(lx), y: s.y(gy + 32), w: s.x(lw), h: s.y(lines * 1.3 * t.body), fontFace, fontSize: s.pt(t.body), color: muted ? C('ink2') : C('ink'), valign: 'top', margin: 0 });
      } else slide.addText(k.label, { x: s.x(lx), y: s.y(y), w: s.x(lw), h: s.y(rowH), fontFace, fontSize: s.pt(t.body), color: muted ? C('ink2') : C('ink'), valign: 'middle', margin: 0 });
      r.checks.push({ ref: k.key, field: 'label', text: k.label, wIn: s.x(lw), pt: s.pt(t.body), lines: 2 });
    };
    block(slot.x, by, bw, bh);
    label('바뀐 것', slot.x + 40, by + 24, bw - 80);
    row(before, slot.x + 40, by + 60, bw - 80, false, 120, 32);
    const ax = slot.x + bw + 32;
    slide.addShape(pptx.ShapeType.line, { x: s.x(ax), y: s.y(slot.y + slot.h / 2), w: s.x(96), h: 0, line: { color: C('ink2'), width: Math.max(1, s.pt(3)), endArrowType: 'triangle' } });
    const fx = ax + 96 + 32;
    const fw = slot.x + slot.w - fx;
    const fh = 60 + after.length * rowH + 24;
    const fy = slot.y + (slot.h - fh) / 2;
    block(fx, fy, fw, fh);
    slide.addShape(pptx.ShapeType.rect, { x: s.x(fx), y: s.y(fy + 12), w: s.x(8), h: s.y(fh - 24), fill: { color: C('accent') }, line: noLine(C('accent')) });
    label('정한 것', fx + 48, fy + 24, fw - 96);
    after.forEach((k, i) => {
      const y = fy + 60 + i * rowH;
      const deferred = k.key === 'deferred';
      if (i > 0) slide.addShape(pptx.ShapeType.line, { x: s.x(fx + 48), y: s.y(y), w: s.x(fw - 96), h: 0, line: deferred ? { color: C('ink2'), width: Math.max(0.75, s.pt(1.5)), dashType: 'sysDash' } : { color: C('line'), width: Math.max(0.5, s.pt(1)) } });
      row(k, fx + 48, y, fw - 96, deferred);
    });
    note(slot.noteY, 48, t.note, C('ink2'));
  }
  return r;
}

// ── B3 ──────────────────────────────────────────────────────────────────────

/**
 * 한 장 분량의 대책을 그린다. more > 0 이면 마지막에 「외 N건 — 다음 장에 이어집니다」.
 * 칸 높이는 b3PageLayout 에서 — 글이 시안 줄 수를 넘으면 표 행·카드를 늘린다(그때 grown 에 대책 번호).
 */
export function drawB3Page(c: Ctx, box: HeadBox, items: ActionItem[], opt: { shrunk: boolean; more: number; accentFirst?: boolean }): PartResult {
  const r: PartResult = { checks: [], shrunk: [], grown: [] };
  const { d, s, pptx, slide, fontFace } = c;
  // 글 언어 ko-KR — PowerPoint 는 언어가 en-US 면 한글을 낱자 사이에서도 끊는다(「설 / 치」). ko-KR 이면 낱말 사이에서 끊는다(261128 COM 실측)
  const KO = 'ko-KR';
  const slot = d.slots.B3;
  const C = (k: Parameters<typeof color>[1]) => color(d, k);
  const t = d.tokens.type;
  const itemH = opt.shrunk ? slot.itemHShrunk : slot.itemH;
  const px = opt.shrunk ? slot.textPxShrunk : slot.textPx;
  const datePx = opt.shrunk ? Math.min(slot.datePx, slot.textPxShrunk) : slot.datePx;
  const top = box.top / s.k; // px
  const L = b3PageLayout(d, s, items, { shrunk: opt.shrunk, more: opt.more });
  if (top + L.total > box.bottom / s.k + 0.5) r.overPage = true;
  items.forEach((a, i) => {
    const f = Object.values(L.items[i].fields);
    if (f.some((x) => x.need > x.lines)) r.grown!.push(a.id);
    // 칸은 필요한 줄 수만큼 잡았다 — 넘침 점검은 그 줄 수로. 한 장 높이를 넘는 장(overPage)은 시안 줄 수로 재 넘침 후보(overflowEstimates)에 남긴다
    for (const x of f) r.checks.push({ ref: a.id, field: x.field, text: x.text, wIn: s.x(x.wPx), pt: s.pt(x.px), lines: r.overPage ? x.lines : Math.max(x.lines, x.need) });
  });

  if (slot.part === 'hairline-table' || slot.part === 'report-grid') {
    const report = slot.part === 'report-grid';
    const colW = slot.cols.map((w) => s.x(w));
    const NONE = { type: 'none' as const };
    const hair = { type: 'solid' as const, pt: Math.max(0.5, s.pt(1)), color: C('line') };
    const rule = { type: 'solid' as const, pt: s.pt(2), color: C('rule') };
    const heavy = { type: 'solid' as const, pt: s.pt(report ? 3 : 2), color: C('rule') };
    const padX = s.pt(report ? 36 : 12);
    const n = items.length + (opt.more ? 1 : 0);
    const bottomOf = (ri: number) => (ri === n ? heavy : hair);
    const sideOf = (ci: number) => (report ? [ci === 3 ? NONE : hair, ci === 0 ? NONE : hair] : [NONE, NONE]);
    const headCells = ['위험', '대책', '담당', '기한'].map((txt, ci) => ({
      text: txt,
      options: {
        fontSize: s.pt(report ? 26 : t.meta),
        bold: report,
        color: report ? C('accentText') : C('ink2'),
        align: ci === 3 ? 'right' : 'left',
        ...(report ? { fill: { color: C('band') } } : {}),
        border: [report ? heavy : NONE, sideOf(ci)[0], rule, sideOf(ci)[1]],
        margin: [4, padX, 4, padX],
        lang: KO,
      },
    }));
    const body = items.map((a, i) => {
      const ri = i + 1;
      const base = (ci: number) => ({ fontSize: s.pt(px), color: C('ink'), border: [hair, sideOf(ci)[0], bottomOf(ri), sideOf(ci)[1]], margin: [4, padX, 4, padX], lang: KO });
      return [
        report
          ? { text: a.risk, options: { ...base(0), bold: true } }
          : { text: [{ text: '● ', options: { color: C('risk') } }, { text: a.risk, options: { bold: true } }], options: base(0) },
        { text: a.measure, options: base(1) },
        { text: a.owner, options: base(2) },
        { text: a.due, options: { ...base(3), align: 'right', bold: report, color: report ? C('accentText') : C('ink') } },
      ];
    });
    const more = opt.more
      ? [[{ text: moreText(opt.more), options: { colspan: 4, fontSize: s.pt(px), bold: true, color: C('ink2'), border: [hair, NONE, heavy, NONE], margin: [4, padX, 4, padX], lang: KO } }]]
      : [];
    const headH = report ? 76 : 60;
    slide.addTable([headCells, ...body, ...more] as never, {
      objectName: report ? 'part:report-grid' : 'part:hairline-table',
      x: s.x(slot.x), y: box.top, w: s.x(slot.w), colW, rowH: [s.y(headH), ...L.items.map((it) => s.y(it.h)), ...more.map(() => s.y(L.moreH))], fontFace, lang: KO, valign: 'middle',
    });
  } else if (slot.part === 'row-cards') {
    // 범례 칩(이 장의 유일한 노랑 면) → 행 카드: 위험 → 대책 → 누가·언제
    const legend = '위험 → 대책 → 누가 · 언제';
    slide.addShape(pptx.ShapeType.rect, { x: s.x(slot.x), y: s.y(top), w: s.x(520), h: s.y(58), fill: { color: C('accent') }, line: noLine(C('accent')) });
    slide.addText(legend, { x: s.x(slot.x + 24), y: s.y(top), w: s.x(472), h: s.y(58), fontFace, lang: KO, fontSize: s.pt(32), bold: true, color: C('onAccent'), valign: 'middle', margin: 0 });
    const gap = slot.gap ?? 24;
    const [cs, cr, ca, cm, , co] = slot.cols;
    const cards = [...items.map((a, i) => ({ a, g: L.items[i] })), ...(opt.more ? [{ a: null as ActionItem | null, g: null }] : [])];
    let y = top + 76;
    cards.forEach(({ a, g }) => {
      const x = slot.x;
      const h = g ? g.h : L.moreH;
      const cy = y;
      y += h + gap;
      slide.addShape(pptx.ShapeType.rect, { objectName: 'part:row-cards', x: s.x(x), y: s.y(cy), w: s.x(slot.w), h: s.y(h), fill: { color: C('bg') }, line: { color: C('ink'), width: s.pt(d.tokens.lines.rule) } });
      if (!a || !g) {
        slide.addText(moreText(opt.more), { x: s.x(x + 40), y: s.y(cy), w: s.x(slot.w - 80), h: s.y(h), fontFace, lang: KO, fontSize: s.pt(px), bold: true, color: C('ink'), valign: 'middle', margin: 0 });
        return;
      }
      // 위험 줄무늬 — 무늬 채우기가 없어 검정·노랑 띠를 번갈아 쌓는다(의미 표시라 강조 셈에서 뺀다)
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        const fill = b % 2 ? C('ink') : C('accent');
        slide.addShape(pptx.ShapeType.rect, { objectName: b === 0 ? 'part:hazard-stripe' : undefined, x: s.x(x), y: s.y(cy + (b * h) / bands), w: s.x(cs), h: s.y(h / bands), fill: { color: fill }, line: noLine(fill) });
      }
      const capY = opt.shrunk ? 10 : 18;
      const valY = opt.shrunk ? 40 : 54;
      const cap = (text: string, cx: number, w: number) => slide.addText(text, { x: s.x(cx), y: s.y(cy + capY), w: s.x(w), h: s.y(30), fontFace, lang: KO, fontSize: s.pt(28), color: C('ink2'), margin: 0 });
      const val = (text: string, cx: number, w: number, vh: number) =>
        slide.addText(text, { x: s.x(cx), y: s.y(cy + valY), w: s.x(w), h: s.y(vh), fontFace, lang: KO, fontSize: s.pt(px), bold: true, color: C('ink'), valign: 'top', margin: 0, lineSpacingMultiple: 1.05 });
      const xr = x + cs + 28;
      cap('위험', xr, cr - 56);
      val(a.risk, xr, cr - 56, g.riskH);
      const xa = x + cs + cr + ca + 28;
      cap('대책', xa, cm - 56);
      val(a.measure, xa, cm - 56, g.measureH);
      for (const ax of [x + cs + cr, x + cs + cr + ca + cm]) slide.addText('→', { x: s.x(ax), y: s.y(cy), w: s.x(ca), h: s.y(h), fontFace, lang: KO, fontSize: s.pt(44), bold: true, color: C('ink'), align: 'center', valign: 'middle', margin: 0 });
      const xo = x + slot.w - co + 28;
      slide.addText(a.owner, { x: s.x(xo), y: s.y(cy + capY), w: s.x(co - 56), h: s.y(g.ownerH), fontFace, lang: KO, fontSize: s.pt(opt.shrunk ? 28 : 32), bold: true, color: C('ink'), margin: 0 });
      slide.addText(a.due, { x: s.x(xo), y: s.y(cy + g.subY), w: s.x(slot.dateBoxW), h: s.y(datePx * 1.3), fontFace, lang: KO, fontSize: s.pt(datePx), bold: true, color: C('ink'), margin: 0 });
      for (const lx of [x + cs + cr, x + slot.w - co]) slide.addShape(pptx.ShapeType.line, { x: s.x(lx), y: s.y(cy), w: 0, h: s.y(h), line: { color: C('ink'), width: s.pt(d.tokens.lines.hair) } });
    });
  } else if (slot.part === 'checklist-cards') {
    const gap = slot.gap ?? 24;
    const [cc, cm, co, cd] = slot.cols;
    const cards = [...items.map((a, i) => ({ a, g: L.items[i] })), ...(opt.more ? [{ a: null as ActionItem | null, g: null }] : [])];
    let y = top;
    cards.forEach(({ a, g }) => {
      const x = slot.x;
      const h = g ? g.h : L.moreH;
      const cy = y;
      y += h + gap;
      slide.addShape(pptx.ShapeType.roundRect, { objectName: 'part:checklist-cards', x: s.x(x), y: s.y(cy), w: s.x(slot.w), h: s.y(h), rectRadius: s.y(Math.min(d.tokens.radius.card, itemH / 2)), fill: { color: C('surface') }, line: noLine(C('surface')) });
      if (!a || !g) {
        slide.addText(moreText(opt.more), { x: s.x(x + 40), y: s.y(cy), w: s.x(slot.w - 80), h: s.y(h), fontFace, lang: KO, fontSize: s.pt(px), bold: true, color: C('ink2'), valign: 'middle', margin: 0 });
        return;
      }
      slide.addShape(pptx.ShapeType.ellipse, { x: s.x(x + 40), y: s.y(cy + (h - cc) / 2), w: s.x(cc), h: s.y(cc), fill: { color: C('bg') }, line: { color: C('line'), width: s.pt(3) } });
      slide.addText('✓', { x: s.x(x + 40), y: s.y(cy + (h - cc) / 2), w: s.x(cc), h: s.y(cc), fontFace, lang: KO, fontSize: s.pt(30), color: C('ink2'), align: 'center', valign: 'middle', margin: 0 });
      const tx = x + 40 + cc + 32;
      slide.addShape(pptx.ShapeType.ellipse, { x: s.x(tx), y: s.y(cy + 34), w: s.x(10), h: s.y(10), fill: { color: C('risk') }, line: noLine(C('risk')) });
      slide.addText(a.risk, { x: s.x(tx + 20), y: s.y(cy + 20), w: s.x(cm - 20), h: s.y(g.riskH), fontFace, lang: KO, fontSize: s.pt(26), color: C('ink2'), valign: g.riskH > 38 ? 'top' : 'middle', margin: 0 });
      slide.addText(a.measure, { x: s.x(tx), y: s.y(cy + g.subY), w: s.x(cm), h: s.y(g.measureH), fontFace, lang: KO, fontSize: s.pt(px), bold: true, color: C('ink'), valign: 'top', margin: 0 });
      const badge = (text: string, bx: number, w: number, bh: number, bold: boolean) => {
        slide.addShape(pptx.ShapeType.roundRect, { x: s.x(bx), y: s.y(cy + (h - bh) / 2), w: s.x(w), h: s.y(bh), rectRadius: s.y(20), fill: { color: C('bg') }, line: noLine(C('bg')) });
        slide.addText(text, { x: s.x(bx + 20), y: s.y(cy + (h - bh) / 2), w: s.x(w - 40), h: s.y(bh), fontFace, lang: KO, fontSize: s.pt(26), bold, color: C('ink'), valign: 'middle', margin: 0 });
      };
      const xd = x + slot.w - 40 - cd;
      const xo = xd - 16 - co;
      badge(`담당  ${a.owner}`, xo, co, g.ownerH, false);
      badge(`기한  ${a.due}`, xd, cd, 72, true);
    });
  } else {
    // deadline-timeline — 기한 순 카드 + 가로 축 · 가장 먼저 오는 기한 하나만 청록 · 카드는 이 장 카드 수로 본문 폭을 나눈다
    const gap = slot.gap ?? 48;
    const cw = L.cardW;
    const cardH = L.items[0]?.h ?? itemH;
    const axisY = top + cardH + 72;
    slide.addShape(pptx.ShapeType.line, { objectName: 'part:deadline-timeline', x: s.x(slot.x), y: s.y(axisY), w: s.x(slot.w), h: 0, line: { color: C('ink'), width: s.pt(2) } });
    const cards = [...items.map((a, i) => ({ a, g: L.items[i] })), ...(opt.more ? [{ a: null as ActionItem | null, g: null }] : [])];
    cards.forEach(({ a, g }, i) => {
      const x = slot.x + i * (cw + gap);
      slide.addShape(pptx.ShapeType.roundRect, { x: s.x(x), y: s.y(top), w: s.x(cw), h: s.y(cardH), rectRadius: s.y(d.tokens.radius.card), fill: { color: C('surface') }, line: { color: C('line'), width: Math.max(0.5, s.pt(1)) } });
      const iw = cw - 72;
      if (!a || !g) {
        slide.addText(moreText(opt.more), { x: s.x(x + 36), y: s.y(top), w: s.x(iw), h: s.y(cardH), fontFace, lang: KO, fontSize: s.pt(px), bold: true, color: C('ink2'), valign: 'middle', margin: 0 });
        return;
      }
      const lab = (text: string, y: number) => slide.addText(text, { x: s.x(x + 36), y: s.y(y), w: s.x(iw), h: s.y(30), fontFace, lang: KO, fontSize: s.pt(22), bold: true, color: C('ink2'), margin: 0 });
      lab('위험', top + 28);
      slide.addText(a.risk, { x: s.x(x + 36), y: s.y(top + 58), w: s.x(iw), h: s.y(g.riskH), fontFace, lang: KO, fontSize: s.pt(px), color: C('ink'), valign: 'top', margin: 0 });
      const my = top + 58 + g.riskH + STORY_GAP;
      slide.addShape(pptx.ShapeType.line, { x: s.x(x + 36), y: s.y(my), w: s.x(iw), h: 0, line: { color: C('line'), width: Math.max(0.5, s.pt(1)) } });
      lab('대책', my + STORY_GAP);
      slide.addText(a.measure, { x: s.x(x + 36), y: s.y(my + STORY_GAP + 34), w: s.x(iw), h: s.y(g.measureH), fontFace, lang: KO, fontSize: s.pt(px), bold: true, color: C('ink'), valign: 'top', margin: 0 });
      const oy = top + cardH - 22 - g.ownerH;
      lab('담당', oy - 30);
      slide.addText(a.owner, { x: s.x(x + 36), y: s.y(oy), w: s.x(iw), h: s.y(g.ownerH), fontFace, lang: KO, fontSize: s.pt(px), color: C('ink'), margin: 0 });
      const cx = x + cw / 2;
      slide.addShape(pptx.ShapeType.line, { x: s.x(cx), y: s.y(top + cardH), w: 0, h: s.y(72), line: { color: C('ink2'), width: Math.max(0.5, s.pt(1)) } });
      const first = !!opt.accentFirst && i === 0;
      slide.addShape(pptx.ShapeType.ellipse, { x: s.x(cx - 19), y: s.y(axisY - 19), w: s.x(38), h: s.y(38), fill: { color: first ? C('accent') : C('bg') }, line: { color: first ? C('accent') : C('ink'), width: s.pt(3) } });
      slide.addText(a.due, { x: s.x(x), y: s.y(axisY + 30), w: s.x(cw), h: s.y(44), fontFace, lang: KO, fontSize: s.pt(datePx), bold: true, color: first ? C('accentText') : C('ink'), align: 'center', margin: 0 });
    });
  }
  return r;
}
