// 호증(號證) 표시 날인 — 제출 서증 첫 장 상단 여백에 세로형 고무인(10×50mm)을 그린다.
// 글자는 글꼴을 PDF 에 넣지 않고 글리프 윤곽선으로 그린다(나눔고딕 전체를 넣으면 서증마다 수 MB 가 붙는다, 261124).
// 날인 위치: 대법원 전자민원센터 「서증의 첫 페이지 왼쪽 또는 오른쪽의 중간 상단부분」 → 기본 우측 상단(우 12mm·위 8mm), 첫 장에만.
// ★ 본문과 겹치는지 보는 일(픽셀 검사·자동 회피)은 렌더러가 있어야 해서 여기서 하지 않는다 — overlapChecked:false 로 알린다.
// G4(261124) 보정: 보이는 상자 정규화·배율·서명 멈춤, 여백 띠는 원본을 옛 상자로 잘라 둠, 첫 장 내용 목록 복제, 객체 압축 유지, 글자 한 배율.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const MM = 72 / 25.4;
export const STAMP_MM = { w: 10, h: 50 };
export const MARGIN_MM = { side: 12, top: 8 };
export const BAND_MM = MARGIN_MM.side * 2 + STAMP_MM.w; // 여백 띠 34mm
export const INK = { red: [196, 30, 38], purple: [74, 63, 143], black: [30, 30, 30] };
const BORDER = 0.045; // 테두리 굵기 = 짧은 변의 4.5%(실물 비율)
const STROKE = 0.03; // 글자 획을 두껍게(번들 글꼴이 Regular 뿐이라 Bold 를 흉내 낸다) — 글자 크기 대비
const REF = { word: 0x327f, num: 0x38 }; // 칸 맞춤 기준 글자 '㉿' · '8'(파이썬판 fit_font 와 같다)

/** 사용자에게 그대로 보여 줄 멈춤 사유. 그 밖의 예외(pdf-lib 내부 오류)는 도구가 정해진 문구로 바꾼다 */
export class StampStop extends Error {}

/**
 * 도장 안 글자 배치. 단위는 도장 상자 mm(폭 10·높이 50, 원점 왼쪽 위, 아래로 +). 글자마다 칸 가운데와 칸 크기.
 * @param {{ prefix?: string, number?: number, sub?: number }} [o]
 */
export function stampLayout({ prefix = '사', number, sub } = {}) {
  const { w, h } = STAMP_MM;
  const head = [...String(prefix), '제'];
  const tail = ['호', '증', ...(sub != null ? ['의', ...String(sub)] : [])];
  const nums = number != null ? [...String(number)] : [];
  const bw = Math.min(w, h) * BORDER;
  const pad = bw * 2;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const gap = Math.max(sub != null ? 1 : 2, nums.length);
  const cell = ih / (head.length + tail.length + gap);
  const cx = pad + iw / 2;
  const glyphs = [];
  head.forEach((ch, i) => glyphs.push({ ch, kind: 'word', cx, cy: pad + cell * (i + 0.5), boxW: iw * 0.94, boxH: cell * 0.9 }));
  tail.forEach((ch, i) => glyphs.push({ ch, kind: 'word', cx, cy: pad + ih - cell * (tail.length - i - 0.5), boxW: iw * 0.94, boxH: cell * 0.9 }));
  if (nums.length) {
    const top = pad + cell * head.length;
    const ncell = (cell * gap) / nums.length;
    // 번호칸 높이에 비례시켜 두 자리 이상에서 글자가 붙지 않게 한다(파이썬판 260727 수정과 같은 식)
    const nh = nums.length <= 1 ? cell * 0.86 : Math.min(cell * 0.86, ncell * 0.72);
    nums.forEach((ch, i) => glyphs.push({ ch, kind: 'num', cx, cy: top + ncell * (i + 0.5), boxW: iw * 0.8, boxH: nh }));
  }
  return { border: bw, glyphs, label: `${prefix} 제${number ?? '__'}호증${sub != null ? `의 ${sub}` : ''}` };
}

/**
 * 보이는 쪽 상자(정규화된 PDF 좌표 = 왼쪽 아래 원점·pt)에서 날인 사각형.
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

/** 그릴 윤곽이 없는 글자(글꼴에 없거나 빈 윤곽) — 빈칸으로 조용히 빠지거나 좌표가 NaN 이 되지 않게 미리 멈춘다 */
function missingGlyphs(font, chars) {
  return [...new Set([...chars])].filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)) || !font.glyphForCodePoint(c.codePointAt(0)).path.commands.length);
}

const inkBox = (gl) => ({ w: Math.max(gl.bbox.maxX - gl.bbox.minX, 1), h: Math.max(gl.bbox.maxY - gl.bbox.minY, 1) });

/**
 * 날인 계획(쪽 좌표 pt) — 테두리와 글자별 위치·배율. 글자 배율은 종류(머리·꼬리 글자 / 숫자)마다 하나다:
 * 기준 글자와 이 도장에 실제로 그리는 글자 전부가 칸에 들어가는 가장 큰 배율(글자마다 따로 맞추면 크기가 들쭉날쭉하다, G4).
 */
export function planStamp(font, layout, rect) {
  const k = rect.width / STAMP_MM.w; // 도장 mm → pt(축소 반영)
  const bw = layout.border * k;
  const scale = {};
  for (const kind of ['word', 'num']) {
    const gs = layout.glyphs.filter((g) => g.kind === kind);
    if (!gs.length) continue;
    const ref = inkBox(font.glyphForCodePoint(REF[kind]));
    scale[kind] = Math.min(...gs.map((g) => {
      const ink = inkBox(font.glyphForCodePoint(g.ch.codePointAt(0)));
      return Math.min((g.boxW * k) / Math.max(ref.w, ink.w), (g.boxH * k) / Math.max(ref.h, ink.h));
    }));
  }
  const top = rect.y + rect.height;
  const glyphs = layout.glyphs.map((g) => {
    const gl = font.glyphForCodePoint(g.ch.codePointAt(0));
    const s = scale[g.kind];
    const b = gl.bbox;
    return { ch: g.ch, kind: g.kind, s, x: rect.x + g.cx * k - ((b.minX + b.maxX) / 2) * s, y: top - g.cy * k - ((b.minY + b.maxY) / 2) * s, gl };
  });
  return { border: { x: rect.x + bw / 2, y: rect.y + bw / 2, width: rect.width - bw, height: rect.height - bw, bw }, glyphs };
}

function drawStamp(page, plan, font, color) {
  const c = rgb(color[0] / 255, color[1] / 255, color[2] / 255);
  const { bw, ...box } = plan.border;
  page.drawRectangle({ ...box, borderColor: c, borderWidth: bw });
  for (const g of plan.glyphs) {
    // fontkit 윤곽은 y 위로(+), drawSvgPath 는 SVG(y 아래로)로 읽는다 → y 를 뒤집어 넘긴다
    page.drawSvgPath(g.gl.path.scale(g.s, -g.s).toSVG(), { x: g.x, y: g.y, color: c, borderColor: c, borderWidth: g.s * font.unitsPerEm * STROKE });
  }
}

/** 모서리 순서와 상관없이 [x0,y0,x1,y1] → 상자 */
const norm = (r) => ({ x: Math.min(r.x, r.x + r.width), y: Math.min(r.y, r.y + r.height), width: Math.abs(r.width), height: Math.abs(r.height) });

/** 실제로 보이는 상자 = CropBox ∩ MediaBox(둘 다 정규화). 넓이가 없으면 멈춘다 */
function visibleBox(page) {
  const m = norm(page.getMediaBox());
  const c = norm(page.getCropBox());
  const x = Math.max(m.x, c.x);
  const y = Math.max(m.y, c.y);
  const box = { x, y, width: Math.min(m.x + m.width, c.x + c.width) - x, height: Math.min(m.y + m.height, c.y + c.height) - y };
  if (!(box.width > 1 && box.height > 1)) throw new StampStop('첫 장의 쪽 크기를 읽지 못했습니다. PDF 로 다시 저장해 주세요.');
  return box;
}

/** 실제 서명 값이 있는가 — 서명 사전(/ByteRange)이 있거나 서명란(/FT /Sig)에 값(/V)이 들어 있으면 서명된 문서다 */
function isSigned(pdf) {
  return pdf.context.enumerateIndirectObjects().some(([, o]) => {
    const d = o instanceof PDFDict ? o : null;
    if (!d) return false;
    if (d.has(PDFName.of('ByteRange'))) return true;
    return d.get(PDFName.of('FT')) === PDFName.of('Sig') && d.has(PDFName.of('V'));
  });
}

/** 첫 장 내용 목록을 그 쪽만의 새 배열로 바꾼다 — 여러 쪽이 같은 목록을 함께 쓰면 거기 덧붙인 도장이 다른 쪽에도 찍힌다(G4) */
function ownContents(pdf, page) {
  const raw = page.node.get(PDFName.of('Contents'));
  const v = raw instanceof PDFRef ? pdf.context.lookup(raw) : raw;
  const refs = v instanceof PDFArray ? v.asArray() : v instanceof PDFStream ? [raw] : [];
  page.node.set(PDFName.of('Contents'), pdf.context.obj(refs));
}

/** 원본 내용을 옛 보이는 상자로 잘라 둔다 — 여백 띠를 넓혀도 잘라서 숨겨 둔 내용이 드러나지 않게(G4) */
function clipTo(pdf, page, box) {
  const start = pdf.context.register(pdf.context.contentStream([pushGraphicsState(), rectangle(box.x, box.y, box.width, box.height), clip(), endPath()]));
  const end = pdf.context.register(pdf.context.contentStream([popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
}

/**
 * PDF 첫 장에 호증 도장을 그린다. 원본 바이트를 받아 새 바이트를 돌려준다.
 * 멈춤 사유(암호·서명·회전·배율·크기·글자)는 StampStop(한국어 문구)으로 던진다.
 * @returns {Promise<{ bytes: Uint8Array, label: string, side: string, padded: boolean, pageMm: {w:number,h:number}, pages: number }>}
 */
export async function stampExhibitPdf(input, fontBytes, { prefix = '사', number, sub, side = 'right', pad = 'never', color = 'red' } = {}) {
  const pre = String(prefix).normalize('NFC');
  if (/\s/u.test(pre)) throw new StampStop('접두어에 빈칸을 넣지 않습니다. 예: 소갑·사·갑');
  const font = fontkit.create(fontBytes);
  const layout = stampLayout({ prefix: pre, number, sub });
  const miss = missingGlyphs(font, layout.glyphs.map((g) => g.ch).join(''));
  if (miss.length) throw new StampStop(`도장 글꼴에 없는 글자가 있습니다: ${miss.join(' ')}`);
  // 암호 판정은 문서 플래그로 한다 — pdf-lib 의 EncryptedPDFError 는 ES5 로 옮겨져 instanceof 가 맞지 않고, 오류 글 정규식은 깨지기 쉽다(G4)
  const pdf = await PDFDocument.load(input, { updateMetadata: false, ignoreEncryption: true });
  if (pdf.isEncrypted) throw new StampStop('암호가 걸린 PDF 입니다(여는 암호 또는 편집 제한 암호). 암호를 풀거나 PDF 로 다시 인쇄해 저장한 파일로 주세요.');
  if (isSigned(pdf)) throw new StampStop('전자서명된 PDF 입니다. 날인하면 서명이 깨져 검증되지 않습니다. 서명 전 원본에 찍거나, 서명본은 그대로 내 주세요.');
  const page = pdf.getPage(0);
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  if (rot !== 0) throw new StampStop(`첫 장이 ${rot}도 돌아가 있어 날인 위치를 정할 수 없습니다. 회전을 풀어 저장한 PDF 로 다시 주세요.`);
  const unit = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber);
  if (unit && unit.asNumber() !== 1) throw new StampStop('첫 장에 확대 배율(UserUnit)이 걸려 있어 도장 크기를 맞출 수 없습니다. 보통 PDF 로 다시 저장해 주세요.');
  ownContents(pdf, page);
  page.node.normalize(); // pdf-lib 가 원본을 q…Q 로 감싸는 일을 먼저 끝낸다 — 자르기 경로가 그 바깥에 놓이게
  let box = visibleBox(page);
  let padded = false;
  if (pad === 'always') {
    clipTo(pdf, page, box);
    box = paddedBox(box, side);
    page.setMediaBox(box.x, box.y, box.width, box.height);
    page.setCropBox(box.x, box.y, box.width, box.height);
    for (const k of ['TrimBox', 'BleedBox', 'ArtBox']) page.node.delete(PDFName.of(k));
    padded = true;
  }
  const rect = stampRect(box, side);
  const inside = rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= box.x + box.width && rect.y + rect.height <= box.y + box.height;
  if (!inside) throw new StampStop('첫 장이 너무 작아 여백(옆 12mm·위 8mm)에 도장이 들어가지 않습니다. pad=always 로 여백을 붙이거나 큰 쪽으로 다시 만들어 주세요.');
  drawStamp(page, planStamp(font, layout, rect), font, INK[color]);
  const bytes = await pdf.save(); // 객체 압축은 pdf-lib 기본값 그대로 — 꺼 두면 압축된 원본이 2~3배로 커진다(G4)
  return { bytes, label: layout.label, side, padded, pageMm: { w: box.width / MM, h: box.height / MM }, pages: pdf.getPageCount() };
}
