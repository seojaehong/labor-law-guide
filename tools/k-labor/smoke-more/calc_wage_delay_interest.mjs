// calc_wage_delay_interest 스모크 — 기대값은 tests/unit/calc-wage-delay-interest.test.ts 의 값을 그대로 옮겼다. 입력은 전부 합성 값.
export default async function (callNew, check) {
  const N = 'calc_wage_delay_interest';

  // 시험 A(18행) — 1호: 마지막 근무일 3.31 · 1,000만원 · 6.30 지급 → 기준일 4.14, 77일, 421,917원
  const a = await callNew(N, { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-06-30' }] });
  const a0 = a.result?.items?.[0];
  check(`wage_delay A 1호 421,917원(${a.headline?.[0]})`, a.ok && a0?.basis === '1호' && a0.baseDate === '2026-04-14' && a0.delayDays === 77 && a0.interest === 421_917 && a.result.total === 421_917);

  // 시험 D(84행) — 2호 이자가 생긴 뒤 퇴직(§37②): 정기지급일 5.25 그대로, 67일, 110,136원
  const d = await callNew(N, { lastWorkDay: '2026-06-10', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-07-31' }] });
  const d0 = d.result?.items?.[0];
  check(`wage_delay D 2호 periodic-kept 110,136원(${d.headline?.[0]})`, d.ok && d0?.basis === '2호' && d0.reason === 'periodic-kept' && d0.baseDate === '2026-05-25' && d0.delayDays === 67 && d0.interest === 110_136);

  // 시험 E1(113행) — 부칙 §2: 정기지급일 2025. 9. 25. · 재직 중 → 붙지 않음 0원
  const e1 = await callNew(N, { items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2025-11-25' }] });
  check(`wage_delay E1 시행 전 정기지급일 재직 중 0원(${e1.headline?.[0]})`, e1.ok && e1.result?.items?.[0]?.basis === 'none' && e1.result.items[0].reason === 'before-act' && e1.result.total === 0);

  // 시험 F(181·190행) — 적용 제외 2.15~9.30: 228일 빼고 92일 1,008,219원, 빼지 않으면 3,506,849원
  const f = await callNew(N, { lastWorkDay: '2026-01-31', items: [{ kind: 'retirement', amount: 20_000_000, paidDate: '2026-12-31' }], exclusions: [{ from: '2026-02-15', to: '2026-09-30' }] });
  const f0 = f.result?.items?.[0];
  check(`wage_delay F 적용 제외 1,008,219원 · 빼지 않으면 3,506,849원(${f.headline?.[0]})`, f.ok && f0?.excludedDays === 228 && f0.days === 92 && f0.interest === 1_008_219 && f.totalWithoutExclusions === 3_506_849);

  // 시험 G(226행) — 여러 건: 항목별 44,985 · 30,684 · 230,136원, 합계 305,805원
  const g = await callNew(N, {
    lastWorkDay: '2026-02-20',
    items: [
      { kind: 'retirement', amount: 2_345_678, paidDate: '2026-04-10' },
      { kind: 'retirement', amount: 4_000_000, paidDate: '2026-03-20' },
      { kind: 'retirement', amount: 6_000_000, paidDate: '2026-05-15' },
    ],
  });
  check(`wage_delay G 여러 건 합계 305,805원(${g.headline?.[0]})`, g.ok && JSON.stringify(g.result?.items?.map((i) => i.interest)) === '[44985,30684,230136]' && g.result.total === 305_805);

  // 시험 「입력 오류」(253행) — 퇴직 금품인데 마지막 근무일이 없으면 오류
  const bad = await callNew(N, { items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2026-06-30' }] });
  check(`wage_delay 마지막 근무일 없으면 오류(${bad.error})`, bad.ok === false && /마지막 근무일/.test(bad.error ?? ''));

  // 시험 268행 — 0원은 「1원 이상」
  const zero = await callNew(N, { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement', amount: 0, paidDate: '2026-06-30' }] });
  check(`wage_delay 0원 오류(${zero.error})`, zero.ok === false && zero.error === '항목 1의 금액을 1원 이상으로 넣어 주세요');
}
