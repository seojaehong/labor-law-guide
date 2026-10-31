// present.ts — 사이트(ContractCheckClient)와 오프라인판이 함께 쓰는 표시 방식.
// 사이트에서 옮겨 오기 전 인라인 구현과 출력이 같은지(사이트 화면 불변)와, 화면에 나가는 고정 문구가
// 금지어 정본(banned.ts)을 지키는지 본다. tool-banned-words.test.ts 는 .ts/.tsx 만 훑어 JSON 규칙 이름을 못 본다.

import { describe, expect, it } from 'vitest';

import rulesCatalog from '@/lib/contract-check/data/compliance_rules.json';
import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { AMEND_LIBRARY, amendContract } from '@/lib/contract-check/amendments';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import {
  NEEDS_DATA_PREFIX,
  RESULT_DISCLAIMER,
  STATUS_CHIP_ORDER,
  STATUS_LABEL,
  amendmentMap,
  countByStatus,
  detailText,
  ruleName,
  sortFindings,
} from '@/lib/contract-check/present';
import type { Contract, Finding, FindingSeverity, FindingStatus } from '@/lib/contract-check/types';
import { bannedHits } from '@/lib/tool-kit/banned';

/** 옮기기 전 ContractCheckClient.tsx runCheck 의 정렬 그대로 */
function legacySort(fs: Finding[]): Finding[] {
  const SO: FindingStatus[] = ['violation', 'risk', 'needs_data', 'ok'];
  const VO: FindingSeverity[] = ['critical', 'major', 'minor', 'info'];
  return [...fs].sort(
    (a, b) =>
      SO.indexOf(a.status) - SO.indexOf(b.status) ||
      VO.indexOf(a.severity) - VO.indexOf(b.severity) ||
      a.rule_code.localeCompare(b.rule_code),
  );
}

const cases = normalize(casesJson as unknown as Contract[]);

describe('present.ts — 사이트 인라인 구현과 같은 출력', () => {
  it('정렬·수정 방향 맵·집계가 종전 인라인 구현과 같다(합성 4건)', () => {
    for (const c of cases) {
      const fs = checkContract(c);
      const sorted = sortFindings(fs);
      expect(sorted).toEqual(legacySort(fs));
      expect(amendmentMap(c, sorted)).toEqual(
        Object.fromEntries(amendContract(c, sorted).rows.map((r) => [r.rule_code, r.amendment])),
      );
      const legacyCounts = fs.reduce(
        (acc, f) => ((acc[f.status] += 1), acc),
        { violation: 0, risk: 0, ok: 0, needs_data: 0 } as Record<FindingStatus, number>,
      );
      expect(countByStatus(fs)).toEqual(legacyCounts);
    }
  });

  it('상태 이름·칩 순서·자료 필요 접두어', () => {
    expect(STATUS_LABEL).toEqual({ violation: '위반', risk: '리스크', ok: '적정', needs_data: '자료 필요' });
    expect(STATUS_CHIP_ORDER).toEqual(['violation', 'risk', 'ok', 'needs_data']);
    const f = (status: FindingStatus, detail: string | null): Finding => ({
      rule_code: 'X',
      severity: 'minor',
      status,
      statute: null,
      detail,
    });
    expect(detailText(f('needs_data', '미기재'))).toBe(`${NEEDS_DATA_PREFIX}미기재`);
    expect(NEEDS_DATA_PREFIX).toBe('입력하면 점검합니다 — ');
    expect(detailText(f('ok', '문제 없음'))).toBe('문제 없음');
    expect(detailText(f('ok', null))).toBeNull();
  });

  it('규칙 이름 — 카탈로그 이름, 없으면 코드', () => {
    expect(ruleName('MINWAGE')).toBe('최저임금 충족');
    expect(ruleName('NO-SUCH')).toBe('NO-SUCH');
  });

  it('면책 문구 = 사이트 JSX 문장(줄바꿈은 공백 하나로 렌더)', () => {
    expect(RESULT_DISCLAIMER).toBe(
      '본 결과는 입력하신 내용만으로 점검한 참고 결과이며 법률 판단이 아닙니다. 실제 계약서 문안과 근무 실태에 따라 결과가 달라질 수 있으니, 근거 조문과 함께 다시 확인해 주세요.',
    );
  });
});

describe('화면 고정 문구 — 금지어 정본(banned.ts)', () => {
  it('규칙 카탈로그 이름 전부(사이트·오프라인판 화면에 나온다)', () => {
    const hits = rulesCatalog.rules.flatMap((r) => bannedHits(r.name).map((w) => `${r.code} ${r.name}: ${w}`));
    expect(hits).toEqual([]);
  });
  it('수정 방향 문구 표·면책 문구', () => {
    expect(Object.entries(AMEND_LIBRARY).flatMap(([k, t]) => bannedHits(t).map((w) => `${k}: ${w}`))).toEqual([]);
    expect(bannedHits(RESULT_DISCLAIMER)).toEqual([]);
  });
});
