// 급여 일할계산기의 문장 — 근거 줄, 답 카드 굵은 줄, 「그래서 생기는 일」, 방식별 값, 계산 과정, 다루지 않는 것.
// 시험(tests/unit/pay-proration-copy.test.ts)이 allCopy 로 전부를 금지어로 훑는다.
// 법은 일할 방식을 정하지 않는다 — 방식 하나를 고르지 않는다. 사실·회사 기준으로 갈리는 값은 두 값을 나란히 두고 무엇으로 갈리는지 적는다.
// 최저임금은 월급 원금으로만 대조한다. 일할액을 그 기간 유급시간으로 나눈 값은 참고로만 보여 주고 모자라다고 단정하지 않는다.
import type { Fraction } from '@/lib/pay-check/policies';
import { POLICY_NAME, ROUNDING_NAME } from '@/lib/pay-check/policies';
import type { AbsenceResult, DayUnit, MethodId, MinWageSeam, ProrationResult, RoundingRule, Variant } from '@/lib/calc/pay-proration';

export type Basis = 'unknown' | MethodId;

export const METHOD_NAME: Record<MethodId, string> = {
  DAY_30: `${POLICY_NAME.DAY_30}(지급식)`,
  DAY_30_DEDUCT: `${POLICY_NAME.DAY_30}(공제식)`,
  CALENDAR: '그달 달력 일수 기준',
  WORKDAY: '소정근로일 기준',
  HOUR_ACTUAL: POLICY_NAME.HOUR_ACTUAL,
  FULL: '그달 월급 전액(일할하지 않음)',
};

/** 고르기 칸 아래 한 줄 설명 */
export const METHOD_HINT: Record<MethodId, string> = {
  DAY_30: '월급 × 재직한 날 ÷ 30',
  DAY_30_DEDUCT: '월급 − 월급 ÷ 30 × 재직하지 않은 날',
  CALENDAR: '월급 × 재직한 날 ÷ 그달 날수(28~31일)',
  WORKDAY: '월급 × 재직 기간 소정근로일 ÷ 그달 소정근로일',
  HOUR_ACTUAL: '통상시급(월급 ÷ 209) × 그 기간 유급시간',
  FULL: '취업규칙·계약이 그달 전액 지급으로 정함',
};

export const UNIT_NAME: Record<DayUnit, string> = {
  HOUR8: '통상시급 × 8시간',
  DAY_30: '월급 ÷ 30',
  CALENDAR: '월급 ÷ 그달 날수',
};

/** 화면 머리의 근거 줄(ToolShell basis) */
export const BASIS: readonly string[] = [
  '고용노동부 행정해석 근기68207-690(1999. 3. 24.) — 월 도중 퇴직자에게 그달 임금을 전액 줄지 일할할지는 법령에 명시적인 규정이 없고 노사가 정한 바에 따름. 전액 지급으로 정하지 않았으면 실제 근로일수만큼 일할해도 무방. 같은 취지 근기1455-24422(1981. 8. 11.)·근로개선정책과-2118(2011. 7. 11.)',
  '근로기준법 제17조 제2항(임금 계산방법을 적은 서면) · 제93조 제2호(취업규칙에 임금의 결정·계산·지급 방법) · 제48조 제2항과 시행령 제27조의2 제5호(출근일수·시간에 따라 달라지는 항목은 임금명세서에 계산방법)',
  '근로기준법 시행령 제6조 제2항 제4호 — 월급의 시간급 = 월급 ÷ 월 통상임금 산정 기준시간(주 40시간이면 209시간)',
  '대법원 1998. 4. 24. 선고 97다28421 판결 — 월급에는 유급휴일 임금도 포함. 근로기준정책과-2677(2016. 4. 21.) — 월급제는 그달 소정근로일수·유급휴일 수와 상관없이 정한 월급',
  '근로기준법 제55조, 시행령 제30조 제1항 — 1주 소정근로일을 개근하면 유급 주휴일. 관공서 공휴일(제55조 제2항)은 상시 4명 이하 사업장에 적용하지 않음(시행령 제7조 별표1)',
  '임금근로시간과-1736(2021. 8. 4.) — 1주(7일) 근로관계가 이어지고 소정근로일을 개근하면 그 주 주휴가 생김. 금요일까지 근무하고 퇴사하면 생기지 않음',
  '여성고용정책과-2507(2016. 7. 26.) — 출산전후휴가 기간 임금을 그달 날수(…÷ 31 × 17)로 일할한 계산을 타당하다고 본 회시. 30일 기준·소정근로일 기준을 정한 행정해석은 찾지 못함',
  '근기01254-18756(1987. 11. 26.) — 결근일 임금은 고정급 약정이 없으면 지급 의무 없음. 근기01254-1103(1987. 1. 23.) — 개근하지 않은 주의 주휴는 무급으로 할 수 있으나 조퇴를 이유로 주휴를 뺄 수 없음. 법무811-23530(1978. 10. 26.) — 한 주에 여러 날 결근해도 그 주 주휴 1일. 근로기준과-5560(2009. 12. 23.) — 지각·조퇴는 결근이 아님',
  '근로기준법 제95조 · 법무811-21010(1978. 9. 26.) — 실제 무노동분을 넘는 공제는 감급. 1회 평균임금 1일분의 2분의 1, 총액은 1임금지급기 임금 총액의 10분의 1까지(상시 4명 이하는 적용하지 않음)',
  '최저임금법 제6조 제1항·제6항 제1호, 시행령 제5조 제1항 제3호, 임금정책과-3074(2004. 8. 21.) — 월급은 월급 원금을 209시간으로 나눠 최저임금과 대조. 근로자 사정으로 일하지 않은 시간·일의 임금은 지급을 강제하지 않음',
  '일할 금액의 끝수(원 미만) 처리 — 정한 법령 조문이 없어 회사 기준',
];

const NOT_COVERED_ITEMS: readonly string[] = [
  '주 40시간(월~금 8시간)·주휴일 일요일인 월급제만 계산합니다. 주 6일제·교대제·단시간 근로자, 시급제·일급제는 다루지 않습니다.',
  '급여기간은 그달 1일부터 말일까지로 봅니다. 21일부터 다음 달 20일처럼 다른 기간은 다루지 않습니다.',
  '입사·퇴사한 달에 결근까지 겹친 달은 한 번에 계산하지 않습니다. 일할과 결근 공제를 어느 순서로 하는지도 회사 기준입니다.',
  '휴직·육아휴직·출산전후휴가·병가·쟁의행위 기간의 임금은 제도마다 따로 정한 것이 있어 다루지 않습니다.',
  '상여금·수당 항목별 일할, 연장·야간·휴일 가산, 통상임금에 들어가는지는 다루지 않습니다(통상임금 점검에서 봅니다).',
  '퇴직금, 4대보험·소득세는 다루지 않습니다(퇴직금 계산기·실수령액 계산기·중도퇴사 연말정산 계산기에서 봅니다).',
  '공휴일은 달력에서 찾지 않고 넣은 날만 셉니다. 주휴일이 다음 달에 걸린 주는 주휴일 날짜가 든 달로 셉니다(회사 기준이 다르면 달라집니다).',
];
export const NOT_COVERED = NOT_COVERED_ITEMS;

// ── 숫자 ──

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const value = (f: Fraction) => f.num / f.den;
const dec = (x: number) => x.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
/** 원 단위로 정해졌으면 그 금액, 아니면 소수 둘째 자리까지 */
const money = (v: Variant) => (v.amount !== null ? won(v.amount) : `${dec(value(v.exact))}원`);
const fracWon = (f: Fraction) => (f.den === 1 ? won(f.num) : `${dec(value(f))}원`);
const shown = (v: Variant) => v.amount ?? value(v.exact);
const ruleName = (r: RoundingRule) => `${ROUNDING_NAME[r.how]}·${r.unit}원 단위`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const monthName = (r: { month: string }) => `${Number(r.month.slice(5, 7))}월`;

function kindWord(r: ProrationResult): string {
  const joined = r.from !== r.periodStart, left = r.to !== r.periodEnd;
  return joined && left ? '입사·퇴사한' : joined ? '입사한' : '퇴사한';
}

/** 한 방식의 값을 한 줄로 — 값이 둘 이상이면 갈리는 조건과 함께 */
function valuesText(variants: Variant[]): string {
  if (variants.length === 1) return money(variants[0]!);
  return variants.map((v) => `${v.label} ${money(v)}`).join(', ');
}

// ── 입사·퇴사 달 ──

export function formulaOf(r: ProrationResult, id: MethodId, v: Variant): string {
  const pay = won(r.monthlyPay);
  switch (id) {
    case 'DAY_30':
      return `월급 ${pay} × 재직 ${r.employedDays}일 ÷ 30일`;
    case 'DAY_30_DEDUCT':
      return `월급 ${pay} − 월급 ÷ 30 × 재직하지 않은 ${r.notEmployedDays}일`;
    case 'CALENDAR':
      return `월급 ${pay} × 재직 ${r.employedDays}일 ÷ 그달 ${r.monthDays}일`;
    case 'WORKDAY': {
      const out = v.label?.includes('빼면');
      const a = out ? r.employedWorkdays - r.holidaysEmployed.length : r.employedWorkdays;
      const b = out ? r.monthWorkdays - r.holidaysInMonth.length : r.monthWorkdays;
      return `월급 ${pay} × 재직 기간 소정근로일 ${a}일 ÷ 그달 소정근로일 ${b}일`;
    }
    case 'HOUR_ACTUAL':
      return `통상시급 ${fracWon(r.hourly)}(월급 ÷ ${r.monthHours}시간) × 유급시간 ${v.hours}시간`;
    case 'FULL':
      return `월급 ${pay} 그대로`;
  }
}

/** 답 카드 굵은 줄 */
export function headline(r: ProrationResult, basis: Basis): string[] {
  if (r.status === 'full-month') {
    return [
      '그달 내내 재직해 일할하지 않는 달입니다.',
      '그달 내내 재직한 월급제는 그달 소정근로일·유급휴일 수와 상관없이 정한 월급을 받습니다(근로기준정책과-2677). 결근·지각이 있으면 위에서 「결근·지각 공제」를 고릅니다.',
    ];
  }
  const m = monthName(r);
  if (basis === 'FULL') {
    return [
      `회사 규정이 그달 월급 전액 지급이면 일할하지 않고 ${won(r.monthlyPay)}입니다.`,
      '취업규칙·계약에 그달 임금을 전액 지급한다고 정해져 있으면 그에 따릅니다(근기68207-690, 근기1455-28199).',
    ];
  }
  if (basis === 'unknown') {
    const xs = r.rows.filter((x) => x.id !== 'FULL').flatMap((x) => x.variants);
    const lo = xs.reduce((a, b) => (shown(b) < shown(a) ? b : a));
    const hi = xs.reduce((a, b) => (shown(b) > shown(a) ? b : a));
    return [
      `일할 방식에 따라 ${m} 급여는 ${money(lo)}에서 ${money(hi)}까지 갈립니다.`,
      '법은 일할 방식을 정하지 않아 취업규칙·근로계약서·임금명세서에 적힌 계산방법을 따릅니다(근기68207-690).',
    ];
  }
  const row = r.rows.find((x) => x.id === basis)!;
  const one = row.variants.length === 1;
  return [
    `회사 기준(${METHOD_NAME[basis]})으로 ${m} 급여는 ${valuesText(row.variants)}입니다.`,
    one ? `${formulaOf(r, basis, row.variants[0]!)}` : '이 방식 안에서도 아래 사실·회사 기준에 따라 값이 갈려 나란히 둡니다.',
  ];
}

export function minWageLine(mw: MinWageSeam | null, pay: number, month: string): string {
  if (!mw) return `${month.slice(0, 4)}년 최저임금 고시 값이 이 도구에 없어 월급을 최저임금과 대조하지 않습니다.`;
  const c = mw.check;
  const head = `월급 ${won(pay)}은 ${mw.year}년 최저임금 월 환산액 ${won(c.required)}(시간당 ${won(mw.minHourly)} × ${c.hours}시간)`;
  return c.meets
    ? `${head} 이상입니다. 최저임금은 일할한 금액이 아니라 월급 원금으로 대조합니다(최저임금법 시행령 제5조 제1항 제3호).`
    : `${head}보다 ${won(c.shortfall)} 적습니다. 매달 주는 상여금·현금 식비까지 넣어 보려면 최저임금 확인 계산기에서 봅니다.`;
}

function payslipLine(r: ProrationResult): string | null {
  if (!r.payslip) return null;
  const n = won(r.payslip.amount);
  if (!r.payslip.matches.length) return `명세서 금액 ${n}은 위 방식 어느 값과도 같지 않습니다. 명세서에 적힌 계산방법(나눈 일수·시간)을 확인해 보세요.`;
  const names = r.payslip.matches.map((x) => {
    const tail = x.how ? ` 값을 ${ruleName(x.how)}로 처리한 금액` : x.hourlyFirst ? `에서 통상시급을 먼저 원 미만 ${x.hourlyFirst === 'floor' ? '버림' : '반올림'}한 값` : '';
    return `${METHOD_NAME[x.id]}${x.label ? `(${x.label})` : ''}${tail}`;
  });
  return `명세서 금액 ${n}과 같은 값: ${names.join(', ')}.`;
}

const ROUNDING_OPEN = '원 미만이 남는 값은 소수 둘째 자리까지 보여 줍니다. 일할 금액의 끝수 처리를 정한 법령은 없어, 회사 기준(버림·반올림·올림과 1원·10원·100원 단위)을 고르면 원 단위로 정리합니다.';
const FIRST_WEEK = '주 중간에 입사한 첫 주는 그 주 월요일부터 근로관계가 있지 않아, 그 주 주휴를 넣는지 정한 행정해석을 찾지 못했습니다. 두 값을 나란히 둡니다.';
const FOUR_PUBLIC = '상시 4명 이하 사업장은 관공서 공휴일을 유급휴일로 주는 규정(근로기준법 제55조 제2항)이 적용되지 않아(시행령 별표1), 쉰 공휴일을 유급으로 했는지에 따라 시간 기준 값이 갈립니다.';
const LEAVE_WEEK = '퇴사일이 일요일이 아니어서 퇴사한 주의 주휴는 생기지 않는 것으로 셉니다. 1주(월~일) 근로관계가 이어지고 개근해야 생깁니다(임금근로시간과-1736, 2021. 8. 4.).';
const WORKDAY_SPLIT = '소정근로일 수에 공휴일을 넣는지는 회사 기준이라 두 값을 나란히 둡니다.';
const FULL_BY_THIRTY = '31일 달에 30일 재직해 30일 기준(지급식)은 월급 전액과 같습니다. 같은 달 그달 날수 기준과 공제식은 하루분이 빠집니다.';
const ASK = (r: ProrationResult) =>
  `회사에 물어볼 문장: 「${monthName(r)}에 ${kindWord(r)} 달 급여를 30일·그달 날수·소정근로일·시간 중 어떤 기준으로 일할하는지, 그 계산방법이 취업규칙·근로계약서·임금명세서 어디에 적혀 있는지 알려 주세요.」 임금 계산방법은 근로계약서(근로기준법 제17조 제2항)와 임금명세서(제48조 제2항, 시행령 제27조의2 제5호)에 적게 되어 있습니다.`;

/** 그래서 생기는 일 — 답 카드 아래 */
export function effectLines(r: ProrationResult, basis: Basis): string[] {
  if (r.status === 'full-month') return [minWageLine(r.minWage, r.monthlyPay, r.month)];
  const all = basis === 'unknown';
  const row = (id: MethodId) => r.rows.find((x) => x.id === id)!;
  const shows = (id: MethodId) => all || basis === id;
  const hour = row('HOUR_ACTUAL');
  const lines: string[] = [];
  const open = all ? r.roundingOpen : basis !== 'FULL' && row(basis).variants.some((v) => v.amount === null);
  if (open) lines.push(ROUNDING_OPEN);
  if (shows('HOUR_ACTUAL') && r.hours.firstWeekOpen) lines.push(FIRST_WEEK);
  if (shows('HOUR_ACTUAL') && hour.variants.some((v) => v.label?.includes('공휴일'))) lines.push(FOUR_PUBLIC);
  if (shows('HOUR_ACTUAL') && r.leaveWeekNoHoliday) lines.push(LEAVE_WEEK);
  if (shows('HOUR_ACTUAL') && hour.variants[0]!.hourlyFirst) {
    lines.push(`통상시급이 원 단위로 떨어지지 않습니다. 시급을 먼저 원 미만 버림하면 ${hour.variants.map((v) => won(v.hourlyFirst!.floor)).join('·')}, 반올림하면 ${hour.variants.map((v) => won(v.hourlyFirst!.round)).join('·')}입니다. 시급 끝수를 언제 처리하는지도 회사 기준입니다.`);
  }
  if (shows('WORKDAY') && row('WORKDAY').variants.length > 1) lines.push(WORKDAY_SPLIT);
  if (shows('DAY_30') && row('DAY_30').fullByThirty && r.monthDays === 31) lines.push(FULL_BY_THIRTY);
  if (r.ignoredHolidays.length) lines.push(`주말인 공휴일(${r.ignoredHolidays.map(md).join(', ')})은 소정근로일이 아니어서 세지 않았습니다.`);
  const p = payslipLine(r);
  if (p) lines.push(p);
  lines.push(minWageLine(r.minWage, r.monthlyPay, r.month));
  if (all) lines.push(ASK(r));
  return lines;
}

/** 방식별 값 — 한 줄씩 */
export function methodLines(r: ProrationResult): { id: MethodId; name: string; values: string; hint: string }[] {
  return r.rows.map((x) => ({ id: x.id, name: METHOD_NAME[x.id], values: valuesText(x.variants), hint: METHOD_HINT[x.id] }));
}

/** 계산 과정(접기) */
export function formulaLines(r: ProrationResult): string[] {
  if (r.status === 'full-month') return [];
  const h = r.hours;
  const lines = [
    `재직 범위: ${md(r.from)}~${md(r.to)} — 재직 ${r.employedDays}일, 그달 ${r.monthDays}일, 재직 기간 평일 ${r.employedWorkdays}일, 그달 평일 ${r.monthWorkdays}일${r.holidaysInMonth.length ? `(쉬는 공휴일 ${r.holidaysInMonth.map(md).join(', ')} 포함)` : ''}.`,
    `유급시간: 소정근로 ${h.work}시간 + 쉬는 공휴일 ${h.publicHoliday}시간 + 주휴 ${h.weekly}시간${h.firstWeekOpen ? ` (+ 첫 주 주휴 ${h.firstWeekOpen}시간은 두 값으로)` : ''}. 주휴는 그 주 월~일 내내 근로관계가 있던 주만, 주휴일 날짜가 든 달로 셉니다.`,
  ];
  for (const row of r.rows) {
    for (const v of row.variants) lines.push(`${METHOD_NAME[row.id]}${v.label ? `(${v.label})` : ''}: ${formulaOf(r, row.id, v)} = ${money(v)}`);
  }
  lines.push('30일 기준(지급식)·시간 기준은 월급 대조 도구와 같은 계산 엔진으로 냅니다. 30일 기준(공제식)은 28일·31일 달에서 지급식과 값이 달라집니다.');
  return lines;
}

/** 참고 — 그 기간 유급시간으로 나눈 시간당 금액. 최저임금을 판단하는 값이 아니다 */
export function referenceLines(r: ProrationResult): string[] {
  if (r.status === 'full-month' || !r.minWage) return [];
  if (!r.reference) return ['그 기간 유급시간이 두 값으로 갈려 참고 시간당 금액을 내지 않습니다.'];
  const { paidHours, minHourly, floor } = r.reference;
  const lines = [`참고: 그 기간 유급시간 ${paidHours}시간 × 시간급 최저임금 ${won(minHourly)} = ${won(floor)}.`];
  for (const row of r.rows) {
    if (row.id === 'FULL') continue;
    for (const v of row.variants) {
      const x = shown(v), diff = x - floor;
      lines.push(`${METHOD_NAME[row.id]}${v.label ? `(${v.label})` : ''} ${money(v)} — 시간당 ${dec(x / paidHours)}원, 위 금액과 차이 ${diff >= 0 ? '+' : '−'}${dec(Math.abs(diff))}원`);
    }
  }
  lines.push('최저임금은 월급 원금을 209시간으로 나눠 대조합니다. 그달 내내 재직한 달도 유급시간은 달마다 달라 209시간과 같지 않으므로, 이 참고 값으로 모자라다고 정하지 않습니다.');
  return lines;
}

// ── 결근·지각 공제 ──

export function absenceHeadline(a: AbsenceResult): string[] {
  const hour = a.rows.find((x) => x.unit === 'HOUR8')!;
  const lines: string[] = [];
  if (a.absentDays > 0) {
    lines.push(a.holidayWeeks > 0
      ? `결근 ${a.absentDays}일 공제는 결근일분만이면 ${money(hour.daysOnly)}, 그 주 주휴 1일분까지 빼면 ${money(hour.withHoliday)}입니다(통상시급 × 8시간).`
      : `결근 ${a.absentDays}일 공제는 ${money(hour.daysOnly)}입니다(통상시급 × 8시간).`);
    if (a.holidayWeeks > 0) lines.push('주휴가 든 월급에서 결근한 주의 주휴분까지 빼는지는 법이 정하지 않아 회사 규정·관행으로 정해집니다.');
    if (a.late) lines.push(`지각·조퇴 ${a.late.hours}시간은 그 시간분 ${money(a.late)}이고, 주휴는 빼지 않습니다.`);
  } else if (a.late) {
    lines.push(`지각·조퇴 ${a.late.hours}시간 공제는 그 시간분 ${money(a.late)}입니다.`);
    lines.push('지각·조퇴는 결근이 아니어서 그 주 주휴는 빼지 않습니다(근로기준과-5560, 근기01254-1103).');
  }
  return lines;
}

function companyLines(a: AbsenceResult): string[] {
  const c = a.company;
  if (!c) return [];
  const n = won(c.amount);
  const lines: string[] = [];
  if (c.matches.length) {
    lines.push(`회사 공제액 ${n}과 같은 값: ${c.matches.map((x) => `${UNIT_NAME[x.unit]}(${x.holiday ? '그 주 주휴 포함' : '결근일분만'})${x.how ? ` 값을 ${ruleName(x.how)}로 처리한 금액` : ''}`).join(', ')}.`);
  }
  if (c.excess) {
    lines.push(`회사 공제액 ${n}은 그 주 주휴까지 넣은 무노동분 ${fracWon(a.noWorkMax)}보다 ${fracWon(c.excess)} 많습니다. 실제 무노동분을 넘는 공제는 감급(근로기준법 제95조)으로 보며(법무811-21010), 1회는 평균임금 1일분의 절반, 총액은 1임금지급기 임금 총액의 10분의 1을 넘지 못합니다.`);
    if (!c.limits) lines.push('상시 4명 이하 사업장에는 제95조가 적용되지 않아(시행령 별표1) 한도를 대조하지 않습니다.');
    else {
      lines.push(c.limits.perIncident === null
        ? '1회 한도는 평균임금 1일분을 넣으면 대조합니다.'
        : `초과분 ${fracWon(c.excess)}은 1회 한도 ${dec(c.limits.perIncident)}원보다 ${c.overPerIncident ? '큽니다' : '크지 않습니다'}.`);
      lines.push(`넣은 월급의 10분의 1은 ${fracWon(c.limits.total)}이고 초과분은 그보다 ${c.overTotal ? '큽니다' : '크지 않습니다'}(그달 임금 총액이 월급보다 크면 한도도 커집니다).`);
    }
  } else if (!c.matches.length) {
    lines.push(`회사 공제액 ${n}은 위 값 어느 것과도 같지 않고, 그 주 주휴까지 넣은 무노동분 ${fracWon(a.noWorkMax)}보다 많지 않습니다. 회사가 쓴 1일 단가와 공제한 날수·시간을 확인해 보세요.`);
  }
  return lines;
}

export function absenceEffectLines(a: AbsenceResult): string[] {
  const lines: string[] = [];
  if (a.absentDays > 0) {
    lines.push('결근일 임금은 그달 근로일수와 상관없이 고정급을 주기로 정하지 않았으면 지급 의무가 없습니다(근기01254-18756). 개근하지 않은 주의 주휴는 유급으로 줄 의무가 없지만(시행령 제30조 제1항, 근기01254-1103), 규정이나 관행으로 주어 왔다면 그에 따릅니다(근로개선정책과-3833).');
    if (a.holidayWeeks > 0) lines.push('한 주에 여러 날 결근해도 그 주 주휴는 1일만 빠집니다(법무811-23530).');
    if (a.nextMonthWeeks > 0) lines.push(`결근한 주 ${a.nextMonthWeeks}개는 주휴일이 다음 달이라 이 달 공제에 넣지 않았습니다. 주휴를 어느 달에 넣는지는 회사 기준입니다.`);
    lines.push('1일 단가를 월급 ÷ 30이나 그달 날수로 정한 회사는 아래 값입니다. 1일 단가를 정한 행정해석은 찾지 못해 회사 규정으로 확인합니다.');
  }
  if (a.roundingOpen) lines.push(ROUNDING_OPEN);
  lines.push(...companyLines(a));
  lines.push('결근·지각으로 근로하지 않은 시간의 임금은 최저임금 대조에서 빠집니다(최저임금법 제6조 제6항 제1호).');
  lines.push(minWageLine(a.minWage, a.monthlyPay, a.month));
  return lines;
}

/** 1일 단가별 표 — 한 줄씩 */
export function absenceRowLines(a: AbsenceResult): string[] {
  if (a.absentDays === 0) return [];
  return a.rows.map((x) => {
    const rate = x.unit === 'CALENDAR' ? `월급 ÷ ${a.monthDays}일` : UNIT_NAME[x.unit];
    const day = fracWon(x.dayRate);
    return a.holidayWeeks > 0
      ? `${rate}(1일 ${day}): 결근일분만 ${money(x.daysOnly)} · 그 주 주휴까지 ${money(x.withHoliday)}`
      : `${rate}(1일 ${day}): ${money(x.daysOnly)}`;
  });
}

/** 시험이 금지어를 훑는 문장 전부 */
export function allCopy(results: ProrationResult[], absences: AbsenceResult[]): string[] {
  const bases: Basis[] = ['unknown', 'DAY_30', 'DAY_30_DEDUCT', 'CALENDAR', 'WORKDAY', 'HOUR_ACTUAL', 'FULL'];
  return [
    ...BASIS,
    ...NOT_COVERED,
    ...Object.values(METHOD_NAME),
    ...Object.values(METHOD_HINT),
    ...Object.values(UNIT_NAME),
    ...results.flatMap((r) => [
      ...bases.flatMap((b) => [...headline(r, b), ...effectLines(r, b)]),
      ...methodLines(r).map((x) => `${x.name} ${x.values} ${x.hint}`),
      ...formulaLines(r),
      ...referenceLines(r),
    ]),
    ...absences.flatMap((a) => [...absenceHeadline(a), ...absenceEffectLines(a), ...absenceRowLines(a)]),
  ];
}
