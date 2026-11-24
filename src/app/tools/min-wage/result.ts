// 최저임금 확인 결과 블록의 글자 — 계산(checkMinWage)은 그대로 두고 받은 값을 문장으로만 바꾼다.
// 해마다 한 줄씩: 판정 문장과 기준일(rates.ts 의 from·checked)을 같은 해 고시에서 만든다.
import type { MinWageInput, MinWageResult } from '@/lib/calc/min-wage';
import type { Rate } from '@/content/rates';
import { STATUS_COMPARE, lawLink, minWageAsOf, won, type ResultView } from '@/components/tool-result/result-view';

type Unit = MinWageInput['unit'];
const PER: Record<Unit, string> = { month: '한 달', week: '1주', day: '하루', hour: '1시간' };

export interface MinWageRow {
  year: number;
  rate: Rate;
  r: MinWageResult;
}

export function lineFor(year: number, min: number, unit: Unit, r: MinWageResult): string {
  const base = r.applied === min
    ? `${year}년 최저임금(시간당 ${won(min)})`
    : `${year}년 수습 기준(최저임금 ${won(min)}의 90%, 시간당 ${won(r.applied)})`;
  return r.meets ? `${base} 이상입니다.` : `${base}보다 ${PER[unit]} ${won(r.shortfall)} 적습니다.`;
}

const BASIS = [
  lawLink('최저임금법 제6조(최저임금의 효력)', '최저임금법', '제6조'),
  lawLink('최저임금법 시행령 제5조(최저임금의 적용을 위한 임금의 환산)', '최저임금법 시행령', '제5조'),
];

export function minWageView(rows: MinWageRow[], unit: Unit): ResultView {
  const first = rows[0].r;
  const short = rows.some((x) => !x.r.meets);
  return {
    status: STATUS_COMPARE,
    verdict: rows.map(({ year, rate, r }) => lineFor(year, rate.value, unit, r)),
    amounts: [{ label: '시간당 환산', value: won(first.hourly) }],
    formula: unit === 'hour'
      ? `넣은 시급 ${won(first.counted)}을 그대로 비교했습니다.`
      : `${PER[unit]} ${won(first.counted)} ÷ ${first.hours.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}시간 = 시간당 ${won(first.hourly)}`,
    basis: BASIS,
    asOf: rows.map(({ rate }) => minWageAsOf(rate)),
    caveat: '넣은 금액과 시간으로만 비교했습니다. 최저임금에 넣지 않는 수당이 섞여 있으면 결과가 달라집니다.',
    nextNote: short ? '모자란 해가 있으면 근로계약서의 임금·시간과 명세서 금액을 함께 확인해 보세요.' : undefined,
    next: short
      ? [
        { label: '근로계약서 점검', href: '/tools/contract-check' },
        { label: '월급 대조', href: '/tools/pay-check' },
      ]
      : [
        { label: '주휴수당 계산기', href: '/tools/weekly-holiday-pay' },
        { label: '실수령액 계산기', href: '/tools/take-home-pay' },
      ],
  };
}
