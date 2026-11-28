// 제목 영역(head)·바닥줄(foot) 그리기 — 본문과 분리. 모양 5종:
//   plain      장식 없는 메타 한 줄 + 제목 문장(quiet)
//   left-band  왼쪽 검정 세로 띠 + 장 번호 두 자리(field)
//   pill-meta  회색 알약 머리줄 + 굵은 제목(app)
//   ribbon     전폭 남색 띠 + 명조 제목 + 겹줄(report)
//   capsule    테두리 캡슐 라벨 + 굵은 제목(story)
// 고르면 본문 시작 y·좌우 끝이 다시 계산된다(HeadBox).
import type { DeckPptx, DeckSlide } from './slide-types';
import { textUnits } from '../meeting';
import { fitHeadTitle, type DeckDesign, type DesignColorKey, type DesignScale } from './index';

type Slide = DeckSlide;

export interface HeadBox {
  /** 본문 왼쪽·오른쪽 끝(in) */
  left: number;
  right: number;
  /** 본문 시작 y(in) */
  top: number;
  /** 본문이 내려갈 수 있는 끝(in) — 바닥줄 위 */
  bottom: number;
  /** 제목을 한 번 줄였으면 true */
  titleShrunk: boolean;
  titleFits: boolean;
}

export interface HeadArgs {
  no: number;
  meta: string;
  title: string;
  lead?: string;
  fontFace: string;
  /** 바닥줄 왼쪽·오른쪽 글 */
  footLeft: string;
  footRight: string;
  /** app B1 — 제목 대신 두 줄 요약 문장(글 조각 배열). 강조 조각은 accent */
  headline?: { text: string; accent?: boolean; breakLine?: boolean }[];
}

export function color(d: DeckDesign, k: DesignColorKey): string {
  return (d.tokens.colors as Record<string, string>)[k] ?? d.tokens.colors.ink;
}

export function drawHead(pptx: DeckPptx, slide: Slide, d: DeckDesign, s: DesignScale, a: HeadArgs): HeadBox {
  const h = d.head;
  const t = d.tokens.type;
  const C = (k: DesignColorKey) => color(d, k);
  const L = s.x(h.left);
  const R = s.x(h.right);
  const fontFace = a.fontFace;
  slide.background = { color: C('bg') };
  const metaOpts = { fontFace, fontSize: s.pt(t.meta), color: C('ink2'), valign: 'middle' as const, margin: 0, fit: 'none' as const };

  if (h.shape === 'left-band') {
    slide.addShape(pptx.ShapeType.rect, { objectName: 'head:left-band', x: 0, y: 0, w: s.x(h.bandW!), h: s.H, fill: { color: C('headBand') }, line: { color: C('headBand'), width: 0 } });
    slide.addText(String(a.no).padStart(2, '0'), { x: 0, y: s.y(h.bandNumberY!), w: s.x(h.bandW!), h: s.y(h.bandNumberPx! * 1.2), fontFace, fontSize: s.pt(h.bandNumberPx!), bold: true, color: C('onHeadBand'), align: 'center', valign: 'middle', margin: 0 });
    slide.addShape(pptx.ShapeType.rect, { x: s.x((h.bandW! - 56) / 2), y: s.y(h.bandNumberY! + h.bandNumberPx! * 1.2 + 28), w: s.x(56), h: s.y(8), fill: { color: C('onHeadBand') }, line: { color: C('onHeadBand'), width: 0 } });
    slide.addText(a.meta, { ...metaOpts, x: L, y: s.y(h.metaY), w: R - L, h: s.y(h.metaH), bold: true });
  } else if (h.shape === 'pill-meta') {
    const w = Math.min(R - L, s.x(a.meta.length * t.meta * 0.92 + 64));
    slide.addShape(pptx.ShapeType.roundRect, { objectName: 'head:pill-meta', x: L, y: s.y(h.metaY), w, h: s.y(h.metaH), rectRadius: s.y(h.metaH / 2), fill: { color: C('surface') }, line: { color: C('surface'), width: 0 } });
    slide.addText(a.meta, { ...metaOpts, x: L + s.x(28), y: s.y(h.metaY), w: w - s.x(56), h: s.y(h.metaH) });
  } else if (h.shape === 'ribbon') {
    slide.addShape(pptx.ShapeType.rect, { objectName: 'head:ribbon', x: 0, y: 0, w: s.W, h: s.y(h.ribbonH!), fill: { color: C('accent') }, line: { color: C('accent'), width: 0 } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: s.y(h.ribbonH! + 6), w: s.W, h: s.y(2), fill: { color: C('accent') }, line: { color: C('accent'), width: 0 } });
    slide.addText(a.meta, { ...metaOpts, x: L, y: s.y(h.metaY), w: R - L, h: s.y(h.metaH), bold: true, color: C('onAccent') });
    const ry = h.titleY + h.titleH + 4;
    slide.addShape(pptx.ShapeType.rect, { objectName: 'head:double-rule', x: L, y: s.y(ry), w: R - L, h: s.y(3), fill: { color: C('accent') }, line: { color: C('accent'), width: 0 } });
    slide.addShape(pptx.ShapeType.rect, { x: L, y: s.y(ry + 7), w: R - L, h: s.y(1), fill: { color: C('accent') }, line: { color: C('accent'), width: 0 } });
  } else if (h.shape === 'capsule') {
    // 폭 = 글 폭(textUnits — 숫자·띄어쓰기는 반 글자) + 점·안쪽 여백. 글자 수 × 한 글자 폭으로 재면 시안보다 넓어진다
    const w = Math.min(R - L, s.x(textUnits(a.meta) * t.meta + 90));
    slide.addShape(pptx.ShapeType.roundRect, { objectName: 'head:capsule', x: L, y: s.y(h.metaY), w, h: s.y(h.metaH), rectRadius: s.y(h.metaH / 2), fill: { color: C('bg') }, line: { color: C('ink'), width: Math.max(0.75, s.pt(1.5)) } });
    slide.addShape(pptx.ShapeType.ellipse, { x: L + s.x(22), y: s.y(h.metaY + h.metaH / 2 - 4), w: s.x(8), h: s.y(8), fill: { color: C('ink') }, line: { color: C('ink'), width: 0 } });
    slide.addText(a.meta, { ...metaOpts, x: L + s.x(42), y: s.y(h.metaY), w: w - s.x(60), h: s.y(h.metaH), bold: true, color: C('ink') });
  } else {
    slide.addText(a.meta, { ...metaOpts, x: L, y: s.y(h.metaY), w: R - L, h: s.y(h.metaH) });
  }

  let titleShrunk = false;
  let titleFits = true;
  const titleFace = h.titleSerif ? '바탕' : fontFace;
  if (a.headline && h.headlineY !== undefined) {
    slide.addText(
      a.headline.map((p) => ({ text: p.text, options: { color: p.accent ? C('accent') : C('ink'), breakLine: p.breakLine } })),
      { objectName: 'title', x: L, y: s.y(h.headlineY), w: R - L, h: s.y(h.headlineH!), fontFace, fontSize: s.pt(96), bold: true, valign: 'top', margin: 0, lineSpacingMultiple: 1.1 },
    );
  } else {
    const f = fitHeadTitle(d, s, a.title);
    titleShrunk = f.pt < s.pt(d.tokens.type.title);
    titleFits = f.fits;
    slide.addText(a.title, { objectName: 'title', x: L, y: s.y(h.titleY), w: R - L, h: s.y(h.titleH), fontFace: titleFace, fontSize: f.pt, bold: true, color: C(h.titleColor), valign: 'middle', margin: 0, fit: 'none' });
  }
  if (a.lead) slide.addText(a.lead, { x: L, y: s.y(h.leadY), w: R - L, h: s.y(h.leadH), fontFace, fontSize: s.pt(t.note), color: C('ink2'), valign: 'middle', margin: 0 });

  // 바닥줄
  const f = d.foot;
  const fy = s.H - s.y(1080 - f.y);
  if (f.rule) slide.addShape(pptx.ShapeType.rect, { x: L, y: fy - s.y(f.rulePx + 8), w: R - L, h: s.y(f.rulePx), fill: { color: f.rulePx > 2 ? C('ink') : C('line') }, line: { color: f.rulePx > 2 ? C('ink') : C('line'), width: 0 } });
  const footOpts = { fontFace, fontSize: Math.max(8, s.pt(d.tokens.type.meta) - 2), color: C(f.color), valign: 'middle' as const, margin: 0 };
  slide.addText(a.footLeft, { ...footOpts, x: L, y: fy, w: (R - L) / 2, h: s.y(f.h) });
  slide.addText(a.footRight, { ...footOpts, x: L + (R - L) / 2, y: fy, w: (R - L) / 2, h: s.y(f.h), align: 'right' });

  const top = s.y(a.lead ? h.bodyTopWithLead : h.bodyTop);
  const bottom = fy - s.y((f.rule ? f.rulePx + 8 : 0) + 16);
  return { left: L, right: R, top, bottom, titleShrunk, titleFits };
}
