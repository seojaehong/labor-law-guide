import { describe, expect, it } from 'vitest';
import {
  employmentInsuranceReportDeadline,
  estimateLeavePay,
  estimateSeverance,
  jobseekerPeriodEnd,
  milestones,
  monthlyPaidHours,
  parseYmd,
  retirementDate,
  severanceCheck,
  validate,
  withinDaysFromRetirement,
} from '@/app/exit/exit-calc';
import { STEPS } from '@/content/exit-worker-data';

describe('퇴직일과 기한 세는 법', () => {
  it('퇴직일은 마지막 근무일 다음 날 — 월말·연말을 넘긴다', () => {
    expect(retirementDate('2026-10-31')).toBe('2026-11-01');
    expect(retirementDate('2026-12-31')).toBe('2027-01-01');
    expect(retirementDate('2028-02-28')).toBe('2028-02-29');
  });

  it('14일 안 = 마지막 근무일 + 14일(퇴직일을 1일째로 센다)', () => {
    expect(withinDaysFromRetirement('2026-10-31', 14)).toBe('2026-11-14');
    expect(withinDaysFromRetirement('2028-02-20', 14)).toBe('2028-03-05'); // 윤년 2월 29일 포함
    expect(withinDaysFromRetirement('2027-02-20', 14)).toBe('2027-03-06');
  });

  it('고용보험 상실 신고 기한 = 상실일이 속한 달의 다음 달 15일', () => {
    expect(employmentInsuranceReportDeadline('2026-10-15')).toBe('2026-11-15');
    expect(employmentInsuranceReportDeadline('2026-12-30')).toBe('2027-01-15'); // 12월 퇴사 → 다음 해 1월 15일
    expect(employmentInsuranceReportDeadline('2026-12-31')).toBe('2027-02-15'); // 상실일 1월 1일 → 2월 15일
    expect(employmentInsuranceReportDeadline('2026-10-31')).toBe('2026-12-15'); // 월말 퇴사
  });

  it('구직급여 수급기간은 이직일 다음 날부터 12개월', () => {
    expect(jobseekerPeriodEnd('2026-10-31')).toBe('2027-10-31');
    expect(jobseekerPeriodEnd('2027-02-28')).toBe('2028-02-29');
    expect(jobseekerPeriodEnd('2028-02-28')).toBe('2029-02-28');
  });

  it('이정표는 데이터 파일 항목과 한 쌍으로 맞는다', () => {
    const keys = milestones('2026-10-31').map(m => m.key).sort();
    const used = STEPS.filter(s => s.milestone).map(s => s.milestone).sort();
    expect(used).toEqual(keys);
  });
});

describe('퇴직금 요건', () => {
  it('근속 365일(퇴직일이 입사 1년 뒤 같은 날)이면 1년 이상, 364일이면 미만', () => {
    const a = severanceCheck('2025-01-01', '2025-12-31', 40);
    expect(a.serviceDays).toBe(365);
    expect(a.oneYear).toBe(true);
    const b = severanceCheck('2025-01-01', '2025-12-30', 40);
    expect(b.serviceDays).toBe(364);
    expect(b.oneYear).toBe(false);
    expect(b.eligible).toBe(false);
  });

  it('윤년이 낀 365일은 아직 1년이 아니다', () => {
    const c = severanceCheck('2024-01-01', '2024-12-30', 40);
    expect(c.serviceDays).toBe(365);
    expect(c.oneYear).toBe(false);
    expect(severanceCheck('2024-01-01', '2024-12-31', 40).oneYear).toBe(true);
  });

  it('2월 29일 입사자는 다음 해 2월 말일까지 근무하면 1년', () => {
    expect(severanceCheck('2024-02-29', '2025-02-28', 40).oneYear).toBe(true);
    expect(severanceCheck('2024-02-29', '2025-02-27', 40).oneYear).toBe(false);
  });

  it('4주 평균 주 15시간 경계 — 15시간은 포함', () => {
    expect(severanceCheck('2024-01-01', '2025-06-30', 14.9).eligible).toBe(false);
    expect(severanceCheck('2024-01-01', '2025-06-30', 15).eligible).toBe(true);
    expect(severanceCheck('2024-01-01', '2025-06-30', 15.1).eligible).toBe(true);
  });
});

describe('확인용 추정치', () => {
  it('퇴직금 = 3개월 임금 ÷ 총일수 × 30 × 재직일수 ÷ 365', () => {
    const e = estimateSeverance('2025-01-01', '2025-12-31', 3_000_000);
    expect(e.periodStart).toBe('2025-10-01');
    expect(e.periodDays).toBe(92);
    // 고용노동부 계산기 끝수 — 1일 평균임금 97,826.09(올림) × 30 × 365 / 365 = 2,934,782.7 → 반올림
    expect(e.amount).toBe(2_934_783);
  });

  it('2월이 낀 3개월은 총일수가 줄어든다', () => {
    const e = estimateSeverance('2020-03-01', '2026-03-31', 3_000_000);
    expect(e.periodStart).toBe('2026-01-01');
    expect(e.periodDays).toBe(90);
  });

  it('3개월 전 같은 날이 없으면 그 달 말일부터 — 퇴직일 7/31 → 4/30', () => {
    const e = estimateSeverance('2020-03-01', '2026-07-30', 3_000_000);
    expect(e.periodStart).toBe('2026-04-30');
    expect(e.periodDays).toBe(92);
  });

  it('2월에 같은 날이 없으면 3월 1일부터 — 퇴직일 5/31, 고용노동부 계산기와 같다', () => {
    const e = estimateSeverance('2020-03-01', '2026-05-30', 3_000_000);
    expect(e.periodStart).toBe('2026-03-01');
    expect(e.periodDays).toBe(91);
  });

  it('월 소정근로시간 환산 — 주 40시간 209시간', () => {
    expect(monthlyPaidHours(40)).toBe(209);
    expect(monthlyPaidHours(20)).toBe(104);
    expect(monthlyPaidHours(15)).toBe(78);
  });

  it('연차수당 추정 — 주 15시간 미만은 적용 제외', () => {
    const a = estimateLeavePay(2_090_000, 40, 5);
    expect(a.daily).toBe(80_000);
    expect(a.amount).toBe(400_000);
    const b = estimateLeavePay(1_000_000, 14.9, 5);
    expect(b.applicable).toBe(false);
    expect(b.amount).toBe(0);
  });
});

describe('입력 확인', () => {
  it('존재하지 않는 날짜와 순서 뒤바뀜을 잡는다', () => {
    expect(parseYmd('2026-02-29')).toBeNull();
    expect(parseYmd('2028-02-29')).not.toBeNull();
    expect(validate({ hireDate: '2026-05-01', lastDay: '2026-04-30', monthlyWage: 1, weeklyHours: 40 })).toContain('order');
    expect(validate({ hireDate: '2026-01-01', lastDay: '2026-04-30', monthlyWage: 0, weeklyHours: 0 })).toEqual(['wage', 'hours']);
  });
});
