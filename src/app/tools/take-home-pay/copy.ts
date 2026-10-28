// 실수령액 계산기의 문장은 모두 여기서 만든다. 시험이 allCopy() 전부를 금지어로 훑는다.
import type { TakeHomeRates, TakeHomeResult } from '@/lib/calc/take-home-pay';

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 100만분의 n → 「4.75%」 */
const pct = (perMillion: number) => `${(perMillion / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}%`;
const thousand = (n: number) => `${(n / 1000).toLocaleString('ko-KR')}천원`;
/** a ÷ b 를 백분율 소수 넷째 자리까지(표시만, 계산에는 쓰지 않는다) */
const ratioPct = (a: number, b: number) => `${((a / b) * 100).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}%`;

export const NOTICE = '세무대리·신고서 작성 대행이 아닙니다. 입력한 숫자로 계산한 예상 금액입니다.';
export const HOMETAX_URL = 'https://www.hometax.go.kr/';
// 메뉴 경로는 홈택스 화면에서 확인하지 못해 적지 않는다(공개 안내가 「세금신고 → 원천세 신고」와 「조회·발급 → 기타조회」로 갈린다)
export const HOMETAX_LINE = '홈택스의 「근로소득 간이세액표」(매달 떼는 소득세)와 「연말정산 미리보기」(1년 치)로 한 번 더 볼 수 있습니다.';

export function headline(r: TakeHomeResult): string[] {
  if (r.status === 'aboveTable') {
    return ['월 과세 급여가 1,000만원을 넘어 이 도구는 소득세를 계산하지 않습니다.', `4대보험 근로자 몫은 ${won(r.insurance)}으로 예상됩니다.`];
  }
  return [
    `예상 실수령액은 ${won(r.takeHome)}입니다.`,
    `월 급여 ${won(r.pay)}에서 4대보험 ${won(r.insurance)}과 소득세·지방소득세 ${won(r.tax.incomeTax + r.tax.localTax)}을 뺐습니다.`,
  ];
}

export interface Item {
  label: string;
  amount: string;
  basis: string;
}

/** 공제 항목 한 줄씩 — 이름 · 금액 · 근거 */
export function items(r: TakeHomeResult): Item[] {
  const rows: Item[] = [
    { label: '국민연금', amount: r.npsBase === null ? '0원' : won(r.nps), basis: r.npsBase === null ? '공제 대상이 아님으로 골랐습니다' : '국민연금법 제88조제3항·부칙 제4조, 시행령 제5조' },
    { label: '건강보험', amount: won(r.health), basis: '국민건강보험법 제69조제4항·제76조제1항, 시행령 제44조제1항' },
    { label: '장기요양보험', amount: won(r.ltc), basis: '노인장기요양보험법 제9조제1항, 시행령 제4조' },
    { label: '고용보험', amount: won(r.employment), basis: r.employmentExempt ? '만 65세 이후 새로 고용됨으로 골랐습니다(보험료징수법 제13조제3항)' : '보험료징수법 제13조제2항, 시행령 제12조제1항제2호' },
  ];
  if (r.status === 'aboveTable') {
    rows.push(
      { label: '소득세', amount: '계산하지 않음', basis: '과세 급여 1,000만원 초과' },
      { label: '지방소득세', amount: '계산하지 않음', basis: '과세 급여 1,000만원 초과' },
    );
  } else {
    rows.push(
      {
        label: '소득세',
        amount: won(r.tax.incomeTax),
        basis: r.tax.ratioTax > 0 && r.tax.incomeTax === 0
          ? `계산한 ${won(r.tax.ratioTax)}이 1천원 미만이라 징수하지 않습니다(소득세법 제86조제1호)`
          : '소득세법 제134조제1항, 시행령 제189조제1항 [별표2]·제194조제1항',
      },
      { label: '지방소득세', amount: won(r.tax.localTax), basis: '지방세법 제103조의13제1항' },
    );
  }
  return rows;
}

/** 그래서 생기는 일 — 왜 「예상」인가 */
export const CONSEQUENCES = [
  '소득세는 간이세액표로 매달 떼는 금액입니다. 1년 치는 연말정산에서 다시 계산해 더 내거나 돌려받습니다(소득세법 제137조).',
  '국민연금은 회사가 신고한 소득월액(시행령 제5조), 건강보험은 전년도 보수로 정한 보수월액(국민건강보험법 시행령 제36조)에 매깁니다. 이번 달 급여로 계산한 이 금액과 달라질 수 있습니다.',
];

/** 산식 — 항목마다 넣은 숫자와 끝수 처리 */
export function formulaLines(r: TakeHomeResult, rates: TakeHomeRates): string[] {
  const lines = [
    `과세 급여 = 월 급여 ${won(r.pay)} − 비과세 ${won(r.nonTax)}(식대 중 ${won(r.mealNonTax)} + 그 밖의 비과세 ${won(r.nonTax - r.mealNonTax)}) = ${won(r.taxable)}. 식대는 월 ${won(rates.mealNonTaxCap)}까지만 비과세입니다.`,
    r.npsBase === null
      ? '국민연금 = 0원(공제 대상이 아님)'
      : `국민연금 = 기준소득월액 ${won(r.npsBase)}(과세 급여의 천원 미만 버림, 하한 ${won(rates.npsFloor)}·상한 ${won(rates.npsCap)}) × ${pct(rates.npsPerMillion)} = ${won(r.nps)}(10원 미만 버림)`,
    `건강보험 = 과세 급여 × ${pct(rates.healthPerMillion * 2)} = ${won(r.healthTotal)}(10원 미만 버림, 월 하한 ${won(rates.healthPremiumFloor)}·상한 ${won(rates.healthPremiumCap)})의 절반 = ${won(r.health)}`,
    `장기요양보험 = 건강보험료(근로자 몫) ${won(r.health)} × ${pct(rates.ltcToHealthPerMillion)}(보건복지부가 공표한 건강보험료 대비 장기요양보험료율. 두 요율을 나누면 ${pct(rates.ltcPerMillion * 2)} ÷ ${pct(rates.healthPerMillion * 2)} = 약 ${ratioPct(rates.ltcPerMillion, rates.healthPerMillion)}) = ${won(r.ltc)}(10원 미만 버림). 공표 비율로 셈한 예상값이라 공단 고지와 10원 다를 수 있습니다.`,
    r.employmentExempt
      ? '고용보험 = 0원(만 65세 이후 새로 고용됨)'
      : `고용보험 = 과세 급여 × ${pct(rates.employmentPerMillion)} = ${won(r.employment)}(10원 미만 버림)`,
  ];
  if (r.status === 'aboveTable') {
    lines.push('소득세 = 간이세액표는 월급여액 1,000만원까지입니다. 넘는 금액의 공식은 이 도구가 아직 쓰지 않습니다.');
    return lines;
  }
  const t = r.tax;
  const where = t.row === null
    ? '월급여액 770천원 미만이라 표의 첫 행보다 아래 — 0원'
    : t.row[0] === t.row[1]
      ? `월급여액 ${thousand(t.row[0])} 행`
      : `월급여액 ${thousand(t.row[0])} 이상 ${thousand(t.row[1])} 미만 행`;
  const column = t.family <= 11
    ? `가족 ${t.family}명 칸 ${won(t.tableTax)}`
    : `가족 ${t.family}명(11명 초과 — 11명 칸에서 10명·11명 칸 차이 × 초과 인원을 뺌, 별표2 제4호) ${won(t.tableTax)}`;
  const minimum = t.ratioTax > 0 && t.incomeTax === 0
    ? ` → 1천원 미만이라 징수하지 않음(소득세법 제86조제1호) = 0원`
    : '';
  lines.push(
    `소득세 = 간이세액표 ${where} · ${column} − 8세 이상 20세 이하 자녀 공제 ${won(t.childDeduction)}(0원 아래로 내려가지 않음) → × ${t.ratio}% = ${won(t.ratioTax)}(10원 미만 버림)${minimum}`,
    `지방소득세 = 소득세 ${won(t.incomeTax)} × 10% = ${won(t.localTax)}(10원 미만 버림)`,
    `실수령액 = 월 급여 ${won(r.pay)} − 공제 합계 ${won(r.deduction)} = ${won(r.takeHome)}`,
  );
  return lines;
}

/** 이 도구가 다루지 않는 것 */
export const OUT_OF_SCOPE = [
  '월 과세 급여 1,000만원을 넘는 소득세',
  '월 60시간 미만 단시간 근로자, 일용근로자, 3.3%를 떼는 사업소득',
  '입사하거나 퇴사한 달의 일할 계산과 정산, 중도퇴사 연말정산',
  '두 곳 이상에서 일하는 경우(종된 근무지)',
  '외국인 근로자의 국민연금·건강보험 특례',
  '국외근로·생산직 연장근로수당처럼 요건을 따져야 하는 비과세',
  '두루누리 사회보험료 지원, 중소기업 취업자 소득세 감면 같은 감면·지원',
  '받는 금액에서 세전 급여를 거꾸로 구하는 계산',
  '연말정산에서 더 내거나 돌려받을 금액',
];

/** 화면에 나올 수 있는 문장 전부 — 금지어 시험용 */
export function allCopy(r: TakeHomeResult, rates: TakeHomeRates): string[] {
  return [
    ...headline(r),
    ...items(r).flatMap((i) => [i.label, i.amount, i.basis]),
    ...CONSEQUENCES,
    NOTICE,
    HOMETAX_LINE,
    ...formulaLines(r, rates),
    ...OUT_OF_SCOPE,
  ];
}
