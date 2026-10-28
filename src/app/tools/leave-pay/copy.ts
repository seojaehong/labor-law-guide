// 연차수당 계산기의 문장은 모두 여기서 만든다. 시험이 allCopy() 전부를 금지어와 시효 게이트로 훑는다.
// 사용 촉진(§61)은 금액을 바꾸지 않는다 — 「했다면 지급 의무가 없을 수 있다」는 조건부 안내만 붙인다.
// 소멸시효는 말하지 않는다(leave-advanced.ts 제우스 게이트 — 개별 일수와 엮지 않는다).
import type { LeavePayResult } from '@/lib/calc/leave-pay';

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 소수 둘째 자리까지 — 시간급·1일 단가 */
const dec = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

function differenceLine(r: LeavePayResult): string[] {
  if (r.difference === null || r.alreadyPaid === null) return [];
  if (r.difference === 0) return ['회사 지급액과 같습니다.'];
  return r.difference > 0
    ? [`계산한 금액이 회사 지급액 ${won(r.alreadyPaid)}보다 ${won(r.difference)} 많습니다.`]
    : [`회사 지급액 ${won(r.alreadyPaid)}이 ${won(-r.difference)} 많습니다.`];
}

/** 답 — 맨 위 굵은 문장들 */
export function headline(r: LeavePayResult): string[] {
  switch (r.status) {
    case 'under5':
      return ['법정 연차수당을 계산하지 않습니다.', '상시 근로자 4명 이하 사업장에는 연차휴가(근로기준법 제60조)가 적용되지 않습니다.'];
    case 'under15h':
      return ['법정 연차수당을 계산하지 않습니다.', '4주 평균 1주 소정근로시간이 15시간 미만이면 연차휴가(근로기준법 제60조)가 적용되지 않습니다.'];
    case 'out-of-scope':
      return ['이 도구가 계산하지 않습니다.', '주휴 말고도 유급으로 정한 시간(토요일 유급 등)이 있으면 시간급을 구하는 기준시간이 달라집니다.'];
  }
  const lead = `${r.timing === 'termination' ? '퇴직 시 ' : ''}미사용 연차수당은 ${won(r.amount!)}입니다.`;
  const how = r.partTime
    ? `남은 연차 ${dec(r.partTime.unusedHours)}시간 × 시간급 ${dec(r.hourly!)}원`
    : `남은 연차 ${dec(r.unusedDays!)}일 × 1일 ${r.rateBasis === 'average-wage' ? '평균임금' : '통상임금'} ${dec(r.dailyRate!)}원`;
  return [lead, how, ...differenceLine(r)];
}

/** 산식 — 넣은 숫자와 끝수 처리 */
export function formulaLines(r: LeavePayResult): string[] {
  switch (r.status) {
    case 'under5':
      return ['근로기준법 시행령 제7조 [별표1]은 상시 4명 이하 사업장에 적용하는 제4장 규정을 제54조, 제55조제1항, 제63조로 정합니다. 제60조(연차휴가)와 제61조(사용 촉진)는 들어 있지 않습니다.'];
    case 'under15h':
      return ['근로기준법 제18조제3항 — 4주 동안(4주 미만이면 그 기간)을 평균한 1주 소정근로시간이 15시간 미만인 근로자에게는 제55조(휴일)와 제60조(연차휴가)를 적용하지 않습니다.'];
    case 'out-of-scope':
      return ['주급·월급을 시간급으로 바꿀 때 나누는 시간은 1주 소정근로시간에 소정근로시간 밖에 유급으로 정한 시간을 더해 셉니다. 월급은 그 합계 × 365 ÷ 7 ÷ 12입니다(근로기준법 시행령 제6조제2항제3호·제4호). 이 도구는 유급 시간으로 주휴만 넣습니다. 주 40시간에 주휴 8시간과 토요일 유급 4시간이면 월 226시간인데, 주휴만 넣으면 209시간이 됩니다.'];
  }

  const lines: string[] = [];
  if (r.rateBasis === 'ordinary-wage') {
    const holiday = r.weekPaidHours !== null ? r.weekPaidHours - r.weeklyHours : 0;
    if (r.unit === 'month') {
      const exact = (r.weekPaidHours! * 365) / 84;
      lines.push(`월 기준시간 = (${dec(r.weeklyHours)} + ${dec(holiday)}) × 365 ÷ 7 ÷ 12 = ${dec(exact)} → ${dec(r.hours!)}시간. 1주 소정근로시간에 주휴 ${dec(holiday)}시간을 더했습니다(근로기준법 시행령 제6조제2항제4호). 반올림은 고용노동부 고시의 209시간과 같은 관행이고 시행령 문언에는 없습니다.`);
    } else if (r.unit === 'week') {
      lines.push(`주 기준시간 = 1주 소정근로시간 ${dec(r.weeklyHours)}시간 + 주휴 ${dec(holiday)}시간 = ${dec(r.hours!)}시간(시행령 제6조제2항제3호)`);
    } else if (r.unit === 'day') {
      lines.push(`일급은 1일 소정근로시간 ${dec(r.hours!)}시간으로 나눕니다(시행령 제6조제2항제2호).`);
    } else {
      lines.push('시급은 그 금액이 시간급입니다(시행령 제6조제2항제1호).');
    }
    if (r.unit !== 'hour') lines.push(`시간급 = ${won(Math.round(r.hourly! * r.hours!))} ÷ ${dec(r.hours!)}시간 = ${dec(r.hourly!)}원`);
  }

  if (r.partTime) {
    const p = r.partTime;
    const rounded = Math.abs(p.rawGrantHours - p.grantHours) > 1e-9 ? ` → ${dec(p.grantHours)}시간. 1시간 미만은 1시간으로 봅니다` : '';
    lines.push(`연차 시간 = 통상 근로자 연차 ${dec(p.fullTimeDays)}일 × (1주 소정 ${dec(r.weeklyHours)}시간 ÷ 통상 근로자 ${dec(p.fullTimeWeeklyHours)}시간) × 8시간 = ${dec(p.rawGrantHours)}시간${rounded}(시행령 별표2 제4호나목).`);
    lines.push(`남은 시간 = ${dec(p.grantHours)}시간 − 이미 쓴 ${dec(p.usedHours)}시간 = ${dec(p.unusedHours)}시간. 하루 쉬면 1일 소정근로시간 ${dec(p.dailyHours)}시간(4주 소정근로시간 ÷ 통상 근로자의 4주 소정근로일 20일, 별표2 제2호나목)만큼 씁니다.`);
    lines.push(`수당 = ${dec(p.unusedHours)}시간 × 시간급 ${dec(r.hourly!)}원 = ${dec(r.raw!)}원 → ${won(r.amount!)}(시간급 기준, 별표2 제4호마목)`);
  } else {
    if (r.rateBasis === 'ordinary-wage') {
      lines.push(`1일 통상임금 = 시간급 ${dec(r.hourly!)}원 × 1일 소정근로시간 ${dec(r.dailyHours)}시간 = ${dec(r.dailyRate!)}원(시행령 제6조제3항)`);
    } else {
      lines.push(`1일 평균임금 ${won(r.dailyRate!)} — 취업규칙 등이 평균임금으로 정해 넣은 단가를 그대로 씁니다. 이 도구는 평균임금을 산정하지 않습니다.`);
    }
    if (r.ledger) {
      const parts = r.ledger.entries.map((e) => `${e.label} ${e.days}일`).join(' + ');
      lines.push(`남은 일수 = 발생 누계(${parts || '없음'}) ${r.ledger.total}일 − 이미 쓰거나 수당으로 받은 ${dec(r.ledger.used)}일 = ${dec(r.unusedDays!)}일. 1년 근로 직후 끝나면 11일, 그다음 날까지 재직하면 15일이 더 생깁니다(대법원 2021. 10. 14. 선고 2021다227100 판결, 2022. 9. 7. 선고 2022다245419 판결).`);
    }
    lines.push(`수당 = ${dec(r.unusedDays!)}일 × ${dec(r.dailyRate!)}원 = ${dec(r.raw!)}원 → ${won(r.amount!)}`);
  }
  lines.push('원 미만 처리는 법령에 정함이 없어 마지막에 한 번 버립니다. 1일 통상임금을 먼저 원 단위로 버리면 몇 원 적게 나올 수 있습니다.');
  return lines;
}

/** 근거와 그래서 생기는 일 */
export function effectLines(r: LeavePayResult): string[] {
  if (r.status === 'under5' || r.status === 'under15h') return ['근로계약서나 취업규칙에 연차를 따로 정했다면 그 약정에 따릅니다.'];
  if (r.status === 'out-of-scope') return ['급여명세서·취업규칙에 적힌 기준시간으로 시간급을 구해 「시급」으로 넣으면 계산할 수 있습니다.'];

  const lines = [
    r.rateBasis === 'average-wage'
      ? `취업규칙 등이 평균임금으로 정했으면 평균임금으로 계산합니다(근로기준법 ${r.payArticle}).`
      : `연차수당은 취업규칙 등에 정함이 없으면 통상임금으로 계산합니다(근로기준법 ${r.payArticle}, 대법원 2019. 10. 18. 선고 2018다239110 판결).`,
  ];
  if (r.timing === 'employed') {
    lines.push('연차를 쓸 수 있는 1년이 끝난 다음 날 수당을 청구할 수 있게 되고, 단체협약 등에 정함이 없으면 그 뒤 처음 오는 정기 임금지급일에 지급합니다(근로기준법 제43조제2항, 근기68207-988).');
    lines.push('넣을 임금은 휴가를 청구할 수 있던 마지막 달의 통상임금입니다(근로개선정책과-4218). 미리 지급한 뒤 통상임금이 올랐으면 차액을 더 지급합니다(근로개선정책과-3077).');
    return lines;
  }
  lines.push('퇴직한 날부터 14일 이내에 지급합니다. 특별한 사정이 있으면 당사자가 합의해 기일을 연장할 수 있습니다(근로기준법 제36조).');
  lines.push('퇴직하는 해에 쓸 수 있었던 일수와 상관없이 남은 연차 전부에 대해 지급합니다(대법원 2005. 5. 27. 선고 2003다48549, 48556 판결). 단가는 지급할 때의 임금입니다(근기01254-13399).');
  const excluded = '퇴직으로 비로소 생긴 수당이면 퇴직금의 평균임금에 넣지 않습니다(근로복지과-1715).';
  const included = '퇴직 전에 이미 지급 사유가 생겨 있던 수당이면 그 3/12을 퇴직금의 평균임금에 넣습니다(임금68207-173). 퇴직금은 퇴직금 계산기에서 따로 봅니다.';
  if (r.averageWage === 'excluded') lines.push(excluded);
  else if (r.averageWage === 'three-twelfths') lines.push(included);
  else lines.push(excluded, included);
  return lines;
}

/** 사용 촉진 안내 — 금액은 그대로다 */
export function promotionLines(r: LeavePayResult): string[] {
  if (r.status !== 'calculated') return [];
  if (r.promotion === 'none') return ['회사가 연차 사용 촉진을 하지 않았으면 남은 연차만큼 지급합니다(근로기준과-161).'];
  if (r.promotion === 'unknown') {
    return ['회사가 연차 사용 촉진을 했는지 모르면 금액은 그대로 둡니다. 촉진을 했다고 하면 아래 「촉진을 했어도 지급하는 경우」와 맞춰 봅니다.'];
  }
  return [
    '회사가 ① 연차를 쓸 수 있는 기간이 끝나기 6개월 전을 기준으로 10일 이내에 남은 일수를 알리며 쓸 시기를 정해 달라고 서면으로 촉구했고, ② 근로자가 10일 안에 정하지 않자 끝나기 2개월 전까지 쓸 날을 정해 서면으로 알렸고, ③ 그날 출근한 근로자에게 일을 받지 않겠다고 분명히 밝혔는데도 근로자가 스스로 쓰지 않았다면, 근로기준법 제61조제1항에 따라 지급 의무가 없을 수 있습니다.',
    '1년 미만 근로자의 월 연차는 기준이 다릅니다. 최초 1년이 끝나기 3개월 전·1개월 전(촉구 뒤에 생긴 연차는 1개월 전·10일 전)입니다(제61조제2항).',
    '위 금액은 그 경우를 빼지 않은 값입니다. 촉진 절차를 그대로 밟았는지는 이 도구가 가리지 않습니다.',
  ];
}

/** 사용 촉진을 했어도 지급하는 경우 */
export const PROMOTION_REMAINS = [
  '촉진한 뒤 지정한 날이 오기 전에 퇴직한 경우(임금근로시간정책팀-194, 임금근로시간정책팀-2888)',
  '지정한 날 출근했는데 회사가 일을 받지 않겠다고 분명히 밝히지 않았거나 업무를 지시한 경우(대법원 2020. 2. 27. 선고 2019다279283 판결)',
  '근로자가 일부 날만 정해 알렸는데 회사가 나머지 날을 끝나기 2개월 전까지 서면으로 정하지 않은 경우 — 그 나머지 날(같은 판결)',
  '지정한 날이 휴직 등으로 일할 의무가 없는 날인 경우(임금근로시간정책팀-194)',
  '1년 미만 근로자의 월 연차를 6개월·2개월 기준으로 촉진한 경우 — 제61조제2항의 3개월·1개월 기준이 아닙니다',
  '촉진을 하지 않은 경우(근로기준과-161)',
];

/** 이 도구가 다루지 않는 것 */
export const SCOPE_ITEMS = [
  '무엇이 통상임금에 들어가는지 — 기본급과 매달 정해서 주는 수당을 넣습니다. 항목마다 보려면 통상임금 점검을 씁니다.',
  '출근율 80% 미만·휴직·출근한 것으로 보는 기간의 일수 — 연차 사용촉진 화면의 출근율 계산을 씁니다.',
  '회계연도로 연차를 운영하다 퇴직한 경우의 정산 — 퇴직 연차 정산에서 입사일 기준과 비교합니다.',
  '퇴직금의 평균임금에 넣는 금액 — 퇴직금 계산기에서 봅니다.',
  '주휴 말고 유급으로 정한 시간이 있는 경우, 교대제·격일제·감시단속 근로자의 1일 소정근로시간',
  '단시간 근로자의 입사일 기준 누계 — 통상 근로자라면 생겼을 연차일수를 직접 넣습니다. 1일 소정근로시간은 통상 근로자가 주 5일 일하는 것으로 보고 셉니다.',
  '2027. 6. 10.부터 시행되는 시간 단위 나눠 쓰기(근로기준법 제60조제5항 신설) — 시행령이 아직 없습니다.',
  '지연이자(근로기준법 제37조), 상시 4명 이하 사업장의 약정 연차',
];

/** 화면에 나올 수 있는 문장 전부 — 시험용 */
export function allCopy(r: LeavePayResult): string[] {
  return [...headline(r), ...formulaLines(r), ...effectLines(r), ...promotionLines(r), ...PROMOTION_REMAINS, ...SCOPE_ITEMS];
}
