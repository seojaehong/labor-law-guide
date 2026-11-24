import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtDate, fmtDateWithYear } from '@/lib/tool-kit';

// /tools/notice-pay 「입사 2023년 3월 1일(수) · 해고 10월 31일(토)」 — 올해 날짜만 해가 빠져 두 날짜의 해가 엇갈려 보였다(261112).
describe('fmtDateWithYear', () => {
  it('always shows the year, even for this year', () => {
    expect(fmtDateWithYear('2026-10-31')).toBe('2026년 10월 31일(토)');
    expect(fmtDateWithYear('2023-03-01')).toBe('2023년 3월 1일(수)');
  });
  it('leaves the shared fmtDate unchanged', () => {
    expect(fmtDate('2026-10-31', '2026-11-12')).toBe('10월 31일(토)');
    expect(fmtDate('2023-03-01', '2026-11-12')).toBe('2023년 3월 1일(수)');
  });
  it('is used for the notice-pay 입사 · 해고 line', () => {
    // 261124 — 결과 문장은 공용 결과 블록의 글자 모델(notice-pay/result.ts)로 옮겼다
    const src = readFileSync('src/app/tools/notice-pay/result.ts', 'utf8');
    expect(src).toContain('입사 ${fmtDateWithYear(hire)} · 해고 ${fmtDateWithYear(dismissal)}');
  });
});
