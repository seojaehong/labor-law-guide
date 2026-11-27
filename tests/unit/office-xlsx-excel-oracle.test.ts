// 엑셀 COM 오라클(설계 v2.1 §2-5b 「검증 추가」) — 로컬 윈도 + 엑셀에서만 돈다(KLABOR_EXCEL_ORACLE=1).
// 원본을 엑셀로 열어 같은 자리에 「행 삽입」한 결과와 우리 밀기 결과를 scripts/office/excel-oracle.py 로 대조한다.
// 음성 대조: 고정점 하나를 일부러 안 민 출력은 오라클이 달라야 한다(검사가 공허하게 통과하지 않음).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { fillXlsxTemplate, type FillRows } from '@/lib/office/xlsx/fill';
import { zip, rowsOf, withDrawing, two, one, DRAW } from './fixtures/xlsx-push';

const on = process.env.KLABOR_EXCEL_ORACLE === '1' && process.platform === 'win32';
const priv = process.env.KLABOR_PRIVATE_XLSX_DIR;
const SCRIPT = join(process.cwd(), 'scripts/office/excel-oracle.py');

function oracle(src: Uint8Array, ours: Uint8Array, sheet: string, at: number, n: number, skip: [number, number]) {
  const dir = mkdtempSync(join(tmpdir(), 'klabor-oracle-'));
  try {
    const a = join(dir, 'src.xlsx');
    const b = join(dir, 'ours.xlsx');
    writeFileSync(a, src);
    writeFileSync(b, ours);
    const r = spawnSync('python', [SCRIPT, a, b, sheet, String(at), String(n), String(skip[0]), String(skip[1])], { encoding: 'utf8', timeout: 180_000 });
    const line = (r.stdout ?? '').trim().split(/\r?\n/)[0] ?? '';
    return { rc: r.status, out: line ? (JSON.parse(line) as { same: boolean; diffs: unknown[]; shapes: number }) : null, err: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 외부 연결 부품과 그 참조(workbook externalReferences·rels·content types)를 뺀 사본 */
async function dropExternalLinks(bytes: Uint8Array): Promise<Uint8Array> {
  const z = await JSZip.loadAsync(bytes);
  const edit = async (name: string, f: (s: string) => string) => z.file(name, f(await z.file(name)!.async('string')));
  await edit('xl/workbook.xml', (s) => s.replace(/<(?:\w+:)?externalReferences>[\s\S]*?<\/(?:\w+:)?externalReferences>/, ''));
  await edit('xl/_rels/workbook.xml.rels', (s) => s.replace(/<Relationship\b[^>]*externalLink[^>]*\/>/g, ''));
  await edit('[Content_Types].xml', (s) => s.replace(/<Override\b[^>]*externalLink[^>]*\/>/g, ''));
  for (const n of Object.keys(z.files)) if (n.startsWith('xl/externalLinks/')) z.remove(n);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function fill(src: Uint8Array, rows: FillRows) {
  const r = await fillXlsxTemplate(src, { rows });
  expect(r.reason).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
  return r.bytes!;
}

describe.skipIf(!on)('엑셀 COM 오라클 — 합성', () => {
  const anchors = two(0, 2, 2) + two(4, 5, 3) + one(5, 4);
  it('바닥글·병합·링크·쪽 나눔·인쇄영역·도형(S09+S11 모양): 엑셀 행 삽입과 같다', async () => {
    const src = await zip(withDrawing(anchors));
    const ours = await fill(src, rowsOf(5));
    const r = oracle(src, ours, '평가표', 5, 2, [2, 6]);
    expect(r.err).toBe('');
    expect(r.out, JSON.stringify(r.out?.diffs)).toMatchObject({ same: true, shapes: 3 });
    expect(r.rc).toBe(0);
  }, 240_000);

  it('음성 대조: 고정점 하나를 안 민 출력은 다르다', async () => {
    const src = await zip(withDrawing(anchors));
    const ours = await fill(src, rowsOf(5));
    const z = await JSZip.loadAsync(ours);
    const d = await z.file(DRAW)!.async('string');
    // 밀린 oneCellAnchor(7) 를 원래 자리(5)로 되돌린다
    z.file(DRAW, d.replace(/(<xdr:oneCellAnchor><xdr:from>[\s\S]*?<xdr:row>)7(<)/, '$15$2'));
    const bad = await z.generateAsync({ type: 'uint8array' });
    const r = oracle(src, bad, '평가표', 5, 2, [2, 6]);
    expect(r.out?.same).toBe(false);
    expect(r.rc).toBe(1);
  }, 240_000);
});

describe.skipIf(!on || !priv || !existsSync(join(priv ?? '', 'S11.xlsx')))('엑셀 COM 오라클 — 실서식', () => {
  it('S11 at=7 한 행: 도형 930개 위치가 엑셀 행 삽입과 같다(외부 연결은 양쪽에서 뺌)', async () => {
    // S11 은 .xls 변환본이라 외부 연결 2개의 시트 이름이 깨져(「.xls].xls]…」) 엑셀이 원본부터 열지 못한다(261126 실측).
    // 변환 단계 결함(설계 §7 후속)이라 여기선 양쪽에서 외부 연결만 빼고 도형·병합·인쇄를 대조한다.
    const src = new Uint8Array(readFileSync(join(priv!, 'S11.xlsx')));
    const ours = await fill(src, { sheet: '3-3 위험성평가(1)', startRow: 7, columns: { G: 'g' }, data: [{ g: '합성 시험' }], overflow: 'insertRows' });
    const r = oracle(await dropExternalLinks(src), await dropExternalLinks(ours), '3-3 위험성평가(1)', 7, 1, [7, 7]);
    expect(r.err).toBe('');
    expect(r.out, JSON.stringify(r.out?.diffs)).toMatchObject({ same: true });
  }, 600_000);

  it('S09 at=20 한 행: 바닥글·병합·인쇄영역이 엑셀 행 삽입과 같다', async () => {
    const src = new Uint8Array(readFileSync(join(priv!, 'S09.xlsx')));
    const ours = await fill(src, { sheet: '체크리스트 위험성평가', startRow: 20, columns: { D: 'd' }, data: [{ d: '합성 시험' }], overflow: 'insertRows' });
    const r = oracle(src, ours, '체크리스트 위험성평가', 20, 1, [20, 20]);
    expect(r.err).toBe('');
    expect(r.out, JSON.stringify(r.out?.diffs)).toMatchObject({ same: true });
  }, 600_000);
});
