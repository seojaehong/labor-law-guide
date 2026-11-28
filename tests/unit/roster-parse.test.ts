import { describe, it, expect } from 'vitest';
import { parseRoster, normBirthYM, normDate, normWon, EXAMPLE_ROSTER } from '@/lib/calc/roster-parse';

describe('값 정규화', () => {
  it('출생연월은 여러 모양을 받고 연월만 남긴다', () => {
    for (const s of ['1969-06', '1969.6', '1969/06', '196906', ' 1969-6 ']) expect(normBirthYM(s)).toBe('1969-06');
    expect(normBirthYM('1969-13')).toBeNull();
    expect(normBirthYM('1969-00')).toBeNull();
    expect(normBirthYM('69-06')).toBeNull();
  });

  it('입사일은 달력에 없는 날을 거부한다', () => {
    expect(normDate('2005.3.1')).toBe('2005-03-01');
    expect(normDate('20050301')).toBe('2005-03-01');
    expect(normDate('2005-02-30')).toBeNull();
    expect(normDate('2024-02-29')).toBe('2024-02-29');
    expect(normDate('2023-02-29')).toBeNull();
  });

  it('연봉은 쉼표와 「원」을 떼고, 「만」이 붙으면 만 원으로 읽는다', () => {
    expect(normWon('60,000,000')).toBe(60_000_000);
    expect(normWon('60000000원')).toBe(60_000_000);
    expect(normWon('6,000만')).toBe(60_000_000);
    expect(normWon('abc')).toBeNull();
    expect(normWon('-100')).toBeNull();
  });
});

describe('명단 파싱', () => {
  it('예시 명단은 머리글을 건너뛰고 10명을 읽는다', () => {
    const r = parseRoster(EXAMPLE_ROSTER);
    expect(r.rows).toHaveLength(10);
    expect(r.errors).toHaveLength(0);
    expect(r.rows[2]).toEqual({ id: 'A-003', birthYM: '1969-06', hireDate: '2005-03-01', annualPay: 64_000_000, group: '생산' });
  });

  it('탭으로 붙여넣어도 읽는다 — 엑셀 복사가 탭이다', () => {
    const r = parseRoster('A1\t1969-06\t2005-03-01\t60000000');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].group).toBeUndefined();
  });

  it('틀린 줄은 조용히 버리지 않고 줄 번호와 사유를 돌려준다', () => {
    const r = parseRoster(['A1,1969-06,2005-03-01,60000000', 'A2,1969-99,2005-03-01,60000000', 'A3,1969-06'].join('\n'));
    expect(r.rows.map((x) => x.id)).toEqual(['A1']);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatchObject({ line: 2 });
    expect(r.errors[0].reason).toMatch(/출생연월/);
    expect(r.errors[1]).toMatchObject({ line: 3 });
    expect(r.errors[1].reason).toMatch(/칸이 모자랍/);
  });

  it('사번이 겹치면 알린다 — 같은 사람을 두 번 세지 않는다', () => {
    const r = parseRoster(['A1,1969-06,2005-03-01,60000000', 'A1,1970-06,2006-03-01,60000000'].join('\n'));
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0].reason).toMatch(/겹칩니다/);
  });

  it('🔴 주민등록번호처럼 보이는 줄은 받지 않고 왜 안 받는지 알린다 (#311 §3)', () => {
    const r = parseRoster('A1,900101-1234567,2005-03-01,60000000');
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].reason).toMatch(/주민등록번호/);
    const r2 = parseRoster('A1,1969-06,2005-03-01,60000000,생산 9001011234567');
    expect(r2.rows).toHaveLength(0);
  });

  it('빈 줄은 오류가 아니다', () => {
    const r = parseRoster('\n\nA1,1969-06,2005-03-01,60000000\n\n');
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });
});
