// US-306: 사진 추출 응답 → 폼 상태 역매핑. buildContract()와 대칭이 아닌 지점을 집중 검증한다.
import { describe, it, expect } from 'vitest';
import {
  applyExtracted,
  normalizeDate,
  normalizeTime,
  normalizePaymentMethod,
} from '@/app/tools/contract-check/extractMap';
import { buildContract, INITIAL } from '@/app/tools/contract-check/formState';

describe('정규화', () => {
  it('날짜는 YYYY-MM-DD로 맞추고 실패하면 빈 문자열', () => {
    expect(normalizeDate('2026-01-05')).toBe('2026-01-05');
    expect(normalizeDate('2026.1.5')).toBe('2026-01-05');
    expect(normalizeDate('2026년 1월 5일')).toBe('2026-01-05');
    expect(normalizeDate('내년 봄')).toBe('');
    expect(normalizeDate(null)).toBe('');
  });

  it('시각은 HH:MM으로 맞추고 오전·오후를 반영한다', () => {
    expect(normalizeTime('09:00')).toBe('09:00');
    expect(normalizeTime('9:00')).toBe('09:00');
    expect(normalizeTime('오후 6시 30분')).toBe('18:30');
    expect(normalizeTime('18시')).toBe('18:00');
    expect(normalizeTime('오전 12시')).toBe('00:00');
    expect(normalizeTime('아침')).toBe('');
  });

  it('지급방법은 폐쇄 선택지로 맞추고 못 맞추면 빈 문자열', () => {
    expect(normalizePaymentMethod('근로자 명의 통장 입금')).toBe('계좌이체');
    expect(normalizePaymentMethod('현금 지급')).toBe('현금');
    expect(normalizePaymentMethod('상호 협의')).toBe('');
  });
});

describe('applyExtracted', () => {
  it('전 필드 null이면 채워진 항목이 0건이다', () => {
    const r = applyExtracted({ contract: {}, notes: [] });
    expect(r.filled.size).toBe(0);
    expect(r.form).toEqual(INITIAL);
  });

  it('응답이 이상해도 던지지 않는다', () => {
    expect(applyExtracted(null).filled.size).toBe(0);
    expect(applyExtracted({ contract: 'nope' }).filled.size).toBe(0);
    expect(applyExtracted({ contract: {}, notes: ['흐릿함'] }).notes).toEqual(['흐릿함']);
  });

  it('임금 항목은 code로 각 칸에 배분하고 폼에 없는 코드는 안내로 남긴다', () => {
    const r = applyExtracted({
      contract: {
        wage: {
          monthly_total: 2500000,
          items: [
            { code: 'BASE', amount: 2000000, basis_text: '시급 × 209시간' },
            { code: 'OT_WEEKDAY', amount: 300000, basis_hours: 20 },
            { code: 'HOLIDAY_EXTRA', amount: 100000 },
            { code: 'ANNUAL_LEAVE', amount: 50000 },
            { code: 'MEAL', label: '식대', amount: 100000 },
          ],
        },
      },
    });
    expect(r.form.baseWage).toBe('2000000');
    expect(r.form.otAmount).toBe('300000');
    expect(r.form.otHours).toBe('20');
    expect(r.form.holidayExtra).toBe('100000');
    expect(r.form.annualLeavePay).toBe('50000');
    expect(r.form.monthlyTotal).toBe('2500000');
    expect(r.form.basisWritten).toBe(true);
    expect(r.warnings.join()).toContain('식대');
  });

  it('휴게시간은 구간 합계로 접는다', () => {
    const r = applyExtracted({
      contract: { work_time: { breaks: [{ minutes: 30 }, { minutes: 30 }] } },
    });
    expect(r.form.breakMinutes).toBe('60');
    expect(r.filled.has('breakMinutes')).toBe(true);
  });

  it('종료일만 있어도 기간제로 잡아 종료일을 살린다', () => {
    const r = applyExtracted({
      contract: { period: { indefinite: null, end_date: '2026-12-31' } },
    });
    expect(r.form.periodType).toBe('fixed');
    expect(r.form.endDate).toBe('2026-12-31');
  });

  it('수습 미적용이면 개월·비율을 절대 채우지 않는다', () => {
    const r = applyExtracted({
      contract: { period: { probation: { applied: false, months: 3, wage_rate_pct: 90 } } },
    });
    expect(r.form.probation).toBe('no');
    expect(r.form.probationMonths).toBe('');
    expect(r.form.probationRate).toBe('');
    // 수습 없음이 계약 객체에도 그대로 반영돼야 MINWAGE-PROBATION 오탐이 안 난다.
    expect(buildContract(r.form).period.probation).toEqual({ applied: false });
  });

  it('형식이 깨진 날짜·시각은 채워지지 않은 것으로 본다(하이라이트 대상)', () => {
    const r = applyExtracted({
      contract: {
        period: { start_date: '작년 3월쯤' },
        work_time: { start: '아침', end: '18:00' },
      },
    });
    expect(r.form.startDate).toBe('');
    expect(r.filled.has('startDate')).toBe(false);
    expect(r.filled.has('workStart')).toBe(false);
    expect(r.filled.has('workEnd')).toBe(true);
  });

  it('주휴일 조항만 보이면 요일 미특정으로 본다', () => {
    const specified = applyExtracted({
      contract: { holidays_leave: { weekly_rest: '일요일', weekly_rest_day_specified: true } },
    });
    expect(specified.form.weeklyRest).toBe('specified');

    const unspecified = applyExtracted({
      contract: { holidays_leave: { weekly_rest: '주 1회 유급휴일' } },
    });
    expect(unspecified.form.weeklyRest).toBe('unspecified');
  });

  it('문제조항 태그는 사전에 있는 값만 체크한다', () => {
    const r = applyExtracted({
      contract: {
        risk_clauses: [
          { clause_ref: '제5조', text: '즉시 해고할 수 있다', tags: ['즉시해고', '없는태그'] },
          { clause_ref: '제9조', text: '위약금 300만원', tags: ['위약예정'] },
        ],
      },
    });
    expect(r.form.clauses).toEqual({ 즉시해고: true, 위약예정: true });
    expect(buildContract(r.form).risk_clauses).toHaveLength(2);
  });

  it('요일별 근무·변형 근무가 있으면 해당 UI를 펼친다', () => {
    const r = applyExtracted({
      contract: {
        work_time: {
          variants: [{ per_week: 1, start: '9:00', end: '15:00' }],
          daily_schedules: [{ day: '월', start: '09:00', end: '14:00' }],
        },
      },
    });
    expect(r.form.hasVariants).toBe(true);
    expect(r.form.variants).toEqual([{ perWeek: '1', start: '09:00', end: '15:00' }]);
    expect(r.form.hasDaily).toBe(true);
    expect(r.form.daily).toEqual([{ day: '월', start: '09:00', end: '14:00' }]);
  });

  it('취업장소·담당업무는 둘 다 읽혔을 때만 체크한다(한쪽만이면 위반을 덮으면 안 됨)', () => {
    const partial = applyExtracted({ contract: { job: { duty: '배달' } } });
    expect(partial.form.jobWritten).toBe(false);
    expect(partial.filled.has('jobWritten')).toBe(false);

    const both = applyExtracted({ contract: { job: { location: '본사', duty: '배달' } } });
    expect(both.form.jobWritten).toBe(true);
  });

  it('지급방법 자유문구를 못 맞추면 비우고 안내한다', () => {
    const r = applyExtracted({ contract: { wage: { payment_method: '상호 협의' } } });
    expect(r.form.paymentMethod).toBe('');
    expect(r.filled.has('paymentMethod')).toBe(false);
    expect(r.warnings.join()).toContain('상호 협의');
  });
});
