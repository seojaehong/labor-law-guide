// 사업장 규모별 사업주 의무(/duties)에서 고른 규모에 무엇을 보여 줄지 — 화면(DutiesClient)과 MCP 도구가 같이 쓴다.
import { DUTIES, TIERS, type Duty, type TierMin } from '@/content/duties-data';

export const TIER_MINS = TIERS.map((t) => t.min) as TierMin[];

/** 고른 규모에서 적용되는 이행 방법 — by 의 키 중 고른 규모 이하에서 가장 큰 것 */
export function howAt(d: Duty, tier: TierMin): string | null {
  if (!d.by) return null;
  const keys = (Object.keys(d.by).map(Number) as TierMin[]).filter((k) => k <= tier).sort((a, b) => b - a);
  return keys.length ? d.by[keys[0]] ?? null : null;
}

export interface DutiesAt {
  /** 이 규모에 적용되는 의무 */
  applies: Duty[];
  /** 이 규모부터 새로 생기는 의무(1~4명 구간은 없음) */
  fresh: Duty[];
  /** 이 규모에서 이행 방법이 바뀌는 의무(1~4명 구간은 없음) */
  changedHere: Duty[];
  /** 다음 규모 구간 — 맨 위 구간이면 undefined */
  nextMin: TierMin | undefined;
  /** 다음 규모에서 새로 생기는 의무 */
  upcoming: Duty[];
  /** 다음 규모에서 이행 방법이 바뀌는 의무 */
  changedHow: Duty[];
}

export function dutiesAt(tier: TierMin): DutiesAt {
  const applies = DUTIES.filter((d) => d.min <= tier);
  const nextMin = TIER_MINS.find((m) => m > tier);
  return {
    applies,
    fresh: applies.filter((d) => d.min === tier && tier !== 1),
    changedHere: tier !== 1 ? DUTIES.filter((d) => d.by?.[tier]) : [],
    nextMin,
    upcoming: nextMin ? DUTIES.filter((d) => d.min === nextMin) : [],
    changedHow: nextMin ? DUTIES.filter((d) => d.by?.[nextMin]) : [],
  };
}
