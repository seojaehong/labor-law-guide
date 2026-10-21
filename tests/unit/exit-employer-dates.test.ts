import { describe, expect, it } from 'vitest';
import {
  addDays, computeExitDates, endOfNextMonth, fmtIso, fmtKo, isWeekend, march10NextYear, nextMonth10, nextMonth15, parseYmd, servedMonths,
} from '@/app/exit-employer/exit-dates';
import { STEPS } from '@/content/exit-employer-data';

const d = (s: string) => {
  const x = parseYmd(s);
  if (!x) throw new Error(`bad date ${s}`);
  return x;
};
const iso = (x: ReturnType<typeof d>) => fmtIso(x);

describe('parseYmd', () => {
  it('달력에 없는 날짜는 거부한다', () => {
    expect(parseYmd('2026-02-29')).toBeNull();
    expect(parseYmd('2026-13-01')).toBeNull();
    expect(parseYmd('2026-1-01')).toBeNull();
    expect(parseYmd('')).toBeNull();
    expect(parseYmd('2028-02-29')).not.toBeNull();
  });
});

describe('금품 청산 14일 (근로기준법 §36)', () => {
  it('마지막 근무일 + 14일', () => {
    expect(iso(computeExitDates(d('2026-10-31')).settle)).toBe('2026-11-14');
  });
  it('월말을 넘긴다', () => {
    expect(iso(computeExitDates(d('2026-01-20')).settle)).toBe('2026-02-03');
  });
  it('연말을 넘긴다', () => {
    expect(iso(computeExitDates(d('2026-12-25')).settle)).toBe('2027-01-08');
  });
  it('14일째가 토요일이어도 날짜를 미루지 않는다', () => {
    const s = computeExitDates(d('2026-10-31')).settle; // 2026-11-14 토
    expect(iso(s)).toBe('2026-11-14');
    expect(isWeekend(s)).toBe(true);
    expect(fmtKo(s)).toBe('2026.11.14.(토)');
  });
  it('윤년 2월을 지난다', () => {
    expect(iso(addDays(d('2028-02-20'), 14))).toBe('2028-03-05');
    expect(iso(addDays(d('2027-02-20'), 14))).toBe('2027-03-06');
  });
});

describe('다음 달 15일 신고 (고용보험법 시행령 §7① 등)', () => {
  it('12월 퇴사 → 다음 해 1월 15일', () => {
    expect(iso(nextMonth15(d('2026-12-31')))).toBe('2027-01-15');
    expect(iso(computeExitDates(d('2026-12-30')).report15)).toBe('2027-01-15');
    expect(iso(computeExitDates(d('2026-12-31')).report15)).toBe('2027-02-15');
  });
  it('말일까지 근무하면 상실일(다음 달 1일)이 속한 달 기준', () => {
    expect(iso(computeExitDates(d('2026-10-31')).report15)).toBe('2026-12-15');
    expect(iso(computeExitDates(d('2026-10-30')).report15)).toBe('2026-11-15');
  });
  it('월초 퇴사', () => {
    expect(iso(nextMonth15(d('2026-03-01')))).toBe('2026-04-15');
  });
});

describe('건강보험 자격 변동일부터 14일', () => {
  it('변동일(마지막 근무일 다음 날) 포함 14일째', () => {
    const x = computeExitDates(d('2026-10-31'));
    expect(iso(x.lossDay)).toBe('2026-11-01');
    expect(iso(x.health14)).toBe('2026-11-14');
  });
});

describe('세금 기한', () => {
  it('원천세 다음 달 10일 — 12월 지급분은 다음 해 1월', () => {
    expect(iso(nextMonth10(d('2026-12-14')))).toBe('2027-01-10');
  });
  it('원천징수영수증 다음 달 말일 — 윤년 2월 29일', () => {
    expect(iso(endOfNextMonth(d('2028-01-31')))).toBe('2028-02-29');
    expect(iso(endOfNextMonth(d('2027-01-15')))).toBe('2027-02-28');
    expect(iso(endOfNextMonth(d('2026-12-10')))).toBe('2027-01-31');
  });
  it('지급명세서 다음 해 3월 10일', () => {
    expect(iso(march10NextYear(d('2026-12-31')))).toBe('2027-03-10');
  });
  it('12월 말 퇴사는 지급일이 다음 해로 넘어가 세금 기한도 한 해 밀린다', () => {
    const x = computeExitDates(d('2026-12-28'));
    expect(iso(x.pay)).toBe('2027-01-11');
    expect(iso(x.tax10)).toBe('2027-02-10');
    expect(iso(x.receipt)).toBe('2027-02-28');
    expect(iso(x.statement)).toBe('2028-03-10');
  });
  it('지급일을 넣으면 그 날 기준', () => {
    const x = computeExitDates(d('2026-12-28'), d('2026-12-31'));
    expect(iso(x.tax10)).toBe('2027-01-10');
    expect(iso(x.statement)).toBe('2027-03-10');
  });
});

describe('해고 예고 30일 전', () => {
  it('마지막 근무일 − 30일', () => {
    expect(iso(computeExitDates(d('2026-11-30')).noticeBy)).toBe('2026-10-31');
    expect(iso(computeExitDates(d('2027-03-01')).noticeBy)).toBe('2027-01-30');
  });
});

describe('서류 보존 3년', () => {
  it('퇴직일부터 3년, 윤일은 2월 28일로', () => {
    expect(iso(computeExitDates(d('2026-10-31')).keepUntil)).toBe('2029-11-01');
    expect(iso(computeExitDates(d('2028-02-28')).keepUntil)).toBe('2031-02-28');
  });
});

describe('계속근로 개월 수', () => {
  it('1년: 입사일 전날까지 근무하면 만 1년', () => {
    expect(servedMonths(d('2025-10-21'), d('2026-10-20'), 12)).toBe(true);
    expect(servedMonths(d('2025-10-21'), d('2026-10-19'), 12)).toBe(false);
  });
  it('3개월: 월말 입사', () => {
    expect(servedMonths(d('2026-01-01'), d('2026-03-31'), 3)).toBe(true);
    expect(servedMonths(d('2026-01-01'), d('2026-03-30'), 3)).toBe(false);
    expect(servedMonths(d('2025-11-30'), d('2026-02-28'), 3)).toBe(true);
  });
  it('윤년 2월 29일 입사', () => {
    expect(servedMonths(d('2028-02-29'), d('2029-02-28'), 12)).toBe(true);
    expect(servedMonths(d('2028-02-29'), d('2029-02-27'), 12)).toBe(false);
  });
});

describe('데이터 정합', () => {
  it('항목 id 가 겹치지 않는다', () => {
    const ids = STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('해고 서면통지는 5인 이상, 해고 예고는 규모 무관 (시행령 [별표 1])', () => {
    expect(STEPS.find(s => s.id === 'written')?.min).toBe(5);
    expect(STEPS.find(s => s.id === 'notice')?.min).toBe(1);
  });
  it('모든 항목에 근거와 벌칙·효과 문구가 있다', () => {
    for (const s of STEPS) {
      expect(s.basis.length).toBeGreaterThan(0);
      expect(s.penalty.length).toBeGreaterThan(0);
    }
  });
});
