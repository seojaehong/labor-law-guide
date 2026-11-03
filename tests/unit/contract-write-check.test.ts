// 근로계약서 작성 → 근로계약서 점검 되먹임. 작성 기능이 만든 계약을 점검 규칙에 넣으면 위반·확인 필요가 없어야 한다.
import { describe, expect, it } from 'vitest';

import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import { designFromForm, toContract, type WriteForm } from '@/lib/contract-write/contract';

const UIJEONGBU: WriteForm = {
  workplaceName: '합성테스트 사업장',
  employeeCount5plus: true,
  employeeName: '합성01',
  startDate: '2026-03-01',
  endDate: null,
  location: '합성테스트 본점',
  duty: '홀 서비스',
  daysPerWeek: 4,
  start: '10:00',
  end: '22:00',
  breakMinutes: 155,
  workDays: ['월', '화', '수', '목'],
  weeklyRestDay: '매주 일요일',
  monthlyTotal: 2_600_000,
  holidayDaysPerYear: 22,
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

const SUWON: WriteForm = {
  ...UIJEONGBU,
  daysPerWeek: 5,
  workDays: ['월', '화', '수', '목', '금'],
  start: '10:00',
  end: '21:00',
  breakMinutes: 60,
  monthlyTotal: 3_200_000,
  holidayDaysPerYear: 18.75,
  overrides: { overtimeHours: 65.2, holidayHours: 25, leaveHours: 10 },
};

function problems(form: WriteForm) {
  const [contract] = normalize([toContract(form, designFromForm(form, 10_320))]);
  return checkContract(contract).filter((f) => f.status === 'violation' || f.status === 'needs_data' || (f.status === 'risk' && f.severity !== 'minor' && f.severity !== 'info'));
}

describe('작성 → 점검 되먹임', () => {
  it('의정부 주4 표본은 점검에서 위반·확인 필요가 없다', () => {
    expect(problems(UIJEONGBU)).toEqual([]);
  });

  it('수원 표본은 점검에서 위반·확인 필요가 없다', () => {
    expect(problems(SUWON)).toEqual([]);
  });

  it('총액을 최저 아래로 낮추면 점검이 최저임금 위반을 낸다(자기시험)', () => {
    const codes = problems({ ...UIJEONGBU, monthlyTotal: 2_000_000 }).map((f) => `${f.rule_code}:${f.status}`);
    expect(codes).toContain('MINWAGE:violation');
  });

  it('연장수당을 3,000원 줄이면 단시간 초과근로 가산 부족을 낸다(자기시험 — 반올림 전 5.6667H 기준)', () => {
    const design = designFromForm(UIJEONGBU, 10_320);
    const contract = toContract(UIJEONGBU, design);
    const ot = contract.wage.items!.find((i) => i.code === 'OT_WEEKDAY')!;
    ot.amount -= 3_000;
    const [c] = normalize([contract]);
    const f = checkContract(c).find((x) => x.rule_code === 'PART-TIME-OT');
    expect(f?.status).not.toBe('ok');
    expect(f?.detail).toContain('부족');
  });

  it('하루 실근로 = 퇴근 − 출근 − 휴게', () => {
    expect(designFromForm(UIJEONGBU).hours.overtime).toBeCloseTo(36.9325, 6);
  });
});
