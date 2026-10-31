// 근로계약서 점검 오프라인판 자기시험.
// 산출 HTML(실제로 나가는 바이트)을 ①정적 스캔해 외부 요청 경로·금지어가 0건인지 보고
// ②인라인 스크립트를 node:vm 에서 그대로 실행해 합성 4케이스 findings 가 엔진·정답지와 같은지 대조한다.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding } from '@/lib/contract-check/types';

import { build } from '../../scripts/build-contract-check-offline.mjs';

interface OfflineResult {
  contract_id: string;
  findings: Finding[];
  amendments: Record<string, string>;
}

let dir = '';
let html = '';
let script = '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cc-offline-'));
  ({ html } = (await build(join(dir, 'contract-check.html'))) as { html: string });
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  expect(scripts).toHaveLength(1);
  script = scripts[0][1];
}, 120_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('오프라인판 산출 HTML — 외부 요청 경로 0', () => {
  const NETWORK_PATTERNS: Array<[string, RegExp]> = [
    ['외부 script src', /<script[^>]+src=/i],
    ['외부 link href', /<link[^>]+href=/i],
    ['img/iframe src', /<(img|iframe|source|video|audio)[^>]+src=/i],
    ['fetch(', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/],
    ['WebSocket', /WebSocket/],
    ['EventSource', /EventSource/],
    ['동적 import(', /\bimport\s*\(/],
    ['CSS @import·url(', /@import|url\s*\(/i],
    ['googletagmanager', /googletagmanager|google-analytics|gtag\(/i],
    ['http(s) 주소', /https?:\/\//i],
    ['프로토콜 상대 주소', /["'(]\/\/[a-z0-9]/i],
  ];
  for (const [label, re] of NETWORK_PATTERNS) {
    it(`${label} 0건`, () => {
      expect(html.match(new RegExp(re.source, re.flags + 'g')) ?? []).toEqual([]);
    });
  }

  it('CSP 가 default-src none 으로 바깥 연결을 막는다', () => {
    expect(html).toMatch(/Content-Security-Policy" content="default-src 'none';/);
  });

  it('규칙 카탈로그의 내부 설명(logic·description)은 싣지 않는다', () => {
    expect(html).not.toContain('"logic"');
    expect(html).not.toMatch(/logic:/);
    expect(html).toContain('최저임금 충족'); // 규칙 이름은 실린다(원문 UTF-8 그대로)
  });
});

describe('오프라인판 산출 HTML — 화면 금지어 0', () => {
  for (const word of ['노무사', '상담', '진단', '판정', '지도', '대리', '자문']) {
    it(`「${word}」 0건`, () => {
      expect(html.split(word).length - 1).toBe(0);
    });
  }
});

describe('오프라인판 산출 HTML — 합성 4케이스 findings 패리티', () => {
  function runBundle(input: unknown): OfflineResult[] {
    const sandbox: Record<string, unknown> = {};
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    const api = sandbox.__contractCheckOffline as { check: (x: unknown) => OfflineResult[] };
    expect(api, '번들이 __contractCheckOffline 을 내보내지 않음').toBeDefined();
    return JSON.parse(JSON.stringify(api.check(input))) as OfflineResult[];
  }

  const engineCases = normalize(casesJson as unknown as Contract[]);

  it('번들 결과 == 소스 엔진 결과(4케이스, 순서·문구까지)', () => {
    const bundled = runBundle(casesJson);
    expect(bundled).toHaveLength(4);
    for (let i = 0; i < engineCases.length; i++) {
      expect(bundled[i].contract_id).toBe(engineCases[i].contract_id);
      expect(bundled[i].findings).toEqual(checkContract(engineCases[i]));
    }
  });

  it('번들 결과가 정답지(expected_findings rule_code·status)와 일치', () => {
    const bundled = runBundle(casesJson);
    for (let i = 0; i < engineCases.length; i++) {
      const byCode = new Map(bundled[i].findings.map((f) => [f.rule_code, f]));
      for (const exp of engineCases[i].expected_findings ?? []) {
        expect(byCode.get(exp.rule_code)?.status, `${engineCases[i].contract_id} ${exp.rule_code}`).toBe(
          exp.status,
        );
      }
    }
  });

  it('단일 계약 객체 붙여넣기도 받는다', () => {
    const one = runBundle((casesJson as unknown[])[0]);
    expect(one).toHaveLength(1);
    expect(one[0].findings).toEqual(checkContract(engineCases[0]));
  });
});
