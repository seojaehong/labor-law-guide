import { describe, expect, it } from 'vitest';
import { DUTIES, TIERS } from '@/content/duties-data';

// 계단 도식이 말하려는 것 — 5인을 넘는 순간 의무가 한꺼번에 늘어난다.
// 그림은 데이터에서 그대로 계산하므로, 데이터가 바뀌면 이 시험이 먼저 알려 준다.
const bars = TIERS.map((t, i) => {
  const total = DUTIES.filter(d => d.min <= t.min).length;
  const prev = i === 0 ? 0 : DUTIES.filter(d => d.min <= TIERS[i - 1].min).length;
  return { label: t.label, min: t.min, total, added: total - prev };
});

describe('규모 계단', () => {
  it('누적 수는 줄어들지 않는다', () => {
    for (let i = 1; i < bars.length; i++) expect(bars[i].total).toBeGreaterThanOrEqual(bars[i - 1].total);
  });

  it('마지막 칸이 전체 의무 수와 같다', () => {
    expect(bars[bars.length - 1].total).toBe(DUTIES.length);
  });

  it('5인 경계에서 가장 많이 늘어난다 — 그림이 말하려는 것', () => {
    const five = bars.find(b => b.min === 5)!;
    const others = bars.filter(b => b.min > 5);
    expect(five.added).toBeGreaterThan(0);
    for (const o of others) expect(five.added).toBeGreaterThan(o.added);
  });

  it('첫 칸은 규모 무관 의무만 센다', () => {
    expect(bars[0].total).toBe(DUTIES.filter(d => d.min === 1).length);
  });
});
