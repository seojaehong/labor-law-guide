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
    // 2,500,000 × 10/35 + 1,600,000 × 5/35 = 714,285.71 + 228,571.43 = 942,857.14 → 10원 미만 버림(업무편람 281쪽 「원 단위 절사」)
    expect(r.worker!.monthly).toBe(942_850);
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
      // 시행일에 걸친 기간은 시행일 앞뒤 일수를 그 기간 일수로 나눠 각 판 월액을 곱하고 10원 미만을 버린다(업무편람 281쪽 사례)
      // 775,000 × 22/31 + 865,000 × 9/31 = 550,000 + 251,129.03 = 801,129 → 801,120
      ['2025-12-10', '2026-01-09', 801_120],
      ['2026-01-10', '2026-02-09', 865_000],
    ]);
    expect(s.total).toBe(2_441_120);
    expect(s.periods[1].crossesRuleChange).toBe(true);
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

    const all = calcChildcareReduction({ ...BASE, endDate: '2027-12-20', insuredDays180: true, childEligible: true, maternityOverlapDays: 0, priorUseDays: 0 });
    expect(all.worker!.eligibility.every((c) => c.status === 'met')).toBe(true);
    expect(all.worker!.verdict).toBe('eligible');

    const no = calcChildcareReduction({ ...BASE, insuredDays180: false });
    expect(no.worker!.verdict).toBe('not-eligible');
  });

  it('30일 이상 — 출산전후휴가와 겹친 날은 빼고 센다', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2027-03-01', endDate: '2027-04-09', maternityOverlapDays: 15, priorUseDays: 0 });
    expect(r.worker!.eligibility.find((c) => c.key === 'thirtyDays')!.status).toBe('unmet'); // 40일 − 15일 = 25일
  });

  it('1년을 넘는 기간은 확인 필요(쓰지 않은 육아휴직 기간의 두 배까지 늘어난다)', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2028-06-20' });
    expect(r.worker!.eligibility.find((c) => c.key === 'periodLimit')!.status).toBe('check');
  });

  it('1년은 나눠 쓴 기간의 합 — 앞서 쓴 일수를 넣지 않으면 확인 필요, 0 이면 충족, 합이 넘으면 확인 필요(제19조의2제4항·제19조의4제2항)', () => {
    const st = (prior?: number) => calcChildcareReduction({ ...BASE, endDate: '2027-06-20', priorUseDays: prior }).worker!.eligibility.find((c) => c.key === 'periodLimit')!.status;
    expect(st(undefined)).toBe('check');
    expect(st(0)).toBe('met');
    expect(st(200)).toBe('check'); // 182일 + 200일 > 1년
    expect(() => calcChildcareReduction({ ...BASE, priorUseDays: -1 })).toThrow(/앞서 쓴/);
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

  it('개시일이 2026. 7. 1.(확인한 고시) 전이면 사업주 금액을 내지 않고 이유를 단다 — 급여 상한과 같은 기준', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2026-03-02', priorityFirm: true, workSharing: { paidMonthly: 300_000 } });
    expect(r.worker!.monthly).toBe(865_000);
    expect(r.employer.subsidy.monthly).toBeNull();
    expect(r.employer.subsidy.withheld).toMatch(/2026\. 7\. 1\./);
    // 업무분담지원금은 지원한 기간 기준(고시 부칙 2026. 1. 1. 제3조제8항) — 월액은 확인한 고시 금액, 그 전 기간이 섞여 합계는 내지 않는다
    expect(r.employer.workSharing).toMatchObject({ monthly: 200_000, total: null });
    expect(r.assumptions.map((x) => x.key)).toContain('workSharingBeforeRule');
    expect(calcChildcareReduction({ ...BASE, priorityFirm: true }).employer.subsidy.withheld).toBeNull();
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
  it('calc 묶음에 있고, npm 게시 전까지 원격판에는 싣지 않는다(261127 결정 — calcRemoteHeld)', () => {
    expect(calcTools).toContain(TOOL);
    expect(calcRemoteSafe).not.toContain(TOOL);
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
    // 확인 못 한 사업주 요건도 헤드라인에 드러낸다(충족으로 숨기지 않는다)
    expect(r.headline.join(' ')).toContain('사업주 요건 — 미충족 0건 · 확인 필요 9건');
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

// ── interrogate 261127(아스트라 gpt-6.2-astra) 반영 — 지급액은 수급 판정·감액·법정 한도를 거쳐 낸다 ──
describe('지급액(payable) — 시행령 제104조의4 감액과 수급 판정', () => {
  it('회사 지급액을 넣지 않으면 산식 월액만 내고 지급액은 null', () => {
    const r = calcChildcareReduction({ ...BASE, insuredDays180: true, childEligible: true });
    expect(r.worker!.monthly).toBe(865_000);
    expect(r.worker!.payable.monthly).toBeNull();
    expect(r.worker!.payable.note).toMatch(/제104조의4/);
  });

  it('통상임금 400만·회사 지급 350만 → 초과 365,000 감액 → 지급 500,000', () => {
    const r = calcChildcareReduction({ ...BASE, employerPaidMonthly: 3_500_000 });
    expect(r.worker!.payable).toMatchObject({ deduction: 365_000, monthly: 500_000 });
  });

  it('회사 지급 240만 → 합계 326.5만 ≤ 400만이라 감액 0 → 지급 865,000', () => {
    const r = calcChildcareReduction({ ...BASE, employerPaidMonthly: 2_400_000 });
    expect(r.worker!.payable).toMatchObject({ deduction: 0, monthly: 865_000 });
  });

  it('요건 미충족(180일 미만)이면 지급액 0 — 산식 월액은 참고로 남는다', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2027-03-20', insuredDays180: false, employerPaidMonthly: 2_400_000 });
    expect(r.worker!.verdict).toBe('not-eligible');
    expect(r.worker!.payable).toMatchObject({ monthly: 0, total: 0 });
  });

  it('30일 미만 단축이면 지급액 0', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2026-07-01', endDate: '2026-07-07', maternityOverlapDays: 0, priorUseDays: 0 });
    expect(r.worker!.verdict).toBe('not-eligible');
    expect(r.worker!.payable.monthly).toBe(0);
    expect(r.worker!.payable.total).toBe(0);
  });
});

describe('법정 한도 — 기간·출산전후휴가', () => {
  it('앞서 쓴 기간을 더해 3년을 넘으면 3년까지만 센다 — 넘는 기간만 빼고 한도 안 기간은 지급(업무편람 「초과하는 기간은 지급하지 않음」)', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2026-07-01', endDate: '2030-06-30', priorUseDays: 0, priorityFirm: true });
    expect(r.worker!.eligibility.find((c) => c.key === 'periodLimit')!.status).toBe('check');
    expect(r.worker!.verdict).not.toBe('not-eligible');
    const s = r.worker!.schedule!;
    expect(s.periods.at(-1)!.to).toBe('2029-06-30');
    expect(s.total).toBe(36 * 865_000);
    expect(r.employer.subsidy.monthly).toBe(300_000);
    expect(r.employer.subsidy.total).toBe(36 * 300_000);
    expect(r.assumptions.map((x) => x.key)).toContain('periodCapped');
  });

  it('한도가 96일 남았으면 96일까지만 센다(앞서 1,000일 사용)', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2027-06-20', priorUseDays: 1000 });
    expect(r.worker!.schedule!.periods.at(-1)!.to).toBe('2027-03-26');
    expect(r.worker!.verdict).not.toBe('not-eligible');
  });

  it('출산전후휴가와 겹친 날이 있으면 기간 합계·신청 마감을 확정하지 않는다(단축은 휴가 개시 전날 끝난 것으로 본다 — 시행령 제15조의3제4항)', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2026-07-01', endDate: '2026-08-31', maternityOverlapDays: 31, priorityFirm: true });
    expect(r.worker!.schedule!.total).toBeNull();
    expect(r.employer.subsidy.total).toBeNull();
    expect(r.assumptions.map((x) => x.key)).toContain('maternityOverlap');
  });

  it('2025. 2. 23. 전에 개시하면 자녀 나이·분할 기준이 달라 자녀 요건을 충족으로 보지 않는다', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2024-09-01', childEligible: true });
    expect(r.worker!.eligibility.find((c) => c.key === 'childAge')!.status).toBe('check');
  });

  it('급여 신청 마감 안내에 법정 예외(시행령 제94조 사유가 끝난 뒤 30일)를 적는다', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2027-12-20' });
    expect(r.worker!.apply.note).toMatch(/30일 이내/);
  });
});

describe('사업주 요건 — 업무분담·피보험자', () => {
  const ONE_MONTH = { ...BASE, startDate: '2026-07-01', endDate: '2026-07-31', priorityFirm: true, maternityOverlapDays: 0, priorUseDays: 0, workSharing: { paidMonthly: 300_000 } };

  it('30일 미만 단축이면 업무분담 지원금도 0', () => {
    const r = calcChildcareReduction({ ...ONE_MONTH, endDate: '2026-07-07' });
    expect(r.employer.workSharing!.monthly).toBe(0);
  });

  it('지원 제외 사업주면 업무분담 지원금도 0', () => {
    const r = calcChildcareReduction({ ...ONE_MONTH, employerExcluded: true });
    expect(r.employer.subsidy.monthly).toBe(0);
    expect(r.employer.workSharing!.monthly).toBe(0);
  });

  it('자녀 요건 미충족(법정 육아기 단축 아님)이면 단축 지원금·업무분담 모두 0', () => {
    const r = calcChildcareReduction({ ...ONE_MONTH, childEligible: false });
    expect(r.employer.subsidy.monthly).toBe(0);
    expect(r.employer.workSharing!.monthly).toBe(0);
  });

  it('업무분담 시작일이 단축 개시 전이면 개시일부터만 센다', () => {
    const r = calcChildcareReduction({ ...ONE_MONTH, workSharing: { paidMonthly: 300_000, startDate: '2026-06-01' } });
    expect(r.employer.workSharing!.total).toBe(200_000);
  });

  it('같은 지정으로 받은 다른 지원금 월액은 뺀다', () => {
    const r = calcChildcareReduction({ ...ONE_MONTH, workSharing: { paidMonthly: 300_000, otherSupportMonthly: 50_000 } });
    expect(r.employer.workSharing!.monthly).toBe(150_000);
  });

  it('현재 피보험자 여부는 180일 이력과 따로 받는다 — 넣지 않으면 확인 필요', () => {
    const a = calcChildcareReduction({ ...ONE_MONTH, insuredDays180: true });
    expect(a.employer.subsidy.eligibility.find((c) => c.key === 'insured')!.status).toBe('check');
    const b = calcChildcareReduction({ ...ONE_MONTH, insuredDays180: false, currentlyInsured: true });
    expect(b.employer.subsidy.eligibility.find((c) => c.key === 'insured')!.status).toBe('met');
  });
});

// ── interrogate 2차(261127, 페이블·오푸스·아스트라) 반영 ──
describe('2차 검토 — 기간 한도·피보험자·감액 기준·끝수', () => {
  it('2025. 2. 23. 전 개시분도 1년을 넘으면 미충족이 아니라 확인 필요(종전 법도 쓰지 않은 육아휴직 기간 가산)', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2024-09-01', endDate: '2025-12-31', priorUseDays: 0, insuredDays180: true, maternityOverlapDays: 0 });
    expect(r.worker!.eligibility.find((c) => c.key === 'periodLimit')!.status).toBe('check');
    expect(r.worker!.verdict).not.toBe('not-eligible');
  });

  it('단축 당시 피보험자가 아니면 근로자 급여·업무분담 지원금도 0', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2027-12-20', priorityFirm: true, maternityOverlapDays: 0, priorUseDays: 0, childEligible: true, currentlyInsured: false, workSharing: { paidMonthly: 300_000 } });
    expect(r.worker!.verdict).toBe('not-eligible');
    expect(r.worker!.payable.monthly).toBe(0);
    expect(r.employer.subsidy.monthly).toBe(0);
    expect(r.employer.workSharing!.monthly).toBe(0);
    expect(r.employer.workSharing!.eligibility.map((c) => c.key)).toContain('insured');
  });

  it('감액 기준은 단축 시작일 직전 월의 통상임금(시행령 제104조의4제1호) — 직전 월 380만·개시 400만·회사 300만 → 감액 65,000', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2027-01-01', employerPaidMonthly: 3_000_000, wageBeforeStartMonth: 3_800_000 });
    expect(r.worker!.payable).toMatchObject({ deduction: 65_000, monthly: 800_000 });
    const d = calcChildcareReduction({ ...BASE, employerPaidMonthly: 3_000_000 });
    expect(d.assumptions.map((x) => x.key)).toContain('deductionBaseWage');
  });

  it('업무편람 281쪽 사례 — 250만·40→25시간, 2024. 12. 21.~2025. 1. 20.(31일) → 719,750원', () => {
    const r = calcChildcareReduction({ monthlyOrdinaryWage: 2_500_000, weeklyHoursBefore: 40, weeklyHoursAfter: 25, startDate: '2024-12-21', endDate: '2025-01-20' });
    const s = r.worker!.schedule!;
    expect(s.periods.map((p) => p.amount)).toEqual([719_750]);
    expect(s.total).toBe(719_750);
  });

  it('1개월 미만 기간은 10원 미만을 버린다 — 865,000 × 7/30 = 201,833 → 201,830', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2027-03-01', endDate: '2027-04-07' });
    expect(r.worker!.schedule!.periods[1].amount).toBe(201_830);
  });

  it('상한이 바뀌는 판이 뒤에 있으면 판별 지급액을 따로 낸다', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2025-11-10', endDate: '2026-06-30', employerPaidMonthly: 3_200_000 });
    expect(r.worker!.payable.byRule.map((x) => [x.from, x.monthly, x.payable])).toEqual([
      ['2025-01-01', 775_000, 775_000],
      ['2026-01-01', 865_000, 800_000],
    ]);
  });

  it('출산전후휴가와 겹치면 기간별 금액도 내지 않는다', () => {
    const r = calcChildcareReduction({ ...BASE, startDate: '2026-07-01', endDate: '2026-08-31', maternityOverlapDays: 31 });
    expect(r.worker!.schedule!.periods.every((p) => p.amount === null)).toBe(true);
  });

  it('겹친 일수가 기간보다 길거나 기간이 10년을 넘으면 입력 오류', () => {
    expect(() => calcChildcareReduction({ ...BASE, startDate: '2026-07-01', endDate: '2026-07-10', maternityOverlapDays: 15 })).toThrow(/겹친/);
    expect(() => calcChildcareReduction({ ...BASE, startDate: '2026-07-01', endDate: '2040-06-30' })).toThrow(/10년/);
  });

  it('이번 기간이 30일 미만이어도 앞서 나눠 쓴 기간이 있거나 모르면 확인 필요, 처음(0일)이면 미충족', () => {
    const a = calcChildcareReduction({ ...BASE, startDate: '2027-02-01', endDate: '2027-02-28', priorUseDays: 31, maternityOverlapDays: 0 });
    expect(a.worker!.eligibility.find((c) => c.key === 'thirtyDays')!.status).toBe('check');
    const b = calcChildcareReduction({ ...BASE, startDate: '2027-02-01', endDate: '2027-02-28', priorUseDays: 0, maternityOverlapDays: 0 });
    expect(b.worker!.eligibility.find((c) => c.key === 'thirtyDays')!.status).toBe('unmet');
  });

  it('잔여 50% 신청 — 근로자 자기 사정으로 6개월 전에 이직하면 이직 다음 날부터 12개월(시행규칙 제51조제2항제1호나목 단서)', () => {
    const r = calcChildcareReduction({ ...BASE, endDate: '2027-12-20', priorityFirm: true });
    expect(r.employer.subsidy.apply.note).toMatch(/이직한 날의 다음 날부터 12개월/);
  });

  it('근로자 통상임금이 빠져도 사업주 단축 지원금은 센다 — 개시일·우선지원 여부면 된다', () => {
    const r = calcChildcareReduction({ weeklyHoursBefore: 40, weeklyHoursAfter: 24, startDate: '2026-12-21', endDate: '2027-12-20', priorityFirm: true, firstTimeGrant: true });
    expect(r.status).toBe('needs-input');
    expect(r.employer.subsidy.monthly).toBe(400_000);
    const n = calcChildcareReduction({ monthlyOrdinaryWage: 4_000_000, priorityFirm: true });
    expect(n.employer.needs.map((x) => x.key)).toContain('startDate');
  });
});

describe('2차 검토 — 업무분담 지원금', () => {
  const WS = { ...BASE, endDate: '2027-12-20', priorityFirm: true, maternityOverlapDays: 0, priorUseDays: 0, childEligible: true, currentlyInsured: true };

  it('업무분담 종료일까지만 센다 — 한 달이면 200,000', () => {
    const r = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000, endDate: '2027-01-20' } });
    expect(r.employer.workSharing!.total).toBe(200_000);
  });

  it('업무분담 시작일이 단축 종료일 뒤면 미충족·0', () => {
    const r = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000, startDate: '2028-03-01' } });
    expect(r.employer.workSharing!.monthly).toBe(0);
    expect(r.employer.workSharing!.eligibility.find((c) => c.key === 'withinReduction')!.status).toBe('unmet');
  });

  it('신청 마감(종료일부터 12개월)을 낸다', () => {
    const r = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000 } });
    expect(r.employer.workSharing!.apply.until).toBe('2028-12-20');
  });

  it('다른 지원금은 고시 금액에서 먼저 빼고, 지급한 금액을 넘지 않게 — 지급 15만·다른 5만 → 15만(시행령 제29조제5항)', () => {
    const r = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 150_000, otherSupportMonthly: 50_000 } });
    expect(r.employer.workSharing!.monthly).toBe(150_000);
  });

  it('종료일·다른 지원금을 비우면 assumptions 로 알린다', () => {
    const r = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000 } });
    const keys = r.assumptions.map((x) => x.key);
    expect(keys).toContain('workSharingEnd');
    expect(keys).toContain('workSharingOtherSupport');
  });
});

describe('후속 — 고시 판 적용 기준·업무분담자 제외 사유(interrogate 2차 Consider)', () => {
  const WS = { ...BASE, endDate: '2027-12-20', priorityFirm: true, maternityOverlapDays: 0, priorUseDays: 0, childEligible: true, currentlyInsured: true };

  it('업무분담지원금은 지원한 기간 기준 — 단축이 확인한 고시보다 먼저 시작했어도 그 고시 시행 뒤 기간은 센다(고시 부칙 2026. 1. 1. 제3조제8항)', () => {
    const r = calcChildcareReduction({ ...WS, startDate: '2026-05-01', endDate: '2026-12-31', workSharing: { paidMonthly: 300_000, startDate: '2026-07-01', endDate: '2026-09-30', otherSupportMonthly: 0 } });
    // 단축 지원금은 허용(개시)한 때 기준이라 확인 안 된 판 — 내지 않는다
    expect(r.employer.subsidy.monthly).toBeNull();
    expect(r.employer.subsidy.withheld).toMatch(/2026\. 7\. 1\./);
    // 업무분담은 2026. 7. 1. 이후 기간이라 센다
    expect(r.employer.workSharing).toMatchObject({ monthly: 200_000, total: 600_000 });
  });

  it('업무분담 기간 일부가 확인한 고시보다 앞서면 그 부분 금액을 몰라 합계를 내지 않는다', () => {
    const r = calcChildcareReduction({ ...WS, startDate: '2026-05-01', endDate: '2026-12-31', workSharing: { paidMonthly: 300_000, startDate: '2026-05-01', endDate: '2026-09-30', otherSupportMonthly: 0 } });
    expect(r.employer.workSharing).toMatchObject({ monthly: 200_000, total: null });
    expect(r.assumptions.find((x) => x.key === 'workSharingBeforeRule')?.note).toMatch(/2026\. 7\. 1\./);
  });

  it('업무분담자 본인이 고시 제16조 제외 근로자이면 미충족, 넣지 않으면 확인 필요(제16조제4호 단서 — 업무분담 동료근로자도 지원 대상 근로자)', () => {
    const ex = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000, sharerExcluded: true } });
    expect(ex.employer.workSharing!.eligibility.find((c) => c.key === 'sharerExcluded')!.status).toBe('unmet');
    expect(ex.employer.workSharing!.monthly).toBe(0);
    const unk = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000 } });
    expect(unk.employer.workSharing!.eligibility.find((c) => c.key === 'sharerExcluded')!.status).toBe('check');
    const ok = calcChildcareReduction({ ...WS, workSharing: { paidMonthly: 300_000, sharerExcluded: false } });
    expect(ok.employer.workSharing!.eligibility.find((c) => c.key === 'sharerExcluded')!.status).toBe('met');
  });
});
