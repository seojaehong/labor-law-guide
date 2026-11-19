// 마크다운 → 한글(hwpx). 로컬 스킬 「한글변환」 generate_hwpx.py(261001 판)의 규칙을 그대로 옮겼다 — 같은 md 를 넣으면 같은 문단·표가 나와야 한다.
// 바탕(header.xml·구역 설정)은 근로계약서 작성(src/lib/contract-write)과 같은 것을 쓴다. 그 바탕의 글자 모양 7~16·문단 모양 20~29 가
// 파이썬 판이 만들어 넣는 값과 같아, 프리셋은 행간(tribunal 200%)과 여백만 바꾼다. 바탕 파일을 복사하지 않으므로 다른 문서의 미리보기가 따라오지 않는다.
// 브라우저 API 를 쓰지 않는다 — node(MCP·시험)와 브라우저가 같은 함수를 쓴다.
import { HEADER_XML } from '@/lib/contract-write/hwpx-header';
import { NS, SEC_PR, XML_HEAD } from '@/lib/contract-write/export';
import { stripControl } from '@/lib/contract-write/text';
import { packHwpx } from '@/lib/work-rules-report/render';
import { checkHeader } from './header-check';
import { addFont, cloneChar, clonePara, type CharPatch, type ParaPatch } from './header-edit';

export type MdPreset = 'internal' | 'tribunal';
export type CellAlign = 'LEFT' | 'CENTER' | 'RIGHT';

export type MdItem =
  | { kind: 'h1' | 'h2' | 'h3' | 'h4'; text: string; pageBreak: boolean }
  | { kind: 'body' | 'list' | 'sig' | 'empty'; text: string }
  | { kind: 'table'; rows: string[][]; aligns: CellAlign[] }
  | { kind: 'quote'; text: string };

/** 편집 기술 조각 — 전부 선택값. 기본(끔) 출력은 파이썬 쌍둥이(generate_hwpx.py)와 같아야 하므로 바꾸지 않는다 */
export interface MdFeatures {
  /** S2 — 기호 문단은 내어쓰기(첫 줄 기호, 둘째 줄부터 기호 뒤 글자에 맞춤), 기호 없는 문단은 intent 0, 공백 글자 들여쓰기 없음 */
  indent?: boolean;
  /** S3 — 문장 안 **강조** = 굵게+밑줄, 줄 전체 ** = 굵게만, <u>…</u> = 밑줄 */
  underline?: boolean;
  /** S4 — > 인용 블록: 휴먼고딕 11pt·줄간격 180%·모든 줄 같은 x, 「[관련 판결] …」 제목줄만 굵게 */
  quote?: boolean;
}

export interface MdHwpxOptions {
  /** internal = 내부 문서(행간 160%·여백 20mm) / tribunal = 법원·위원회 제출(행간 200%·위 45·아래 30mm). 기본 internal */
  preset?: MdPreset;
  /** 로마숫자(Ⅰ~Ⅹ)로 시작하는 ## 앞에서 쪽을 나눈다. 기본 true */
  pageBreak?: boolean;
  /** 아래 가운데 「- N -」 쪽번호. 기본 true */
  footer?: boolean;
  /** 편집 기술 조각(선택값) */
  features?: MdFeatures;
}

const PRESETS: Record<MdPreset, { lineSpacing: number; top: number; bottom: number; left: number; right: number }> = {
  internal: { lineSpacing: 160, top: 5670, bottom: 5670, left: 5670, right: 5670 },
  tribunal: { lineSpacing: 200, top: 12758, bottom: 8505, left: 5670, right: 5670 },
};
const BODY_PT = 1200;

// 글자 모양: 7 본문 · 8~11 제목 1~4단계(굵게) · 12 본문 굵게 · 13/14 표(굵게) · 15/16 7열 이상 표(굵게)
// 문단 모양: 20 본문 · 21~24 제목 1~4단계(다음 문단과 붙임) · 25 목록 · 26 서명부(오른쪽) · 27/28/29 표 칸 왼쪽/가운데/오른쪽
const HEAD: Record<'h1' | 'h2' | 'h3' | 'h4', [number, number]> = { h1: [8, 21], h2: [9, 22], h3: [10, 23], h4: [11, 24] };
const BOLD = 12;
const TABLE_PARA = [27, 28, 29] as const;

// 판례 번호 자동 굵게 — 「대법원 2017. 12. 22. 선고 2016다202947 판결」·「중앙노동위원회 2024차별34」
const CASE_CITE =
  '((?:대법원|서울고등법원|서울중앙지방법원|청주지방법원|춘천지방법원|중앙노동위원회|지방노동위원회|서울행정법원|서울고법|부산고등법원|[가-힣]+(?:법원|노동위원회))\\s*(?:\\p{Nd}{4}\\.\\s*\\p{Nd}+\\.\\s*\\p{Nd}+\\.\\s*선고\\s*)?[0-9]{4}[가-힣]+\\p{Nd}+(?:\\s*판결)?)';
// 숫자는 \p{Nd} — 파이썬 re 의 \d 는 전각 숫자(１)도 잡는다. JS \d 로 두면 같은 원고가 다른 문단이 된다(261119 루브릭)
const CASE_SPLIT = new RegExp(CASE_CITE, 'u');
const CASE_FULL = new RegExp(`^${CASE_CITE}$`, 'u');
const ROMAN = /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/;
const H2_MARKED = /^(\p{Nd}+[.)]\s|[가-힣][.)]\s|[①-⑳]|[□○■◇◆])/u;
const SIG_DATE = /^\p{Nd}{4}\.\s*(\p{Nd}+|○)\.\s*(\p{Nd}+|○)\.?\s*$/u;
const BOLD_MARK = /\*\*/g;
const LINE_LEAD = /^(\s*(?:-\s+|\p{Nd}+\.\s+)?)(.*)$/u;
const countBold = (s: string) => (s.replace(/`[^`]*`/g, '').match(BOLD_MARK) ?? []).length;
const isTextLine = (s: string) => !!s.trim() && !/^(#{1,4}\s|\||---+\s*$)/.test(s.trim());

/** 원고가 한 문장을 여러 줄로 끊어 쓰면 「**」 가 줄을 넘는다. 줄마다 닫고 다음 줄에서 다시 연다.
 * 닫는 짝이 같은 문단(빈 줄·제목·표 전까지)에 있을 때만 — 짝 없는 별표는 글자 그대로 둔다 */
function bridgeBold(lines: string[]): string[] {
  const out = [...lines];
  for (let i = 0; i < out.length; i++) {
    if (!isTextLine(out[i]) || countBold(out[i]) % 2 === 0) continue;
    let k = i + 1;
    while (k < out.length && isTextLine(out[k]) && countBold(out[k]) % 2 === 0) k++;
    if (k >= out.length || !isTextLine(out[k])) continue;
    out[i] = `${out[i].replace(/\s+$/, '')}**`;
    for (let j = i + 1; j <= k; j++) {
      const [, lead, rest] = LINE_LEAD.exec(out[j])!;
      out[j] = `${lead}**${rest}${j < k ? '**' : ''}`;
    }
    i = k;
  }
  return out;
}

const esc = (s: string) => stripControl(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1');

/** 곧은 큰따옴표를 여닫는 둥근 따옴표로 */
function fixQuotes(s: string): string {
  let open = false;
  return s.replace(/"/g, () => ((open = !open) ? '“' : '”'));
}

/** md 를 줄 단위 항목으로 나눈다. 빈 줄은 서명부 바로 앞 것만 남는다(간격은 문단 모양이 맡는다) */
export function parseMarkdown(md: string, opts: Pick<MdHwpxOptions, 'pageBreak' | 'features'> = {}): MdItem[] {
  const raw = bridgeBold(fixQuotes(md).split(/\r?\n/));
  if (raw.length && raw[raw.length - 1] === '') raw.pop();
  // 서명부 = 끝 15줄 안의 「날짜만 있는 줄」부터. 본문의 날짜 문장은 서명부가 아니다
  let sig = -1;
  for (let i = raw.length - 1; i > Math.max(-1, raw.length - 16); i--) {
    if (SIG_DATE.test(raw[i].trim())) {
      sig = i;
      break;
    }
  }
  const out: MdItem[] = [];
  let i = 0;
  while (i < raw.length) {
    const line = raw[i];
    const t = line.trim();
    if (sig >= 0 && i >= sig) {
      out.push(!t || t === '---' ? { kind: 'empty', text: '' } : { kind: 'sig', text: t });
      i++;
      continue;
    }
    if (!t || /^---+\s*$/.test(t)) {
      out.push({ kind: 'empty', text: '' });
      i++;
      continue;
    }
    if (opts.features?.quote && t.startsWith('>')) {
      out.push({ kind: 'quote', text: t.replace(/^>\s?/, '').trim() });
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = stripBold(h[2].trim());
      if (level === 2) {
        const roman = ROMAN.test(text);
        // 이미 번호·기호로 시작하는 제목(1. / 가. / ① / □ ○ ■)에는 □ 를 겹쳐 붙이지 않는다(261119 — 「□ 1.」 는 공문 관행에 없다)
        const marked = roman || H2_MARKED.test(text);
        out.push({ kind: 'h2', text: marked ? text : `□ ${text}`, pageBreak: roman && opts.pageBreak !== false });
      } else out.push({ kind: `h${level}` as 'h1' | 'h3' | 'h4', text, pageBreak: false });
      i++;
      continue;
    }
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      let aligns: CellAlign[] = [];
      while (i < raw.length && raw[i].trim().startsWith('|')) {
        const cells = raw[i].trim().replace(/^\|+|\|+$/g, '').split('|').map((c) => c.trim());
        if (cells.every((c) => /^[-: ]*$/.test(c))) aligns = cells.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'CENTER' : c.endsWith(':') ? 'RIGHT' : 'LEFT'));
        else rows.push(cells);
        i++;
      }
      if (rows.length) out.push({ kind: 'table', rows, aligns });
      continue;
    }
    const ul = /^(\s*)-\s+(.+)$/.exec(line);
    if (ul) {
      out.push({ kind: 'list', text: /^(\p{Nd}+\.|[가-힣]\.|[①-⑳])/u.test(ul[2]) ? `    ${ul[2]}` : `  - ${ul[2]}` });
      i++;
      continue;
    }
    const ol = /^(\s*)(\p{Nd}+\.)\s+(.+)$/u.exec(line);
    if (ol) {
      out.push({ kind: 'list', text: `  ${ol[2]} ${ol[3]}` });
      i++;
      continue;
    }
    out.push({ kind: 'body', text: `  ${t}` });
    i++;
  }
  return out.filter((x, k) => x.kind !== 'empty' || out[k + 1]?.kind === 'sig');
}

/** **굵게** 와 판례 번호를 굵은 런으로 나눈다 */
function runs(text: string, base: number, bold: number, cite = bold): [string, number][] {
  const r: [string, number][] = [];
  for (const part of text.split(/(\*\*.+?\*\*)/)) {
    if (!part) continue;
    if (part.length >= 4 && part.startsWith('**') && part.endsWith('**')) {
      r.push([part.slice(2, -2), bold]);
      continue;
    }
    for (const sp of part.split(CASE_SPLIT)) if (sp) r.push([sp, CASE_FULL.test(sp) ? cite : base]);
  }
  return r;
}
const run = (t: string, c: number) => `<hp:run charPrIDRef="${c}"><hp:t>${esc(t)}</hp:t></hp:run>`;
const para = (inner: string, paraPr: number, pageBreak = false) =>
  `<hp:p id="2147483648" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">${inner}</hp:p>`;

/** 표시 폭 근사 — 한글·전각 2, 그 밖 1. 칸 안 <br> 이 있으면 가장 긴 줄 */
const dispLen = (s: string) => Math.max(...s.split(/<br\s*\/?>/i).map((seg) => [...stripBold(seg)].reduce((n, ch) => n + (ch.codePointAt(0)! > 0x2e7f ? 2 : 1), 0)));

function tableXml(rows0: string[][], aligns: CellAlign[], usable: number, bodyH: number, id: number): string {
  const ncol = Math.max(...rows0.map((r) => r.length));
  const rows = rows0.map((r) => [...r, ...Array(ncol - r.length).fill('')]);
  const small = ncol >= 7;
  const [bodyC, headC] = small ? [15, 16] : [13, 14];
  const fh = BODY_PT - (small ? 400 : 200);
  const half = Math.floor(fh / 2);
  const pad = 510 * 2 + 200;
  const col = (j: number) => rows.map((r) => dispLen(r[j]));
  const lens = Array.from({ length: ncol }, (_, j) => Math.min(60, Math.max(6, ...col(j))));
  const lsum = lens.reduce((s, x) => s + x, 0);
  const widths = lens.map((L) => Math.floor((usable * L) / lsum));
  // 하한 = 머리행 글자 한 줄. 내용이 짧은 열(최장 14 이하)은 가장 긴 칸도 한 줄
  const maxl = Array.from({ length: ncol }, (_, j) => Math.max(...col(j)));
  const floors = Array.from({ length: ncol }, (_, j) =>
    Math.min(Math.max(dispLen(rows[0][j]), maxl[j] <= 14 ? maxl[j] : 0) * half + pad, Math.floor(usable / ncol) * 2),
  );
  if (floors.reduce((s, x) => s + x, 0) <= usable) {
    const short = widths.map((w, j) => (w < floors[j] ? j : -1)).filter((j) => j >= 0);
    if (short.length) {
      const need = short.reduce((s, j) => s + floors[j] - widths[j], 0);
      const rich = widths.map((_, j) => j).filter((j) => !short.includes(j));
      const spare = rich.reduce((s, j) => s + (widths[j] > floors[j] ? widths[j] - floors[j] : 0), 0);
      for (const j of short) widths[j] = floors[j];
      if (spare > 0) for (const j of rich) widths[j] -= Math.floor((need * Math.max(0, widths[j] - floors[j])) / spare);
    }
  }
  widths[ncol - 1] += usable - widths.reduce((s, x) => s + x, 0);
  const lineH = Math.floor((fh * 130) / 100);
  const rowHs = rows.map((r) => Math.max(...r.map((c, j) => Math.max(1, Math.ceil((dispLen(c) * half) / Math.max(1, widths[j] - pad))))) * lineH + 282);
  const asChar = rowHs.reduce((s, x) => s + x, 0) < Math.floor((bodyH * 55) / 100);
  const ROW_H = 1400;
  const trs = rows.map((r, ri) => {
    const head = ri === 0;
    const tcs = r.map((cell, ci) => {
      const rs = runs(cell, head ? headC : bodyC, headC);
      const runXml = (rs.map(([t, c]) => run(t, c)).join('') || `<hp:run charPrIDRef="${bodyC}"/>`).replace(/&lt;br\s*\/?&gt;/gi, '<hp:lineBreak/>');
      const al = aligns[ci] ?? 'LEFT';
      const pp = head || al === 'CENTER' ? TABLE_PARA[1] : al === 'RIGHT' ? TABLE_PARA[2] : TABLE_PARA[0];
      return (
        `<hp:tc name="" header="${head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="${head ? 4 : 3}">` +
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
        `${para(runXml, pp)}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
        `<hp:cellSz width="${widths[ci]}" height="${Math.max(ROW_H, rowHs[ri])}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`
      );
    });
    return `<hp:tr>${tcs.join('')}</hp:tr>`;
  });
  const totalH = rowHs.reduce((s, h) => s + Math.max(ROW_H, h), 0);
  const tbl =
    `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${ncol}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${usable}" widthRelTo="ABSOLUTE" height="${totalH}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="${asChar ? 1 : 0}" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' +
    `${trs.join('')}</hp:tbl>`;
  return para(`<hp:run charPrIDRef="${bodyC}">${tbl}<hp:t/></hp:run>`, TABLE_PARA[0]);
}

const FOOTER =
  '<hp:subList id="0" subListType="FOOTER" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BASELINE" linkListIDRef="0" linkListCount="0">' +
  '<hp:p id="2147483648" paraPrIDRef="21" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
  '<hp:run charPrIDRef="7"><hp:t>- </hp:t></hp:run><hp:run charPrIDRef="7"><hp:ctrl><hp:autoNum numType="PAGE" suffixChar="NONE"/></hp:ctrl></hp:run><hp:run charPrIDRef="7"><hp:t> -</hp:t></hp:run>' +
  '</hp:p></hp:subList>';

/** header 를 들고 다니며 필요한 모양을 끝에 붙인다(U3·U4). 같은 모양은 한 번만 붙는다 */
class Styles {
  constructor(public header: string) {}
  char(src: number, patch: CharPatch): number {
    const r = cloneChar(this.header, src, patch);
    this.header = r.header;
    return r.id;
  }
  para(src: number, patch: ParaPatch): number {
    const r = clonePara(this.header, src, patch);
    this.header = r.header;
    return r.id;
  }
  font(face: string): number {
    const r = addFont(this.header, face);
    this.header = r.header;
    return r.id;
  }
}

// S2 머리 기호 — 내어쓰기 대상(A1~A3). 기호 뒤 공백까지가 기호 폭이다
const MARKER = /^(?:[○●◦▲△▶▷※·□■◇◆√]|[①-⑳]|[㉠-㉭]|-|\p{Nd}+[.)]|[가-힣][.)]|\(\p{Nd}+\)|\([가-힣]\))\s+/u;
/** 기호 폭(pt) — 전각(한글·기호)은 1em, 반각은 0.5em, 공백은 0.5em 으로 근사. 미실측: 한글 렌더로 확정할 값(U2) */
function markerPt(marker: string, fontPt: number): number {
  const m = `${marker.trim()} `;
  return [...m].reduce((s, ch) => s + (ch.codePointAt(0)! >= 0x2000 ? 1 : 0.5), 0) * fontPt;
}
const BODY_FONT_PT = BODY_PT / 100;
const QUOTE_LEFT_PT = 16.5; // A9 인용 = 본문 + 16.5pt (260824 실측 x 좌표)
const QUOTE_TITLE = /^\[관련 [^\]]+\]/;

/** 구역 본문(section0.xml) */
export function mdSectionXml(items: MdItem[], opts: MdHwpxOptions = {}): string {
  return mdDocXml(items, opts).section;
}

/** header 와 section 을 함께 만든다 — 선택값이 모양을 더하면 header 가 바뀐다. 기본(끔)이면 header = presetHeader */
export function mdDocXml(items: MdItem[], opts: MdHwpxOptions = {}): { header: string; section: string } {
  const f = opts.features ?? {};
  const st = new Styles(presetHeader(opts.preset));
  const p = PRESETS[opts.preset ?? 'internal'];
  let secPr = SEC_PR.replace(
    /(<hp:margin\s+header="[^"]*"\s+footer="[^"]*"\s+gutter="[^"]*"\s+)left="[^"]*"\s+right="[^"]*"\s+top="[^"]*"\s+bottom="[^"]*"/,
    `$1left="${p.left}" right="${p.right}" top="${p.top}" bottom="${p.bottom}"`,
  );
  if (opts.footer !== false) secPr = secPr.replace('</hp:secPr>', `${FOOTER}</hp:secPr>`);
  const pageW = Number(/<hp:pagePr[^>]*\bwidth="(\d+)"/.exec(secPr)?.[1] ?? 59528);
  const pageH = Number(/<hp:pagePr[^>]*\bheight="(\d+)"/.exec(secPr)?.[1] ?? 84186);
  const usable = pageW - p.left - p.right;
  const bodyH = pageH - p.top - p.bottom;
  let tableId = 1000;
  const body = [para(`<hp:run charPrIDRef="7">${secPr}</hp:run>`, 20)];
  for (const x of items) {
    if (x.kind === 'table') body.push(tableXml(x.rows, x.aligns, usable, bodyH, ++tableId));
    else if (x.kind === 'empty' || (!x.text && x.kind !== 'quote')) body.push(para('<hp:run charPrIDRef="7"/>', 20));
    else if (x.kind === 'h1' || x.kind === 'h2' || x.kind === 'h3' || x.kind === 'h4') {
      const [c, pp] = HEAD[x.kind];
      body.push(para(run(x.text, c), pp, x.pageBreak));
    } else if (x.kind === 'sig') body.push(para(run(x.text, 7), 26));
    else if (x.kind === 'quote') {
      // S4 인용 — 휴먼고딕 11pt, 줄간격 180%, left = 본문 + 16.5pt, intent 0. 인용 안 빈 줄도 인용 서식
      const font = st.font('휴먼고딕');
      const qc = st.char(7, { height: 1100, font });
      const qb = st.char(7, { height: 1100, font, bold: true });
      const qp = st.para(20, { pt: true, left: QUOTE_LEFT_PT, intent: 0, lineSpacing: 180 });
      if (!x.text) body.push(para(`<hp:run charPrIDRef="${qc}"/>`, qp));
      else if (QUOTE_TITLE.test(x.text)) body.push(para(run(stripBold(x.text), qb), qp));
      else body.push(para(runs(x.text, qc, qb).map(([t, c]) => run(t, c)).join(''), qp));
    } else {
      const list = x.kind === 'list';
      let text = x.text;
      let pp = list ? 25 : 20;
      if (f.indent) {
        // S2 — 공백 글자 들여쓰기를 없애고 기호 폭만큼 내어쓴다. 목록은 left 4pt(바탕 25 의 default 800 = 4pt)
        text = text.replace(/^\s+/, '');
        const m = MARKER.exec(text);
        pp = st.para(list ? 25 : 20, { pt: true, left: list ? 4 : 0, intent: m ? -markerPt(m[0], BODY_FONT_PT) : 0 });
      }
      body.push(para(emphasis(text, st, f).map(([t, c]) => run(t, c)).join(''), pp));
    }
  }
  return { header: st.header, section: `${XML_HEAD}<hs:sec ${NS}>${body.join('')}</hs:sec>` };
}

/** 본문 강조 런. 기본 = **굵게**·판례 번호 굵게. S3 이면 문장 안 ** 는 굵게+밑줄, 줄 전체 ** 는 굵게, <u> 는 밑줄 */
function emphasis(text: string, st: Styles, f: MdFeatures): [string, number][] {
  if (!f.underline) return runs(text, 7, BOLD);
  const lead = MARKER.exec(text)?.[0] ?? '';
  const rest = text.slice(lead.length).trim();
  if (/^\*\*[^*]+\*\*$/.test(rest)) return runs(text, 7, BOLD);
  const bu = st.char(BOLD, { underline: true });
  const out: [string, number][] = [];
  for (const part of text.split(/(<u>.*?<\/u>)/)) {
    if (!part) continue;
    const u = /^<u>(.*)<\/u>$/.exec(part);
    if (u) out.push([stripBold(u[1]), st.char(7, { underline: true })]);
    else out.push(...runs(part, 7, bu, BOLD));
  }
  return out;
}

/** 프리셋 header.xml — 바탕의 행간을 프리셋 값으로(표 칸 27~29 는 130%) */
export function presetHeader(preset: MdPreset = 'internal'): string {
  const ls = PRESETS[preset].lineSpacing;
  return HEADER_XML.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+(" unit="HWPUNIT"\/>)/g, `$1${ls}$2`).replace(
    /<hh:paraPr id="(27|28|29)"[\s\S]*?<\/hh:paraPr>/g,
    (m) => m.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, '$1130'),
  );
}

/** 변환 결과 요약 — 확인용 수와 옮기지 못한 마크다운 기호(남으면 렌더러가 다루지 못한 문법이다) */
export function mdHwpxSummary(items: MdItem[], features: MdFeatures = {}) {
  const count = (k: MdItem['kind']) => items.filter((x) => x.kind === k).length;
  const texts = items.flatMap((x) => (x.kind === 'table' ? x.rows.flat() : [x.text]));
  const bold = texts.reduce((n, t) => n + runs(t, 7, BOLD).filter(([, c]) => c === BOLD).length, 0);
  // 본문의 <u> 는 S3 가 켜져 있으면 밑줄로 옮겨진다(표 칸 안 <u> 는 아직 못 옮긴다)
  const uTexts = features.underline ? items.flatMap((x) => (x.kind === 'body' || x.kind === 'list' ? [] : x.kind === 'table' ? x.rows.flat() : [x.text])) : texts;
  const leftovers = ['](', '<u>', '~~', '```', '> '].filter((k) => (k === '<u>' ? uTexts : texts).some((t) => stripBold(t).includes(k)));
  return {
    headings: count('h1') + count('h2') + count('h3') + count('h4'),
    paragraphs: count('body') + count('list'),
    tables: count('table'),
    tableCells: items.reduce((n, x) => n + (x.kind === 'table' ? x.rows.flat().length : 0), 0),
    boldRuns: bold,
    signatureLines: count('sig'),
    pageBreaks: items.filter((x) => 'pageBreak' in x && x.pageBreak).length,
    leftovers,
  };
}

/** md 한 편 → hwpx 바이트. 제목 메타 = 첫 # 제목 */
export async function mdToHwpx(md: string, opts: MdHwpxOptions = {}): Promise<Uint8Array> {
  const items = parseMarkdown(md, opts);
  const title = items.find((x) => x.kind === 'h1');
  const { header, section } = mdDocXml(items, opts);
  // S0 — 순서·개수·참조 범위가 어긋난 파일은 한글이 오류 없이 다른 모양으로 그린다. 내보내기 전에 막는다
  const issues = checkHeader(header, section);
  if (issues.length) throw new Error(`hwpx header 불변식 위반: ${issues.map((x) => x.message).join(' / ')}`);
  return packHwpx(header, section, title && 'text' in title ? title.text : '');
}
