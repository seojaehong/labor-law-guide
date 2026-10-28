// 챗봇 퇴직금 답 끝에 붙이는 「계산기에서 직접 확인」 링크.
// 계산기 입력 칸은 퇴직일(마지막 근무일 다음 날)이고, 챗봇 인자는 마지막 근무일이다 — 하루를 더해 넘긴다.
// 연차수당은 계산기 「연월차수당」 칸(퇴직 전 1년 동안 받은 총액)으로 넘긴다. 금액이 같은지는 tests/unit/calc-seams.test.ts 가 본다.

const DAY = 86_400_000;

function nextDay(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) return null;
  return new Date(t + DAY).toISOString().slice(0, 10);
}

export function severanceLeavePay(a: Record<string, unknown>): number {
  if (typeof a.annual_leave_pay === 'number') return a.annual_leave_pay;
  // 예전 인자(1일 수당 × 일수) — 대화 기록에 남은 호출을 받기 위해 둔다
  const daily = typeof a.annual_leave_daily_wage === 'number' ? a.annual_leave_daily_wage : 0;
  const days = typeof a.unused_annual_leave_days === 'number' ? a.unused_annual_leave_days : 0;
  return daily * days;
}

export function severanceCalculatorLink(a: Record<string, unknown>): string | null {
  const params = new URLSearchParams();
  if (typeof a.hire_date === 'string') params.set('start', a.hire_date);
  const end = typeof a.last_work_date === 'string' ? nextDay(a.last_work_date) : null;
  if (end) params.set('end', end);
  const wages = Array.isArray(a.wages_3months) ? a.wages_3months : null;
  if (wages) {
    if (wages[0] != null) params.set('w1', String(wages[0]));
    if (wages[1] != null) params.set('w2', String(wages[1]));
    if (wages[2] != null) params.set('w3', String(wages[2]));
  }
  if (typeof a.annual_bonus === 'number' && a.annual_bonus > 0) params.set('bonusTotal', String(a.annual_bonus));
  const leave = severanceLeavePay(a);
  if (leave > 0) params.set('annualLeave', String(leave));
  if (!params.has('start') || !params.has('end')) return null;
  params.set('run', '1');
  return `https://yellowenvelope.kr/tools/severance.html?${params.toString()}`;
}
