// check_ordinary_wage 스모크 — 기대값은 tests/unit/calc-ordinary-wage-check.test.ts 그대로. 입력은 전부 합성 값이다.
const YES = { regular: 'yes', uniform: 'yes', forWork: 'yes' };
// 시험 B1 묶음(441~455행) — 기본급 250만 · 직무 20만 · 근속 5만 · 격월 재직조건부 상여 250만 · 성과급 최소 10만 · 부양가족 차등 가족수당
const B1 = [
  { kind: 'base', name: '기본급', amount: 2_500_000, timesPerYear: 12, ...YES },
  { kind: 'allowance', name: '직무수당', amount: 200_000, timesPerYear: 12, ...YES },
  { kind: 'tenure', name: '근속수당', amount: 50_000, timesPerYear: 12, ...YES },
  { kind: 'bonus', name: '정기상여금', amount: 2_500_000, timesPerYear: 6, ...YES, employedOnPayday: true },
  { kind: 'performance', name: '성과급', amount: 300_000, timesPerYear: 12, ...YES, forWork: 'no', minimum: 100_000, performanceYear: 'current' },
  { kind: 'family', name: '가족수당', amount: 60_000, timesPerYear: 12, ...YES, uniform: 'no' },
];
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.005;

export default async function (callNew, check) {
  // B1 새 기준 — 월 4,100,000 × 12 = 49,200,000, ÷ 12 ÷ 209 = 19,617.22 (시험 440~444행)
  const n = await callNew('check_ordinary_wage', { date: '2025-01-01', unitHours: 209, items: B1 });
  const bonusNew = n.items?.find((i) => i.name === '정기상여금');
  check(`ordinary_wage B1 새 기준 49,200,000 · 19,617.22(${n.headline?.[1]})`,
    n.ok && n.result?.era === 'new' && n.result.current.annual === 49_200_000 && near(n.result.current.hourly, 19_617.22) && n.result.current.count === 5);
  check('ordinary_wage B1 재직조건부 상여 새 기준 들어가는 쪽 1년 15,000,000(시험 A1 54~58행)',
    bonusNew?.direction === 'in' && bonusNew.annual === 15_000_000 && bonusNew.reasons?.includes('Q06') && !!bonusNew.otherEra);
  check('ordinary_wage B1 가족수당(부양가족 차등) 빠지는 쪽 · 19,904.31 이 아님(시험 447~449행)',
    n.items?.find((i) => i.name === '가족수당')?.direction === 'out' && !near(n.result?.current?.hourly, 19_904.31));

  // B1 종전 기준 — 재직조건부 상여 제외 월 2,850,000 × 12 = 34,200,000, ÷ 209 = 13,636.36 (시험 451~456행), 208.56 이면 13,665.13
  const o = await callNew('check_ordinary_wage', { date: '2024-12-18', unitHours: 208.56, items: B1 });
  check(`ordinary_wage B1 종전 기준 34,200,000 · 13,665.13(${o.headline?.[1]})`,
    o.ok && o.result?.era === 'old' && o.result.current.annual === 34_200_000 && near(o.result.current.hourly, 13_665.13) && near(o.result.newEra.hourly, 19_658.61));
  check('ordinary_wage 종전 기준 재직조건부 상여 빠지는 쪽(Q17, 시험 A1-b 61~66행) · 종전 안내문',
    o.items?.find((i) => i.name === '정기상여금')?.reasons?.includes('Q17') && o.items.find((i) => i.name === '정기상여금').direction === 'out' && o.notices?.length === 3);

  // A7 최소 보장 성과급(연 1회 1,000만, 최소 125만) — 최소분만, ÷ 209 = 498.41 (시험 222~229행)
  const p = await callNew('check_ordinary_wage', { date: '2025-01-01', items: [{ kind: 'performance', name: '성과급', amount: 10_000_000, timesPerYear: 1, ...YES, forWork: 'no', minimum: 1_250_000, performanceYear: 'current' }] });
  check(`ordinary_wage A7 성과급 최소분 1,250,000 · 498.41(${p.formula})`, p.ok && p.items?.[0]?.partial === true && p.result?.current?.annual === 1_250_000 && near(p.result.current.hourly, 498.41));

  // 입력 오류 — 월 기준시간 0(시험 489~491행), 없는 날짜(시험 47~50행), 1회 지급액 음수는 그 항목만 오류(시험 396~398행)
  const z = await callNew('check_ordinary_wage', { date: '2025-01-01', unitHours: 0, items: B1.slice(0, 1) });
  check(`ordinary_wage 월 기준시간 0 은 오류(${z.error})`, z.ok === false && /월 기준시간/.test(z.error ?? ''));
  const d = await callNew('check_ordinary_wage', { date: '2024-02-30', items: B1.slice(0, 1) });
  check(`ordinary_wage 없는 날짜는 오류(${d.error})`, d.ok === false && /날짜/.test(d.error ?? ''));
  const neg = await callNew('check_ordinary_wage', { date: '2025-01-01', items: [B1[0], { ...B1[1], amount: -1 }] });
  check(`ordinary_wage 음수 금액 항목만 오류, 나머지는 합계(${neg.items?.[1]?.error})`,
    neg.ok && neg.result?.invalid === 1 && /금액/.test(neg.items?.[1]?.error ?? '') && neg.result.current.annual === 30_000_000);
}
