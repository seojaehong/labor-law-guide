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
