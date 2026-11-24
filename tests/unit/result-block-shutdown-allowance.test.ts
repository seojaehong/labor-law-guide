// 휴업수당 계산기 — 공용 결과 블록(ResultBlock) 이전(261124).
// ① 261124 이전 답 카드 글자(headline + effectLines)가 결과 블록 글자 안에 같은 순서로 그대로 있다.
// ② 금액 칸·상태·다음 할 일·근거 조문이 붙는다. 기준일 데이터가 코드에 없어 asOf 는 비운다.
// ③ verify-llg journey 의 기대 글자가 새 블록 글자(화면 순서)에서도 맞는다.
// 화면 렌더 시험 기반(jsdom)이 없어 컴포넌트는 소스 글자로 본다(tool-result-block.test.ts 와 같은 방식).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import { calcShutdownAllowance, type ShutdownAllowanceInput } from '@/lib/calc/shutdown-allowance';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { ResultView } from '@/components/tool-result/result-view';
import { effectLines, headline } from '@/app/tools/shutdown-allowance/copy';
import { shutdownAllowanceNotes, shutdownAllowanceView } from '@/app/tools/shutdown-allowance/result';

const CLIENT = 'src/app/tools/shutdown-allowance/ShutdownAllowanceClient.tsx';

/** ResultBlock 이 그리는 순서 그대로 */
const domText = (v: ResultView, children: string[] = []) => [
  v.status, ...v.verdict, ...(v.meta ?? []), ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.formula ?? '', ...(v.warnings ?? []), v.nextNote ?? '', ...children,
  v.basis.length ? `근거 ${v.basis.map((b) => b.label).join(' · ')}` : '', ...v.asOf, v.caveat ?? '', ...v.next.map((n) => n.label),
].filter(Boolean).join(' ');

function hrefExists(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (TOOLS.some((t) => t.href === href)) return true;
  if (href.endsWith('.html')) return existsSync(`public${href}`);
  return existsSync(`src/app${href}/page.tsx`);
}

function inOrder(text: string, lines: string[]) {
  let at = 0;
  for (const l of lines) {
    const i = text.indexOf(l, at);
    expect(i, l).toBeGreaterThanOrEqual(0);
    at = i + l.length;
  }
}

// verify-llg journey 의 입력을 그대로 옮긴 합성 값
const FIRST: ShutdownAllowanceInput = {
  fivePlus: true, cause: 'employer',
  average: { source: 'period', hireDate: '2024-03-01', startDate: '2026-11-01', wageTotal: 9_000_000 },
  ordinary: { unit: 'month', amount: 3_000_000, weeklyHours: 40, dailyHours: 8 }, days: 26,
};
const DAYLY = (daily: number, over: Partial<ShutdownAllowanceInput> = {}, avg: Partial<{ wageTotal: number; excludedDays: number; excludedWages: number; annualBonus: number }> = {}): ShutdownAllowanceInput => ({
  fivePlus: true, cause: 'employer',
  average: { source: 'period', hireDate: '2024-03-01', startDate: '2026-11-02', wageTotal: 13_800_000, ...avg },
  ordinary: { unit: 'day', amount: daily, weeklyHours: 40, dailyHours: 8 }, days: 10, ...over,
});
const CLAMP: ShutdownAllowanceInput = { ...DAYLY(100_000), average: { source: 'direct', daily: 100_000 }, days: 5, paidDuring: 600_000 };

const show = (i: ShutdownAllowanceInput) => {
  const r = calcShutdownAllowance(i);
  const v = shutdownAllowanceView(r);
  return { r, v, t: domText(v, shutdownAllowanceNotes(r)) };
};

describe('글자 고정 — 261124 이전 화면 실측', () => {
  it('첫 화면 26일 — 2,089,953원 이상(통상임금을 평균임금으로)', () => {
    const { v } = show(FIRST);
    expect(v.verdict).toEqual([
      '휴업수당은 2,089,953원 이상입니다.',
      '1일 평균임금 114,832.54원 × 26일 × 70%',
      '평균임금이 통상임금보다 적어 1일 통상임금 114,832.54원을 평균임금으로 했습니다(근로기준법 제2조제2항).',
    ]);
    expect(v.amounts).toEqual([{ label: '휴업수당(이 금액 이상)', value: '2,089,953원' }]);
    expect(v.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
  });
  it('단서 — 평균임금 기준 1,050,000원 / 통상임금 기준 1,000,000원 두 칸, 문장은 한 줄 그대로', () => {
    const { v } = show(DAYLY(100_000));
    expect(v.verdict[0]).toBe('휴업수당은 평균임금 기준 1,050,000원 이상, 또는 통상임금 기준 1,000,000원입니다.');
    expect(v.amounts).toEqual([
      { label: '평균임금 기준(이 금액 이상)', value: '1,050,000원' },
      { label: '통상임금 기준', value: '1,000,000원' },
    ]);
  });
  it('받은 임금이 더 많음 — 0원 결과에도 다음 할 일', () => {
    const { v, r } = show(CLAMP);
    expect(r.mainClamped).toBe(true);
    expect(v.verdict).toEqual(['휴업 중 받은 임금이 많아 더 줄 휴업수당이 없습니다.', '받은 임금 600,000원이 1일 평균임금 100,000원 × 5일 이상입니다(근로기준법 시행령 제26조).']);
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toMatch(/급여명세서/);
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
});

describe('옛 답 카드 글자가 같은 순서로 모두 남는다', () => {
  const inputs: ShutdownAllowanceInput[] = [
    FIRST, DAYLY(100_000), DAYLY(110_000), DAYLY(100_000, { days: 5, paidDuring: 250_000 }), CLAMP,
    { ...FIRST, fivePlus: false }, { ...FIRST, cause: 'force-majeure' }, { ...FIRST, cause: 'commission' },
  ];
  it.each(inputs.map((x, i) => [i, x] as const))('사례 %i', (_i, x) => {
    const { r, t } = show(x);
    inOrder(t, [...headline(r), ...effectLines(r)]);
  });
});

describe('verify-llg journey 기대 글자(화면 순서)', () => {
  const steps: [ShutdownAllowanceInput, string | RegExp][] = [
    [FIRST, /2,089,953원 이상.*제2조제2항/],
    [DAYLY(100_000), /평균임금 기준 1,050,000원 이상, 또는 통상임금 기준 1,000,000원.*회사가 고릅니다/],
    [DAYLY(110_000), '휴업수당은 1,050,000원 이상입니다'],
    [DAYLY(100_000, { days: 5, paidDuring: 250_000 }), /평균임금 기준 350,000원 이상, 또는 통상임금 기준 250,000원/],
    [DAYLY(130_000, { days: 5 }, { wageTotal: 12_000_000, excludedDays: 10, excludedWages: 700_000 }), '482,318원'],
    [DAYLY(100_000, {}, { wageTotal: 12_000_000, annualBonus: 4_800_000 }), /평균임금 기준 1,004,348원 이상, 또는 통상임금 기준 1,000,000원/],
    [{ ...DAYLY(100_000), fivePlus: false }, /계산하지 않습니다.*4명 이하.*별표1/],
    [{ ...DAYLY(100_000), cause: 'force-majeure' }, /계산하지 않습니다.*귀책사유가 아니/],
    [{ ...DAYLY(100_000), cause: 'commission' }, /승인된 지급률.*별지 제4호서식/],
  ];
  it.each(steps.map((s, i) => [i, ...s] as const))('단계 %i', (_i, x, want) => {
    const { t } = show(x);
    if (typeof want === 'string') expect(t).toContain(want);
    else expect(t).toMatch(want);
  });
});

describe('계산하지 않는 입력(멈춤) — 상태는 사실대로, 다음 할 일 있음', () => {
  it.each([
    ['4명 이하', { ...FIRST, fivePlus: false }],
    ['불가항력', { ...FIRST, cause: 'force-majeure' as const }],
    ['노동위원회 승인', { ...FIRST, cause: 'commission' as const }],
  ] as const)('%s', (_n, x) => {
    const { v } = show(x);
    expect(v.status).toBe('계산하지 않음 · 이 계산기가 다루는 범위 밖입니다');
    expect(v.verdict[0]).toMatch(/계산하지 않습니다/);
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toBeTruthy();
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
});

describe('공통 — 링크·근거·기준일·금지어', () => {
  const all = [FIRST, DAYLY(100_000), CLAMP, { ...FIRST, fivePlus: false }, { ...FIRST, cause: 'force-majeure' as const }, { ...FIRST, cause: 'commission' as const }, DAYLY(100_000, { days: 5, paidDuring: 250_000 })].map(show);
  it('다음 할 일은 1~2개, 실제 경로, 같은 href 두 번 없음', () => {
    for (const { v } of all) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      expect(new Set(v.next.map((n) => n.href)).size).toBe(v.next.length);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 법제처 조문 주소, 같은 조문 두 번 없음', () => {
    for (const { v } of all) {
      expect(new Set(v.basis.map((b) => b.href)).size).toBe(v.basis.length);
      for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조$/);
    }
  });
  it('기준일 데이터가 코드에 없어 asOf 는 비운다', () => {
    for (const { v } of all) expect(v.asOf).toEqual([]);
  });
  it('금지어·느낌표·이모지·해요체 없음', () => {
    for (const { t } of all) {
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}|해요|예요|에요/u);
    }
  });
});

describe('화면 — 공용 결과 블록을 쓴다', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('AnswerCard 대신 ResultBlock, 옛 작은 글씨는 notes 로 블록 안에', () => {
    expect(src).toMatch(/<ResultBlock /);
    expect(src).not.toMatch(/AnswerCard/);
    expect(src).toMatch(/shutdownAllowanceView\(/);
    expect(src).toMatch(/shutdownAllowanceNotes\(/);
  });
  it('블록 안 문단은 글자색을 지정하지 않는다(잉크 반전 바탕에 muted·ink·회색이면 어두운 글자)', () => {
    const inside = [...src.matchAll(/<ResultBlock[\s\S]*?<\/ResultBlock>/g)].map((m) => m[0]);
    expect(inside.length).toBeGreaterThan(0);
    for (const b of inside) expect(b).not.toMatch(/style=\{(?:muted|ink)\}|grey-|gray-|text-\[var\(--color-text/);
  });
  it('오류 카드(section aria-live, 「휴업을 시작한 날」 등)는 그대로 둔다', () => {
    expect(src).toMatch(/<section className=\{card\} aria-live="polite">/);
    expect(src).toContain('휴업을 시작한 날을 넣어 주세요.');
  });
  it('라디오·체크 라벨은 모두 choiceLabel(44px)', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((x) => x[0]);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
