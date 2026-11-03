import { describe, expect, it } from 'vitest';
import { DUTIES } from '@/content/duties-data';
import { dutiesAt, howAt, TIER_MINS } from '@/lib/duties';

// /duties 화면과 korea-labor-mcp list_employer_duties 가 같이 쓰는 고르기 규칙
describe('dutiesAt', () => {
  it('규모마다 적용 = min 이하 · 새로 생김 = min 이 그 규모(1~4명 제외) · 다음 규모 목록', () => {
    for (const tier of TIER_MINS) {
      const at = dutiesAt(tier);
      expect(at.applies).toEqual(DUTIES.filter((d) => d.min <= tier));
      expect(at.fresh).toEqual(tier === 1 ? [] : DUTIES.filter((d) => d.min === tier));
      const next = TIER_MINS.find((m) => m > tier);
      expect(at.nextMin).toBe(next);
      expect(at.upcoming).toEqual(next ? DUTIES.filter((d) => d.min === next) : []);
    }
  });

  it('맨 위 규모(50명 이상)는 다음 규모가 없다', () => {
    const at = dutiesAt(50);
    expect(at.nextMin).toBeUndefined();
    expect(at.upcoming).toEqual([]);
    expect(at.changedHow).toEqual([]);
  });

  it('howAt — by 의 키 중 고른 규모 이하에서 가장 큰 것', () => {
    const d = DUTIES.find((x) => x.by && Object.keys(x.by).length > 0);
    if (!d) return;
    const keys = Object.keys(d.by!).map(Number).sort((a, b) => a - b);
    expect(howAt(d, 50)).toBe(d.by![keys[keys.length - 1] as 1]);
  });
});
