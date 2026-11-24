// 통상임금 점검 답 카드(261124) — 공용 ResultBlock 으로 옮긴 뒤에도 화면 글자가 같은지 고정한다.
// 기대 글자는 옮기기 전 화면(summaryLines 와 JSX 의 기준별 비교 줄)에서 실측한 것이다. 첫 화면 두 항목(verify.mts 와 같은 입력).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import {
  AGREED_WAGE_NOTICE, OLD_ERA_NOTICE, RIGHT_TO_PAY_NOTICE, checkItem, sumIncluded, type Era, type WageItem,
} from '@/lib/calc/ordinary-wage-check';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_COMPARE, type ResultView } from '@/components/tool-result/result-view';
import { ordinaryWageView } from '@/app/tools/ordinary-wage-check/result';

const CLIENT = 'src/app/tools/ordinary-wage-check/OrdinaryWageClient.tsx';

const START: WageItem[] = [
  { kind: 'base', name: '기본급', amount: 2_500_000, timesPerYear: 12, regular: 'yes', uniform: 'yes', forWork: 'yes', employedOnPayday: false },
  { kind: 'bonus', name: '정기상여금', amount: 2_500_000, timesPerYear: 6, regular: 'yes', uniform: 'yes', forWork: 'yes', employedOnPayday: true },
];
const UNKNOWN: WageItem[] = [
  { kind: 'other', name: '기타', amount: 100_000, timesPerYear: 12, regular: 'unknown', uniform: 'unknown', forWork: 'unknown' },
];

function view(items: WageItem[], era: Era, invalid = 0) {
  return ordinaryWageView({
    era,
    checks: items.map((i) => checkItem(i, era)),
    cur: sumIncluded(items, era, 209),
    neu: sumIncluded(items, 'new', 209),
    old: sumIncluded(items, 'old', 209),
    hours: 209,
    invalid,
    payday: items.some((i) => i.employedOnPayday),
  });
}

const allText = (v: ResultView) => [
  v.status, ...v.verdict, ...(v.meta ?? []), ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.formula ?? '', ...(v.warnings ?? []), ...v.basis.map((b) => b.label), ...v.asOf, v.caveat ?? '', v.nextNote ?? '', ...v.next.map((n) => n.label),
].join('\n');

function hrefExists(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (TOOLS.some((t) => t.href === href)) return true;
  if (href.endsWith('.html')) return existsSync(`public${href}`);
  return existsSync(`src/app${href}/page.tsx`);
}

const COMPARE_LINE = '새 기준(2024. 12. 19. 이후 제공분) 시간당 17,942.58원 · 종전 기준(2024. 12. 18.까지 제공분) 시간당 11,961.72원';

describe('통상임금 답 카드 — 글자 고정(옮기기 전 화면 실측)', () => {
  it('새 기준: 2개 · 시간당 17,942.58원(45,000,000 ÷ 12 ÷ 209)', () => {
    const v = view(START, 'new');
    expect(v.status).toBe(STATUS_COMPARE);
    expect(v.verdict).toEqual([
      '새 기준(2024. 12. 19. 이후 제공분)으로 통상임금에 들어가는 쪽으로 볼 요소가 있는 항목은 2개입니다.',
      '그 항목만 더해 시간급을 내면 시간당 17,942.58원입니다(참고).',
    ]);
    expect(v.meta).toEqual([COMPARE_LINE]);
    expect(v.amounts).toEqual([{ label: '시간급(참고)', value: '시간당 17,942.58원', note: ['들어가는 쪽 항목 1년 합계 45,000,000원 ÷ 12 ÷ 209시간'] }]);
    expect(v.warnings).toEqual([RIGHT_TO_PAY_NOTICE]);
    expect(v.caveat).toBe(AGREED_WAGE_NOTICE);
  });
  it('종전 기준: 1개 · 시간당 11,961.72원 + 병행사건 안내가 맨 앞 주의', () => {
    const v = view(START, 'old');
    expect(v.verdict).toEqual([
      '종전 기준(2024. 12. 18.까지 제공분)으로 통상임금에 들어가는 쪽으로 볼 요소가 있는 항목은 1개입니다.',
      '그 항목만 더해 시간급을 내면 시간당 11,961.72원입니다(참고).',
    ]);
    expect(v.meta).toEqual([COMPARE_LINE]);
    expect(v.warnings?.[0]).toBe(OLD_ERA_NOTICE);
    expect(v.warnings?.[0]).toContain('병행사건');
  });
  it('입력 오류 항목 수도 그대로', () => {
    expect(view(START, 'new', 1).verdict).toContain('1개 항목은 입력을 확인해 주세요. 합계에서 뺐습니다.');
  });
});

describe('들어가는 쪽 항목이 없을 때 — 다음 할 일', () => {
  it('보류 1개: 없음 문장 + 「항목 없음」 비교 줄 + nextNote + next', () => {
    const v = view(UNKNOWN, 'new');
    expect(v.verdict).toEqual([
      '새 기준(2024. 12. 19. 이후 제공분)으로 통상임금에 들어가는 쪽으로 볼 요소가 있는 항목이 없습니다.',
      '1개는 입력만으로 가리기 어려워 합계에서 뺐습니다.',
    ]);
    expect(v.meta).toEqual(['새 기준(2024. 12. 19. 이후 제공분) 들어가는 쪽 항목 없음 · 종전 기준(2024. 12. 18.까지 제공분) 들어가는 쪽 항목 없음']);
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toBeTruthy();
    expect(v.warnings).toEqual([]);
    expect(v.caveat).toBe(AGREED_WAGE_NOTICE);
  });
});

describe('기준일 — 코드에 값이 없어 비운다', () => {
  it('asOf = []', () => {
    expect(view(START, 'new').asOf).toEqual([]);
  });
});

describe('공통 — 링크·금지어·단정·문체', () => {
  const views = [view(START, 'new'), view(START, 'old'), view(UNKNOWN, 'new'), view(UNKNOWN, 'old')];
  // calc-ordinary-wage-check.test.ts 의 ASSERTIVE 와 같다 — 상태 띠(「확정 판단이 아닙니다」)는 부정문이라 빼고 본다
  const ASSERTIVE = /확정|산입됩니다|산입되지 않습니다|해당합니다|해당하지 않습니다|쪽입니다|쪽으로 봅니다|생기지 않는다고 봅니다/;
  it('다음 할 일은 1~2개이고 실제로 있는 경로다', () => {
    for (const v of views) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 법제처 조문 주소다', () => {
    for (const v of views) for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
  });
  it('금지어·느낌표·이모지·해요체·단정어가 없다', () => {
    for (const v of views) {
      const t = allText(v);
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/해요|예요|에요/);
      expect(allText({ ...v, status: '' })).not.toMatch(ASSERTIVE);
    }
  });
});

describe('화면 — 공용 블록·44px 선택지', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('ResultBlock 을 쓰고 AnswerCard 를 쓰지 않는다', () => {
    expect(src).toMatch(/<ResultBlock /);
    expect(src).not.toMatch(/AnswerCard/);
  });
  it('입력 화면 문구도 합니다체 — 「~나요」「~인가요」를 쓰지 않는다', () => {
    expect(src).not.toMatch(/[가-힣](나요|인가요|해요|예요|에요)[?<'"\s]/);
    expect(src).toContain('일정 근무일수(또는 출근율)를 채워야 받습니까?');
  });
  it('라디오·체크 라벨 7개(예·아니오·모름, 실적 기간, 일수 조건, 체크 4개)가 모두 choiceLabel', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(7);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
