// 육아기 근로시간 단축 급여(고용보험법 제73조의2·시행령 제104조의2) + 출산육아기 고용안정장려금(시행령 제29조·고시 별표 5) 계산.
// 입력은 전부 합성 값. 공통 형식 needs·assumptions(src/lib/calc/needs.ts) — 빠진 사실이 있으면 금액을 내지 않는다.
import { describe, expect, it } from 'vitest';
import { calcChildcareReduction, REDUCTION_PAY_RULES, REDUCTION_SUBSIDY_RULES } from '@/lib/calc/childcare-reduction';
import type { Need } from '@/lib/calc/needs';
import { bannedHits } from '@/lib/tool-kit/banned';
import { registerCalc, calcTools, calcRemoteSafe } from '../../tools/k-labor/groups/calc.mjs';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const hs: Record<string, Handler> = {};
const cfgs: Record<string, { title?: string; description?: string; inputSchema?: Record<string, { description?: string }> }> = {};
registerCalc({ registerTool: (n: string, c: (typeof cfgs)[string], h: Handler) => { hs[n] = h; cfgs[n] = c; } });
const TOOL = 'calc_childcare_reduction_pay';
const mcp = async (a: Record<string, unknown>) => JSON.parse((await hs[TOOL](a)).content[0].text);

const BASE = { monthlyOrdinaryWage: 4_000_000, weeklyHoursBefore: 40, weeklyHoursAfter: 24, startDate: '2026-12-21' };
const won = /\d{1,3}(,\d{3})+원/;
const needText = (ns: Need[]) => ns.flatMap((n) => [n.question, n.why]).join(' ');

describe('육아기 근로시간 단축 급여 — 두 구간', () => {
  it('상한 걸림: 통상임금 400만·40→24시간 → 앞 10시간 625,000 + 나머지 6시간 240,000 = 865,000', () => {
    const r = calcChildcareReduction(BASE);
    expect(r.status).toBe('ok');
    expect(r.needs).toEqual([]);
    expect(r.worker).toMatchObject({
      reducedHours: 16, firstHours: 10, restHours: 6,
      firstBase: 2_500_000, restBase: 1_600_000, firstPart: 625_000, restPart: 240_000, monthly: 865_000,
    });
    expect(r.worker!.firstCapped).toBe(true);
    expect(r.worker!.restCapped).toBe(true);
  });

  it('상한 안 걸림: 통상임금 180만·40→25시간 → 450,000 + 1,440,000×5/40 180,000 = 630,000', () => {
    const r = calcChildcareReduction({ ...BASE, monthlyOrdinaryWage: 1_800_000, weeklyHoursAfter: 25 });
    expect(r.worker).toMatchObject({ firstBase: 1_800_000, restBase: 1_440_000, firstPart: 450_000, restPart: 180_000, monthly: 630_000, firstCapped: false, restCapped: false });
  });

  it('단축 10시간 미만: 40→35시간(5시간) → 앞 구간만 2,500,000×5/40 = 312,500, 나머지 구간 0', () => {
    const r = calcChildcareReduction({ ...BASE, weeklyHoursAfter: 35 });
    expect(r.worker).toMatchObject({ reducedHours: 5, firstHours: 5, restHours: 0, firstPart: 312_500, restPart: 0, monthly: 312_500 });
  });

  it('단축 10시간 초과·정확히 10시간 — 10시간까지는 앞 구간, 넘는 시간만 80% 구간', () => {
    const ten = calcChildcareReduction({ ...BASE, weeklyHoursAfter: 30 });
    expect(ten.worker).toMatchObject({ firstHours: 10, restHours: 0, monthly: 625_000 });
    const twenty = calcChildcareReduction({ ...BASE, weeklyHoursAfter: 20 });
    expect(twenty.worker).toMatchObject({ firstHours: 10, restHours: 10, restPart: 400_000, monthly: 1_025_000 });
  });

  it('하한은 곱하기 전 월 통상임금 해당 금액에 적용 — 통상임금 60만이면 80% 48만이 50만으로 올라간다', () => {
    const r = calcChildcareReduction({ ...BASE, monthlyOrdinaryWage: 600_000, weeklyHoursAfter: 20 });
    expect(r.worker).toMatchObject({ firstBase: 600_000, restBase: 500_000, firstPart: 150_000, restPart: 125_000, monthly: 275_000, restFloored: true });
  });

  it('단축 전 소정근로시간이 40시간보다 짧아도 그 시간을 분모로 쓴다 — 35→20시간', () => {
    const r = calcChildcareReduction({ ...BASE, weeklyHoursBefore: 35, weeklyHoursAfter: 20 });
    // 2,500,000 × 10/35 + 1,600,000 × 5/35 = 714,285.71 + 228,571.43 = 942,857.14 → 원 미만 버림
    expect(r.worker!.monthly).toBe(942_857);
    expect(r.assumptions.map((x) => x.key)).toContain('rounding');
  });
});

describe('기준일별 상한 — 지급대상 기간이 속한 판(부칙: 시행 전 개시분의 남은 기간에도 새 상한)', () => {
  it('상한 표는 2024. 7. 1.(200만·150만)·2025. 1. 1.(220만·150만)·2026. 1. 1.(250만·160만) 세 판이고 출처를 단다', () => {
    expect(REDUCTION_PAY_RULES.map((x) => [x.from, x.firstCap, x.restCap, x.floor])).toEqual([
      ['2024-07-01', 2_000_000, 1_500_000, 500_000],
      ['2025-01-01', 2_200_000, 1_500_000, 500_000],
      ['2026-01-01', 2_500_000, 1_600_000, 500_000],
    ]);
    for (const x of REDUCTION_PAY_RULES) expect(x.source).toMatch(/고용보험법 시행령 제104조의2제2항.*대통령령 제\d+호/);
  });

  it('2025년 기간은 220만·150만 상한: 400만·40→24 → 550,000 + 225,000 = 775,000', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2025-03-01' });
    expect(r.worker!.monthly).toBe(775_000);
  });

  it('2025년에 개시해 2026년으로 이어지면 2026년 기간부터 새 상한 — 시행일에 걸친 달은 assumptions 로 알린다', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2025-11-10', endDate: '2026-02-09' });
    const s = r.worker!.schedule!;
    expect(s.periods.map((p) => [p.from, p.to, p.amount])).toEqual([
      ['2025-11-10', '2025-12-09', 775_000],
      ['2025-12-10', '2026-01-09', 775_000],
      ['2026-01-10', '2026-02-09', 865_000],
    ]);
    expect(s.total).toBe(2_415_000);
    expect(r.assumptions.map((x) => x.key)).toContain('ruleChangeInsidePeriod');
  });

  it('2024년 하반기 기간은 200만·150만 상한: 400만·40→24 → 500,000 + 225,000 = 725,000', () => {
    expect(calcChildcareReduction({ ...BASE, startDate: '2024-09-01' }).worker!.monthly).toBe(725_000);
  });

  it('2024. 7. 1. 전에 개시한 단축은 계산하지 않는다(확인한 판이 없다)', () => {
    expect(() => calcChildcareReduction({ ...BASE, startDate: '2024-06-30' })).toThrow(/2024\. 7\. 1\./);
  });
});

describe('1개월 미만 일할 — 산출액 ÷ 그 달 일수 × 사용 일수', () => {
  it('2027-03-01 ~ 04-15 → 3월 한 달 865,000 + 4월 15일 865,000 × 15/30 = 432,500 → 1,297,500', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2027-03-01', endDate: '2027-04-15' });
    const s = r.worker!.schedule!;
    expect(s.periods).toEqual([
      expect.objectContaining({ from: '2027-03-01', to: '2027-03-31', full: true, amount: 865_000 }),
      expect.objectContaining({ from: '2027-04-01', to: '2027-04-15', full: false, days: 15, monthDays: 30, amount: 432_500 }),
    ]);
    expect(s.total).toBe(1_297_500);
    // 어느 달의 일수로 나눴는지 드러낸다
    expect(r.assumptions.map((x) => x.key)).toContain('partialMonthDays');
  });

  it('31일에 개시하면 다음 달 말일까지가 한 달(민법 제160조제3항) — 1.31 개시 → 1.31~2.28', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2027-01-31', endDate: '2027-03-30' });
    expect(r.worker!.schedule!.periods.map((p) => [p.from, p.to, p.full])).toEqual([
      ['2027-01-31', '2027-02-28', true],
      ['2027-03-01', '2027-03-30', true],
    ]);
  });
});

describe('입력 거절·needs', () => {
  it('단축 후 주 15시간 미만·35시간 초과는 거절(남녀고용평등법 제19조의2제3항)', () => {
    expect(() => calcChildcareReduction({ ...BASE, weeklyHoursAfter: 14 })).toThrow(/15시간 이상 35시간 이하/);
    expect(() => calcChildcareReduction({ ...BASE, weeklyHoursBefore: 40, weeklyHoursAfter: 36 })).toThrow(/15시간 이상 35시간 이하/);
    expect(() => calcChildcareReduction({ ...BASE, weeklyHoursBefore: 24, weeklyHoursAfter: 24 })).toThrow(/줄어/);
    expect(() => calcChildcareReduction({ ...BASE, weeklyHoursBefore: 44 })).toThrow(/40시간/);
    expect(() => calcChildcareReduction({ ...BASE, endDate: '2026-12-01' })).toThrow(/종료일/);
  });

  it('통상임금·단축 전·후 시간·개시일이 없으면 금액 대신 needs(관찰할 수 있는 사실을 묻는다)', () => {
    const r = calcChildcareReduction({});
    expect(r.status).toBe('needs-input');
    expect(r.needs.map((n) => n.key)).toEqual(['monthlyOrdinaryWage', 'weeklyHoursBefore', 'weeklyHoursAfter', 'startDate']);
    expect(r.worker).toBeNull();
    expect(bannedHits(needText(r.needs))).toEqual([]);
    const one = calcChildcareReduction({ ...BASE, monthlyOrdinaryWage: undefined });
    expect(one.needs.map((n) => n.key)).toEqual(['monthlyOrdinaryWage']);
    expect(one.worker).toBeNull();
  });
});

describe('요건 확인 — 확인 못 한 것을 충족으로 숨기지 않는다', () => {
  it('사실을 넣지 않으면 확인 필요, 넣으면 충족·미충족', () => {
    const r = calcChildcareReduction(BASE);
    const st = (k: string) => r.worker!.eligibility.find((c) => c.key === k)?.status;
    expect(st('reducedHoursRange')).toBe('met');
    expect(st('insured180')).toBe('check');
    expect(st('childAge')).toBe('check');
    expect(st('thirtyDays')).toBe('check'); // 종료일이 없다
    expect(r.worker!.verdict).toBe('check');

    const all = calcChildcareReduction({ ...BASE, endDate: '2027-12-20', insuredDays180: true, childEligible: true, maternityOverlapDays: 0 });
    expect(all.worker!.eligibility.every((c) => c.status === 'met')).toBe(true);
    expect(all.worker!.verdict).toBe('eligible');

    const no = calcChildcareReduction({ ...BASE, insuredDays180: false });
    expect(no.worker!.verdict).toBe('not-eligible');
  });

  it('30일 이상 — 출산전후휴가와 겹친 날은 빼고 센다', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2027-03-01', endDate: '2027-04-09', maternityOverlapDays: 15 });
    expect(r.worker!.eligibility.find((c) => c.key === 'thirtyDays')!.status).toBe('unmet'); // 40일 − 15일 = 25일
  });

  it('1년을 넘는 기간은 확인 필요(쓰지 않은 육아휴직 기간의 두 배까지 늘어난다)', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2028-06-20' });
    expect(r.worker!.eligibility.find((c) => c.key === 'periodLimit')!.status).toBe('check');
  });
});

describe('사업주 — 출산육아기 고용안정장려금(고시 별표 5)', () => {
  it('고시 금액 표 — 2026. 7. 1. 시행판 단축 지원금 30만·최초 허용 10만·업무분담 20만', () => {
    expect(REDUCTION_SUBSIDY_RULES.map((x) => [x.from, x.monthly, x.firstGrantBonus, x.sharingCap, x.sharingMinReducedHours])).toEqual([
      ['2026-07-01', 300_000, 100_000, 200_000, 10],
    ]);
    expect(REDUCTION_SUBSIDY_RULES[0].source).toMatch(/별표 5/);
  });

  it('우선지원대상기업을 모르면 사업주 금액을 내지 않는다(employer.needs)', () => {
    const r = calcChildcareReduction(BASE);
    expect(r.employer.needs.map((n) => n.key)).toEqual(['priorityFirm']);
    expect(r.employer.subsidy.monthly).toBeNull();
    expect(bannedHits(needText(r.employer.needs))).toEqual([]);
  });

  it('근로자 needs 가 남으면 사업주 금액도 내지 않는다(개시일이 없으면 고시 판도 못 고른다)', () => {
    const r = calcChildcareReduction({ startDate: undefined, monthlyOrdinaryWage: 4_000_000, weeklyHoursBefore: 40, weeklyHoursAfter: 24, priorityFirm: true, workSharing: { paidMonthly: 300_000 } });
    expect(r.needs.map((n) => n.key)).toEqual(['startDate']);
    expect(r.employer.subsidy.monthly).toBeNull();
    expect(r.employer.workSharing!.monthly).toBeNull();
  });

  it('상한·하한은 확인한 날의 판 기준이라고 assumptions 로 알린다', () => {
    const a = calcChildcareReduction(BASE).assumptions.find((x) => x.key === 'payRuleCheckedOn');
    expect(a?.value).toBe('2026-11-27');
  });

  it('우선지원대상기업·최초 허용 → 월 400,000, 종료일이 없으면 총액·나머지 50% 신청일은 내지 않는다', () => {
    const r = calcChildcareReduction({ ...BASE, priorityFirm: true, firstTimeGrant: true });
    expect(r.employer.subsidy).toMatchObject({ monthly: 400_000, base: 300_000, bonus: 100_000, total: null, firstHalf: null, rest: null });
    expect(r.employer.subsidy.apply).toMatchObject({ firstFrom: '2027-01-01', restFrom: null, until: null });
  });

  it('종료일이 있으면 12개월 × 400,000 = 4,800,000, 절반은 3개월마다, 나머지는 끝난 뒤 6개월 계속 고용 후', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2027-12-20', priorityFirm: true, firstTimeGrant: true });
    expect(r.employer.subsidy).toMatchObject({ total: 4_800_000, firstHalf: 2_400_000, rest: 2_400_000 });
    expect(r.employer.subsidy.apply).toMatchObject({ firstFrom: '2027-01-01', until: '2028-12-20', restFrom: '2028-06-21', restUntil: '2029-06-20' });
    expect(r.worker!.apply).toMatchObject({ from: '2027-01-21', until: '2028-12-20' });
  });

  it('최초 허용을 비우면 인센티브를 빼고 assumptions 로 알린다', () => {
    const r = calcChildcareReduction({ ...BASE, priorityFirm: true });
    expect(r.employer.subsidy.monthly).toBe(300_000);
    expect(r.assumptions.map((x) => x.key)).toContain('firstTimeGrant');
  });

  it('우선지원대상기업이 아니면 0원·미충족', () => {
    const r = calcChildcareReduction({ ...BASE, priorityFirm: false });
    expect(r.employer.subsidy.monthly).toBe(0);
    expect(r.employer.subsidy.eligibility.find((c) => c.key === 'priorityFirm')!.status).toBe('unmet');
  });

  it('월평균 보수 124만 미만은 「제외」가 아니라 확인 필요(단시간 근로자는 근무시간에 비례해 기준을 다시 센다 — 고시 제16조제3호 단서)', () => {
    const r = calcChildcareReduction({ ...BASE, priorityFirm: true, monthlyReportedPay: 1_000_000 });
    expect(r.employer.subsidy.eligibility.find((c) => c.key === 'reportedPay')!.status).toBe('check');
    const ok = calcChildcareReduction({ ...BASE, priorityFirm: true, monthlyReportedPay: 3_000_000 });
    expect(ok.employer.subsidy.eligibility.find((c) => c.key === 'reportedPay')!.status).toBe('met');
  });

  it('업무분담 지원금 — 단축 10시간 미만이면 제외(시행령 제29조제1항제4호가목 단서), 이상이면 min(20만, 지급액)', () => {
    const short = calcChildcareReduction({ ...BASE, weeklyHoursAfter: 32, priorityFirm: true, workSharing: { paidMonthly: 300_000 } });
    expect(short.employer.workSharing).toMatchObject({ monthly: 0 });
    expect(short.employer.workSharing!.eligibility.find((c) => c.key === 'reducedTenHours')!.status).toBe('unmet');
    const ok = calcChildcareReduction({ ...BASE, priorityFirm: true, workSharing: { paidMonthly: 300_000 } });
    expect(ok.employer.workSharing).toMatchObject({ monthly: 200_000, cap: 200_000 });
    const low = calcChildcareReduction({ ...BASE, priorityFirm: true, workSharing: { paidMonthly: 150_000 } });
    expect(low.employer.workSharing!.monthly).toBe(150_000);
    expect(calcChildcareReduction({ ...BASE, priorityFirm: true }).employer.workSharing).toBeNull();
  });
});

describe('MCP calc_childcare_reduction_pay', () => {
  it('calc 묶음에 있고 원격판에도 싣는다(이름·주민번호를 받지 않는 계산)', () => {
    expect(calcTools).toContain(TOOL);
    expect(calcRemoteSafe).toContain(TOOL);
  });

  it('합성 예 — 근로자 월 865,000원, 사업주 월 400,000원, needs 최상위', async () => {
    const r = await mcp({ ...BASE, priorityFirm: true, firstTimeGrant: true });
    expect(r.ok).toBe(true);
    expect(r.needs).toEqual([]);
    expect(r.result.worker.monthly).toBe(865_000);
    expect(r.result.employer.subsidy.monthly).toBe(400_000);
    expect(r.headline.join(' ')).toContain('865,000원');
    expect(r.headline.join(' ')).toContain('급여 신청 2027. 1. 21.부터');
    expect(r.headline.join(' ')).toContain('장려금 신청 2027. 1. 1.부터 3개월마다');
    expect(Array.isArray(r.assumptions)).toBe(true);
    expect(r.wageNote).toMatch(/임금 구성/);
  });

  it('필수 사실이 없으면 금액 문장 없이 needs', async () => {
    const r = await mcp({ startDate: '2026-12-21' });
    expect(r.ok).toBe(true);
    expect(r.needs.map((n: Need) => n.key)).toEqual(['monthlyOrdinaryWage', 'weeklyHoursBefore', 'weeklyHoursAfter']);
    expect(JSON.stringify(r.headline)).not.toMatch(won);
    expect(r.result.worker).toBeNull();
  });

  it('단축 후 시간이 범위 밖이면 ok:false', async () => {
    const r = await mcp({ ...BASE, weeklyHoursAfter: 10 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/15시간 이상 35시간 이하/);
  });

  it('설명·입력 설명·응답에 금지어(대신·대행·대리·포괄 포함)가 없다', async () => {
    const c = cfgs[TOOL];
    const desc = [c.title, c.description, ...Object.values(c.inputSchema ?? {}).map((v) => v?.description ?? '')].join('\n');
    const words = ['포괄', '대신', '대행', '대리'];
    expect(bannedHits(desc)).toEqual([]);
    for (const w of words) expect(desc).not.toContain(w);
    const out = JSON.stringify(await mcp({ ...BASE, endDate: '2027-12-20', priorityFirm: true, firstTimeGrant: true, workSharing: { paidMonthly: 300_000 } }));
    expect(bannedHits(out)).toEqual([]);
    for (const w of words) expect(out).not.toContain(w);
  });
});
