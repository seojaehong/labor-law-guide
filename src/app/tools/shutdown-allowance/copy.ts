// 휴업수당 계산기의 결과 문장과 입력 칸 아래 안내문은 여기서 만든다. 시험이 allCopy() 전부를 금지어로 훑는다.
// (page.tsx 의 계산 기준과 등록부 desc 는 tests/unit/tool-banned-words.test.ts 가 금지어만 본다.)
// 단서(§46① 단서)는 사용자가 고르는 것이다 — 두 금액을 한 줄에 나란히 두고 어느 쪽도 권하지 않는다.
// 귀책사유가 있는지는 정하지 않는다. 사용자가 고른 사유를 전제로 계산하고, 판례·행정해석은 안내로만 쓴다.
import type { ShutdownAllowanceResult } from '@/lib/calc/shutdown-allowance';

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 소수 둘째 자리까지 — 1일 임금·시간급 */
const dec = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
/** 소수 셋째 자리까지 — 올리기 전 값 */
const dec3 = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
/** 2026-08-02 → 2026. 8. 2. */
const ymd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${y}. ${m}. ${d}.`;
};

/** 휴업일수 칸 아래 — 무엇을 세는가(근로조건지도과-1418 · 근로기준정책과-1448 · 근로개선정책과-5243) */
export const DAYS_HINT =
  '휴업기간 안의 유급휴일(주휴일·약정 유급휴일)은 휴업일수에 넣습니다(근로조건지도과-1418). 근로 제공 의무가 없는 무급 휴무일(주 5일제의 토요일 등)은 넣지 않습니다(근로기준정책과-1448). 1주 소정근로일을 모두 쉬었으면 그 주의 주휴일도 넣습니다(근로개선정책과-5243).';

/** 뺄 기간 칸 아래 — 시행령 §2① */
export const EXCLUDE_HINT =
  '휴업 시작 전 3개월 안에 앞서 회사 사정으로 쉰 기간, 출산전후휴가, 업무상 부상·질병 요양, 육아휴직, 쟁의행위 기간 등(근로기준법 시행령 제2조제1항 각 호)이 있으면 그 일수와 그 기간에 받은 임금을 넣습니다. 둘 다 빼고 셉니다.';

/** 휴업 중 받은 임금 칸 아래 — 시행령 §26 */
export const PAID_HINT =
  '하루 중 일부만 쉬고 일한 시간의 임금을 받았다면, 휴업한 기간 전체에서 받은 임금의 합계를 넣습니다. 평균임금에서 받은 임금을 뺀 금액의 70%로 셉니다(근로기준법 시행령 제26조).';

/** 다루지 않는 것 */
export const SCOPE_ITEMS = [
  '귀책사유가 있는지는 사실관계에 따라 달라 이 도구가 정하지 않습니다. 회사 사정으로 쉰 것을 전제로 계산합니다.',
  '평균임금 예외는 계산하지 않습니다 — 일용근로자(근로기준법 시행령 제3조), 평균임금을 산정할 수 없는 경우(시행령 제4조), 휴업 직전의 특별한 사정으로 평균임금이 현저히 적거나 많게 나온 경우(대법원 2013. 10. 11. 선고 2012다12870 판결). 1일 평균임금을 알면 직접 넣습니다.',
  '상여금·연차수당을 평균임금에 더하는 계산은 하지 않습니다. 더해야 하면 1일 평균임금을 직접 넣습니다.',
  '정당한 쟁의행위로 일하지 않은 기간은 휴업수당 대상이 아닙니다(근기68207-109).',
  '세금·4대보험, 휴업기간의 연차 출근율, 고용유지지원금은 다루지 않습니다.',
];

/** 휴업기간 달력 나누기 — 휴업일수 칸 아래 */
export function breakdownLine(from: string, to: string, b: { total: number; weekdays: number; saturdays: number; sundays: number }): string {
  return `${ymd(from)}부터 ${ymd(to)}까지 달력으로 ${b.total}일 — 월~금 ${b.weekdays}일, 토요일 ${b.saturdays}일, 일요일 ${b.sundays}일입니다.`;
}

/** 답 — 맨 위 굵은 문장들 */
export function headline(r: ShutdownAllowanceResult): string[] {
  switch (r.status) {
    case 'under5':
      return ['휴업수당(근로기준법 제46조)을 계산하지 않습니다.', '상시 근로자 4명 이하 사업장에는 제46조가 적용되지 않습니다(근로기준법 시행령 제7조 [별표1]).'];
    case 'force-majeure':
      return ['휴업수당을 계산하지 않습니다.', '천재지변·전쟁처럼 회사가 막을 수 없는 사유로 쉬었다면 사용자의 귀책사유가 아니어서 제46조의 휴업수당 대상이 아닙니다(근기68207-598, 근로기준과-802).'];
    case 'commission':
      return ['휴업수당을 계산하지 않습니다.', '노동위원회 승인을 받으면 평균임금의 70%에 못 미치는 휴업수당을 줄 수 있고, 금액은 승인된 지급률에 따릅니다(근로기준법 제46조제2항).'];
  }

  const A = r.dailyApplied!;
  const P = r.paidDuring;
  if (r.mainClamped) {
    return ['휴업 중 받은 임금이 많아 더 줄 휴업수당이 없습니다.', `받은 임금 ${won(P)}이 1일 평균임금 ${dec(A)}원 × ${r.days}일 이상입니다(근로기준법 시행령 제26조).`];
  }
  const lines: string[] = [];
  if (r.proviso !== null) {
    lines.push(`휴업수당은 평균임금 기준 ${won(r.main!)} 이상, 또는 통상임금 기준 ${won(r.proviso)}입니다.`);
    lines.push('평균임금의 70%가 통상임금보다 많아 회사는 통상임금을 휴업수당으로 줄 수 있습니다. 어느 쪽으로 줄지는 회사가 고릅니다(근로기준법 제46조제1항 단서).');
  } else {
    lines.push(`휴업수당은 ${won(r.main!)} 이상입니다.`);
  }
  lines.push(P > 0 ? `(1일 평균임금 ${dec(A)}원 × ${r.days}일 − 휴업 중 받은 임금 ${won(P)}) × 70%` : `1일 평균임금 ${dec(A)}원 × ${r.days}일 × 70%`);
  if (r.ordinaryAsAverage) lines.push(`평균임금이 통상임금보다 적어 1일 통상임금 ${dec(r.dailyOrdinary!)}원을 평균임금으로 했습니다(근로기준법 제2조제2항).`);
  if (r.provisoClamped) lines.push('통상임금 기준으로는 받은 임금이 통상임금 × 휴업일수 이상이라 더 줄 금액이 없습니다(시행령 제26조 단서).');
  return lines;
}

/** 산식 — 넣은 숫자와 끝수 처리 */
export function formulaLines(r: ShutdownAllowanceResult): string[] {
  switch (r.status) {
    case 'under5':
      return ['근로기준법 시행령 제7조 [별표1]은 상시 4명 이하 사업장에 적용하는 제3장(임금) 규정을 제43조부터 제45조까지, 제47조부터 제49조까지로 정합니다. 제46조(휴업수당)는 들어 있지 않습니다.'];
    case 'force-majeure':
      return ['근로기준법 제46조제1항은 「사용자의 귀책사유로 휴업하는 경우」에 휴업수당을 정합니다.'];
    case 'commission':
      return ['근로기준법 제46조제2항 — 부득이한 사유로 사업을 계속하는 것이 불가능하여 노동위원회의 승인을 받은 경우에는 제1항의 기준에 못 미치는 휴업수당을 지급할 수 있습니다.'];
  }

  const lines: string[] = [];
  const A = r.dailyApplied!;
  const O = r.dailyOrdinary!;
  const P = r.paidDuring;

  // 평균임금
  if (r.averageSource === 'period' && r.segments) {
    const first = r.segments[0];
    const last = r.segments[r.segments.length - 1];
    lines.push(`산정기간 = ${ymd(first.from)} ~ ${ymd(last.to)} ${r.periodDays}일 — 휴업 시작일 전 3개월이고, 입사한 지 3개월이 안 됐으면 입사일부터입니다(근로기준법 제2조제1항제6호). 평균임금은 휴업이 실제로 시작된 날을 기준으로 셉니다(근로개선정책과-3190).`);
    if (r.excludedDays > 0 || r.excludedWages > 0) {
      lines.push(`뺄 기간 ${r.excludedDays}일과 그 기간 임금 ${won(r.excludedWages)}을 빼 ${r.baseDays}일, ${won(r.baseTotal!)}으로 셉니다(근로기준법 시행령 제2조제1항).`);
    }
    lines.push(`1일 평균임금 = ${won(r.baseTotal!)} ÷ ${r.baseDays}일 = ${dec3(r.baseTotal! / r.baseDays!)}원 → ${dec(r.dailyAverage!)}원. 소수 둘째 자리까지 올렸습니다 — 고용노동부 퇴직금 계산기와 같은 관행이고 법령에 정함은 없습니다.`);
  } else {
    lines.push(`1일 평균임금 ${dec(r.dailyAverage!)}원 — 넣은 값을 그대로 씁니다.`);
  }

  // 통상임금
  const holiday = r.weekPaidHours !== null && r.weeklyHours !== null ? r.weekPaidHours - r.weeklyHours : 0;
  if (r.unit === 'month') {
    const exact = (r.weekPaidHours! * 365) / 84;
    lines.push(`월 기준시간 = (${dec(r.weeklyHours!)} + ${dec(holiday)}) × 365 ÷ 7 ÷ 12 = ${dec(exact)} → ${dec(r.hours!)}시간. 1주 소정근로시간에 주휴 ${dec(holiday)}시간을 더했습니다(근로기준법 시행령 제6조제2항제4호). 반올림은 고용노동부 고시의 209시간과 같은 관행이고 시행령 문언에는 없습니다.`);
  } else if (r.unit === 'week') {
    lines.push(`주 기준시간 = 1주 소정근로시간 ${dec(r.weeklyHours!)}시간 + 주휴 ${dec(holiday)}시간 = ${dec(r.hours!)}시간(근로기준법 시행령 제6조제2항제3호).`);
  } else if (r.unit === 'day') {
    lines.push(`일급은 1일 소정근로시간 ${dec(r.hours!)}시간으로 나눕니다(근로기준법 시행령 제6조제2항제2호).`);
  } else {
    lines.push('시급은 그 금액이 시간급입니다(근로기준법 시행령 제6조제2항제1호).');
  }
  if (r.unit !== 'hour') lines.push(`시간급 = ${won(r.ordinaryAmount!)} ÷ ${dec(r.hours!)}시간 = ${dec(r.hourly!)}원`);
  lines.push(`1일 통상임금 = 시간급 ${dec(r.hourly!)}원 × 1일 소정근로시간 ${dec(r.dailyHours!)}시간 = ${dec(O)}원(근로기준법 시행령 제6조제3항). 소수 둘째 자리까지 반올림했습니다. 단시간 근로자의 1일 소정근로시간은 근로기준법 시행령 별표2로 셉니다(근로기준정책과-3405).`);

  // §2②
  lines.push(r.ordinaryAsAverage
    ? `1일 평균임금 ${dec(r.dailyAverage!)}원이 1일 통상임금 ${dec(O)}원보다 적어 통상임금을 평균임금으로 합니다(근로기준법 제2조제2항). 휴업수당을 셀 때도 같다고 본 판결이 있습니다(서울고등법원 2016. 7. 22. 선고 2015나26148 판결, 대법원 2016다37167로 확정).`
    : `1일 평균임금 ${dec(r.dailyAverage!)}원이 1일 통상임금 ${dec(O)}원보다 적지 않아 평균임금을 그대로 씁니다(근로기준법 제2조제2항).`);

  // 본문
  if (r.mainClamped) {
    lines.push(`평균임금 기준 = (${dec(A)}원 × ${r.days}일 − 받은 임금 ${won(P)}) × 0.7 — 받은 임금이 평균임금 × 휴업일수 이상이라 0원입니다(근로기준법 시행령 제26조 본문).`);
  } else if (P > 0) {
    lines.push(`평균임금 기준 = (${dec(A)}원 × ${r.days}일 − 받은 임금 ${won(P)}) × 0.7 = ${dec3(r.mainExact!)}원 → ${won(r.main!)}. 받은 임금을 먼저 빼고 70%를 곱합니다 — 평균임금의 70%에서 받은 임금을 빼는 것이 아닙니다(근로기준법 시행령 제26조 본문).`);
  } else {
    lines.push(`평균임금 기준 = ${dec(A)}원 × ${r.days}일 × 0.7 = ${dec3(r.mainExact!)}원 → ${won(r.main!)}(근로기준법 제46조제1항 본문).`);
  }

  // 단서
  const seventy = dec3(A * 0.7);
  if (r.proviso !== null) {
    lines.push(`단서 비교 — 평균임금의 70% ${seventy}원 > 통상임금 ${dec(O)}원이라 통상임금을 휴업수당으로 줄 수 있습니다(근로기준법 제46조제1항 단서).`);
    if (r.provisoClamped) {
      lines.push(`통상임금 기준 = ${dec(O)}원 × ${r.days}일 − 받은 임금 ${won(P)} — 받은 임금이 더 많아 0원입니다(근로기준법 시행령 제26조 단서).`);
    } else if (P > 0) {
      lines.push(`통상임금 기준 = ${dec(O)}원 × ${r.days}일 − 받은 임금 ${won(P)} = ${dec(r.provisoExact!)}원 → ${won(r.proviso)}. 통상임금에서 받은 임금을 뺄 뿐 70%를 곱하지 않습니다(근로기준법 시행령 제26조 단서).`);
    } else {
      lines.push(`통상임금 기준 = ${dec(O)}원 × ${r.days}일 = ${dec(r.provisoExact!)}원 → ${won(r.proviso)}`);
    }
  } else {
    lines.push(`단서 비교 — 평균임금의 70% ${seventy}원이 통상임금 ${dec(O)}원을 넘지 않아 단서에 해당하지 않습니다. 같을 때도 「초과」가 아니어서 해당하지 않습니다.`);
  }

  lines.push('원 미만 처리는 법령에 정함이 없습니다. 「100분의 70 이상」에 못 미치지 않도록 원 미만을 올렸습니다 — 연차수당 계산기처럼 버리면 1원 적게 나올 수 있습니다.');
  return lines;
}

/** 근거와 그래서 생기는 일 */
export function effectLines(r: ShutdownAllowanceResult): string[] {
  switch (r.status) {
    case 'under5':
      return [
        '근로계약서·취업규칙·단체협약에 휴업 때 줄 금액을 정했다면 그 약정을 확인합니다.',
        '상시 근로자 수는 휴업수당을 줄 사유가 생긴 날 전 1개월 동안의 연인원을 가동 일수로 나눠 셉니다(근로기준법 시행령 제7조의2). 확실하지 않으면 상시 근로자 수 계산기로 셉니다.',
      ];
    case 'force-majeure':
      return [
        '작업량 감소, 판매 부진·자금난, 원자재 부족, 원도급업체 공사 중단에 따른 조업 중단 같은 경영 사정은 귀책사유에 들어간다고 봅니다(근로기준정책과-1078). 그렇다면 「회사 사정」을 골라 계산합니다.',
        '대법원은 경영상 필요로 한 대기발령처럼, 근로자가 일할 뜻이 있는데도 그 뜻에 반해 일하지 못하게 된 경우도 휴업에 들어간다고 보았습니다(대법원 2013. 10. 11. 선고 2012다12870 판결).',
      ];
    case 'commission':
      return [
        '승인은 관할 지방노동위원회에 「기준 미달의 휴업수당 지급 승인 신청서」(근로기준법 시행규칙 별지 제4호서식)를 내서 받습니다(시행규칙 제8조).',
        '노동위원회는 사용자가 신청한 휴업수당 지급률을 바꿀 수 없습니다(노동위원회규칙 제85조).',
        '천재지변 같은 불가항력은 처음부터 귀책사유가 아니어서 승인과 관계없이 제46조의 휴업수당 대상이 아닙니다(근기68207-598).',
        '승인을 받지 못했으면 제1항대로 평균임금의 70% 이상입니다. 그때는 「회사 사정」을 골라 계산합니다.',
      ];
  }

  const lines = [
    '사용자의 귀책사유로 휴업하면 휴업기간 동안 평균임금의 100분의 70 이상을 줍니다(근로기준법 제46조제1항). 이 금액은 법이 정한 최저선이라, 단체협약·취업규칙이 더 높게 정했으면 그 정한 바를 확인합니다.',
  ];
  if (r.proviso !== null) {
    lines.push('평균임금 기준과 통상임금 기준 중 어느 쪽으로 줄지는 회사가 정합니다. 단서가 「지급하여야 한다」가 아니라 「지급할 수 있다」라고 정해 회사에 선택권을 준 것이라고 본 판결이 있습니다(서울고등법원 2016. 7. 22. 선고 2015나26148 판결, 대법원 2016다37167로 확정).');
  }
  lines.push('평균임금은 근로자마다 휴업이 실제로 시작된 날을 기준으로 셉니다(근로개선정책과-3190). 그 전 3개월 안에 앞서 회사 사정으로 쉰 기간이 있으면 그 기간과 그때 받은 임금을 빼고 셉니다(근로기준법 시행령 제2조제1항제2호, 근로기준정책과-2081).');
  lines.push('휴업 중 상시 근로자가 4명 이하가 되면 그날부터는 제46조가 적용되지 않습니다(근로기준정책과-1913).');
  return lines;
}

/** 화면에 나올 수 있는 문장 전부 — 금지어 시험용 */
export function allCopy(r: ShutdownAllowanceResult): string[] {
  return [...headline(r), ...effectLines(r), ...formulaLines(r), ...SCOPE_ITEMS, DAYS_HINT, EXCLUDE_HINT, PAID_HINT];
}
