// 출근율 계산기의 결과 문장·칸 이름·안내문은 여기서 만든다. 시험이 allCopy() 전부를 금지어로 훑는다.
// (page.tsx 의 계산 기준과 등록부 desc 는 tests/unit/tool-banned-words.test.ts 가 금지어만 본다.)
// 금지어 주의 — 판례·행정해석은 「적법한/위법한 쟁의·직장폐쇄」라고 쓰지만 화면에는 「정당한/정당성이 없는」으로 풀어 쓴다.
// 해석이 갈리는 기간은 두 값을 나란히 보이고 무엇으로 갈리는지 적는다(261029 결정). 하나를 고르지 않는다.
import type { AttendanceCause, AttendanceOutcome, AttendanceRateResult, Ratio, monthlyLeaveDay } from '@/lib/calc/attendance-rate';

/** 출근율 % — 소수 둘째 자리 아래 버림. 80% 바로 아래 값이 80.00%로 보이지 않게 한다(80% 여부는 엔진이 정수로 따로 본다) */
export function fmtPct(r: Ratio): string {
  const hundredths = Math.floor((r.num * 10_000) / r.den);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}

/** 비례 일수 — 끝수 처리 없이. 넷째 자리 안에서 나누어떨어지면 그대로, 아니면 넷째 자리까지 쓰고 「…」 */
export function fmtDays(r: Ratio): string {
  const whole = Math.floor(r.num / r.den);
  let rem = r.num % r.den;
  let frac = '';
  for (let i = 0; i < 4 && rem > 0; i++) {
    rem *= 10;
    frac += String(Math.floor(rem / r.den));
    rem %= r.den;
  }
  return `${whole}${frac ? `.${frac}` : ''}${rem > 0 ? '…' : ''}`;
}

type Group = 'deemed' | 'excluded' | 'absent';

/** 칸 이름(label)은 서로 겹치지 않게 — 화면 검증이 이름으로 칸을 찾는다 */
export const CAUSE_COPY: Record<AttendanceCause, { label: string; basis: string }> = {
  'work-injury': { label: '업무상 부상·질병으로 쉰 날', basis: '근로기준법 제60조제6항제1호. 1년 전부여도 같습니다(대법원 2017. 5. 17. 선고 2014다232296, 232302 판결, 임금근로시간과-30).' },
  maternity: { label: '출산전후휴가·유산사산휴가', basis: '근로기준법 제60조제6항제2호(제74조제1항부터 제3항까지의 휴가).' },
  'parental-leave': { label: '육아휴직(2018. 5. 29. 이후 신청)', basis: '근로기준법 제60조제6항제3호. 법률 제15108호 부칙 제2조 — 시행 뒤 처음 신청하는 근로자부터.' },
  'leave-used': { label: '연차휴가·생리휴가를 쓴 날, 선거 등 공민권을 행사한 날', basis: '고용노동부 판단기준(임금근로시간정책팀-3228, 2007. 10. 25.) — 법령상 또는 그 성질상 출근한 것으로 보아야 하는 날.' },
  'reserve-forces': { label: '예비군·민방위 동원·훈련', basis: '예비군법 제10조, 민방위기본법 제27조 — 그 기간을 휴무로 처리하거나 불리하게 대우하지 못합니다.' },
  'unfair-dismissal': { label: '부당해고 기간', basis: '대법원 2014. 3. 13. 선고 2011다95519 판결 — 그 기간이 1년 전부여도 같습니다. 이 기간을 빼던 예전 해석(근로기준과-5084)은 따르지 않습니다.' },
  'unjust-lockout': { label: '정당성이 없는 직장폐쇄로 일하지 못한 날', basis: '대법원 2019. 2. 14. 선고 2015다66052 판결. 직장폐쇄가 없었어도 쟁의행위에 참가해 일하지 않았을 것이 명백하면 그 쟁의행위로 넣습니다(정당하면 빼는 날, 정당성이 없으면 결근). 명백한지는 쟁의행위에 이른 경위, 그 근로자의 지위·역할 등을 보고 신중하게 판단하고, 회사가 증명해야 합니다.' },
  'statutory-leave': { label: '배우자 출산휴가·난임치료휴가·가족돌봄휴가 등 법이 정한 휴가', basis: '출근으로 본다는 조문은 없습니다. 고용노동부는 법령상 또는 그 성질상 출근한 것으로 볼 수 있는 날을 출근으로 셉니다(임금근로시간과-1818). 배우자 출산휴가를 출근으로 본 해석(여성고용정책과-510)은 주휴일 개근에 관한 것이라 옮겨 쓴 것입니다 — 아래 「확인할 점」.' },
  'company-deemed': { label: '단체협약·취업규칙이 출근으로 보는 날(경조휴가 등)', basis: '법보다 유리하게 정했으면 정한 대로 셉니다.' },
  'lawful-strike': { label: '정당한 쟁의행위 기간', basis: '대법원 2013. 12. 26. 선고 2011다4629 판결 — 결근으로도, 출근으로도 보지 않습니다.' },
  'lawful-lockout': { label: '정당한 직장폐쇄 기간', basis: '대법원 2019. 2. 14. 선고 2015다66052 판결. 그 기간 중 정당성이 없는 쟁의행위에 참가한 날은 결근입니다.' },
  'union-fulltime': { label: '노동조합 전임 기간', basis: '대법원 2019. 2. 14. 선고 2015다66052 판결.' },
  'agreed-leave': { label: '회사가 승인한 휴직(개인 질병·약정 육아휴직 등)', basis: '임금근로시간과-1818(2021. 8. 12.) — 2021. 8. 4. 해석 변경(임금근로시간과-1736) 전에는 결근으로 봤습니다.' },
  'employer-shutdown': { label: '회사 사정으로 쉰 휴업 기간(근로기준법 제46조)', basis: '고용노동부는 빼는 날로 봅니다(근로개선정책과-3190, 근로기준정책과-8676). 판례 법리를 옮기면 출근으로 볼 수도 있어 두 값을 같이 보여줍니다.' },
  'unfair-suspension': { label: '부당하다고 확정된 정직 등 징계 기간', basis: '고용노동부는 빼는 날로 봅니다(근로기준과-3296). 부당해고 판례(2011다95519)를 옮기면 출근으로 볼 수도 있어 두 값을 같이 보여줍니다.' },
  absence: { label: '무단결근, 개인 사정으로 쉬고 휴가로 돌리지 않은 날', basis: '근로기준과-3937. 지각·조퇴한 날은 결근이 아닙니다(근기1455.9-10029).' },
  suspension: { label: '정당한 징계로 정직·직위해제(출근정지)된 기간', basis: '고용노동부는 2009. 9. 1. 해석을 바꿔 결근으로 봅니다(근로기준과-3296). 취업규칙에 이 기간을 소정근로일수에 넣고 출근일수에서 빼도록 정할 수 있다는 판결이 있습니다(대법원 2008. 10. 9. 선고 2008다41666 판결). 취업규칙에 정함이 없을 때는 아래 「확인할 점」.' },
  'unjust-strike': { label: '정당성이 없는 쟁의행위 기간', basis: '대법원 2019. 2. 14. 선고 2015다66052 판결.' },
};

export const GROUP_COPY: Record<Group, { title: string; note: string }> = {
  deemed: { title: '출근한 것으로 보는 날', note: '출근율의 분자와 분모에 모두 넣습니다. 근로기준법 제60조제6항은 2027. 6. 10.부터 제7항으로 바뀝니다(법률 제21784호).' },
  excluded: { title: '소정근로일수에서 빼는 날', note: '분모에서 뺍니다. 출근율이 80%에 못 미칠 때만 일수를 비례로 줄입니다.' },
  absent: { title: '결근으로 세는 날', note: '분모에만 넣습니다.' },
};

export const SCHEDULED_HINT =
  '그 1년 중 일하기로 정한 날의 수입니다. 주휴일·근로자의 날·약정휴일(유급·무급 모두)처럼 쉬기로 정한 날은 넣지 않습니다(근기68207-2057).';

export const ACCRUAL_HINT =
  '출근율을 따진 1년이 끝난 다음 날입니다. 입사일 기준이면 입사 기념일(2024. 3. 4. 입사면 2025. 3. 4., 2026. 3. 4. …)을 넣습니다. 근속 가산 일수를 이 날로 셉니다.';

/** 갈리는 원인마다 — 빼는 날로 본 근거 / 출근으로 본 근거 */
const DISPUTE: Partial<Record<AttendanceCause, { name: string; asExcluded: string; asDeemed: string }>> = {
  'unfair-suspension': { name: '부당하다고 확정된 정직 기간', asExcluded: '근로기준과-3296', asDeemed: '대법원 2011다95519 부당해고 법리를 옮긴 경우' },
  'employer-shutdown': { name: '회사 사정 휴업 기간', asExcluded: '근로개선정책과-3190', asDeemed: '대법원 2011다95519·2015다66052의 회사 책임 기간 법리를 옮긴 경우' },
};

const same = (a: AttendanceOutcome, b: AttendanceOutcome) =>
  a.status === b.status && (a.days?.num ?? -1) === (b.days?.num ?? -1) && (a.days?.den ?? -1) === (b.days?.den ?? -1);

/** 한 결과를 한 문장으로 — 두 값을 나란히 보일 때 */
function brief(o: AttendanceOutcome, base: number): string {
  const rate = `출근율 ${fmtPct(o.rate)}%`;
  switch (o.status) {
    case 'full':
      return `${rate} → ${base}일이 생깁니다.`;
    case 'prorated':
      return `${rate}, 빼는 날을 뺀 출근율 ${fmtPct(o.realRate!)}% → ${base}일 × ${o.tally.scheduled - o.tally.excluded}/${o.tally.scheduled} = ${fmtDays(o.days!)}일이 생깁니다.`;
    case 'monthly':
      return `${rate} → 1개월 개근할 때마다 1일이 생깁니다.`;
    default:
      return '소정근로일 전부가 빼는 날이라 생기지 않습니다.';
  }
}

function single(o: AttendanceOutcome, base: number): string[] {
  const pct = fmtPct(o.rate);
  switch (o.status) {
    case 'full':
      return [
        `출근율은 ${pct}%로 80% 이상입니다.`,
        `연차휴가 ${base}일이 생깁니다(근로기준법 제60조제1항${base > 15 ? '·제4항' : ''}).`,
        ...(o.tally.excluded > 0 ? ['빼는 날이 있어도 80% 이상이면 일수를 줄이지 않습니다(임금근로시간과-906, 임금근로시간과-636).'] : []),
      ];
    case 'prorated':
      return [
        `출근율은 ${pct}%로 80%에 못 미칩니다.`,
        `빼는 날 ${o.tally.excluded}일을 뺀 출근율이 ${fmtPct(o.realRate!)}%라 ${base}일 × ${o.tally.scheduled - o.tally.excluded}/${o.tally.scheduled} = ${fmtDays(o.days!)}일이 생깁니다(대법원 2019. 2. 14. 선고 2015다66052 판결).`,
      ];
    case 'monthly':
      return [
        `출근율은 ${pct}%로 80%에 못 미칩니다.`,
        '1년치 연차 대신 1개월 개근할 때마다 1일이 생깁니다(근로기준법 제60조제2항).',
        ...(o.realRate ? [`빼는 날을 뺀 출근율도 ${fmtPct(o.realRate)}%로 80%에 못 미쳐 비례로 주지 않습니다.`] : []),
      ];
    default:
      return [
        '그 1년 소정근로일 전부가 빼는 날이라 연차휴가가 생기지 않습니다.',
        '단체협약 등에서 달리 정했으면 그에 따릅니다(대법원 2019. 2. 14. 선고 2015다66052 판결).',
      ];
  }
}

/** 답 — 맨 위 굵은 문장들 */
export function headline(r: AttendanceRateResult): string[] {
  if (r.status === 'under1y' || !r.primary) {
    return ['계속 근로 1년이 되지 않았습니다.', '출근율과 관계없이 1개월 개근할 때마다 1일이 생깁니다(근로기준법 제60조제2항).'];
  }
  const base = r.baseDays!;
  if (!r.alt) return single(r.primary, base);
  const names = r.disputed.map((c) => DISPUTE[c]!.name).join('·');
  if (same(r.primary, r.alt)) {
    return [...single(r.primary, base), `${names}을 출근한 것으로 보아도 결과가 같습니다.`];
  }
  const ex = r.disputed.map((c) => DISPUTE[c]!.asExcluded).join('·');
  const de = r.disputed.map((c) => DISPUTE[c]!.asDeemed).join(', ');
  return [
    `${names}을 어떻게 보느냐에 따라 갈립니다.`,
    `빼는 날로 보면(${ex}) ${brief(r.primary, base)}`,
    `출근한 것으로 보면(${de}) ${brief(r.alt, base)}`,
  ];
}

/** 그래서 생기는 일 */
export function effectLines(r: AttendanceRateResult): string[] {
  if (r.status === 'under1y' || !r.primary) {
    return [
      '입사 1년이 되는 날 15일이 생기는지는 그 1년의 출근율로 봅니다. 「연차가 생기는 날」에 입사 1년 되는 날을 넣으면 출근율을 계산합니다.',
      '한 달씩 개근했는지는 아래에서 확인합니다.',
    ];
  }
  const out: string[] = [];
  const statuses = [r.primary.status, r.alt?.status];
  if (statuses.includes('full') || statuses.includes('prorated')) {
    out.push('쓰지 못하고 남은 일수의 수당은 연차수당 계산기에서 봅니다.');
  }
  if (statuses.includes('prorated')) {
    out.push('비례로 나온 일수의 끝수(소수점 아래)를 반올림할지, 시간으로 줄지는 법령에 정함이 없습니다. 취업규칙 등 사업장 규정을 확인합니다.');
  }
  if (statuses.includes('monthly')) {
    out.push('개근한 달은 그 달 소정근로일 중 빼는 날을 뺀 나머지를 모두 출근(출근으로 보는 날 포함)한 달입니다. 아래에서 한 달씩 확인합니다.');
  }
  if (statuses.includes('none')) {
    out.push('그 1년 동안 일할 의무가 없었기 때문입니다(근로기준과-2373).');
  }
  return out;
}

function outcomeFormula(o: AttendanceOutcome, base: number, years: number): string[] {
  const { scheduled: S, attended: A, deemed: D, excluded: X, absent: B } = o.tally;
  const need = Math.ceil((4 * S) / 5);
  const lines = [
    `소정근로일수 ${S}일 = 출근 ${A}일 + 출근으로 보는 날 ${D}일 + 빼는 날 ${X}일 + 결근 ${B}일`,
    `출근율 = (출근 ${A}일 + 출근으로 보는 날 ${D}일) ÷ 소정근로일수 ${S}일 = ${fmtPct(o.rate)}%`,
    `${S}일의 80%는 ${((4 * S) / 5).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}일이라 ${need}일 이상 출근(출근으로 보는 날 포함)해야 80% 이상입니다(임금근로시간과-636). 정확히 80%도 채운 것입니다.`,
  ];
  if (o.realRate) lines.push(`빼는 날을 뺀 출근율 = ${A + D}일 ÷ (${S}일 − ${X}일) = ${fmtPct(o.realRate)}%`);
  lines.push(
    base > 15
      ? `기본 일수 ${base}일 = 15일 + 가산 ${base - 15}일(근속 ${years}년, 최초 1년을 넘는 2년마다 1일, 25일 한도 — 근로기준법 제60조제4항)`
      : `기본 일수 ${base}일(근속 ${years}년 — 가산은 3년 이상부터, 근로기준법 제60조제4항)`,
  );
  if (o.status === 'prorated') {
    lines.push(`${base}일 × (${S} − ${X}) ÷ ${S} = ${o.days!.num}/${o.days!.den} = ${fmtDays(o.days!)}일 — 끝수를 처리하지 않습니다(기본 일수에 가산을 넣어 비례 — 근로개선정책과-3370).`);
  }
  return lines;
}

/** 산식 — 접어 두는 상세 */
export function formulaLines(r: AttendanceRateResult): string[] {
  if (r.status === 'under1y' || !r.primary) {
    return [`근속 ${r.serviceYears}년 — 연차가 생기는 날 기준으로 계속 근로 1년이 되지 않아 1년간 출근율로 15일을 따지지 않습니다(근로기준법 제60조제2항).`];
  }
  const lines = outcomeFormula(r.primary, r.baseDays!, r.serviceYears);
  if (r.alt && !same(r.primary, r.alt)) {
    lines.push('갈리는 기간을 출근한 것으로 보면:', ...outcomeFormula(r.alt, r.baseDays!, r.serviceYears).slice(0, 2));
  }
  lines.push('출근율 표시는 소수 둘째 자리 아래를 버립니다. 80% 이상인지는 나누지 않고 5 × 출근일수와 4 × 소정근로일수를 견줘 봅니다.');
  return lines;
}

/** 한 달 개근 확인 결과 */
export function monthLines(m: ReturnType<typeof monthlyLeaveDay>): string[] {
  switch (m.reason) {
    case 'perfect':
      return ['그 달은 개근입니다 — 1일이 생깁니다.', '빼는 날이 있어도 나머지 소정근로일을 모두 출근(출근으로 보는 날 포함)했으면 개근이고, 반으로 줄이지 않습니다(근로기준정책과-8676).'];
    case 'absent':
      return ['결근한 날이 있어 그 달에는 생기지 않습니다.'];
    default:
      return ['그 달 소정근로일 전부가 빼는 날이라 그 달에는 생기지 않습니다(근로기준과-2373).'];
  }
}

/** 한 달 개근 규칙 */
export const MONTH_RULES = [
  '출근으로 보는 날(업무상 재해 휴업·출산전후휴가·육아휴직, 연차·생리휴가, 예비군 등)은 출근한 날로 셉니다. 그 달 전부여도 개근입니다(제60조제6항은 제2항에도 적용, 임금근로시간과-30).',
  '빼는 날(정당한 쟁의행위 등)이 있는 달은 나머지 소정근로일을 모두 출근했으면 1일입니다(근로기준정책과-8676, 임금근로시간과-636).',
  '그 달 전부가 빼는 날이면 그 달에는 생기지 않습니다(근로기준과-2373).',
];

/** 해석이 갈리거나 확인이 덜 된 것 */
export const OPEN_ITEMS = [
  '부당하다고 확정된 정직 — 고용노동부는 소정근로일수에서 빼고 비례로 줍니다(근로기준과-3296). 부당해고 기간을 출근으로 본 판례(2011다95519)를 옮기면 출근으로 볼 수 있고, 하급심(대전지법 천안지원 2012가합3275)도 같은 취지를 덧붙였습니다. 대법원이 직접 다룬 판결은 찾지 못해 두 값을 같이 보여줍니다.',
  '회사 사정 휴업(근로기준법 제46조) — 고용노동부는 빼는 날로 봅니다(근로개선정책과-3190, 근로기준정책과-8676). 회사 책임인 기간을 근로자에게 불리하게 따지지 않는다는 판례(2011다95519, 2015다66052)와 맞지 않는 면이 있고, 휴업을 직접 다룬 대법원 판결은 찾지 못해 두 값을 같이 보여줍니다.',
  '회사가 승인한 휴직 — 2021. 8. 4. 고용노동부 해석이 결근에서 빼는 날로 바뀌었습니다(임금근로시간과-1736). 이 도구는 그 해석을 인용한 임금근로시간과-1818로 확인했고, 바뀐 뒤의 법원 판단은 확인하지 못했습니다.',
  '배우자 출산휴가·배우자 유산사산휴가·난임치료휴가·가족돌봄휴가 — 출근으로 본다는 조문이 없고 고용노동부의 일반 해석으로 출근으로 봅니다. 연차 출근율을 직접 다룬 회시는 찾지 못했습니다. 가족돌봄「휴직」은 휴가와 달리 회사가 승인한 휴직처럼 빼는 날로 볼 여지가 있습니다.',
  '비례 일수의 끝수 — 법령에 정함이 없습니다. 고용노동부 예시는 7.5일처럼 소수를 그대로 두고, 반올림·올림이나 시간으로 주는 방식은 사업장 규정에 맡겨져 있습니다. 이 도구도 끝수를 처리하지 않습니다.',
  '정당한 징계의 정직 — 고용노동부는 처음에 소정근로일수에서 빼고 취업규칙으로 결근 처리하면 효력이 없다고 봤다가(근기68207-2672, 근로기준팀-4), 2009. 9. 1. 결근으로 해석을 바꿨습니다(근로기준과-3296). 이 도구는 그 회시 원문이 아니라 하급심(대전지법 천안지원 2012가합3275)이 인용한 문장으로 확인했습니다. 대법원 2008다41666은 개정 전 법에서 취업규칙에 그렇게 정한 것이 근로자에게 불리하지 않다고 본 판결이고, 정함이 없을 때 결근이라고 한 판결은 아닙니다. 근로 의무가 면제된 노동조합 전임 기간을 결근도 출근도 아닌 빼는 날로 본 판결(2015다66052)의 논리를 옮기면 빼는 날로 볼 여지가 있어, 취업규칙에 정함이 없으면 다툼이 있을 수 있습니다.',
  '비례로 나온 경우 — 1년 전체 출근율은 80%에 못 미치므로 글자로는 제60조제2항(1개월 개근 1일)의 「1년간 80퍼센트 미만 출근한 근로자」에도 해당합니다. 고용노동부는 이 부분을 「별론」으로 남겼고(임금근로시간과-906), 둘을 함께 주는지 정한 해석·판결은 찾지 못했습니다. 이 도구는 비례 일수만 보여줍니다.',
  '1년 이상인데 80%에 못 미친 경우 1개월 개근을 어느 1년의 달로 세는지(출근율을 따진 그 1년의 개근 달인지, 그다음 해의 개근 달인지) — 같은 질의를 받은 고용노동부 회시(근로개선정책과-3225)는 「연차 유급휴가는 전년도 출근율에 따라 부여」라고만 하고 직접 답하지 않았습니다. 이 도구는 한 달씩 개근 여부만 확인합니다.',
];

/** 이 도구가 다루지 않는 것 */
export const SCOPE_ITEMS = [
  '1년 소정근로일수 자체를 달력에서 세는 일 — 근무 형태마다 달라 직접 넣습니다.',
  '쟁의행위·직장폐쇄·징계가 정당한지, 휴업이 누구 책임인지, 휴직이 약정에 따른 것인지 — 사실관계에 따라 달라 고른 칸대로 셉니다.',
  '2018. 5. 29. 전에 신청한 육아휴직 — 그때는 출근으로 본다는 조문이 없어 소정근로일수에서 빼는 날로 봤습니다(대법원 2013. 12. 26. 선고 2011다4629 판결). 「육아휴직」 칸이 아니라 「회사가 승인한 휴직」 칸에 넣으면 같은 방식(빼는 날)으로 셉니다. 비워 두면 출근한 날로 세집니다.',
  '육아기·임신기 근로시간 단축(근로기준법 제60조제6항제4호·제5호, 2024. 10. 22. 이후 시작한 단축) — 단축해 일한 날은 출근한 날이라 하루 단위 출근율은 바뀌지 않습니다. 이 규정은 단축된 시간을 이유로 연차를 시간 비례로 줄이지 못하게 한 것입니다.',
  '단시간 근로자의 시간 비례(시행령 별표2), 회계연도로 운영할 때 첫해 비례, 1년 계약직의 연차(대법원 2021다227100)',
  '연차수당 금액 — 연차수당 계산기에서 봅니다.',
  '연차가 생기는 날이 2012. 8. 2. 전인 연차, 그리고 1년 이상이면서 연차가 생기는 날이 2013. 8. 2. 전인 연차 — 1년 이상 근로자가 80%에 못 미치면 1개월 개근 1일을 주는 규정(법률 제11270호, 2012. 8. 2. 시행)은 「시행 후의 근로기간이 최초로 1년이 되는 근로자로서 그 1년간 80퍼센트 미만」부터 적용합니다(부칙 제4조). 출근율을 따진 1년이 시행일을 걸친 경우를 직접 정한 고용노동부 회시는 찾지 못했습니다(근로개선정책과-3225도 정하지 않음).',
  '입사 1년이 되는 날이 2018. 5. 29. 이전인 연차 — 그때는 1년 미만 때 생긴 휴가를 15일에 포함하고 이미 쓴 일수를 15일에서 뺐습니다(구 근로기준법 제60조제3항, 법률 제15108호로 삭제).',
];

/** 화면에 나올 수 있는 문장 전부(칸 이름·안내문 포함) — 시험용 */
export function allCopy(r: AttendanceRateResult): string[] {
  return [
    ...headline(r), ...effectLines(r), ...formulaLines(r), ...MONTH_RULES, ...OPEN_ITEMS, ...SCOPE_ITEMS,
    SCHEDULED_HINT, ACCRUAL_HINT,
    ...Object.values(GROUP_COPY).flatMap((g) => [g.title, g.note]),
    ...Object.values(CAUSE_COPY).flatMap((c) => [c.label, c.basis]),
  ];
}
