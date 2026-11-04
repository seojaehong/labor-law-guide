// check_monthly_pay 연기 시험. 기대값 = 사이트 단위 시험 tests/unit/pay-check-form.test.ts · pay-check-edge.test.ts 의 숫자. 전부 합성 값이다.
export default async function (callNew, check) {
  const PERIOD = { pay_period_start: '2026-04-01', pay_period_end: '2026-04-30' };

  // pay-check-form.test.ts:16 — 중도퇴사 · 30일 기준 · 3,000,000원 · 15일 · 명세서 1,400,000원 → 1,500,000 · 차이 100,000
  const leave = await callNew('check_monthly_pay', {
    scenario: 'MID_LEAVE', policy: 'DAY_30', basisDocumented: true,
    ...PERIOD, employment_end: '2026-04-15', last_scheduled_workday: '2026-04-15', paid_holiday_treatment: 'paid',
    payslip_amount: 1_400_000, monthly_base_pay: 3_000_000, eligible_days: 15,
  });
  check(`check_monthly_pay 중도퇴사 30일 기준 1,500,000 · 차이 100,000(${leave.headline?.[0]})`,
    leave.ok && leave.result?.status === 'POTENTIAL_MISMATCH' && leave.result.expected_amount === 1_500_000 && leave.result.difference === 100_000
    && leave.question === '명세서가 퇴사월 인정일수를 며칠로, 몇 일 기준으로 계산했는지 확인해 주세요.');

  // pay-check-edge.test.ts:103 — 결근 8시간 × 10,000 = 80,000, 명세서 −80,000 → 일치 · 차이 0
  const ab = { scenario: 'ABSENCE_DEDUCTION', policy: 'ABSENCE_HOUR', basisDocumented: true, unpaid_absence_hours: 8, hourly_rate: 10_000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false };
  const same = await callNew('check_monthly_pay', { ...ab, payslip_absence_deduction: -80_000 });
  check(`check_monthly_pay 결근 공제 −80,000 일치(${same.headline?.[0]})`, same.ok && same.result?.status === 'MATCH' && same.result.difference === 0 && same.result.expected_amount === 80_000);
  // pay-check-edge.test.ts:111 — 명세서 100,000 공제 → 어긋남 가능성 · 차이 +20,000(더 공제된 쪽도 양수)
  const over = await callNew('check_monthly_pay', { ...ab, payslip_absence_deduction: 100_000 });
  check(`check_monthly_pay 결근 과공제 차이 20,000(${over.headline?.[0]})`, over.ok && over.result?.status === 'POTENTIAL_MISMATCH' && over.result.difference === 20_000);

  // pay-check-form.test.ts:124 — 주휴 4주 60시간 ÷ 20일 = 3시간 × 10,000 × 1주 = 30,000 일치
  const hw = await callNew('check_monthly_pay', {
    scenario: 'HOURLY_WEEKLY_HOLIDAY', policy: 'WEEKLY_HOLIDAY_FIXED',
    four_week_scheduled_hours: 60, averaging_weeks: 4, employment_continued_for_7_days: true, weekly_holiday_designated: true,
    all_scheduled_days_attended: true, payslip_weekly_holiday_pay: 30_000, hourly_rate: 10_000, full_time_scheduled_days_4w: 20, holiday_weeks: 1,
  });
  check(`check_monthly_pay 주휴 30,000 일치(${hw.headline?.[0]})`, hw.ok && hw.result?.status === 'MATCH' && hw.result.expected_amount === 30_000);

  // pay-check-form.test.ts:186 — 기준은 골랐지만 문서 미확인 → 800,000 참고 계산 + 확인 상태 1건
  const ref = await callNew('check_monthly_pay', {
    scenario: 'MID_JOIN', policy: 'HOUR_ACTUAL', basisDocumented: false,
    ...PERIOD, employment_start: '2026-04-16', hourly_rate: 10_000, paid_hours: 80, payslip_amount: 800_000,
  });
  check(`check_monthly_pay 문서 미확인은 참고 계산 800,000(${ref.headline?.[0]})`,
    ref.ok && ref.result?.status === 'MATCH' && ref.result.expected_amount === 800_000
    && JSON.stringify(ref.result.reasons) === '["COMPARED_EQUAL","BASIS_NOT_DOCUMENTED"]' && ref.openConfirmations?.length === 1);

  // pay-check-edge.test.ts:277 — 입력 오류: 입사일 2026.04.16 은 날짜가 아니다 → 확인 필요 · 금액 없음
  const bad = await callNew('check_monthly_pay', { scenario: 'MID_JOIN', policy: 'HOUR_ACTUAL', ...PERIOD, employment_start: '2026.04.16' });
  check(`check_monthly_pay 날짜 형식 오류는 금액 없이 멈춤(${bad.headline?.[0]})`,
    bad.ok && bad.result?.status === 'NEEDS_CONFIRMATION' && JSON.stringify(bad.result.reasons) === '["FACT_INVALID_DATE:employment_start"]'
    && bad.result.expected_amount === null && bad.amounts === null);

  // 화면 「정상 근무월」 — build-input.ts OUTSIDE_NOTE
  const normal = await callNew('check_monthly_pay', { scenario: 'NORMAL_MONTH' });
  check('check_monthly_pay 정상 근무월은 범위 밖', normal.ok && normal.result?.status === 'OUTSIDE_SCOPE' && /범위 밖/.test(normal.observation ?? ''));
}
