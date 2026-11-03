// 근로계약서 작성 — 확정 문구(재홍님 261103 「초안대로」)와 남은 작은 수정.
// PR #140 검토 6(파트 유급휴일)·7(연차 선지급 정산), PR #144 검토(결근 주 공제 문구), 5명 미만 제3조, 잔액 항목 선택지.
// 확정 문구는 글자 그대로를 기대값으로 둔다. 값은 모두 합성.
import { describe, expect, it } from 'vitest';

import { absorbOptions, INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';
import { checkWritten, designFromForm, reviewWritten, toContract, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument, documentLines } from '@/lib/contract-write/document';
import { bannedHits } from '@/lib/tool-kit/banned';

const MONTHLY: WriteForm = {
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  employeeCount5plus: true,
  employeeName: '합성01',
  startDate: '2026-11-04',
  endDate: null,
  location: '합성테스트 본점',
  duty: '홀 서비스',
  workDays: ['월', '화', '수', '목', '금'],
  start: '09:00',
  end: '18:00',
  breakMinutes: 60,
  weeklyRestDay: '일',
  writtenDate: '2026-11-03',
  monthlyTotal: 3_000_000,
  holidayDaysPerYear: 0,
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

// PR #140 검토 6 재현 — 5명 이상, 주 5일 11:00~17:00, 휴게 30분, 시간당 15,000원, 공휴일 근무 예정 0일
const PART: WriteForm = { ...MONTHLY, payType: 'hourly', hourlyWage: 15_000, monthlyTotal: undefined, start: '11:00', end: '17:00', breakMinutes: 30 };
const PART_UNDER5: WriteForm = { ...PART, employeeCount5plus: false };
// 토·일 5.5시간 = 1주 11시간
const PART_UNDER15: WriteForm = { ...PART, workDays: ['토', '일'], weeklyRestDay: '월' };

const docOf = (form: WriteForm) => buildContractDocument(form, designFromForm(form));
const clause = (form: WriteForm, n: number) => docOf(form).clauses.find((c) => c.heading.startsWith(`제${n}조`))!.lines;
const text = (form: WriteForm) => documentLines(docOf(form)).join('\n');

const ACTUAL_DAYS = '월 임금은 그 달에 실제 근무한 날의 일 지급액을 합한 금액으로 한다.';
const PAID_DAY =
  '관공서의 공휴일·대체공휴일 등 유급휴일과 연차유급휴가 등 법정 유급휴가로 근무하지 않은 소정근로일에는 그날의 일 지급액 중 기본급과 주휴수당을 지급한다. 이런 날은 결근으로 보지 않는다.';

describe('검토 6 · 파트 유급휴일·법정 유급휴가로 쉰 날', () => {
  it('5명 이상·1주 15시간 이상 파트는 제5조 「실제 근무한 날」 바로 다음 줄에 확정 문구를 적는다', () => {
    const lines = clause(PART, 5);
    const i = lines.indexOf(ACTUAL_DAYS);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(lines[i + 1]).toBe(PAID_DAY);
  });

  it('문장이 말하는 항목 이름이 표의 항목 이름과 같다(기본급·주휴수당)', () => {
    const labels = docOf(PART).clauses.find((c) => c.table)!.table!.rows.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(['기본급', '주휴수당']));
  });

  it('표에 주휴수당이 없으면 「기본급」만 적는다', () => {
    const design = designFromForm(PART);
    const noWeekly = { ...design, items: design.items.filter((i) => i.key !== 'weeklyHoliday') };
    const lines = buildContractDocument(PART, noWeekly).clauses.find((c) => c.heading.startsWith('제5조'))!.lines;
    expect(lines).toContain(PAID_DAY.replace('기본급과 주휴수당을', '기본급을'));
  });

  it('5명 미만·1주 15시간 미만 파트와 월급제에는 넣지 않는다', () => {
    for (const form of [PART_UNDER5, PART_UNDER15, MONTHLY]) expect(text(form)).not.toContain('관공서의 공휴일·대체공휴일 등 유급휴일과');
  });
});

const LEAVE_HEAD = ['근로기준법 제60조에 따라 부여한다.', '표의 연차수당은 쓰지 않은 연차유급휴가에 대한 수당을 매월 나누어 미리 지급하는 것이며, 근로자의 연차유급휴가 사용을 제한하지 않는다.'];
const LEAVE_SETTLE = [
  '연차유급휴가를 사용한 날에도 제5조의 임금을 그대로 지급하며, 미리 지급한 연차수당을 이유로 돌려받거나 공제하지 않는다.',
  '연차유급휴가 사용기간이 끝난 때와 퇴직한 때에는 실제로 사용하지 않은 일수로 계산한 연차유급휴가 미사용수당과 미리 지급한 연차수당 합계를 비교하여, 모자라면 그 차액을 지급한다.',
];
const LEAVE_NOTE = '미리 지급하는 연차수당이 실제 발생분보다 적을 수 있으니 연차 사용기간이 끝날 때와 퇴직할 때 차액을 확인하세요';

describe('검토 7 · 연차 선지급 정산', () => {
  it('5명 이상·1주 15시간 이상이면 제6조 기존 두 문장 뒤에 확정 문구 두 문장(월급제·파트)', () => {
    expect(clause(MONTHLY, 6)).toEqual([...LEAVE_HEAD, ...LEAVE_SETTLE]);
    expect(clause(PART, 6)).toEqual([...LEAVE_HEAD, ...LEAVE_SETTLE]);
  });

  it('점검 입력의 연차 조항은 제6조와 같은 문장이다', () => {
    expect(toContract(MONTHLY, designFromForm(MONTHLY)).holidays_leave!.annual_leave_clause).toBe(clause(MONTHLY, 6).join(' '));
  });

  it('연차 인정시간을 0 으로 정해 표에 연차수당이 없으면 선지급·정산 문장을 넣지 않는다(기존 「표의 연차수당은」 문장 포함)', () => {
    const none: WriteForm = { ...MONTHLY, overrides: { leaveHours: 0 } };
    expect(docOf(none).clauses.find((c) => c.table)!.table!.rows.map((r) => r.label)).not.toContain('연차수당');
    expect(clause(none, 6)).toEqual(['근로기준법 제60조에 따라 부여한다.']);
    expect(toContract(none, designFromForm(none)).holidays_leave!.annual_leave_clause).toBe('근로기준법 제60조에 따라 부여한다.');
  });

  it('5명 미만·1주 15시간 미만은 미적용 문장 하나 그대로', () => {
    expect(clause({ ...MONTHLY, employeeCount5plus: false }, 6)).toEqual(['상시 5명 미만 사업장이므로 근로기준법 제60조(연차유급휴가)는 적용하지 않는다(근로기준법 시행령 제7조 별표 1).']);
    expect(clause(PART_UNDER15, 6)).toEqual(['1주 소정근로시간이 15시간 미만이므로 연차유급휴가는 적용하지 않는다(근로기준법 제18조 제3항).']);
  });

  it('화면 안내 한 줄 — 연차수당을 미리 지급할 때만', () => {
    const notes = (form: WriteForm) => reviewWritten(form, designFromForm(form)).notes;
    expect(notes(MONTHLY)).toEqual([LEAVE_NOTE]);
    expect(notes(PART)).toEqual([LEAVE_NOTE]);
    expect(notes({ ...MONTHLY, overrides: { leaveHours: 0 } })).toEqual([]);
    expect(notes({ ...MONTHLY, employeeCount5plus: false })).toEqual([]);
    expect(notes(PART_UNDER15)).toEqual([]);
  });

  it('ANNUAL-LEAVE 는 손볼 것에 올리지 않는다(계약서가 정산을 적었으므로 기존대로 「손볼 항목 없음」)', () => {
    expect(checkWritten(MONTHLY, designFromForm(MONTHLY))).toEqual([]);
    expect(checkWritten(PART, designFromForm(PART))).toEqual([]);
  });
});

const LEAD = '일 지급액의 주휴수당은 1주 소정근로일을 개근한 주의 주휴수당을 근무일마다 나누어 미리 지급하는 것이다.';
const DEDUCT =
  `${LEAD} 지각·조퇴와 유급휴일·법정 유급휴가로 근무하지 않은 날은 결근으로 보지 않는다. ` +
  '소정근로일에 결근하여 주휴일이 발생하지 않은 주에는 그 주 근무일에 미리 지급한 주휴수당 합계에 한하여, ' +
  '그 주의 마지막 날이 속한 달의 임금(그 달 임금을 지급한 뒤에 확정된 경우에는 다음 달 임금, 퇴직하는 경우에는 마지막 임금)에서 ' +
  '정산하고(근로기준법 제55조 제1항, 같은 법 시행령 제30조 제1항), 임금명세서에 해당 주와 금액을 적는다.';

describe('PR #144 검토 · 결근 주 주휴수당 정산 문구', () => {
  it('공제(기본)는 확정 문구 — 법조는 「정산하고」 뒤에 둔다', () => {
    expect(clause(PART, 5)).toContain(DEDUCT);
  });
  it('공제하지 않음은 그대로(첫 문장을 같이 쓴다)', () => {
    expect(clause({ ...PART, absentWeekHoliday: 'keep' }, 5)).toContain(`${LEAD} 소정근로일에 결근한 주에도 그 주 근무일에 지급한 주휴수당은 공제하지 않는다.`);
  });
});

describe('5명 미만 제3조 — 제53조를 적지 않는다(시행령 제7조 별표 1)', () => {
  // 월~토 09:00~17:00 휴게 60분 = 하루 7시간 × 6일 = 1주 42시간(1주 40시간 넘는 2시간)
  const WEEK: WriteForm = { ...MONTHLY, employeeCount5plus: false, workDays: ['월', '화', '수', '목', '금', '토'], end: '17:00' };
  // 주 5일 09:00~19:00 휴게 60분 = 하루 9시간(하루 8시간 넘는 1시간)
  const DAY: WriteForm = { ...MONTHLY, employeeCount5plus: false, end: '19:00' };

  it('1주 40시간을 넘는 시간은 「소정근로시간을 넘는 근로」로 적고 법조를 달지 않는다', () => {
    expect(clause(WEEK, 3)).toContain('하루 8시간 또는 1주 40시간을 넘는 시간(1주 2시간)은 소정근로시간을 넘는 근로이며, 근로자는 이에 동의한다.');
    expect(text(WEEK)).not.toContain('제53조');
  });
  it('하루 8시간을 넘는 시간도 같다', () => {
    expect(clause(DAY, 3)).toContain('하루 8시간을 넘는 1시간은 소정근로시간을 넘는 근로이며, 근로자는 이에 동의한다.');
    expect(text(DAY)).not.toContain('제53조');
  });
  it('5명 이상은 그대로 연장근로·제53조 제1항', () => {
    expect(clause({ ...WEEK, employeeCount5plus: true }, 3)).toContain('하루 8시간 또는 1주 40시간을 넘는 시간(1주 2시간)은 연장근로이며, 근로자는 이에 동의한다(근로기준법 제53조 제1항).');
    expect(clause({ ...DAY, employeeCount5plus: true }, 3)).toContain('하루 8시간을 넘는 1시간은 연장근로이며, 근로자는 이에 동의한다(근로기준법 제53조 제1항).');
  });
  // 별표 1 제4장에서 5명 미만에 적용하는 것은 제54조·제55조 제1항·제63조뿐 — 제50조도 없다. 소정근로를 40시간으로 자르는 계산은 그대로 둔다
  it('소정근로시간 줄에 「(근로기준법 제50조 제1항 한도)」를 달지 않는다', () => {
    expect(clause(WEEK, 3)).toContain('소정근로시간: 1주 40시간, 하루 7시간 이내');
    expect(text(WEEK)).not.toContain('제50조');
  });
  it('5명 이상은 그대로 제50조 제1항 한도', () => {
    expect(clause({ ...WEEK, employeeCount5plus: true }, 3)).toContain('소정근로시간: 1주 40시간(근로기준법 제50조 제1항 한도), 하루 7시간 이내');
  });
});

// 노동절(5월 1일) — 「노동절 제정에 관한 법률」(2025. 11. 11. 전부개정, 종전 근로자의 날)이 근로기준법에 따른 유급휴일로 정한다.
// 근로기준법 제55조가 아닌 별도 법률이라 5명 미만(시행령 제7조 별표 1)·1주 15시간 미만(제18조 제3항)에도 유급휴일이다(근로기준정책과-4361).
const LABOR_DAY = '노동절(5월 1일)은 노동절 제정에 관한 법률에 따른 유급휴일로 하고, 그날 근무하면 유급휴일 임금과 별도로 휴일근로수당을 지급한다.';
const LABOR_DAY_UNDER5 = '다만 노동절(5월 1일)은 노동절 제정에 관한 법률에 따른 유급휴일로 하고, 그날 근무하면 유급휴일 임금과 별도로 근무한 시간의 임금을 지급한다.';
const PUBLIC_HOLIDAY = '관공서의 공휴일과 대체공휴일은 근로기준법 제55조 제2항에 따른 유급휴일로 하고, 그날 근무하면 휴일근로수당을 지급한다.';
const UNDER5_REST = '상시 5명 미만 사업장이므로 근로기준법 제55조 제2항(공휴일 유급휴일)과 제56조(연장·야간·휴일 가산)는 적용하지 않는다(근로기준법 시행령 제7조 별표 1).';
const UNDER15_REST = '1주 소정근로시간이 15시간 미만이므로 주휴일과 연차유급휴가는 적용하지 않는다(근로기준법 제18조 제3항).';
const laborDayPaid = (paid: string) => `노동절(5월 1일)로 근무하지 않은 소정근로일에는 그날의 일 지급액 중 ${paid}을 지급한다. 이날은 결근으로 보지 않는다.`;
const PART_UNDER5_15: WriteForm = { ...PART_UNDER15, employeeCount5plus: false };

describe('노동절 — 제4조 네 분기 모두', () => {
  it('5명 이상·15시간 이상(월급제·파트) — 주휴일 다음, 관공서 공휴일 앞', () => {
    for (const form of [MONTHLY, PART]) expect(clause(form, 4)).toEqual(['주휴일: 매주 일요일(유급)', LABOR_DAY, PUBLIC_HOLIDAY]);
  });
  it('5명 이상·15시간 미만 — 공휴일 줄은 없어도 노동절은 유급휴일, 근무하면 가산(제18조 제3항은 제56조를 빼지 않는다)', () => {
    expect(clause(PART_UNDER15, 4)).toEqual([UNDER15_REST, LABOR_DAY]);
  });
  it('5명 미만(월급제·파트) — 미적용 문장 다음에 「다만」, 가산 없이 근무한 시간 임금', () => {
    for (const form of [{ ...MONTHLY, employeeCount5plus: false }, PART_UNDER5]) expect(clause(form, 4)).toEqual(['주휴일: 매주 일요일(유급)', UNDER5_REST, LABOR_DAY_UNDER5]);
  });
  it('5명 미만·15시간 미만', () => {
    expect(clause(PART_UNDER5_15, 4)).toEqual([UNDER15_REST, UNDER5_REST, LABOR_DAY_UNDER5]);
  });
});

describe('노동절 — 파트 제5조 「근무하지 않은 소정근로일」', () => {
  it('5명 이상·15시간 이상은 확정 문구(관공서의 공휴일·대체공휴일 등 유급휴일)가 이미 덮어 따로 넣지 않는다', () => {
    expect(clause(PART, 5)).toContain(PAID_DAY);
    expect(text(PART)).not.toContain('노동절(5월 1일)로 근무하지 않은');
  });
  it('5명 미만·15시간 이상 — 확정 문구 자리에 노동절 한 문장(기본급과 주휴수당)', () => {
    const lines = clause(PART_UNDER5, 5);
    expect(lines[lines.indexOf(ACTUAL_DAYS) + 1]).toBe(laborDayPaid('기본급과 주휴수당'));
  });
  it('15시간 미만은 주휴가 없어 기본급만(5명 이상·미만 모두)', () => {
    for (const form of [PART_UNDER15, PART_UNDER5_15]) {
      const lines = clause(form, 5);
      expect(lines[lines.indexOf(ACTUAL_DAYS) + 1]).toBe(laborDayPaid('기본급'));
    }
  });
  it('월급제에는 넣지 않는다(근로자의 날이 어느 요일이든 소정의 월급을 지급 — 근로기준과-2156)', () => {
    for (const form of [MONTHLY, { ...MONTHLY, employeeCount5plus: false }]) expect(text(form)).not.toContain('노동절(5월 1일)로 근무하지 않은');
  });
});

describe('확정 문구 · 금지어', () => {
  it('파트·월급제 본문과 화면 안내에 금지어·「포괄」이 없다', () => {
    for (const form of [PART, { ...PART, absentWeekHoliday: 'keep' as const }, MONTHLY, { ...MONTHLY, employeeCount5plus: false, end: '19:00' }, PART_UNDER5, PART_UNDER15, PART_UNDER5_15]) {
      expect(bannedHits(text(form))).toEqual([]);
      expect(text(form)).not.toContain('포괄');
    }
    expect(bannedHits(LEAVE_NOTE)).toEqual([]);
  });
});

// 잔액 항목 선택지 = 표에 금액이 실리는 행(시간 > 0). 0시간 행은 잔액을 받을 수 없다(splitTotal)
describe('잔액 항목 선택지가 표 행과 같다', () => {
  const S: WriteState = {
    ...INITIAL,
    workplaceName: '합성테스트 사업장',
    employeeName: '합성01',
    startDate: '2026-11-04',
    writtenDate: '2026-11-03',
    location: '합성테스트 본점',
    duty: '홀 서비스',
    monthlyTotal: '3,000,000',
    hourlyWage: '15,000',
  };
  const under15: Partial<WriteState> = { workDays: ['월', '화'], start: '09:00', end: '15:30', breakMinutes: '30', holidayDaysPerYear: '16' };
  const CASES: Array<[string, Partial<WriteState>]> = [
    ['월급제 5명 이상 공휴일 근무', { holidayDaysPerYear: '16' }],
    ['월급제 5명 이상 야간', { start: '14:00', end: '23:00' }],
    ['월급제 5명 미만', { fivePlus: 'no', holidayDaysPerYear: '16' }],
    ['월급제 1주 15시간 미만', { monthlyTotal: '1,000,000', ...under15 }],
    ['파트 5명 이상', { payType: 'hourly', start: '11:00', end: '17:00', breakMinutes: '30', holidayDaysPerYear: '16' }],
    ['파트 5명 미만', { payType: 'hourly', fivePlus: 'no', start: '11:00', end: '17:00', breakMinutes: '30', holidayDaysPerYear: '16' }],
    ['파트 1주 15시간 미만', { payType: 'hourly', ...under15 }],
    ['파트 하루 9시간 야간', { payType: 'hourly', start: '15:00', end: '01:00', breakMinutes: '60' }],
  ];

  it.each(CASES)('%s', (_, patch) => {
    const s = { ...S, ...patch };
    const form = toWriteForm(s, '2026-11-03').form!;
    const design = designFromForm(form);
    expect(absorbOptions(s)).toEqual(design.items.filter((i) => i.hours > 0).map((i) => ({ value: i.key, label: i.label })));
  });

  it('1주 15시간 미만 월급제는 「기본급」 하나뿐 — 「주휴 포함」·휴일·연차가 없다', () => {
    expect(absorbOptions({ ...S, monthlyTotal: '1,000,000', ...under15 })).toEqual([{ value: 'base', label: '기본급' }]);
  });

  it('선택지에 없는 항목을 골라 두었으면(5명 이상 → 5명 미만으로 바꿈 등) 기본급이 받는다', () => {
    const s = { ...S, fivePlus: 'no' as const, absorbInto: 'leave' as const };
    expect(absorbOptions(s).map((o) => o.value)).not.toContain('leave');
    expect(toWriteForm(s, '2026-11-03').form!.absorbInto).toBe('base');
    expect(toWriteForm({ ...S, holidayDaysPerYear: '16', absorbInto: 'leave' }, '2026-11-03').form!.absorbInto).toBe('leave');
  });
});
