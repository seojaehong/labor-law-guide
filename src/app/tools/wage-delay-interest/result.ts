// 임금 지연이자 결과 블록의 글자 — 계산(calcWageDelayInterest)은 그대로 두고, 답 문장(headline)·항목 줄(itemLine)도 copy.ts 것을 그대로 쓴다.
// 기준일: rates.ts 의 지연이자율 줄(wageDelayInterestPerMillion)의 값과 확인일에서만 만든다.
import { rateOn } from '@/content/rates';
import type { WageDelayResult } from '@/lib/calc/wage-delay-interest';
import { fmtDate } from '@/lib/tool-kit';
import { STATUS_ESTIMATE, dotDate, lawLink, won, type ResultView } from '@/components/tool-result/result-view';
import { headline, itemLine } from './copy';

const BASIS = [
  lawLink('근로기준법 제37조(미지급 임금에 대한 지연이자)', '근로기준법', '제37조'),
  lawLink('근로기준법 시행령 제17조(미지급 임금에 대한 지연이자의 이율)', '근로기준법 시행령', '제17조'),
  lawLink('근로기준법 시행령 제18조(지연이자의 적용제외 사유)', '근로기준법 시행령', '제18조'),
];

const NEXT = [
  { label: '퇴사 점검표(근로자)', href: '/exit' },
  { label: '월급 대조', href: '/tools/pay-check' },
];

/** 지연이자율 한 줄 — rates.ts 의 그날 줄에서 읽는다. 줄이 없으면 비운다 */
export function delayRateAsOf(today: string): string[] {
  const rate = rateOn('wageDelayInterestPerMillion', today);
  return rate ? [`지연이자율 연 ${rate.value / 10_000}%(근로기준법 시행령 제17조) 기준 · 확인 ${dotDate(rate.checked)}`] : [];
}

export function wageDelayView(a: {
  r: WageDelayResult;
  /** 적용 제외 기간을 넣었을 때 빼지 않은 결과 */
  full?: WageDelayResult;
  today: string;
  /** 퇴직했을 때만 — 재직 중이면 비운다 */
  lastWorkDay?: string;
}): ResultView {
  const { r, full, today, lastWorkDay } = a;
  const meta = [
    ...r.items.map((it, i) => itemLine(it, i, today)),
    ...(lastWorkDay ? [`마지막 근무일 ${fmtDate(lastWorkDay, today)}`] : []),
  ];
  const base = { status: STATUS_ESTIMATE, verdict: headline(r, full), meta, basis: BASIS, asOf: delayRateAsOf(today), next: NEXT };

  if (r.total === 0) {
    return {
      ...base,
      amounts: [],
      nextNote: '지연이자가 없어도 지급해야 할 임금·퇴직금 자체는 그대로입니다. 그 금액이 맞는지는 아래에서 다시 확인할 수 있습니다.',
    };
  }
  const excluded = r.items.some((i) => i.excludedDays > 0);
  return {
    ...base,
    amounts: excluded && full
      ? [
        { label: '지연이자(적용 제외 기간을 빼면)', value: won(r.total) },
        { label: '지연이자(빼지 않으면)', value: won(full.total) },
      ]
      : [{ label: excluded ? '지연이자(적용 제외 기간을 빼면)' : '지연이자 합계', value: won(r.total) }],
    caveat: '민법·상법 지연손해금과 적용 제외 사유에 해당하는지는 계산에 넣지 않았습니다.',
  };
}
