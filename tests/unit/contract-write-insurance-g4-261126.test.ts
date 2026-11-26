// 261126 G4 검수(PR #298) — 계약서 제7조(사회보험) 고용보험.
//   I11(F3·A6) 1개월 미만 계약에도 「3개월 이상 계속 근로하면 고용보험 가입」이라고 적었다. 1개월 미만 동안 고용되는 사람은
//     일용근로자(고용보험법 제2조제6호)이고, 1주 15시간 미만이어도 적용 대상이다(시행령 제3조제2항제2호 · 2027. 1. 1.부터 법 제10조제2항제1호).
//   I12(F4·F5·O10·A6) 고용보험법 제10조(2026. 3. 17. 개정, 부칙 제1조 — 2027. 1. 1. 시행)는 적용 제외 기준을 1주 시간에서
//     보수 「소득 기준」(금액은 대통령령)으로 바꾼다.
//     (가) 2027. 1. 1. 이후 시작·1주 15시간 이상 계약에 「고용보험 … 가입한다」고 단정했다 → 조건으로 적고 「확인 필요」 안내.
//     (나) 2027 전에 시작·1주 15시간 미만·계약기간이 2027. 1. 1.을 넘는 계약에 그날부터 바뀌는 기준을 적지 않았다 → 한 줄 더한다.
//     2027 전 시작·1주 15시간 이상은 그대로다 — 이미 취득한 피보험자격은 처음 이직할 때까지 종전 규정으로 유지한다(부칙 제2조).
// 법령 원문 = public/data/laws/001761.json(고용보험법 20270101 단계·부칙)·002249.json(시행령 제3조). 값은 모두 합성.
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
// 월~수 5시간 = 1주 15시간
const AT15: WriteForm = { ...PART, workDays: ['월', '화', '수'], start: '10:00', end: '15:00', breakMinutes: 0 };

const clause7 = (form: WriteForm) => buildContractDocument(form, designFromForm(form)).clauses.find((c) => c.heading === '제7조(사회보험)')!.lines;
const notes = (form: WriteForm) => reviewWritten(form, designFromForm(form)).notes;
const insuranceNote = (form: WriteForm) => notes(form).find((n) => n.includes('보험 가입 여부'));
const ALL = '고용보험·산재보험·국민연금·건강보험에 가입한다.';
const THREE_MONTHS = '3개월 이상 계속하여 근로를 제공하면 고용보험에 가입한다';

describe('I11 — 1개월 미만 계약(일용근로자)은 1주 15시간 미만이어도 고용보험 적용 대상', () => {
  it('F3 재현: 2026-11-04~11-17(2주)·주 11시간 → 일용근로자라 고용보험에 가입한다(시행령 제3조 제2항 제2호)', () => {
    const f: WriteForm = { ...UNDER15, endDate: '2026-11-17' };
    const lines = clause7(f).join(' ');
    expect(lines).not.toContain(THREE_MONTHS);
    expect(lines).toMatch(/1개월 미만 동안 고용되는 일용근로자이므로 1주 소정근로시간과 상관없이 고용보험에 가입한다\(고용보험법 시행령 제3조 제2항 제2호\)/);
    expect(lines).toContain('산재보험에 가입한다.');
    expect(lines).toContain('국민연금·건강보험은 관계 법령의 가입 기준에 따른다.');
    expect(insuranceNote(f)).toMatch(/일용근로자/);
  });
  it('경계: 11-04~12-02 는 1개월 미만(일용), 11-04~12-03 은 1개월(종전 3개월 조건)', () => {
    expect(clause7({ ...UNDER15, endDate: '2026-12-02' }).join(' ')).toMatch(/일용근로자/);
    const month = clause7({ ...UNDER15, endDate: '2026-12-03' }).join(' ');
    expect(month).not.toMatch(/일용근로자/);
    expect(month).toContain(THREE_MONTHS);
  });
  it('경계(말일): 1-31 시작이면 2-27 까지 1개월 미만, 2-28 까지는 1개월', () => {
    expect(clause7({ ...UNDER15, startDate: '2026-01-31', writtenDate: '2026-01-30', endDate: '2026-02-27' }).join(' ')).toMatch(/일용근로자/);
    expect(clause7({ ...UNDER15, startDate: '2026-01-31', writtenDate: '2026-01-30', endDate: '2026-02-28' }).join(' ')).not.toMatch(/일용근로자/);
  });
  it('2027. 1. 1. 이후 시작 1개월 미만은 근거가 법 제10조 제2항 제1호', () => {
    const lines = clause7({ ...UNDER15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-01-20' }).join(' ');
    expect(lines).toMatch(/일용근로자이므로 고용보험에 가입한다\(고용보험법 제10조 제2항 제1호\)/);
  });
  it('1주 15시간 이상 1개월 미만도 고용보험에 가입한다(3개월 조건을 붙이지 않는다)', () => {
    // 국민연금·건강보험의 1개월 미만 근로자 제외 기준은 이 PR 에서 보지 않았다 — 고용보험 부분만 확인한다
    const lines = clause7({ ...AT15, endDate: '2026-11-17' }).join(' ');
    expect(lines).toMatch(/고용보험/);
    expect(lines).not.toContain(THREE_MONTHS);
    expect(lines).not.toMatch(/소득 기준/);
  });
});

describe('I12 — 2027. 1. 1. 고용보험 소득 기준', () => {
  it('(가) F4 재현: 2027-01-04~02-28·월화수 10~15시(주 15시간)·시급 15,000 → 고용보험을 단정하지 않고 확인 필요 안내', () => {
    const f: WriteForm = { ...AT15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-02-28' };
    const lines = clause7(f);
    expect(lines).not.toEqual([ALL]);
    expect(lines[0]).toBe('산재보험·국민연금·건강보험에 가입한다.');
    expect(lines.join(' ')).toMatch(/고용보험은 보수가 고용보험법 제10조 제1항 제2호의 소득 기준 이상이거나 3개월 이상 계속하여 근로를 제공하면 가입한다/);
    const n = insuranceNote(f)!;
    expect(n).toMatch(/확인이 필요합니다/);
    expect(n).toMatch(/소득 기준/);
    expect(n).toMatch(/부칙/);
  });
  it('(가) 2027 이후 시작 무기계약 40시간도 같은 조건 문구', () => {
    const f: WriteForm = { ...MONTHLY, startDate: '2027-03-02', writtenDate: '2027-03-01' };
    expect(clause7(f)).not.toEqual([ALL]);
    expect(insuranceNote(f)).toMatch(/소득 기준/);
  });
  it('(나) F5 재현: 2026-12-28 시작·주 11시간·기간 없음 → 2027. 1. 1.부터 소득 기준 줄을 더한다', () => {
    const f: WriteForm = { ...UNDER15, startDate: '2026-12-28', writtenDate: '2026-12-27' };
    const lines = clause7(f).join(' ');
    expect(lines).toContain(THREE_MONTHS);
    expect(lines).toMatch(/2027년 1월 1일부터는 3개월이 되지 않았더라도 보수가 고용보험법 제10조 제1항 제2호의 소득 기준 이상이면 가입한다/);
    expect(insuranceNote(f)).toMatch(/2027년 1월 1일/);
  });
  it('(나) 경계: 2026-12-31 에 끝나면 그 줄이 없고, 2027-01-01 까지면 있다', () => {
    expect(clause7({ ...UNDER15, endDate: '2026-12-31' }).join(' ')).not.toMatch(/2027년 1월 1일부터/);
    expect(clause7({ ...UNDER15, startDate: '2026-11-04', endDate: '2027-01-01' }).join(' ')).toMatch(/2027년 1월 1일부터/);
  });
  it('2027 전에 시작한 1주 15시간 이상은 기간이 2027 을 넘어도 종전 그대로(부칙 제2조 — 취득한 자격 유지)', () => {
    expect(clause7(MONTHLY)).toEqual([ALL]);
    expect(insuranceNote(MONTHLY)).toBeUndefined();
  });
  it('본문과 안내에 금지어가 없다', () => {
    const forms: WriteForm[] = [
      { ...UNDER15, endDate: '2026-11-17' },
      { ...UNDER15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-01-20' },
      { ...AT15, startDate: '2027-01-04', writtenDate: '2027-01-03', endDate: '2027-02-28' },
      { ...UNDER15, startDate: '2026-12-28', writtenDate: '2026-12-27' },
    ];
    for (const f of forms) {
      expect(bannedHits(clause7(f).join(' '))).toEqual([]);
      expect(bannedHits(notes(f).join(' '))).toEqual([]);
    }
  });
});
