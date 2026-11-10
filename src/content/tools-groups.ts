// /tools 목록의 상황 묶음과 한 줄 요약. 등록부(tools-registry.ts)의 짝이다.
// 등록부의 desc 는 검색엔진·상세 설명용으로 그대로 두고, 목록에는 여기 summary 를 쓴다.
// 도구를 등록부에 더하면 여기에도 한 줄을 더한다. 빠뜨리면 tests/unit/tools-groups.test.ts 가 막는다.

import { TOOLS, type ToolEntry } from './tools-registry';

export type ToolGroupId = 'hire' | 'pay' | 'leave' | 'exit' | 'insurance' | 'docs';

export const TOOL_GROUPS: { id: ToolGroupId; label: string; hint: string }[] = [
  { id: 'hire', label: '채용·계약', hint: '사람을 쓰기 전과 계약서를 쓸 때' },
  { id: 'pay', label: '매달 급여', hint: '월급·시급을 정하고 명세서를 맞출 때' },
  { id: 'leave', label: '휴가·휴일', hint: '연차와 공휴일 근무를 셀 때' },
  { id: 'exit', label: '퇴사·정산', hint: '그만둔 사람에게 줄 돈을 셀 때' },
  { id: 'insurance', label: '4대보험·신고', hint: '공단에 낼 서류와 연락처' },
  { id: 'docs', label: '문서·규정', hint: '한글 문서와 사내 규정' },
];

/** 목록에서 도구를 구분하는 그림. 화면 쪽에서 lucide 아이콘으로 바꾼다 */
export type ToolGlyph =
  | 'building' | 'users' | 'file-search' | 'file-pen' | 'scale'
  | 'gauge' | 'calendar-days' | 'wallet' | 'receipt-text' | 'calendar-range' | 'list-checks' | 'receipt' | 'pause'
  | 'calendar-check' | 'bell' | 'percent' | 'sun' | 'coins'
  | 'piggy-bank' | 'landmark' | 'spreadsheet' | 'mail-warning' | 'arrows' | 'timer'
  | 'phone' | 'clipboard'
  | 'file-text' | 'file-pen-line' | 'book' | 'files' | 'network';

export interface ToolIndexEntry {
  group: ToolGroupId;
  summary: string;
  glyph: ToolGlyph;
}

export const TOOL_INDEX: Record<string, ToolIndexEntry> = {
  '/duties': { group: 'hire', glyph: 'building', summary: '직원 수에 따라 지켜야 할 의무와 교육' },
  '/tools/headcount': { group: 'hire', glyph: 'users', summary: '언제부터 5인 이상 사업장인지' },
  '/tools/contract-check': { group: 'hire', glyph: 'file-search', summary: '계약서 25개 항목을 하나씩 확인' },
  '/tools/contract-write': { group: 'hire', glyph: 'file-pen', summary: '임금 구성을 나눠 계약서 파일로 받기' },
  '/tools/contractor-check': { group: 'hire', glyph: 'scale', summary: '3.3% 계약인데 실제로는 근로자인지' },

  '/tools/min-wage': { group: 'pay', glyph: 'gauge', summary: '월급·시급이 최저임금을 넘는지' },
  '/tools/weekly-holiday-pay': { group: 'pay', glyph: 'calendar-days', summary: '시급과 주 근무시간으로 주휴수당' },
  '/tools/take-home-pay': { group: 'pay', glyph: 'wallet', summary: '4대보험과 세금을 뺀 한 달 실수령액' },
  '/tools/pay-check': { group: 'pay', glyph: 'receipt-text', summary: '명세서 금액을 회사 기준과 맞춰 보기' },
  '/tools/pay-proration': { group: 'pay', glyph: 'calendar-range', summary: '중간 입사·퇴사·결근한 달의 월급' },
  '/tools/ordinary-wage-check': { group: 'pay', glyph: 'list-checks', summary: '수당·상여금이 통상임금에 드는지' },
  '/tools/daily-worker-tax': { group: 'pay', glyph: 'receipt', summary: '일용직 일당에서 뗄 세금' },
  '/tools/shutdown-allowance': { group: 'pay', glyph: 'pause', summary: '회사 사정으로 쉰 기간의 휴업수당' },

  '/tools/leave': { group: 'leave', glyph: 'calendar-check', summary: '입사일로 연차가 며칠 생기는지' },
  '/tools/leave/advanced': { group: 'leave', glyph: 'bell', summary: '연차 사용촉진 날짜를 기록과 맞춰 보기' },
  '/tools/attendance-rate': { group: 'leave', glyph: 'percent', summary: '연차가 생기는 출근율 80%를 채웠는지' },
  '/tools/holiday-pay': { group: 'leave', glyph: 'sun', summary: '공휴일·노동절에 일하면 더 줄 돈' },
  '/tools/leave-pay': { group: 'leave', glyph: 'coins', summary: '쓰지 못한 연차를 돈으로 받을 때' },

  '/tools/severance.html': { group: 'exit', glyph: 'piggy-bank', summary: '평균임금과 재직일수로 퇴직금' },
  '/tools/retirement-tax': { group: 'exit', glyph: 'landmark', summary: '퇴직금에서 뗄 퇴직소득세' },
  '/tools/midyear-settlement': { group: 'exit', glyph: 'spreadsheet', summary: '퇴사한 해 소득세를 돌려받거나 더 낼 돈' },
  '/tools/notice-pay': { group: 'exit', glyph: 'mail-warning', summary: '미리 알리지 않고 해고했을 때 줄 돈' },
  '/tools/leave/settlement': { group: 'exit', glyph: 'arrows', summary: '퇴사할 때 회계연도 연차를 다시 맞추기' },
  '/tools/wage-delay-interest': { group: 'exit', glyph: 'timer', summary: '늦게 준 임금·퇴직금의 연 20% 이자' },

  '/tools/branch-directory': { group: 'insurance', glyph: 'phone', summary: '관할 공단 지사와 담당 전화번호' },
  '/tools/nhis-report-form': { group: 'insurance', glyph: 'clipboard', summary: '늦은 건강보험 취득·상실 신고서 PDF' },

  '/tools/hwp': { group: 'docs', glyph: 'file-text', summary: '한글 파일을 열어 글자를 찾아 바꾸기' },
  '/hwp-editor': { group: 'docs', glyph: 'file-pen-line', summary: '한글 문서를 쪽 모양 그대로 고치기' },
  '/tools/work-rules': { group: 'docs', glyph: 'book', summary: '취업규칙에서 법령 개정 항목 찾기' },
  '/tools/rules-review': { group: 'docs', glyph: 'files', summary: '규정 묶음끼리 인용·조문 번호 맞추기' },
  '/tools/council-graph': { group: 'docs', glyph: 'network', summary: '노사협의회 회의록·이행·고충을 그래프로' },
};

/** 홈 첫 화면 「상황별 도구」 — 묶음마다 먼저 찾는 도구 2~3개와 짧은 이름 */
export const HOME_PICKS: Record<ToolGroupId, { href: string; label: string }[]> = {
  hire: [
    { href: '/tools/contract-write', label: '근로계약서 작성' },
    { href: '/tools/contract-check', label: '근로계약서 점검' },
    { href: '/tools/headcount', label: '상시 근로자 수' },
  ],
  pay: [
    { href: '/tools/min-wage', label: '최저임금 확인' },
    { href: '/tools/weekly-holiday-pay', label: '주휴수당' },
    { href: '/tools/take-home-pay', label: '실수령액' },
  ],
  leave: [
    { href: '/tools/leave', label: '연차휴가' },
    { href: '/tools/holiday-pay', label: '공휴일 수당' },
    { href: '/tools/leave-pay', label: '연차수당' },
  ],
  exit: [
    { href: '/tools/severance.html', label: '퇴직금' },
    { href: '/tools/retirement-tax', label: '퇴직소득세' },
    { href: '/tools/notice-pay', label: '해고예고수당' },
  ],
  insurance: [
    { href: '/tools/branch-directory', label: '관할 지사 번호' },
    { href: '/tools/nhis-report-form', label: '건강보험 신고서' },
  ],
  docs: [
    { href: '/hwp-editor', label: '한글 문서 편집' },
    { href: '/tools/work-rules', label: '취업규칙 점검' },
    { href: '/tools/rules-review', label: '규정 정비 점검' },
  ],
};

export type IndexedTool = ToolEntry & ToolIndexEntry;

function indexed(): IndexedTool[] {
  return TOOLS.filter((t) => TOOL_INDEX[t.href]).map((t) => ({ ...t, ...TOOL_INDEX[t.href] }));
}

export function groupedTools(list: IndexedTool[] = indexed()) {
  return TOOL_GROUPS.map((g) => ({ ...g, tools: list.filter((t) => t.group === g.id) }));
}

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 제목·요약·설명 부분일치. 띄어쓰기는 무시한다(「주휴 수당」 = 「주휴수당」) */
export function searchTools(query: string): IndexedTool[] {
  const q = squash(query);
  const all = indexed();
  if (!q) return all;
  return all.filter((t) => squash(`${t.title} ${t.summary} ${t.desc}`).includes(q));
}
