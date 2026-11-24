// 출근율 계산기 — 공용 결과 블록(ResultBlock) 이전(261124).
// ① 261124 이전 답 카드 글자(headline + effectLines)가 결과 블록 글자 안에 같은 순서로 그대로 있다.
// ② 일수 칸·상태·다음 할 일·근거 조문이 붙는다. 기준일 데이터가 코드에 없어 asOf 는 비운다.
// ③ verify-llg journey 의 기대 글자가 새 블록 글자(화면 순서)에서도 맞는다.
// 화면 렌더 시험 기반(jsdom)이 없어 컴포넌트는 소스 글자로 본다(tool-result-block.test.ts 와 같은 방식).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import { calcAttendanceRate, type AttendanceCause } from '@/lib/calc/attendance-rate';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { ResultView } from '@/components/tool-result/result-view';
import { effectLines, headline } from '@/app/tools/attendance-rate/copy';
import { attendanceRateNotes, attendanceRateView } from '@/app/tools/attendance-rate/result';

const CLIENT = 'src/app/tools/attendance-rate/AttendanceRateClient.tsx';

/** ResultBlock 이 그리는 순서 그대로 — 상태 → 판정 → 보조 → 금액 → 산식 → 주의 → 0원 안내 → children → 근거 → 기준일 → 한계 → 다음 할 일 */
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

/** 옛 글자가 새 글자 안에 같은 순서로 모두 있는가 */
function inOrder(text: string, lines: string[]) {
  let at = 0;
  for (const l of lines) {
    const i = text.indexOf(l, at);
    expect(i, l).toBeGreaterThanOrEqual(0);
    at = i + l.length;
  }
}

const Y2 = { hireDate: '2024-03-04', accrualDate: '2026-03-04' };
type Days = Partial<Record<AttendanceCause, number>>;
const run = (S: number, days: Days = {}, dates: { hireDate: string; accrualDate: string } = Y2) =>
  calcAttendanceRate({ ...dates, scheduledDays: S, days });
const show = (r: ReturnType<typeof run>) => {
  const v = attendanceRateView(r);
  return { v, t: domText(v, attendanceRateNotes(r)) };
};

describe('글자 고정 — 261124 이전 화면 실측', () => {
  it('첫 화면 245/250 = 98.00% → 15일', () => {
    const { v, t } = show(run(250, { absence: 5 }));
    expect(v.verdict).toEqual(['출근율은 98.00%로 80% 이상입니다.', '연차휴가 15일이 생깁니다(근로기준법 제60조제1항).']);
    expect(attendanceRateNotes(run(250, { absence: 5 }))).toEqual(['쓰지 못하고 남은 일수의 수당은 연차수당 계산기에서 봅니다.']);
    expect(v.amounts).toEqual([{ label: '생기는 연차휴가', value: '15일' }]);
    expect(v.status).toBe('확인용 비교 · 확정 판단이 아닙니다');
    expect(t).toMatch(/출근율은 98\.00%로 80% 이상입니다.*15일이 생깁니다/);
  });
  it('갈리는 정직 기간 — 두 값 13.7903…일 / 15일', () => {
    const { v } = show(run(248, { 'unfair-suspension': 20, absence: 35 }));
    expect(v.verdict).toEqual([
      '부당하다고 확정된 정직 기간을 어떻게 보느냐에 따라 갈립니다.',
      '빼는 날로 보면(근로기준과-3296) 출근율 77.82%, 빼는 날을 뺀 출근율 84.64% → 15일 × 228/248 = 13.7903…일이 생깁니다.',
      '출근한 것으로 보면(대법원 2011다95519 부당해고 법리를 옮긴 경우) 출근율 85.88% → 15일이 생깁니다.',
    ]);
    expect(v.amounts).toEqual([
      { label: '빼는 날로 보면', value: '13.7903…일' },
      { label: '출근한 것으로 보면', value: '15일' },
    ]);
  });
  it('입사 8개월 — 1년 미만(일수 칸 없음, 다음 할 일 있음)', () => {
    const r = run(250, { absence: 5 }, { hireDate: '2024-03-04', accrualDate: '2024-11-04' });
    const { v } = show(r);
    expect(v.verdict).toEqual(['계속 근로 1년이 되지 않았습니다.', '출근율과 관계없이 1개월 개근할 때마다 1일이 생깁니다(근로기준법 제60조제2항).']);
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toMatch(/한 달씩 개근 확인/);
  });
});

describe('옛 답 카드 글자가 같은 순서로 모두 남는다', () => {
  const cases = [
    run(250, { absence: 5 }), run(248, { absence: 49 }), run(248, { absence: 50 }), run(248, { 'lawful-strike': 48, absence: 10 }),
    run(250, { 'union-fulltime': 250 }, { hireDate: '2021-03-04', accrualDate: '2026-03-04' }),
    run(248, { 'unfair-suspension': 20, absence: 35 }),
    run(250, {}, { hireDate: '2024-03-04', accrualDate: '2024-11-04' }),
  ];
  it.each(cases.map((r, i) => [i, r] as const))('사례 %i', (_i, r) => {
    const { t } = show(r);
    inOrder(t, [...headline(r), ...effectLines(r)]);
  });
});

describe('verify-llg journey 기대 글자(화면 순서)', () => {
  const steps: [Days, RegExp, number?, { hireDate: string; accrualDate: string }?][] = [
    [{ absence: 49 }, /80\.24%로 80% 이상.*15일/, 248],
    [{ absence: 50 }, /79\.83%로 80%에 못 미칩니다.*1개월 개근할 때마다 1일/, 248],
    [{ absence: 50 }, /80\.00%로 80% 이상/, 250],
    [{ 'lawful-strike': 48, absence: 1 }, /80\.24%.*15일.*줄이지 않습니다/, 248],
    [{ 'lawful-strike': 48, absence: 10 }, /76\.61%.*95\.00%.*12\.0967…일/, 248],
    [{ 'union-fulltime': 100, absence: 10 }, /10\.2일/, 250, { hireDate: '2021-03-04', accrualDate: '2026-03-04' }],
    [{ 'union-fulltime': 250 }, /생기지 않습니다/, 250, { hireDate: '2021-03-04', accrualDate: '2026-03-04' }],
    [{ 'unfair-suspension': 20, absence: 35 }, /갈립니다.*13\.8일.*15일/, 250],
    [{ 'unfair-dismissal': 200 }, /100\.00%.*15일/, 250],
    [{}, /1년이 되지 않았습니다.*1개월 개근/, 250, { hireDate: '2024-03-04', accrualDate: '2024-11-04' }],
  ];
  it.each(steps.map((s, i) => [i, ...s] as const))('단계 %i', (_i, days, re, S = 250, dates = Y2) => {
    expect(show(run(S, days, dates)).t).toMatch(re);
  });
});

describe('해당 없음·1개월 개근에도 다음 할 일', () => {
  it('노조 전임 1년 전부 — 생기지 않음 + 단체협약 안내', () => {
    const { v } = show(run(250, { 'union-fulltime': 250 }));
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toMatch(/단체협약·취업규칙/);
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
  it('80% 미만·비례 없음 — 1개월 개근 안내', () => {
    const { v } = show(run(248, { absence: 50 }));
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toBeTruthy();
  });
});

describe('공통 — 링크·근거·기준일·금지어', () => {
  const views: ResultView[] = [
    run(250, { absence: 5 }), run(248, { absence: 50 }), run(250, { 'union-fulltime': 250 }),
    run(248, { 'unfair-suspension': 20, absence: 35 }), run(250, {}, { hireDate: '2024-03-04', accrualDate: '2024-11-04' }),
  ].map(attendanceRateView);
  it('다음 할 일은 1~2개, 실제 경로, 같은 href 두 번 없음', () => {
    for (const v of views) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      expect(new Set(v.next.map((n) => n.href)).size).toBe(v.next.length);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 법제처 조문 주소', () => {
    for (const v of views) for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조$/);
  });
  it('기준일 데이터가 코드에 없어 asOf 는 비운다', () => {
    for (const v of views) expect(v.asOf).toEqual([]);
  });
  it('금지어·느낌표·이모지·해요체 없음', () => {
    for (const v of views) {
      const t = domText(v);
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
    expect(src).toMatch(/attendanceRateView\(/);
    expect(src).toMatch(/attendanceRateNotes\(/);
  });
  it('블록 안 문단은 글자색을 지정하지 않는다(잉크 반전 바탕에 muted·ink·회색이면 어두운 글자)', () => {
    const inside = [...src.matchAll(/<ResultBlock[\s\S]*?<\/ResultBlock>/g)].map((m) => m[0]);
    expect(inside.length).toBeGreaterThan(0);
    for (const b of inside) expect(b).not.toMatch(/style=\{(?:muted|ink)\}|grey-|gray-|text-\[var\(--color-text/);
  });
  it('오류 카드(section aria-live)는 그대로 둔다', () => {
    expect(src).toMatch(/<section className=\{card\} aria-live="polite">/);
  });
  it('라디오·체크 라벨이 없다(있으면 choiceLabel)', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((x) => x[0]);
    expect(labels).toEqual([]);
  });
});
