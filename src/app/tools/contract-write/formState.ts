// 근로계약서 작성 화면 입력 — 순수 TS(시험이 tsx 를 import 하지 않게 컴포넌트와 나눈다).
// 입력은 문자열로 들고, toWriteForm 이 숫자로 바꾸며 빠진 칸과 맞지 않는 값을 모은다.

import { takeHomeRatesOn } from '@/lib/calc/take-home-pay';
import { ITEM_LABEL, type ItemKey, type Rounding } from '@/lib/contract-write/design';
import { dailyWorkHours, isUnder15, itemHoursOf, spanMinutes, WEEK_DAYS, type WeekDay, type WriteForm } from '@/lib/contract-write/contract';
import { netToGross } from '@/lib/contract-write/net-gross';
import { cleanInput } from '@/lib/contract-write/text';
import { todayKst } from '@/lib/tool-kit';

export { WEEK_DAYS };

export interface WriteState {
  workplaceName: string;
  ownerName: string;
  fivePlus: 'yes' | 'no';
  employeeName: string;
  startDate: string;
  endDate: string;
  /** 비우면 오늘(KST) */
  writtenDate: string;
  location: string;
  duty: string;
  probation: 'none' | 'yes';
  probationMonths: string;
  probationReduced: 'no' | 'yes';
  simpleLabor: 'no' | 'yes';
  workDays: string[];
  start: string;
  end: string;
  breakMinutes: string;
  weeklyRestDay: WeekDay;
  payType: 'monthly' | 'hourly';
  /** 월급제 — 총액으로 넣기 / 실수령액으로 넣기 */
  amountMode: 'gross' | 'net';
  monthlyTotal: string;
  netPay: string;
  family: string;
  hourlyWage: string;
  absentWeekHoliday: 'deduct' | 'keep';
  holidayDaysPerYear: string;
  overtimeHours: string;
  holidayHours: string;
  leaveHours: string;
  rounding: Rounding;
  absorbInto: ItemKey;
  payday: string;
  paymentMethod: string;
}

export const INITIAL: WriteState = {
  workplaceName: '',
  ownerName: '',
  fivePlus: 'yes',
  employeeName: '',
  startDate: '',
  endDate: '',
  writtenDate: '',
  location: '',
  duty: '',
  probation: 'none',
  probationMonths: '3',
  probationReduced: 'no',
  simpleLabor: 'no',
  workDays: ['월', '화', '수', '목', '금'],
  start: '09:00',
  end: '18:00',
  breakMinutes: '60',
  weeklyRestDay: '일',
  payType: 'monthly',
  amountMode: 'gross',
  monthlyTotal: '',
  netPay: '',
  family: '1',
  hourlyWage: '',
  absentWeekHoliday: 'deduct',
  holidayDaysPerYear: '0',
  overtimeHours: '',
  holidayHours: '',
  leaveHours: '',
  rounding: 'won',
  absorbInto: 'base',
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

/** 빈 칸 = null, 숫자로 읽을 수 없거나 음수 = NaN. 조용히 0 으로 바꾸지 않는다 */
const num = (s: string): number | null => {
  const t = s.replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** 금액 칸 입력 거르개 — 숫자·쉼표·소수점만 남긴다. 소수점을 지우면 「10,500.5」가 「105,005」로 바뀌므로 남겨 두고 toWriteForm 이 다시 넣어 달라고 한다 */
export const amountInput = (v: string): string => v.replace(/[^\d,.]/g, '');

export interface ParsedForm {
  form: WriteForm | null;
  /** 비었거나 잘못된 칸 이름 */
  missing: string[];
  /** 실수령액으로 넣었을 때 찾은 총액 설명 */
  netNote?: string;
  /** 계산할 수 없는 입력(값이 서로 맞지 않음·숫자가 아님·실수령액 범위 밖 등) */
  error?: string;
}

/** 실수령액 역산에 쓸 요율 날짜 — 계약 시작일의 요율이 없으면 오늘 */
function ratesDate(startDate: string, today: string): string {
  return takeHomeRatesOn(startDate) ? startDate : today;
}

/** 글 칸 — 제어문자를 지우고 ㈜ 를 (주) 로, 앞뒤 빈칸을 뗀다(한글·엑셀·PDF 가 깨지지 않게) */
const t = cleanInput;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** 월 인정시간 직접 정하기 칸(비운 칸은 넣지 않는다) */
function overridesOf(s: WriteState): NonNullable<WriteForm['overrides']> {
  const overtime = num(s.overtimeHours);
  const holiday = num(s.holidayHours);
  const leave = num(s.leaveHours);
  return {
    ...(overtime != null ? { overtimeHours: overtime } : {}),
    ...(holiday != null ? { holidayHours: holiday } : {}),
    ...(leave != null ? { leaveHours: leave } : {}),
  };
}

export function toWriteForm(s: WriteState, today = todayKst()): ParsedForm {
  const missing: string[] = [];
  const hourly = s.payType === 'hourly';
  const net = s.amountMode === 'net';
  const breakMin = num(s.breakMinutes);
  if (!t(s.workplaceName)) missing.push('사업체명');
  if (!t(s.employeeName)) missing.push('근로자 성명');
  if (!DATE.test(s.startDate)) missing.push('계약 시작일');
  if (!t(s.location)) missing.push('근무장소');
  if (!t(s.duty)) missing.push('업무');
  if (s.workDays.length === 0) missing.push('근무 요일');
  if (!TIME.test(s.start) || !TIME.test(s.end)) missing.push('출근·퇴근 시각');
  if (breakMin == null) missing.push('휴게시간');
  if (hourly) {
    if (num(s.hourlyWage) == null) missing.push('시간당 지급액');
  } else if (net) {
    if (num(s.netPay) == null) missing.push('월 실수령액');
    if (num(s.family) == null) missing.push('공제대상가족 수');
  } else if (num(s.monthlyTotal) == null) missing.push('월 임금 총액');
  if (s.probation === 'yes' && num(s.probationMonths) == null) missing.push('수습 개월 수');
  if (missing.length) return { form: null, missing };

  // 숫자 칸 — 숫자가 아니면 그 칸 이름을 댄다
  const numeric: Array<[string, string, boolean]> = [
    ['하루 휴게시간', s.breakMinutes, true],
    ['연간 공휴일 근무 예정 일수', s.holidayDaysPerYear, true],
    ['시간당 지급액', s.hourlyWage, hourly],
    ['월 임금 총액', s.monthlyTotal, !hourly && !net],
    ['월 실수령액', s.netPay, !hourly && net],
    ['공제대상가족 수', s.family, !hourly && net],
    ['연장 시간', s.overtimeHours, !hourly],
    ['휴일 시간', s.holidayHours, !hourly],
    ['연차 시간', s.leaveHours, !hourly],
    ['수습 개월 수', s.probationMonths, s.probation === 'yes'],
  ];
  const bad = numeric.filter(([, v, used]) => used && Number.isNaN(num(v))).map(([label]) => label);
  // 금액 칸은 원 단위 정수만 받는다 — 소수점을 지우거나 반올림해 금액을 바꾸지 않고 다시 넣어 달라고 한다(PR #140 추가 경계 입력)
  const wonFields: Array<[string, string, boolean]> = [
    ['시간당 지급액', s.hourlyWage, hourly],
    ['월 임금 총액', s.monthlyTotal, !hourly && !net],
    ['월 실수령액', s.netPay, !hourly && net],
  ];
  const fractional = wonFields
    .filter(([, v, used]) => {
      const n = num(v);
      return used && n != null && Number.isFinite(n) && !Number.isInteger(n);
    })
    .map(([label]) => label);
  const problems: string[] = [];
  if (bad.length) problems.push(`숫자로 읽을 수 없는 칸: ${bad.join(', ')}.`);
  if (fractional.length) problems.push(`금액은 원 단위 정수로 넣어 주세요(소수점 없이): ${fractional.join(', ')}.`);
  if (s.writtenDate && !DATE.test(s.writtenDate)) problems.push('작성일을 YYYY-MM-DD 로 넣어 주세요.');
  if (s.endDate && (!DATE.test(s.endDate) || s.endDate < s.startDate)) problems.push('계약 종료일이 시작일보다 빠릅니다.');
  const times = { start: s.start, end: s.end, breakMinutes: breakMin ?? 0 };
  if (s.start === s.end) problems.push('출근과 퇴근 시각이 같습니다.');
  else if (!bad.length && dailyWorkHours(times) <= 0) {
    problems.push(`휴게시간(${breakMin}분)이 출근~퇴근 시간(${spanMinutes(times)}분)과 같거나 깁니다.`);
  }
  if (s.workDays.length >= 7) problems.push('주 7일 근무로는 계약서를 만들 수 없습니다 — 1주에 1일 이상 유급휴일을 주어야 합니다(근로기준법 제55조 제1항).');
  else if (s.workDays.includes(s.weeklyRestDay)) problems.push(`주휴일(${s.weeklyRestDay}요일)이 근무 요일과 겹칩니다.`);
  if (!hourly && net && (num(s.family) ?? 0) < 1) problems.push('공제대상가족 수는 본인을 포함해 1명 이상입니다.');
  if (problems.length) return { form: null, missing: [], error: problems.join(' ') };

  let monthlyTotal = hourly ? undefined : (num(s.monthlyTotal) ?? undefined);
  let netNote: string | undefined;
  if (!hourly && net) {
    try {
      const r = netToGross(Math.round(num(s.netPay)!), { family: Math.round(num(s.family)!), date: ratesDate(s.startDate, today) });
      monthlyTotal = r.gross;
      netNote = `실수령액 ${r.takeHome.toLocaleString('ko-KR')}원이 되는 월 임금 총액 ${r.gross.toLocaleString('ko-KR')}원(4대보험 근로자 몫·소득세·지방소득세 ${r.deduction.toLocaleString('ko-KR')}원, 비과세 없음·공제대상가족 ${num(s.family)}명 기준)`;
    } catch (e) {
      return { form: null, missing: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  const overrides = overridesOf(s);
  return {
    form: {
      workplaceName: t(s.workplaceName),
      ownerName: t(s.ownerName) || undefined,
      employeeCount5plus: s.fivePlus === 'yes',
      employeeName: t(s.employeeName),
      startDate: s.startDate,
      endDate: s.endDate || null,
      writtenDate: s.writtenDate || today,
      location: t(s.location),
      duty: t(s.duty),
      workDays: WEEK_DAYS.filter((d) => s.workDays.includes(d)),
      start: s.start,
      end: s.end,
      breakMinutes: breakMin!,
      weeklyRestDay: s.weeklyRestDay,
      payType: s.payType,
      monthlyTotal,
      hourlyWage: hourly ? num(s.hourlyWage)! : undefined,
      absentWeekHoliday: hourly ? s.absentWeekHoliday : undefined,
      holidayDaysPerYear: num(s.holidayDaysPerYear) ?? 0,
      overrides: !hourly && Object.keys(overrides).length ? overrides : undefined,
      rounding: s.rounding,
      absorbInto: effectiveAbsorb(s),
      probation:
        s.probation === 'yes'
          ? { months: num(s.probationMonths)!, reduced: s.probationReduced === 'yes', simpleLabor: s.simpleLabor === 'yes' }
          : null,
      payday: t(s.payday),
      paymentMethod: t(s.paymentMethod),
    },
    missing: [],
    netNote,
  };
}

/**
 * 끝에 남는 금액을 받을 수 있는 항목 = 표에 금액이 실리는 행(인정시간 > 0)과 그 이름, 표 순서 — 화면·오프라인판 공용.
 * 5명 미만·1주 15시간 미만처럼 표에 없는 항목(휴일·연차·「주휴 포함」 기본급)은 내지 않는다. 0시간 행은 잔액을 받을 수 없다(splitTotal).
 * 파트의 기본급과 1주 15시간 미만 월급제의 기본급은 주휴를 담지 않아 「기본급」이다(design.ts·part.ts 와 같다).
 */
export function absorbOptions(s: WriteState): Array<{ value: ItemKey; label: string }> {
  const hourly = s.payType === 'hourly';
  const keys: ItemKey[] = hourly ? ['base', 'weeklyHoliday', 'overtime', 'night', 'leave', 'holiday'] : ['base', 'overtime', 'night', 'holiday', 'leave'];
  const breakMinutes = num(s.breakMinutes);
  const holidayDays = num(s.holidayDaysPerYear);
  const times = { start: s.start, end: s.end, breakMinutes: breakMinutes ?? NaN };
  // 근무형태를 아직 읽을 수 없으면 기본급만 — 계산 결과 칸이 무엇이 빠졌는지 따로 알린다
  const readable = TIME.test(s.start) && TIME.test(s.end) && s.workDays.length > 0 && breakMinutes != null && Number.isFinite(breakMinutes) && dailyWorkHours(times) > 0;
  if (!readable) return [{ value: 'base', label: hourly ? '기본급' : ITEM_LABEL.base }];
  const workDays = WEEK_DAYS.filter((d) => s.workDays.includes(d));
  const hours = itemHoursOf({
    payType: s.payType,
    start: s.start,
    end: s.end,
    breakMinutes,
    workDays,
    holidayDaysPerYear: holidayDays != null && Number.isFinite(holidayDays) ? holidayDays : 0,
    employeeCount5plus: s.fivePlus === 'yes',
    overrides: hourly ? undefined : overridesOf(s),
  });
  const plainBase = hourly || isUnder15({ ...times, breakMinutes, workDays });
  return keys.filter((k) => hours[k] > 0).map((k) => ({ value: k, label: k === 'base' && plainBase ? '기본급' : ITEM_LABEL[k] }));
}

/** 잔액을 받을 항목 — 고른 항목이 선택지에서 빠졌으면(5명 미만으로 바꿈 등) 기본급. 화면 선택 표시와 계산이 같은 값을 쓴다 */
export function effectiveAbsorb(s: WriteState): ItemKey {
  return absorbOptions(s).some((o) => o.value === s.absorbInto) ? s.absorbInto : 'base';
}
