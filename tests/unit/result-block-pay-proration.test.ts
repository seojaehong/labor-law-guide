// 급여 일할계산기 — 공용 결과 블록(ResultBlock) 이전(261124). 결과 카드가 둘(일할 계산·결근 공제)이다.
// ① 261124 이전 답 카드 글자(headline + effectLines / absenceHeadline + absenceEffectLines)가 결과 블록 글자 안에 같은 순서로 그대로 있다.
// ② 금액 칸·상태·다음 할 일·근거 조문이 붙는다. 기준일은 계산 모듈과 같은 rates.ts 그달 최저임금 고시 줄에서만.
// ③ verify-llg journey 의 기대 글자가 새 블록 글자(화면 순서)에서도 맞는다.
// 화면 렌더 시험 기반(jsdom)이 없어 컴포넌트는 소스 글자로 본다(tool-result-block.test.ts 와 같은 방식).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { rateOn } from '@/content/rates';
import { TOOLS } from '@/content/tools-registry';
import { calcAbsence, calcProration, type AbsenceInput, type ProrationInput, type RoundingRule } from '@/lib/calc/pay-proration';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { ResultView } from '@/components/tool-result/result-view';
import { dotDate } from '@/components/tool-result/result-view';
import { absenceEffectLines, absenceHeadline, effectLines, headline, type Basis } from '@/app/tools/pay-proration/copy';
import {
  ABSENCE_LABEL, PICK_METHOD_HINT, PRORATION_LABEL, ZERO_NOTE, absenceNotes, absenceView, payProrationAsOf, payProrationNotes, payProrationView,
} from '@/app/tools/pay-proration/result';

const CLIENT = 'src/app/tools/pay-proration/PayProrationClient.tsx';

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

const PAY = 2_508_000;
const C1: ProrationInput = { month: '2026-03', monthlyPay: PAY, start: '2026-03-16', fivePlus: true, holidays: ['2026-03-02'] };
const C6: ProrationInput = { ...C1, start: '2026-03-18' };
const ONE: ProrationInput = { ...C1, start: '2026-03-31' };
const C3A: ProrationInput = { month: '2026-02', monthlyPay: PAY, end: '2026-02-13', fivePlus: true, holidays: [] };
const C3B: ProrationInput = { ...C3A, end: '2026-02-15' };
const C5: ProrationInput = { month: '2026-02', monthlyPay: PAY, start: '2026-02-02', fivePlus: false, holidays: ['2026-02-16', '2026-02-17', '2026-02-18'] };
const FULLM: ProrationInput = { month: '2026-03', monthlyPay: PAY, fivePlus: true, holidays: [] };
const A_BASE: AbsenceInput = { month: '2026-11', monthlyPay: PAY, fivePlus: true, holidays: [], absences: ['2026-11-18'] };
const A5: AbsenceInput = { ...A_BASE, absences: ['2026-11-18', '2026-11-19'] };
const A6: AbsenceInput = { ...A_BASE, absences: [], lateHours: 8, companyDeduction: 192_000, avgDailyWage: 81_782.6 };

const prorate = (i: ProrationInput, basis: Basis = 'unknown', rounding?: RoundingRule) => {
  const r = calcProration(rounding ? { ...i, rounding } : i);
  const v = payProrationView(r, basis);
  return { r, v, t: domText(v, payProrationNotes(r, basis)) };
};
const absent = (i: AbsenceInput) => {
  const a = calcAbsence(i);
  const v = absenceView(a);
  return { a, v, t: domText(v, absenceNotes(a)) };
};

describe('글자 고정 — 261124 이전 화면 실측', () => {
  it('회사 기준 모름 — 1,254,000원에서 1,433,142.86원까지, 가장 적은·많은 방식 두 칸', () => {
    const { v } = prorate(C1);
    expect(v.verdict).toEqual([
      '일할 방식에 따라 3월 급여는 1,254,000원에서 1,433,142.86원까지 갈립니다.',
      '법은 일할 방식을 정하지 않아 취업규칙·근로계약서·임금명세서에 적힌 계산방법을 따릅니다(근기68207-690).',
    ]);
    expect(v.amounts).toEqual([
      { label: '가장 적은 방식', value: '1,254,000원' },
      { label: '가장 많은 방식', value: '1,433,142.86원' },
    ]);
    expect(v.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
  });
  it('30일 기준(지급식) — 1,337,600원 + 산식 줄', () => {
    const { v } = prorate(C1, 'DAY_30');
    expect(v.verdict).toEqual(['회사 기준(30일 기준(지급식))으로 3월 급여는 1,337,600원입니다.', '월급 2,508,000원 × 재직 16일 ÷ 30일']);
    expect(v.amounts).toEqual([{ label: '회사 기준(30일 기준(지급식))', value: '1,337,600원' }]);
  });
  it('전액 지급 규정 — 2,508,000원', () => {
    const { v } = prorate(C1, 'FULL');
    expect(v.verdict[0]).toBe('회사 규정이 그달 월급 전액 지급이면 일할하지 않고 2,508,000원입니다.');
    expect(v.amounts).toEqual([{ label: '그달 월급 전액', value: '2,508,000원' }]);
  });
  it('그달 내내 재직 — 해당 없음 + 다음 할 일', () => {
    const { v } = prorate(FULLM);
    expect(v.verdict[0]).toBe('그달 내내 재직해 일할하지 않는 달입니다.');
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toBeTruthy();
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
  it('0원 결과(31일 달 하루 재직 공제식 · 일요일 하루 재직 시간 기준)에도 0원 안내와 다음 할 일', () => {
    const one = prorate(ONE, 'DAY_30_DEDUCT').v;
    expect(one.verdict[0]).toBe('회사 기준(30일 기준(공제식))으로 3월 급여는 0원입니다.');
    expect(one.amounts).toEqual([{ label: '회사 기준(30일 기준(공제식))', value: '0원' }]);
    expect(one.nextNote).toBe(ZERO_NOTE);
    const sun = prorate({ month: '2026-03', monthlyPay: PAY, start: '2026-03-29', end: '2026-03-29', fivePlus: true, holidays: [] }, 'HOUR_ACTUAL').v;
    expect(sun.verdict[0]).toBe('회사 기준(시간 기준)으로 3월 급여는 0원입니다.');
    expect(sun.nextNote).toBe(ZERO_NOTE);
    expect(sun.next.length).toBeGreaterThanOrEqual(1);
    // 폭의 한쪽만 0원이면 0원 결과가 아니다
    expect(prorate(ONE).v.nextNote).toBeUndefined();
    expect(bannedHits(ZERO_NOTE)).toEqual([]);
  });
  it('결근 1일 — 폭 문장 그대로', () => {
    const { v } = absent(A_BASE);
    expect(v.verdict[0]).toBe('결근 1일 공제는 1일 단가에 따라 결근일분만이면 83,600원에서 96,000원 사이, 그 주 주휴 1일분까지 빼면 167,200원에서 192,000원 사이입니다.');
    expect(v.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
  });
});

describe('옛 답 카드 글자가 같은 순서로 모두 남는다', () => {
  const bases: Basis[] = ['unknown', 'DAY_30', 'DAY_30_DEDUCT', 'CALENDAR', 'WORKDAY', 'HOUR_ACTUAL', 'FULL'];
  for (const [n, i] of [['C1', C1], ['C6', C6], ['ONE', ONE], ['C3A', C3A], ['C5', C5], ['FULLM', FULLM]] as const) {
    it.each(bases)(`${n} %s`, (b) => {
      const { r, t } = prorate(i, b);
      inOrder(t, [...headline(r, b), ...effectLines(r, b)]);
    });
  }
  it.each([A_BASE, A5, A6, { ...A6, fivePlus: false }])('결근 공제 %#', (i) => {
    const { a, t } = absent(i);
    inOrder(t, [...absenceHeadline(a), ...absenceEffectLines(a)]);
  });
});

describe('verify-llg journey 기대 글자(화면 순서)', () => {
  it('일할 계산', () => {
    expect(prorate(C1).t).toMatch(/1,254,000원에서 1,433,142\.86원까지 갈립니다.*회사에 물어볼 문장/);
    expect(prorate(C1, 'DAY_30').t).toContain('1,337,600원입니다');
    expect(prorate(C1, 'HOUR_ACTUAL').t).toContain('1,344,000원입니다');
    expect(prorate(C1, 'CALENDAR').t).toMatch(/1,294,451\.61원입니다.*원 미만이 남는 값/);
    expect(prorate(C1, 'CALENDAR', { how: 'FLOOR', unit: 1 }).t).toContain('1,294,451원입니다');
    expect(prorate(C6, 'HOUR_ACTUAL').t).toMatch(/첫 주 주휴를 넣지 않으면 1,056,000원, 첫 주 주휴를 넣으면 1,152,000원/);
    expect(prorate(ONE).t).toMatch(/0원에서 119,428\.57원까지 갈립니다.*82,560원보다 적습니다/);
    expect(prorate(C3A, 'HOUR_ACTUAL').t).toMatch(/1,152,000원입니다.*임금근로시간과-1736/);
    expect(prorate(C3B, 'HOUR_ACTUAL').t).toContain('1,248,000원입니다');
    expect(prorate(C5, 'HOUR_ACTUAL').t).toMatch(/공휴일을 유급으로 했으면 2,208,000원, 공휴일을 무급으로 했으면 1,920,000원.*제55조 제2항/);
  });
  it('결근 공제', () => {
    expect(absent(A_BASE).t).toMatch(/결근일분만이면 83,600원에서 96,000원 사이, 그 주 주휴 1일분까지 빼면 167,200원에서 192,000원 사이.*회사 규정·관행/);
    expect(absent(A5).t).toMatch(/결근일분만이면 167,200원에서 192,000원 사이, 그 주 주휴 1일분까지 빼면 250,800원에서 288,000원 사이/);
    expect(absent(A6).t).toMatch(/정했으면 그 시간분 96,000원, 정한 것이 없으면 0원.*96,000원 많습니다.*한 번의 감급이라면 1회 한도 40,891\.3원보다 큽니다.*법무811-21010 처럼/);
  });
});

describe('기준일 — 계산 모듈과 같은 그달 최저임금 고시 줄', () => {
  it('2026년 달 = 2026년 고시(rates.ts from·checked)', () => {
    const rate = rateOn('minWageHourly', '2026-03-01')!;
    const { r, v } = prorate(C1);
    expect(r.minWage?.minHourly).toBe(rate.value);
    expect(v.asOf).toEqual([`2026년 최저임금(시간당 10,320원) 기준 · 확인 ${dotDate(rate.checked)}`]);
    expect(absent(A_BASE).v.asOf).toEqual(v.asOf);
  });
  it('고시가 없는 해는 비운다(다른 해 값으로 대신하지 않는다)', () => {
    expect(payProrationAsOf('2030-03')).toEqual([]);
  });
});

describe('공통 — 링크·근거·금지어', () => {
  const all = [prorate(C1), prorate(C1, 'DAY_30'), prorate(C1, 'FULL'), prorate(FULLM), prorate(ONE), prorate(C5, 'HOUR_ACTUAL'), absent(A_BASE), absent(A6)];
  it('다음 할 일은 1~2개, 실제 경로, 같은 href 두 번 없음', () => {
    for (const { v } of all) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      expect(new Set(v.next.map((n) => n.href)).size).toBe(v.next.length);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 법제처 조문 주소, 같은 조문 두 번 없음, 금액 칸 이름 겹침 없음', () => {
    for (const { v } of all) {
      expect(new Set(v.basis.map((b) => b.href)).size).toBe(v.basis.length);
      expect(new Set(v.amounts.map((a) => a.label)).size).toBe(v.amounts.length);
      for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조$/);
    }
  });
  it('금지어·느낌표·이모지·해요체 없음', () => {
    for (const { t } of all) {
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}|해요|예요|에요/u);
    }
    expect(bannedHits(PICK_METHOD_HINT)).toEqual([]);
  });
});

describe('화면 — 결과 카드 둘, DOM 순서와 label', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('AnswerCard 대신 ResultBlock 두 개, label 이 다르다', () => {
    expect(src).not.toMatch(/AnswerCard/);
    expect(PRORATION_LABEL).not.toBe(ABSENCE_LABEL);
    const blocks = [...src.matchAll(/<ResultBlock [^>]*>/g)].map((m) => m[0]);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toMatch(/label=\{PRORATION_LABEL\}/);
    expect(blocks[0]).toMatch(/payProrationView\(/);
    expect(blocks[1]).toMatch(/label=\{ABSENCE_LABEL\}/);
    expect(blocks[1]).toMatch(/absenceView\(/);
    expect(src).toMatch(/payProrationNotes\(/);
    expect(src).toMatch(/absenceNotes\(/);
  });
  it('일할 카드가 결근 카드보다 앞이고, 오류 카드가 둘보다 앞이다', () => {
    const err = src.indexOf('<section className={card} aria-live="polite">');
    const p = src.indexOf('label={PRORATION_LABEL}');
    const a = src.indexOf('label={ABSENCE_LABEL}');
    expect(err).toBeGreaterThan(0);
    expect(err).toBeLessThan(p);
    expect(p).toBeLessThan(a);
  });
  it('블록 안 문단은 글자색을 지정하지 않는다(잉크 반전 바탕에 muted·ink·회색이면 어두운 글자)', () => {
    const inside = [...src.matchAll(/<ResultBlock[\s\S]*?<\/ResultBlock>/g)].map((m) => m[0]);
    expect(inside.length).toBe(2);
    for (const b of inside) expect(b).not.toMatch(/style=\{(?:muted|ink)\}|grey-|gray-|text-\[var\(--color-text/);
  });
  it('방식 미선택 안내 한 줄은 그대로 남는다', () => {
    expect(src).toMatch(/PICK_METHOD_HINT/);
    expect(PICK_METHOD_HINT).toBe('적힌 계산방법을 고르면 그 방식의 값을 맨 위에 보여 줍니다.');
  });
  it('라디오·체크 라벨은 모두 choiceLabel(44px)', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((x) => x[0]);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
