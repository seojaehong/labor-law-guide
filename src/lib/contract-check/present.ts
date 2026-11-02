// 점검 결과를 화면에 내는 방식 — 사이트(ContractCheckClient.tsx)와 오프라인판(src/offline/contract-check/entry.ts)이
// 함께 쓴다. 상태 이름·정렬·규칙 이름·수정 방향 맵·「자료 필요」 접두어·면책 문구를 한 곳에 둬서 두 화면이 갈리지 않게 한다.
// 색(STATUS_STYLE)은 사이트 CSS 변수라 여기 두지 않는다.

import rulesCatalog from './data/compliance_rules.json';
import { amendContract } from './amendments';
import type { Contract, Finding, FindingSeverity, FindingStatus } from './types';

export const STATUS_LABEL: Record<FindingStatus, string> = {
  violation: '위반',
  risk: '리스크',
  ok: '적정',
  needs_data: '자료 필요',
};

/** 항목 정렬 순서(위반 → 리스크 → 자료 필요 → 적정) */
export const STATUS_ORDER: FindingStatus[] = ['violation', 'risk', 'needs_data', 'ok'];
/** 집계 칩 순서 */
export const STATUS_CHIP_ORDER: FindingStatus[] = ['violation', 'risk', 'ok', 'needs_data'];
export const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'major', 'minor', 'info'];

export const NEEDS_DATA_PREFIX = '입력하면 점검합니다 — ';

/** 결과 화면 아래 면책 문구 — 사이트와 오프라인판이 같은 문장을 쓴다 */
export const RESULT_DISCLAIMER =
  '본 결과는 입력하신 내용만으로 점검한 참고 결과이며 법률 판단이 아닙니다. 실제 계약서 문안과 근무 실태에 따라 결과가 달라질 수 있으니, 근거 조문과 함께 다시 확인해 주세요.';

const RULE_NAME: Record<string, string> = Object.fromEntries(
  (rulesCatalog.rules as Array<{ code: string; name: string }>).map((r) => [r.code, r.name]),
);

/** 규칙 이름(카탈로그) — 없으면 코드 그대로 */
export function ruleName(code: string): string {
  return RULE_NAME[code] ?? code;
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.rule_code.localeCompare(b.rule_code),
  );
}

/** rule_code → 수정 방향 문구 */
export function amendmentMap(contract: Contract, findings: Finding[]): Record<string, string> {
  return Object.fromEntries(amendContract(contract, findings).rows.map((r) => [r.rule_code, r.amendment]));
}

export function countByStatus(findings: Finding[]): Record<FindingStatus, number> {
  const acc: Record<FindingStatus, number> = { violation: 0, risk: 0, ok: 0, needs_data: 0 };
  for (const f of findings) acc[f.status] += 1;
  return acc;
}

/** 항목 설명 줄 — 「자료 필요」는 접두어를 붙인다. detail 이 없으면 null */
export function detailText(f: Finding): string | null {
  if (!f.detail) return null;
  return f.status === 'needs_data' ? `${NEEDS_DATA_PREFIX}${f.detail}` : f.detail;
}
