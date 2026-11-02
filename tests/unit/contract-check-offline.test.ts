// 근로계약서 점검 오프라인판 자기시험.
// 산출 HTML(실제로 나가는 바이트)을 ①정적 스캔해 외부 요청 경로·금지어·정답지·이스케이프가 0건인지 보고
// ②인라인 스크립트를 node:vm 에서 그대로 실행해 합성 4건 findings·수정 방향이 소스 엔진·기대값과 같은지,
// 붙여넣기 검사·빈 양식·연도 안내가 맞는지 대조한다.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { goldenRow } from '../fixtures/contract-check/row';
import expectedSnapshot from '../fixtures/contract-check/synthetic-findings.json';
import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import { amendmentMap } from '@/lib/contract-check/present';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { Contract, Finding } from '@/lib/contract-check/types';

import { DEFAULT_OUT, build, buildInfo, parseOut } from '../../scripts/build-contract-check-offline.mjs';

interface OfflineResult {
  contract_id: string;
  findings: Finding[];
  amendments: Record<string, string>;
  minwage_year_missing: string | null;
}
interface Api {
  check: (x: unknown) => OfflineResult[];
  validateInput: (x: unknown) => { errors: string[]; warnings: string[] };
  blankTemplate: () => Record<string, unknown>;
  detailFor: (r: OfflineResult, f: Finding) => string | null;
  buildLine: () => string;
}

const INFO = { date: '2026-10-31', sha: 'abc1234', catalogVersion: '1.0' };

let dir = '';
let html = '';
let script = '';
let sandbox: Record<string, unknown> = {};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cc-offline-'));
  ({ html } = (await build(join(dir, 'contract-check.html'), INFO)) as { html: string });
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  expect(scripts).toHaveLength(1);
  script = scripts[0][1];
  sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
}, 120_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const api = () => sandbox.ContractCheckOfflineBundle as Api;
/** vm 경계를 넘은 객체를 이 쪽 객체로 바꾼다(toEqual 프로토타입 비교 회피) */
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const runBundle = (input: unknown) => plain(api().check(input));

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
    ['프로토콜 상대 주소(따옴표·백틱·괄호 뒤)', /["'`(]\/\/[a-z0-9]/i],
  ];
  for (const [label, re] of NETWORK_PATTERNS) {
    it(`${label} 0건`, () => {
      expect(html.match(new RegExp(re.source, re.flags + 'g')) ?? []).toEqual([]);
    });
  }

  it('프로토콜 상대 주소 검사가 백틱 구분자를 실제로 잡는다(자기시험)', () => {
    const re = NETWORK_PATTERNS.at(-1)![1];
    expect(re.test('`//cdn.example.test/x.js`')).toBe(true);
    expect(re.test('"//cdn.example.test"')).toBe(true);
  });

  it('CSP — default-src none, base-uri none, form-action none, img-src 없음', () => {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp.startsWith("default-src 'none';")).toBe(true);
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain('img-src');
  });

  it('규칙 카탈로그의 내부 설명(logic·description)과 안 쓰는 auto 칸은 싣지 않는다', () => {
    expect(html).not.toContain('"logic"');
    expect(html).not.toMatch(/logic:/);
    expect(html).not.toMatch(/\bauto:!?[01]|"auto"/);
    expect(html).toContain('최저임금 충족'); // 규칙 이름은 실린다(원문 UTF-8 그대로)
    expect(html).toContain('수습 감액 기준 확인');
  });

  it('시험 정답지(expected_findings 데이터)는 산출물에 0회', () => {
    // 칸 이름은 엔진 코드(normalize.ts fixtures 병합)·붙여넣기 검사 표에 남는다. 정답지 「값」이 0 이어야 한다.
    expect(html.match(/"?expected_findings"?\s*:\s*\[/g) ?? []).toEqual([]);
    const answers = (casesJson as Array<{ expected_findings?: Array<{ detail: string }> }>).flatMap(
      (c) => c.expected_findings ?? [],
    );
    expect(answers.length).toBe(16);
    // 엔진 출력과 글자가 같은 정답(예: 「단시간 아님 — 비적용」)은 엔진 코드에 원래 있으니 뺀다
    const engineDetails = new Set(
      normalize(casesJson as unknown as Contract[]).flatMap((c) => checkContract(c).map((f) => f.detail)),
    );
    const answerOnly = answers.map((a) => a.detail).filter((d) => !engineDetails.has(d));
    expect(answerOnly.length).toBeGreaterThan(5);
    expect(answerOnly.filter((d) => html.includes(d))).toEqual([]);
  });

  it('\\uXXXX 이스케이프 0건 — 한글이 원문 그대로 실린다', () => {
    expect(html.match(/\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/g) ?? []).toEqual([]);
  });

  it('전역은 ContractCheckOfflineBundle 하나뿐(옛 __contractCheckOffline 없음)', () => {
    expect(html).not.toContain('__contractCheckOffline');
    expect(typeof api().check).toBe('function');
  });
});

describe('오프라인판 산출 HTML — 화면 금지어 0 (정본 banned.ts)', () => {
  it('bannedHits(산출 HTML 전체) == []', () => {
    expect(bannedHits(html)).toEqual([]);
  });
});

describe('빌드 시점 고정 표시', () => {
  it('바닥줄 = 빌드 날짜·커밋·카탈로그 버전·최저시급 수록 연도', () => {
    expect(api().buildLine()).toBe('빌드 2026-10-31 · 커밋 abc1234 · 규칙 카탈로그 1.0 · 최저시급 수록 2024~2026');
  });
  it('buildInfo() — KST 날짜·짧은 SHA·카탈로그 버전', () => {
    const info = buildInfo(new Date('2026-10-31T16:30:00Z')); // KST 11-01 01:30
    expect(info.date).toBe('2026-11-01');
    expect(info.sha).toMatch(/^([0-9a-f]{7,}|unknown)(\+수정)?$/);
    expect(info.catalogVersion).toBe('1.3');
  });
  it('--out 인자: 없으면 기본 경로, 값이 빠지면 오류', () => {
    expect(parseOut([])).toBe(DEFAULT_OUT);
    expect(() => parseOut(['--out'])).toThrow(/--out 뒤에/);
    expect(() => parseOut(['--out', '--other'])).toThrow(/--out 뒤에/);
    expect(parseOut(['--out', 'x.html']).endsWith('x.html')).toBe(true);
  });
});

describe('오프라인판 — 합성 4건 findings·수정 방향 패리티', () => {
  const engineCases = normalize(casesJson as unknown as Contract[]);

  it('번들 결과 == 소스 엔진 결과(4건, 순서·문구까지)', () => {
    const bundled = runBundle(casesJson);
    expect(bundled).toHaveLength(4);
    for (let i = 0; i < engineCases.length; i++) {
      expect(bundled[i].contract_id).toBe(engineCases[i].contract_id);
      expect(bundled[i].findings).toEqual(checkContract(engineCases[i]));
    }
  });

  it('번들 수정 방향 == amendContract(소스) 맵', () => {
    const bundled = runBundle(casesJson);
    for (let i = 0; i < engineCases.length; i++) {
      expect(bundled[i].amendments).toEqual(amendmentMap(engineCases[i], checkContract(engineCases[i])));
    }
    expect(Object.keys(bundled[1].amendments).length).toBeGreaterThan(0); // 0002 는 위반이 있어 수정 방향이 나온다
  });

  it('번들 결과 == 사람이 확인한 전체 기대값(synthetic-findings.json)', () => {
    const bundled = runBundle(casesJson);
    for (const [i, exp] of expectedSnapshot.entries()) {
      expect(bundled[i].findings.map(goldenRow)).toEqual(
        exp.findings,
      );
    }
  });

  it('번들 결과가 정답지(expected_findings rule_code·status)와 일치', () => {
    const bundled = runBundle(casesJson);
    for (let i = 0; i < engineCases.length; i++) {
      const byCode = new Map(bundled[i].findings.map((f) => [f.rule_code, f]));
      for (const exp of engineCases[i].expected_findings ?? []) {
        expect(byCode.get(exp.rule_code)?.status, `${engineCases[i].contract_id} ${exp.rule_code}`).toBe(exp.status);
      }
    }
  });

  it('단일 계약 객체 붙여넣기도 받는다', () => {
    const one = runBundle((casesJson as unknown[])[0]);
    expect(one).toHaveLength(1);
    expect(one[0].findings).toEqual(checkContract(engineCases[0]));
  });

  it('fixtures 형식({common, contracts}) 입력 — 번들 == 소스', () => {
    const fixtures = {
      common: {
        workplace: { name: '가상 사업장', employee_count_5plus: true },
        period_common: { indefinite: true },
        work_time: {
          days_per_week: 5,
          start: '09:00',
          end: '18:00',
          breaks: [{ from: '12:00', to: '13:00', minutes: 60 }],
          night_work: false,
        },
        wage_common: {
          inclusive_wage: false,
          payment_method: '계좌이체',
          payday: '익월 10일',
          items_fixed: [{ code: 'BASE', label: '기본급', amount: 2156880, basis_hours: 209, rate_multiplier: 1 }],
        },
        holidays_leave: { weekly_rest: '매주 일요일', weekly_rest_day_specified: true, annual_leave_clause: '법정' },
        risk_clauses: [],
      },
      contracts: [
        { contract_id: 'fx-1', employee: { name: '가상01' }, period: { start_date: '2026-02-01' } },
        { contract_id: 'fx-2', employee: { name: '가상02' }, period: { start_date: '2026-02-01' }, wage: { monthly_total: 2156880 } },
      ],
    };
    expect(plain(api().validateInput(fixtures))).toEqual({ errors: [], warnings: [] });
    const bundled = runBundle(fixtures);
    const source = normalize(fixtures);
    expect(bundled.map((r) => r.contract_id)).toEqual(['fx-1', 'fx-2']);
    for (let i = 0; i < source.length; i++) expect(bundled[i].findings).toEqual(checkContract(source[i]));
  });
});

describe('붙여넣은 JSON 검사', () => {
  const v = (x: unknown) => plain(api().validateInput(x));
  const sample = (casesJson as Array<Record<string, unknown>>)[0];

  for (const [label, input] of [
    ['null', null],
    ['숫자', 1],
    ['문자열', 'x'],
    ['불리언', true],
    ['빈 목록 []', []],
    ['객체 아닌 원소 [1]', [1]],
    ['빈 객체 {}', {}],
    ['알아볼 칸 없는 객체', { foo: 1 }],
    ['fixtures 인데 contracts 빈 목록', { common: {}, contracts: [] }],
    ['fixtures 인데 common 없음', { contracts: [{ contract_id: 'a' }] }],
  ] as Array<[string, unknown]>) {
    it(`${label} → 한국어 안내로 거절`, () => {
      const r = v(input);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.join(' ')).toMatch(/[가-힣]/);
    });
  }

  it('합성 예시·객체·객체 목록은 통과(오류·경고 0)', () => {
    expect(v(sample)).toEqual({ errors: [], warnings: [] });
    expect(v(casesJson)).toEqual({ errors: [], warnings: [] });
  });

  it('모르는 최상위·구역 칸은 경고(점검은 막지 않음)', () => {
    const r = v({ ...sample, extra_top: 1, wage: { ...(sample.wage as object), itemz: [] } });
    expect(r.errors).toEqual([]);
    expect([...r.warnings].sort()).toEqual([
      'extra_top: 모르는 칸이라 점검에 쓰지 않습니다(철자를 확인해 주세요)',
      'wage.itemz: 모르는 칸이라 점검에 쓰지 않습니다(철자를 확인해 주세요)',
    ]);
    const fx = v({ common: { workplace: { name: 'a' } }, contracts: [{ contract_id: 'a' }], memo: 'x' });
    expect(fx.warnings).toEqual(['memo: 모르는 칸이라 점검에 쓰지 않습니다(common·contracts 만 씁니다)']);
  });

  it('형식 검사 — 불리언·시각·날짜·숫자', () => {
    const r = v({
      contract_id: 'x',
      signatures: { employer_signed: 'true' },
      work_time: { start: '9:00', end: '25:00', breaks: [{ from: '12:00', to: '13:00', minutes: '60' }] },
      period: { start_date: '2026/03/01', end_date: '2026-02-30' },
      wage: { items: [{ code: 'BASE', amount: '897,840' }, { code: 'SALARY', amount: 1 }] },
    });
    expect(r.errors.map((e) => e.split(':')[0])).toEqual([
      'signatures.employer_signed',
      'work_time.start',
      'work_time.end',
      'work_time.breaks[0].minutes',
      'period.start_date',
      'period.end_date',
      'wage.items[0].amount',
      'wage.items[1].code',
    ]);
  });

  it('형식 검사 통과값 — null 은 비워 둠, 24:00 허용', () => {
    expect(v({ contract_id: 'x', work_time: { start: '22:00', end: '24:00', night_work: null } }).errors).toEqual([]);
  });

  it('261101 새 칸 — pay_type·includes_weekly_holiday·WEEKLY_HOLIDAY 는 받고, 형식이 틀리면 거절', () => {
    const ok = v({
      contract_id: 'x',
      wage: {
        pay_type: 'hourly',
        items: [
          { code: 'BASE', amount: 1, includes_weekly_holiday: true },
          { code: 'WEEKLY_HOLIDAY', amount: 1 },
        ],
      },
    });
    expect(ok).toEqual({ errors: [], warnings: [] });
    const bad = v({ contract_id: 'x', wage: { pay_type: 'weekly', items: [{ code: 'BASE', amount: 1, includes_weekly_holiday: 'yes' }] } });
    expect(bad.errors.length).toBe(2);
  });

  it('빈 양식 — 검사 통과, 점검이 돌고 24건이 나온다', () => {
    const blank = plain(api().blankTemplate());
    expect(v(blank)).toEqual({ errors: [], warnings: [] });
    const [r] = runBundle(blank);
    expect(r.findings).toHaveLength(24);
    expect(r.findings.filter((f) => f.status === 'needs_data').length).toBeGreaterThan(5);
  });
});

describe('최저시급 표에 없는 연도 안내', () => {
  const contract = (start: string) => ({
    contract_id: 'y',
    period: { start_date: start },
    wage: { items: [{ code: 'BASE', amount: 2200000 }] },
  });

  it('2027년 계약 → 「입력하면 점검합니다」 대신 새 판 안내', () => {
    const [r] = runBundle(contract('2027-01-01'));
    const f = r.findings.find((x) => x.rule_code === 'MINWAGE')!;
    expect(f.status).toBe('needs_data');
    expect(r.minwage_year_missing).toBe('2027');
    expect(api().detailFor(r, f)).toBe(
      '이 파일에는 2027년 최저시급이 들어 있지 않습니다(수록: 2024~2026). 새 판을 받으세요.',
    );
  });

  it('수록 연도면 안내 없음, 다른 자료 필요 항목은 종전 접두어 그대로', () => {
    const [r] = runBundle(contract('2026-01-01'));
    expect(r.minwage_year_missing).toBeNull();
    const nd = r.findings.find((x) => x.status === 'needs_data')!;
    expect(api().detailFor(r, nd)).toBe(`입력하면 점검합니다 — ${nd.detail}`);
  });
});
