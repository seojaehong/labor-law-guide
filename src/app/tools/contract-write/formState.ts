// 근로계약서 작성 화면 입력 — 순수 TS(시험이 tsx 를 import 하지 않게 컴포넌트와 나눈다).
// 입력은 문자열로 들고, toWriteForm 이 숫자로 바꾸며 빠진 칸을 모은다.

import type { ItemKey, Rounding } from '@/lib/contract-write/design';
import type { WriteForm } from '@/lib/contract-write/contract';

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
  workDays: string[];
  start: string;
  end: string;
  breakMinutes: string;
  weeklyRestDay: string;
  monthlyTotal: string;
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
  workDays: ['월', '화', '수', '목', '금'],
  start: '09:00',
  end: '18:00',
  breakMinutes: '60',
  weeklyRestDay: '매주 일요일',
  monthlyTotal: '',
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
}

export function toWriteForm(s: WriteState): ParsedForm {
  const missing: string[] = [];
  const total = num(s.monthlyTotal);
  const breakMin = num(s.breakMinutes);
  const holidays = num(s.holidayDaysPerYear) ?? 0;
  if (!s.workplaceName.trim()) missing.push('사업체명');
  if (!s.employeeName.trim()) missing.push('근로자 성명');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) missing.push('계약 시작일');
  if (s.workDays.length === 0) missing.push('근무 요일');
  if (!/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end)) missing.push('출근·퇴근 시각');
  if (breakMin == null || breakMin < 0) missing.push('휴게시간');
  if (total == null || total <= 0) missing.push('월 임금 총액');
  if (missing.length) return { form: null, missing };
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
      monthlyTotal: total!,
      holidayDaysPerYear: holidays,
      overrides: Object.keys(overrides).length ? overrides : undefined,
      rounding: s.rounding,
      absorbInto: s.absorbInto,
      payday: s.payday.trim(),
      paymentMethod: s.paymentMethod.trim(),
    },
    missing: [],
  };
}
