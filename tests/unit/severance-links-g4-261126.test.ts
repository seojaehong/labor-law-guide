// 261126 G4 검수(PR #298) I16(O7·A2) — 계산기가 ?weeklyHours= 를 받게 됐는데 계산기로 넘기는 형제 링크(/exit·챗봇)가
// 그 값을 싣지 않아, 넘어간 계산기는 늘 「지급 대상인지는 따지지 않았습니다」(hours-unknown)였다.
// (갱신 261126 재홍님 결정 D2) weekly_hours 는 이제 챗봇 계산(status·eligible)에도 쓰인다 — tests/unit/severance-d2d3-261126.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { severanceCalculatorLink } from '@/lib/chat/severance-link';
import { TOOLS } from '@/lib/chat/tools/definitions';
import { calcSeverance } from '@/lib/labor-calc';
import { estimateSeverance, severanceCheck } from '@/app/exit/exit-calc';
import { exitResultView } from '@/app/exit/result';

const ARGS = { hire_date: '2025-01-01', last_work_date: '2025-12-31', wages_3months: [2_000_000, 2_000_000, 2_200_000] as [number, number, number] };

describe('챗봇 계산기 링크', () => {
  it('weekly_hours 를 받으면 링크에 weeklyHours 를 싣는다', () => {
    const p = new URL(severanceCalculatorLink({ ...ARGS, weekly_hours: 12 })!).searchParams;
    expect(p.get('weeklyHours')).toBe('12');
    expect(p.get('run')).toBe('1');
  });
  it('4주 평균 소수(17.5)도 그대로 싣는다', () => {
    expect(new URL(severanceCalculatorLink({ ...ARGS, weekly_hours: 17.5 })!).searchParams.get('weeklyHours')).toBe('17.5');
  });
  // 261127 G4 R20 — 0 은 싣는다(챗봇 답 under-15h 와 같은 입력). 기대값은 severance-r2-261127.test.ts
  it('없거나 숫자가 아니거나 0~168 밖이면 싣지 않는다(종전 링크 그대로)', () => {
    for (const w of [undefined, '40', -3, 169, Number.NaN]) {
      expect(new URL(severanceCalculatorLink({ ...ARGS, weekly_hours: w })!).searchParams.has('weeklyHours')).toBe(false);
    }
  });
  it('도구 정의에 선택 인자 weekly_hours 가 있다(필수 아님)', () => {
    const fn = TOOLS.find((t) => t.function.name === 'calc_severance')!.function;
    const props = fn.parameters.properties as unknown as Record<string, { type?: string; description?: string }>;
    expect(props.weekly_hours?.type).toBe('number');
    expect(props.weekly_hours?.description).toMatch(/계산기 링크/);
    expect((fn.parameters as unknown as { required: string[] }).required).not.toContain('weekly_hours');
  });
  it('weekly_hours 는 금액을 바꾸지 않고 지급 대상만 가른다(261126 D2)', () => {
    const withHours = calcSeverance({ ...ARGS, weekly_hours: 12 });
    const without = calcSeverance(ARGS);
    expect(withHours.severance_pay).toBe(without.severance_pay);
    expect([withHours.status, without.status]).toEqual(['under-15h', 'hours-unknown']);
  });
});

describe('/exit 계산기 링크', () => {
  const hire = '2023-03-02';
  const last = '2026-11-30';
  const view = (weeklyHours?: number) =>
    exitResultView({ check: severanceCheck(hire, last, weeklyHours ?? 40), sev: estimateSeverance(hire, last, 3_000_000), lv: null, ent: null, weeklyHours });
  it('주 시간을 넣었으면 「퇴직금 계산기로 자세히 계산」 링크에 weeklyHours 를 싣는다', () => {
    const link = view(30).next.find((n) => n.label === '퇴직금 계산기로 자세히 계산')!;
    expect(link.href).toBe('/tools/severance.html?weeklyHours=30');
  });
  it('주 시간이 없으면 종전 링크', () => {
    expect(view(undefined).next.find((n) => n.label === '퇴직금 계산기로 자세히 계산')!.href).toBe('/tools/severance.html');
  });
  it('화면이 입력한 주 시간을 넘긴다', () => {
    const client = readFileSync(resolve('src/app/exit/ExitClient.tsx'), 'utf8');
    expect(client).toMatch(/exitResultView\(\{[^}]*weeklyHours: input\.weeklyHours/);
  });
});
