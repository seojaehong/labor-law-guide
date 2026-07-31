// 규칙엔진 공통 — 규칙 1개 = 함수 1개.
// code·severity·statute 메타는 data/compliance_rules.json 카탈로그에서 로드하고,
// 각 규칙 함수는 정규화된 계약 객체를 받아 Finding을 반환한다.

import rulesJson from '@/data/compliance_rules.json';
import type { Contract, Finding, FindingSeverity, FindingStatus } from '../types';

export interface RuleMeta {
  code: string;
  name: string;
  statute: string;
  severity: FindingSeverity;
  auto: boolean;
  logic: string;
}

export const CATALOG: Record<string, RuleMeta> = Object.fromEntries(
  (rulesJson.rules as RuleMeta[]).map((r) => [r.code, r]),
);

export type RuleFn = (contract: Contract) => Finding;

/** 카탈로그의 severity·statute를 붙여 Finding을 만든다.
 * severity는 케이스별 하향 조정이 필요할 때만 지정 (예: MINWAGE-PROBATION 문구 잔존 → minor). */
export function makeFinding(
  code: string,
  status: FindingStatus,
  detail: string,
  severity?: FindingSeverity,
): Finding {
  const meta = CATALOG[code];
  if (!meta) throw new Error(`카탈로그에 없는 규칙 코드: ${code}`);
  return {
    rule_code: code,
    severity: severity ?? meta.severity,
    status,
    statute: meta.statute,
    detail,
  };
}
