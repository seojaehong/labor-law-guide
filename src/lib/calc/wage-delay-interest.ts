// 임금 지연이자 — 근로기준법 §37(법률 제20520호로 바뀐 문언, 2025. 10. 23. 시행) + 시행령 §17(연 100분의 20, rates.ts).
// §37① 「각 호에 따른 날까지 지급하지 아니한 경우 그 다음 날부터 지급하는 날까지의 지연 일수」에 이율을 곱한다.
//   1호 — §36 금품청산 대상 임금과 퇴직급여 일시금: 지급 사유가 생긴 날(퇴직일·사망일)부터 14일이 되는 날.
//         초일 불산입(민법 §157) → 기준일 = 퇴직일 + 14. 광주지법 2010가합8213: 퇴직 2. 21. → 14일째 3. 7. → 3. 8.부터.
//         §36 단서로 지급기일을 합의해 늦춰도 기준일은 그대로다(근로기준과-3981, 2005. 7. 28.). 연장 입력을 받지 않는다.
//   2호 — §43에 따라 지급하여야 하는 임금: §43②에 따라 정하는 날(정기지급일). 입력한 날을 그대로 쓴다.
//         부칙 §2(법률 제20520호) 「이 법 시행 이후 … 지연이자 지급사유가 발생하는 경우부터 적용」 → 정기지급일이 2025. 10. 23. 전이면
//         재직 중에는 붙이지 않는다. 2025. 10. 22. 정기지급일(이자 기산 10. 23.)도 붙이지 않는 쪽으로 본다(미확정 — 리서치 J1).
//         그 임금을 퇴직 때까지 받지 못했으면 §36 금품청산 대상이라 1호로 센다.
//   §37② — 2호 이자가 생긴 뒤 퇴직하면 2호 날짜를 그대로 쓴다. 정기지급일이 퇴직일 이후면(같은 날 포함) 퇴직 때 2호 의무가 없었으므로 1호.
//         퇴직일 = 근로관계가 끝난 날(마지막 근무일의 다음 날)이라 그날은 이미 재직 중이 아니다. §37② 반대 해석이며 판례·행정해석은 없다(미확정).
// 기준일이 토요일·공휴일이어도 미루지 않는다(민법 §161 미적용 — 광주지법 2010가합8213에서 14일째가 일요일이었다).
// §37③·시행령 §18 적용 제외는 「그 사유가 존속하는 기간」만 뺀다. 해당 여부는 법원이 정하므로 입력한 기간을 그대로 뺀다.
// 이자 = 원금 × 이율 × 적용일수 ÷ 365.
//   365 는 조문 숫자가 아니라 판결 계산 관행이다. 윤년에도 365(미확정).
//   원 미만은 항목마다 버리고, 합계는 버린 값을 더한다 — 근로기준법령에 끝수 규정이 없어 화면에 보이는 항목 값의 합이 합계가 되게 했다(잠정).
//   정수 계산: 금액 × 이율(100만분의 n) × 일수가 2^53 을 넘을 수 있어 BigInt 로 곱하고 나눈다. 양수 BigInt 나눗셈은 버림이다.
// 날짜는 YYYY-MM-DD, UTC 달력으로 센다.
import { rateOn, type Rate } from '@/content/rates';

export type DelayKind = 'retirement' | 'periodic';
/** retirement = 1호 · periodic = 2호 · periodic-kept = 2호(이자가 생긴 뒤 퇴직, §37②) · periodic-after-retire = 정기지급일이 퇴직 뒤라 1호
 *  · before-act-retired = 부칙 §2로 2호가 아니고 퇴직해서 1호 · before-act = 부칙 §2로 재직 중 0 */
export type DelayReason = 'retirement' | 'periodic' | 'periodic-kept' | 'periodic-after-retire' | 'before-act-retired' | 'before-act';

export interface DelayItemInput {
  /** retirement = 퇴직금 일시금·퇴직 때 정산하는 금품 · periodic = 정기지급일이 정해진 임금 */
  kind: DelayKind;
  /** 늦게 지급한(또는 아직 지급하지 않은) 금액, 원 */
  amount: number;
  /** periodic 일 때 §43②에 따라 정한 지급일 */
  periodicPayDate?: string;
  /** 실제로 지급한 날. 아직 지급하지 않았으면 계산할 날 */
  paidDate: string;
}

export interface WageDelayInput {
  /** 퇴직일(근로관계가 끝난 날 = 마지막 근무일의 다음 날) 또는 사망일. 재직 중이면 비운다 */
  retireDate?: string;
  items: DelayItemInput[];
  /** 적용 제외 기간(§37③), 양 끝 포함 */
  exclusions?: { from: string; to: string }[];
}

export interface DelayItemResult {
  amount: number;
  basis: '1호' | '2호' | 'none';
  reason: DelayReason;
  /** 이 날까지 지급해야 했던 날. basis none 이면 null */
  baseDate: string | null;
  /** 이자가 붙기 시작하는 날 = 기준일 다음 날 */
  accrualStart: string | null;
  paidDate: string;
  /** 기준일 다음 날부터 지급일까지(양 끝 포함) */
  delayDays: number;
  /** 그중 적용 제외 기간에 든 날 */
  excludedDays: number;
  /** 이자를 센 날 = delayDays − excludedDays */
  days: number;
  /** 연 100만분의 n. 셀 날이 없으면 0 */
  ratePerMillion: number;
  interest: number;
}

export interface WageDelayResult {
  items: DelayItemResult[];
  total: number;
}

/** 2호 시행일 — 법률 제20520호 부칙 §1 「공포 후 1년이 경과한 날」(2024. 10. 22. 공포) */
export const PERIODIC_FROM = '2025-10-23';
/** 1호 기한 — 지급 사유가 생긴 날부터 14일이 되는 날(초일 불산입) */
export const RETIREMENT_GRACE_DAYS = 14;

const DAY = 86_400_000;
function parse(s: string | undefined, what: string): number {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 확인해 주세요`);
  return t;
}
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** 겹치거나 이어진 기간을 하나로 합친다(양 끝 포함, ms) */
function merge(ranges: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + DAY) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function calcWageDelayInterest(input: WageDelayInput): WageDelayResult {
  if (!input.items.length) throw new Error('항목을 하나 이상 넣어 주세요');
  const retire = input.retireDate ? parse(input.retireDate, '퇴직일') : null;
  const exclusions = merge(
    (input.exclusions ?? []).map((e, i) => {
      const a = parse(e.from, `적용 제외 기간 ${i + 1}의 시작일`);
      const b = parse(e.to, `적용 제외 기간 ${i + 1}의 끝나는 날`);
      if (b < a) throw new Error(`적용 제외 기간 ${i + 1}의 끝나는 날이 시작일보다 앞섭니다`);
      return [a, b] as [number, number];
    }),
  );

  const items = input.items.map((it, i): DelayItemResult => {
    const n = `항목 ${i + 1}`;
    if (!Number.isSafeInteger(it.amount) || it.amount <= 0) throw new Error(`${n}의 금액을 원 단위로 넣어 주세요`);
    const paid = parse(it.paidDate, `${n}의 지급일`);

    let basis: DelayItemResult['basis'];
    let reason: DelayReason;
    let base: number | null;
    if (it.kind === 'retirement') {
      if (retire === null) throw new Error(`${n}은 퇴직 금품이라 퇴직일(또는 사망일)을 넣어 주세요`);
      [basis, reason, base] = ['1호', 'retirement', retire + RETIREMENT_GRACE_DAYS * DAY];
    } else {
      const due = parse(it.periodicPayDate, `${n}의 정기지급일`);
      const afterAct = due >= parse(PERIODIC_FROM, '시행일');
      if (afterAct && (retire === null || due < retire)) {
        [basis, reason, base] = ['2호', retire === null ? 'periodic' : 'periodic-kept', due];
      } else if (retire !== null) {
        [basis, reason, base] = ['1호', afterAct ? 'periodic-after-retire' : 'before-act-retired', retire + RETIREMENT_GRACE_DAYS * DAY];
      } else {
        [basis, reason, base] = ['none', 'before-act', null];
      }
    }

    if (base === null) {
      return { amount: it.amount, basis, reason, baseDate: null, accrualStart: null, paidDate: it.paidDate, delayDays: 0, excludedDays: 0, days: 0, ratePerMillion: 0, interest: 0 };
    }
    const start = base + DAY;
    const delayDays = Math.max(0, Math.round((paid - base) / DAY));
    let excludedDays = 0;
    for (const [a, b] of exclusions) {
      const lo = Math.max(a, start);
      const hi = Math.min(b, paid);
      if (hi >= lo) excludedDays += Math.round((hi - lo) / DAY) + 1;
    }
    const days = delayDays - excludedDays;

    let rate: Rate | null = null;
    if (days > 0) {
      // 기산일과 지급일의 이율이 같은 줄이어야 한다. 이율이 바뀌는 날을 지나거나 기준이 없는 날이면 계산하지 않는다.
      rate = rateOn('wageDelayInterestPerMillion', ymd(start));
      if (!rate || rate !== rateOn('wageDelayInterestPerMillion', it.paidDate)) {
        throw new Error(`${n}: ${ymd(start)}부터의 지연이자 이율 기준이 이 계산기에 없습니다`);
      }
    }
    const ratePerMillion = rate?.value ?? 0;
    const interest = Number((BigInt(it.amount) * BigInt(ratePerMillion) * BigInt(days)) / (BigInt(1_000_000) * BigInt(365)));
    return { amount: it.amount, basis, reason, baseDate: ymd(base), accrualStart: ymd(start), paidDate: it.paidDate, delayDays, excludedDays, days, ratePerMillion, interest };
  });

  return { items, total: items.reduce((s, x) => s + x.interest, 0) };
}
