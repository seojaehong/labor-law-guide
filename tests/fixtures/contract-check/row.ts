// 골든 한 줄 형식 — 규칙 코드 | 이름 | 근거 조문 | 상태 | 심각도 | 설명.
// 이름·조문도 화면에 그대로 나가므로 골든에 넣는다(261101 — 카탈로그 조문이 바뀌어도 골든이 못 잡던 구멍).
import { ruleName } from '@/lib/contract-check/present';

export const goldenRow = (f: {
  rule_code: string;
  statute: string | null;
  status: string;
  severity: string;
  detail: string | null;
}) => `${f.rule_code} | ${ruleName(f.rule_code)} | ${f.statute} | ${f.status} | ${f.severity} | ${f.detail}`;
