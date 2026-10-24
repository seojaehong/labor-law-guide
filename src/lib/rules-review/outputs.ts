// 결재 묶음 — 신·구조문대비표(docx)·정비 검토표(xlsx)·부서 의견 요청(xlsx)·개정안 반영본(hwpx).
// 모두 브라우저 안에서 만든다. 신·구조문대비표는 대학·공공기관 정비 용역 납품물 형식(현 행 | 개정안 | 사유,
// 안 바뀐 항은 「(생략)」·「(현행과 같음)」, 고친 항 끝에 <개정 YYYY. M. D.>, 끝에 부칙 시행일)을 따른다.
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import type { InitInput } from '@rhwp/core';
import { applyChanges, type Change } from '@/lib/hwp/apply';
import { articleAt, articleLabel, HEAD, type Article, type Regulation } from './model';
import { KIND_GROUP, KIND_LABEL, type Finding } from './checks';
import { deptOf, disputed, dotDate, kstToday, ownText, replacement, stateOf, stats, type Opinion, type Verdict, type Workspace } from './workspace';
import type { Source } from './ingest';

// ── 신·구조문 ──
export interface CompareRow { old: string; neu: string; why: string }

interface Edit { at: number; length: number; to: string; f: Finding }

/** 반영했지만 반영본에 자동으로 넣지 않는 항목 — 대비표·반영본 양쪽 「직접 고칠 곳」 */
export interface Hand { f: Finding; why: string }

/** 조문 하나의 담당자 개정 문안 — 문안 줄과, 원래 줄 → 문안에 그대로 남은 줄 번호 */
interface Own { fs: Finding[]; lines: string[]; at: Map<number, number> }

export interface Resolved {
  /** 줄 → 넣을 글자 고침(서로 겹치지 않는다) */
  lines: Map<number, Edit[]>;
  written: Map<Article, Own>;
  hand: Hand[];
}

/** 한 규정의 반영 고침을 정한다 — 신·구조문대비표와 반영본이 이것 하나를 쓴다.
 *  겹침: 직접 고친 줄(amend) 먼저, 그다음 앞 글자부터(같은 자리면 긴 것). 항목 목록 순서와 상관없다. 뒤에 온 겹친 고침은 뺀다.
 *  담당자 개정 문안(바꿀 글자 없는 항목에 쓴 조문 전체): 그 조문은 문안이 이긴다. 같은 조문의 글자 고침은
 *  원래 줄이 문안에 그대로 남아 있을 때만 그 줄에 얹고, 담당자가 고쳐 쓴 줄의 글자 고침은 뺀다.
 *  문안 자체는 반영본에 자동으로 넣지 못하므로 직접 고칠 곳이다. */
export function resolveEdits(ws: Workspace, reg: Regulation): Resolved {
  const taken = ws.findings.filter((f) => f.reg === reg.name && stateOf(ws, f.id).decision === '반영');
  const hand: Hand[] = [];
  const drop = (f: Finding, why: string) => { if (!hand.some((h) => h.f === f && h.why === why)) hand.push({ f, why }); };
  const all: (Edit & { line: number })[] = [];
  const byArt = new Map<Article, Finding[]>();
  for (const f of taken) {
    const rep = replacement(ws, f);
    if (rep !== null) {
      for (const sp of f.spans) {
        if (sp.line < 0 || !sp.length) continue;
        all.push({ line: sp.line, at: sp.at, length: sp.length, to: f.after !== null && rep === f.after ? (sp.to ?? rep) : rep, f });
      }
      continue;
    }
    if (ownText(ws, f) === null) { drop(f, '고칠 문안 없음'); continue; }
    const a = f.spans.map((sp) => articleAt(reg, sp.line)).find(Boolean);
    if (!a) { drop(f, '조문을 찾지 못한 담당자 개정 문안'); continue; }
    byArt.set(a, [...(byArt.get(a) ?? []), f]);
    drop(f, '담당자 개정 문안 — 반영본에는 한글에서 직접 옮기세요');
  }
  const written = new Map<Article, Own>();
  for (const [a, fs] of byArt) {
    const lines = fs.map((f) => ownText(ws, f)!).join('\n').split('\n');
    const at = new Map<number, number>(), used = new Set<number>();
    for (let i = a.start; i <= a.end; i++) {
      const t = reg.lines[i].text.trim();
      if (!t) continue;
      const j = lines.findIndex((n, k) => !used.has(k) && n.trim() === t);
      if (j >= 0) { used.add(j); at.set(i, j); }
    }
    written.set(a, { fs, lines, at });
  }
  const rank = (e: Edit) => (e.f.kind === 'amend' ? 0 : 1);
  all.sort((x, y) => rank(x) - rank(y) || x.line - y.line || x.at - y.at || y.length - x.length);
  const lines = new Map<number, Edit[]>();
  for (const { line, ...e } of all) {
    const a = articleAt(reg, line);
    const own = a ? written.get(a) : undefined;
    if (own && !own.at.has(line)) { drop(e.f, '담당자 개정 문안에서 고쳐 쓴 줄'); continue; }
    const on = lines.get(line) ?? [];
    if (on.some((o) => e.at < o.at + o.length && o.at < e.at + e.length)) { drop(e.f, '다른 고침과 같은 글자'); continue; }
    lines.set(line, [...on, e]);
  }
  return { lines, written, hand };
}

/** 모든 규정의 직접 고칠 곳(반영본 쪽은 여기에 표·그림 문단·새 줄 고침이 더해진다) */
export const handList = (ws: Workspace): Hand[] => ws.regs.flatMap((r) => resolveEdits(ws, r).hand);

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
    // 밑줄 표시는 줄을 넘지 않는다 — 새로 넣은 줄도 줄마다 감싼다
    neu = neu.slice(0, e.at) + U0 + e.to.split('\n').join(`${U1}\n${U0}`) + U1 + neu.slice(e.at + e.length);
  }
  return { old: old.trim(), neu: neu.trim() };
}

const MARKER = /^\s*([①-⑳]|\d+\.|[가-하]\.|\(\d+\)|\d+\))/;
const reasonOf = (ws: Workspace, f: Finding) => {
  const s = stateOf(ws, f.id);
  if (f.kind === 'amend') return s.note.trim() || '담당자 개정';
  const rep = replacement(ws, f);
  const base = rep !== null ? `${KIND_LABEL[f.kind]}: 「${f.before}」→「${rep}」` : `${KIND_LABEL[f.kind]}`;
  return s.note.trim() ? `${base} — ${s.note.trim()}` : base;
};

/** 반영한 항목 → 한 규정의 신·구조문 행 */
export function compareRows(ws: Workspace, reg: Regulation): CompareRow[] {
  const mark = `<개정 ${dotDate(ws.effective)}>`;
  const { lines: lineEdits, written } = resolveEdits(ws, reg);
  const reasons = new Map<string, Set<string>>(); // 조문(또는 줄) 열쇠 → 사유
  const keyOf = (line: number) => { const a = articleAt(reg, line); return a ? `a${a.start}` : `l${line}`; };
  // 사유는 넣은 고침만, 항목 목록 순서로
  const order = new Map(ws.findings.map((f, i) => [f, i]));
  const pairs: [Finding, string][] = [];
  for (const [line, es] of lineEdits) for (const e of es) pairs.push([e.f, keyOf(line)]);
  for (const [a, own] of written) for (const f of own.fs) pairs.push([f, `a${a.start}`]);
  for (const [f, k] of pairs.sort((x, y) => order.get(x[0])! - order.get(y[0])!)) reasons.set(k, (reasons.get(k) ?? new Set()).add(reasonOf(ws, f)));
  const rows: { start: number; row: CompareRow }[] = [];
  const done = new Set<number>();
  // 담당자 개정 문안 조문 — 문안 그대로 싣고, 문안에 그대로 남은 원래 줄에만 글자 고침을 얹는다
  for (const [a, own] of written) {
    const olds: string[] = [], news = [...own.lines];
    for (let i = a.start; i <= a.end; i++) {
      const t = reg.lines[i].text.trim();
      if (!t) continue;
      const edits = lineEdits.get(i);
      if (!edits) { olds.push(t); continue; }
      const m = markedLine(reg.lines[i].text, edits);
      olds.push(m.old);
      news[own.at.get(i)!] = m.neu;
    }
    rows.push({ start: a.start, row: { old: olds.join('\n'), neu: `${news.join('\n').trim()} ${mark}`, why: [...reasons.get(`a${a.start}`)!].join('\n') } });
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
  const manual = handList(ws);
  b += pageBreak + para('3. 직접 고칠 곳', true, 24, 60) + para('반영하기로 했지만 반영본(hwpx)에 자동으로 넣지 않은 항목입니다. 고칠 문안이 없는 항목은 개정 문안을 작성해 신·구조문대비표에 더하고, 담당자 개정 문안은 한글에서 반영본에 직접 옮기세요.', false, 18, 100, '485149');
  b += manual.length ? table(['규정', '조문', '종류', '내용', '사유'], split([3, 2, 2, 6, 3]), manual.map(({ f, why }) => row(f, [KIND_LABEL[f.kind], `${f.message}\n(${why})`, stateOf(ws, f.id).note]))) : para('없습니다.', false, 19);
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
  /** 직접 고칠 곳 — 대비표와 같은 항목(문안 없음·담당자 개정 문안·겹쳐서 뺀 고침) + 표·그림 문단·새 줄 고침 */
  manual: Hand[];
  error?: string;
}

/** 한 규정의 반영본 고침 — 대비표와 같은 resolveEdits 결과에서, 한글 문단에 넣지 못하는 것만 더 뺀다 */
export function planChanges(ws: Workspace, r: Regulation): { changes: Change[]; manual: Hand[] } {
  const { lines, hand } = resolveEdits(ws, r);
  const changes: Change[] = [], manual = [...hand];
  for (const [ln, edits] of lines) {
    const line = r.lines[ln];
    for (const e of edits) {
      if (line.controls) { manual.push({ f: e.f, why: '표·그림이 든 문단' }); continue; }
      if (e.to.includes('\n')) { manual.push({ f: e.f, why: '줄을 새로 넣는 고침' }); continue; }
      changes.push({ id: `${e.f.id}:${ln}:${e.at}`, kind: 'word', topic: KIND_LABEL[e.f.kind], std: '', where: articleLabel(articleAt(r, ln)),
        before: line.text.slice(e.at, e.at + e.length), after: e.to, word: { line: ln, at: e.at, length: e.length }, overlaps: [] } as Change);
    }
  }
  return { changes, manual };
}

export async function applyToSources(ws: Workspace, sources: Record<string, Source>, wasm?: InitInput): Promise<Applied[]> {
  const out: Applied[] = [];
  for (const r of ws.regs) {
    const src = sources[r.key];
    const { changes, manual } = planChanges(ws, r);
    if (!changes.length && !manual.length) continue;
    const res: Applied = { reg: r.name, fileName: r.fileName.replace(/\.(hwpx?|docx|txt)$/i, '') + '_개정안.hwpx', bytes: null, applied: 0, manual };
    if (!src || (src.kind !== 'hwp' && src.kind !== 'hwpx')) {
      res.error = '원본이 한글 파일이 아니라 반영본을 만들지 않았습니다. 신·구조문대비표를 쓰세요';
      out.push(res);
      continue;
    }
    if (!changes.length) { out.push(res); continue; } // 직접 고칠 곳만 있는 규정 — 파일은 만들지 않는다
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
