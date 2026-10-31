// 근로계약서 점검 — 오프라인 단독판 진입점.
//
// scripts/build-contract-check-offline.mjs 가 이 파일을 IIFE 로 묶어 HTML 1장에 인라인한다.
// 규칙 코어(src/lib/contract-check/**)를 그대로 쓰고, 화면은 React 없이 순수 DOM 으로 그린다.
// ★ 이 파일과 그 의존에는 네트워크 호출(fetch·XMLHttpRequest·sendBeacon·WebSocket·동적 import)이
//   없어야 한다. tests/unit/contract-check-offline.test.ts 가 산출 HTML 을 정적 스캔해 확인한다.
// ★ 화면 문구는 점검·대조·확인·기준·알림만 쓴다(금지어 7종은 같은 시험이 산출물 전체에서 센다).

import rulesCatalog from '@/lib/contract-check/data/compliance_rules.json';
import samples from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { amendContract } from '@/lib/contract-check/amendments';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, FindingSeverity, FindingStatus } from '@/lib/contract-check/types';

export interface OfflineResult {
  contract_id: string;
  /** checkContract 출력 그대로(엔진 순서) */
  findings: Finding[];
  /** rule_code → 수정 방향 문구 */
  amendments: Record<string, string>;
}

/** 붙여넣은 JSON(단일 계약·계약 배열·fixtures 형식) → 계약별 점검 결과. */
export function check(input: unknown): OfflineResult[] {
  return normalize(input).map((contract: Contract) => {
    const findings = checkContract(contract);
    const amendments = Object.fromEntries(
      amendContract(contract, findings).rows.map((r) => [r.rule_code, r.amendment]),
    );
    return { contract_id: contract.contract_id, findings, amendments };
  });
}

// ── 화면 ────────────────────────────────────────────────────────────

const RULE_NAME: Record<string, string> = Object.fromEntries(
  (rulesCatalog.rules as Array<{ code: string; name: string }>).map((r) => [r.code, r.name]),
);

const STATUS_LABEL: Record<FindingStatus, string> = {
  violation: '위반',
  risk: '리스크',
  ok: '적정',
  needs_data: '자료 필요',
};
const STATUS_ORDER: FindingStatus[] = ['violation', 'risk', 'needs_data', 'ok'];
const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'major', 'minor', 'info'];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.rule_code.localeCompare(b.rule_code),
  );
}

function renderResult(result: OfflineResult): HTMLElement {
  const section = el('section', 'result');
  section.appendChild(el('h3', '', `계약 ${result.contract_id || '(번호 없음)'}`));

  const chips = el('div', 'chips');
  for (const status of ['violation', 'risk', 'ok', 'needs_data'] as FindingStatus[]) {
    const n = result.findings.filter((f) => f.status === status).length;
    chips.appendChild(el('span', `badge s-${status}`, `${STATUS_LABEL[status]} ${n}`));
  }
  section.appendChild(chips);

  const list = el('ul', 'findings');
  for (const f of sortFindings(result.findings)) {
    const li = el('li', 'finding');
    const head = el('div', 'head');
    head.appendChild(el('span', `badge s-${f.status}`, STATUS_LABEL[f.status]));
    head.appendChild(el('strong', '', RULE_NAME[f.rule_code] ?? f.rule_code));
    if (f.statute) head.appendChild(el('span', 'statute', f.statute));
    li.appendChild(head);
    if (f.detail) {
      li.appendChild(
        el('p', 'detail', f.status === 'needs_data' ? `입력하면 점검합니다 — ${f.detail}` : f.detail),
      );
    }
    const amend = result.amendments[f.rule_code];
    if (amend) {
      const p = el('p', 'amend');
      p.appendChild(el('strong', '', '수정 방향: '));
      p.appendChild(document.createTextNode(amend));
      li.appendChild(p);
    }
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function mount(): void {
  const input = document.getElementById('cc-input') as HTMLTextAreaElement | null;
  const runBtn = document.getElementById('cc-run');
  const sampleBtn = document.getElementById('cc-sample');
  const out = document.getElementById('cc-out');
  const err = document.getElementById('cc-error');
  if (!input || !runBtn || !sampleBtn || !out || !err) return;

  const run = () => {
    err.textContent = '';
    out.replaceChildren();
    let data: unknown;
    try {
      data = JSON.parse(input.value);
    } catch {
      err.textContent = 'JSON 형식을 읽지 못했습니다. 괄호와 따옴표를 확인해 주세요.';
      return;
    }
    try {
      for (const r of check(data)) out.appendChild(renderResult(r));
    } catch (e) {
      err.textContent = `점검 중 오류가 났습니다: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  sampleBtn.addEventListener('click', () => {
    // 정답지(expected_findings)는 시험용 칸이라 예시 입력에서 뺀다
    const plain = (samples as Array<Record<string, unknown>>).map(
      ({ expected_findings: _omit, ...rest }) => rest, // eslint-disable-line @typescript-eslint/no-unused-vars
    );
    input.value = JSON.stringify(plain, null, 2);
    run();
  });
  runBtn.addEventListener('click', run);
}

(globalThis as unknown as { __contractCheckOffline: { check: typeof check } }).__contractCheckOffline = {
  check,
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
