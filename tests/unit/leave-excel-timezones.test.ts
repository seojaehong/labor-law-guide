import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('real ExcelJS date serial round-trip', () => {
  for (const timezone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles']) {
    it(`preserves date-only cells in ${timezone}`, () => {
      const result = spawnSync(process.execPath, ['tests/fixtures/leave-excel-date-roundtrip.mjs'], {
        env: { ...process.env, TZ: timezone }, encoding: 'utf8', timeout: 15000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).dates).toEqual(['2019-03-02', '2024-02-29', '2026-10-05']);
    });
  }
});
