// 근로계약서 작성 — 실수령액 → 월 임금 총액(세전).
// 실수령액 계산은 사이트 실수령액 도구와 같은 함수(src/lib/calc/take-home-pay.ts)를 쓴다 — 4대보험 근로자 몫·간이세액표·지방소득세.
// HRMS net_to_gross.py 처럼 이분 탐색으로 「실수령액이 목표 이상이 되는 가장 작은 총액」을 찾는다.
// 간이세액표 구간 경계에서 실수령액이 총액에 대해 단조가 아니므로, 찾은 값 아래를 한 번 더 훑는다.
// 비과세(식대 등)는 넣지 않는다 — 임금 구성 항목이 전부 과세 급여다.

import { calcTakeHomePay, takeHomeRatesOn } from '@/lib/calc/take-home-pay';

export interface NetToGrossResult {
  gross: number;
  takeHome: number;
  deduction: number;
}

const MAX = 10_000_000;
/** 찾은 총액 아래로 다시 훑는 폭 — 간이세액표 한 구간(1만~2만원)보다 넓게 */
const BACKSCAN = 30_000;

export function netToGross(net: number, opts: { family: number; children?: number; date: string }): NetToGrossResult {
  const rates = takeHomeRatesOn(opts.date);
  if (!rates) throw new Error(`${opts.date} 기준 보험료율이 없어 계산할 수 없습니다`);
  if (!Number.isInteger(net) || net <= 0) throw new Error('실수령액을 원 단위로 넣어 주세요');
  const take = (pay: number): number | null => {
    try {
      const r = calcTakeHomePay({ pay, family: opts.family, children: opts.children ?? 0 }, rates);
      return r.status === 'ok' ? r.takeHome : null;
    } catch {
      return null;
    }
  };
  const top = take(MAX);
  if (top === null || top < net) throw new Error('실수령액이 너무 커서 간이세액표 범위(월 1,000만원) 안에서 찾을 수 없습니다');
  let lo = net;
  let hi = MAX;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = take(mid);
    if (t !== null && t >= net) hi = mid;
    else lo = mid + 1;
  }
  let gross = lo;
  for (let p = Math.max(net, lo - BACKSCAN); p < lo; p += 1) {
    const t = take(p);
    if (t !== null && t >= net) {
      gross = p;
      break;
    }
  }
  const takeHome = take(gross)!;
  return { gross, takeHome, deduction: gross - takeHome };
}
