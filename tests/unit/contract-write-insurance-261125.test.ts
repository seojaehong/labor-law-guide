// 261124 검수 P2 #16 — 계약서 제7조(사회보험)가 근무시간과 상관없이 「4대보험 가입」으로 적었다.
// 고용보험법 시행령 제3조(2023. 6. 27. 개정, 로컬 법령 사본 public/data/laws/002249.json):
//   ① 1개월 소정근로시간 60시간 미만이거나 1주 소정근로시간 15시간 미만인 근로자는 적용 제외
//   ② 다만 3개월 이상 계속하여 근로를 제공하는 근로자·일용근로자는 적용
// 고용보험법 제10조(2026. 3. 17. 개정, 2027. 1. 1. 시행, 001761.json): 적용 제외 기준이 보수 「소득 기준」으로 바뀐다(금액은 대통령령 — 확인 필요).
// 국민연금·건강보험의 단시간 적용 제외는 이 갈래에서 원문을 확인하지 못해 가입 여부를 정하지 않고 「확인 필요」로 둔다.
// 값은 모두 합성.
import { describe, expect, it } from 'vitest';

import { designFromForm, reviewWritten, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument } from '@/lib/contract-write/document';
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
const PART: WriteForm = { ...MONTHLY, payType: 'hourly', hourlyWage: 15_000, monthlyTotal: undefined, start: '11:00', end: '17:00', breakMinutes: 30 };
// 토·일 5.5시간 = 1주 11시간
const UNDER15: WriteForm = { ...PART, workDays: ['토', '일'], weeklyRestDay: '월' };
// 월~수 5시간 = 1주 15시간(경계 — 15시간 미만이 아니다)
const AT15: WriteForm = { ...PART, workDays: ['월', '화', '수'], start: '10:00', end: '15:00', breakMinutes: 0 };

const clause7 = (form: WriteForm) => buildContractDocument(form, designFromForm(form)).clauses.find((c) => c.heading === '제7조(사회보험)')!.lines;
const notes = (form: WriteForm) => reviewWritten(form, designFromForm(form)).notes;
const ALL = '고용보험·산재보험·국민연금·건강보험에 가입한다.';

describe('제7조(사회보험) — 1주 15시간 미만은 일괄 가입으로 적지 않는다', () => {
  it('1주 40시간은 종전 문구 그대로', () => {
    expect(clause7(MONTHLY)).toEqual([ALL]);
    expect(notes(MONTHLY).some((n) => n.includes('사회보험'))).toBe(false);
  });
  it('1주 15시간(경계)은 종전 문구 그대로', () => {
    expect(clause7(AT15)).toEqual([ALL]);
  });
  it('1주 11시간은 산재보험만 가입으로, 고용보험은 3개월 이상 계속 근로할 때, 연금·건강보험은 법령 기준에 따른다', () => {
    const lines = clause7(UNDER15);
    expect(lines).not.toContain(ALL);
    expect(lines.join(' ')).toContain('산재보험에 가입한다');
    expect(lines.join(' ')).toMatch(/1주 소정근로시간이 15시간 미만.*3개월 이상 계속하여 근로를 제공하면 고용보험에 가입한다/);
    expect(lines.join(' ')).toMatch(/국민연금·건강보험은 관계 법령의 가입 기준에 따른다/);
  });
  it('1주 15시간 미만이면 점검 안내에 「확인 필요」를 남긴다', () => {
    const n = notes(UNDER15).filter((x) => x.includes('사회보험'));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatch(/확인이 필요합니다/);
    expect(n[0]).toMatch(/국민연금·건강보험/);
  });
  it('2027. 1. 1. 이후 시작하는 계약은 고용보험을 보수 소득 기준으로 적고 그 금액을 확인 필요로 둔다', () => {
    const f: WriteForm = { ...UNDER15, startDate: '2027-01-04', writtenDate: '2027-01-03' };
    const lines = clause7(f).join(' ');
    expect(lines).toMatch(/소득 기준/);
    expect(lines).not.toMatch(/15시간 미만이므로 3개월/);
    expect(notes(f).find((x) => x.includes('사회보험'))).toMatch(/소득 기준/);
  });
  it('본문과 안내에 금지어가 없다', () => {
    expect(bannedHits(clause7(UNDER15).join(' '))).toEqual([]);
    expect(bannedHits(notes(UNDER15).join(' '))).toEqual([]);
  });
});
