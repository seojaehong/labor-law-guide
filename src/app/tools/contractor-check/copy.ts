// 3.3% 계약 점검의 문장은 모두 여기서 만든다. 시험이 allCopy() 전부를 금지어로 훑는다.
// 세액 계산 도구 공통 장치(261028) — 금액은 「예상」으로만 말하고, 대행이 아니라고 늘 적고, 연락을 권하지 않는다.
// 점검 쪽은 점수·개수·확률을 내지 않고 「근로자입니다/아닙니다」로 맺지 않는다.
import type { ItemCheck, MoneyResult } from '@/lib/calc/contractor-check';
import { SOURCES } from '@/lib/calc/contractor-check';
import { formulaLines as wageFormulaLines, HOMETAX_URL, NOTICE } from '../take-home-pay/copy';

export { HOMETAX_URL, NOTICE };

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// ── ① 근로자성 요소 대조 ──

export const CHECK_HEADLINE = [
  '계약서 이름이나 3.3% 공제가 아니라 실제로 일한 모습으로 근로자인지 봅니다.',
  '항목마다 대법원 판례의 기준과 대조한 결과입니다. 근로자인지는 이 요소들을 종합해 정해지고, 이 도구는 결론을 내지 않습니다.',
];

/** 가벼운 항목(고정급·근로소득세·4대보험·취업규칙)에서 근로자가 아닌 쪽으로 답했을 때 — 판결 단서·포섭 문단의 요약(인용부호 없음) */
export const LIGHT_SENTENCE = '회사가 정할 수 있는 사정이라 이것만으로 근로자가 아니라고 쉽게 볼 수 없다는 것이 판례입니다.';

export function itemSentence(i: ItemCheck): string {
  switch (i.reading) {
    case 'worker':
      return '근로자로 볼 요소가 있습니다.';
    case 'few':
      return '근로자로 볼 요소가 적습니다.';
    case 'light':
      return LIGHT_SENTENCE;
    default:
      return '확인이 필요합니다.';
  }
}

/** 답의 글자(화면에 고른 보기) */
export function answerLabel(i: ItemCheck): string {
  return i.answer === 'yes' ? i.question.yesLabel : i.answer === 'no' ? i.question.noLabel : '모름';
}

/** 점검 결과 아래 덧붙임 */
export const CHECK_NOTES = [
  '판례는 이 밖에도 일로 생기는 이윤과 손실의 위험을 스스로 안는지, 그 회사에 계속해서 매여 일하는지(계속성·전속성)를 함께 봅니다. 이 점검은 두 가지를 따로 묻지 않습니다. 아래 판결 원문에서 확인할 수 있습니다.',
  '고정급·근로소득세·4대보험·취업규칙은 회사가 정할 수 있는 사정이라 근로자가 아닌 쪽으로 답해도 그것만으로 근로자로 볼 요소가 줄었다고 쓰지 않습니다(위 판결 이유 1. 가.).',
  '같은 판결은 사업자등록을 하고 사업소득세를 원천징수당한 학원 강사를 근로자로 보았습니다.',
];

export const SOURCE_TITLE = `[관련 판결] ${SOURCES.standard.cite}`;

// ── ② 금액 ──

export function moneyHeadline(r: MoneyResult): string[] {
  const biz = `3.3%로 떼면 ${won(r.business.takeHome)}`;
  const w = r.wage;
  if (w.status === 'ok') {
    return [`같은 보수 ${won(r.business.pay)}의 예상 실수령은 ${biz}, 근로소득으로 떼면 ${won(w.takeHome)}입니다.`];
  }
  const first = `같은 보수 ${won(r.business.pay)}의 예상 실수령은 ${biz}입니다.`;
  if (w.status === 'aboveTable') {
    return [first, `근로소득 쪽은 월 과세 급여가 1,000만원을 넘어 소득세를 계산하지 않고, 4대보험 근로자 몫 ${won(w.insurance)}만 보입니다.`];
  }
  if (w.status === 'noRates') return [first, '근로소득 쪽은 오늘 날짜에 맞는 보험료율·기준이 아직 반영되지 않아 계산하지 않았습니다.'];
  return [first, `근로소득 쪽은 계산하지 않았습니다. ${w.reason}`];
}

export interface MoneyRow {
  label: string;
  business: string;
  wage: string;
  basis: string;
}

const DASH = '—';

/** 표 한 줄씩 — 항목 · 3.3% · 근로소득 · 근거 */
export function moneyRows(r: MoneyResult): MoneyRow[] {
  const w = r.wage;
  // 4대보험은 표 밖(aboveTable)이어도 계산된다. 소득세·실수령은 표 안(ok)에서만
  const ins = w.status === 'ok' || w.status === 'aboveTable' ? w : null;
  const ok = w.status === 'ok' ? w : null;
  const tax = (n: number | undefined) => (n !== undefined ? won(n) : w.status === 'aboveTable' ? '계산하지 않음' : DASH);
  return [
    { label: '소득세', business: won(r.business.incomeTax), wage: tax(ok?.tax.incomeTax), basis: '3.3% 쪽 소득세법 제129조제1항제3호(3%) · 근로소득 쪽 간이세액표(시행령 [별표2])' },
    { label: '지방소득세', business: won(r.business.localTax), wage: tax(ok?.tax.localTax), basis: '지방세법 제103조의13제1항(소득세의 10%)' },
    { label: '국민연금', business: DASH, wage: ins ? won(ins.nps) : DASH, basis: '근로자 몫. 3.3% 쪽은 회사가 떼지 않습니다' },
    { label: '건강보험', business: DASH, wage: ins ? won(ins.health) : DASH, basis: '근로자 몫' },
    { label: '장기요양보험', business: DASH, wage: ins ? won(ins.ltc) : DASH, basis: '근로자 몫' },
    { label: '고용보험', business: DASH, wage: ins ? won(ins.employment) : DASH, basis: '근로자 몫' },
    { label: '예상 실수령', business: won(r.business.takeHome), wage: tax(ok?.takeHome), basis: '보수 − 위 공제' },
  ];
}

/** 그래서 생기는 일 — 두 값이 왜 「예상」인가 */
export const MONEY_NOTES = [
  '3.3%는 미리 떼는 금액입니다. 1년 소득은 다음 해 5월 종합소득세 확정신고(소득세법 제70조제1항)에서 다시 계산해 더 내거나 돌려받습니다. 보험모집인·방문판매원처럼 사업소득을 연말정산하는 경우는 다를 수 있습니다.',
  '3.3% 쪽 실수령에는 본인이 따로 내는 지역가입자 건강보험료와 국민연금 보험료가 빠져 있습니다(국민건강보험법 제6조제3항). 소득과 재산으로 정해져 이 도구가 계산하지 않습니다.',
  '근로소득 쪽 소득세도 간이세액표로 매달 떼는 금액이라 1년 치는 연말정산에서 달라집니다(소득세법 제137조).',
  '근로소득 쪽은 국민연금·건강보험·고용보험이 모두 적용된다고 보고 셈했습니다. 근로자라도 월 소정근로시간이 60시간 미만인 단시간 근로자 등은 일부 보험이 적용되지 않을 수 있습니다(국민연금법 시행령 제2조, 국민건강보험법 시행령 제9조, 고용보험법 시행령 제3조제1항).',
];

export const HOMETAX_LINE = '홈택스(국세청)의 모의계산으로 한 번 더 볼 수 있습니다.';

/** 산식 — 3.3% 쪽은 여기서, 근로소득 쪽은 실수령액 계산기의 산식 문장을 그대로 쓴다 */
export function formulaLines(r: MoneyResult, meal: number): string[] {
  const b = r.business;
  const lines = [
    `3.3% 쪽 소득세 = 지급액 ${won(b.pay)} × 3% = ${won(b.incomeTax)}(10원 미만 버림, 국고금 관리법 제47조제1항)`,
    `3.3% 쪽 지방소득세 = 소득세 ${won(b.incomeTax)} × 10% = ${won(b.localTax)}(10원 미만 버림)`,
    `3.3% 쪽 예상 실수령 = ${won(b.pay)} − ${won(b.incomeTax)} − ${won(b.localTax)} = ${won(b.takeHome)}`,
  ];
  if (meal > 0) lines.push('식대도 사업소득이라 3%를 매깁니다. 식대 비과세(소득세법 제12조제3호러목)는 근로소득에만 있습니다.');
  if (b.incomeTax > 0 && b.incomeTax < 1_000) {
    lines.push('소득세가 1천원 미만이어도 뗍니다. 인적 용역을 계속·반복해서 제공하고 받는 소득은 소액 부징수(소득세법 제86조제1호)에서 빠집니다(시행령 제149조의3, 2024. 7. 1. 이후 지급분).');
  }
  const w = r.wage;
  if ((w.status === 'ok' || w.status === 'aboveTable') && r.rates) {
    lines.push('근로소득 쪽(아래는 월 보수를 월 급여로 넣은 실수령액 계산기와 같은 산식):', ...wageFormulaLines(w, r.rates));
  }
  return lines;
}

// ── 근로자로 인정되면 ──

export const AFTER_LEAD = '근로자로 인정되면 아래 조문이 적용됩니다. 금액은 근로 기간·임금·사업장 규모에 따라 달라 이 도구가 계산하지 않습니다.';

export const AFTER_RECOGNITION = [
  '근로자 — 직업의 종류와 관계없이 임금을 목적으로 사업이나 사업장에 근로를 제공하는 사람(근로기준법 제2조제1항제1호). 퇴직급여도 이 정의를 따릅니다(근로자퇴직급여 보장법 제2조제1호).',
  '퇴직금 — 계속근로기간 1년에 대하여 30일분 이상의 평균임금(근로자퇴직급여 보장법 제8조제1항). 계속근로기간이 1년 미만이거나 4주 평균 1주 소정근로시간이 15시간 미만이면 제외되고(제4조제1항 단서), 동거하는 친족만 쓰는 사업과 가구 내 고용활동에는 적용되지 않습니다(제3조). 3년간 행사하지 않으면 시효로 소멸합니다(제10조). 해마다 계약을 다시 맺어 그 사이에 공백이 있어도 근로관계가 계속된 것으로 본 판례가 있습니다(위 판결 이유 1. 나.).',
  '연차유급휴가 — 1년간 80% 이상 출근하면 15일(근로기준법 제60조제1항), 1년 미만 근로자 등은 1개월 개근하면 1일(제2항), 3년 이상 계속 근로하면 2년마다 1일씩 더해 25일까지(제4항). 상시 4명 이하 사업장(제11조제2항, 시행령 제7조 [별표 1])과 4주 평균 1주 소정근로시간이 15시간 미만인 근로자(제18조제3항)에게는 적용되지 않습니다.',
  '임금 — 임금채권은 3년간 행사하지 않으면 시효로 소멸합니다(근로기준법 제49조).',
  '4대보험 — 국민연금은 당연적용사업장의 18세 이상 60세 미만 근로자(국민연금법 제8조제1항), 건강보험은 모든 사업장의 근로자(국민건강보험법 제6조제2항), 고용보험(고용보험법 제8조제1항)과 산재보험(산업재해보상보험법 제6조)은 근로자를 사용하는 모든 사업에 적용됩니다. 월 60시간 미만 단시간 근로자 등은 일부 보험에서 빠집니다.',
  '지난 기간의 보험료 — 보험료를 징수할 권리는 3년간 행사하지 않으면 소멸합니다(국민연금법 제115조제1항, 국민건강보험법 제91조제1항제1호, 고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 제41조제1항). 고용보험은 피보험자였던 사람이 언제든지 피보험자격의 취득·상실 확인을 청구할 수 있습니다(고용보험법 제17조제1항). 거슬러 내는 금액과 그 부담은 사정마다 달라 이 도구가 다루지 않습니다.',
];

// ── 입력 안내 · 범위 밖 ──

export const INPUT_GUIDE = [
  '월 보수: 한 달에 받기로 한 금액 전부(3.3%를 떼기 전)입니다. 근로소득 쪽은 같은 금액을 월 급여로 넣어 셈합니다.',
  '그중 식대: 근로소득 쪽에서만 월 20만원까지 비과세로 뺍니다(소득세법 제12조제3호러목). 3.3% 쪽은 식대까지 지급액 전액에 매깁니다.',
  '공제대상가족: 본인과 배우자를 각각 1명으로 세고 기본공제 대상 부양가족을 더합니다. 근로소득 쪽은 8세 이상 20세 이하 자녀 공제 없이 원천징수 비율 100%로 셈합니다. 자녀 공제나 80%·120%는 실수령액 계산기에서 봅니다.',
  '질문은 계약서 문구가 아니라 실제로 일한 모습대로 답합니다. 모르면 「모름」으로 두면 됩니다.',
];

export const OUT_OF_SCOPE = [
  '일용근로자인지와 일용근로소득 세액',
  '3.3% 쪽의 1년 최종 세액(필요경비, 다른 소득 합산, 환급과 추가 납부)과 이미 뗀 3.3%를 근로소득 원천징수로 바로잡는 정산',
  '지역가입자 건강보험료·국민연금 보험료',
  '근로자로 인정될 때의 퇴직금·연차수당·지난 기간 보험료 금액과 그 부담',
  '사업주가 내는 4대보험·퇴직급여 비용',
  '노무제공자·예술인 고용보험과 산재보험 노무제공자 특례(근로자가 아닌 채로 가입하는 다른 제도)',
  '노동조합법상 근로자인지(기준이 다릅니다)',
  '외국인 직업운동가(20%)·의료보건 용역 같은 특수한 사업소득, 2024. 6. 30. 이전 지급분',
];

/** 화면에 나올 수 있는 문장 전부 — 금지어 시험용 */
export function allCopy(items: ItemCheck[], r: MoneyResult, meal = 0): string[] {
  return [
    ...CHECK_HEADLINE,
    ...items.flatMap((i) => [i.question.text, i.question.element, i.question.yesLabel, i.question.noLabel, answerLabel(i), itemSentence(i)]),
    ...CHECK_NOTES,
    SOURCE_TITLE,
    SOURCES.standard.where,
    SOURCES.standard.quote,
    SOURCES.applied.where,
    SOURCES.applied.quote,
    ...moneyHeadline(r),
    ...moneyRows(r).flatMap((x) => [x.label, x.business, x.wage, x.basis]),
    ...MONEY_NOTES,
    NOTICE,
    HOMETAX_LINE,
    ...formulaLines(r, meal),
    AFTER_LEAD,
    ...AFTER_RECOGNITION,
    ...INPUT_GUIDE,
    ...OUT_OF_SCOPE,
  ];
}
