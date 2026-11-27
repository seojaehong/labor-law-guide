import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { calcRetirementTax, withholdingFor } from '@/lib/calc/retirement-tax';
import { headline } from '@/app/tools/retirement-tax/copy';
import { retirementTaxView } from '@/app/tools/retirement-tax/result';

// 퇴직 세금 표시 P3 #1·#2(261125) — 「산출한 세금」과 「이번 지급 때 떼는 세금」을 가른다.
// #1 소득세법 §86 1호: §127① 각 호 소득(7호 퇴직소득 포함)의 원천징수세액이 1천원 미만이면 징수하지 않는다.
//    지방소득세는 「원천징수하는 소득세」의 10%를 동시에 특별징수한다(지방세법 §103의13①) — 떼는 소득세가 0이면 0.
// #2 소득세법 §146② 1호: 연금계좌로 지급되면 연금외수령 전까지 원천징수하지 않는다.
//    근로자퇴직급여 보장법 §9②: 퇴직금은 IRP 계정 등으로 이전해 지급하는 것이 원칙(55세 이후 퇴직 등 시행령 §3의2 예외).
// 합성 입력: 근속 1년(2025-11-01 ~ 2026-10-31).

const HIRE = '2025-11-01';
const LAST = '2026-10-31';
const tax = (pay: number) => calcRetirementTax({ pay, hireDate: HIRE, lastWorkDate: LAST });

describe('엔진 — 이번 지급 때 떼는 세금(withholdingFor)', () => {
  it('현금 · 산출세액 999원(소득세 990원) → 떼지 않는다(§86)', () => {
    const r = tax(1_708_292);
    expect([r.calculatedTax, r.incomeTax, r.localTax]).toEqual([999, 990, 90]);
    expect(withholdingFor(r, 'cash')).toEqual({ incomeTax: 0, localTax: 0, total: 0, reason: 'small' });
  });

  it('현금 · 산출세액 1,000원 → 소득세 1,000원·지방소득세 100원을 뗀다', () => {
    const r = tax(1_708_334);
    expect(r.calculatedTax).toBe(1_000);
    expect(withholdingFor(r, 'cash')).toEqual({ incomeTax: 1_000, localTax: 100, total: 1_100, reason: null });
  });

  it('현금 · 1,000만원 → 428,750원·42,870원', () => {
    expect(withholdingFor(tax(10_000_000), 'cash')).toEqual({ incomeTax: 428_750, localTax: 42_870, total: 471_620, reason: null });
  });

  it('IRP 이전 · 1,000만원 → 떼지 않는다(§146②1)', () => {
    expect(withholdingFor(tax(10_000_000), 'irp')).toEqual({ incomeTax: 0, localTax: 0, total: 0, reason: 'irp' });
  });

  it('세금이 없으면 이유도 없다', () => {
    expect(withholdingFor(tax(500_000), 'cash')).toEqual({ incomeTax: 0, localTax: 0, total: 0, reason: null });
  });

  it('산출 값(incomeTax·localTax·total)은 그대로 둔다', () => {
    expect(tax(1_700_000)).toMatchObject({ calculatedTax: 800, incomeTax: 800, localTax: 80, total: 880 });
  });
});

describe('퇴직소득세 계산기 문장 — 1천원 미만', () => {
  it('800원이면 「1천원 미만이라 떼지 않습니다(소득세법 제86조)」', () => {
    const h = headline(tax(1_700_000));
    expect(h.join(' ')).toContain('1천원 미만이라 떼지 않습니다(소득세법 제86조)');
    expect(h.join(' ')).not.toMatch(/지방소득세는 80원입니다/);
  });

  it('결과 블록 금액 칸 — 떼는 세금 0원', () => {
    const v = retirementTaxView({ r: tax(1_700_000), hire: HIRE, last: LAST, today: '2026-11-25' });
    expect(v.amounts).toEqual([
      { label: '산출 퇴직소득세', value: '800원' },
      { label: '지급할 때 떼는 세금', value: '0원' },
    ]);
  });

  it('1,000원 이상은 예전 문장 그대로', () => {
    expect(headline(tax(10_000_000))[0]).toBe('예상 퇴직소득세는 428,750원, 지방소득세는 42,870원입니다.');
  });
});

describe('퇴직금 계산기(정적 html) — 받는 방법', () => {
  const html = readFileSync(resolve('public/tools/severance.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const context = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(script, context);
  const run = <T,>(expr: string): T => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context));
  const base = `startDate:'2021-01-04', endDate:'2025-12-31', wage1:'3,000,000', wage2:'3,000,000', wage3:'3,000,000'`;

  it('기본값은 현금 수령(기존 계산기 동작, 261125 결정)', () => {
    expect(run<string>('createDefaultWorker().payout')).toBe('cash');
    expect(html).toMatch(/<option value="cash" selected>/);
  });

  it('IRP 이전 — 세금은 산출해 보여 주되 떼지 않아 이전액 = 퇴직금 전액', () => {
    const r = run<Record<string, unknown>>(`calculateSeverance({...createDefaultWorker(), weeklyHours:'40', ${base}, payout:'irp'})`);
    expect(r).toMatchObject({ payout: 'irp', severancePay: 14_657_832, retirementTax: 151_780, localTax: 15_170, withheldTax: 0, netSeverance: 14_657_832 });
  });

  it('현금 수령 — 세금을 떼고 준다', () => {
    const r = run<Record<string, unknown>>(`calculateSeverance({...createDefaultWorker(), weeklyHours:'40', ${base}})`);
    expect(r).toMatchObject({ payout: 'cash', retirementTax: 151_780, localTax: 15_170, withheldTax: 166_950, netSeverance: 14_490_882 });
  });

  it('현금 수령 · 세금 1천원 미만 — 떼지 않는다(§86)', () => {
    const r = run<Record<string, unknown>>(`calculateSeverance({...createDefaultWorker(), weeklyHours:'40', startDate:'2025-11-01', endDate:'2026-10-31', wage1:'5200000', payout:'cash'})`);
    expect(r).toMatchObject({ severancePay: 1_695_652, retirementTax: 690, localTax: 60, withheldTax: 0, withholdingReason: 'small', netSeverance: 1_695_652 });
  });

  it('받는 방법을 바꾸면 앞 결과를 지운다(입력 서명에 들어간다)', () => {
    const a = run<string>(`workerInputSignature({...createDefaultWorker(), weeklyHours:'40', ${base}})`);
    const b = run<string>(`workerInputSignature({...createDefaultWorker(), weeklyHours:'40', ${base}, payout:'irp'})`);
    expect(a).not.toBe(b);
  });

  it('예전 저장값(받는 방법 없음)은 기본값 현금 수령으로 채운다', () => {
    expect(run<string>(`({...createDefaultWorker(), weeklyHours:'40', ...{ startDate:'2021-01-04' }}).payout`)).toBe('cash');
  });

  it('IRP 결과 블록 — 「IRP 이전액」으로 적고, 나중에 과세 안내', () => {
    const w = `{...createDefaultWorker(), weeklyHours:'40', ${base}, payout:'irp'}`;
    const block = run<string>(`resultBlockHtml(calculateSeverance(${w}), ${w})`);
    expect(block).toContain('IRP 이전액');
    expect(block).toContain('연금계좌에서 나중에 받을 때 과세');
    expect(block).not.toContain('세금을 뺀 실수령 추정');
  });

  it('현금 · 1천원 미만 결과 블록 — 「1천원 미만이라 떼지 않습니다(소득세법 제86조)」', () => {
    const w = `{...createDefaultWorker(), weeklyHours:'40', startDate:'2025-11-01', endDate:'2026-10-31', wage1:'5200000'}`;
    const block = run<string>(`resultBlockHtml(calculateSeverance(${w}), ${w})`);
    expect(block).toContain('1천원 미만이라 떼지 않습니다(소득세법 제86조)');
  });
});
