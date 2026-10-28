// 상시 근로자 수 계산기의 문장은 모두 여기서 만든다. 시험이 이 함수들의 출력 전부를 금지어로 훑는다.
import { DUTIES } from '@/content/duties-data';
import type { Crew, CoveredSpan, HeadcountResult, Note, Plan, PlanAnswer } from '@/lib/headcount-plan';

export const FORBIDDEN = ['판정', '진단', '자문', '상담', '노무사', '적법', '확률'] as const;

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 「11월 17일(화)」 — 해가 다르면 「2027년 1월 2일(토)」 */
export function fmtDate(d: string, today: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}년 `}${m}월 ${day}일(${w})`;
}

const short = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const avg = (n: number) => n.toFixed(2);

/** 5인 이상으로 보는 기간에 생긴 일에 적용되는 것 — /duties 와 같은 데이터. 연차는 따로 말한다 */
export const CHANGES = DUTIES.filter((d) => d.min === 5 && d.id !== 'annual').map((d) => ({ id: d.id, title: d.title, basis: d.basis }));

function spanSentence(s: CoveredSpan, today: string): string {
  if (s.start === 'open' && s.end === 'open') return '살펴본 기간 내내 5인 이상 사업장으로 봅니다.';
  if (s.start === 'open') return `지금 5인 이상 사업장이고 ${fmtDate((s.end as { date: string }).date, today)}까지 그렇게 봅니다.`;
  if (s.end === 'open') return `${fmtDate(s.start.date, today)}부터 계속 5인 이상 사업장으로 봅니다.`;
  return `${fmtDate(s.start.date, today)}부터 ${fmtDate(s.end.date, today)}까지 5인 이상 사업장으로 봅니다.`;
}

export function headline(a: PlanAnswer, today: string): string[] {
  if (a.five.kind === 'always') return ['살펴본 기간 내내 5인 이상 사업장으로 봅니다.'];
  if (a.five.kind === 'none') return ['이 계획으로는 5인 이상 사업장이 되는 날이 없습니다.'];
  return a.five.spans.map((s) => spanSentence(s, today));
}

function startWhy(r: HeadcountResult, today: string): string {
  const range = `${short(r.periodStart)}~${short(r.periodEnd)}`;
  const lead = `${fmtDate(r.baseDate, today)}에 거슬러 센 1개월(${range})은 가동일 ${r.operatingDays}일 가운데 5명 미만인 날이 ${r.belowDays}일로 절반이 안 됩니다.`;
  return r.basis === 'rule2-1' ? `${lead} 평균은 ${avg(r.average)}명이지만 이 규칙에 따라 5인 이상으로 봅니다(시행령 제7조의2 제2항 제1호).` : lead;
}

function endWhy(r: HeadcountResult, today: string): string {
  const range = `${short(r.periodStart)}~${short(r.periodEnd)}`;
  return `${fmtDate(r.baseDate, today)}에 거슬러 센 1개월(${range})은 가동일 ${r.operatingDays}일 가운데 5명 미만인 날이 ${r.belowDays}일로 절반 이상이 되어 빠집니다.`;
}

/** 왜 그날부터·그날까지인지 */
export function whyLines(a: PlanAnswer, today: string): string[] {
  if (a.five.kind === 'always') return ['기준일마다 그 전 1개월을 거슬러 세는데, 살펴본 기간 어느 날에도 5명 미만인 날이 절반에 이르지 않습니다.'];
  if (a.five.kind === 'none') {
    const r = a.five.nearest;
    return [`가장 가까운 날은 ${fmtDate(r.baseDate, today)}입니다. 그 전 1개월 가동일 ${r.operatingDays}일 가운데 5명 미만인 날이 ${r.belowDays}일이었습니다. 이 날수가 절반보다 적어야 5인 이상입니다.`];
  }
  const lines = ['사람을 더 쓴 날 바로 바뀌지 않습니다. 법은 그날 전 1개월을 거슬러 셉니다.'];
  for (const s of a.five.spans) {
    if (s.start !== 'open') lines.push(startWhy(s.start.why, today));
    if (s.end !== 'open') lines.push(endWhy(s.end.why, today));
  }
  return lines;
}

export function leaveLines(a: PlanAnswer, today: string): string[] {
  const head = '1년 이상 근속자 연차(15일 등, 제60조 제1항)';
  const lines: string[] = [];
  switch (a.leave.kind) {
    case 'none':
      lines.push(`${head}는 생기지 않습니다. 지난 1년 동안 매달 5명 이상이어야 하는데 이 계획으로는 12개월 가운데 ${a.leave.coveredMonths}개월입니다.`);
      break;
    case 'always':
      lines.push(`${head}도 적용됩니다. 지난 1년 동안 매달 5명 이상입니다.`);
      break;
    case 'from':
      lines.push(`${head}는 ${fmtDate(a.leave.date, today)}부터 적용됩니다. 그날 전 1년 동안 매달 5명 이상이 되기 때문입니다.`);
      break;
    case 'spans':
      lines.push(`${head}는 ${a.leave.spans.map((s) => `${fmtDate(s.from, today)}~${fmtDate(s.to, today)}`).join(', ')}에 적용됩니다.`);
      break;
  }
  if (a.five.kind !== 'none') {
    lines.push('입사 1년 미만 직원의 한 달 개근 1일(제60조 제2항)은 1년 요건 대상이 아니라서 위 5인 이상 기간에 생기면 줍니다.');
  }
  return lines;
}

export function tenLine(a: PlanAnswer, today: string): string | null {
  if (a.ten.length === 0) return null;
  const spans = a.ten.map((s) => `${fmtDate(s.from, today)}~${fmtDate(s.to, today)}`).join(', ');
  return `${spans}에는 10명 이상으로 봅니다. 이 기간에는 취업규칙 작성·신고(제93조)도 해당합니다.`;
}

export function noteLine(n: Note, plan: Plan, today: string): string {
  switch (n.kind) {
    case 'staff-assumed':
      return `날짜를 넣지 않은 ${n.count}명은 1년 넘게 일해 온 것으로 보고 셉니다. 입사 1년이 안 됐으면 「자세히」에서 입사일을 넣습니다.`;
    case 'holidays-counted':
      return '공휴일도 문을 연 날로 셉니다. 쉰 날이 있으면 「쉬는 날·사업 시작일」에 넣습니다.';
    case 'period-reversed':
      return `${crewLabel(plan.crews.find((c) => c.id === n.crewId))} 줄은 끝나는 날이 시작일보다 빨라 세지 않았습니다.`;
    case 'change-outside-window':
      return `오늘에서 1년 넘게 떨어진 날짜(${fmtDate(n.date, today)})는 살펴보는 기간에서 뺐습니다. 아래 「날짜별 계산」에서 그 날짜를 넣어 확인합니다.`;
  }
}

export function crewLabel(c: Crew | undefined): string {
  if (!c) return '';
  return c.from || c.to ? '기간을 정해 쓰는 사람' : '지금 일하는 직원';
}

/** 날짜별 계산 근거 문장 */
export function basisLine(r: HeadcountResult): string {
  if (r.operatingDays === 0) return '그 전 1개월에 가동일이 없습니다. 문 여는 요일과 쉬는 날을 확인합니다.';
  if (r.basis === 'rule2-1') return `평균은 5명 미만이지만 5명 미만인 날(${r.belowDays}일)이 가동일(${r.operatingDays}일)의 절반 미만이라 5인 이상으로 봅니다(제2항 제1호).`;
  if (r.basis === 'rule2-2') return `평균은 5명 이상이지만 5명 미만인 날(${r.belowDays}일)이 가동일(${r.operatingDays}일)의 절반 이상이라 5인 이상으로 보지 않습니다(제2항 제2호).`;
  return `평균 ${avg(r.average)}명이고 5명 미만인 날이 가동일의 ${r.covered ? '절반 미만' : '절반 이상'}입니다(시행령 제7조의2 제1항·제2항).`;
}

/** 시험용 — 이 답으로 화면에 나갈 수 있는 문장 전부 */
export function allCopy(a: PlanAnswer, plan: Plan, today: string): string[] {
  const inspect = a.five.kind === 'spans' && a.five.spans[0].start !== 'open' ? a.five.spans[0].start.why : null;
  return [
    ...headline(a, today),
    ...whyLines(a, today),
    ...leaveLines(a, today),
    tenLine(a, today) ?? '',
    ...a.notes.map((n) => noteLine(n, plan, today)),
    ...plan.crews.map(crewLabel),
    ...CHANGES.map((c) => `${c.title} ${c.basis}`),
    inspect ? basisLine(inspect) : '',
  ].filter(Boolean);
}
