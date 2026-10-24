import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { parseRegulation, type Regulation } from '@/lib/rules-review/model';
import { runChecks } from '@/lib/rules-review/checks';
import { ingest } from '@/lib/rules-review/ingest';
import { attachOpinions, applyToSources, bundleBody, compareRows, manualItems, parseOpinions, requestXlsx, itemsFor, U0, U1, unmark } from '@/lib/rules-review/outputs';
import { carryOver, newWorkspace, stats, type Workspace } from '@/lib/rules-review/workspace';
import { HwpEditDoc } from '@/lib/hwp/hwp-doc';
import { toLines } from '@/lib/hwp/apply';

const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));
const reg = (name: string, body: string): Regulation =>
  parseRegulation({ key: name, name, fileName: `${name}.txt`, kind: 'txt', lines: [name, ...body.trim().split('\n')].map((text) => ({ text, controls: 0 })) });

const A = reg('직원 인사 규정', `
제1조(목적) 이 규정은 직원 인사를 정한다.
제2조(휴직) ① 휴직은 당해 연도 안에 신청한다.
② 휴직 기간은 1년으로 한다.
③ 휴직 서류는 「직원 보수규정」 제2조에 따른다.
제3조(복직) 복직은 제9조에 따른다.
`);
const B = reg('직원 보수 규정', `
제1조(목적) 이 규정은 보수를 정한다.
제2조(호봉) 호봉은 익일부터 적용한다.
`);

function decided(): Workspace {
  const regs = [A, B];
  const findings = runChecks(regs);
  const ws = newWorkspace(regs, findings, { read: 2, duplicates: [], notRegulation: [], annexFiles: [], failed: [], skipped: [] }, '시험기관');
  ws.effective = '2026-03-01';
  const id = (kind: string, before: string) => findings.find((f) => f.kind === kind && f.before === before)!.id;
  ws.states[id('plain', '당해')] = { decision: '반영', note: '' };
  ws.states[id('reg-name', '직원 보수규정')] = { decision: '반영', note: '정식 이름' };
  ws.states[id('article-ref', '제9조')] = { decision: '반영', note: '' }; // 문안 없음 → 직접 고칠 곳
  ws.states[id('plain', '익일')] = { decision: '보류', note: '보수 규정 전면 개정 때 함께' };
  return ws;
}

describe('신·구조문대비표', () => {
  it('고친 항만 전문으로 싣고 나머지는 (생략)·(현행과 같음), 끝에 부칙', () => {
    const marked = compareRows(decided(), A);
    // 바뀐 글자는 양쪽 모두 밑줄 표시로 감싼다
    expect(marked[0].old).toContain(`${U0}당해${U1}`);
    expect(marked[0].neu).toContain(`${U0}해당${U1}`);
    const rows = marked.map((r) => ({ old: unmark(r.old), neu: unmark(r.neu), why: r.why }));
    expect(rows).toHaveLength(2);
    expect(rows[0].old).toBe('제2조(휴직) ① 휴직은 당해 연도 안에 신청한다.\n② (생략)\n③ 휴직 서류는 「직원 보수규정」 제2조에 따른다.');
    expect(rows[0].neu).toBe('제2조(휴직) ① 휴직은 해당 연도 안에 신청한다. <개정 2026. 3. 1.>\n② (현행과 같음)\n③ 휴직 서류는 「직원 보수 규정」 제2조에 따른다. <개정 2026. 3. 1.>');
    expect(rows[0].why).toContain('정식 이름');
    expect(rows[1]).toEqual({ old: '<신 설>', neu: '부 칙\n이 규정은 2026년 3월 1일부터 시행한다.', why: '시행일' });
    expect(compareRows(decided(), B)).toEqual([]); // 보류만 있는 규정은 싣지 않는다
  });
  it('직접 고칠 곳·보류·요약이 결재 묶음에 함께 실린다', () => {
    const ws = decided();
    expect(manualItems(ws).map((f) => f.before)).toEqual(['제9조']);
    const body = bundleBody(ws);
    expect(body).toContain('직원 인사 규정 신·구조문대비표');
    expect(body).toContain('보수 규정 전면 개정 때 함께');
    expect(body).toContain('3. 직접 고칠 곳');
    expect(body).not.toMatch(/진단|자문|판정|노무사/);
  });
});

describe('부서 의견 왕복', () => {
  it('요청 엑셀에 반영 항목이 나가고, 회신을 다시 올리면 항목에 붙고 이견이 표시된다', async () => {
    let ws = decided();
    ws.depts['직원 인사 규정'] = '총무팀';
    const items = itemsFor(ws, '총무팀', false);
    expect(items).toHaveLength(3);
    const blob = await requestXlsx(ws, '총무팀', items);
    // 부서가 엑셀에 적어 회신한 것처럼 만든다
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    const sh = book.getWorksheet('의견 요청')!;
    sh.getCell('G2').value = '동의';
    sh.getCell('G3').value = '반대';
    sh.getCell('H3').value = '지금 이름이 맞습니다';
    sh.getCell('I3').value = '김담당';
    const back = await parseOpinions(await book.xlsx.writeBuffer() as ArrayBuffer);
    expect(back.map((o) => o.verdict)).toEqual(['동의', '반대']);
    const r = attachOpinions(ws, '총무팀', [...back, { id: 'zz-none', verdict: '동의', text: '', by: '' }]);
    ws = r.ws;
    expect(r.attached).toBe(2);
    expect(r.missing).toEqual(['zz-none']);
    expect(stats(ws).disputed).toBe(1);
    expect(stats(ws).unsettled).toBe(1);
  });
});

describe('다시 올리기', () => {
  it('같은 항목 번호면 결정이 그대로 붙는다', () => {
    const ws = decided();
    const again = newWorkspace([A, B], runChecks([A, B]), ws.report);
    const { ws: merged, kept, lost } = carryOver(ws, again);
    expect(kept).toBe(4);
    expect(lost).toBe(0);
    expect(stats(merged).by.반영).toBe(3);
    expect(merged.effective).toBe('2026-03-01');
  });
  it('규정 일부만 다시 올려도 나머지 결정은 지우지 않고, 전부 다시 올리면 다시 붙는다', () => {
    const ws = decided();
    const partial = carryOver(ws, newWorkspace([B], runChecks([B]), ws.report));
    expect(partial.lost).toBe(3); // 인사 규정 항목 3건은 짝이 없다
    expect(stats(partial.ws).by.반영).toBe(0);
    const back = carryOver(partial.ws, newWorkspace([A, B], runChecks([A, B]), ws.report));
    expect(back.lost).toBe(0);
    expect(stats(back.ws).by.반영).toBe(3);
  });
});

describe('개정안 반영본(hwpx)', () => {
  it('원본 한글 파일에 반영한 글자만 고치고 다시 열어도 그대로다', async () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, '../fixtures/laws/sample-rules.hwpx')));
    const { regs, sources } = await ingest([{ path: '시험 규칙.hwpx', bytes }], { wasm });
    expect(regs).toHaveLength(1);
    // 픽스처 본문 「근로기준법에 따른다」의 「따른다」를 담당자 문안으로 바꾸는 항목을 만든다
    const r = regs[0];
    const line = r.lines.findIndex((l) => l.text.includes('근로기준법에 따른다'));
    const at = r.lines[line].text.indexOf('따른다');
    const ws = newWorkspace(regs, [{ id: 'pl-x', kind: 'plain', reg: r.name, article: '', spans: [{ line, at, length: 3 }], before: '따른다', after: '따라 준다', message: '', other: null }], { read: 1, duplicates: [], notRegulation: [], annexFiles: [], failed: [], skipped: [] });
    ws.states['pl-x'] = { decision: '반영', note: '' };
    const [res] = await applyToSources(ws, sources, wasm);
    expect(res.error).toBeUndefined();
    expect(res.applied).toBe(1);
    const doc = await HwpEditDoc.open(res.bytes!, wasm);
    const text = toLines(doc.paragraphs()).map((l) => l.text).join('\n');
    doc.free();
    expect(text).toContain('근로기준법에 따라 준다');
    expect(text).not.toContain('근로기준법에 따른다');
  });
  it('zip 안의 EUC-KR 한글 파일 이름을 읽고, 같은 규정의 pdf 는 고르지 않는다', async () => {
    const zip = new JSZip();
    const name = '직원 인사 규정(20240101).txt';
    zip.file(name, '직원 인사 규정\n제1조(목적) 시험.');
    zip.file('직원 인사 규정.pdf', '%PDF-1.4');
    const raw = await zip.generateAsync({ type: 'uint8array', encodeFileName: ((s: string) => (s === name ? eucKr(name) : new TextEncoder().encode(s))) as unknown as (s: string) => string });
    const { regs, report } = await ingest([{ path: '규정.zip', bytes: raw }], { wasm });
    expect(regs.map((x) => x.name)).toEqual(['직원 인사 규정']);
    expect(report.duplicates).toEqual([{ chosen: `규정.zip/${name}`, others: ['규정.zip/직원 인사 규정.pdf'] }]);
  });
});

// 시험용 EUC-KR 인코더 — 이 파일 이름에 든 글자만 안다
function eucKr(s: string): Uint8Array {
  const table: Record<string, number[]> = { 직: [0xc1, 0xf7], 원: [0xbf, 0xf8], 인: [0xc0, 0xce], 사: [0xbb, 0xe7], 규: [0xb1, 0xd4], 정: [0xc1, 0xa4] };
  return new Uint8Array([...s].flatMap((c) => table[c] ?? [c.charCodeAt(0)]));
}
