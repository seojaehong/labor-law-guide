// 근로계약서 작성 화면 입력 — 순수 TS(시험이 tsx 를 import 하지 않게 컴포넌트와 나눈다).
// 입력은 문자열로 들고, toWriteForm 이 숫자로 바꾸며 빠진 칸을 모은다.

import { takeHomeRatesOn } from '@/lib/calc/take-home-pay';
import type { ItemKey, Rounding } from '@/lib/contract-write/design';
import type { WriteForm } from '@/lib/contract-write/contract';
import { netToGross } from '@/lib/contract-write/net-gross';
import { todayKst } from '@/lib/tool-kit';

export const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export interface WriteState {
  workplaceName: string;
  ownerName: string;
  fivePlus: 'yes' | 'no';
  employeeName: string;
  startDate: string;
  endDate: string;
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
  weeklyRestDay: string;
  payType: 'monthly' | 'hourly';
  /** 월급제 — 총액으로 넣기 / 실수령액으로 넣기 */
  amountMode: 'gross' | 'net';
  monthlyTotal: string;
  netPay: string;
  family: string;
  hourlyWage: string;
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
  weeklyRestDay: '매주 일요일',
  payType: 'monthly',
  amountMode: 'gross',
  monthlyTotal: '',
  netPay: '',
  family: '1',
  hourlyWage: '',
  holidayDaysPerYear: '0',
  overtimeHours: '',
  holidayHours: '',
  leaveHours: '',
  rounding: 'won',
  absorbInto: 'base',
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

const num = (s: string): number | null => {
  const t = s.replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export interface ParsedForm {
  form: WriteForm | null;
  /** 비었거나 잘못된 칸 이름 */
  missing: string[];
  /** 실수령액으로 넣었을 때 찾은 총액 설명 */
  netNote?: string;
  /** 계산할 수 없는 입력(실수령액 범위 밖 등) */
  error?: string;
}

/** 실수령액 역산에 쓸 요율 날짜 — 계약 시작일의 요율이 없으면 오늘 */
function ratesDate(startDate: string, today: string): string {
  return takeHomeRatesOn(startDate) ? startDate : today;
}

export function toWriteForm(s: WriteState, today = todayKst()): ParsedForm {
  const missing: string[] = [];
  const breakMin = num(s.breakMinutes);
  const holidays = num(s.holidayDaysPerYear) ?? 0;
  const hourly = s.payType === 'hourly';
  const net = s.amountMode === 'net';
  if (!s.workplaceName.trim()) missing.push('사업체명');
  if (!s.employeeName.trim()) missing.push('근로자 성명');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) missing.push('계약 시작일');
  if (s.workDays.length === 0) missing.push('근무 요일');
  if (!/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end)) missing.push('출근·퇴근 시각');
  if (breakMin == null || breakMin < 0) missing.push('휴게시간');
  if (hourly) {
    if (!((num(s.hourlyWage) ?? 0) > 0)) missing.push('시간당 지급액');
  } else if (net) {
    if (!((num(s.netPay) ?? 0) > 0)) missing.push('월 실수령액');
    if (!((num(s.family) ?? 0) >= 1)) missing.push('공제대상가족 수');
  } else if (!((num(s.monthlyTotal) ?? 0) > 0)) missing.push('월 임금 총액');
  if (s.probation === 'yes' && !((num(s.probationMonths) ?? 0) > 0)) missing.push('수습 개월 수');
  if (missing.length) return { form: null, missing };

  let monthlyTotal = hourly ? undefined : num(s.monthlyTotal)!;
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

  const overrides = {
    ...(num(s.overtimeHours) != null ? { overtimeHours: num(s.overtimeHours)! } : {}),
    ...(num(s.holidayHours) != null ? { holidayHours: num(s.holidayHours)! } : {}),
    ...(num(s.leaveHours) != null ? { leaveHours: num(s.leaveHours)! } : {}),
  };
  return {
    form: {
      workplaceName: s.workplaceName.trim(),
      ownerName: s.ownerName.trim() || undefined,
      employeeCount5plus: s.fivePlus === 'yes',
      employeeName: s.employeeName.trim(),
      startDate: s.startDate,
      endDate: s.endDate || null,
      location: s.location.trim() || '사업장 소재지',
      duty: s.duty.trim() || '사업주가 정하는 업무',
      daysPerWeek: s.workDays.length,
      workDays: WEEK_DAYS.filter((d) => s.workDays.includes(d)),
      start: s.start,
      end: s.end,
      breakMinutes: breakMin!,
      weeklyRestDay: s.weeklyRestDay.trim() || '매주 일요일',
      payType: s.payType,
      monthlyTotal,
      hourlyWage: hourly ? num(s.hourlyWage)! : undefined,
      holidayDaysPerYear: holidays,
      overrides: !hourly && Object.keys(overrides).length ? overrides : undefined,
      rounding: s.rounding,
      absorbInto: s.absorbInto,
      probation:
        s.probation === 'yes'
          ? { months: num(s.probationMonths)!, reduced: s.probationReduced === 'yes', simpleLabor: s.simpleLabor === 'yes' }
          : null,
      payday: s.payday.trim(),
      paymentMethod: s.paymentMethod.trim(),
    },
    missing: [],
    netNote,
  };
}
