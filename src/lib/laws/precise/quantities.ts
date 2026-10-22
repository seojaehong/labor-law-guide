// 정밀 점검 — 조문 속 수치(일·주·개월·년·시간·%)를 뽑아 종전보다 줄어든 단위를 불이익변경 신호로 돌려준다.
// 기준 구현은 scripts/work_rules_c/quantities.py 다.
import type { ArticlePair } from './articles';

export interface Quantity {
  value: number;
  unit: string;
}

export interface Drop {
  unit: string;
  oldMax: number;
  newMax: number;
}

const REF = /제\s*\d+\s*(?:조(?:\s*의\s*\d+)?|항|호)/g;
const FRACTION = /100\s*분\s*의\s*(\d+(?:\.\d+)?)/g;
const NUMBER = /(\d+(?:\.\d+)?)\s*(퍼센트|%|개월|시간|일|주|년)/g;
const DAYS: Record<string, number> = { 년: 365, 개월: 30, 주: 7, 일: 1 };
const blank = (s: string) => ' '.repeat(s.length);

export function extractQuantities(text: string): Quantity[] {
  let t = text.replace(REF, blank);
  const found: [number, Quantity][] = [];
  for (const m of t.matchAll(FRACTION)) found.push([m.index!, { value: Number(m[1]), unit: '%' }]);
  t = t.replace(FRACTION, blank);
  for (const m of t.matchAll(NUMBER)) {
    const value = Number(m[1]);
    const unit = m[2] === '퍼센트' ? '%' : m[2];
    if (unit === '년' && value >= 1900) continue; // 연도는 수량이 아니다
    found.push([m.index!, { value, unit }]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, q]) => q);
}

const group = (unit: string) => (unit in DAYS ? '기간' : unit);

/** 단위 무리별로 (비교값, 원래 수치) — 기간은 일수로 바꿔 비교한다. */
function values(text: string): Map<string, [number, Quantity][]> {
  const out = new Map<string, [number, Quantity][]>();
  for (const q of extractQuantities(text)) {
    const g = group(q.unit);
    out.set(g, [...(out.get(g) ?? []), [q.value * (DAYS[q.unit] ?? 1), q]]);
  }
  for (const vs of out.values()) vs.sort((a, b) => b[0] - a[0]);
  return out;
}

/** 종전 수치를 큰 것부터 개정안 수치와 하나씩 맞대 보아, 작아지거나 사라진 첫 수치를 무리마다 하나 돌려준다. */
export function quantityDrops(pair: ArticlePair): Drop[] {
  if (pair.status !== '변경' || !pair.old || !pair.new) return [];
  const old = values(pair.old.body);
  const neu = values(pair.new.body);
  const drops: Drop[] = [];
  for (const [g, ovs] of old) {
    const nvs = neu.get(g) ?? [];
    for (let i = 0; i < ovs.length; i++) {
      const [ov, oq] = ovs[i];
      const nv = i < nvs.length ? nvs[i][0] : 0;
      if (nv < ov) {
        const factor = DAYS[oq.unit] ?? 1;
        drops.push({ unit: oq.unit, oldMax: oq.value, newMax: Math.round((nv / factor) * 100) / 100 });
        break;
      }
    }
  }
  return drops;
}
