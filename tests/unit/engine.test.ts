// 룰엔진 골든테스트 — synthetic_edge_cases.json 4케이스의 기대 findings와
// checkContract 출력 대조 + 카탈로그 auto 규칙 수 == 엔진 구현 규칙 수 검증.

import { describe, expect, it } from 'vitest';

import rulesJson from '@/lib/contract-check/data/compliance_rules.json';
import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding } from '@/lib/contract-check/types';

const cases = normalize(casesJson as unknown as Contract[]);

const AUTO_CODES = new Set(
  (rulesJson.rules as Array<{ code: string; auto: boolean }>)
    .filter((r) => r.auto)
    .map((r) => r.code),
);

describe('checkContract — synthetic_edge_cases 골든테스트', () => {
  it('픽스처가 4케이스이고 각 케이스에 기대 findings가 있다', () => {
    expect(cases).toHaveLength(4);
    for (const c of cases) {
      expect(c.expected_findings?.length ?? 0).toBeGreaterThan(0);
    }
  });

  for (const contract of cases) {
    it(`${contract.contract_id}: 기대 findings(rule_code·status) 일치`, () => {
      const findings = checkContract(contract);
      const byCode = new Map<string, Finding>(findings.map((f) => [f.rule_code, f]));

      for (const expected of contract.expected_findings ?? []) {
        const actual = byCode.get(expected.rule_code);
        expect(actual, `규칙 ${expected.rule_code}의 Finding이 출력에 없음`).toBeDefined();
        expect(
          { rule_code: expected.rule_code, status: actual!.status },
          `규칙 ${expected.rule_code} 판정 불일치`,
        ).toEqual({ rule_code: expected.rule_code, status: expected.status });
      }
    });
  }
});

describe('규칙 카탈로그 ↔ 엔진 구현 정합', () => {
  it('엔진이 구현한 규칙 수 == 카탈로그 auto 규칙 수', () => {
    // 모든 규칙 함수는 계약 1건당 정확히 Finding 1개를 내므로,
    // 출력의 rule_code 집합 == 엔진 구현 규칙 집합.
    const implemented = new Set(checkContract(cases[0]).map((f) => f.rule_code));
    expect([...implemented].sort()).toEqual([...AUTO_CODES].sort());
    expect(implemented.size).toBe(AUTO_CODES.size);
  });

  it('각 계약당 규칙별 Finding이 정확히 1개씩 나온다', () => {
    for (const contract of cases) {
      const codes = checkContract(contract).map((f) => f.rule_code);
      expect(codes.length, `${contract.contract_id} 중복/누락`).toBe(new Set(codes).size);
      expect(codes.length).toBe(AUTO_CODES.size);
    }
  });
});
