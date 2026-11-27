// calc_childcare_reduction_pay 스모크 — 기대값은 tests/unit/calc-childcare-reduction.test.ts 의 값을 그대로 옮겼다. 입력은 전부 합성 값.
export default async function (callNew, check) {
  const N = 'calc_childcare_reduction_pay';
  const BASE = { monthlyOrdinaryWage: 4_000_000, weeklyHoursBefore: 40, weeklyHoursAfter: 24, startDate: '2026-12-21' };

  // 상한 걸림: 400만·40→24 → 625,000 + 240,000 = 865,000 · 우선지원·최초 허용 → 사업주 월 400,000
  const a = await callNew(N, { ...BASE, priorityFirm: true, firstTimeGrant: true });
  const w = a.result?.worker;
  check(`childcare 400만·40→24 = 625,000 + 240,000 = 865,000 · 사업주 400,000(${a.headline?.[0]})`,
    a.ok && w?.firstPart === 625_000 && w.restPart === 240_000 && w.monthly === 865_000 && a.result.employer.subsidy.monthly === 400_000 && Array.isArray(a.needs) && a.needs.length === 0);

  // 단축 10시간 미만: 40→35 → 312,500, 업무분담 지원금 제외
  const s = await callNew(N, { ...BASE, weeklyHoursAfter: 35, priorityFirm: true, workSharing: { paidMonthly: 300_000 } });
  check(`childcare 5시간 단축 312,500 · 업무분담 0원(${s.headline?.at(-1)})`, s.ok && s.result?.worker?.monthly === 312_500 && s.result.employer.workSharing?.monthly === 0);

  // 1개월 미만 일할: 3.1~4.15 → 865,000 + 432,500 = 1,297,500
  const p = await callNew(N, { ...BASE, startDate: '2027-03-01', endDate: '2027-04-15' });
  check(`childcare 일할 합계 1,297,500(${p.headline?.[1]})`, p.ok && p.result?.worker?.schedule?.total === 1_297_500);

  // 필수 사실이 없으면 needs, 금액 없음
  const n = await callNew(N, { startDate: '2026-12-21' });
  check(`childcare needs 3개(${n.needs?.map((x) => x.key).join(',')})`, n.ok && n.needs?.length === 3 && n.result?.worker === null);

  // 단축 후 15시간 미만은 거절
  const bad = await callNew(N, { ...BASE, weeklyHoursAfter: 14 });
  check(`childcare 단축 후 14시간 거절(${bad.error})`, bad.ok === false && /15시간 이상 35시간 이하/.test(bad.error ?? ''));
}
