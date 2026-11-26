// 실서식 열기 확인 — KLABOR_PRIVATE_XLSX_DIR 가 있을 때만 돈다(실서식은 저장소에 두지 않는다).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';

const dir = process.env.KLABOR_PRIVATE_XLSX_DIR;
const files = dir && existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.xlsx')) : [];

describe.skipIf(files.length === 0)('실서식 열기', () => {
  for (const f of files) {
    it(f, async () => {
      const r = await inspectXlsx(new Uint8Array(readFileSync(join(dir!, f))));
      expect(r.reason).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.sheets.length).toBeGreaterThan(0);
    });
  }
});
