// 근로계약서 작성 — 계약서 본문 모델(document.ts) → 엑셀·한글·PDF 바이트.
// 🔒 브라우저에서만 만든다. 서버로 아무것도 보내지 않는다. 라이브러리는 동적 import 라 첫 화면 용량에 영향이 없다.
// 브라우저 API(Blob·URL)는 쓰지 않는다 — node 시험이 같은 함수로 파일을 만들어 다시 읽는다.

import type { ContractDocument } from './document';
import { HEADER_XML } from './hwpx-header';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// ── 엑셀 ─────────────────────────────────────────────

export async function buildContractXlsx(doc: ContractDocument): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = '일의 무늬';
  const ws = wb.addWorksheet('근로계약서', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 22 }, { width: 14 }, { width: 40 }, { width: 16 }];
  const wrap = { wrapText: true, vertical: 'top' as const };
  const line = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).font = { bold: opts.bold, size: opts.size ?? 11 };
    row.getCell(1).alignment = wrap;
    row.height = Math.max(18, Math.ceil(text.length / 48) * 16);
  };
  const title = ws.addRow([doc.title]);
  ws.mergeCells(title.number, 1, title.number, 4);
  title.getCell(1).font = { bold: true, size: 16 };
  title.getCell(1).alignment = { horizontal: 'center' };
  ws.addRow([]);
  line(doc.preamble);
  for (const c of doc.clauses) {
    ws.addRow([]);
    line(c.heading, { bold: true });
    for (const l of c.lines) line(l);
    if (c.heading.startsWith('제5조')) {
      line(doc.wageTable.caption, { bold: true, size: 10 });
      const head = ws.addRow(doc.wageTable.header);
      head.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF1F5' } };
      });
      for (const r of doc.wageTable.rows) {
        const row = ws.addRow([r.label, r.hours, r.basis, r.amount]);
        row.getCell(4).numFmt = '#,##0"원"';
      }
      const total = ws.addRow(['합계', '', '', doc.wageTable.total]);
      total.font = { bold: true };
      total.getCell(4).numFmt = '#,##0"원"';
      const first = head.number;
      for (let r = first; r <= total.number; r += 1) {
        for (let col = 1; col <= 4; col += 1) {
          ws.getCell(r, col).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        }
      }
    }
  }
  ws.addRow([]);
  line(doc.signature.date);
  ws.addRow([]);
  line('(사업주)', { bold: true });
  for (const l of doc.signature.employer) line(l);
  line('(근로자)', { bold: true });
  for (const l of doc.signature.employee) line(l);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ── 한글(hwpx) ───────────────────────────────────────
// 바탕 서식 id(hwpx-header.ts): 본문 paraPr 20·charPr 7, 제목 21·8, 조 제목 22·9, 표 27·13, 표 머리 28·14, 표 테두리 3·머리 4.

const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SEC_PR =
  '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="5670" right="5670" top="5670" bottom="5670"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill><hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>';

const para = (text: string, paraPr = 20, charPr = 7) =>
  `<hp:p id="2147483648" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPr}">${text ? `<hp:t>${esc(text)}</hp:t>` : ''}</hp:run></hp:p>`;

/** 본문 폭 48188 HWPUNIT(A4 − 좌우 여백) — 열 폭 합이 이 값이다 */
const COL_WIDTHS = [11000, 9000, 18188, 10000];
const ROW_H = 1582;

function cell(text: string, col: number, row: number, header: boolean, colSpan = 1): string {
  const [paraPr, charPr, fill] = header ? [28, 14, 4] : [27, 13, 3];
  const width = COL_WIDTHS.slice(col, col + colSpan).reduce((s, w) => s + w, 0);
  return (
    `<hp:tc name="" header="${header ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="${fill}">` +
    '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
    para(text, paraPr, charPr) +
    `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${colSpan}" rowSpan="1"/><hp:cellSz width="${width}" height="${ROW_H}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`
  );
}

// 표 제목은 표 첫 행(4칸 병합)에 넣는다 — 제목 문단의 「다음 문단과 함께」를 한글이 지키지 않아 제목만 쪽 끝에 남았다(261103).
// 표는 쪽을 넘기지 않게(pageBreak NONE) 한 덩어리로 둔다 — 항목이 7행 이내라 한 쪽에 들어간다.
function wageTableXml(doc: ContractDocument): string {
  const rows = [
    doc.wageTable.header,
    ...doc.wageTable.rows.map((r) => [r.label, r.hours, r.basis, won(r.amount)]),
    ['합계', '', '', won(doc.wageTable.total)],
  ];
  const captionRow = `<hp:tr>${cell(doc.wageTable.caption, 0, 0, true, 4)}</hp:tr>`;
  const trs = captionRow + rows.map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ci, ri + 1, ri === 0)).join('')}</hp:tr>`).join('');
  const rowCnt = rows.length + 1;
  return (
    '<hp:p id="2147483648" paraPrIDRef="27" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="13">' +
    `<hp:tbl id="1001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="${rowCnt}" colCnt="4" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="48188" widthRelTo="ABSOLUTE" height="${ROW_H * rowCnt}" heightRelTo="ABSOLUTE" protect="0"/>` +
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' +
    `${trs}</hp:tbl><hp:t/></hp:run></hp:p>`
  );
}

export function contractSectionXml(doc: ContractDocument): string {
  const body: string[] = [];
  body.push(`<hp:p id="0" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="7">${SEC_PR}</hp:run></hp:p>`);
  body.push(para(doc.title, 21, 8), para(doc.preamble));
  for (const c of doc.clauses) {
    body.push(para(c.heading, 22, 9));
    for (const l of c.lines) body.push(para(l));
    if (c.heading.startsWith('제5조')) body.push(wageTableXml(doc));
  }
  body.push(para(''), para(doc.signature.date, 21, 7), para(''), para('(사업주)', 22, 9));
  for (const l of doc.signature.employer) body.push(para(l));
  body.push(para('(근로자)', 22, 9));
  for (const l of doc.signature.employee) body.push(para(l));
  return `${XML_HEAD}<hs:sec ${NS}>${body.join('')}</hs:sec>`;
}

export async function buildContractHwpx(doc: ContractDocument): Promise<Uint8Array> {
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
    `${XML_HEAD}<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${esc(doc.title)}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`,
  );
  zip.file('Contents/header.xml', HEADER_XML);
  zip.file('Contents/section0.xml', contractSectionXml(doc));
  zip.file(
    'settings.xml',
    `${XML_HEAD}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`,
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ── PDF ──────────────────────────────────────────────
// 한글 글꼴은 나눔고딕(OFL) 전체를 넣는다 — 서브셋은 글리프를 버려 빈 칸이 된 사고가 있었다(산재 서식 261026).

export async function buildContractPdf(doc: ContractDocument, fontBytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(doc.title);
  pdf.setCreator('일의 무늬');
  pdf.setProducer('일의 무늬');
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const W = 595.28;
  const H = 841.89;
  const M = 56;
  const usable = W - M * 2;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, size: number, width: number): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const ch of text) {
      if (font.widthOfTextAtSize(cur + ch, size) > width && cur) {
        out.push(cur);
        cur = ch === ' ' ? '' : ch;
      } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  };
  const text = (s: string, size = 10.5, opts: { center?: boolean; gap?: number } = {}) => {
    for (const l of wrap(s, size, usable)) {
      ensure(size * 1.6);
      const x = opts.center ? (W - font.widthOfTextAtSize(l, size)) / 2 : M;
      page.drawText(l, { x, y: y - size, size, font, color: rgb(0, 0, 0) });
      y -= size * 1.6;
    }
    y -= opts.gap ?? 0;
  };
  const colW = [usable * 0.22, usable * 0.17, usable * 0.4, usable * 0.21];
  const table = () => {
    const rows = [doc.wageTable.header, ...doc.wageTable.rows.map((r) => [r.label, r.hours, r.basis, won(r.amount)]), ['합계', '', '', won(doc.wageTable.total)]];
    const size = 9;
    for (const [ri, r] of rows.entries()) {
      const cells = r.map((t, ci) => wrap(t, size, colW[ci] - 8));
      const h = Math.max(...cells.map((c) => c.length)) * size * 1.4 + 8;
      ensure(h);
      let x = M;
      for (const [ci, lines] of cells.entries()) {
        page.drawRectangle({ x, y: y - h, width: colW[ci], height: h, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.5, color: ri === 0 ? rgb(0.94, 0.95, 0.96) : undefined });
        lines.forEach((l, li) => {
          const right = ci === 3 && ri > 0;
          const tx = right ? x + colW[ci] - 4 - font.widthOfTextAtSize(l, size) : x + 4;
          page.drawText(l, { x: tx, y: y - 4 - size - li * size * 1.4, size, font });
        });
        x += colW[ci];
      }
      y -= h;
    }
    y -= 8;
  };
  text(doc.title, 18, { center: true, gap: 10 });
  text(doc.preamble, 10.5, { gap: 6 });
  for (const c of doc.clauses) {
    text(c.heading, 11.5, { gap: 1 });
    for (const l of c.lines) text(l);
    if (c.heading.startsWith('제5조')) {
      // 표 제목과 표가 쪽을 갈라 앉지 않게 — 제목 + 머리행 + 둘째 행 높이를 먼저 확보한다
      ensure(9.5 * 1.6 + (9 * 1.4 + 8) * 3);
      text(doc.wageTable.caption, 9.5);
      table();
    }
    y -= 4;
  }
  y -= 10;
  text(doc.signature.date, 11, { center: true, gap: 12 });
  text('(사업주)', 11);
  for (const l of doc.signature.employer) text(l);
  y -= 6;
  text('(근로자)', 11);
  for (const l of doc.signature.employee) text(l);
  return pdf.save();
}
