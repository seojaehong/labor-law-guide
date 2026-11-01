// 단시간 법리 D1·D2 (261101 재홍님 승인).
// D1 — 최저임금 비교시간에 유급 주휴시간을 넣는다(최저임금법 시행령 §5①3호, 근로기준법 §55①·§18③).
//      산출근거 basis_hours 가 「주 소정시간×4.345」에 그치고 주휴수당 항목이 없으면 (소정+주휴)×4.345 로 나눠 비교.
// D2 — 단시간 소정 초과 근로에는 통상임금 50% 이상 가산(기간제법 §6③). 가산 항목이 없으면 리스크.
// 시험값은 전부 가상값이다.

import { describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { amendmentMap } from '@/lib/contract-check/present';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const raw = (id: string) =>
  clone((casesJson as unknown as Contract[]).find((c) => c.contract_id === id)!);
const run = (c: Contract) => {
  const [n] = normalize(c);
  const findings = checkContract(n);
  return { n, findings, get: (code: string) => findings.find((f) => f.rule_code === code) as Finding };
};

/** 주 days 일, 하루 start~end(휴게 없음), 기본급 = 10,320 × basis_hours */
function partTime(days: number, start: string, end: string, basisHours: number, extra: WageItem[] = []) {
  const c = raw('syn-part-nosched-0002');
  c.contract_id = 'syn-test';
  c.work_time = { ...c.work_time, days_per_week: days, start, end, breaks: [], daily_schedules: null };
  c.wage.items = [
    { code: 'BASE', label: '기본급', amount: Math.round(10320 * basisHours), basis_hours: basisHours },
    ...extra,
  ];
  return c;
}

describe('D1 단시간 최저임금 비교시간 — 유급 주휴시간 포함', () => {
  it('0002(주 20H, 기본급 87H분, 주휴 항목 없음) → 위반, (20+4)×4.345=104.3H 로 나눈다', () => {
    const f = run(raw('syn-part-nosched-0002')).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('104.3H');
    expect(f.detail).toContain('8,608');
    expect(f.statute).toContain('시행령 §5①');
  });

  it('0004(소정 20H daily_schedules, 실근로 35H) → 위반 — 소정은 실근로가 아니라 근로일별 시간 합', () => {
    const f = run(raw('syn-part-ot-0004')).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('104.3H');
  });

  it('주 15시간 미만(주 14H) → 주휴 없음, 근로시간분 그대로 적정', () => {
    const f = run(partTime(2, '09:00', '16:00', 60.83)).get('MINWAGE');
    expect(f.status).toBe('ok');
  });

  it('주 15시간 경계(주 15H) → 주휴 3H 포함 78.2H 로 나눠 위반', () => {
    const f = run(partTime(3, '09:00', '14:00', 65.18)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('78.2H');
  });

  it('주휴수당 항목이 따로 있으면 적정', () => {
    const c = raw('syn-part-nosched-0002');
    c.wage.items!.push({ code: 'OTHER', label: '주휴수당', amount: 179361, basis_hours: 17.38 });
    expect(run(c).get('MINWAGE').status).toBe('ok');
  });

  it('산출근거가 주휴 포함 시간(105H)이면 적정', () => {
    expect(run(partTime(5, '09:00', '13:00', 105)).get('MINWAGE').status).toBe('ok');
  });

  it('수정 방향 — 주휴시간 포함 월 시간과 주휴수당 항목을 말한다', () => {
    const { n, findings } = run(raw('syn-part-nosched-0002'));
    const a = amendmentMap(n, findings)['MINWAGE'];
    expect(a).toContain('104.3H');
    expect(a).toContain('주휴수당');
    expect(a).not.toContain('209H');
  });
});

describe('D2 단시간 소정 초과 근로 — 50% 가산', () => {
  /** 0004 에서 근로일별 시간만 10~15시(소정 25H)로 바꿔 초과 10H(한도 안)로 만든다 */
  const within = (extra: WageItem[] = []) => {
    const c = raw('syn-part-ot-0004');
    c.work_time.daily_schedules = c.work_time.daily_schedules!.map((s) => ({ ...s, end: '15:00' }));
    c.wage.items = [...c.wage.items!, ...extra];
    return c;
  };

  it('0004(초과 15H) → 위반 유지, 가산 항목 없음도 함께 적는다', () => {
    const f = run(raw('syn-part-ot-0004')).get('PART-TIME-OT');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('초과 15H > 한도 12H');
    expect(f.detail).toContain('가산');
    expect(f.statute).toContain('§6');
  });

  it('초과 10H(한도 안) + 가산 항목 없음 → 리스크', () => {
    const f = run(within()).get('PART-TIME-OT');
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('초과 10H');
  });

  it('초과 10H + 가산 항목(OT_WEEKDAY ×1.5) → 적정', () => {
    const ot: WageItem = { code: 'OT_WEEKDAY', label: '초과근로수당', amount: 672600, basis_hours: 43.45, rate_multiplier: 1.5 };
    expect(run(within([ot])).get('PART-TIME-OT').status).toBe('ok');
  });

  it('가산율이 1.5 미만이면 가산 항목으로 보지 않는다', () => {
    const ot: WageItem = { code: 'OT_WEEKDAY', label: '초과근로수당', amount: 448400, basis_hours: 43.45, rate_multiplier: 1.0 };
    expect(run(within([ot])).get('PART-TIME-OT').status).toBe('risk');
  });

  it('수정 방향 — 50% 가산 문구', () => {
    const { n, findings } = run(within());
    expect(amendmentMap(n, findings)['PART-TIME-OT']).toContain('50%');
  });
});
