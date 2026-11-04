// check_contractor 스모크 — 기대값은 tests/unit/calc-contractor-check.test.ts 의 값을 그대로 옮겼다. 전부 합성 값.
// 기준일은 그 시험과 같은 2026-10-29 로 고정한다(요율이 날짜로 바뀌므로).
const DATE = '2026-10-29';
const WORKER = { Q1: 'yes', Q2: 'yes', Q3: 'no', Q4: 'no', Q5: 'yes', Q6: 'yes', Q7: 'yes', Q8: 'yes' };
const INDEP = { Q1: 'no', Q2: 'no', Q3: 'yes', Q4: 'yes', Q5: 'no', Q6: 'no', Q7: 'no', Q8: 'no' };
const readings = (res) => Object.fromEntries((res.result?.items ?? []).map((i) => [i.id, i.reading]));

export default async function (callNew, check) {
  // M1 300만(시험 48행) + P1 종속 쪽 전부(191행)
  const m1 = await callNew('check_contractor', { answers: WORKER, pay: 3_000_000, date: DATE });
  const b1 = m1.result?.money?.business;
  const w1 = m1.result?.money?.wage;
  check(`contractor M1 3.3% 90,000/9,000/2,901,000 · 근로소득 2,626,700(${m1.headline?.[2]})`,
    m1.ok && b1?.incomeTax === 90_000 && b1.localTax === 9_000 && b1.takeHome === 2_901_000
      && w1?.status === 'ok' && w1.nps === 142_500 && w1.insurance === 291_520 && w1.takeHome === 2_626_700);
  const r1 = readings(m1);
  check('contractor P1 종속 쪽 전부 — 8개 항목 모두 worker', Object.keys(r1).length === 8 && Object.values(r1).every((x) => x === 'worker'));

  // P2 독립 쪽 전부(196~203행) — Q1~Q4 few · Q6·Q7 light · Q5·Q8 split. 금액 없이도 대조는 낸다
  const p2 = await callNew('check_contractor', { answers: INDEP });
  const r2 = readings(p2);
  check('contractor P2 Q1~Q4 few · Q5·Q8 split · Q6·Q7 light · 금액 칸 없음',
    p2.ok && ['Q1', 'Q2', 'Q3', 'Q4'].every((k) => r2[k] === 'few') && r2.Q5 === 'split' && r2.Q8 === 'split'
      && r2.Q6 === 'light' && r2.Q7 === 'light' && p2.result?.money === undefined);

  // M7 1,200만(71~77행) — 근로소득 쪽은 표 밖, 4대보험 909,100 만
  const m7 = await callNew('check_contractor', { pay: 12_000_000, date: DATE });
  const b7 = m7.result?.money?.business;
  const w7 = m7.result?.money?.wage;
  check('contractor M7 3.3% 360,000/36,000/11,604,000 · 근로소득 aboveTable 4대보험 909,100',
    m7.ok && b7?.incomeTax === 360_000 && b7.localTax === 36_000 && b7.takeHome === 11_604_000
      && w7?.status === 'aboveTable' && w7.insurance === 909_100);

  // S1 33,000(153~158행·171행) — 990/90/31,920, 국민연금 기준소득월액 하한으로 셈했다고 밝힌다
  const s1 = await callNew('check_contractor', { pay: 33_000, date: DATE });
  const bs = s1.result?.money?.business;
  check('contractor S1 33,000 → 990/90/31,920 · 머리말에 기준소득월액 하한 410,000원',
    s1.ok && bs?.incomeTax === 990 && bs.localTax === 90 && bs.takeHome === 31_920
      && (s1.headline ?? []).join(' ').includes('기준소득월액 하한 410,000원'));

  // 공제대상가족 0(133행) — 3.3% 쪽은 그대로, 근로소득 쪽만 계산하지 않음
  const f0 = await callNew('check_contractor', { pay: 3_000_000, family: 0, date: DATE });
  check('contractor 가족 0 — 3.3% 2,901,000 · 근로소득 notComputed(공제대상가족)',
    f0.ok && f0.result?.money?.business?.takeHome === 2_901_000 && f0.result.money.wage?.status === 'notComputed'
      && /공제대상가족 수를 확인해 주세요/.test(f0.result.money.wage.reason ?? ''));

  // 입력 오류(126~130행) — 월 보수 0 이면 두 쪽 다 낼 수 없어 멈춘다(엔진 문구 그대로)
  const bad = await callNew('check_contractor', { pay: 0, date: DATE });
  check(`contractor 월 보수 0 은 오류(${bad.error})`, bad.ok === false && /월 보수를 확인해 주세요/.test(bad.error ?? ''));
}
