// 육아기 근로시간 단축 급여·장려금 계산기의 글자 — 계산은 엔진(calcChildcareReduction)이 하고, 여기서는 엔진 숫자와 문장을
// 결과 블록(ResultView)·요건 목록·신청 기간 줄로 옮긴다. 금액을 새로 세지 않는다.
// 입력 바꾸기(toEngineInput): 비운 칸·「모름」은 undefined 로 넘긴다. 엔진이 확인 필요·needs 로 알린다(0·true 로 채우지 않는다).
// 근거 조문은 엔진 파일이 인용하는 것만 단다(시험이 엔진 소스에서 조문 번호를 찾는다).
import type { ChildcareReductionInput, ChildcareReductionResult, EligibilityCheck } from '@/lib/calc/childcare-reduction';
import { RULES_CHECKED_ON } from '@/lib/calc/childcare-reduction';
import type { Need } from '@/lib/calc/needs';
import { STATUS_ESTIMATE, dotDate, lawLink, won, type ResultAmount, type ResultLink, type ResultView } from '@/components/tool-result/result-view';

// ── 입력 ──
export type YesNo = '' | 'yes' | 'no';
export interface FormState {
  wage: string;
  before: string;
  after: string;
  start: string;
  end: string;
  insured180: YesNo;
  child: YesNo;
  priority: YesNo;
  firstTime: YesNo;
  /** 단축 중 회사가 매월 주는 임금·금품 합계 */
  paid: string;
  /** 업무분담자에게 매월 지급한 금액 */
  sharingPaid: string;
  sharingStart: string;
  sharingEnd: string;
}

export const EMPTY_FORM: FormState = {
  wage: '', before: '', after: '', start: '', end: '', insured180: '', child: '', priority: '', firstTime: '', paid: '', sharingPaid: '', sharingStart: '', sharingEnd: '',
};

/** 비면 undefined, 아니면 쉼표·빈칸을 지운 숫자(숫자가 아니면 NaN — 엔진이 「확인해 주세요」로 막는다) */
const num = (s: string): number | undefined => {
  const t = s.replace(/[,\s]/g, '');
  return t === '' ? undefined : Number(t);
};
const day = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim());
const yn = (v: YesNo): boolean | undefined => (v === '' ? undefined : v === 'yes');

export function toEngineInput(f: FormState): ChildcareReductionInput {
  const sharingPaid = num(f.sharingPaid);
  return {
    monthlyOrdinaryWage: num(f.wage),
    weeklyHoursBefore: num(f.before),
    weeklyHoursAfter: num(f.after),
    startDate: day(f.start),
    endDate: day(f.end),
    insuredDays180: yn(f.insured180),
    childEligible: yn(f.child),
    priorityFirm: yn(f.priority),
    firstTimeGrant: yn(f.firstTime),
    employerPaidMonthly: num(f.paid),
    workSharing: sharingPaid === undefined ? undefined : { paidMonthly: sharingPaid, startDate: day(f.sharingStart), endDate: day(f.sharingEnd) },
  };
}

// ── 근거 조문(엔진 파일이 인용하는 것) ──
const EQUAL = '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률';
const ACT73_2 = lawLink('고용보험법 제73조의2', '고용보험법', '제73조의2');
const DEC104_2 = lawLink('고용보험법 시행령 제104조의2', '고용보험법 시행령', '제104조의2');
const DEC104_4 = lawLink('고용보험법 시행령 제104조의4', '고용보험법 시행령', '제104조의4');
const EQ19_2 = lawLink('남녀고용평등법 제19조의2', EQUAL, '제19조의2');
const EQ19_4 = lawLink('남녀고용평등법 제19조의4', EQUAL, '제19조의4');
const DEC29 = lawLink('고용보험법 시행령 제29조', '고용보험법 시행령', '제29조');
const RULE51 = lawLink('고용보험법 시행규칙 제51조', '고용보험법 시행규칙', '제51조');

const NEXT: ResultLink[] = [
  { label: '육아기 근로시간 단축 서식', href: '/tools/hr-forms' },
  { label: '통상임금 점검', href: '/tools/ordinary-wage-check' },
];

const dec = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export function childcareReductionView(r: ChildcareReductionResult): ResultView {
  const w = r.worker;
  const s = r.employer.subsidy;
  const ws = r.employer.workSharing;
  const verdict: string[] = [];
  const amounts: ResultAmount[] = [];
  const warnings: string[] = [];

  if (w) {
    const unmet = w.verdict === 'not-eligible';
    if (unmet) {
      // 엔진 지급액(payable)은 미충족이면 0 이다 — 산식 금액을 답처럼 맨 위에 두지 않는다
      verdict.push('미충족으로 넣은 요건이 있어 단축급여 지급액은 0원으로 셉니다.');
      verdict.push(`요건을 갖춘다면 산식 금액은 한 달 ${won(w.monthly)}입니다. 아래 요건 목록을 확인합니다.`);
    } else {
      verdict.push(`육아기 근로시간 단축 급여는 한 달 ${won(w.monthly)}입니다.`);
      if (w.verdict === 'check') verdict.push('확인 필요로 남은 요건을 갖춘다는 전제의 금액입니다.');
    }
    verdict.push('이 급여는 근로자 본인이 신청합니다(고용보험법 제73조의2제2항).');
    amounts.push({
      label: unmet ? '산식 월액(요건을 갖춘다면, 감액 전)' : '단축급여 월액(감액 전)',
      value: won(w.monthly),
      note: [`앞 ${w.firstHours}시간분 ${dec(w.firstPart)}원 + 나머지 ${w.restHours}시간분 ${dec(w.restPart)}원(10원 미만 버림)`],
    });
    if (w.schedule && w.schedule.total !== null) amounts.push({ label: unmet ? '산식 기간 합계(요건을 갖춘다면, 감액 전)' : '단축 기간 합계(감액 전)', value: won(w.schedule.total) });
    if (w.payable.monthly !== null && !unmet) {
      amounts.push({
        label: '회사 지급액을 반영한 월 지급액',
        value: won(w.payable.monthly),
        note: w.payable.deduction ? [`감액 ${won(w.payable.deduction)}(고용보험법 시행령 제104조의4)`] : undefined,
      });
    }
  } else {
    verdict.push('단축급여를 계산하려면 아래 사실을 더 알려 주어야 합니다.');
  }

  if (s.monthly !== null) {
    amounts.push({
      label: '사업주 장려금 월액',
      value: won(s.monthly),
      note: s.bonus ? [`기본 ${won(s.base ?? 0)} + 처음 허용한 사업장 추가 ${won(s.bonus)}`] : undefined,
    });
    if (s.total !== null) {
      amounts.push({
        label: '사업주 장려금 합계',
        value: won(s.total),
        note: s.firstHalf !== null && s.rest !== null ? [`절반 ${won(s.firstHalf)}은 기간 중에, 나머지 ${won(s.rest)}은 끝난 뒤 6개월 이상 계속 고용하면 신청`] : undefined,
      });
    }
  }
  if (s.withheld) warnings.push(s.withheld);
  if (ws && ws.monthly !== null) {
    amounts.push({ label: '업무분담 지원금 월액', value: won(ws.monthly), note: [`한 달 최대 ${won(ws.cap)}`] });
    if (ws.total !== null) amounts.push({ label: '업무분담 지원금 합계', value: won(ws.total) });
  }

  const employerShown = s.monthly !== null || (ws !== null && ws.monthly !== null);
  const basis = [ACT73_2, DEC104_2, ...(w && w.payable.monthly !== null ? [DEC104_4] : []), EQ19_2, EQ19_4, ...(employerShown ? [DEC29, RULE51] : [])];

  return {
    status: STATUS_ESTIMATE,
    verdict,
    amounts,
    warnings: warnings.length ? warnings : undefined,
    basis,
    asOf: [`확인 ${dotDate(RULES_CHECKED_ON)}`],
    caveat: '실제 지급액은 고용센터가 산정한 금액으로 확인합니다. 사업주 장려금은 고용노동부 고시 금액이라 고시가 바뀌면 달라집니다.',
    next: NEXT,
  };
}

/**
 * 엔진 문장 중 입력 이름(wageBeforeStartMonth·restFrom 같은 코드 낱말)을 품은 것은 화면에 그리지 않는다 —
 * 이 화면에 그런 칸이 없고, 사용자에게 코드 이름을 보이지 않는다. 엔진 문장은 고치지 않는다(엔진 쪽 과제로 남김).
 */
export const isPlain = (s: string) => !/[a-z]+[A-Z][A-Za-z]*/.test(s);
const pushPlain = (out: string[], s: string) => { if (isPlain(s)) out.push(s); };

/** 「계산에 둔 전제」에 보일 엔진 assumptions — 코드 낱말을 품은 문장은 뺀다 */
export function shownAssumptions(r: ChildcareReductionResult) {
  return r.assumptions.filter((a) => isPlain(a.note));
}

/** 근로자·사업주 needs 를 합친다(같은 질문은 한 번) */
export function mergedNeeds(r: ChildcareReductionResult): Need[] {
  const out: Need[] = [];
  for (const n of [...r.needs, ...r.employer.needs]) if (!out.some((o) => o.key === n.key)) out.push(n);
  return out;
}

export interface CheckGroup { title: string; rows: EligibilityCheck[] }

export function checkGroups(r: ChildcareReductionResult): CheckGroup[] {
  const g: CheckGroup[] = [];
  if (r.worker) g.push({ title: '단축급여 요건', rows: r.worker.eligibility });
  g.push({ title: '사업주 장려금 요건', rows: r.employer.subsidy.eligibility });
  if (r.employer.workSharing) g.push({ title: '업무분담 지원금 요건', rows: r.employer.workSharing.eligibility });
  return g;
}

const range = (from: string | null, until: string | null) =>
  from ? `${dotDate(from)}부터 ${until ? `${dotDate(until)}까지` : '(종료일을 넣으면 마감일을 셉니다)'}` : '단축 시작일을 넣으면 셉니다';

/** 신청 기간 줄 — 엔진 apply 날짜와 문장 */
export function applyLines(r: ChildcareReductionResult): string[] {
  const out: string[] = [];
  if (r.worker) {
    out.push(`단축급여 신청(근로자 본인이 신청): ${range(r.worker.apply.from, r.worker.apply.until)}`);
    pushPlain(out, r.worker.apply.note);
  }
  const a = r.employer.subsidy.apply;
  if (r.employer.subsidy.monthly !== null) {
    out.push(`사업주 장려금 신청(사업주가 신청): 절반 ${range(a.firstFrom, a.until)}${a.restFrom ? `, 나머지 ${range(a.restFrom, a.restUntil)}` : ''}`);
    pushPlain(out, a.note);
  }
  const ws = r.employer.workSharing;
  if (ws && ws.monthly !== null) {
    out.push(`업무분담 지원금 신청(사업주가 신청): ${range(ws.apply.firstFrom, ws.apply.until)}`);
    pushPlain(out, ws.apply.note);
  }
  return out;
}

export interface ScheduleRow { period: string; days: string; monthly: string; amount: string; note: string }

/** 계산 과정 표 — 엔진 기간표를 그대로 */
export function scheduleRows(r: ChildcareReductionResult): ScheduleRow[] {
  const periods = r.worker?.schedule?.periods ?? [];
  return periods.map((p) => ({
    period: `${dotDate(p.from)} ~ ${dotDate(p.to)}`,
    days: `${p.days}일`,
    monthly: won(p.monthly),
    amount: p.amount === null ? '—' : won(p.amount),
    note: [p.full ? '' : `1개월 미만 — ${p.monthly.toLocaleString('ko-KR')}원 × ${p.days} ÷ ${p.monthDays}`, p.crossesRuleChange ? '상한이 바뀌는 날 앞뒤로 나눠 셈' : ''].filter(Boolean).join(' · '),
  }));
}

/** 계산 과정 문장 — 상한·하한을 붙인 기준 금액 */
export function formulaLines(r: ChildcareReductionResult): string[] {
  const w = r.worker;
  if (!w) return [];
  const capNote = (capped: boolean, floored: boolean) => (capped ? '(상한)' : floored ? '(하한)' : '');
  return [
    `줄어든 시간 ${w.reducedHours}시간 = 앞 ${w.firstHours}시간 + 나머지 ${w.restHours}시간`,
    `앞 ${w.firstHours}시간분: ${won(w.firstBase)}${capNote(w.firstCapped, w.firstFloored)} × ${w.firstHours} ÷ 단축 전 시간 = ${dec(w.firstPart)}원`,
    `나머지 ${w.restHours}시간분: 월 통상임금 80% 해당 ${won(w.restBase)}${capNote(w.restCapped, w.restFloored)} × ${w.restHours} ÷ 단축 전 시간 = ${dec(w.restPart)}원`,
    `상한·하한: ${w.rule.source} — 앞 10시간분 ${won(w.rule.firstCap)}, 나머지 ${won(w.rule.restCap)}, 하한 ${won(w.rule.floor)}`,
  ];
}

/** 블록 안·접힌 상세에 그리는 글자 전부 — 시험이 금지어로 훑는다 */
export function allCopy(r: ChildcareReductionResult): string[] {
  const needs = mergedNeeds(r);
  return [
    ...(needs.length ? ['더 알려 주면 계산하는 것', ...needs.flatMap((n) => [n.question, n.why])] : []),
    ...checkGroups(r).flatMap((g) => [g.title, ...g.rows.flatMap((c) => [c.label, c.statusLabel, c.note])]),
    ...applyLines(r),
    ...(r.worker && isPlain(r.worker.payable.note) ? [r.worker.payable.note] : []),
    ...formulaLines(r),
    ...scheduleRows(r).flatMap((x) => [x.period, x.days, x.monthly, x.amount, x.note]),
    ...shownAssumptions(r).map((a) => a.note),
  ];
}
