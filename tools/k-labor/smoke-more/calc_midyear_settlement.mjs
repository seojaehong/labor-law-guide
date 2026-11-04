// calc_midyear_settlement — 기대값은 tests/unit/calc-midyear-settlement.test.ts 의 숫자를 그대로 옮긴 것이다. 입력은 전부 합성 값.
const S2 = { totalPay: 26_000_000, nonTaxable: 1_200_000, pension: 1_178_000, health: 891_560, longTermCare: 117_240, employment: 223_200, paidIncomeTax: 300_000, lastMonthSimpleTax: 31_000, paidLocalTax: 29_980 };
const S3 = { totalPay: 41_000_000, nonTaxable: 1_000_000, pension: 1_900_000, health: 1_438_000, longTermCare: 188_960, employment: 360_000, paidIncomeTax: 1_500_000, lastMonthSimpleTax: 160_000, paidLocalTax: 150_000 };
const X1b = { totalPay: 121_199_000, nonTaxable: 1_200_000, pension: 3_200_000, health: 4_314_000, longTermCare: 566_000, employment: 1_080_000, paidIncomeTax: 17_000_000, lastMonthSimpleTax: 2_000_000, paidLocalTax: 1_700_000 };
const base = { hasExcludedItem: false, year: 2026 };

export default async function (callNew, check) {
  const n = 'calc_midyear_settlement';

  // S2 — A +21,840 / B −74,890(−74,896 → 0 쪽 버림), B 결정 225,104 · 지방 −7,470, A 지방 +2,200 (시험 :27 · :46 · :114-117)
  const s2 = await callNew(n, { ...base, ...S2 });
  check(
    `midyear S2 A +21,840 · B −74,890(${s2.headline?.[0]?.slice(0, 40)}…)`,
    s2.ok && s2.result?.same === false && s2.result.a.settleIncomeTax === 21_840 && s2.result.a.settleLocalTax === 2_200
      && s2.result.b.decided === 225_104 && s2.result.b.settleIncomeTax === -74_890 && s2.result.b.settleLocalTax === -7_470,
  );

  // S3 — 두 경로 모두 추징: A 결정 1,560,456 · +60,450 / B 결정 1,728,500 · +228,500, 간이세액 160,000 먼저 뗀 영수증 값 A −99,540 · B +68,500 (시험 :30 · :49 · :118-120 · :160-164)
  const s3 = await callNew(n, { ...base, ...S3 });
  check(
    `midyear S3 A +60,450 · B +228,500 · 간이세액 대조 A −99,540 · B +68,500`,
    s3.ok && s3.result?.a.decided === 1_560_456 && s3.result.a.settleIncomeTax === 60_450 && s3.result.a.settleLocalTax === 6_040
      && s3.result.b.decided === 1_728_500 && s3.result.b.settleIncomeTax === 228_500
      && s3.result.a.settleWithSimple === -99_540 && s3.result.b.settleWithSimple === 68_500,
  );

  // 급여 0 — 두 결정세액이 같아(same) 이미 낸 세금 전부 환급 −1,230 · −120 (시험 :274-280)
  const zero = await callNew(n, { ...base, totalPay: 0, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 1_230, paidLocalTax: 120 });
  check(
    `midyear 급여 0 → same · −1,230 · −120(${zero.headline?.[0]})`,
    zero.ok && zero.result?.same === true && zero.result.a.decided === 0 && zero.result.a.settleIncomeTax === -1_230 && zero.result.a.settleLocalTax === -120 && zero.headline?.length === 2,
  );

  // 총급여 1.2억 이상은 계산하지 않음 — X1b 에 받은 급여 121,200,000(총급여 120,000,000) (시험 :238 · :243-245)
  const hi = await callNew(n, { ...base, ...X1b, totalPay: 121_200_000 });
  check(`midyear 총급여 1.2억 이상은 멈춤(${hi.headline?.[1]})`, hi.ok && hi.result?.kind === 'out' && hi.result.reason === 'high-pay');

  // 기준 없는 해 — 2025 는 out/year (시험 :253)
  const y25 = await callNew(n, { ...base, ...S3, year: 2025 });
  check('midyear 2025 년은 계산하지 않음', y25.ok && y25.result?.kind === 'out' && y25.result.reason === 'year');

  // 범위 밖 항목이 있으면 계산하지 않음(화면 SCOPE_STOP)
  const stop = await callNew(n, { ...base, ...S2, hasExcludedItem: true });
  check('midyear 범위 밖 항목이 있으면 계산하지 않음', stop.ok && stop.stopped === true && !stop.result);

  // 입력 오류 — 비과세 > 받은 급여 → 엔진 문구 그대로 (시험 :268, 엔진 midyear-settlement.ts:236)
  const bad = await callNew(n, { ...base, ...S2, nonTaxable: 26_000_001 });
  check(`midyear 비과세가 급여보다 크면 오류(${bad.error})`, bad.ok === false && bad.error === '비과세 급여가 받은 급여 합계보다 큽니다');

  // 입력 오류 — 음수 (시험 :269)
  const neg = await callNew(n, { ...base, ...S2, health: -1 });
  check(`midyear 음수 보험료는 오류(${neg.error})`, neg.ok === false && /건강보험료/.test(neg.error ?? ''));
}
