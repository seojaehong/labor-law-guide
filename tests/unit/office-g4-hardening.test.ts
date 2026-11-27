// G4 적대 검토 Act on 13건(261123) — 각 항목을 재현하는 시험. 자료는 모두 합성.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';
import { makeXlsxFromSpec } from '@/lib/office/xlsx/make';
import { extractPptx } from '@/lib/office/pptx/extract';
import { makeMeetingPptx, type MeetingSnapshot } from '@/lib/office/pptx/meeting';
import { DEFAULT_LIMITS, readZipGuarded } from '@/lib/office/limits';
import { text } from '../../tools/k-labor/lib/common.mjs';

const u8 = async (wb: ExcelJS.Workbook) => new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);

async function simpleBook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가표');
  ws.getRow(1).values = ['번호', '위험요인'];
  ws.getCell('A2').value = 1;
  return u8(wb);
}

/** zip 안 부품 하나를 바꾸거나 더한다 */
async function patchZip(bytes: Uint8Array, edit: (zip: JSZip) => Promise<void> | void): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  await edit(zip);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ── 2. 보존 비교가 ExcelJS 밖(zip 부품·extLst·x14)을 본다
describe('G4-2 보존 비교 — ExcelJS 밖 부품', () => {
  async function withExtras(): Promise<Uint8Array> {
    return patchZip(await simpleBook(), async (zip) => {
      // ExcelJS 가 읽지 못하는 차트 부품 + x14 교차시트 드롭다운(extLst)
      zip.file('xl/charts/chart1.xml', '<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>');
      const ct = await zip.file('[Content_Types].xml')!.async('string');
      zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>'));
      const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
      const ext =
        '<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main">' +
        '<x14:dataValidations count="1" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:dataValidation type="list"><x14:formula1><xm:f>참고!$A$1:$A$3</xm:f></x14:formula1><xm:sqref>B2:B9</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst>';
      zip.file('xl/worksheets/sheet1.xml', sheet.replace('</worksheet>', `${ext}</worksheet>`));
    });
  }

  it('칸만 쓰면(칸 패치, 설계 v2.1) 차트 부품·x14 드롭다운을 잃지 않는다', async () => {
    const r = await fillXlsxTemplate(await withExtras(), { cells: [{ sheet: '평가표', cell: 'B2', value: '합성' }] });
    expect(r.ok).toBe(true);
    expect(r.preserved!.package.same).toBe(true);
    expect(r.preserved!.allSame).toBe(true);
    expect(r.issues.some((w) => w.code === 'PRESERVATION_LOSS')).toBe(false);
  });

  // 조각 6 — 열 숨김도 칸 패치 경로라(옛 ExcelJS 통째 저장 없음) 차트·x14 드롭다운을 잃지 않는다. 엄격 모드도 통과
  const HIDE = { hiddenColumns: [{ sheet: '평가표', columns: ['Z'] }] };
  it('열 숨김 요청도 차트 부품·x14 드롭다운을 잃지 않는다(allSame, 손실 경고 없음)', async () => {
    const r = await fillXlsxTemplate(await withExtras(), { cells: [{ sheet: '평가표', cell: 'B2', value: '합성' }], ...HIDE });
    expect(r.ok).toBe(true);
    expect(r.preserved!.package.same).toBe(true);
    expect(r.preserved!.allSame).toBe(true);
    expect(r.issues.some((w) => w.code === 'PRESERVATION_LOSS')).toBe(false);
  });

  it('열 숨김 요청을 엄격 모드로 해도 바이트를 돌려준다', async () => {
    const r = await fillXlsxTemplate(await withExtras(), { cells: [{ sheet: '평가표', cell: 'B2', value: '합성' }], ...HIDE }, DEFAULT_LIMITS, true);
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeDefined();
  });

  it('잃은 것이 없으면 package.same:true', async () => {
    const r = await fillXlsxTemplate(await simpleBook(), { cells: [{ sheet: '평가표', cell: 'B2', value: '합성' }] });
    expect(r.preserved!.package).toEqual({ lost: [], restored: [], same: true });
    expect(r.preserved!.allSame).toBe(true);
  });
});

// ── 3. 연산량 폭탄 — ExcelJS 에 넘기기 전 사전 스캔
describe('G4-3 작업량 사전 스캔', () => {
  it('넓은 유효성 범위(A1:XFD1048576)는 ExcelJS 를 부르기 전에 WORKLOAD_TOO_LARGE', async () => {
    const bomb = await patchZip(await simpleBook(), async (zip) => {
      const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
      const dv = '<dataValidations count="1"><dataValidation type="list" sqref="A1:XFD1048576"><formula1>"a,b"</formula1></dataValidation></dataValidations>';
      zip.file('xl/worksheets/sheet1.xml', sheet.replace(/(<\/sheetData>)/, `$1${dv}`));
    });
    expect(bomb.length).toBeLessThan(10_000);
    const t0 = Date.now();
    for (const r of [await inspectXlsx(bomb), await extractXlsxRows(bomb), await fillXlsxTemplate(bomb, { cells: [{ sheet: '평가표', cell: 'B2', value: 1 }] })]) {
      expect(r.ok).toBe(false);
      expect(r.code).toBe('WORKLOAD_TOO_LARGE');
    }
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it('먼 칸 하나(XFD1048576)로 읽기 고리가 수십억 번 돌지 않는다', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('s');
    ws.getCell('A1').value = 'h';
    ws.getCell('XFD1048576').value = 1;
    const bytes = await u8(wb);
    const t0 = Date.now();
    const r = await extractXlsxRows(bytes);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('WORKLOAD_TOO_LARGE');
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});

// ── 4. zip 폭탄 — 선언 크기를 속여도 실제 해제 누적으로 막는다
describe('G4-4 zip 실제 해제 누적 상한', () => {
  /** 중앙 디렉터리·지역 머리의 「풀린 크기」를 1000 으로 속인다 */
  function lie(bytes: Uint8Array): Uint8Array {
    const b = new Uint8Array(bytes);
    const dv = new DataView(b.buffer);
    for (let i = 0; i + 4 <= b.length; i++) {
      const sig = dv.getUint32(i, true);
      if (sig === 0x04034b50) dv.setUint32(i + 22, 1000, true);
      if (sig === 0x02014b50) dv.setUint32(i + 24, 1000, true);
    }
    return b;
  }

  it('선언 크기를 속인 6MB 항목도 maxUnzippedBytes 5MB 에서 멈춘다', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    zip.file('xl/bomb.bin', new Uint8Array(6 * 1024 * 1024));
    const forged = lie(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
    const limits = { ...DEFAULT_LIMITS, maxUnzippedBytes: 5 * 1024 * 1024 };
    const z = readZipGuarded(forged, limits);
    expect(z.ok).toBe(false);
    expect(z.ok ? '' : z.code).toBe('ZIP_TOO_LARGE');
    const r = await inspectXlsx(forged, limits);
    expect(r.code).toBe('ZIP_TOO_LARGE');
    const p = await extractPptx(forged, limits);
    expect(p.code).toBe('ZIP_TOO_LARGE');
  });

  it('항목 수 상한', async () => {
    const zip = new JSZip();
    for (let i = 0; i < 20; i++) zip.file(`f${i}.txt`, 'x');
    const z = readZipGuarded(await zip.generateAsync({ type: 'uint8array' }), { maxUnzippedBytes: 1e6, maxZipEntries: 10 });
    expect(z.ok ? '' : z.code).toBe('ZIP_TOO_LARGE');
  });
});

// ── 6·7·11·12. 채우기
async function sumTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('표');
  ws.getRow(1).values = ['번호', '값'];
  ws.getCell('B5').value = { formula: 'SUM(B2:B4)', result: 0 } as ExcelJS.CellFormulaValue;
  ws.getCell('A6').value = '결재';
  ws.mergeCells('A6:B6');
  ws.pageSetup.printArea = 'A1:B6';
  return u8(wb);
}

describe('G4-6 insertRows 정직 보고', () => {
  // 설계 v2.1 §2-5·2-5b — 밀기 없음. 수식(<f>)이 있는 통합문서는 닫힌 밀기도 거부 → OVERFLOW + 초과 행 수
  it('아래에 수식·바닥글이 놓인 서식은 밀지 않고 OVERFLOW + 초과 행 수, 바이트 없음', async () => {
    const r = await fillXlsxTemplate(await sumTemplate(), {
      rows: { sheet: '표', startRow: 2, columns: { A: 'n', B: 'v' }, data: [1, 2, 3, 4, 5].map((n) => ({ n, v: n })), overflow: 'insertRows' },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('OVERFLOW');
    expect(r.overflowRows).toBe(2);
    expect(r.bytes).toBeUndefined();
    expect(r.reason).toMatch(/빈 행을 더 만들어/);
  });

});

describe('G4-7 rows 경로 병합 종속 칸', () => {
  it('rows 로 병합 종속 칸을 겨냥해도 주 칸 값을 덮어쓰지 않고 경고한다', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('표');
    ws.getRow(1).values = ['번호', '값'];
    ws.mergeCells('A3:B3'); // 주 칸 A3 비어 있음 → 빈 행으로 센다
    const r = await fillXlsxTemplate(await u8(wb), {
      rows: { sheet: '표', startRow: 2, columns: { A: 'n', B: 'v' }, data: [{ n: 'x', v: 1 }, { n: 'y', v: 2 }] },
    });
    expect(r.ok).toBe(true);
    expect(r.issues.some((x) => x.code === 'MERGED_CELL_SKIPPED' && x.at === '표!B3')).toBe(true);
    const ex = await extractXlsxRows(r.bytes!);
    expect(ex.rows.find((x) => x.rowNumber === 3)!.cells['번호'].raw).toBe('y');
    expect(ex.rows.find((x) => x.rowNumber === 3)!.cells['값'].mergedFrom).toBe('A3');
  });
});

describe('G4-11 make → fill 기본 overflow', () => {
  it('틀고정 없이 만든 서식도 시트 끝을 벽으로 보지 않아 기본 overflow 로 채워진다', async () => {
    const mk = await makeXlsxFromSpec({ sheets: [{ name: '평가표', columns: [{ key: 'id', header: 'ID' }, { key: 'h', header: '위험요인' }] }] });
    expect(mk.ok).toBe(true);
    if (!mk.ok) throw new Error('make 실패');
    const r = await fillXlsxTemplate(mk.bytes, {
      rows: { sheet: '평가표', startRow: 2, columns: { A: 'id', B: 'h' }, data: Array.from({ length: 30 }, (_, i) => ({ id: `H${i}`, h: '합성' })) },
    });
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows.count).toBe(0);
  });
});

describe('G4-12 칸 주소 엑셀 한계·공유 수식', () => {
  it('ZZZ1 은 던지지 않고 ok:false, XFD1 은 받는다', async () => {
    const tpl = await simpleBook();
    const bad = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'ZZZ1', value: 1 }] });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('INVALID_ARGS');
    const good = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'XFD1', value: 1 }] });
    expect(good.ok).toBe(true);
  });

  it('2,000,000행·마지막 행 넘는 rows 는 ok:false', async () => {
    const tpl = await simpleBook();
    const a = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'A2000000', value: 1 }] });
    expect(a.ok).toBe(false);
    const b = await fillXlsxTemplate(tpl, { rows: { sheet: '평가표', startRow: 1_048_576, columns: { A: 'v' }, data: [{ v: 1 }, { v: 2 }] } });
    expect(b.ok).toBe(false);
  });

  it('공유 수식 주인 칸을 덮어써도 던지지 않는다', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('s');
    ws.getCell('B2').value = 1;
    ws.getCell('B3').value = 2;
    ws.getCell('D2').value = { formula: 'B2*2', shareType: 'shared', ref: 'D2:D3', result: 2 } as unknown as ExcelJS.CellValue;
    ws.getCell('D3').value = { sharedFormula: 'D2', result: 4 } as unknown as ExcelJS.CellValue;
    const r = await fillXlsxTemplate(await u8(wb), { cells: [{ sheet: 's', cell: 'D2', value: 9 }] });
    expect(r.ok).toBe(true);
    const ex = await extractXlsxRows(r.bytes!, { headerRow: 1 });
    expect(ex.rows.find((x) => x.rowNumber === 3)!.cells.D.formula).toBe('B3*2');
  });
});

// ── 9. 응답 가림이 base64 를 깨지 않는다
describe('G4-9 text() 가 base64 를 가리지 않는다', () => {
  it('숫자 13자리가 이어진 base64 도 그대로, 다른 글자는 가린다', () => {
    const b64 = '9001011234567AAA'; // 주민번호 모양 숫자가 그대로 든 base64(디코드·재인코드 같음)
    expect(Buffer.from(Buffer.from(b64, 'base64')).toString('base64')).toBe(b64);
    const out = JSON.parse(text({ base64: b64, note: '900101-1234567' }).content[0].text);
    expect(out.base64).toBe(b64);
    expect(out.note).toBe('******-*******');
  });
});

// ── 5·8·10·13. 회의 덱
function finalSnap(): MeetingSnapshot {
  return {
    kind: 'final',
    site: '합성 사업장',
    cycle: '2026년 2회차',
    basisDate: '2026-11-20',
    status: { label: '확정', version: 1 },
    scaleId: 'scale-v2',
    scaleName: '합성 척도 v2',
    prior: [
      { id: 'R-01', hazard: '척도 미상 전회 항목', status: '미완료', frequency: 3, severity: 3 },
      { id: 'R-02', hazard: '전회 척도 있음', status: '미완료', frequency: 1, severity: 2, scaleId: 'scale-v1' },
    ],
    hazards: [],
    photos: [],
    opinions: [],
    questions: [],
    anchors: [],
    actions: [
      { id: 'AC-1', targetId: 'R-01', measure: '첫째 조치', due: '2027-01-01' },
      { id: 'AC-2', targetId: 'R-01', measure: '둘째 조치', due: '2027-02-01' },
      { id: 'AC-3', targetId: 'R-02', measure: '셋째 조치', due: '2027-03-01' },
    ],
    deferred: [],
  };
}

describe('G4-5·13 F7 이월', () => {
  it('척도 미상 항목에 현재 scaleId 를 지어내지 않는다', async () => {
    const r = await makeMeetingPptx(finalSnap(), { kind: 'final' });
    expect(r.ok).toBe(true);
    const c = r.carryOver!;
    expect(c.find((p) => p.id === 'R-01')!.scaleId).toBeUndefined();
    expect(c.find((p) => p.id === 'R-02')!.scaleId).toBe('scale-v1');
    expect(r.warnings.some((w) => w.includes('R-01') && w.includes('척도'))).toBe(true);
  });

  it('다음 회차 P8 은 척도 미상 이월을 「비교 안 함」 으로 둔다(증감을 만들지 않음)', async () => {
    const r = await makeMeetingPptx(finalSnap(), { kind: 'final' });
    const next: MeetingSnapshot = {
      ...finalSnap(),
      kind: 'pre',
      status: { label: '초안' },
      prior: r.carryOver!,
      hazards: [{ id: 'R-01', situation: '현재', cause: '-', consequence: '-', frequency: 1, severity: 1 }],
    };
    const r2 = await makeMeetingPptx(next, { kind: 'pre' });
    expect(r2.ok).toBe(true);
    for (const ch of r2.changes!.filter((x) => x.id.startsWith('R-01'))) expect(ch.delta).toBe('비교 안 함');
  });

  it('같은 위험요인의 조치 여러 건을 모두 이월한다', async () => {
    const r = await makeMeetingPptx(finalSnap(), { kind: 'final' });
    const c = r.carryOver!;
    expect(c.map((p) => p.measure)).toEqual(['첫째 조치', '둘째 조치', '셋째 조치']);
    expect(c.map((p) => p.id)).toEqual(['R-01', 'R-01#2', 'R-02']);
    expect(c[1].hazardId).toBe('R-01');
    expect(new Set(c.map((p) => p.id)).size).toBe(c.length);
  });
});

describe('G4-8 회의 스냅숏 모양 검사', () => {
  it('숫자 id·문자열 agenda·확정 판 없음은 던지지 않고 errors', async () => {
    const bad = { ...finalSnap(), kind: 'pre', status: { label: '확정' }, agenda: '의제' } as unknown as MeetingSnapshot;
    (bad as unknown as { prior: unknown[] }).prior = [{ id: 1, hazard: 'x', status: '완료' }];
    const r = await makeMeetingPptx(bad, { kind: 'pre' });
    expect(r.ok).toBe(false);
    expect(r.errors!.join('\n')).toMatch(/prior\[0\]\.id/);
    expect(r.errors!.join('\n')).toMatch(/agenda/);
    expect(r.errors!.join('\n')).toMatch(/version/);
  });

  it('검토안이라도 확정 배지는 판 번호가 있어야 한다(「확정 vundefined」 금지)', async () => {
    const s = { ...finalSnap(), kind: 'pre', status: { label: '확정' } } as unknown as MeetingSnapshot;
    const r = await makeMeetingPptx(s, { kind: 'pre' });
    expect(r.ok).toBe(false);
  });
});

describe('G4-10 표 장 쪽 나눔', () => {
  it('의견 30건·이월 30건·근거 40건이면 여러 장으로 나뉜다', async () => {
    const pre: MeetingSnapshot = {
      ...finalSnap(),
      kind: 'pre',
      status: { label: '초안' },
      opinions: Array.from({ length: 30 }, (_, i) => ({ id: `O-${i}`, from: '근로자(역할)', text: '합성 의견' })),
      anchors: Array.from({ length: 40 }, (_, i) => ({ id: `A-${i}`, source: '합성' })),
      prior: Array.from({ length: 30 }, (_, i) => ({ id: `R-${i}`, hazard: '합성', status: '미완료', scaleId: 'scale-v2' })),
    };
    const r = await makeMeetingPptx(pre, { kind: 'pre' });
    expect(r.ok).toBe(true);
    const count = (code: string) => r.slides.filter((s) => s.code === code).length;
    expect(count('P7')).toBe(4);
    expect(count('P8')).toBe(3);
    expect(count('P10')).toBe(3);
    const fin: MeetingSnapshot = {
      ...finalSnap(),
      actions: Array.from({ length: 30 }, (_, i) => ({ id: `AC-${i}`, targetId: `T-${i}`, hazard: '합성', measure: '합성 조치' })),
      anchors: Array.from({ length: 40 }, (_, i) => ({ id: `A-${i}`, source: '합성' })),
    };
    const f = await makeMeetingPptx(fin, { kind: 'final' });
    expect(f.ok).toBe(true);
    expect(f.slides.filter((s) => s.code === 'F7').length).toBe(3);
    expect(f.slides.filter((s) => s.code === 'F8').length).toBe(4);
  });
});
