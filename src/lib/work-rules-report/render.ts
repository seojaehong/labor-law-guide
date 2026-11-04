// 취업규칙 신고 서류 — 서식 모델(FormDoc) 한 벌을 PDF·한글(hwpx)로 그린다. 두 파일이 같은 모델에서 나와 서로 어긋나지 않는다.
// 한글 바탕(header.xml·구역 설정)은 근로계약서 작성(src/lib/contract-write)과 같은 것을 쓴다.
// PDF 글꼴은 나눔고딕(OFL) 전체 — 서브셋은 글자가 빠진다(산재 서식 261026). 글꼴에 없는 글자가 있으면 만들지 않고 그 글자를 댄다.
// 단 항 번호 ①~⑳ 은 나눔고딕에 없는데 취업규칙·법령 문안 거의 모두에 나와, 원과 숫자로 직접 그린다(한글 파일에는 글자 그대로 들어간다).
// 브라우저 API(Blob·URL)를 쓰지 않는다 — node(MCP·시험)와 브라우저가 같은 함수를 쓴다.
import { HEADER_XML } from '@/lib/contract-write/hwpx-header';
import { NS, SEC_PR, XML_HEAD } from '@/lib/contract-write/export';
import { stripControl } from '@/lib/contract-write/text';

export type Align = 'left' | 'center' | 'right';
export type Size = 'small' | 'normal' | 'large';

export interface FormCell {
  text: string;
  /** 가로로 합칠 칸 수(기본 1) */
  span?: number;
  /** 머리 칸 — 음영·가운데 */
  head?: boolean;
  align?: Align;
}

export type FormBlock =
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string; align?: Align; size?: Size; gapAfter?: number }
  | {
      kind: 'table';
      /** 열 너비 비율 */
      widths: number[];
      rows: FormCell[][];
      /** 쪽이 넘어가면 다시 그릴 머리 행 수 */
      headerRows?: number;
      /** 행 최소 높이(pt) */
      minRowHeight?: number;
      size?: Size;
    }
  | { kind: 'space'; pt?: number }
  | { kind: 'pageBreak' };

export interface FormDoc {
  title: string;
  blocks: FormBlock[];
}

/** 문서의 글자 전부 — 글꼴 확인·금지어 확인이 쓴다 */
export function formLines(doc: FormDoc): string[] {
  const out: string[] = [doc.title];
  for (const b of doc.blocks) {
    if (b.kind === 'title' || b.kind === 'text') out.push(b.text);
    else if (b.kind === 'table') for (const r of b.rows) for (const c of r) out.push(c.text);
  }
  return out.flatMap((s) => s.split('\n'));
}

/** 표 한 행의 칸 수가 열 수와 맞는지 */
function checkTable(widths: number[], rows: FormCell[][]): void {
  for (const r of rows) {
    const n = r.reduce((s, c) => s + (c.span ?? 1), 0);
    if (n !== widths.length) throw new Error(`표 행의 칸 수(${n})가 열 수(${widths.length})와 다릅니다`);
  }
}

// ── PDF ──────────────────────────────────────────────

const PT: Record<Size, number> = { small: 8.5, normal: 10, large: 13 };
/** ①(U+2460) ~ ⑳(U+2473) */
const CIRCLED = /^[①-⑳]$/;

export async function formPdf(docs: FormDoc[], fontBytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const face = fontkit.create(fontBytes as unknown as Buffer) as unknown as { hasGlyphForCodePoint(c: number): boolean };
  const drawCircled = !face.hasGlyphForCodePoint(0x2460);
  const missing = [...new Set(docs.flatMap(formLines).join(''))].filter(
    (ch) => !/\s/.test(ch) && !(drawCircled && CIRCLED.test(ch)) && !face.hasGlyphForCodePoint(ch.codePointAt(0)!),
  );
  if (missing.length) throw new Error(`PDF 글꼴에 없는 글자가 있어 PDF 를 만들 수 없습니다: ${missing.join(' ')} — 그 글자를 고쳐 주세요(한글 파일은 받을 수 있습니다)`);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(docs[0]?.title ?? '');
  pdf.setCreator('일의 무늬');
  pdf.setProducer('일의 무늬');
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const usable = W - M * 2;
  const black = rgb(0, 0, 0);
  const line = rgb(0.35, 0.35, 0.35);
  const shade = rgb(0.92, 0.93, 0.95);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  // 줄을 글꼴로 그릴 조각과 직접 그릴 ①~⑳ 으로 나눈다
  const parts = (s: string): string[] => (drawCircled ? s.split(/([①-⑳])/).filter(Boolean) : [s]);
  const isCircled = (p: string) => drawCircled && CIRCLED.test(p);
  const widthOf = (s: string, size: number) => parts(s).reduce((w, p) => w + (isCircled(p) ? size * 0.95 : font.widthOfTextAtSize(p, size)), 0);
  /** 한 줄 그리기 — y 는 글자 바닥선 */
  const drawLine = (s: string, x0: number, base: number, size: number) => {
    let x = x0;
    for (const p of parts(s)) {
      if (!isCircled(p)) {
        page.drawText(p, { x, y: base, size, font, color: black });
        x += font.widthOfTextAtSize(p, size);
        continue;
      }
      const cx = x + size * 0.475;
      const cy = base + size * 0.33;
      page.drawCircle({ x: cx, y: cy, size: size * 0.42, borderColor: black, borderWidth: size * 0.055 });
      const n = String(p.codePointAt(0)! - 0x2460 + 1);
      const ns = size * (n.length > 1 ? 0.48 : 0.6);
      page.drawText(n, { x: cx - font.widthOfTextAtSize(n, ns) / 2, y: cy - ns * 0.36, size: ns, font, color: black });
      x += size * 0.95;
    }
  };

  const wrap = (text: string, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let cur = '';
      for (const ch of para) {
        if (cur && widthOf(cur + ch, size) > width) {
          out.push(cur);
          cur = ch === ' ' ? '' : ch;
        } else cur += ch;
      }
      out.push(cur);
    }
    return out;
  };
  const xFor = (s: string, size: number, left: number, width: number, align: Align) =>
    align === 'center' ? left + (width - widthOf(s, size)) / 2 : align === 'right' ? left + width - widthOf(s, size) : left;

  const text = (s: string, size: number, align: Align, gapAfter: number) => {
    const lh = size * 1.55;
    for (const l of wrap(s, size, usable)) {
      if (y - lh < M) newPage();
      drawLine(l, xFor(l, size, M, usable, align), y - size, size);
      y -= lh;
    }
    y -= gapAfter;
  };

  const table = (b: Extract<FormBlock, { kind: 'table' }>) => {
    checkTable(b.widths, b.rows);
    const size = PT[b.size ?? 'normal'];
    const lh = size * 1.45;
    const pad = 5;
    const sum = b.widths.reduce((s, w) => s + w, 0);
    const colW = b.widths.map((w) => (w / sum) * usable);
    const minH = b.minRowHeight ?? 0;
    // 행마다 칸의 x·폭·줄
    const layout = (r: FormCell[]) => {
      let col = 0;
      let x = M;
      return r.map((c) => {
        const span = c.span ?? 1;
        const width = colW.slice(col, col + span).reduce((s, w) => s + w, 0);
        const cell = { c, x, width, lines: wrap(c.text, size, width - pad * 2) };
        col += span;
        x += width;
        return cell;
      });
    };
    const drawRow = (cells: ReturnType<typeof layout>, from: number, count: number, h: number) => {
      for (const { c, x, width, lines } of cells) {
        page.drawRectangle({ x, y: y - h, width, height: h, borderColor: line, borderWidth: 0.6, color: c.head ? shade : undefined });
        const part = lines.slice(from, from + count);
        const block = part.length * lh;
        const top = y - Math.max(pad, (h - block) / 2);
        part.forEach((l, i) => {
          const align = c.align ?? (c.head ? 'center' : 'left');
          drawLine(l, xFor(l, size, x + pad, width - pad * 2, align), top - size - i * lh + (lh - size) / 2 - 1, size);
        });
      }
      y -= h;
    };
    const heads = b.rows.slice(0, b.headerRows ?? 0).map(layout);
    const headH = heads.map((cells) => Math.max(minH, Math.max(...cells.map((x) => x.lines.length)) * lh + pad * 2));
    const drawHeads = () => heads.forEach((cells, i) => drawRow(cells, 0, Math.max(...cells.map((x) => x.lines.length)), headH[i]));
    // 새 쪽 맨 위(머리 행을 다시 그린 뒤)에 들어가는 줄 수
    const freshFit = Math.floor((H - M * 2 - headH.reduce((s, h) => s + h, 0) - pad * 2) / lh);
    for (const [ri, r] of b.rows.entries()) {
      const cells = ri < heads.length ? heads[ri] : layout(r);
      const n = Math.max(...cells.map((x) => x.lines.length));
      let from = 0;
      let atTop = false;
      // 쪽보다 긴 행은 줄 단위로 나눠 다음 쪽에 잇는다(대비표의 긴 조문). 새 쪽에 통째로 들어가는 행은 가르지 않는다
      while (from < n) {
        const room = y - M;
        const rest = n - from;
        const count = Math.min(rest, Math.floor((room - pad * 2) / lh));
        const whole = from === 0 && count === rest;
        const h = Math.max(whole ? minH : 0, count * lh + pad * 2);
        const split = count < rest;
        if (!atTop && (count < 1 || h > room || (split && (rest <= freshFit || count < 2)))) {
          newPage();
          if (ri >= heads.length) drawHeads();
          atTop = true;
          continue;
        }
        drawRow(cells, from, Math.max(1, count), h);
        from += Math.max(1, count);
        atTop = false;
      }
    }
  };

  docs.forEach((doc, di) => {
    if (di > 0) newPage();
    for (const b of doc.blocks) {
      if (b.kind === 'title') text(b.text, 17, 'center', 10);
      else if (b.kind === 'text') text(b.text, PT[b.size ?? 'normal'], b.align ?? 'left', b.gapAfter ?? 2);
      else if (b.kind === 'space') y -= b.pt ?? 8;
      else if (b.kind === 'pageBreak') newPage();
      else table(b);
    }
  });
  return pdf.save();
}

// ── 한글(hwpx) ───────────────────────────────────────
// 바탕 id(hwpx-header.ts): 본문 paraPr 20(양쪽)·26(오른쪽)·21(가운데) / 표 27(왼쪽)·28(가운데)·29(오른쪽),
// 글자 charPr 7(12pt)·8(16pt 굵게)·9(14pt 굵게)·2(9pt) / 표 13(10pt)·14(10pt 굵게)·15(8pt)·16(8pt 굵게), 테두리 3·머리 음영 4.

const esc = (s: string) => stripControl(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BODY_W = 48188;
const PARA_ALIGN: Record<Align, number> = { left: 20, center: 21, right: 26 };
const CELL_ALIGN: Record<Align, number> = { left: 27, center: 28, right: 29 };
const CHAR: Record<Size, number> = { small: 2, normal: 7, large: 9 };

const p = (text: string, paraPr: number, charPr: number, pageBreak = false) =>
  `<hp:p id="2147483648" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPr}">${text ? `<hp:t>${esc(text)}</hp:t>` : ''}</hp:run></hp:p>`;

let tableId = 2000;

function tableXml(b: Extract<FormBlock, { kind: 'table' }>, pageBreak: boolean): string {
  checkTable(b.widths, b.rows);
  const small = b.size === 'small';
  const sum = b.widths.reduce((s, w) => s + w, 0);
  const colW = b.widths.map((w) => Math.floor((w / sum) * BODY_W));
  colW[colW.length - 1] += BODY_W - colW.reduce((s, w) => s + w, 0);
  const minH = Math.round((b.minRowHeight ?? 16) * 100);
  const heads = b.headerRows ?? 0;
  const trs = b.rows
    .map((r, ri) => {
      let col = 0;
      const tds = r
        .map((c) => {
          const span = c.span ?? 1;
          const width = colW.slice(col, col + span).reduce((s, w) => s + w, 0);
          const align = c.align ?? (c.head ? 'center' : 'left');
          const charPr = c.head ? (small ? 16 : 14) : small ? 15 : 13;
          const paras = c.text.split('\n').map((l) => p(l, CELL_ALIGN[align], charPr)).join('');
          const td =
            `<hp:tc name="" header="${ri < heads ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="${c.head ? 4 : 3}">` +
            '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
            paras +
            `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${ri}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${width}" height="${minH}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
          col += span;
          return td;
        })
        .join('');
      return `<hp:tr>${tds}</hp:tr>`;
    })
    .join('');
  const id = tableId++;
  return (
    `<hp:p id="2147483648" paraPrIDRef="27" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0"><hp:run charPrIDRef="13">` +
    `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="${heads ? 1 : 0}" rowCnt="${b.rows.length}" colCnt="${b.widths.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${BODY_W}" widthRelTo="ABSOLUTE" height="${minH * b.rows.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' +
    `${trs}</hp:tbl><hp:t/></hp:run></hp:p>`
  );
}

export function formSectionXml(docs: FormDoc[]): string {
  const body: string[] = [`<hp:p id="0" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="7">${SEC_PR}</hp:run></hp:p>`];
  let pendingBreak = false;
  docs.forEach((doc, di) => {
    if (di > 0) pendingBreak = true;
    for (const b of doc.blocks) {
      if (b.kind === 'pageBreak') {
        pendingBreak = true;
        continue;
      }
      const br = pendingBreak;
      pendingBreak = false;
      if (b.kind === 'title') body.push(p(b.text, 21, 8, br));
      else if (b.kind === 'text') body.push(...b.text.split('\n').map((l, i) => p(l, PARA_ALIGN[b.align ?? 'left'], CHAR[b.size ?? 'normal'], br && i === 0)));
      else if (b.kind === 'space') body.push(p('', 20, 2, br));
      else body.push(tableXml(b, br));
    }
  });
  return `${XML_HEAD}<hs:sec ${NS}>${body.join('')}</hs:sec>`;
}

export async function formHwpx(docs: FormDoc[]): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  // mimetype 은 첫 항목·무압축이어야 한글이 연다
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file(
    'version.xml',
    `${XML_HEAD}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="13, 0, 0, 1053 WIN32LEWindows_10"/>`,
  );
  zip.file(
    'META-INF/container.xml',
    `${XML_HEAD}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`,
  );
  zip.file('META-INF/manifest.xml', `${XML_HEAD}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`);
  zip.file(
    'Contents/content.hpf',
    `${XML_HEAD}<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${esc(docs[0]?.title ?? '')}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`,
  );
  zip.file('Contents/header.xml', HEADER_XML);
  zip.file('Contents/section0.xml', formSectionXml(docs));
  zip.file(
    'settings.xml',
    `${XML_HEAD}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`,
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
