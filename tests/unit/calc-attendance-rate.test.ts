import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCOPE_ITEMS as LEAVE_PAY_SCOPE } from '@/app/tools/leave-pay/copy';
import {
  calcAttendanceRate,
  CAUSES,
  monthlyLeaveDay,
  reaches80,
  type AttendanceCause,
  type AttendanceRateInput,
  type AttendanceRateResult,
} from '@/lib/calc/attendance-rate';
import {
  allCopy,
  CAUSE_COPY,
  fmtDays,
  fmtPct,
  formulaLines,
  GROUP_COPY,
  headline,
  monthLines,
  OPEN_ITEMS,
  SCOPE_ITEMS,
} from '@/app/tools/attendance-rate/copy';
import { calculateEntitlement } from '@/lib/leave/annual-leave';
import { assertNoPrescriptionMath, ATTENDANCE_THRESHOLD } from '@/lib/leave/leave-advanced';
import { bannedHits } from '@/lib/tool-kit/banned';

// 연차 발생 출근율(근로기준법 §60①②⑥). 기대값은 리서치 단계에서 분수(Fraction)로 따로 계산한 값이고, 그 스크립트는
// 저장소에 없다. #124 검토에서 손으로 다시 셌다(375/31 · 51/5 · 15/2 · 69/5 · 57/5 · 39/46 · 43/50).
// S 연간 소정근로일수 · A 출근 · D 출근 간주 · X 소정근로일수에서 빼는 날 · B 결근. A = S − (D + X + B).
// 판정 3분기(2015다66052): ① (A+D)/S ≥ 80% → 전부 ② 미만이고 (A+D)/(S−X) ≥ 80% → 기본일수 × (S−X)/S ③ 그 밖 → §60② 월 개근.
// 입력은 전부 합성 값이다.

const Y2 = { hireDate: '2024-03-04', accrualDate: '2026-03-04' }; // 근속 2년 → 15일
const Y5 = { hireDate: '2021-03-04', accrualDate: '2026-03-04' }; // 근속 5년 → 15 + (5−1)/2 = 17일
type Days = Partial<Record<AttendanceCause, number>>;
const run = (S: number, days: Days = {}, dates = Y2): AttendanceRateResult =>
  calcAttendanceRate({ ...dates, scheduledDays: S, days });

describe('분기① 80% 이상 — 일수 전부, 경계는 「이상」', () => {
  it('C1 통상 — S250 결근5 → 245/250 = 98% → 15일', () => {
    const r = run(250, { absence: 5 });
    expect(r.status).toBe('full');
    expect(r.primary!.tally).toEqual({ scheduled: 250, attended: 245, deemed: 0, excluded: 0, absent: 5 });
    expect(r.primary!.days).toEqual({ num: 15, den: 1 });
  });

  it('C2a 경계 위 — S248 출근199 → 80.24% → 15일(248 × 0.8 = 198.4라 199일 이상, 임금근로시간과-636)', () => {
    const r = run(248, { absence: 49 });
    expect(r.primary!.tally.attended).toBe(199);
    expect(r.status).toBe('full');
  });

  it('C2b 경계 아래 — S248 출근198 → 79.84%, 빼는 날 없음 → §60② 월 개근', () => {
    const r = run(248, { absence: 50 });
    expect(r.status).toBe('monthly');
    expect(r.primary!.days).toBeNull();
    expect(r.primary!.realRate).toBeNull();
  });

  it('C12 정확히 80% — 200/250 은 「이상」이라 15일', () => {
    const r = run(250, { absence: 50 });
    expect(r.primary!.rate).toEqual({ num: 4, den: 5 });
    expect(r.status).toBe('full');
  });

  it('C13 무단결근만 — 199/250 = 79.6% → §60②', () => {
    expect(run(250, { absence: 51 }).status).toBe('monthly');
  });

  it('C3 빼는 날이 있어도 80% 이상이면 비례하지 않는다 — S248 쟁의48 출근199 결근1 → 15일(12.10일 아님, 임금근로시간과-906·636)', () => {
    const r = run(248, { 'lawful-strike': 48, absence: 1 });
    expect(r.primary!.tally.attended).toBe(199);
    expect(r.status).toBe('full');
    expect(r.primary!.days).toEqual({ num: 15, den: 1 });
  });
});

describe('분기② 80% 미만 · 빼는 날을 뺀 출근율 80% 이상 → 기본일수 × (S−X)/S', () => {
  it('C4 — S248 쟁의48 출근190 결근10 → 76.61% · 실질 95% → 15 × 200/248 = 375/31일', () => {
    const r = run(248, { 'lawful-strike': 48, absence: 10 });
    expect(r.status).toBe('prorated');
    expect(r.primary!.meets).toBe(false);
    expect(r.primary!.realMeets).toBe(true);
    expect(r.primary!.rate).toEqual({ num: 95, den: 124 }); // 190/248
    expect(r.primary!.realRate).toEqual({ num: 19, den: 20 }); // 190/200
    expect(r.primary!.days).toEqual({ num: 375, den: 31 });
  });

  it('C5 근속 가산 포함(근로개선정책과-3370) — 근속 5년 17일 · S250 노조전임100 출근140 결근10 → 17 × 150/250 = 10.2일', () => {
    const r = run(250, { 'union-fulltime': 100, absence: 10 }, Y5);
    expect(r.baseDays).toBe(17);
    expect(r.baseDays).toBe(calculateEntitlement({ hireDate: Y5.hireDate, asOf: Y5.accrualDate }).days);
    expect(r.status).toBe('prorated');
    expect(r.primary!.days).toEqual({ num: 51, den: 5 });
  });

  it('C8 대조 — 같은 125일을 빼는 날로 넣으면 120/250 = 48% · 실질 96% → 15 × 125/250 = 7.5일', () => {
    const r = run(250, { 'agreed-leave': 125, absence: 5 });
    expect(r.status).toBe('prorated');
    expect(r.primary!.days).toEqual({ num: 15, den: 2 });
  });
});

describe('분기③ 실질 출근율도 80% 미만 → §60② 월 개근', () => {
  it('C6 — S250 빼는 날100 출근110 결근40 → 44% · 실질 73.33%', () => {
    const r = run(250, { 'union-fulltime': 100, absence: 40 });
    expect(r.status).toBe('monthly');
    expect(r.primary!.realMeets).toBe(false);
    expect(r.primary!.days).toBeNull();
  });

  it('C9a 정당한 징계 정직은 결근(근로기준과-3296, 2008다41666) — 무단35 + 정직20 → 78% → §60②', () => {
    const r = run(250, { absence: 35, suspension: 20 });
    expect(r.primary!.tally.absent).toBe(55);
    expect(r.primary!.tally.attended).toBe(195);
    expect(r.status).toBe('monthly');
    expect(r.alt).toBeNull();
  });
});

describe('분기④ 1년 전부 — 빼는 날이면 미발생, 출근 간주면 100%', () => {
  it('C11 노조전임 1년 전부 → 생기지 않는다(2015다66052)', () => {
    const r = run(250, { 'union-fulltime': 250 });
    expect(r.status).toBe('none');
    expect(r.primary!.days).toBeNull();
  });

  it('C7 업무상 재해 1년 전부 → 100% → 15일(2014다232296, 임금근로시간과-30)', () => {
    const r = run(250, { 'work-injury': 250 });
    expect(r.primary!.rate).toEqual({ num: 1, den: 1 });
    expect(r.status).toBe('full');
  });

  it('C10a 부당해고 200일은 출근 간주(2011다95519) → 100% → 15일(폐기된 「제외」 방식의 3일이 아니다)', () => {
    const r = run(250, { 'unfair-dismissal': 200 });
    expect(r.primary!.tally).toEqual({ scheduled: 250, attended: 50, deemed: 200, excluded: 0, absent: 0 });
    expect(r.status).toBe('full');
    expect(r.primary!.days).toEqual({ num: 15, den: 1 });
  });
});

describe('출근 간주(§60⑥)', () => {
  it('C8 육아휴직 125일(2018. 5. 29. 이후 신청) → 245/250 = 98% → 15일', () => {
    const r = run(250, { 'parental-leave': 125, absence: 5 });
    expect(r.primary!.tally).toEqual({ scheduled: 250, attended: 120, deemed: 125, excluded: 0, absent: 5 });
    expect(r.status).toBe('full');
  });

  it('원인 표 — 기본 분류는 리서치 R3 그대로', () => {
    const by = (cls: string) => (Object.keys(CAUSES) as AttendanceCause[]).filter((c) => CAUSES[c].cls === cls).sort();
    expect(by('deemed')).toEqual(['company-deemed', 'leave-used', 'maternity', 'parental-leave', 'reserve-forces', 'statutory-leave', 'unfair-dismissal', 'unjust-lockout', 'work-injury']);
    expect(by('excluded')).toEqual(['agreed-leave', 'employer-shutdown', 'lawful-lockout', 'lawful-strike', 'unfair-suspension', 'union-fulltime']);
    expect(by('absent')).toEqual(['absence', 'suspension', 'unjust-strike']);
  });
});

describe('해석이 갈리는 기간은 두 값을 나란히(261029 결정) — 하나를 고르지 않는다', () => {
  it('C18 부당하다고 확정된 정직 20일 — 고용노동부(제외·비례) 13.8일 / 2011다95519 유추(출근 간주) 15일', () => {
    const r = run(250, { 'unfair-suspension': 20, absence: 35 });
    expect(r.disputed).toEqual(['unfair-suspension']);
    expect(r.status).toBe('prorated');
    expect(r.primary!.realRate).toEqual({ num: 39, den: 46 }); // 195/230 = 84.78%
    expect(r.primary!.days).toEqual({ num: 69, den: 5 });
    expect(r.alt!.status).toBe('full');
    expect(r.alt!.rate).toEqual({ num: 43, den: 50 }); // 215/250 = 86%
    expect(r.alt!.days).toEqual({ num: 15, den: 1 });
  });

  it('회사 사정 휴업 60일 — 빼는 날(근로개선정책과-3190) 15 × 190/250 = 11.4일 / 출근으로 보면 240/250 → 15일', () => {
    const r = run(250, { 'employer-shutdown': 60, absence: 10 });
    expect(r.primary!.days).toEqual({ num: 57, den: 5 });
    expect(r.alt!.days).toEqual({ num: 15, den: 1 });
  });

  it('갈리는 원인에 일수가 없으면 두 번째 값을 내지 않는다', () => {
    const r = run(250, { 'unfair-suspension': 0, absence: 5 });
    expect(r.disputed).toEqual([]);
    expect(r.alt).toBeNull();
  });
});

describe('1년 미만 — 출근율과 관계없이 §60② 월 개근(기존 applyAttendanceRatio 와 같은 동작)', () => {
  it('입사 8개월', () => {
    const r = calcAttendanceRate({ hireDate: '2026-01-05', accrualDate: '2026-09-05', scheduledDays: 160, days: { absence: 100 } });
    expect(r.status).toBe('under1y');
    expect(r.primary).toBeNull();
    expect(r.baseDays).toBeNull();
  });

  it('1년이 되는 날 경계 — 전날은 1년 미만, 당일은 출근율로', () => {
    const d = { scheduledDays: 250, days: { absence: 5 } };
    expect(calcAttendanceRate({ ...d, hireDate: '2025-03-04', accrualDate: '2026-03-03' }).status).toBe('under1y');
    expect(calcAttendanceRate({ ...d, hireDate: '2025-03-04', accrualDate: '2026-03-04' }).status).toBe('full');
  });
});

describe('§60② 한 달 개근 — M1~M5', () => {
  it('M1 월20 · 정당한 쟁의10 · 나머지 개근 → 1일(0.5일 아님, 근로기준정책과-8676)', () => {
    expect(monthlyLeaveDay({ scheduled: 20, excluded: 10, absent: 0 })).toEqual({ day: 1, reason: 'perfect' });
  });
  it('M2 월20 · 쟁의10 · 결근1 → 0일', () => {
    expect(monthlyLeaveDay({ scheduled: 20, excluded: 10, absent: 1 })).toEqual({ day: 0, reason: 'absent' });
  });
  it('M3 월20 전부 정당한 쟁의 → 0일(근로기준과-2373)', () => {
    expect(monthlyLeaveDay({ scheduled: 20, excluded: 20, absent: 0 })).toEqual({ day: 0, reason: 'all-excluded' });
  });
  // M4·M5 — 출근 간주는 입력 칸이 따로 없다. 빼는 날·결근한 날에 넣지 않으면 출근으로 센다는 입력 약속을 본다
  //   (그 달 전부가 출근 간주여도 개근 — 임금근로시간과-30). 출근 간주 분류 자체는 위 calcAttendanceRate 시험이 본다.
  it('M4 월20 전부 업무상 재해 휴업 — 출근 간주는 어느 칸에도 넣지 않으므로 입력은 빼는 날0·결근0 → 1일', () => {
    expect(monthlyLeaveDay({ scheduled: 20, excluded: 0, absent: 0 }).day).toBe(1);
  });
  it('M5 월22 · 출근18 연차2 생리1 예비군1 — 같은 입력 약속(빼는 날0·결근0) → 1일', () => {
    expect(monthlyLeaveDay({ scheduled: 22, excluded: 0, absent: 0 }).day).toBe(1);
  });
  it('출근 간주 날을 결근 칸에 잘못 넣으면 개근이 아니다 — 칸을 고르는 것이 규칙의 전부다', () => {
    expect(monthlyLeaveDay({ scheduled: 20, excluded: 0, absent: 1 }).day).toBe(0);
  });
  it('입력 확인', () => {
    expect(() => monthlyLeaveDay({ scheduled: 0, excluded: 0, absent: 0 })).toThrow();
    expect(() => monthlyLeaveDay({ scheduled: 32, excluded: 0, absent: 0 })).toThrow();
    expect(() => monthlyLeaveDay({ scheduled: 20, excluded: 15, absent: 6 })).toThrow();
    expect(() => monthlyLeaveDay({ scheduled: 20, excluded: -1, absent: 0 })).toThrow();
  });
});

describe('입력 확인', () => {
  const ok: AttendanceRateInput = { ...Y2, scheduledDays: 250, days: {} };
  it('소정근로일수는 1~366 정수', () => {
    for (const s of [0, 367, 1.5, NaN]) expect(() => calcAttendanceRate({ ...ok, scheduledDays: s })).toThrow();
  });
  it('원인별 일수는 0 이상 정수, 합이 소정근로일수를 넘지 않는다', () => {
    expect(() => calcAttendanceRate({ ...ok, days: { absence: -1 } })).toThrow();
    expect(() => calcAttendanceRate({ ...ok, days: { absence: 2.5 } })).toThrow();
    expect(() => calcAttendanceRate({ ...ok, days: { absence: 200, 'lawful-strike': 51 } })).toThrow(/251일/);
    expect(calcAttendanceRate({ ...ok, days: { absence: 200, 'lawful-strike': 50 } }).primary!.tally.attended).toBe(0);
  });
  it('날짜', () => {
    expect(() => calcAttendanceRate({ ...ok, hireDate: '2026-02-30' })).toThrow();
    expect(() => calcAttendanceRate({ ...ok, accrualDate: '2024-03-03' })).toThrow();
  });
  it('2012. 8. 2. 전에 생긴 연차는 다루지 않는다 — 이 도구의 날짜 축 시작(법률 제11270호 시행일)', () => {
    expect(() => calcAttendanceRate({ ...ok, hireDate: '2010-03-04', accrualDate: '2012-03-04' })).toThrow(/2012/);
    // 1년 미만도 그 전은 다루지 않는다 — 1년 미만 §60②의 시행은 사업장 규모별로 나뉘어 이 도구가 가리지 못한다
    expect(() => calcAttendanceRate({ ...ok, hireDate: '2011-09-01', accrualDate: '2012-03-01' })).toThrow(/2012/);
  });
  it('출근율을 따진 1년이 2012. 8. 2. 전에 시작했으면(연차가 생기는 날 2013. 8. 2. 전) 1년 이상은 다루지 않는다 — 부칙 제4조', () => {
    // 법률 제11270호 부칙 제4조: 「이 법 시행 후의 근로기간이 최초로 1년이 되는 근로자로서 그 1년간 출근 기간이 80퍼센트 미만」부터
    const bad = { scheduledDays: 250, days: { absence: 60 } };
    expect(() => calcAttendanceRate({ ...bad, hireDate: '2011-03-04', accrualDate: '2013-03-04' })).toThrow(/부칙 제4조/);
    expect(() => calcAttendanceRate({ scheduledDays: 250, days: { absence: 100 }, hireDate: '2010-08-02', accrualDate: '2012-08-02' })).toThrow(/부칙 제4조/);
    expect(() => calcAttendanceRate({ ...bad, hireDate: '2011-08-01', accrualDate: '2013-08-01' })).toThrow(/부칙 제4조/);
    // 80% 이상이어도 같은 창은 다루지 않는다(결과가 상태에 따라 갈리지 않게)
    expect(() => calcAttendanceRate({ ...ok, hireDate: '2010-08-02', accrualDate: '2012-08-02' })).toThrow(/부칙 제4조/);
    // 그 1년이 시행일에 시작하면 다룬다
    expect(calcAttendanceRate({ scheduledDays: 250, days: { absence: 100 }, hireDate: '2011-08-02', accrualDate: '2013-08-02' }).status).toBe('monthly');
    // 같은 창이어도 1년 미만은 §60② 1년 미만 규정(개정 전부터 있음)으로 본다
    expect(calcAttendanceRate({ ...ok, hireDate: '2012-03-01', accrualDate: '2012-09-01' }).status).toBe('under1y');
  });
  it('입사 1년이 되는 날이 2018. 5. 29. 이전이면 다루지 않는다 — 구 근로기준법 제60조제3항(법률 제15108호로 삭제)', () => {
    // 구 §60③: 최초 1년의 휴가는 1년 미만 때 생긴 휴가를 포함해 15일, 이미 쓴 일수는 15일에서 뺀다
    expect(() => calcAttendanceRate({ ...ok, hireDate: '2016-03-02', accrualDate: '2017-03-02', days: { absence: 5 } })).toThrow(/제60조제3항/);
    expect(() => calcAttendanceRate({ ...ok, hireDate: '2017-05-29', accrualDate: '2018-05-29' })).toThrow(/제60조제3항/);
    expect(calcAttendanceRate({ ...ok, hireDate: '2017-05-30', accrualDate: '2018-05-30' }).status).toBe('full');
    // 제3항은 최초 1년만 — 2년째 기념일은 그대로 다룬다
    expect(calcAttendanceRate({ ...ok, hireDate: '2015-03-02', accrualDate: '2017-03-02' }).status).toBe('full');
  });
  it('입력 오류는 연차가 생기는 날과 관계없이 같은 문장으로 — 1년 미만이어도 칸 값을 먼저 본다', () => {
    const junk = { hireDate: '2026-01-05', scheduledDays: 0, days: { absence: -3 } };
    const msg = /1년 소정근로일수를 1~366 사이 정수로/;
    expect(() => calcAttendanceRate({ ...junk, accrualDate: '2026-09-05' })).toThrow(msg);
    expect(() => calcAttendanceRate({ ...junk, accrualDate: '2027-01-05' })).toThrow(msg);
    expect(() => calcAttendanceRate({ hireDate: '2026-01-05', accrualDate: '2026-09-05', scheduledDays: 160, days: { absence: -3 } })).toThrow(/0 이상의 정수/);
  });
});

describe('기존 엔진과 같은 기준', () => {
  it('80% 기준은 leave-advanced 의 ATTENDANCE_THRESHOLD 와 같다 — 소정근로일수 1~366 전부', () => {
    expect(ATTENDANCE_THRESHOLD).toBe(4 / 5);
    for (let s = 1; s <= 366; s++) for (let n = 0; n <= s; n++) {
      if (reaches80(n, s) !== n / s >= ATTENDANCE_THRESHOLD) throw new Error(`${n}/${s}`);
    }
  });
});

describe('화면 문장', () => {
  const cases: AttendanceRateResult[] = [
    run(250, { absence: 5 }),
    run(248, { absence: 49 }),
    run(248, { absence: 50 }),
    run(248, { 'lawful-strike': 48, absence: 1 }),
    run(248, { 'lawful-strike': 48, absence: 10 }),
    run(250, { 'union-fulltime': 100, absence: 10 }, Y5),
    run(250, { 'union-fulltime': 100, absence: 40 }),
    run(250, { 'union-fulltime': 250 }),
    run(250, { 'work-injury': 250 }),
    run(250, { 'unfair-suspension': 20, absence: 35 }),
    run(250, { 'employer-shutdown': 60, absence: 10 }),
    run(250, { 'employer-shutdown': 10, absence: 1 }),
    calcAttendanceRate({ hireDate: '2026-01-05', accrualDate: '2026-09-05', scheduledDays: 160 }),
  ];
  const months = [
    monthlyLeaveDay({ scheduled: 20, excluded: 10, absent: 0 }),
    monthlyLeaveDay({ scheduled: 20, excluded: 10, absent: 1 }),
    monthlyLeaveDay({ scheduled: 20, excluded: 20, absent: 0 }),
  ];

  it('모든 결과 문장·안내문에 금지어가 없다', () => {
    for (const r of cases) {
      const lines = allCopy(r);
      expect(lines.length).toBeGreaterThan(5);
      for (const line of lines) expect(bannedHits(line), line).toEqual([]);
    }
    for (const m of months) for (const line of monthLines(m)) expect(bannedHits(line), line).toEqual([]);
  });

  it('시효를 말하지 않고, 가능성 숫자를 내지 않는다', () => {
    for (const r of cases) {
      expect(() => assertNoPrescriptionMath(allCopy(r))).not.toThrow();
      const t = allCopy(r).join(' ');
      expect(t).not.toContain('시효');
      expect(t).not.toMatch(/가능성|확률/);
    }
  });

  it('원인마다 이름·근거가 있고, 이름끼리 겹치지 않는다(화면에서 이름으로 칸을 찾는다)', () => {
    const ids = Object.keys(CAUSES) as AttendanceCause[];
    expect(Object.keys(CAUSE_COPY).sort()).toEqual([...ids].sort());
    const labels = ids.map((c) => CAUSE_COPY[c].label);
    for (const a of labels) for (const b of labels) if (a !== b) expect(b.includes(a), `${a} ⊂ ${b}`).toBe(false);
    for (const c of ids) expect(CAUSE_COPY[c].basis.length).toBeGreaterThan(5);
  });

  it('출근율 표시는 둘째 자리 아래 버림 — 경계 아래가 80.00%로 보이지 않는다', () => {
    expect(fmtPct({ num: 198, den: 248 })).toBe('79.83');
    expect(fmtPct({ num: 199, den: 248 })).toBe('80.24');
    expect(fmtPct({ num: 4, den: 5 })).toBe('80.00');
    expect(fmtPct({ num: 1, den: 1 })).toBe('100.00');
    expect(fmtPct({ num: 1463, den: 1829 })).toBe('79.98');
  });

  it('비례 일수는 끝수 처리 없이 — 나누어떨어지면 그대로, 아니면 넷째 자리까지 「…」', () => {
    expect(fmtDays({ num: 375, den: 31 })).toBe('12.0967…');
    expect(fmtDays({ num: 51, den: 5 })).toBe('10.2');
    expect(fmtDays({ num: 15, den: 2 })).toBe('7.5');
    expect(fmtDays({ num: 15, den: 1 })).toBe('15');
  });

  it('답 첫 줄 — 출근율과 80% 이상/미만, 그다음 생기는 일수', () => {
    expect(headline(cases[0]).join(' ')).toMatch(/98\.00%.*80% 이상.*15일/);
    expect(headline(cases[2]).join(' ')).toMatch(/79\.83%.*80%에 못 미칩니다.*1개월 개근.*1일/);
    expect(headline(cases[3]).join(' ')).toMatch(/80\.24%.*15일.*줄이지 않습니다/);
    expect(headline(cases[4]).join(' ')).toMatch(/76\.61%.*95\.00%.*12\.0967…일/);
    expect(headline(cases[5]).join(' ')).toContain('10.2일');
    expect(headline(cases[7]).join(' ')).toContain('생기지 않습니다');
    expect(headline(cases[12]).join(' ')).toMatch(/1년이 되지 않았습니다.*1개월 개근/);
  });

  it('갈리는 기간 — 두 값과 무엇으로 갈리는지를 같이 말한다', () => {
    const t = headline(cases[9]).join(' ');
    expect(t).toMatch(/13\.8일/);
    expect(t).toMatch(/15일/);
    expect(t).toMatch(/근로기준과-3296/);
    expect(t).toMatch(/2011다95519/);
    // 결과가 같으면 한 값만, 같다고 밝힌다
    expect(headline(cases[11]).join(' ')).toMatch(/같습니다/);
  });

  it('산식 — 80% 경계 일수와 비례 산식을 보인다', () => {
    expect(formulaLines(cases[1]).join(' ')).toMatch(/198\.4일.*199일/);
    expect(formulaLines(cases[4]).join(' ')).toMatch(/15일 × \(248 − 48\) ÷ 248 = 375\/31/);
    expect(formulaLines(cases[5]).join(' ')).toMatch(/가산 2일/);
  });

  it('확인할 점과 다루지 않는 것', () => {
    const o = OPEN_ITEMS.join(' ');
    for (const w of ['3296', '3190', '1736', '끝수', '배우자 출산휴가']) expect(o).toContain(w);
    const s = SCOPE_ITEMS.join(' ');
    for (const w of ['2018. 5. 29.', '근로시간 단축', '소정근로일수', '연차수당 계산기']) expect(s).toContain(w);
  });

  it('정당한 징계 정직 — 2008다41666은 취업규칙으로 그렇게 정할 수 있다는 판결이고, 결근 처리는 근로기준과-3296의 해석 변경이다', () => {
    const b = CAUSE_COPY.suspension.basis;
    expect(b).toMatch(/근로기준과-3296/);
    expect(b).toMatch(/취업규칙.*2008다41666/);
    const o = OPEN_ITEMS.join(' ');
    // 종전 해석(소정근로일수에서 뺌)과 노조전임 법리(2015다66052)까지 계보를 밝힌다
    for (const w of ['근기68207-2672', '근로기준팀-4', '2008다41666', '2015다66052', '2012가합3275']) expect(o).toContain(w);
  });

  it('배우자 출산휴가 등 — 여성고용정책과-510은 주휴 개근 해석이라고 밝힌다', () => {
    expect(CAUSE_COPY['statutory-leave'].basis).toMatch(/주휴/);
  });

  it('정당성이 없는 직장폐쇄 — 쟁의행위로 옮기는 예외는 신중하게 보고 회사가 증명한다(2015다66052)', () => {
    expect(CAUSE_COPY['unjust-lockout'].basis).toMatch(/명백/);
    expect(CAUSE_COPY['unjust-lockout'].basis).toMatch(/증명/);
  });

  it('2018. 5. 29. 전 신청 육아휴직은 어느 칸에 넣는지 알려 준다 — 비워 두면 출근으로 세진다', () => {
    const line = SCOPE_ITEMS.find((l) => l.startsWith('2018. 5. 29. 전에 신청한 육아휴직'))!;
    expect(line).toContain(CAUSE_COPY['agreed-leave'].label.split('(')[0]);
    // 그 칸으로 넣으면 2011다4629 대로 빼는 날이 된다 — C8 대조와 같은 7.5일
    expect(run(250, { 'agreed-leave': 125, absence: 5 }).primary!.days).toEqual({ num: 15, den: 2 });
  });

  it('비례로 나온 경우 제60조제2항을 함께 줄지는 정해지지 않았다고 밝힌다(임금근로시간과-906 「별론」)', () => {
    const o = OPEN_ITEMS.join(' ');
    expect(o).toMatch(/별론/);
    expect(o).toMatch(/임금근로시간과-906/);
  });

  it('출근 간주 조항 번호는 2027. 6. 10.부터 제7항(법률 제21784호)', () => {
    expect(GROUP_COPY.deemed.note).toMatch(/2027\. 6\. 10\.부터 제7항/);
  });
});

describe('다른 연차 화면이 출근율을 이 도구로 보낸다(⑥ 갈림)', () => {
  // /tools/leave/advanced 에는 출근율 입력이 없다 — 사용촉진·반차 두 절뿐
  it('연차 일수·퇴직 정산 화면의 링크', () => {
    for (const f of ['src/app/tools/leave/page.tsx', 'src/app/tools/leave/settlement/page.tsx']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).toContain('href="/tools/attendance-rate"');
      expect(src, f).not.toMatch(/href="\/tools\/leave\/advanced">[^<]*출근율/);
    }
  });
  it('연차수당 계산기의 「다루지 않는 것」', () => {
    expect(LEAVE_PAY_SCOPE.join(' ')).toContain('출근율 계산기');
    expect(LEAVE_PAY_SCOPE.join(' ')).not.toContain('사용촉진 화면의 출근율');
  });
});
