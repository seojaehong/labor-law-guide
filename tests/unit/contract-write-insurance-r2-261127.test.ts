// 261127 G4 2차 검수(PR #298) — 계약서 제7조(사회보험). 판정표 G4_판정표_R2_261127.md #298 R10·R21. 값은 모두 합성.
//   R10(F1·O6·A6) 1개월 미만 계약이 1주 15시간 이상이면 일용 갈래보다 먼저 「고용보험·산재보험·국민연금·건강보험에 가입한다」로 단정했다.
//     국민건강보험법 제6조 제2항 제1호 「고용 기간이 1개월 미만인 일용근로자」는 직장가입자에서 빼고,
//     국민연금법 시행령 제2조 제1호 「일용근로자나 1개월 미만의 기한을 정하여 근로를 제공하는 사람」은 근로자에서 뺀다(단서 — 1개월 이상 계속 근로).
//     → 1개월 미만이면 시간과 상관없이 일용 갈래(연금·건보는 단정하지 않고 화면 「확인 필요」 안내).
//   R21(A7) 2027. 1. 1. 시행 고용보험법 제10조 제2항 제3호 — 소득 기준에 못 미치는 근로자가 둘 이상의 사업에 동시에 고용되어
//     같은 기간 보수를 합산한 금액이 소득 기준 이상이면 적용(보수 합산을 신청한 근로자로 한정). 조건부 문구에 한 줄 더한다.
// 법령 원문은 법제처 국가법령정보 Open API(DRF)로 2026-11-27 01:00 KST 에 확인 — 고용보험법(법률 제21473호, 부칙 제1조 단서: 제10조는
//   2027. 1. 1. 시행) · 국민건강보험법 제6조 · 국민연금법 시행령 제2조. 저장소 사본 public/data/laws/001761.json 과도 같다.
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
// 월~수 5시간 = 1주 15시간
const AT15: WriteForm = { ...PART, workDays: ['월', '화', '수'], start: '10:00', end: '15:00', breakMinutes: 0 };
// 토·일 5.5시간 = 1주 11시간
const UNDER15: WriteForm = { ...PART, workDays: ['토', '일'], weeklyRestDay: '월' };

const clause7 = (form: WriteForm) => buildContractDocument(form, designFromForm(form)).clauses.find((c) => c.heading === '제7조(사회보험)')!.lines;
const notes = (form: WriteForm) => reviewWritten(form, designFromForm(form)).notes;
const insuranceNote = (form: WriteForm) => notes(form).find((n) => n.includes('보험 가입 여부'));
const ALL = '고용보험·산재보험·국민연금·건강보험에 가입한다.';
const PENSION_HEALTH = '국민연금·건강보험은 관계 법령의 가입 기준에 따른다.';
const DAILY_2026 = '1개월 미만 동안 고용되는 일용근로자이므로 1주 소정근로시간과 상관없이 고용보험에 가입한다(고용보험법 시행령 제3조 제2항 제2호).';
const DAILY_2027 = '1개월 미만 동안 고용되는 일용근로자이므로 고용보험에 가입한다(고용보험법 제10조 제2항 제1호).';

describe('R10 — 1개월 미만이면 1주 시간과 상관없이 일용 갈래(국민연금·건강보험 단정 금지)', () => {
  it('F1·O6 재현: 2026-11-04~12-02·주 40시간 → 종전 [4대보험 가입] 이 아니라 15시간 미만과 같은 세 줄', () => {
    const f = { ...MONTHLY, endDate: '2026-12-02' };
    expect(clause7(f)).toEqual(['산재보험에 가입한다.', DAILY_2026, PENSION_HEALTH]);
    expect(clause7({ ...UNDER15, endDate: '2026-12-02' })).toEqual(clause7(f));
  });
  it('주 15시간(경계)·2주 계약도 같다', () => {
    expect(clause7({ ...AT15, endDate: '2026-11-17' })).toEqual(['산재보험에 가입한다.', DAILY_2026, PENSION_HEALTH]);
  });
  it('A6 재현: 2027-01-10~01-15·주 40시간 → 근거는 법 제10조 제2항 제1호, 연금·건보는 단정하지 않는다', () => {
    expect(clause7({ ...MONTHLY, startDate: '2027-01-10', writtenDate: '2027-01-09', endDate: '2027-01-15' })).toEqual(['산재보험에 가입한다.', DAILY_2027, PENSION_HEALTH]);
  });
  it('화면 「확인 필요」 안내가 주 15시간 이상에도 나오고, 1개월 미만 제외 근거를 적는다', () => {
    const n = insuranceNote({ ...MONTHLY, endDate: '2026-12-02' });
    expect(n).toMatch(/확인이 필요합니다 — 계약기간이 1개월 미만이라/);
    expect(n).toMatch(/일용근로자\(고용보험법 제2조 제6호\)라 적용합니다\(같은 법 시행령 제3조 제2항 제2호\)/);
    expect(n).toMatch(/국민건강보험법 제6조 제2항 제1호/);
    expect(n).toMatch(/국민연금법 시행령 제2조 제1호/);
  });
  it('1개월 이상(11-04~12-03)·주 40시간은 종전 그대로', () => {
    expect(clause7({ ...MONTHLY, endDate: '2026-12-03' })).toEqual([ALL]);
    expect(insuranceNote({ ...MONTHLY, endDate: '2026-12-03' })).toBeUndefined();
  });
});

describe('R21 — 2027 조건부 문구에 복수 사업장 보수 합산 신청자(고용보험법 제10조 제2항 제3호)', () => {
  const MULTI = '이 사업의 보수가 소득 기준에 못 미쳐도 둘 이상의 사업에 동시에 고용되어 같은 기간 보수를 합한 금액이 소득 기준 이상이고 보수 합산을 신청하면 고용보험에 가입한다(고용보험법 제10조 제2항 제3호).';
  it('2027 이후 시작(income) — 15시간 이상·미만 모두 한 줄 더한다', () => {
    const at15 = clause7({ ...AT15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-02-28' });
    expect(at15).toContain(MULTI);
    expect(at15.indexOf(MULTI)).toBe(at15.findIndex((l) => l.startsWith('고용보험은 보수가')) + 1);
    expect(clause7({ ...UNDER15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-03-31' })).toContain(MULTI);
  });
  it('2027 전 시작·15시간 미만·2027 을 넘김(hours-crossing) — 「2027년 1월 1일부터는」을 붙인 한 줄', () => {
    const lines = clause7({ ...UNDER15, startDate: '2026-12-28', writtenDate: '2026-12-27' });
    expect(lines).toContain('2027년 1월 1일부터는 ' + MULTI);
  });
  it('안내(확인 필요)에도 같은 조건', () => {
    for (const f of [
      { ...AT15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-02-28' },
      { ...UNDER15, startDate: '2026-12-28', writtenDate: '2026-12-27' },
    ]) expect(insuranceNote(f)).toMatch(/둘 이상의 사업에 동시에 고용되어 같은 기간 보수를 합한 금액이 소득 기준 이상이고 보수 합산을 신청한 근로자에게도 적용합니다\(같은 조 제2항 제3호\)/);
  });
  it('1개월 미만(일용)·2027 전 시작 15시간 이상·2027 전에 끝나는 15시간 미만에는 붙이지 않는다', () => {
    for (const f of [
      { ...MONTHLY, startDate: '2027-01-10', writtenDate: '2027-01-09', endDate: '2027-01-15' },
      MONTHLY,
      { ...UNDER15, endDate: '2026-12-31' },
    ]) expect(clause7(f).join(' ')).not.toMatch(/보수 합산/);
  });
});

describe('R10·R21 — 금지어', () => {
  it('본문과 안내에 금지어가 없다', () => {
    for (const f of [
      { ...MONTHLY, endDate: '2026-12-02' },
      { ...MONTHLY, startDate: '2027-01-10', writtenDate: '2027-01-09', endDate: '2027-01-15' },
      { ...AT15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-02-28' },
      { ...UNDER15, startDate: '2026-12-28', writtenDate: '2026-12-27' },
    ]) {
      expect(bannedHits(clause7(f).join(' '))).toEqual([]);
      expect(bannedHits(notes(f).join(' '))).toEqual([]);
    }
  });
});
