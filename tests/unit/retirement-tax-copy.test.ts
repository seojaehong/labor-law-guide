import { describe, expect, it } from 'vitest';
import { calcRetirementTax } from '@/lib/calc/retirement-tax';
import { CONSEQUENCES, HIRE_LABEL, HIRE_NOTE, HOMETAX, NOT_COVERED, headline } from '@/app/tools/retirement-tax/copy';
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

  // 연금으로 받아도 세금이 없는 것이 아니다 — 연금외수령 원천징수세율의 70%·60%·50%로 연금소득세를 뗀다(소득세법 §129①5의3).
  // 「연금 외로 찾을 때 냅니다」만 쓰면 연금으로 받으면 세금이 없다는 뜻으로 읽힌다(PR #115 검토 지적).
  it('굵은 줄은 연금으로 받을 때도 줄어든 세율로 낸다고 말한다(소득세법 제129조 제1항 제5호의3)', () => {
    const line = headline(T03)[1];
    expect(line).toMatch(/연금으로 받으면/);
    expect(line).toMatch(/70~50%/);
    expect(line).toMatch(/제129조 제1항 제5호의3/);
    expect(line).not.toMatch(/연금 외로 찾을 때 냅니다/);
  });

  it('세액이 0원이면 이유를 말한다', () => {
    expect(headline(ZERO)).toEqual([
      '예상 퇴직소득세는 0원입니다.',
      '퇴직급여가 근속연수공제(3,000,000원)보다 적어 공제하고 남는 금액이 없습니다.',
    ]);
  });

  it('퇴직급여가 근속연수공제와 꼭 같으면(§48② 경계) 환산급여 0원을 이유로 댄다 — 800만원 이하 문장이 아니다', () => {
    const eq = calcRetirementTax({ pay: 3_000_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' });
    expect(eq.serviceDeductionCapped).toBe(false);
    expect(headline(eq)[1]).toBe('퇴직급여에서 근속연수공제(3,000,000원)를 빼면 환산급여가 0원입니다.');
    const over = calcRetirementTax({ pay: 4_500_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' });
    expect(headline(over)[1]).toBe('환산급여가 800만원 이하라 환산급여공제를 빼면 과세표준이 0원입니다.');
  });
});

describe('퇴직소득세 — 그래서 생기는 일', () => {
  it('첫 줄은 IRP 이전이 원칙이고 그때는 떼지 않는다는 것이다', () => {
    expect(CONSEQUENCES[0]).toMatch(/근로자퇴직급여 보장법 제9조 제2항/);
    expect(CONSEQUENCES[0]).toMatch(/소득세법 제146조 제2항 제1호/);
  });

  it('첫 줄은 나중에 연금으로 받으면 연금소득세를 수령연차에 따라 70%·60%·50%로 뗀다고 말한다', () => {
    expect(CONSEQUENCES[0]).toMatch(/연금소득세/);
    expect(CONSEQUENCES[0]).toMatch(/70%.*60%.*50%/);
    expect(CONSEQUENCES[0]).toMatch(/소득세법 제129조 제1항 제5호의3/);
  });

  it('지급할 때 떼는 경우는 이전 예외(시행령 제3조의2 제1항)로 좁힌다', () => {
    const withheld = CONSEQUENCES.find((l) => l.includes('제146조 제1항'));
    expect(withheld).toMatch(/시행령 제3조의2 제1항/);
  });

  it('이미 뗀 세금은 60일 안에 연금계좌에 넣으면 환급을 신청한다(제146조 제2항 후단)', () => {
    expect(CONSEQUENCES.some((l) => /60일/.test(l) && /환급/.test(l))).toBe(true);
  });

  it('모든 문장에 금지어가 없다', () => {
    const all = [...headline(T03), ...headline(ZERO), ...CONSEQUENCES, HIRE_LABEL, HIRE_NOTE, ...NOT_COVERED, HOMETAX.name, HOMETAX.note];
    expect(all.flatMap((l) => bannedHits(l))).toEqual([]);
  });
});

describe('퇴직소득세 — 입력 칸과 다루지 않는 것', () => {
  // 근속연수는 근로를 제공하기 시작한 날 또는 퇴직소득중간지급일의 다음 날부터 센다(소득세법 시행령 §105①).
  // 중간정산을 받은 사람이 처음 입사일을 넣으면 근속연수가 늘어 세액이 적게 나온다(30,000,000 · 2014-01-02 → 0원, 2021-01-01 → 510,000원).
  it('입사일 칸은 중간정산을 받았으면 그다음 날을 넣으라고 말한다(시행령 제105조 제1항)', () => {
    expect(HIRE_LABEL).toMatch(/^입사일/);
    expect(HIRE_LABEL).toMatch(/중간정산.*다음 날/);
    expect(HIRE_NOTE).toMatch(/소득세법 시행령 제105조 제1항/);
    const first = calcRetirementTax({ pay: 30_000_000, hireDate: '2014-01-02', lastWorkDate: '2026-07-15' });
    const after = calcRetirementTax({ pay: 30_000_000, hireDate: '2021-01-01', lastWorkDate: '2026-07-15' });
    expect([first.years, first.incomeTax]).toEqual([13, 0]);
    expect([after.years, after.incomeTax, after.localTax]).toEqual([6, 510_000, 51_000]);
  });

  // 국세청 프로그램 화면설명 A13: 중간정산은 「중간지급 등」에 통산(합산)해 계산한다.
  // A14: 주(현)근무지 중간정산 + 종(전)근무지 같은 과세기간 퇴직금이 함께 있을 때만 프로그램을 쓸 수 없고 확정신고 대상.
  it('중간정산 합산과 다른 회사 퇴직금 합산을 나누고, 확정신고는 둘이 겹칠 때만 말한다', () => {
    const mid = NOT_COVERED.filter((l) => l.includes('중간정산'));
    const other = NOT_COVERED.filter((l) => l.includes('다른 회사'));
    expect(mid.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(0);
    for (const l of NOT_COVERED.filter((x) => x.includes('확정신고'))) {
      expect(l).toMatch(/중간정산/);
      expect(l).toMatch(/다른 회사/);
      expect(l).toMatch(/함께 있으면/);
    }
    expect(NOT_COVERED.some((l) => /중간지급 등/.test(l))).toBe(true);
  });

  // 시행령 §105② 는 국민연금·공무원연금 등 일시금의 연수를 정한다 — 「더하는 기간」의 근거가 아니다.
  it('시행령 제105조 제2항은 공적연금 일시금 줄에서만 인용한다', () => {
    expect(NOT_COVERED.join(' ')).not.toMatch(/더하는 기간\(같은 조 제2항\)/);
    for (const l of NOT_COVERED.filter((x) => /제105조 제2항/.test(x))) expect(l).toMatch(/일시금/);
    expect(NOT_COVERED.some((l) => /가산월수/.test(l))).toBe(true);
  });

  // 2026-10-29 확인: 로그인 없이 열리는 「지급명세·자료·공익법인 > (모의계산) 퇴직소득 지급명세서 > 2026년」 화면(메뉴 4402050900).
  it('홈택스 링크는 퇴직소득 모의계산 화면으로 바로 간다', () => {
    const u = new URL(HOMETAX.href);
    expect(u.hostname).toBe('hometax.go.kr');
    expect(u.searchParams.get('tm3lIdx')).toBe('4402050900');
    expect(HOMETAX.name).toBe('(모의계산) 퇴직소득 지급명세서');
    expect(HOMETAX.note).not.toMatch(/찾아/);
  });
});
