// 근로계약서 작성 오프라인판 자기시험 — 산출 HTML(실제로 나가는 바이트)을 정적 스캔하고, 인라인 스크립트를 node:vm 에서 돌려
// 화면 계산(compute)이 소스 코드와 같은 금액을 내는지 본다. 실브라우저 내려받기·요청 캡처는 scripts/verify-contract-write-offline.mjs.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { INITIAL, type WriteState } from '@/app/tools/contract-write/formState';
import { designFromForm } from '@/lib/contract-write/contract';
import { bannedHits } from '@/lib/tool-kit/banned';
import { toWriteForm } from '@/app/tools/contract-write/formState';

import { build, parseOut, DEFAULT_OUT } from '../../scripts/build-contract-write-offline.mjs';

interface Outcome {
  missing: string[];
  error: string | null;
  rows: Array<{ label: string; hours: number; amount: number }>;
  total: number | null;
  findings: unknown[];
}

let dir = '';
let html = '';
let script = '';
let sandbox: Record<string, unknown> = {};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cw-offline-'));
  ({ html } = (await build(join(dir, 'contract-write.html'), { date: '2026-11-03', sha: 'abc1234' })) as { html: string });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  expect(scripts).toHaveLength(1);
  script = scripts[0][1];
  sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
}, 180_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const api = () => sandbox.ContractWriteOfflineBundle as { compute: (s: WriteState) => Outcome; buildLine: () => string };
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const UIJEONGBU: WriteState = {
  ...INITIAL,
  workplaceName: '합성테스트 사업장',
  employeeName: '합성01',
  startDate: '2026-03-01',
  workDays: ['월', '화', '수', '목'],
  start: '10:00',
  end: '22:00',
  breakMinutes: '155',
  holidayDaysPerYear: '22',
  monthlyTotal: '2600000',
};
const PART: WriteState = { ...UIJEONGBU, payType: 'hourly', workDays: ['월', '화', '수', '목', '금'], start: '11:00', end: '17:00', breakMinutes: '30', holidayDaysPerYear: '16', hourlyWage: '13000' };

describe('오프라인판 산출 HTML — 외부 요청 경로', () => {
  const PATTERNS: Array<[string, RegExp]> = [
    ['외부 script src', /<script[^>]+src=/i],
    ['외부 link href', /<link[^>]+href=/i],
    ['fetch(', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/],
    ['WebSocket', /WebSocket/],
    ['EventSource', /EventSource/],
    ['동적 import(', /\bimport\s*\(/],
    // 대소문자 구분 — 엑셀 라이브러리에 gTag( 라는 다른 함수가 있다
    ['googletagmanager', /googletagmanager|google-analytics|\bgtag\(/],
  ];
  for (const [label, re] of PATTERNS) {
    it(`${label} 0건`, () => {
      expect(html.match(new RegExp(re.source, re.flags + 'g')) ?? []).toEqual([]);
    });
  }

  // 엑셀·한글 라이브러리에는 XML 이름공간 주소(http://schemas…·http://www.hancom…)가 글자로 들어 있어 주소 스캔은 하지 않는다.
  // 대신 CSP 가 모든 요청을 막는다
  it('CSP — default-src none, base-uri none, form-action none', () => {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp.startsWith("default-src 'none';")).toBe(true);
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/connect-src|img-src|font-src/);
  });

  it('PDF 글꼴은 HTML 안에 실려 있고(나눔고딕 전체), 라이선스 전문을 함께 싣는다', () => {
    const b64 = /<script id="cw-font" type="application\/octet-stream">([A-Za-z0-9+/=]+)<\/script>/.exec(html)?.[1] ?? '';
    expect(Buffer.from(b64, 'base64').equals(readFileSync('public/fonts/NanumGothic-Regular.ttf'))).toBe(true);
    expect(html).toContain('SIL Open Font License');
  });

  it('점검 시험 정답지(합성 예시)는 싣지 않는다', () => {
    expect(html.match(/"?expected_findings"?\s*:\s*\[/g) ?? []).toEqual([]);
  });
});

describe('오프라인판 — 화면 금지어 0', () => {
  it('bannedHits(산출 HTML 중 글꼴 덩어리 뺀 전체) == []', () => {
    // 「포괄」은 점검 엔진 규칙 이름·설명(사이트 근로계약서 점검과 같은 글)에서 실린다 — 작성 본문 쪽은 contract-write-form 시험이 본다
    expect(bannedHits(html.replace(/<script id="cw-font"[\s\S]*?<\/script>/, ''))).toEqual([]);
  });
});

describe('오프라인판 — 소스와 같은 계산', () => {
  for (const [label, state] of [['의정부 주4 월급', UIJEONGBU], ['파트 양식 a', PART]] as const) {
    it(`${label}: 번들 compute == 소스 designFromForm`, () => {
      const got = plain(api().compute(state));
      const want = designFromForm(toWriteForm(state).form!, 10_320);
      expect(got.error).toBeNull();
      expect(got.total).toBe(want.total);
      expect(got.rows.map((r) => r.amount)).toEqual(want.items.map((i) => i.amount));
      expect(got.findings).toEqual([]);
    });
  }

  it('빈 입력이면 필요한 칸을 알려준다', () => {
    expect(plain(api().compute(INITIAL)).missing).toEqual(['사업체명', '근로자 성명', '계약 시작일', '월 임금 총액']);
  });

  it('바닥줄 = 빌드 날짜·커밋', () => {
    expect(api().buildLine()).toBe('빌드 2026-11-03 · 커밋 abc1234');
  });

  it('--out 인자', () => {
    expect(parseOut([])).toBe(DEFAULT_OUT);
    expect(() => parseOut(['--out'])).toThrow();
  });
});
