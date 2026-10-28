// 중도퇴사 연말정산 계산기의 문장은 모두 여기서 만든다. 시험이 이 함수들의 출력 전부를 금지어로 훑는다.
// 세액 계산 도구 공통 장치(261028) — 결과는 「예상」으로만 말하고, 대행이 아니라고 늘 적고, 연락을 권하지 않는다.
import type { MidyearDetail, MidyearOutcome } from '@/lib/calc/midyear-settlement';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const signed = (n: number) => (n > 0 ? `+${won(n)}` : n < 0 ? `−${won(-n)}` : '0원');

/** 계산 전에 묻는 것 — 하나라도 해당하면 고정형 계산이 회사 정산과 달라진다 */
export const SCOPE_ITEMS = [
  '부양가족(배우자·자녀·부모 등) 공제를 회사에 신청했다',
  '올해 다른 회사에서 받은 급여가 있다',
  '중소기업 취업자 소득세 감면을 받는다',
  '보장성보험료·의료비·교육비·기부금·월세·연금계좌 세액공제를 신청했다',
  '일용근로자이거나 비거주자이거나, 외국인 단일세율을 적용받는다',
  '회사가 세금을 대신 내주는 세후 금액으로 계약했다',
];

export const SCOPE_STOP = [
  '이 경우는 이 도구가 계산하지 않습니다.',
  '본인 공제만 넣는 고정형으로 계산하면 회사가 실제로 정산한 금액과 달라집니다. 회사가 준 근로소득 원천징수영수증과 홈택스 연말정산 모의계산으로 확인합니다.',
];

/** 결과 아래 늘 붙는 고지 */
export const NOTICE = [
  '예상 금액입니다. 회사가 실제로 적용한 공제에 따라 달라질 수 있습니다.',
  '세무대리·신고서 작성 대행이 아닙니다. 원천징수영수증이나 신고서를 만들지 않습니다.',
];

function taxLine(s: number): string {
  if (s < 0) return `퇴직월에 소득세 ${won(-s)}을 돌려받는 것으로 예상합니다.`;
  if (s > 0) return `퇴직월에 소득세 ${won(s)}을 더 내는 것으로 예상합니다.`;
  return '퇴직월에 더 내거나 돌려받을 소득세가 없는 것으로 예상합니다.';
}

function localLine(s: number): string {
  if (s < 0) return `지방소득세는 ${won(-s)}을 돌려받는 것으로 예상합니다.`;
  if (s > 0) return `지방소득세는 ${won(s)}을 더 내는 것으로 예상합니다.`;
  return '지방소득세는 더 내거나 돌려받을 금액이 없는 것으로 예상합니다.';
}

/** 답 한 문장(두 줄) */
export function headline(o: MidyearOutcome): string[] {
  if (o.kind === 'ok') return [taxLine(o.detail.settleIncomeTax), localLine(o.detail.settleLocalTax)];
  if (o.reason === 'year') return [`${o.year}년 기준은 이 도구에 아직 넣지 않았습니다.`, '다른 해 기준으로 대신 계산하지 않습니다.'];
  if (o.reason === 'high-pay') {
    return [`총급여(받은 급여 − 비과세) ${won(o.gross)}은 1억 2천만원 이상이라 이 도구가 계산하지 않습니다.`, '근로소득세액공제 한도 구간이 달라지는 범위라 고정형에 넣지 않았습니다.'];
  }
  return [
    `더 낼 소득세가 ${won(o.detail.settleIncomeTax)}으로 1천원 미만이라 이 도구의 범위 밖입니다.`,
    '원천징수세액이 1천원 미만이면 징수하지 않는다는 규정(소득세법 제86조)이 걸리는 경우라 여기서 멈춥니다.',
  ];
}

function cut(diff: number, settled: number): string {
  return diff === settled ? `${signed(settled)}입니다` : `${signed(diff)}, 10원 미만을 0 쪽으로 버려 ${signed(settled)}입니다`;
}

/** 근거 — 왜 그 금액인가 */
export function whyLines(d: MidyearDetail): string[] {
  const pick =
    d.method === 'B'
      ? '건강·장기요양·고용보험료 소득공제(A)보다 표준세액공제 13만원(B)으로 계산한 결정세액이 작아 B로 계산했습니다.'
      : d.method === 'A'
        ? '표준세액공제 13만원(B)보다 건강·장기요양·고용보험료 소득공제(A)로 계산한 결정세액이 작아 A로 계산했습니다.'
        : '건강·장기요양·고용보험료 소득공제(A)와 표준세액공제 13만원(B)의 결정세액이 같습니다.';
  return [
    `${pick} 둘은 함께 받을 수 없습니다(소득세법 제59조의4 제9항).`,
    `예상 결정세액 ${won(d.decided)} − 이미 낸 소득세 ${won(d.paidIncomeTax)} = ${cut(d.decided - d.paidIncomeTax, d.settleIncomeTax)}(국고금 관리법 제47조).`,
    `예상 결정 지방소득세 ${won(d.decidedLocal)}(결정세액의 10%) − 이미 낸 지방소득세 ${won(d.paidLocalTax)} = ${cut(d.decidedLocal - d.paidLocalTax, d.settleLocalTax)}(지방세법 제103조의13, 지방세기본법 제59조).`,
  ];
}

/** 그래서 생기는 일 */
export function effectLines(d: MidyearDetail): string[] {
  const lines = [
    '퇴직월 급여에서는 그달 간이세액을 따로 떼지 않고 이 정산액만 반영합니다. 회사가 준 근로소득 원천징수영수증의 차감징수세액 칸과 대조합니다.',
  ];
  if (d.lastMonthSimpleTax > 0) {
    lines.push(`퇴직월 간이세액 ${won(d.lastMonthSimpleTax)}은 이미 낸 소득세에 넣지 않았습니다. 넣으면 같은 달 세금을 두 번 빼게 됩니다.`);
  }
  return lines;
}

/** 접어 둔 계산 과정 */
export function formulaLines(d: MidyearDetail): string[] {
  const r = d.rules;
  const credit = (p: MidyearDetail['a']) =>
    p.creditRaw > p.creditLimit ? `근로소득세액공제 ${won(p.credit)}(공제액 ${won(p.creditRaw)}, 한도 ${won(p.creditLimit)})` : `근로소득세액공제 ${won(p.credit)}`;
  const floorB = d.b.computed - d.b.credit - d.b.standard < 0 ? '(0 아래는 0, 소득세법 제61조)' : '';
  return [
    `총급여 = 받은 급여 합계 − 비과세 = ${won(d.gross)}(소득세법 제20조 제2항)`,
    `근로소득공제 ${won(d.earnedDeduction)}(제47조 제1항) → 근로소득금액 ${won(d.earnedIncome)}`,
    `A 과세표준 = ${won(d.earnedIncome)} − 본인 ${won(r.personal)} − 국민연금 ${won(d.pension)} − 건강·장기요양·고용 ${won(d.insurance)} = ${won(d.a.taxBase)}`,
    `A 산출세액 ${won(d.a.computed)} − ${credit(d.a)} = 결정세액 ${won(d.a.decided)}`,
    `B 과세표준 = ${won(d.earnedIncome)} − 본인 ${won(r.personal)} − 국민연금 ${won(d.pension)} = ${won(d.b.taxBase)}`,
    `B 산출세액 ${won(d.b.computed)} − ${credit(d.b)} − 표준세액공제 ${won(d.b.standard)} = 결정세액 ${won(d.b.decided)}${floorB}`,
    `결정세액 = 둘 중 작은 쪽 ${won(d.decided)} · 지방소득세 = ${won(d.decided)} × 10% = ${won(d.decidedLocal)}`,
    '끝수: 근로소득공제·과세표준·산출세액·근로소득세액공제·결정세액은 원 미만을, 정산액은 10원 미만을 0 쪽으로 버립니다.',
    `기준: ${r.year}년 귀속, ${r.basis}(조문 확인 ${r.checked}).`,
  ];
}

/** 이 도구가 다루지 않거나 확인하지 못한 것 */
export const LIMITS = [
  '부양가족·종전 근무지·감면·특별세액공제는 계산에 넣지 않습니다. 해당하면 위에서 멈춥니다.',
  '총급여 1억 2천만원 이상, 더 낼 소득세가 1천원 미만인 경우도 계산하지 않습니다.',
  '지방소득세 정산액이 1천원 미만일 때 걷지 않는지는 확인하지 못해 계산한 금액을 그대로 보여 줍니다.',
  '비과세인지는 급여명세서에 비과세로 적힌 금액(식대 등)을 따릅니다. 이 도구가 가리지 않습니다.',
  '칸마다 원 미만을 버리는 방식은 원천징수영수증 서식을 따른 것입니다. 홈택스 모의계산과 1원이 다르면 10원 단위 정산액이 달라질 수 있습니다.',
];

/** 시험용 — 한 결과에서 화면에 나올 수 있는 문장 전부 */
export function allCopy(o: MidyearOutcome): string[] {
  const lines = [...headline(o), ...NOTICE, ...SCOPE_ITEMS, ...SCOPE_STOP, ...LIMITS];
  if (o.kind === 'ok') lines.push(...whyLines(o.detail), ...effectLines(o.detail), ...formulaLines(o.detail));
  return lines;
}
