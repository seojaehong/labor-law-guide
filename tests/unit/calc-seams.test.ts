import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { HTML } from '../../scripts/build-severance-engine.mjs';
import { calcSeverance, checkMinWage as chatMinWage } from '@/lib/labor-calc';
import { severanceCalculatorLink } from '@/lib/chat/severance-link';
import { executeTool } from '@/lib/chat/tools/execute';
import { TOOLS } from '@/lib/chat/tools/definitions';
import { calcNoticePay } from '@/lib/calc/notice-pay';
import { TOOLS as REGISTRY } from '@/content/tools-registry';

// interrogate(#104~#109) 지적 — 엔진은 맞는데 엔진과 화면·챗봇이 만나는 이음새가 어긋났다.

const html = readFileSync(HTML, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(script, context);
const run = <T,>(expr: string): T => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context));

describe('챗봇 → 퇴직금 계산기 링크', () => {
  const args = {
    hire_date: '2023-01-01',
    last_work_date: '2025-12-31',
    wages_3months: [3_000_000, 3_000_000, 3_000_000] as [number, number, number],
    annual_bonus: 1_200_000,
    annual_leave_pay: 400_000,
  };

  it('링크로 연 계산기가 챗봇 답과 같은 금액을 낸다(퇴직일 = 마지막 근무일 다음 날)', () => {
    const p = new URL(severanceCalculatorLink(args)!).searchParams;
    expect(p.get('end')).toBe('2026-01-01');
    const r = run<{ severancePay: number }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'${p.get('start')}',endDate:'${p.get('end')}',wage1:'${p.get('w1')}',wage2:'${p.get('w2')}',wage3:'${p.get('w3')}',bonusTotal:'${p.get('bonusTotal')}',annualLeave:'${p.get('annualLeave') ?? 0}'})`,
    );
    expect(r.severancePay).toBe(calcSeverance(args).severance_pay);
  });

  it('?run=1 은 실제로 있는 계산 함수를 부른다', () => {
    expect(html).not.toMatch(/typeof calculate === 'function'/);
    expect(run<string>('typeof onCalculate')).toBe('function');
  });
});

describe('챗봇 최저임금 — rates.ts 와 정본 엔진', () => {
  it('2027년은 10,700원으로 본다', () => {
    const r = chatMinWage({ base_pay: 2_200_000, year: 2027 });
    expect(r.min_hourly).toBe(10_700);
    expect(r.ok).toBe(false);
    expect(r.shortfall).toBe(36_300);
    expect(r.legal_basis).toContain('2027');
  });

  it('고시가 없는 해는 다른 해 값으로 대신하지 않는다', () => {
    expect(() => chatMinWage({ base_pay: 2_200_000, year: 2025 })).toThrow();
  });

  it('주 소정근로시간을 받으면 주휴까지 시행령대로 센다', () => {
    expect(chatMinWage({ base_pay: 1_100_000, year: 2026, weekly_hours: 20 }).ok).toBe(true);
  });
});

describe('챗봇 도구 오류는 답변을 죽이지 않는다', () => {
  it('엔진이 던지면 { error } 로 돌려준다', async () => {
    const r = (await executeTool('calc_severance', { hire_date: '2023.1.1', last_work_date: '2025-12-31', wages_3months: [1, 1, 1] })) as { error?: string };
    expect(r.error).toBeTruthy();
  });
});

describe('해고예고 3개월 경계 — 같은 날이 없으면 그 달 말일(민법 §160③)', () => {
  const base = { unit: 'month' as const, amount: 2_156_880, weeklyHours: 40, dailyHours: 8 };
  it.each([
    ['2025-11-30', '2026-02-28'],
    ['2026-01-31', '2026-04-30'],
    ['2026-08-31', '2026-11-30'],
    ['2026-09-01', '2026-11-30'],
    ['2025-11-29', '2026-02-28'],
    ['2023-11-30', '2024-02-29'],
  ])('%s 입사 → %s 부터 수당이 있다', (hire, first) => {
    expect(calcNoticePay({ ...base, hireDate: hire, dismissalDate: first }).status).toBe('pay');
    const before = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    expect(calcNoticePay({ ...base, hireDate: hire, dismissalDate: before }).status).toBe('under3m');
  });

  it('금액 = 화면에 보이는 1일 통상임금 × 30', () => {
    const r = calcNoticePay({ unit: 'month', amount: 2_500_000, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30' });
    expect(r.dailyOrdinary).toBe(95_694);
    expect(r.amount).toBe(95_694 * 30);
  });
});

describe('퇴직소득세', () => {
  it('계산기 세율표 — 3억 초과 구간 누진 누계', () => {
    expect(run<number>('calcIncomeTaxByRate(400000000)')).toBe(134_060_000);
    expect(run<number>('calcIncomeTaxByRate(800000000)')).toBe(300_060_000);
    expect(run<number>('calcIncomeTaxByRate(1200000000)')).toBe(474_060_000);
  });

  it('근속연수는 챗봇과 계산기가 같은 날까지 센다', () => {
    const r = calcSeverance({ hire_date: '2023-01-01', last_work_date: '2026-01-01', wages_3months: [3_000_000, 3_000_000, 3_000_000], include_tax: true });
    expect(r.tax!.service_years).toBe(run<number>(`calcServiceYears('2023-01-01','2026-01-02')`));
    expect(r.tax!.service_years).toBe(4);
  });
});

describe('1년 판정은 엔진 하나', () => {
  it('계산기 경고 — 2023.3.1 입사 · 퇴직일 2024.2.29 는 1년 미만', () => {
    expect(run<boolean>(`isUnderOneYear('2023-03-01','2024-02-29')`)).toBe(true);
    expect(run<boolean>(`isUnderOneYear('2023-03-01','2024-03-01')`)).toBe(false);
  });

  it('챗봇 결과에 1년 여부가 실린다', () => {
    const r = calcSeverance({ hire_date: '2026-01-01', last_work_date: '2026-06-30', wages_3months: [3_000_000, 3_000_000, 3_000_000] });
    expect(r.eligible).toBe(false);
    expect(r.legal_basis).toContain('1년 미만');
  });
});

describe('산정기간이 2구간 이하이면 없는 구간 임금을 더하지 않는다', () => {
  it('입사 2026.3.15 · 퇴직일 2026.5.1', () => {
    const r = run<{ wageSum: number }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'2026-03-15',endDate:'2026-05-01',wage1:'3000000',wage2:'3000000',wage3:'3000000'})`,
    );
    expect(r.wageSum).toBe(6_000_000);
  });
});

describe('없어진 산식 설명', () => {
  it('「윤년 고려 정밀 재직」이 남지 않는다', () => {
    expect(html).not.toMatch(/윤년을 고려한 정밀/);
    expect(REGISTRY.find((t) => t.href === '/tools/severance.html')!.desc).not.toMatch(/윤년/);
    expect(JSON.stringify(TOOLS)).not.toMatch(/윤년|fraction/);
    expect(calcSeverance({ hire_date: '2023-01-01', last_work_date: '2025-12-31', wages_3months: [1, 1, 1] })).not.toHaveProperty('service_fraction');
  });

  it('연차수당 인자는 퇴직 전 1년 동안 받은 총액이다', () => {
    const sev = TOOLS.find((t) => t.function.name === 'calc_severance')!.function.parameters.properties as unknown as Record<string, { description?: string }>;
    expect(sev.annual_leave_pay.description).toMatch(/퇴직 전 1년/);
    expect(sev).not.toHaveProperty('unused_annual_leave_days');
  });
});
