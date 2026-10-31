// 근로계약서 점검 — 오프라인 단독판 진입점.
//
// scripts/build-contract-check-offline.mjs 가 이 파일을 IIFE(전역 이름 ContractCheckOfflineBundle)로 묶어
// HTML 1장에 인라인한다. 규칙 코어(src/lib/contract-check/**)와 화면 표시 방식(present.ts)은 사이트와 같은 것을 쓰고,
// 화면은 React 없이 순수 DOM 으로 그린다.
// ★ 이 파일과 그 의존에는 네트워크 호출(fetch·XMLHttpRequest·sendBeacon·WebSocket·동적 import)이
//   없어야 한다. tests/unit/contract-check-offline.test.ts 가 산출 HTML 을 정적 스캔해 확인한다.
// ★ 화면 문구 금지어 정본은 src/lib/tool-kit/banned.ts — 같은 시험이 산출 HTML 전체에 bannedHits() 를 돌린다.

import samples from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import {
  RESULT_DISCLAIMER,
  STATUS_CHIP_ORDER,
  STATUS_LABEL,
  amendmentMap,
  countByStatus,
  detailText,
  ruleName,
  sortFindings,
} from '@/lib/contract-check/present';
import { MINWAGE_TABLE } from '@/lib/contract-check/rules/wage';
import type { Contract, Finding } from '@/lib/contract-check/types';

import { blankTemplate, validateInput } from './validate';

export { validateInput, blankTemplate };

/** 빌드 시점 고정값 — 빌드 스크립트가 vite define 으로 넣는다 */
declare const __CC_BUILD__: { date: string; sha: string; catalogVersion: string };

export interface OfflineResult {
  contract_id: string;
  /** checkContract 출력 그대로(엔진 순서) */
  findings: Finding[];
  /** rule_code → 수정 방향 문구 */
  amendments: Record<string, string>;
  /** 계약 시작 연도가 이 파일의 최저시급 표에 없으면 그 연도, 아니면 null */
  minwage_year_missing: string | null;
}

const MINWAGE_YEARS = Object.keys(MINWAGE_TABLE).sort();
/** 이 파일에 든 최저시급 연도 범위(예: 2024~2026) */
export const MINWAGE_RANGE = `${MINWAGE_YEARS[0]}~${MINWAGE_YEARS[MINWAGE_YEARS.length - 1]}`;

function missingMinwageYear(contract: Contract): string | null {
  const year = /^(\d{4})-/.exec(contract.period?.start_date ?? '')?.[1];
  return year && MINWAGE_TABLE[year] === undefined ? year : null;
}

/** 붙여넣은 JSON(단일 계약·계약 목록·fixtures 형식) → 계약별 점검 결과. 모양 검사는 validateInput 이 먼저 한다 */
export function check(input: unknown): OfflineResult[] {
  return normalize(input).map((contract: Contract) => {
    const findings = checkContract(contract);
    return {
      contract_id: contract.contract_id,
      findings,
      amendments: amendmentMap(contract, findings),
      minwage_year_missing: missingMinwageYear(contract),
    };
  });
}

/** 화면에 쓰는 설명 줄. 최저시급 표에 없는 연도면 「입력하면 점검합니다」 대신 새 판 안내를 낸다 */
export function detailFor(result: OfflineResult, f: Finding): string | null {
  if (f.rule_code === 'MINWAGE' && f.status === 'needs_data' && result.minwage_year_missing) {
    return `이 파일에는 ${result.minwage_year_missing}년 최저시급이 들어 있지 않습니다(수록: ${MINWAGE_RANGE}). 새 판을 받으세요.`;
  }
  return detailText(f);
}

/** 바닥줄 — 빌드 날짜·커밋·규칙 카탈로그 버전·최저시급 수록 연도 */
export function buildLine(): string {
  const b = typeof __CC_BUILD__ === 'undefined' ? { date: '-', sha: '-', catalogVersion: '-' } : __CC_BUILD__;
  return `빌드 ${b.date} · 커밋 ${b.sha} · 규칙 카탈로그 ${b.catalogVersion} · 최저시급 수록 ${MINWAGE_RANGE}`;
}

// ── 화면 ────────────────────────────────────────────────────────────

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

function renderResult(result: OfflineResult): HTMLElement {
  const section = el('section', 'result');
  section.appendChild(el('h3', '', `계약 ${result.contract_id || '(번호 없음)'}`));

  const counts = countByStatus(result.findings);
  const chips = el('div', 'chips');
  for (const status of STATUS_CHIP_ORDER) {
    chips.appendChild(el('span', `badge s-${status}`, `${STATUS_LABEL[status]} ${counts[status]}`));
  }
  section.appendChild(chips);

  const list = el('ul', 'findings');
  for (const f of sortFindings(result.findings)) {
    const li = el('li', 'finding');
    const head = el('div', 'head');
    head.appendChild(el('span', `badge s-${f.status}`, STATUS_LABEL[f.status]));
    head.appendChild(el('strong', '', ruleName(f.rule_code)));
    if (f.statute) head.appendChild(el('span', 'statute', f.statute));
    li.appendChild(head);
    const detail = detailFor(result, f);
    if (detail) li.appendChild(el('p', 'detail', detail));
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
  const blankBtn = document.getElementById('cc-blank');
  const out = document.getElementById('cc-out');
  const err = document.getElementById('cc-error');
  const warn = document.getElementById('cc-warn');
  const disclaimer = document.getElementById('cc-disclaimer');
  const build = document.getElementById('cc-build');
  if (!input || !runBtn || !sampleBtn || !blankBtn || !out || !err || !warn) return;
  if (disclaimer) disclaimer.textContent = RESULT_DISCLAIMER;
  if (build) build.textContent = buildLine();

  const lines = (target: HTMLElement, xs: string[]) => {
    target.replaceChildren(...xs.map((x) => el('div', '', x)));
  };

  const run = () => {
    lines(err, []);
    lines(warn, []);
    out.replaceChildren();
    let data: unknown;
    try {
      data = JSON.parse(input.value);
    } catch {
      lines(err, ['JSON 형식을 읽지 못했습니다. 괄호와 따옴표를 확인해 주세요.']);
      return;
    }
    const v = validateInput(data);
    lines(warn, v.warnings);
    if (v.errors.length) {
      lines(err, ['점검하지 않았습니다. 아래 칸을 고쳐 주세요.', ...v.errors]);
      return;
    }
    try {
      for (const r of check(data)) out.appendChild(renderResult(r));
    } catch (e) {
      lines(err, [`점검 중 오류가 났습니다: ${e instanceof Error ? e.message : String(e)}`]);
    }
  };

  // 버튼이 넣은 내용인지 기억한다 — 사람이 붙여넣거나 고친 내용을 덮어쓰기 전에는 묻는다
  let lastInserted = '';
  const insert = (value: string, runAfter: boolean) => {
    const current = input.value.trim();
    if (current && input.value !== lastInserted && !window.confirm('입력한 내용을 지우고 바꿀까요?')) return;
    input.value = value;
    lastInserted = value;
    if (runAfter) run();
    else {
      lines(err, []);
      lines(warn, []);
      out.replaceChildren();
      input.focus();
    }
  };

  sampleBtn.addEventListener('click', () => insert(JSON.stringify(samples, null, 2), true));
  blankBtn.addEventListener('click', () => insert(JSON.stringify(blankTemplate(), null, 2), false));
  runBtn.addEventListener('click', run);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
