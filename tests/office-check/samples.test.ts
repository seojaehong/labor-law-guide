// 엔진 writer 마다 합성 데이터로 견본을 하나씩 만들어 tools/office-check/check.py 로 검사한다.
// 실행: npm run office:samples  (OFFICE_CHECK_OUT=<폴더> 를 주면 견본과 보고서를 그 폴더에 남긴다)
// python(defusedxml·lxml·openpyxl·pypdf)이 없으면 건너뛴다.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { compareDocx } from '@/lib/laws/doc-io';
import { comparisonXlsx } from '@/lib/laws/comparison-xlsx';
import { buildWorkbook } from '@/lib/leave/leave-xlsx';
import { designFromForm, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument } from '@/lib/contract-write/document';
import { buildContractHwpx, buildContractPdf, buildContractXlsx } from '@/lib/contract-write/export';
import { nosaDocs, type NosaFormInput } from '@/lib/nosa-council/forms';
import { formHwpx, formPdf } from '@/lib/work-rules-report/render';
import { parseRegulation, type Regulation } from '@/lib/rules-review/model';
import { runChecks } from '@/lib/rules-review/checks';
import { bundleDocx, itemsFor, requestXlsx, reviewXlsx } from '@/lib/rules-review/outputs';
import { newWorkspace } from '@/lib/rules-review/workspace';
import { applyChanges } from '@/lib/hwp/apply';

const ROOT = resolve(__dirname, '../..');
const CHECK = join(ROOT, 'tools/office-check/check.py');
const PROBE = 'import defusedxml, lxml, openpyxl, pypdf';
const PY = [process.env.PYTHON, 'python3', 'python'].filter(Boolean).find((c) => spawnSync(c!, ['-c', PROBE]).status === 0);
const OUT = process.env.OFFICE_CHECK_OUT ?? mkdtempSync(join(tmpdir(), 'office-check-'));
const NOT_RUN: Record<string, string> = {};
const read = (p: string) => new Uint8Array(readFileSync(join(ROOT, p)));
const bytesOf = async (b: Blob | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(await b.arrayBuffer()));

function check(files: string[]) {
  const r = spawnSync(PY!, [CHECK, ...files], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// ── 합성 입력 (기존 단위시험의 합성 견본과 같은 형태) ──
const FORM: WriteForm = {
  workplaceName: '합성테스트 사업장', ownerName: '합성대표', employeeCount5plus: true, employeeName: '합성01',
  startDate: '2026-03-01', endDate: null, location: '합성테스트 본점', duty: '홀 서비스', workDays: ['월', '화', '수', '목'],
  start: '10:00', end: '22:00', breakMinutes: 155, weeklyRestDay: '일', writtenDate: '2026-02-25', monthlyTotal: 2_600_000,
  holidayDaysPerYear: 22, payday: '매월 10일', paymentMethod: '근로자 명의 계좌이체',
};
const NOSA: NosaFormInput = {
  workplace: { name: '가상제조', ownerName: '김대표', bizNo: '0000000000', address: '서울특별시 가상구 가상로 1', tel: '02-000-0000' },
  headcount: 120, majorityUnion: false, workerMembers: 5, employerMembers: 5, grievanceMembers: 3, concurrentRep: true,
  concurrentScope: ['탄력적 근로시간제 서면합의'], installDate: '2026-12-01', electionDate: '2026-11-19', termStart: '2026-12-01',
  rosterDate: '2026-11-16', electors: 100, election: { electors: 100, voters: 60, candidates: 5, notified: true, supporters: 40 },
  council: { name: '가상제조 노사협의회', regularMeetings: '3월·6월·9월·12월 둘째 주 화요일' }, unit: '사업',
  office: '서울지방고용노동청 서울가상지청', writtenDate: '2026-11-10',
};
const reg = (name: string, body: string): Regulation =>
  parseRegulation({ key: name, name, fileName: `${name}.txt`, kind: 'txt', lines: [name, ...body.trim().split('\n')].map((text) => ({ text, controls: 0 })) });

function workspace() {
  const regs = [
    reg('직원 인사 규정', '제1조(목적) 이 규정은 직원 인사를 정한다.\n제2조(휴직) ① 휴직은 당해 연도 안에 신청한다.\n② 휴직 서류는 「직원 보수규정」 제2조에 따른다.\n제3조(복직) 복직은 제9조에 따른다.'),
    reg('직원 보수 규정', '제1조(목적) 이 규정은 보수를 정한다.\n제2조(호봉) 호봉은 익일부터 적용한다.'),
  ];
  regs[0].meta.dept = '총무팀';
  const findings = runChecks(regs);
  const ws = newWorkspace(regs, findings, { read: 2, duplicates: [], notRegulation: [], annexFiles: [], failed: [], skipped: [] }, '시험기관');
  ws.effective = '2026-03-01';
  for (const f of findings) ws.states[f.id] = { decision: '반영', note: '' };
  return ws;
}

async function engineSamples(): Promise<Record<string, Uint8Array>> {
  const s: Record<string, Uint8Array> = {};
  // writer 하나가 의존성 부족(예: @pdf-lib/fontkit 미설치)으로 못 돌아도 나머지는 검사한다. 못 돈 것은 보고서에 남긴다.
  const make = async (name: string, fn: () => Promise<Uint8Array>) => {
    try { s[name] = await fn(); } catch (e) { NOT_RUN[name] = String((e as Error).message ?? e).split('\n')[0]; }
  };
  const head = ['조문', '현행', '개정안', '근거', '판정'];
  const rows = [['제29조', '현행 조문 '.repeat(40), '개정 조문 <보존>', '법령 확인 필요', '미검증']];
  await make('laws-compare.docx', async () => bytesOf(await compareDocx({ title: '신구대조표', intro: ['합성 견본'], head, widths: [1700, 4300, 4300, 3200, 1200], rows, foot: ['검토용'] })));
  await make('laws-comparison.xlsx', async () => bytesOf(await comparisonXlsx({ title: '신구대조표', intro: ['합성 견본'], head, widths: [20, 52, 52, 38, 16], rows, foot: ['검토용'] })));
  await make('leave.xlsx', async () => {
    const wb = await buildWorkbook([{ name: '결과', header: ['이름', '입사일', '발생', '대장', '차이', '판정', '근거'], rows: [['합성01', '2024-03-01', 15, 15, 0, '일치', '근로기준법 제60조']] }]);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  });
  const doc = buildContractDocument(FORM, designFromForm(FORM));
  await make('contract.xlsx', () => buildContractXlsx(doc));
  await make('contract.hwpx', () => buildContractHwpx(doc));
  await make('contract-pdf.pdf', () => buildContractPdf(doc, read('public/fonts/NanumGothic-Regular.ttf')));
  const docs = nosaDocs(NOSA).made.map((d) => d.doc);
  await make('nosa-forms.hwpx', () => formHwpx(docs));
  await make('nosa-forms-pdf.pdf', () => formPdf(docs, read('public/fonts/NanumGothic-Regular.ttf')));
  const ws = workspace();
  await make('rules-bundle.docx', async () => bytesOf(await bundleDocx(ws)));
  await make('rules-review.xlsx', async () => bytesOf(await reviewXlsx(ws)));
  await make('rules-request.xlsx', async () => bytesOf(await requestXlsx(ws, '총무팀', itemsFor(ws, '총무팀', true))));
  await make('hwp-apply.hwpx', async () => {
    const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));
    return (await applyChanges(read('tests/fixtures/laws/sample-rules.hwpx'), [], 'hwpx', wasm)).bytes;
  });
  await make('nhis-loss.pdf', async () => {
    const { buildPacket } = await import('@/lib/nhis-forms/build');
    const biz = { mgmtNo: '12345678900', name: '가상상사', tel: '043-000-0000', fax: '043-000-0001', addr: '가상시 가상구 가상로 1', zip: '28000', ownerName: '홍대표' };
    const loss = await buildPacket({ formPdf: read('public/forms/nhis/NHIS_8_LOSS.pdf'), font: read('public/fonts/llg-forms/LLGFormsSans-Regular.ttf') }, {
      kind: 'loss', biz, now: new Date('2026-11-02T12:00:00Z'), branchName: '청주동부지사', reason: '퇴사 처리 과정에서 신고를 빠뜨렸습니다.',
      people: [{ name: '김가상', rrn: '900101-1000000', lastWorkDay: '2026-05-31', nhisCode: '01', payCur: 12000000, monthsCur: 6 }],
    });
    return loss.bytes;
  });
  return s;
}

/** 일부러 깨뜨린 견본 — 검사기가 실제로 잡는지 본다 */
async function brokenSamples(good: Record<string, Uint8Array>): Promise<Record<string, Uint8Array>> {
  const s: Record<string, Uint8Array> = {};
  const src = await JSZip.loadAsync(good['contract.hwpx']);
  const late = new JSZip(); // mimetype 를 맨 뒤로
  for (const name of Object.keys(src.files).filter((n) => n !== 'mimetype' && !src.files[n].dir)) late.file(name, await src.file(name)!.async('uint8array'));
  late.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  s['broken-mimetype-last.hwpx'] = await late.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const blue = await JSZip.loadAsync(good['contract.hwpx']); // 본문 글자를 예시 서식(파란 이탤릭)으로
  const header = (await blue.file('Contents/header.xml')!.async('string'))
    .replace(/textColor="#000000"/g, 'textColor="#0000FF"').replace(/(<hh:charPr\b[^>]*>)/g, '$1<hh:italic/>');
  blue.file('Contents/header.xml', header);
  s['broken-placeholder-style.hwpx'] = await blue.generateAsync({ type: 'uint8array' }); // 전부 STORE — mimetype 검사와 섞이지 않게
  const book = new ExcelJS.Workbook();
  const sh = book.addWorksheet('합계');
  sh.getCell('A1').value = 1;
  sh.getCell('A2').value = { formula: 'A1/0', result: { error: '#DIV/0!' } } as ExcelJS.CellFormulaValue;
  sh.getCell('A3').value = { formula: '#REF!+1', result: { error: '#REF!' } } as ExcelJS.CellFormulaValue;
  s['broken-formula-error.xlsx'] = new Uint8Array(await book.xlsx.writeBuffer());
  const docx = await JSZip.loadAsync(good['laws-compare.docx']);
  const xml = await docx.file('word/document.xml')!.async('string');
  docx.file('word/document.xml', xml.slice(0, xml.length - 40));
  s['broken-truncated-xml.docx'] = await docx.generateAsync({ type: 'uint8array' });
  return s;
}

function save(files: Record<string, Uint8Array>): string[] {
  mkdirSync(OUT, { recursive: true });
  return Object.entries(files).map(([name, data]) => { const p = join(OUT, name); writeFileSync(p, data); return p; });
}

describe.skipIf(!PY)('office-check 견본', () => {
  it('엔진 산출물 견본을 검사하고 보고서를 남긴다', async () => {
    const good = await engineSamples();
    const report: string[] = [];
    for (const p of save(good)) {
      const r = check([p]);
      report.push(`### ${p.split(/[\\/]/).pop()} → exit ${r.status}\n${r.out}`);
    }
    for (const [name, why] of Object.entries(NOT_RUN)) report.push(`### ${name} → not run: ${why}`);
    writeFileSync(join(OUT, 'office-check-report.txt'), report.join('\n'));
    console.log(`office-check report: ${join(OUT, 'office-check-report.txt')}\n\n${report.join('\n')}`);
    expect(report.length).toBe(Object.keys(good).length + Object.keys(NOT_RUN).length);
  });

  it('일부러 깨뜨린 견본은 모두 실패로 잡는다', async () => {
    const broken = await brokenSamples(await engineSamples());
    // 실패 이유까지 맞아야 한다 — 다른 결함으로 우연히 실패한 것을 통과로 치지 않는다
    const expected: Record<string, string> = {
      'broken-mimetype-last.hwpx': '[ERROR] mimetype:',
      'broken-placeholder-style.hwpx': '[ERROR] style:',
      'broken-formula-error.xlsx': '[ERROR] formula-error:',
      'broken-truncated-xml.docx': '[ERROR] xml:',
    };
    for (const p of save(broken)) {
      const name = p.split(/[\\/]/).pop()!;
      const r = check([p]);
      console.log(`### ${name} → exit ${r.status}\n${r.out}`);
      expect(r.status, r.out).toBe(1);
      expect(r.out).toContain(expected[name]);
    }
  });
});
