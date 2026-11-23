import { describe, expect, it } from 'vitest';
import * as C from '@/app/sanction-cases/copy';
import { LONG_NOTE, SANCTION_FONTS } from '@/lib/sanction-export';
import { bannedHits } from '@/lib/tool-kit/banned';

const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

describe('양정 판결 골라 내려받기 화면 문구', () => {
  it('공개 금지어가 없다(화면 문구·안내 문단·글꼴 이름)', () => {
    const all = [...strings(C), LONG_NOTE, ...SANCTION_FONTS.map((f) => f.label)];
    expect(all.length).toBeGreaterThan(20);
    for (const s of all) expect(bannedHits(s), s).toEqual([]);
  });
});
