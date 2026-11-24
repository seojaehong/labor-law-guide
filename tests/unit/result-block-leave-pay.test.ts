// 연차수당 계산기 — 공용 결과 블록(ResultBlock) 이전(261124).
// ① 261124 이전 답 카드 글자(headline + effectLines + promotionLines/formulaLines)가 결과 블록 글자 안에 같은 순서로 그대로 있다.
// ② 금액 칸·상태·다음 할 일·근거 조문이 붙는다. 기준일 데이터가 코드에 없어 asOf 는 비운다(계산 입력 asOf 는 조항 번호를 고르는 날).
// ③ verify-llg journey 의 기대 글자가 새 블록 글자(화면 순서)에서도 맞는다. 소멸시효 문장은 결과 블록에도 없다.
// 화면 렌더 시험 기반(jsdom)이 없어 컴포넌트는 소스 글자로 본다(tool-result-block.test.ts 와 같은 방식).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import { calcLeavePay, type LeavePayInput } from '@/lib/calc/leave-pay';
import { assertNoPrescriptionMath } from '@/lib/leave/leave-advanced';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { ResultView } from '@/components/tool-result/result-view';
import { effectLines, formulaLines, headline, promotionLines } from '@/app/tools/leave-pay/copy';
import { ZERO_NOTE, leavePayNotes, leavePayView } from '@/app/tools/leave-pay/result';

const CLIENT = 'src/app/tools/leave-pay/LeavePayClient.tsx';

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

const AS_OF = '2026-11-24';
const C2: LeavePayInput = {
  timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8,
  rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 },
  days: { source: 'unused', unusedDays: 5 }, promotion: 'unknown', asOf: AS_OF,
};
const LED = (hireDate: string, lastWorkDate: string): LeavePayInput => ({
  ...C2, timing: 'termination', rate: { basis: 'ordinary-wage', unit: 'month', amount: 3_135_000 },
  days: { source: 'ledger', hireDate, lastWorkDate, usedDays: 0 },
});
const PT: LeavePayInput = {
  ...C2, timing: 'termination', weeklyHours: 23, rate: { basis: 'ordinary-wage', unit: 'hour', amount: 11_000 },
  partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 16, usedHours: 0 },
};
const show = (i: LeavePayInput) => {
  const r = calcLeavePay(i);
  const v = leavePayView(r);
  return { r, v, t: domText(v, leavePayNotes(r)) };
};

describe('글자 고정 — 261124 이전 화면 실측', () => {
  it('첫 화면 월 2,600,000 · 5일 = 497,608원', () => {
    const { v, r } = show(C2);
    expect(v.verdict).toEqual(['미사용 연차수당은 497,608원입니다.', '남은 연차 5일 × 1일 통상임금 99,521.53원']);
    expect(v.amounts).toEqual([{ label: '미사용 연차수당', value: '497,608원' }]);
    expect(v.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
    expect(leavePayNotes(r).at(-1)).toBe('회사가 연차 사용 촉진을 했는지 모르면 금액은 그대로 둡니다. 촉진을 했다고 하면 아래 「촉진을 했어도 지급하는 경우」와 맞춰 봅니다.');
  });
  it('상시 4명 이하 — 계산하지 않음(멈춤) + 근거 문장 그대로', () => {
    const { v, r } = show({ ...C2, fivePlus: false });
    expect(v.verdict).toEqual(['법정 연차수당을 계산하지 않습니다.', '상시 근로자 4명 이하 사업장에는 연차휴가(근로기준법 제60조)가 적용되지 않습니다.']);
    expect(v.status).toBe('계산하지 않음 · 이 계산기가 다루는 범위 밖입니다');
    expect(v.amounts).toEqual([]);
    expect(leavePayNotes(r)[0]).toBe('근로계약서나 취업규칙에 연차를 따로 정했다면 그 약정에 따릅니다.');
  });
});

describe('옛 답 카드 글자가 같은 순서로 모두 남는다', () => {
  const inputs: LeavePayInput[] = [
    C2, { ...C2, alreadyPaid: 400_000 }, { ...C2, fivePlus: false }, { ...C2, weeklyHours: 14 },
    { ...C2, otherPaidHours: true }, { ...C2, promotion: 'claimed' }, { ...C2, timing: 'termination', promotion: 'claimed' },
    LED('2025-11-01', '2026-10-31'), PT, { ...C2, promotion: 'none' },
  ];
  it.each(inputs.map((x, i) => [i, x] as const))('사례 %i', (_i, x) => {
    const { r, t } = show(x);
    inOrder(t, [...headline(r), ...effectLines(r), ...(r.status === 'calculated' ? promotionLines(r) : formulaLines(r))]);
  });
});

describe('verify-llg journey 기대 글자(화면 순서)', () => {
  const steps: [LeavePayInput, string | RegExp][] = [
    [C2, '미사용 연차수당은 497,608원입니다'],
    [{ ...C2, alreadyPaid: 400_000 }, '회사 지급액 400,000원보다 97,608원 많습니다'],
    [{ ...C2, fivePlus: false }, /법정 연차수당을 계산하지 않습니다.*4명 이하/],
    [{ ...C2, weeklyHours: 14 }, '15시간 미만'],
    [{ ...C2, promotion: 'claimed' }, /497,608원.*지급 의무가 없을 수 있습니다.*빼지 않은 값/],
    [{ ...C2, timing: 'termination', promotion: 'claimed' }, /퇴직 시 미사용 연차수당은 497,608원.*14일 이내/],
    [LED('2025-11-01', '2026-10-31'), '1,320,000원'],
    [LED('2025-11-01', '2026-11-01'), '3,120,000원'],
    [LED('2016-01-01', '2017-01-01'), '1,800,000원'],
    [PT, /814,000원.*남은 연차 74시간/],
  ];
  it.each(steps.map((s, i) => [i, ...s] as const))('단계 %i', (_i, x, want) => {
    const { t } = show(x);
    if (typeof want === 'string') expect(t).toContain(want);
    else expect(t).toMatch(want);
  });
});

describe('계산하지 않는 입력에도 다음 할 일', () => {
  it.each([
    ['4명 이하', { ...C2, fivePlus: false }],
    ['주 14시간', { ...C2, weeklyHours: 14 }],
    ['주휴 밖 유급시간', { ...C2, otherPaidHours: true }],
  ] as const)('%s', (_n, x) => {
    const { v } = show(x);
    expect(v.status).toBe('계산하지 않음 · 이 계산기가 다루는 범위 밖입니다');
    expect(v.nextNote).toBeTruthy();
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
  it.each([
    ['남은 0일', { ...C2, days: { source: 'unused' as const, unusedDays: 0 } }],
    ['누계 11일 − 쓴 11일', { ...LED('2025-11-01', '2026-10-31'), days: { source: 'ledger' as const, hireDate: '2025-11-01', lastWorkDate: '2026-10-31', usedDays: 11 } }],
    ['단시간 남은 0시간', { ...C2, weeklyHours: 20, rate: { basis: 'ordinary-wage' as const, unit: 'hour' as const, amount: 11_000 }, partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 15, usedHours: 60 } }],
  ] as const)('0원(%s)에도 0원 안내와 다음 할 일', (_n, x) => {
    const { v } = show(x);
    expect(v.amounts[0].value).toBe('0원');
    expect(v.nextNote).toBe(ZERO_NOTE);
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
  it('금액이 있으면 0원 안내가 없다', () => {
    expect(show(C2).v.nextNote).toBeUndefined();
  });
  it('퇴직 시 다음 할 일 = 퇴사 점검표·퇴직금', () => {
    expect(show({ ...C2, timing: 'termination' }).v.next.map((n) => n.href)).toEqual(['/exit', '/tools/severance.html']);
  });
});

describe('공통 — 링크·근거·기준일·금지어·시효', () => {
  const all = [C2, { ...C2, days: { source: 'unused' as const, unusedDays: 0 } }, { ...C2, fivePlus: false }, { ...C2, weeklyHours: 14 }, { ...C2, otherPaidHours: true }, { ...C2, timing: 'termination' as const }, PT].map(show);
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
  it('금지어·느낌표·이모지·해요체·시효 없음', () => {
    for (const { v, t } of all) {
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}|해요|예요|에요/u);
      expect(t).not.toContain('시효');
      const own = [v.status, v.nextNote ?? '', v.caveat ?? '', ...v.next.map((n) => n.label), ...v.amounts.map((a) => a.label)];
      expect(() => assertNoPrescriptionMath(own)).not.toThrow();
    }
  });
});

describe('화면 — 공용 결과 블록을 쓴다', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('AnswerCard 대신 ResultBlock, 옛 작은 글씨는 notes 로 블록 안에', () => {
    expect(src).toMatch(/<ResultBlock /);
    expect(src).not.toMatch(/AnswerCard/);
    expect(src).toMatch(/leavePayView\(/);
    expect(src).toMatch(/leavePayNotes\(/);
  });
  it('블록 안 문단은 글자색을 지정하지 않는다(잉크 반전 바탕에 muted·ink·회색이면 어두운 글자)', () => {
    const inside = [...src.matchAll(/<ResultBlock[\s\S]*?<\/ResultBlock>/g)].map((m) => m[0]);
    expect(inside.length).toBeGreaterThan(0);
    for (const b of inside) expect(b).not.toMatch(/style=\{(?:muted|ink)\}|grey-|gray-|text-\[var\(--color-text/);
  });
  it('오류 카드(section aria-live)는 그대로 둔다', () => {
    expect(src).toMatch(/<section className=\{card\} aria-live="polite">/);
  });
  it('라디오·체크 라벨은 모두 choiceLabel(44px)', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((x) => x[0]);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
