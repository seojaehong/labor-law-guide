// 중도퇴사 연말정산 결과 블록의 글자 — 계산(calcMidyear)과 문장(copy.ts headline·whyLines·effectLines)은 그대로 두고 블록 칸에 나눠 담는다.
// 세무 계산기라 「예상」을 금액 이름에도 붙이고, 원천징수의무자 고지(D4 261126)·홈택스 링크는 화면(Notice)이 블록 안에 글자 그대로 싣는다.
// 결정세액이 다르면 A·B 를 금액 칸 둘로 같은 무게로 낸다 — 하나를 고르지 않는다(261029 결정).
// 범위 밖·기준 없는 해·총급여 1.2억 이상은 멈춘다: 금액 칸 없이 문장만, 상태 띠는 「계산하지 않음」.
// 기준일: 그해 규칙(rules.year·basis·checked)에서만 만든다. 멈춤에는 달지 않는다.
import type { MidyearDetail, MidyearOutcome } from '@/lib/calc/midyear-settlement';
import { STATUS_ESTIMATE, STATUS_STOP, dotDate, lawLink, type ResultAmount, type ResultLink, type ResultView } from '@/components/tool-result/result-view';
import { effectLines, headline, paths, SCOPE_STOP, signed, small, whyLines } from './copy';

export { STATUS_STOP } from '@/components/tool-result/result-view';

const BASIS: ResultLink[] = [
  lawLink('소득세법 제47조', '소득세법', '제47조'),
  lawLink('소득세법 제52조', '소득세법', '제52조'),
  lawLink('소득세법 제59조', '소득세법', '제59조'),
  lawLink('소득세법 제59조의4', '소득세법', '제59조의4'),
  lawLink('소득세법 제137조', '소득세법', '제137조'),
  lawLink('지방세법 제103조의13', '지방세법', '제103조의13'),
];

const NEXT: ResultLink[] = [
  { label: '퇴사 점검표', href: '/exit' },
  { label: '퇴직소득세 계산기', href: '/tools/retirement-tax' },
];

const STOP_NOTE = '회사가 준 근로소득 원천징수영수증의 차감징수세액 칸에서 퇴직월 정산액을 확인합니다.';
const NOT_COLLECTED = '1천원 미만이라 징수하지 않음(소득세법 제86조 제1호)';

const LABEL: Record<string, string> = {
  '': '예상 소득세 정산액(퇴직월)',
  A: 'A 보험료 소득공제를 신청했다면 · 예상 소득세 정산액',
  B: 'B 신청하지 않았다면 · 예상 소득세 정산액',
};

function amountsOf(d: MidyearDetail): ResultAmount[] {
  return paths(d).map(([name, p]) => ({
    label: LABEL[name],
    value: signed(p.settleIncomeTax),
    note: [`지방소득세 ${signed(p.settleLocalTax)}`, ...(small(p.settleIncomeTax) ? [NOT_COLLECTED] : [])],
  }));
}

function stop(verdict: string[]): ResultView {
  return { status: STATUS_STOP, verdict, amounts: [], basis: [], asOf: [], nextNote: STOP_NOTE, next: NEXT };
}

export function midyearView(o: MidyearOutcome): ResultView {
  if (o.kind !== 'ok') return stop(headline(o));
  const d = o.detail;
  const r = d.rules;
  const nothing = paths(d).every(([, p]) => p.settleIncomeTax === 0 && p.settleLocalTax === 0);
  return {
    status: STATUS_ESTIMATE,
    verdict: headline(o),
    meta: whyLines(d),
    amounts: amountsOf(d),
    formula: '+는 퇴직월에 더 내는 금액, −는 돌려받는 금액입니다.',
    warnings: effectLines(d),
    basis: BASIS,
    asOf: [`${r.year}년 귀속 · ${r.basis} 기준 · 조문 확인 ${dotDate(r.checked)}`],
    ...(nothing && { nextNote: '예상 결정세액과 이미 낸 세금의 차이가 10원 미만이라 예상 정산액이 0원입니다.' }),
    next: NEXT,
  };
}

/** 범위 질문에 「하나라도 있다」 — 결과를 내지 않는다. 문장은 SCOPE_STOP 그대로 */
export function midyearScopeStopView(): ResultView {
  return stop(SCOPE_STOP);
}
