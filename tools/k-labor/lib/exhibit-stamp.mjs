// 호증(號證) 표시 날인 — 제출 서증 첫 장 상단 여백에 세로형 고무인(10×50mm)을 그린다.
// 글자는 글꼴을 PDF 에 넣지 않고 글리프 윤곽선으로 그린다(나눔고딕 전체를 넣으면 서증마다 수 MB 가 붙는다, 261124).
// 날인 위치: 대법원 전자민원센터 「서증의 첫 페이지 왼쪽 또는 오른쪽의 중간 상단부분」 → 기본 우측 상단(우 12mm·위 8mm), 첫 장에만.
// ★ 본문과 겹치는지 보는 일(픽셀 검사·자동 회피)은 렌더러가 있어야 해서 여기서 하지 않는다 — overlapChecked:false 로 알린다.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const MM = 72 / 25.4;
export const STAMP_MM = { w: 10, h: 50 };
export const MARGIN_MM = { side: 12, top: 8 };
export const BAND_MM = MARGIN_MM.side * 2 + STAMP_MM.w; // 여백 띠 34mm
export const INK = { red: [196, 30, 38], purple: [74, 63, 143], black: [30, 30, 30] };
const BORDER = 0.045; // 테두리 굵기 = 짧은 변의 4.5%(실물 비율)
const STROKE = 0.03; // 글자 획을 두껍게(번들 글꼴이 Regular 뿐이라 Bold 를 흉내 낸다) — 글자 크기 대비

/**
 * 도장 안 글자 배치. 단위는 도장 상자(폭 w·높이 h, 원점 왼쪽 위, 아래로 +). 글자마다 칸 가운데와 칸 크기.
 * @param {{ prefix?: string, number?: number, sub?: number, w?: number, h?: number, numScale?: number }} [o]
 */
export function stampLayout({ prefix = '사', number, sub, w = STAMP_MM.w, h = STAMP_MM.h, numScale = 1 } = {}) {
  const head = [...String(prefix), '제'];
  const tail = ['호', '증', ...(sub != null ? ['의', ...String(sub)] : [])];
  const nums = number != null ? [...String(number)] : [];
  const bw = Math.min(w, h) * BORDER;
  const pad = bw * 2;
  const ix0 = pad;
  const iy0 = pad;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const gap = Math.max(sub != null ? 1 : 2, nums.length);
  const cell = ih / (head.length + tail.length + gap);
  const cx = ix0 + iw / 2;
  const glyphs = [];
  head.forEach((ch, i) => glyphs.push({ ch, kind: 'head', cx, cy: iy0 + cell * (i + 0.5), boxW: iw * 0.94, boxH: cell * 0.9 }));
  tail.forEach((ch, i) => glyphs.push({ ch, kind: 'tail', cx, cy: iy0 + ih - cell * (tail.length - i - 0.5), boxW: iw * 0.94, boxH: cell * 0.9 }));
  if (nums.length) {
    const top = iy0 + cell * head.length;
    const ncell = (cell * gap) / nums.length;
    // 번호칸 높이에 비례시켜 두 자리 이상에서 글자가 붙지 않게 한다(파이썬판 260727 수정과 같은 식)
    const nh = (nums.length <= 1 ? cell * 0.86 : Math.min(cell * 0.86, ncell * 0.72)) * numScale;
    nums.forEach((ch, i) => glyphs.push({ ch, kind: 'num', cx, cy: top + ncell * (i + 0.5), boxW: iw * 0.8 * numScale, boxH: nh }));
  }
  return { border: bw, glyphs, label: `${prefix} 제${number ?? '__'}호증${sub != null ? `의 ${sub}` : ''}` };
}

/**
 * 보이는 쪽 상자(CropBox, PDF 좌표 = 왼쪽 아래 원점·pt)에서 날인 사각형.
 * 도장이 쪽 높이의 25% 를 넘으면 비례 축소(A4 보다 작은 서증).
 */
export function stampRect(box, side = 'right') {
  let w = STAMP_MM.w * MM;
  let h = STAMP_MM.h * MM;
  const maxH = box.height * 0.25;
  if (h > maxH) {
    const s = maxH / h;
    w *= s;
    h *= s;
  }
  const ms = MARGIN_MM.side * MM;
  const top = box.y + box.height - MARGIN_MM.top * MM;
  const x = side === 'left' ? box.x + ms : box.x + box.width - ms - w;
  return { x, y: top - h, width: w, height: h };
}

/** 여백 띠를 붙인 뒤의 상자 — 지정한 쪽으로 34mm 넓힌다(원본 내용 좌표는 그대로). */
export function paddedBox(box, side = 'right') {
  const band = BAND_MM * MM;
  return side === 'left' ? { x: box.x - band, y: box.y, width: box.width + band, height: box.height } : { ...box, width: box.width + band };
}

/** 글꼴에 없는 글자 목록(빈칸으로 조용히 빠지지 않게 미리 멈춘다). */
export function missingGlyphs(font, chars) {
  return [...new Set([...chars])].filter((c) => !/\s/.test(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)));
}

function drawStamp(page, rect, layout, font, color) {
  const c = rgb(color[0] / 255, color[1] / 255, color[2] / 255);
  const k = rect.width / STAMP_MM.w; // 상자 단위(mm) → pt(축소 반영)
  const bw = layout.border * k;
  page.drawRectangle({ x: rect.x + bw / 2, y: rect.y + bw / 2, width: rect.width - bw, height: rect.height - bw, borderColor: c, borderWidth: bw });
  const top = rect.y + rect.height;
  for (const g of layout.glyphs) {
    const gl = font.glyphForCodePoint(g.ch.codePointAt(0));
    const b = gl.bbox;
    const gw = Math.max(b.maxX - b.minX, 1);
    const gh = Math.max(b.maxY - b.minY, 1);
    // 칸 안에 들어가는 가장 큰 크기 — 기준 글자가 아니라 그 글자의 실제 잉크 상자로 맞춘다
    const ref = g.kind === 'num' ? font.glyphForCodePoint(0x38).bbox : font.glyphForCodePoint(0x327f).bbox; // '8' · '㉿'(파이썬판 fit_font 기준 글자)
    const s = Math.min((g.boxW * k) / Math.max(ref.maxX - ref.minX, gw), (g.boxH * k) / Math.max(ref.maxY - ref.minY, gh));
    const cx = rect.x + g.cx * k;
    const cy = top - g.cy * k;
    const x = cx - ((b.minX + b.maxX) / 2) * s;
    const y = cy - ((b.minY + b.maxY) / 2) * s;
    // fontkit 윤곽은 y 위로(+), drawSvgPath 는 SVG(y 아래로)로 읽는다 → y 를 뒤집어 넘긴다
    page.drawSvgPath(gl.path.scale(s, -s).toSVG(), { x, y, color: c, borderColor: c, borderWidth: s * font.unitsPerEm * STROKE });
  }
}

/**
 * PDF 첫 장에 호증 도장을 그린다. 원본 바이트를 받아 새 바이트를 돌려준다.
 * @returns {{ bytes: Uint8Array, label: string, side: string, padded: boolean, rect: object, pageMm: {w:number,h:number}, pages: number }}
 */
export async function stampExhibitPdf(input, fontBytes, { prefix = '사', number, sub, side = 'right', pad = 'never', color = 'red' } = {}) {
  const font = fontkit.create(fontBytes);
  const layout = stampLayout({ prefix, number, sub });
  const miss = missingGlyphs(font, layout.glyphs.map((g) => g.ch).join(''));
  if (miss.length) throw new Error(`도장 글꼴에 없는 글자가 있습니다: ${miss.join(' ')}`);
  const pdf = await PDFDocument.load(input, { updateMetadata: false });
  const page = pdf.getPage(0);
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  if (rot !== 0) throw new Error(`첫 장이 ${rot}도 돌아가 있어 날인 위치를 정할 수 없습니다. 회전을 풀어 저장한 PDF 로 다시 주세요.`);
  let box = page.getCropBox();
  let padded = false;
  if (pad === 'always') {
    const media = page.getMediaBox();
    const nb = paddedBox(box, side);
    const nm = paddedBox(media, side);
    page.setMediaBox(nm.x, nm.y, nm.width, nm.height);
    page.setCropBox(nb.x, nb.y, nb.width, nb.height);
    box = nb;
    padded = true;
  }
  const rect = stampRect(box, side);
  drawStamp(page, rect, layout, font, INK[color] ?? INK.red);
  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, label: layout.label, side, padded, rect, pageMm: { w: box.width / MM, h: box.height / MM }, pages: pdf.getPageCount() };
}
