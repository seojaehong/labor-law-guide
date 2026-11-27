// D4(261126 재홍님 결정) — 세금 계산 도구의 고지를 도구별로 나눈다. 「대신·대행·대리·세무대리」는 계속 쓰지 않는다.
// · 실수령·퇴직소득세·일용근로소득·중도퇴사 정산 = 원천징수와 신고를 하는 사람(원천징수의무자 = 회사)을 밝힌다
// · 3.3% 점검 = 1년 소득을 다시 계산하는 사람은 본인(종합소득세 확정신고) — 같은 화면 MONEY_NOTES 와 같은 말
// · 꼬리말·약관 메타 = 약관 본문 「일반 정보 제공 목적」에 맞춰 「참고 정보」
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RETIREMENT_TAX_NOTICE, WITHHOLDING_NOTICE } from '@/lib/tool-kit/tax-notice';
import { bannedHits } from '@/lib/tool-kit/banned';
import { NOTICE as TAKE_HOME } from '@/app/tools/take-home-pay/copy';
import { NOTICE as DAILY } from '@/app/tools/daily-worker-tax/copy';
import { NOTICE as MIDYEAR } from '@/app/tools/midyear-settlement/copy';
import { MONEY_NOTES, NOTICE as CONTRACTOR } from '@/app/tools/contractor-check/copy';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';
import { registerTax } from '../../tools/k-labor/groups/tax.mjs';

const W = '참고용 계산이며, 원천징수와 신고는 회사(원천징수의무자)가 합니다.';
// F2(261127 재홍님 결정, R29) — 연말정산 대상 사업소득(보험모집인 등)은 예외라 「대개」와 괄호 단서를 단다
const C = '참고용 계산이며, 1년 소득은 대개 다음 해 5월 종합소득세 확정신고에서 본인이 다시 계산합니다(연말정산 대상 사업소득은 예외).';
// F1(261127 재홍님 결정, R28·R27) — 퇴직소득세는 IRP 로 옮기면 과세이연, 나중 인출 때 연금계좌취급자(금융회사)가 뗀다
const R = '참고용 계산이며, 퇴직금을 현금으로 받으면 회사가 원천징수합니다. IRP로 옮기면 나중에 연금계좌에서 찾을 때 금융회사가 뗍니다.';
const NO = ['대신', '대행', '대리', '세무대리'];
const read = (f: string) => readFileSync(f, 'utf8');

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function fakeServer() {
  const tools = new Map<string, Handler>();
  return { tools, registerTool(name: string, _cfg: unknown, handler: Handler) { tools.set(name, handler); }, tool(name: string) { throw new Error(`server.tool() 금지: ${name}`); } };
}
const call = async (s: ReturnType<typeof fakeServer>, name: string, a: Record<string, unknown>) => JSON.parse((await s.tools.get(name)!(a)).content[0].text);

describe('세금 도구 고지 — 원천징수와 신고는 회사(원천징수의무자)', () => {
  it('문구는 결정 그대로이고 금지어가 없다', () => {
    expect(WITHHOLDING_NOTICE).toBe(W);
    expect(bannedHits(W)).toEqual([]);
    expect(bannedHits(W, NO)).toEqual([]);
  });

  it('실수령·일용근로소득·중도퇴사 정산 고지에 든다', () => {
    expect(TAKE_HOME).toContain(W);
    expect(DAILY.join(' ')).toContain(W);
    expect(MIDYEAR.join(' ')).toContain(W);
  });

  it('일용·중도정산 계산 기준 상자가 같은 상수를 쓰고, 옛 문구 「회사가 직접 합니다」가 남지 않는다', () => {
    for (const f of ['src/app/tools/daily-worker-tax/page.tsx', 'src/app/tools/midyear-settlement/page.tsx']) {
      expect(read(f), f).toContain('{WITHHOLDING_NOTICE}');
    }
    for (const f of [
      'src/app/tools/retirement-tax/RetirementTaxClient.tsx', 'src/app/tools/daily-worker-tax/page.tsx', 'src/app/tools/midyear-settlement/page.tsx',
      'src/app/tools/take-home-pay/copy.ts', 'src/app/tools/daily-worker-tax/copy.ts', 'src/app/tools/midyear-settlement/copy.ts', 'src/app/tools/contractor-check/copy.ts',
    ]) {
      expect(read(f), f).not.toContain('회사가 직접 합니다');
    }
  });

  it('주석도 새 뜻으로 — 「세무대리 아님」 고지를 지킨다는 옛 지시가 남지 않는다', () => {
    for (const f of ['src/app/tools/retirement-tax/result.ts', 'src/app/tools/retirement-tax/RetirementTaxClient.tsx']) {
      expect(read(f), f).not.toContain('세무대리');
      expect(read(f), f).not.toContain('세무사법 고지');
    }
  });
});

describe('퇴직소득세 고지 — 현금 수령은 회사, IRP 이전은 나중에 금융회사(F1 261127)', () => {
  it('문구는 결정 그대로이고 금지어가 없으며, 원천징수의무자 공통 문구와 다르다', () => {
    expect(RETIREMENT_TAX_NOTICE).toBe(R);
    expect(bannedHits(R)).toEqual([]);
    expect(bannedHits(R, NO)).toEqual([]);
    expect(R).not.toContain('원천징수와 신고는 회사');
  });
  it('웹 결과 블록은 퇴직소득세 전용 상수를 쓰고 공통 상수(WITHHOLDING_NOTICE)를 쓰지 않는다', () => {
    const f = read('src/app/tools/retirement-tax/RetirementTaxClient.tsx');
    expect(f).toContain('{RETIREMENT_TAX_NOTICE}');
    expect(f).not.toContain('WITHHOLDING_NOTICE');
  });
  it('MCP calc_retirement_tax 도 같은 고지를 notice 로 싣는다(R27) — 현금·IRP 둘 다', async () => {
    const tax = fakeServer();
    registerTax(tax);
    for (const payout of ['cash', 'irp']) {
      const r = await call(tax, 'calc_retirement_tax', { pay: 20_000_000, hireDate: '2021-08-01', lastWorkDate: '2026-07-31', payout });
      expect(r.notice, payout).toBe(R);
    }
  });
});

describe('3.3% 점검 고지 — 1년 소득은 본인이 확정신고에서 다시 계산', () => {
  it('문구는 결정 그대로이고, 회사가 신고한다는 세금 도구 고지를 쓰지 않는다', () => {
    expect(CONTRACTOR).toBe(C);
    expect(CONTRACTOR).not.toContain('원천징수의무자');
    expect(bannedHits(C, NO)).toEqual([]);
  });

  it('같은 화면 MONEY_NOTES 첫 줄과 엇갈리지 않는다(다음 해 5월 확정신고에서 다시 계산)', () => {
    expect(MONEY_NOTES[0]).toContain('다음 해 5월 종합소득세 확정신고');
    expect(MONEY_NOTES[0]).toContain('다시 계산');
  });

  it('MCP check_contractor 도 같은 고지를 notice 로 싣는다(A15)', async () => {
    const calc = fakeServer();
    registerCalc(calc);
    for (const a of [{ pay: 3_000_000, date: '2026-11-01' }, {}]) {
      const r = await call(calc, 'check_contractor', a);
      expect(r.notice).toBe(C);
    }
  });
});

describe('MCP — 같은 상수를 쓰는 도구의 notice', () => {
  const calc = fakeServer();
  registerCalc(calc);
  const tax = fakeServer();
  registerTax(tax);

  it('calc_take_home_pay', async () => {
    const r = await call(calc, 'calc_take_home_pay', { pay: 3_000_000, date: '2026-11-01' });
    expect(r.notice).toContain(W);
  });
  it('calc_daily_worker_tax', async () => {
    const r = await call(tax, 'calc_daily_worker_tax', { dailyWorker: true, payments: [{ lines: [{ dailyWage: 200_000, days: 1 }] }] });
    expect(r.notice.join(' ')).toContain(W);
  });
  it('calc_midyear_settlement', async () => {
    const r = await call(tax, 'calc_midyear_settlement', { hasExcludedItem: true, totalPay: 0, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 0, paidLocalTax: 0 });
    expect(r.notice.join(' ')).toContain(W);
  });
});

describe('꼬리말·약관 메타 — 약관 본문에 맞춘 「참고 정보」', () => {
  const P = '일반 정보 제공 목적의 참고 정보';
  it('약관 본문은 「일반 정보 제공 목적」이다(맞출 기준)', () => {
    expect(read('src/app/terms/page.tsx')).toContain('일반 정보 제공 목적');
  });
  it('사이트 꼬리말과 약관 메타 설명이 같은 말을 쓰고 금지어가 없다', () => {
    const footer = read('src/app/layout.tsx').match(/© 2026 \{BRAND_NAME\}\.[^<]*/)?.[0] ?? '';
    const meta = read('src/app/terms/layout.tsx').match(/description: '([^']*)'/)?.[1] ?? '';
    for (const t of [footer, meta]) {
      expect(t).toContain(P);
      expect(bannedHits(t)).toEqual([]);
      expect(bannedHits(t, NO)).toEqual([]);
    }
  });
});
