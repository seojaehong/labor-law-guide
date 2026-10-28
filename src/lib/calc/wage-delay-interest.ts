// 임금 지연이자 — 근로기준법 §37(법률 제20520호로 바뀐 문언, 2025. 10. 23. 시행) + 시행령 §17(연 100분의 20, rates.ts).
// §37① 「각 호에 따른 날까지 지급하지 아니한 경우 그 다음 날부터 지급하는 날까지의 지연 일수」에 이율을 곱한다.
//   1호 — §36에 따라 지급할 임금과 퇴직급여 일시금(§36의 보상금 등 임금이 아닌 금품은 1호 대상이 아니다): 지급 사유가 생긴 날부터 14일이 되는 날.
//         기준일 = 마지막 근무일(사망이면 사망일) + 14. 퇴사 정리(src/app/exit/exit-calc.ts withinDaysFromRetirement,
//         src/app/exit-employer/exit-dates.ts computeExitDates settle)와 같은 셈이다 — 퇴직일(마지막 근무일 다음 날, 0시에 시작)을
//         1일째로 센다(민법 §157 단서). 사망은 그날 중에 생기므로 사망일을 세지 않고(§157 본문) + 14 — 입력 하나로 두 경우가 같은 식이 된다.
//         조문(「지급 사유가 발생한 날부터 14일이 되는 날」)은 어느 쪽인지 못 박지 않는다. 사이트 안에서 한 가지로 두려고 퇴사 정리를 따랐다.
//         §36 단서로 지급기일을 합의해 늦춰도 기준일은 그대로다(근로기준과-3981, 2005. 7. 28.). 연장 입력을 받지 않는다.
//   2호 — §43에 따라 지급하여야 하는 임금: §43②에 따라 정하는 날(정기지급일). 입력한 날을 그대로 쓴다.
//         부칙 §2(법률 제20520호) 「이 법 시행 이후 … 지연이자 지급사유가 발생하는 경우부터 적용」 → 정기지급일이 2025. 10. 23. 전이면
//         재직 중에는 붙이지 않는다. 2025. 10. 22. 정기지급일(지연이 시행일 10. 23.부터 시작)도 붙이지 않는 쪽으로 계산하고,
//         붙인다고 보는 해석의 값을 actEveInterest 로 같이 낸다(미확정 3 — 리서치 J1).
//         그 임금을 퇴직 때까지 받지 못했으면 §36 금품청산 대상이라 1호로 센다.
//   §37② — 2호 이자가 생긴 뒤 퇴직하면 2호 날짜를 그대로 쓴다. 퇴직 전에(마지막 근무일까지) 지급을 마쳤으면 §37②가 아니라 §37①2호 그대로다.
//         정기지급일이 마지막 근무일 뒤면(상실일 포함) 퇴직 때 2호 의무가 없었으므로 1호 — §37② 반대 해석이며 판례·행정해석은 없다(미확정 10).
//         정기지급일 = 마지막 근무일이면 2호 의무가 상실일 0시, 곧 퇴직과 같은 때 생긴다. 「이후」가 같은 때를 포함한다고 보아 2호로 둔다(미확정 13).
// 기준일이 토요일·공휴일이어도 미루지 않는다 — 이 계산기의 처리다(민법 §161을 적용한 판결·행정해석을 찾지 못했다).
// §37③·시행령 §18 적용 제외는 「그 사유가 존속하는 기간」만 뺀다. 해당 여부는 법원이 정하므로 입력한 기간을 그대로 뺀다.
// 이자 = 원금 × 이율 × 적용일수 ÷ 365.
//   365 는 조문 숫자가 아니라 판결 계산 관행이다. 윤년에도 365(미확정).
//   원 미만은 항목마다 버리고, 합계는 버린 값을 더한다 — 근로기준법령에 끝수 규정이 없어 화면에 보이는 항목 값의 합이 합계가 되게 했다(잠정).
//   정수 계산: 금액 × 이율(100만분의 n) × 일수가 2^53 을 넘을 수 있어 BigInt 로 곱하고 나눈다. 양수 BigInt 나눗셈은 버림이다.
// 날짜는 YYYY-MM-DD, UTC 달력으로 센다.
import { rateOn, type Rate } from '@/content/rates';

export type DelayKind = 'retirement' | 'periodic';
/** retirement = 1호 · periodic = 2호(재직 중 지급 또는 재직 중) · periodic-kept = 2호(이자가 생긴 뒤 퇴직, §37②) · periodic-after-retire = 정기지급일이 퇴직 뒤라 1호
 *  · before-act-retired = 부칙 §2로 2호가 아니고 퇴직해서 1호 · before-act = 부칙 §2로 재직 중 0 */
export type DelayReason = 'retirement' | 'periodic' | 'periodic-kept' | 'periodic-after-retire' | 'before-act-retired' | 'before-act';

export interface DelayItemInput {
  /** retirement = 퇴직금 일시금·퇴직 때 정산하는 임금 · periodic = 정기지급일이 정해진 임금 */
  kind: DelayKind;
  /** 늦게 지급한(또는 아직 지급하지 않은) 금액, 원 */
  amount: number;
  /** periodic 일 때 §43②에 따라 정한 지급일 */
  periodicPayDate?: string;
  /** 실제로 지급한 날. 아직 지급하지 않았으면 계산할 날 */
  paidDate: string;
}

export interface WageDelayInput {
  /** 마지막 근무일(근로관계의 마지막 날 = 4대보험 상실일의 전날) 또는 사망일. 재직 중이면 비운다 */
  lastWorkDay?: string;
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
  /** 정기지급일이 시행 전날(2025. 10. 22.)이라 부칙 §2로 2호를 붙이지 않았을 때, 붙인다고 보면 나오는 값(다를 때만) */
  actEveInterest?: number;
}

export interface WageDelayResult {
  items: DelayItemResult[];
  total: number;
}

/** 2호 시행일 — 법률 제20520호 부칙 §1 「공포 후 1년이 경과한 날」(2024. 10. 22. 공포) */
export const PERIODIC_FROM = '2025-10-23';
/** 1호 기한 — 마지막 근무일(사망일)에서 14일째 되는 날 */
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

type Basis = [DelayItemResult['basis'], DelayReason, number | null];

/** 2호 임금의 기준일 — afterAct 는 부칙 §2로 2호를 붙이는지 */
function periodicBasis(due: number, paid: number, last: number | null, afterAct: boolean): Basis {
  if (afterAct && (last === null || due <= last)) {
    // 마지막 근무일까지 지급했으면 재직 중 지급(§37①2호), 그 뒤에 지급했으면 퇴직 뒤까지 남은 임금(§37②)
    return ['2호', last === null || paid <= last ? 'periodic' : 'periodic-kept', due];
  }
  if (last !== null) return ['1호', afterAct ? 'periodic-after-retire' : 'before-act-retired', last + RETIREMENT_GRACE_DAYS * DAY];
  return ['none', 'before-act', null];
}

export function calcWageDelayInterest(input: WageDelayInput): WageDelayResult {
  if (!input.items.length) throw new Error('항목을 하나 이상 넣어 주세요');
  const last = input.lastWorkDay ? parse(input.lastWorkDay, '마지막 근무일') : null;
  const exclusions = merge(
    (input.exclusions ?? []).map((e, i) => {
      const a = parse(e.from, `적용 제외 기간 ${i + 1}의 시작일`);
      const b = parse(e.to, `적용 제외 기간 ${i + 1}의 끝나는 날`);
      if (b < a) throw new Error(`적용 제외 기간 ${i + 1}의 끝나는 날이 시작일보다 앞섭니다`);
      return [a, b] as [number, number];
    }),
  );
  const actFrom = parse(PERIODIC_FROM, '시행일');

  const items = input.items.map((it, i): DelayItemResult => {
    const n = `항목 ${i + 1}`;
    if (it.amount <= 0) throw new Error(`${n}의 금액을 1원 이상으로 넣어 주세요`);
    if (!Number.isSafeInteger(it.amount)) throw new Error(`${n}의 금액은 원 단위(소수점 없이)로 넣어 주세요`);
    const paid = parse(it.paidDate, `${n}의 지급일`);

    /** 기준일에서 지급일까지 지연 일수·적용 제외·이자 */
    const accrue = (base: number) => {
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
      return { accrualStart: ymd(start), delayDays, excludedDays, days, ratePerMillion, interest };
    };

    let basis: Basis;
    let due: number | null = null;
    if (it.kind === 'retirement') {
      if (last === null) throw new Error(`${n}은 퇴직 때 정산하는 임금·퇴직금이라 마지막 근무일(또는 사망일)을 넣어 주세요`);
      basis = ['1호', 'retirement', last + RETIREMENT_GRACE_DAYS * DAY];
    } else {
      due = parse(it.periodicPayDate, `${n}의 정기지급일`);
      basis = periodicBasis(due, paid, last, due >= actFrom);
    }

    const [b, reason, base] = basis;
    const main = base === null
      ? { accrualStart: null, delayDays: 0, excludedDays: 0, days: 0, ratePerMillion: 0, interest: 0 }
      : accrue(base);
    const out: DelayItemResult = { amount: it.amount, basis: b, reason, baseDate: base === null ? null : ymd(base), paidDate: it.paidDate, ...main };
    if (due === actFrom - DAY) {
      // 시행 전날 정기지급일 — 지연은 시행일부터 시작한다. 그 지연도 「시행 이후 지급사유」로 보는 해석의 값(다를 때만)
      const alt = periodicBasis(due, paid, last, true)[2];
      const altInterest = alt === null ? 0 : accrue(alt).interest;
      if (altInterest !== main.interest) out.actEveInterest = altInterest;
    }
    return out;
  });

  return { items, total: items.reduce((s, x) => s + x.interest, 0) };
}
