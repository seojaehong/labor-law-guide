// calc_attendance_rate 연기 시험 — 기대값은 tests/unit/calc-attendance-rate.test.ts 의 숫자를 그대로 옮겼다. 입력은 전부 합성 값.
const Y2 = { hireDate: '2024-03-04', accrualDate: '2026-03-04' }; // 근속 2년 → 15일
const Y5 = { hireDate: '2021-03-04', accrualDate: '2026-03-04' }; // 근속 5년 → 17일

export default async function (callNew, check) {
  const n = 'calc_attendance_rate';

  // C1(시험 42~47행) — S250 결근5 → 245/250 = 98% → 15일
  const c1 = await callNew(n, { ...Y2, scheduledDays: 250, days: { absence: 5 } });
  check(`attendance C1 98% → 15일(${c1.headline?.[0]})`,
    c1.ok && c1.result?.status === 'full' && c1.result.primary?.tally?.attended === 245
    && c1.result.primary.days?.num === 15 && c1.result.primary.days.den === 1 && c1.result.primaryText?.rate === '98.00%');

  // C4(시험 81~89행) — S248 쟁의48 결근10 → 190/248 · 실질 190/200 → 15 × 200/248 = 375/31일
  const c4 = await callNew(n, { ...Y2, scheduledDays: 248, days: { 'lawful-strike': 48, absence: 10 } });
  const p4 = c4.result?.primary;
  check(`attendance C4 비례 375/31일(${c4.headline?.[1]})`,
    c4.ok && c4.result?.status === 'prorated' && p4?.rate?.num === 95 && p4.rate.den === 124
    && p4.realRate?.num === 19 && p4.realRate.den === 20 && p4.days?.num === 375 && p4.days.den === 31);

  // C5(시험 91~97행) — 근속 5년 17일 · S250 노조전임100 결근10 → 17 × 150/250 = 51/5일
  const c5 = await callNew(n, { ...Y5, scheduledDays: 250, days: { 'union-fulltime': 100, absence: 10 } });
  check(`attendance C5 가산 포함 비례 51/5일(${c5.result?.primaryText?.days})`,
    c5.ok && c5.result?.baseDays === 17 && c5.result.status === 'prorated' && c5.result.primary?.days?.num === 51 && c5.result.primary.days.den === 5);

  // C2b(시험 55~60행) — S248 결근50 → 198/248, 빼는 날 없음 → 월 개근(「대신」 문장은 응답에서 빠진다)
  const c2b = await callNew(n, { ...Y2, scheduledDays: 248, days: { absence: 50 } });
  check(`attendance C2b 79.84% → 월 개근(${c2b.headline?.join(' / ')})`,
    c2b.ok && c2b.result?.status === 'monthly' && c2b.result.primary?.days === null && c2b.result.primary.realRate === null
    && !JSON.stringify(c2b).includes('대신'));

  // C18(시험 160~169행) — 부당 정직 20 · 결근35 → 빼는 날로 보면 69/5일, 출근으로 보면 43/50 → 15일
  const c18 = await callNew(n, { ...Y2, scheduledDays: 250, days: { 'unfair-suspension': 20, absence: 35 } });
  check('attendance C18 두 값 69/5일 · 15일',
    c18.ok && c18.result?.disputed?.[0] === 'unfair-suspension' && c18.result.status === 'prorated'
    && c18.result.primary?.days?.num === 69 && c18.result.primary.days.den === 5
    && c18.result.alt?.status === 'full' && c18.result.alt.rate?.num === 43 && c18.result.alt.rate.den === 50 && c18.result.alt.days?.num === 15);

  // M1(시험 200~202행) — 월20 · 빼는 날10 · 결근0 → 1일
  const m1 = await callNew(n, { ...Y2, scheduledDays: 250, days: { absence: 5 }, month: { scheduled: 20, excluded: 10, absent: 0 } });
  check(`attendance M1 그 달 개근 1일(${m1.month?.lines?.[0]})`, m1.ok && m1.month?.day === 1 && m1.month.reason === 'perfect');

  // 입력 오류(시험 236행) — 결근200 + 쟁의51 = 251 > 250
  const bad = await callNew(n, { ...Y2, scheduledDays: 250, days: { absence: 200, 'lawful-strike': 51 } });
  check(`attendance 날 수 합이 소정근로일수를 넘으면 오류(${bad.error})`, bad.ok === false && /251일/.test(bad.error ?? ''));
}
