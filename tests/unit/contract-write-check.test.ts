// 근로계약서 작성 → 근로계약서 점검 되먹임. 작성 기능이 만든 계약을 점검 규칙에 넣으면 위반·확인 필요가 없어야 한다.
import { describe, expect, it } from 'vitest';

import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import { checkWritten, designFromForm, toContract, type WriteForm } from '@/lib/contract-write/contract';

const UIJEONGBU: WriteForm = {
  workplaceName: '합성테스트 사업장',
  employeeCount5plus: true,
  employeeName: '합성01',
  startDate: '2026-03-01',
  endDate: null,
  location: '합성테스트 본점',
  duty: '홀 서비스',
  start: '10:00',
  end: '22:00',
  breakMinutes: 155,
  workDays: ['월', '화', '수', '목'],
  weeklyRestDay: '일',
  writtenDate: '2026-02-25',
  monthlyTotal: 2_600_000,
  holidayDaysPerYear: 22,
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

const SUWON: WriteForm = {
  ...UIJEONGBU,
  workDays: ['월', '화', '수', '목', '금'],
  start: '10:00',
  end: '21:00',
  breakMinutes: 60,
  monthlyTotal: 3_200_000,
  holidayDaysPerYear: 18.75,
  overrides: { overtimeHours: 65.2, holidayHours: 25, leaveHours: 10 },
};

// 화면과 같은 함수(checkWritten)로 본다 — 시험이 필터 사본을 들고 있으면 둘이 어긋나도 모른다
function problems(form: WriteForm) {
  return checkWritten(form, designFromForm(form));
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
    const design = designFromForm(UIJEONGBU);
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

// #139 적대 검토 4 — 금액 단위 3 × 잔액 항목 4 = 12칸. 도구가 만든 계약서를 자기 점검이 위반으로 잡지 않는다
describe('금액 단위 × 잔액 항목 매트릭스', () => {
  const ROUNDINGS = ['won', 'ceil10', 'ceil100'] as const;
  const ABSORBERS = ['base', 'overtime', 'holiday', 'leave'] as const;
  const PART_FORM: WriteForm = { ...UIJEONGBU, payType: 'hourly', monthlyTotal: undefined, hourlyWage: 15_000, workDays: ['월', '화', '수', '목', '금'], start: '10:00', end: '20:00', breakMinutes: 60, holidayDaysPerYear: 16 };
  for (const [name, form] of [['의정부 주4 월급', UIJEONGBU], ['파트(연장 있음)', PART_FORM]] as const) {
    for (const rounding of ROUNDINGS) {
      for (const absorbInto of ABSORBERS) {
        it(`${name} · ${rounding} · 잔액 ${absorbInto}`, () => {
          const f = { ...form, rounding, absorbInto } as WriteForm;
          let design;
          try {
            design = designFromForm(f);
          } catch (e) {
            // 단위 맞춤은 기본급만 잔액을 받는다 — 가산 항목이 잔액을 받으면 산정 기준보다 적어진다
            expect(rounding).not.toBe('won');
            expect(absorbInto).not.toBe('base');
            expect(String(e)).toContain('기본급');
            return;
          }
          expect(checkWritten(f, design).map((x) => `${x.rule_code}:${x.status} ${x.detail}`)).toEqual([]);
        });
      }
    }
  }
});

describe('단위 올림 표시 — 엔진 허용 폭(자기시험)', () => {
  const f = { ...UIJEONGBU, rounding: 'ceil100' } as WriteForm;
  const shifted = (delta: number) => {
    const contract = toContract(f, designFromForm(f));
    contract.wage.items!.find((i) => i.code === 'OT_WEEKDAY')!.amount! += delta;
    const [c] = normalize([contract]);
    return checkContract(c).find((x) => x.rule_code === 'WAGE-MATH')!;
  };
  it('올린 그대로면 정합, 산출근거에 「100원 단위 올림」', () => {
    expect(shifted(0).status).toBe('ok');
    expect(toContract(f, designFromForm(f)).wage.items!.find((i) => i.code === 'OT_WEEKDAY')!.basis_text).toContain('100원 단위 올림');
  });
  it('적은 쪽은 여전히 ±10원 — 130원 줄여 계산값보다 40원 남짓 적으면 위반', () => {
    expect(shifted(-130).status).toBe('violation');
  });
  it('많은 쪽도 단위를 넘으면 위반 — 200원 늘리면 위반', () => {
    expect(shifted(200).status).toBe('violation');
  });
});

// #139 적대 검토 10 — 연장 1.5배는 가산(0.5)을 포함한 배율이다. 「가산 1.5배」라고 적지 않는다
describe('산출근거 배율 문구', () => {
  it('연장 = 「1.5배, 가산 포함」, 야간 = 「가산분 0.5배」', () => {
    const night = { ...UIJEONGBU, end: '22:30' } as WriteForm;
    const items = toContract(night, designFromForm(night)).wage.items!;
    const text = (code: string) => items.find((i) => i.code === code)!.basis_text!;
    expect(text('OT_WEEKDAY')).toContain('(1.5배, 가산 포함)');
    expect(text('OT_WEEKDAY')).not.toContain('가산 1.5배');
    expect(text('NIGHT')).toContain('(가산분 0.5배)');
  });
});
