// calc_daily_worker_tax 연기 시험 — 기대값은 tests/unit/calc-daily-worker-tax.test.ts 를 그대로 옮긴 것. 전부 합성 값이다.
export default async function (callNew, check) {
  const N = 'calc_daily_worker_tax';
  const pay = (dailyWage, days) => ({ lines: [{ dailyWage, days }] });

  // B(28~31행) 서식 예시 — 200,000 × 7일 = 9,450 / 지방 940, 합계 10,390
  const b = await callNew(N, { dailyWorker: true, payments: [pay(200_000, 7)] });
  check(`daily B 200,000×7 = 9,450 / 940(${b.headline?.[0]})`,
    b.ok && b.result?.incomeTax === 9_450 && b.result.localTax === 940 && b.result.total === 10_390);

  // D(59~64행) 소액부징수 — 180,000 × 1일 = 810원 < 1,000 → 0 / 0
  const d = await callNew(N, { dailyWorker: true, payments: [pay(180_000, 1)] });
  check(`daily D 180,000×1 소액부징수 0 / 0(${d.headline?.[1]})`,
    d.ok && d.result?.payments?.[0]?.small === true && d.result.incomeTax === 0 && d.result.localTax === 0);

  // L(79~84행) 지급 2건 — 2일분 1,620 / 160 + 1일분 810 → 0. 합계 1,620 / 160
  const l = await callNew(N, { dailyWorker: true, payments: [pay(180_000, 2), pay(180_000, 1)] });
  check(`daily L 지급 2건 1,620 / 160(${l.headline?.[0]})`,
    l.ok && l.result?.incomeTax === 1_620 && l.result.localTax === 160 && l.result.payments?.[1]?.small === true);

  // J(97~101행) 날별 계산 — 100,000 + 250,000 = 2,700 / 270 (평균 175,000×2 이면 1,350)
  const j = await callNew(N, { dailyWorker: true, payments: [{ lines: [{ dailyWage: 100_000, days: 1 }, { dailyWage: 250_000, days: 1 }] }] });
  check(`daily J 날별 2,700 / 270(${j.headline?.[0]})`, j.ok && j.result?.incomeTax === 2_700 && j.result.localTax === 270);

  // K(114~120행) 끝수 순서 — 187,170 × 3일: 합계 버림 3,010 / 300, 날별 버림 3,000 / 300
  const k = await callNew(N, { dailyWorker: true, payments: [pay(187_170, 3)] });
  check(`daily K 3,010 대 날별 3,000(${k.headline?.[1]?.slice(0, 40)}…)`,
    k.ok && k.result?.incomeTax === 3_010 && k.result.dailyFloor?.incomeTax === 3_000 && k.result.differs === true);

  // 입력 확인(177~185행) — 원 단위가 아닌 일급, 0일은 엔진 오류 문구 그대로
  const bad = await callNew(N, { dailyWorker: true, payments: [pay(200_000.5, 1)] });
  check(`daily 원 단위 아닌 일급은 오류(${bad.error})`, bad.ok === false && /원 단위/.test(bad.error ?? ''));
  const zero = await callNew(N, { dailyWorker: true, payments: [pay(200_000, 0)] });
  check(`daily 0일은 오류(${zero.error})`, zero.ok === false && /일수/.test(zero.error ?? ''));

  // 일용근로자가 아니면 계산하지 않는다
  const no = await callNew(N, { dailyWorker: false, payments: [pay(200_000, 1)] });
  check('daily 일용근로자 아님 → 계산하지 않음', no.ok && no.stop === true && no.result === undefined);
}
