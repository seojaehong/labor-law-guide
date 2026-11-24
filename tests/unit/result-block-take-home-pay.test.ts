// 실수령액 계산기 — 공용 결과 블록(result.ts) 이전을 고정한다(261124).
// ① 답 문장·공제 항목 줄(이름·금액·근거)·공제 합계는 이전 직전(AnswerCard) 화면에서 뽑은 글자 그대로다.
// ② 「세무대리·신고서 작성 대행이 아닙니다 …」와 홈택스 링크는 결과 블록 안에 글자 그대로 남는다(종전엔 카드 밖 한 줄).
// ③ 과세 급여 1,000만원 초과는 소득세를 계산하지 않는다 — 실수령액 금액 칸을 내지 않는다.
// ④ 기준일은 rates.ts 의 from·checked(takeHomeRatesOn 이 읽는 열 개 키)와 간이세액표 개정일 상수에서만 나온다.
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { rateOn } from '@/content/rates';
import { TOOLS } from '@/content/tools-registry';
import { calcTakeHomePay, takeHomeRatesOn, type TakeHomeInput } from '@/lib/calc/take-home-pay';
import { WITHHOLDING_REVISION } from '@/lib/calc/wage-withholding-2026-02-27';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_ESTIMATE, type ResultView } from '@/components/tool-result/result-view';
import { allCopy, HOMETAX_LINE, HOMETAX_URL, NOTICE } from '@/app/tools/take-home-pay/copy';
import { TAKE_HOME_RATE_KEYS, takeHomeAsOf, takeHomeView } from '@/app/tools/take-home-pay/result';
import TakeHomePayClient from '@/app/tools/take-home-pay/TakeHomePayClient';

const CLIENT = 'src/app/tools/take-home-pay/TakeHomePayClient.tsx';
const DATE = '2026-11-24';
const RATES = takeHomeRatesOn(DATE)!;
const view = (i: TakeHomeInput) => takeHomeView({ r: calcTakeHomePay(i, RATES), date: DATE });

const allText = (x: ResultView) => [
  x.status, ...x.verdict, ...(x.meta ?? []), ...x.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  x.formula ?? '', ...(x.warnings ?? []), ...x.basis.map((b) => b.label), ...x.asOf, x.caveat ?? '', x.nextNote ?? '', ...x.next.map((n) => n.label),
].join('\n');

function hrefExists(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (TOOLS.some((t) => t.href === href)) return true;
  if (href.endsWith('.html')) return existsSync(`public${href}`);
  return existsSync(`src/app${href}/page.tsx`);
}

const BASE_ITEMS = [
  '국민연금 133,000원 — 국민연금법 제88조제3항·부칙 제4조, 시행령 제5조',
  '건강보험 100,660원 — 국민건강보험법 제69조제4항·제76조제1항, 시행령 제44조제1항',
  '장기요양보험 13,220원 — 노인장기요양보험법 제9조제1항, 시행령 제4조',
  '고용보험 25,200원 — 보험료징수법 제13조제2항, 시행령 제12조제1항제2호',
  '소득세 56,800원 — 소득세법 제134조제1항, 시행령 제189조제1항 [별표2]·제194조제1항',
  '지방소득세 5,680원 — 지방세법 제103조의13제1항',
];

describe('숫자 고정 — 261124 이전 화면 실측과 같은 글자', () => {
  it('300만·식대 20만·1인: 답 문장, 실수령액, 공제 합계와 항목 줄', () => {
    const x = view({ pay: 3_000_000, meal: 200_000, family: 1 });
    expect(x.status).toBe(STATUS_ESTIMATE);
    expect(x.verdict).toEqual(['예상 실수령액은 2,665,440원입니다.', '월 급여 3,000,000원에서 4대보험 272,080원과 소득세·지방소득세 62,480원을 뺐습니다.']);
    expect(x.amounts.map((a) => [a.label, a.value])).toEqual([['예상 실수령액', '2,665,440원'], ['예상 공제 합계', '334,560원']]);
    expect(x.amounts[1].note).toEqual(BASE_ITEMS);
    expect(x.nextNote).toBeUndefined();
  });
  it('화면 렌더(첫 화면 = 300만·식대 20만·1인)에 같은 글자와 고지·홈택스 링크가 결과 블록 안에 있다', () => {
    // 화면은 오늘(KST) 요율을 고른다 — 시계를 2026-11-24 로 묶어 요율이 바뀌는 날(2027. 1. 1. 등)에도 같은 숫자를 본다
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T03:00:00Z'));
    let html: string;
    try {
      html = renderToStaticMarkup(createElement(TakeHomePayClient));
    } finally {
      vi.useRealTimers();
    }
    const at = html.indexOf('aria-live="polite"');
    const block = html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
    for (const s of ['예상 실수령액은 2,665,440원입니다.', '334,560원', '국민연금 133,000원', '지방소득세 5,680원', NOTICE, HOMETAX_LINE, `href="${HOMETAX_URL}"`]) {
      expect(block, s).toContain(s);
    }
  });
});

describe('0원·계산하지 않음 — 까닭과 다음 할 일', () => {
  it('106만·80%: 소득세 830원 → 0원, 까닭 줄', () => {
    const x = view({ pay: 1_060_000, family: 1, ratio: 80 });
    expect(x.verdict[0]).toBe('예상 실수령액은 957,010원입니다.');
    expect(x.amounts[1].note).toContain('소득세 0원 — 계산한 830원이 1천원 미만이라 징수하지 않습니다(소득세법 제86조제1호)');
    expect(x.nextNote).toBeTruthy();
    expect(x.next.length).toBeGreaterThanOrEqual(1);
  });
  it('과세 급여 1,000만원 초과: 소득세 계산하지 않음, 실수령액 금액 칸 없음', () => {
    const x = view({ pay: 10_000_001, family: 1 });
    expect(x.verdict).toEqual(['월 과세 급여가 1,000만원을 넘어 이 도구는 소득세를 계산하지 않습니다.', '4대보험 근로자 몫은 809,750원으로 예상됩니다.']);
    expect(x.amounts.map((a) => [a.label, a.value])).toEqual([['예상 4대보험 근로자 몫', '809,750원']]);
    expect(x.amounts[0].note).toContain('소득세 계산하지 않음 — 과세 급여 1,000만원 초과');
    expect(x.amounts.some((a) => a.label.includes('실수령액'))).toBe(false);
    expect(x.nextNote).toBeTruthy();
    expect(x.next.length).toBeGreaterThanOrEqual(1);
  });
});

describe('기준일 — rates.ts 의 from·checked 와 간이세액표 개정일', () => {
  it('열 개 키는 takeHomeRatesOn 이 읽는 키 그대로다', () => {
    const src = readFileSync('src/lib/calc/take-home-pay.ts', 'utf8');
    const used = [...src.matchAll(/rateOn\('([A-Za-z]+)'/g)].map((m) => m[1]).sort();
    expect([...TAKE_HOME_RATE_KEYS].sort()).toEqual(used);
  });
  it('적용 시작일·확인일은 그 키들 줄의 from·checked(가장 이른 날~가장 늦은 날), 간이세액표는 개정일만(확인일 상수 없음)', () => {
    const dot = (s: string) => `${s.replace(/-/g, '.')}.`;
    const spanOf = (xs: string[]) => {
      const s = [...xs].sort();
      return s[0] === s.at(-1) ? dot(s[0]) : `${dot(s[0])}~${dot(s.at(-1)!)}`;
    };
    const rows = TAKE_HOME_RATE_KEYS.map((k) => rateOn(k, DATE)!);
    const from = spanOf(rows.map((r) => r.from));
    const checked = spanOf(rows.map((r) => r.checked));
    expect(takeHomeAsOf(DATE)).toEqual([
      `4대보험 요율·한도와 식대 비과세 한도(적용 시작 ${from}) 기준 · 확인 ${checked}`,
      `근로소득 간이세액표 ${WITHHOLDING_REVISION} 기준`,
    ]);
    expect(from).toBe('2026.01.01.~2026.07.01.');
    expect(checked).toBe('2026.10.28.~2026.10.29.');
    // 오늘 날짜를 기준일로 적지 않는다(result-view.ts — 「오늘 날짜에서 만들지 않는다」)
    expect(takeHomeAsOf(DATE).join(' ')).not.toContain('2026.11.24.');
    expect(view({ pay: 3_000_000, meal: 200_000, family: 1 }).asOf).toEqual(takeHomeAsOf(DATE));
  });
  it('근거 링크는 법제처 주소이고 겹치지 않는다', () => {
    const hrefs = view({ pay: 3_000_000, family: 1 }).basis.map((b) => b.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
  });
  it('화면은 같은 날짜(today)로 요율과 기준일 줄을 고른다', () => {
    const src = readFileSync(CLIENT, 'utf8');
    expect(src).toMatch(/takeHomeRatesOn\(today\)/);
    expect(src).toMatch(/takeHomeView\(\{[^}]*date: today/);
  });
});

describe('세무 위험 표지 — 결과 블록 안에 글자 그대로', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('고지 글자와 홈택스 주소는 바뀌지 않았다', () => {
    expect(NOTICE).toBe('세무대리·신고서 작성 대행이 아닙니다. 입력한 숫자로 계산한 예상 금액입니다.');
    expect(HOMETAX_URL).toBe('https://www.hometax.go.kr/');
    expect(HOMETAX_LINE).toBe('홈택스의 「근로소득 간이세액표」(매달 떼는 소득세)와 「연말정산 미리보기」(1년 치)로 한 번 더 볼 수 있습니다.');
  });
  it('고지는 ResultBlock children 이고 회색(muted)·ink 로 덮지 않는다', () => {
    const m = src.match(/<ResultBlock view=\{takeHomeView\([^)]*\)\}>([\s\S]*?)<\/ResultBlock>/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/\{NOTICE\}/);
    expect(m![1]).toMatch(/href=\{HOMETAX_URL\}/);
    expect(m![1]).toMatch(/\{HOMETAX_LINE\}/);
    expect(m![1]).not.toMatch(/style=\{(muted|ink)\}/);
    expect(src).not.toMatch(/<AnswerCard /);
  });
  it('「확정」 단정·금지어·느낌표·해요체가 없다', () => {
    const views = [
      view({ pay: 3_000_000, meal: 200_000, family: 1 }), view({ pay: 1_060_000, family: 1, ratio: 80 }), view({ pay: 10_000_001, family: 1 }),
      view({ pay: 4_000_000, meal: 200_000, family: 4, children: 2 }), view({ pay: 3_000_000, family: 1, npsExempt: true, employmentExempt: true }),
    ];
    for (const x of views) {
      const t = allText(x);
      expect(bannedHits(t)).toEqual([]);
      expect(t.replace(/확정 금액이 아닙니다/g, '')).not.toMatch(/확정/);
      expect(t).not.toMatch(/[!！]|해요|예요|에요/);
      expect(t).not.toMatch(/연락|문의/);
      for (const n of x.next) expect(hrefExists(n.href), n.href).toBe(true);
      expect(x.next.length).toBeGreaterThanOrEqual(1);
      expect(x.next.length).toBeLessThanOrEqual(2);
      for (const a of x.amounts) expect(a.label).toContain('예상');
    }
  });
});

describe('라디오·체크 라벨은 44px 히트 영역(choiceLabel)', () => {
  it('비율 라디오(map 한 줄) + 체크 둘', () => {
    const src = readFileSync(CLIENT, 'utf8');
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(3);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});

describe('폴더 화면 문구(allCopy) — 느낌표·이모지·해요체 없음', () => {
  it('기본·0원·표 밖의 화면 문장 전부', () => {
    for (const i of [{ pay: 3_000_000, meal: 200_000, family: 1 }, { pay: 1_060_000, family: 1, ratio: 80 as const }, { pay: 10_000_001, family: 1 }]) {
      expect(allCopy(calcTakeHomePay(i, RATES), RATES).join('\n')).not.toMatch(/[!！]|해요|예요|에요|\p{Extended_Pictographic}/u);
    }
  });
});
