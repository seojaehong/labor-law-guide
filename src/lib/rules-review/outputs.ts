// 결재 묶음 — 신·구조문대비표(docx)·정비 검토표(xlsx)·부서 의견 요청(xlsx)·개정안 반영본(hwpx).
// 모두 브라우저 안에서 만든다. 신·구조문대비표는 대학·공공기관 정비 용역 납품물 형식(현 행 | 개정안 | 사유,
// 안 바뀐 항은 「(생략)」·「(현행과 같음)」, 고친 항 끝에 <개정 YYYY. M. D.>, 끝에 부칙 시행일)을 따른다.
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import type { InitInput } from '@rhwp/core';
import { applyChanges, type Change } from '@/lib/hwp/apply';
import { articleAt, articleLabel, articleText, HEAD, type Article, type Regulation } from './model';
import { KIND_GROUP, KIND_LABEL, type Finding } from './checks';
import { deptOf, disputed, dotDate, kstToday, replacement, stateOf, stats, type Opinion, type Verdict, type Workspace } from './workspace';
import type { Source } from './ingest';

// ── 신·구조문 ──
export interface CompareRow { old: string; neu: string; why: string }

interface Edit { at: number; length: number; to: string; f: Finding }

/** 한 줄에 반영 글자 고침을 넣는다. 겹치는 고침은 앞 것만 */
export function applyLine(text: string, edits: Edit[]): { text: string; skipped: Edit[] } {
  const sorted = [...edits].sort((a, b) => a.at - b.at);
  const ok: Edit[] = [], skipped: Edit[] = [];
  let end = -1;
  for (const e of sorted) { if (e.at < end) skipped.push(e); else { ok.push(e); end = e.at + e.length; } }
  let out = text;
  for (const e of [...ok].reverse()) out = out.slice(0, e.at) + e.to + out.slice(e.at + e.length);
  return { text: out, skipped };
}

/** 신·구조문대비표에서 밑줄 그을 글자를 감싸는 표시(문서에 쓸 때 밑줄로 바꾸고 표시는 지운다) */
export const U0 = '', U1 = '';
export const unmark = (s: string) => s.replace(/[]/g, '');

/** 고친 줄의 현행·개정안 — 바뀐 글자를 양쪽 모두 밑줄 표시로 감싼다 */
export function markedLine(text: string, edits: Edit[]): { old: string; neu: string } {
  const { skipped } = applyLine(text, edits);
  const ok = edits.filter((e) => !skipped.includes(e)).sort((a, b) => b.at - a.at);
  let old = text, neu = text;
  for (const e of ok) {
    old = old.slice(0, e.at) + U0 + old.slice(e.at, e.at + e.length) + U1 + old.slice(e.at + e.length);
    neu = neu.slice(0, e.at) + U0 + e.to + U1 + neu.slice(e.at + e.length);
  }
  return { old: old.trim(), neu: neu.trim() };
}

const MARKER = /^\s*([①-⑳]|\d+\.|[가-하]\.|\(\d+\)|\d+\))/;
const reasonOf = (ws: Workspace, f: Finding) => {
  const s = stateOf(ws, f.id);
  const rep = replacement(ws, f);
  const base = rep !== null ? `${KIND_LABEL[f.kind]}: 「${f.before}」→「${rep}」` : `${KIND_LABEL[f.kind]}`;
  return s.note.trim() ? `${base} — ${s.note.trim()}` : base;
};

/** 반영한 항목 → 한 규정의 신·구조문 행 */
export function compareRows(ws: Workspace, reg: Regulation): CompareRow[] {
  const mark = `<개정 ${dotDate(ws.effective)}>`;
  const taken = ws.findings.filter((f) => f.reg === reg.name && stateOf(ws, f.id).decision === '반영');
  const lineEdits = new Map<number, Edit[]>();
  const overrides = new Map<Article, Finding[]>();
  const reasons = new Map<string, Set<string>>(); // 조문(또는 줄) 열쇠 → 사유
  const keyOf = (line: number) => { const a = articleAt(reg, line); return a ? `a${a.start}` : `l${line}`; };
  const addReason = (k: string, r: string) => reasons.set(k, (reasons.get(k) ?? new Set()).add(r));
  for (const f of taken) {
    const rep = replacement(ws, f);
    const s = stateOf(ws, f.id);
    if (rep !== null) {
      for (const sp of f.spans) {
        if (sp.line < 0 || !sp.length) continue;
        const to = f.after !== null && rep === f.after ? (sp.to ?? rep) : rep;
        lineEdits.set(sp.line, [...(lineEdits.get(sp.line) ?? []), { at: sp.at, length: sp.length, to, f }]);
        addReason(keyOf(sp.line), reasonOf(ws, f));
      }
    } else if (s.text?.trim()) {
      const a = f.spans.map((sp) => articleAt(reg, sp.line)).find(Boolean);
      if (a) { overrides.set(a, [...(overrides.get(a) ?? []), f]); addReason(`a${a.start}`, reasonOf(ws, f)); }
    }
  }
  const rows: { start: number; row: CompareRow }[] = [];
  const done = new Set<number>();
  for (const [a, fs] of overrides) {
    rows.push({ start: a.start, row: { old: articleText(reg, a), neu: `${fs.map((f) => stateOf(ws, f.id).text!.trim()).join('\n')} ${mark}`, why: [...reasons.get(`a${a.start}`)!].join('\n') } });
    for (let i = a.start; i <= a.end; i++) done.add(i);
  }
  const arts = new Set<Article>();
  const loose: number[] = [];
  for (const line of lineEdits.keys()) {
    if (done.has(line)) continue;
    const a = articleAt(reg, line);
    if (a) arts.add(a); else loose.push(line);
  }
  for (const a of arts) {
    const olds: string[] = [], news: string[] = [];
    let gap = false;
    for (let i = a.start; i <= a.end; i++) {
      const t = reg.lines[i].text.trim();
      if (!t) continue;
      const edits = lineEdits.get(i);
      if (edits) {
        gap = false;
        const m = markedLine(reg.lines[i].text, edits);
        olds.push(m.old);
        news.push(`${m.neu} ${mark}`);
        continue;
      }
      if (i === a.start) {
        const head = HEAD.exec(t)?.[0].trim() ?? '';
        const m = t.slice(head.length).match(MARKER);
        olds.push(`${head}${m ? ` ${m[1]}` : ''} (생략)`);
        news.push(`${head}${m ? ` ${m[1]}` : ''} (현행과 같음)`);
        continue;
      }
      const m = t.match(MARKER);
      if (m) { gap = false; olds.push(`${m[1]} (생략)`); news.push(`${m[1]} (현행과 같음)`); continue; }
      if (!gap) { olds.push('(생략)'); news.push('(현행과 같음)'); gap = true; }
    }
    rows.push({ start: a.start, row: { old: olds.join('\n'), neu: news.join('\n'), why: [...reasons.get(`a${a.start}`)!].join('\n') } });
  }
  for (const line of loose) {
    const m = markedLine(reg.lines[line].text, lineEdits.get(line)!);
    rows.push({ start: line, row: { old: m.old, neu: `${m.neu} ${mark}`, why: [...reasons.get(`l${line}`)!].join('\n') } });
  }
  const out = rows.sort((a, b) => a.start - b.start).map((r) => r.row);
  if (out.length) out.push({ old: '<신 설>', neu: `부 칙\n이 규정은 ${korDate(ws.effective)}부터 시행한다.`, why: '시행일' });
  return out;
}

/** 「2026년 3월 1일」 — 비면 「○○○○년 ○월 ○일」 */
export function korDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : '○○○○년 ○월 ○일';
}

/** 반영했지만 바꿀 글자도 담당자 문안도 없는 항목 — 직접 고칠 곳 */
export function manualItems(ws: Workspace): Finding[] {
  return ws.findings.filter((f) => { const s = stateOf(ws, f.id); return s.decision === '반영' && replacement(ws, f) === null && !s.text?.trim(); });
}

// ── docx ──
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function runs(text: string, bold = false, size = 20, color = '202B33'): string {
  const rpr = (u: boolean) => `<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="맑은 고딕" w:hAnsi="Arial"/>${bold || u ? '<w:b/>' : ''}${u ? '<w:u w:val="single"/>' : ''}<w:color w:val="${u ? '1F4E79' : color}"/><w:sz w:val="${size}"/></w:rPr>`;
  // 밑줄 표시(U0…U1)는 줄을 넘지 않는다 — 한 줄 안에서 조각으로 나눠 밑줄 런을 만든다
  return text.split('\n').map((line, i) => {
    const parts = line.split(/([^]*)/).filter(Boolean);
    return `${i ? '<w:r><w:br/></w:r>' : ''}${parts.map((p) => {
      const u = p.startsWith(U0);
      return `<w:r>${rpr(u)}<w:t xml:space="preserve">${esc(unmark(p))}</w:t></w:r>`;
    }).join('')}`;
  }).join('');
}
const para = (text: string, bold = false, size = 20, after = 80, color = '202B33') =>
  `<w:p><w:pPr><w:spacing w:after="${after}" w:line="276" w:lineRule="auto"/></w:pPr>${runs(text, bold, size, color)}</w:p>`;
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
function table(head: string[], widths: number[], rows: string[][]): string {
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="B8C3CE"/>`).join('');
  const cell = (t: string, w: number, h: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="${h ? 'center' : 'top'}"/><w:shd w:val="clear" w:fill="${h ? '285E77' : 'FFFFFF'}"/></w:tcPr><w:p><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/>${h ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runs(t, h, 19, h ? 'FFFFFF' : '202B33')}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(h, widths[i], true)).join('')}</w:tr>`
    + rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, widths[i], false)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('', false, 10, 120);
}

async function docx(body: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const sect = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>';
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${sect}</w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

const W = 15038; // 가로 A4 본문 폭(dxa)
const split = (parts: number[]) => { const t = parts.reduce((a, b) => a + b, 0); return parts.map((p) => Math.floor((p / t) * W)); };

/** 결재 묶음 본문(docx) */
export function bundleBody(ws: Workspace): string {
  const inst = ws.institution.trim() || '기관';
  const st = stats(ws);
  const touched = ws.regs.filter((r) => compareRows(ws, r).length);
  let b = para(`${inst} 제규정 정비 개정안`, true, 34, 120)
    + para(`시행일 ${dotDate(ws.effective)} · 작성 ${dotDate(kstToday())} · 규정 ${ws.regs.length}개 · 확인 항목 ${st.total}건(반영 ${st.by.반영} · 보류 ${st.by.보류} · 해당 없음 ${st.by['해당 없음']} · 미확인 ${st.by.미확인})`, false, 18, 200, '485149');
  // 1. 요약
  b += para('1. 정비 요약', true, 24, 100);
  b += table(['규정', '반영', '보류', '해당 없음', '미확인', '부서 이견(조율 전)'], split([5, 1, 1, 1, 1, 2]),
    ws.regs.map((r) => { const s = stats(ws, ws.findings.filter((f) => f.reg === r.name)); return [r.name, `${s.by.반영}`, `${s.by.보류}`, `${s.by['해당 없음']}`, `${s.by.미확인}`, s.disputed ? `${s.disputed}(${s.unsettled})` : '-']; }));
  // 2. 신·구조문
  b += pageBreak + para('2. 신·구조문대비표', true, 24, 100);
  if (!touched.length) b += para('반영한 항목이 없습니다.', false, 19);
  touched.forEach((r, i) => {
    if (i) b += pageBreak;
    b += para(`${r.name} 신·구조문대비표`, true, 22, 80);
    b += table(['현 행', '개 정 안', '사 유'], split([5, 5, 3]), compareRows(ws, r).map((x) => [x.old, x.neu, x.why]));
  });
  const row = (f: Finding, extra: string[]) => [f.reg, f.article || '-', ...extra];
  // 3. 직접 고칠 곳
  const manual = manualItems(ws);
  b += pageBreak + para('3. 직접 고칠 곳', true, 24, 60) + para('반영하기로 했지만 자동으로 고칠 문안이 없는 항목입니다. 개정 문안을 작성해 신·구조문대비표에 더하세요.', false, 18, 100, '485149');
  b += manual.length ? table(['규정', '조문', '종류', '내용', '사유'], split([3, 2, 2, 6, 3]), manual.map((f) => row(f, [KIND_LABEL[f.kind], f.message, stateOf(ws, f.id).note]))) : para('없습니다.', false, 19);
  // 4. 보류
  const held = ws.findings.filter((f) => stateOf(ws, f.id).decision === '보류');
  b += para('4. 보류 목록', true, 24, 100);
  b += held.length ? table(['규정', '조문', '종류', '내용', '보류 사유'], split([3, 2, 2, 6, 3]), held.map((f) => row(f, [KIND_LABEL[f.kind], f.message, stateOf(ws, f.id).note || '(사유 미기재)']))) : para('없습니다.', false, 19);
  // 5. 부서 협의
  const asked = ws.findings.filter((f) => stateOf(ws, f.id).opinion);
  b += para('5. 소관 부서 협의 내역', true, 24, 100);
  b += asked.length ? table(['규정', '조문', '부서', '의견', '의견 내용', '조율 결과'], split([3, 2, 2, 1, 5, 4]), asked.map((f) => {
    const s = stateOf(ws, f.id), o = s.opinion!;
    return row(f, [`${o.dept}${o.by ? `(${o.by})` : ''}`, o.verdict, o.text, disputed(s) ? (s.settle?.trim() || '조율 전') : '-']);
  })) : para('부서 의견을 받은 항목이 없습니다.', false, 19);
  b += para('이 문서는 규정끼리 맞춰 본 결과를 규정 담당자가 확인해 정리한 것입니다. 상위법령과의 대조는 포함하지 않았습니다.', false, 16, 0, '626760');
  return b;
}

export const bundleDocx = (ws: Workspace) => docx(bundleBody(ws));

// ── 정비 검토표 ──
const HEAD_ROW = ['항목 번호', '규정', '조문', '묶음', '종류', '걸린 글자', '고친 문안', '내용', '맞대 본 규정·조문', '결정', '사유', '소관 부서', '부서 의견', '의견 내용', '조율 결과'];

function styleHead(ws: ExcelJS.Worksheet) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF285E77' } };
  h.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function blobOf(book: ExcelJS.Workbook): Promise<Blob> {
  const bytes = await book.xlsx.writeBuffer();
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function reviewXlsx(ws: Workspace): Promise<Blob> {
  const book = new ExcelJS.Workbook();
  const sh = book.addWorksheet('정비 검토표');
  sh.addRow(HEAD_ROW);
  for (const f of ws.findings) {
    const s = stateOf(ws, f.id);
    sh.addRow([f.id, f.reg, f.article, KIND_GROUP[f.kind], KIND_LABEL[f.kind], f.before, replacement(ws, f) ?? s.text ?? '', f.message,
      f.other ? `${f.other.reg} ${f.other.article}`.trim() : '', s.decision, s.note, deptOf(ws, f), s.opinion?.verdict ?? '', s.opinion?.text ?? '', s.settle ?? '']);
  }
  sh.columns.forEach((c, i) => { c.width = [12, 22, 18, 10, 18, 22, 22, 60, 26, 9, 30, 12, 9, 30, 30][i]; c.alignment = { vertical: 'top', wrapText: true }; });
  styleHead(sh);
  sh.autoFilter = { from: 'A1', to: `O${ws.findings.length + 1}` };
  return blobOf(book);
}

// ── 부서 의견 요청·회신 ──
const ASK = ['항목 번호', '규정', '조문', '확인할 내용', '현행(걸린 글자)', '고친 문안', '의견(동의·수정·반대)', '의견 내용', '작성자'];

/** 그 부서에 보낼 항목 — 기본은 반영으로 고른 것, includeOpen 이면 미확인도 */
export function itemsFor(ws: Workspace, dept: string, includeOpen: boolean): Finding[] {
  return ws.findings.filter((f) => {
    const d = stateOf(ws, f.id).decision;
    return deptOf(ws, f) === dept && (d === '반영' || (includeOpen && d === '미확인'));
  });
}

export async function requestXlsx(ws: Workspace, dept: string, items: Finding[]): Promise<Blob> {
  const book = new ExcelJS.Workbook();
  const sh = book.addWorksheet('의견 요청');
  sh.addRow(ASK);
  for (const f of items) {
    const s = stateOf(ws, f.id);
    sh.addRow([f.id, f.reg, f.article, f.message, f.before, replacement(ws, f) ?? s.text ?? '(문안 없음 — 의견으로 적어 주세요)', '', '', '']);
  }
  sh.columns.forEach((c, i) => { c.width = [12, 22, 18, 60, 24, 24, 14, 40, 10][i]; c.alignment = { vertical: 'top', wrapText: true }; });
  for (let r = 2; r <= items.length + 1; r++) {
    sh.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"동의,수정,반대"'] };
    for (const col of ['G', 'H', 'I']) sh.getCell(`${col}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  }
  styleHead(sh);
  const info = book.addWorksheet('안내');
  info.addRow([`${ws.institution || '기관'} 제규정 정비 — ${dept} 의견 요청`]);
  info.addRow(['노란 칸(의견·의견 내용·작성자)만 적어 회신해 주세요. 「항목 번호」 열은 고치지 마세요(회신을 다시 붙이는 데 씁니다).']);
  info.addRow(['동의 = 고친 문안대로 / 수정 = 문안을 바꿔야 함(의견 내용에 문안) / 반대 = 지금대로 두어야 함(의견 내용에 이유)']);
  info.getColumn(1).width = 110;
  return blobOf(book);
}

export interface ParsedOpinion { id: string; verdict: Verdict; text: string; by: string }

/** 엑셀 칸 값 → 글자. 부서가 한글·엑셀에서 고쳐 저장하면 글자가 서식 있는 글(richText)·수식 결과로 바뀌어 온다 */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown };
  if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim();
  if (o.text !== undefined) return cellText(o.text);
  if (o.result !== undefined) return cellText(o.result);
  return '';
}

/** 회신 엑셀 → 의견 목록. 의견 칸이 빈 행은 건너뛴다 */
export async function parseOpinions(bytes: ArrayBuffer): Promise<ParsedOpinion[]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const out: ParsedOpinion[] = [];
  for (const sh of book.worksheets) {
    // exceljs 의 row.values 는 1부터 차는 빈칸 있는 배열이다 — 빈칸을 채워 열 번호를 그대로 쓴다
    const head = Array.from(sh.getRow(1).values as unknown[], cellText);
    const col = (name: string) => head.findIndex((h) => h.startsWith(name));
    const [ci, cv, ct, cb] = [col('항목 번호'), col('의견('), col('의견 내용'), col('작성자')];
    if (ci < 0 || cv < 0) continue;
    sh.eachRow((row, n) => {
      if (n === 1) return;
      const text = (k: number) => (k < 0 ? '' : cellText(row.getCell(k).value));
      const id = text(ci);
      const v = text(cv).replace(/\s/g, '');
      if (!id || !v) return;
      const verdict: Verdict | null = v.startsWith('동의') ? '동의' : v.startsWith('수정') ? '수정' : v.startsWith('반대') ? '반대' : null;
      if (verdict) out.push({ id, verdict, text: text(ct), by: text(cb) });
    });
  }
  return out;
}

/** 의견을 항목에 붙인다. 부서를 주지 않으면 항목의 소관 부서로 적는다. 붙지 못한 번호를 돌려준다 */
export function attachOpinions(ws: Workspace, dept: string | null, list: ParsedOpinion[]): { ws: Workspace; attached: number; missing: string[] } {
  const byId = new Map(ws.findings.map((f) => [f.id, f]));
  const ids = new Set(ws.findings.map((f) => f.id));
  const states = { ...ws.states };
  const missing: string[] = [];
  let attached = 0;
  for (const o of list) {
    if (!ids.has(o.id)) { missing.push(o.id); continue; }
    const opinion: Opinion = { dept: dept ?? (deptOf(ws, byId.get(o.id)!) || '부서'), verdict: o.verdict, text: o.text, by: o.by };
    states[o.id] = { ...stateOf(ws, o.id), opinion };
    attached++;
  }
  return { ws: { ...ws, states }, attached, missing };
}

// ── 개정안 반영본(hwpx) ──
export interface Applied {
  reg: string;
  fileName: string;
  bytes: Uint8Array | null;
  applied: number;
  /** 표·그림 문단이라 자동으로 고치지 않은 자리, 겹쳐서 뺀 자리 */
  manual: { f: Finding; why: string }[];
  error?: string;
}

export async function applyToSources(ws: Workspace, sources: Record<string, Source>, wasm?: InitInput): Promise<Applied[]> {
  const out: Applied[] = [];
  for (const r of ws.regs) {
    const src = sources[r.key];
    const taken = ws.findings.filter((f) => f.reg === r.name && stateOf(ws, f.id).decision === '반영' && replacement(ws, f) !== null);
    if (!taken.length) continue;
    const res: Applied = { reg: r.name, fileName: r.fileName.replace(/\.(hwpx?|docx|txt)$/i, '') + '_개정안.hwpx', bytes: null, applied: 0, manual: [] };
    if (!src || (src.kind !== 'hwp' && src.kind !== 'hwpx')) {
      res.error = '원본이 한글 파일이 아니라 반영본을 만들지 않았습니다. 신·구조문대비표를 쓰세요';
      out.push(res);
      continue;
    }
    const changes: Change[] = [];
    const used = new Map<number, [number, number][]>();
    for (const f of taken) {
      const rep = replacement(ws, f)!;
      for (const sp of f.spans) {
        if (sp.line < 0 || !sp.length) continue;
        const line = r.lines[sp.line];
        if (line.controls) { res.manual.push({ f, why: '표·그림이 든 문단' }); continue; }
        const span: [number, number] = [sp.at, sp.at + sp.length];
        if ((used.get(sp.line) ?? []).some(([a, b]) => span[0] < b && a < span[1])) { res.manual.push({ f, why: '다른 고침과 같은 글자' }); continue; }
        used.set(sp.line, [...(used.get(sp.line) ?? []), span]);
        const to = f.after !== null && rep === f.after ? (sp.to ?? rep) : rep;
        changes.push({ id: `${f.id}:${sp.line}:${sp.at}`, kind: 'word', topic: KIND_LABEL[f.kind], std: '', where: articleLabel(articleAt(r, sp.line)),
          before: line.text.slice(sp.at, sp.at + sp.length), after: to, word: { line: sp.line, at: sp.at, length: sp.length }, overlaps: [] } as Change);
      }
    }
    try {
      const a = await applyChanges(src.bytes, changes, 'hwpx', wasm);
      res.bytes = a.bytes;
      res.applied = changes.length;
      if (a.loss) res.error = `저장 중 빠진 내용 ${a.loss}건이 보고됐습니다. 한글에서 열어 확인하세요`;
    } catch (e) {
      res.error = (e as Error).message;
    }
    out.push(res);
  }
  return out;
}

export async function zipOf(files: { name: string; data: Blob | Uint8Array }[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data);
  return zip.generateAsync({ type: 'blob' });
}
