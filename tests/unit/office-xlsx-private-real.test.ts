// 실서식 회귀 — KLABOR_PRIVATE_XLSX_DIR 가 있을 때만 돈다(실서식은 저장소에 두지 않는다).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';

const dir = process.env.KLABOR_PRIVATE_XLSX_DIR;
const files = dir && existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.xlsx')) : [];

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(bytes);
  const out = new Map<string, Uint8Array>();
  for (const f of Object.values(zip.files)) if (!f.dir) out.set(f.name, await f.async('uint8array'));
  return out;
}
const same = (a?: Uint8Array, b?: Uint8Array) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

describe.skipIf(files.length === 0)('실서식', () => {
  for (const f of files) {
    it(`${f} — 열기`, async () => {
      const r = await inspectXlsx(new Uint8Array(readFileSync(join(dir!, f))));
      expect(r.reason).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.sheets.length).toBeGreaterThan(0);
    });

    it(`${f} — 칸 하나 패치: 시트 하나만 바뀌고 나머지 부품 바이트 동일, 보존 allSame`, async () => {
      const input = new Uint8Array(readFileSync(join(dir!, f)));
      const info = await inspectXlsx(input);
      const sheet = info.sheets[0].name;
      // 사용 범위 밖 먼 칸(병합·수식이 없을 자리)
      const r = await fillXlsxTemplate(input, { cells: [{ sheet, cell: 'XFA1048000', value: '합성 시험' }] });
      expect(r.reason).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.changedCells).toHaveLength(1);
      expect(r.preserved!.allSame).toBe(true);
      const before = await unzip(input);
      const after = await unzip(r.bytes!);
      expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
      const changed = [...before].filter(([k, v]) => !same(v, after.get(k))).map(([k]) => k);
      expect(changed).toHaveLength(1);
      expect(changed[0]).toMatch(/^xl\/worksheets\//);
    });
  }
});

// 닫힌 밀기(§2-5b) 실서식 합격 조건 — 파일 이름이 S09.xlsx·S11.xlsx 일 때만(설계 v2.1 §2-5b 「검증 추가」)
const has = (n: string) => files.includes(n);
const anchorRows = (xml: string) =>
  [...xml.matchAll(/<(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</g)].map((m) => Number(m[1]));
const dec = new TextDecoder();

describe.skipIf(!has('S11.xlsx'))('실서식 S11 — 도형 고정점 밀기', () => {
  it('at=7 한 행: 고정점 714 이동 / 216 고정, 다른 drawing 바이트 동일, 보존 allSame', async () => {
    const input = new Uint8Array(readFileSync(join(dir!, 'S11.xlsx')));
    const r = await fillXlsxTemplate(input, {
      rows: { sheet: '3-3 위험성평가(1)', startRow: 7, columns: { G: 'g' }, data: [{ g: '합성 시험' }], overflow: 'insertRows' },
    });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
    expect(r.preserved!.allSame).toBe(true);
    const before = await unzip(input);
    const after = await unzip(r.bytes!);
    const drawings = [...before.keys()].filter((k) => /^xl\/drawings\/drawing\d+\.xml$/.test(k));
    const changed = drawings.filter((k) => !same(before.get(k), after.get(k)));
    expect(changed).toHaveLength(1);
    const a = anchorRows(dec.decode(before.get(changed[0])));
    const b = anchorRows(dec.decode(after.get(changed[0])));
    expect(b).toHaveLength(a.length);
    const moved = a.filter((x, i) => b[i] === x + 1).length;
    const fixed = a.filter((x, i) => b[i] === x).length;
    expect({ moved, fixed }).toEqual({ moved: 714, fixed: 216 });
  });
});

describe.skipIf(!has('S09.xlsx'))('실서식 S09 — 바닥글 밀기', () => {
  const run = async (at: number) =>
    fillXlsxTemplate(new Uint8Array(readFileSync(join(dir!, 'S09.xlsx'))), {
      rows: { sheet: '체크리스트 위험성평가', startRow: at, columns: { D: 'd' }, data: [{ d: '합성 시험' }], overflow: 'insertRows' },
    });
  it('at=20: 바닥글을 21행으로 밀고 인쇄영역 끝을 늘린다', async () => {
    const r = await run(20);
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
    expect(r.preserved!.printArea.after['체크리스트 위험성평가']).toBe('B2:L20');
    expect(r.preserved!.allSame).toBe(true);
  });
  it('at=21: 바닥글 아래 덧붙이고 인쇄영역 밖이라 경고', async () => {
    const r = await run(21);
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("PRINT_AREA_NOT_EXTENDED");
  });
});
