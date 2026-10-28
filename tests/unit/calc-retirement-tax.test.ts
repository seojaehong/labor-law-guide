import { describe, expect, it } from 'vitest';
import { calcRetirementTax, serviceMonths, serviceYears, RETIREMENT_TAX_FROM } from '@/lib/calc/retirement-tax';

// 퇴직소득세 — 소득세법 §48(퇴직소득공제)·§55(세율, §55② 연분연승), 지방세법 §103의13①(소득세의 10%).
// 기대값은 두 갈래로 따로 냈고 1원 단위까지 같다(합성 입력 18건 + 날짜 14건 = 32건).
//   ① 국세청 「(하반기)2026년 귀속 퇴직소득 세액계산 프로그램_D251229」 사본에 값을 넣고 엑셀로 다시 계산한 값
//   ② 조문 식을 분수(Fraction) 정수 연산으로 푼 독립 손계산
// 공통 조건: 퇴사일 = 마지막 근무일, 지급일 = 퇴사일, 비과세·기납부·세액공제 0, 임원 아님.

type Row = {
  id: string;
  what: string;
  hire: string;
  last: string;
  pay: number;
  months: number;
  years: number;
  svc: number;
  conv: number;
  convDed: number;
  base: number;
  convTax: number;
  calcTax: number;
  income: number;
  local: number;
};

const ROWS: Row[] = [
  { id: 'T01', what: '1년 미만(9개월) → 1년', hire: '2026-01-12', last: '2026-09-30', pay: 3_000_000, months: 9, years: 1, svc: 1_000_000, conv: 24_000_000, convDed: 17_600_000, base: 6_400_000, convTax: 384_000, calcTax: 32_000, income: 32_000, local: 3_200 },
  { id: 'T02', what: '1년 미만(1개월) → 1년', hire: '2026-07-01', last: '2026-07-31', pay: 2_000_000, months: 1, years: 1, svc: 1_000_000, conv: 12_000_000, convDed: 10_400_000, base: 1_600_000, convTax: 96_000, calcTax: 8_000, income: 8_000, local: 800 },
  { id: 'T03', what: '정확히 5년(기념일 전날 퇴사)', hire: '2021-08-01', last: '2026-07-31', pay: 20_000_000, months: 60, years: 5, svc: 5_000_000, conv: 36_000_000, convDed: 24_800_000, base: 11_200_000, convTax: 672_000, calcTax: 280_000, income: 280_000, local: 28_000 },
  { id: 'T04', what: '5년 + 1일(기념일 퇴사) → 6년', hire: '2021-08-01', last: '2026-08-01', pay: 20_000_000, months: 61, years: 6, svc: 7_000_000, conv: 26_000_000, convDed: 18_800_000, base: 7_200_000, convTax: 432_000, calcTax: 216_000, income: 216_000, local: 21_600 },
  { id: 'T05', what: '퇴사 일자 < 입사 일자(달력식이면 6년)', hire: '2021-08-20', last: '2026-08-10', pay: 30_000_000, months: 60, years: 5, svc: 5_000_000, conv: 60_000_000, convDed: 39_200_000, base: 20_800_000, convTax: 1_860_000, calcTax: 775_000, income: 775_000, local: 77_500 },
  { id: 'T06', what: '10~20년(13년), 10원 절사가 값을 바꿈', hire: '2014-01-02', last: '2026-07-15', pay: 60_000_000, months: 151, years: 13, svc: 22_500_000, conv: 34_615_384, convDed: 23_969_230, base: 10_646_154, convTax: 638_769, calcTax: 691_999, income: 691_990, local: 69_190 },
  { id: 'T07', what: '20년 초과(26년)', hire: '2001-03-02', last: '2026-09-30', pay: 150_000_000, months: 307, years: 26, svc: 58_000_000, conv: 42_461_538, convDed: 28_676_922, base: 13_784_616, convTax: 827_076, calcTax: 1_791_998, income: 1_791_990, local: 179_190 },
  { id: 'T08', what: '과세표준 3억 초과(40%)', hire: '2016-08-01', last: '2026-07-31', pay: 600_000_000, months: 120, years: 10, svc: 15_000_000, conv: 702_000_000, convDed: 292_400_000, base: 409_600_000, convTax: 137_900_000, calcTax: 114_916_666, income: 114_916_660, local: 11_491_660 },
  { id: 'T09', what: '과세표준 10억 초과(45%)', hire: '2011-08-01', last: '2026-07-31', pay: 2_500_000_000, months: 180, years: 15, svc: 27_500_000, conv: 1_978_000_000, convDed: 739_000_000, base: 1_239_000_000, convTax: 491_610_000, calcTax: 614_512_500, income: 614_512_500, local: 61_451_250 },
  { id: 'T10', what: '§48② 상한 — 퇴직급여 < 표 공제 300만', hire: '2023-07-03', last: '2026-07-02', pay: 2_500_000, months: 36, years: 3, svc: 2_500_000, conv: 0, convDed: 0, base: 0, convTax: 0, calcTax: 0, income: 0, local: 0 },
  { id: 'T11', what: '상한 미적용, 환산급여 800만 이하 → 과세표준 0', hire: '2023-07-03', last: '2026-07-02', pay: 4_500_000, months: 36, years: 3, svc: 3_000_000, conv: 6_000_000, convDed: 6_000_000, base: 0, convTax: 0, calcTax: 0, income: 0, local: 0 },
  { id: 'T12', what: '2년, 금액 앵커 1', hire: '2024-08-01', last: '2026-07-31', pay: 4_451_681, months: 24, years: 2, svc: 2_000_000, conv: 14_710_086, convDed: 12_026_051, base: 2_684_035, convTax: 161_042, calcTax: 26_840, income: 26_840, local: 2_680 },
  { id: 'T13', what: '2년, 10원 절사·지방세 두 번 절사(2,763 → 2,760)', hire: '2024-08-01', last: '2026-07-31', pay: 4_484_971, months: 24, years: 2, svc: 2_000_000, conv: 14_909_826, convDed: 12_145_895, base: 2_763_931, convTax: 165_835, calcTax: 27_639, income: 27_630, local: 2_760 },
  { id: 'T14', what: '과세표준 1,400만 — 「이하」 경계는 6%', hire: '2014-08-01', last: '2026-07-31', pay: 63_000_000, months: 144, years: 12, svc: 20_000_000, conv: 43_000_000, convDed: 29_000_000, base: 14_000_000, convTax: 840_000, calcTax: 840_000, income: 840_000, local: 84_000 },
  { id: 'T15', what: '6~10년(8년), 15% 구간', hire: '2018-09-03', last: '2026-08-31', pay: 45_000_000, months: 96, years: 8, svc: 11_000_000, conv: 51_000_000, convDed: 33_800_000, base: 17_200_000, convTax: 1_320_000, calcTax: 880_000, income: 880_000, local: 88_000 },
  // 부동소수 회귀 — 엑셀은 정확값을 낸다. JS 로 「12로 먼저 나누고 곱하면」 1원 모자라 10원 절사 뒤 10원 적다(480 / 980 / 480).
  { id: 'E1', what: '부동소수 n=15', hire: '2011-08-01', last: '2026-07-31', pay: 37_520_417, months: 180, years: 15, svc: 27_500_000, conv: 8_016_333, convDed: 8_009_799, base: 6_534, convTax: 392, calcTax: 490, income: 490, local: 40 },
  { id: 'E2', what: '부동소수 n=27', hire: '1999-08-01', last: '2026-07-31', pay: 79_041_250, months: 324, years: 27, svc: 61_000_000, conv: 8_018_333, convDed: 8_010_999, base: 7_334, convTax: 440, calcTax: 990, income: 990, local: 90 },
  { id: 'E3', what: '부동소수 n=30', hire: '1996-08-01', last: '2026-07-31', pay: 90_020_415, months: 360, years: 30, svc: 70_000_000, conv: 8_008_166, convDed: 8_004_899, base: 3_267, convTax: 196, calcTax: 490, income: 490, local: 40 },
];

describe('퇴직소득세 — 국세청 프로그램과 1원까지 같다', () => {
  it.each(ROWS)('$id $what', (row) => {
    const r = calcRetirementTax({ pay: row.pay, hireDate: row.hire, lastWorkDate: row.last });
    expect({
      months: r.months, years: r.years, svc: r.serviceDeduction, conv: r.converted, convDed: r.convertedDeduction,
      base: r.taxBase, convTax: r.convertedTax, calcTax: r.calculatedTax, income: r.incomeTax, local: r.localTax,
    }).toEqual({
      months: row.months, years: row.years, svc: row.svc, conv: row.conv, convDed: row.convDed,
      base: row.base, convTax: row.convTax, calcTax: row.calcTax, income: row.income, local: row.local,
    });
    expect(r.total).toBe(row.income + row.local);
  });

  it('§48② 상한은 표 공제가 퇴직급여보다 클 때만 걸린다', () => {
    expect(calcRetirementTax({ pay: 2_500_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' }).serviceDeductionCapped).toBe(true);
    expect(calcRetirementTax({ pay: 4_500_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' }).serviceDeductionCapped).toBe(false);
  });

  // 공제표·세율표는 경계에서 이웃한 두 줄이 같은 금액을 낸다(1,400만 × 6% = 84만 = 84만 + 0 × 15%).
  // 그래서 금액만 보면 「이하」를 「미만」으로 바꾼 변이도 통과한다. 경계 사례는 고른 줄(brackets)까지 본다.
  it('경계값은 「이하」 줄을 고른다 — 근속 5년·10년(§48①1), 과세표준 1,400만(§55①), 환산급여 800만(§48①2)', () => {
    const t14 = calcRetirementTax({ pay: 63_000_000, hireDate: '2014-08-01', lastWorkDate: '2026-07-31' });
    expect(t14.taxBase).toBe(14_000_000);
    expect(t14.brackets.rate).toEqual([0, 6, 0]);

    const t03 = calcRetirementTax({ pay: 20_000_000, hireDate: '2021-08-01', lastWorkDate: '2026-07-31' });
    expect(t03.years).toBe(5);
    expect(t03.brackets.service).toEqual([0, 1_000_000, 0]);

    const t08 = calcRetirementTax({ pay: 600_000_000, hireDate: '2016-08-01', lastWorkDate: '2026-07-31' });
    expect(t08.years).toBe(10);
    expect(t08.brackets.service).toEqual([5_000_000, 2_000_000, 5]);
    expect(t08.brackets.rate).toEqual([94_060_000, 40, 300_000_000]);

    // 3년 · 퇴직급여 500만 → 환산급여 (500만 − 300만) × 12 ÷ 3 = 정확히 800만
    const c8 = calcRetirementTax({ pay: 5_000_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' });
    expect(c8.converted).toBe(8_000_000);
    expect(c8.brackets.converted).toEqual([0, 100, 0]);
    expect([c8.convertedDeduction, c8.taxBase, c8.incomeTax]).toEqual([8_000_000, 0, 0]);
  });

  it('적용한 표의 줄을 함께 돌려준다 — T06(13년 · 환산급여 3,461만 · 과세표준 1,064만)', () => {
    const r = calcRetirementTax({ pay: 60_000_000, hireDate: '2014-01-02', lastWorkDate: '2026-07-15' });
    expect(r.brackets).toEqual({
      service: [15_000_000, 2_500_000, 10],
      converted: [8_000_000, 60, 8_000_000],
      rate: [0, 6, 0],
    });
  });

  it('퇴직급여 0원이면 모두 0', () => {
    const r = calcRetirementTax({ pay: 0, hireDate: '2020-01-01', lastWorkDate: '2026-07-31' });
    expect([r.serviceDeduction, r.converted, r.taxBase, r.incomeTax, r.localTax]).toEqual([0, 0, 0, 0, 0]);
  });
});

// 근속월수 = DATEDIF(입사일, 퇴사일, "M") + 1, 근속연수 = 올림(월수 ÷ 12) — 국세청 프로그램 영수증 T25·AE25.
// 오라클 14건. 월말·윤일(2/29) 경계 포함. 「연월 양끝 포함」 달력식은 D01·D02·D05·D06·D09·D12 에서 1년 많다.
const DATES: [string, string, string, number, number][] = [
  ['D01', '2021-08-20', '2026-08-10', 60, 5],
  ['D02', '2021-07-31', '2026-07-30', 60, 5],
  ['D03', '2021-03-01', '2026-02-28', 60, 5],
  ['D04', '2021-03-01', '2026-03-01', 61, 6],
  ['D05', '2020-02-29', '2026-02-27', 72, 6],
  ['D06', '2020-02-29', '2026-02-28', 72, 6],
  ['D07', '2024-01-31', '2024-02-29', 1, 1],
  ['D08', '2024-01-30', '2024-02-29', 1, 1],
  ['D09', '2025-10-31', '2026-10-30', 12, 1],
  ['D10', '2025-10-31', '2026-10-31', 13, 2],
  ['D11', '2025-11-15', '2026-10-28', 12, 1],
  ['D12', '2015-12-31', '2026-12-30', 132, 11],
  ['D13', '2016-01-01', '2026-12-31', 132, 11],
  ['D14', '2026-07-15', '2026-07-15', 1, 1],
];

describe('근속연수 — 입사일부터 마지막 근무일까지', () => {
  it.each(DATES)('%s %s ~ %s → %i개월 · %i년', (_id, hire, last, months, years) => {
    expect(serviceMonths(hire, last)).toBe(months);
    expect(serviceYears(hire, last)).toBe(years);
  });

  it('퇴사일에 퇴직일(마지막 근무일 다음 날)을 넣으면 기념일 경계에서 1년이 뛴다 — T03 ↔ T04', () => {
    expect(serviceYears('2021-08-01', '2026-07-31')).toBe(5);
    expect(serviceYears('2021-08-01', '2026-08-01')).toBe(6);
  });

  it('직접 불러도 날짜 형식을 먼저 본다 — 문자열 비교로 「앞섭니다」가 먼저 나오지 않는다', () => {
    // '-'(0x2D) < '/'(0x2F) 라 형식을 보기 전에 비교하면 '2026-07-02' < '2026/07/01' 이 참이 된다
    expect(() => serviceMonths('2026/07/01', '2026-07-02')).toThrow(/입사일을 확인/);
    expect(() => serviceYears('2026-07-01', '2026.07.31')).toThrow(/퇴사일을 확인/);
  });
});

describe('적용 범위 — 2023. 1. 1. 이후 퇴사(법률 제19196호 부칙 제13조·제14조)', () => {
  const base = { pay: 20_000_000, hireDate: '2018-01-02' };

  it('경계 양쪽 — 2022-12-31 퇴사는 계산하지 않고, 2023-01-01 퇴사는 계산한다', () => {
    expect(RETIREMENT_TAX_FROM).toBe('2023-01-01');
    expect(() => calcRetirementTax({ ...base, lastWorkDate: '2022-12-31' })).toThrow(/2023/);
    const r = calcRetirementTax({ ...base, lastWorkDate: '2023-01-01' });
    expect(r.months).toBe(60);
    expect(r.years).toBe(5);
    expect(r.incomeTax).toBe(280_000);
  });

  it('퇴사일이 입사일보다 앞서면 계산하지 않는다', () => {
    expect(() => calcRetirementTax({ pay: 10_000_000, hireDate: '2026-07-02', lastWorkDate: '2026-07-01' })).toThrow();
  });

  it('잘못된 날짜·금액은 오류', () => {
    expect(() => calcRetirementTax({ pay: 10_000_000, hireDate: '2026-02-30', lastWorkDate: '2026-07-01' })).toThrow();
    expect(() => calcRetirementTax({ pay: 10_000_000, hireDate: '2024-01-01', lastWorkDate: '2026/07/01' })).toThrow();
    expect(() => calcRetirementTax({ pay: -1, hireDate: '2024-01-01', lastWorkDate: '2026-07-01' })).toThrow();
    expect(() => calcRetirementTax({ pay: Number.NaN, hireDate: '2024-01-01', lastWorkDate: '2026-07-01' })).toThrow();
    expect(() => calcRetirementTax({ pay: 1_000_000.5, hireDate: '2024-01-01', lastWorkDate: '2026-07-01' })).toThrow();
    expect(() => calcRetirementTax({ pay: 2e15, hireDate: '2024-01-01', lastWorkDate: '2026-07-01' })).toThrow();
  });
});
