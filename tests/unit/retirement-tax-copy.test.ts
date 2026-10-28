import { describe, expect, it } from 'vitest';
import { calcRetirementTax } from '@/lib/calc/retirement-tax';
import { CONSEQUENCES, headline } from '@/app/tools/retirement-tax/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

// 퇴직소득세 계산기의 문장. 합성 입력만 쓴다.
// 55세 전 퇴직이면 퇴직금은 개인형퇴직연금(IRP) 계정으로 옮겨 지급하는 것이 원칙이고(근로자퇴직급여 보장법 §9②·§17④),
// 연금계좌로 지급되면 지급할 때 원천징수하지 않는다(소득세법 §146②1). 그래서 「떼고 남는 금액」을 단정하지 않는다.

const T03 = calcRetirementTax({ pay: 20_000_000, hireDate: '2021-08-01', lastWorkDate: '2026-07-31' });
const ZERO = calcRetirementTax({ pay: 2_500_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' });

describe('퇴직소득세 — 답 문장', () => {
  it('굵은 줄은 예상 세액을 말하고, 떼고 남는 금액을 단정하지 않는다', () => {
    const lines = headline(T03);
    expect(lines[0]).toBe('예상 퇴직소득세는 280,000원, 지방소득세는 28,000원입니다.');
    expect(lines.join(' ')).not.toMatch(/손에 남는|19,692,000/);
  });

  it('굵은 줄에 연금계좌로 받으면 지급할 때 떼지 않는다는 단서가 붙는다(소득세법 제146조 제2항)', () => {
    expect(headline(T03).join(' ')).toMatch(/연금계좌.*떼지 않.*제146조 제2항/);
  });

  it('세액이 0원이면 이유를 말한다', () => {
    expect(headline(ZERO)).toEqual([
      '예상 퇴직소득세는 0원입니다.',
      '퇴직급여가 근속연수공제(3,000,000원)보다 적어 공제하고 남는 금액이 없습니다.',
    ]);
  });
});

describe('퇴직소득세 — 그래서 생기는 일', () => {
  it('첫 줄은 IRP 이전이 원칙이고 그때는 떼지 않는다는 것이다', () => {
    expect(CONSEQUENCES[0]).toMatch(/근로자퇴직급여 보장법 제9조 제2항/);
    expect(CONSEQUENCES[0]).toMatch(/소득세법 제146조 제2항 제1호/);
  });

  it('지급할 때 떼는 경우는 이전 예외(시행령 제3조의2 제1항)로 좁힌다', () => {
    const withheld = CONSEQUENCES.find((l) => l.includes('제146조 제1항'));
    expect(withheld).toMatch(/시행령 제3조의2 제1항/);
  });

  it('이미 뗀 세금은 60일 안에 연금계좌에 넣으면 환급을 신청한다(제146조 제2항 후단)', () => {
    expect(CONSEQUENCES.some((l) => /60일/.test(l) && /환급/.test(l))).toBe(true);
  });

  it('모든 문장에 금지어가 없다', () => {
    const all = [...headline(T03), ...headline(ZERO), ...CONSEQUENCES];
    expect(all.flatMap((l) => bannedHits(l))).toEqual([]);
  });
});
