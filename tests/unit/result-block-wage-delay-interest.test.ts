// 임금 지연이자 결과 블록(261124) — 공용 ResultBlock 으로 옮긴 뒤에도 화면 글자가 같은지 고정한다.
// 기대 글자는 옮기기 전 화면(headline·itemLine·「마지막 근무일 …」 JSX)에서 실측한 것이다(오늘 = 2026-11-24 고정).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { rateOn } from '@/content/rates';
import { TOOLS } from '@/content/tools-registry';
import { calcWageDelayInterest, type WageDelayInput } from '@/lib/calc/wage-delay-interest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_ESTIMATE, dotDate, type ResultView } from '@/components/tool-result/result-view';
import { wageDelayView } from '@/app/tools/wage-delay-interest/result';

const TODAY = '2026-11-24';
const CLIENT = 'src/app/tools/wage-delay-interest/WageDelayInterestClient.tsx';

function view(input: WageDelayInput, exclusions?: { from: string; to: string }[]) {
  const full = calcWageDelayInterest(input);
  if (!exclusions) return wageDelayView({ r: full, today: TODAY, lastWorkDay: input.lastWorkDay });
  const r = calcWageDelayInterest({ ...input, exclusions });
  return wageDelayView({ r, full, today: TODAY, lastWorkDay: input.lastWorkDay });
}

const A = { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement' as const, amount: 10_000_000, paidDate: '2026-06-30' }] };
const B1 = { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement' as const, amount: 10_000_000, paidDate: '2026-04-14' }] };
const E1 = { items: [{ kind: 'periodic' as const, amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2025-11-25' }] };
const F = { lastWorkDay: '2026-01-31', items: [{ kind: 'retirement' as const, amount: 20_000_000, paidDate: '2026-12-31' }] };
const F_EXCL = [{ from: '2026-02-15', to: '2026-09-30' }];

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

describe('임금 지연이자 결과 블록 — 글자 고정(옮기기 전 화면 실측)', () => {
  it('A 퇴직금 421,917원: 답 문장 · 항목 줄 · 마지막 근무일 줄', () => {
    const v = view(A);
    expect(v.status).toBe(STATUS_ESTIMATE);
    expect(v.verdict).toEqual([
      '지연이자는 모두 421,917원입니다.',
      '항목마다 지급해야 했던 날의 다음 날부터 지급한 날까지 연 20%로 일할 계산했습니다(근로기준법 제37조 제1항, 시행령 제17조).',
    ]);
    expect(v.meta).toEqual([
      '항목 1 10,000,000원 · 기준일 4월 14일(화): 퇴직 때 정산하는 임금·퇴직금 — 마지막 근무일에서 14일째 되는 날(근로기준법 제37조 제1항 제1호) · 6월 30일(화) 지급까지 지연 77일 → 지연이자 421,917원',
      '마지막 근무일 3월 31일(화)',
    ]);
    expect(v.amounts).toEqual([{ label: '지연이자 합계', value: '421,917원' }]);
  });
  it('F 적용 제외: 빼면 1,008,219원 · 빼지 않으면 3,506,849원, 단정하지 않는 문장 그대로', () => {
    const v = view(F, F_EXCL);
    expect(v.verdict).toEqual([
      '지연이자는 적용 제외 기간을 빼면 1,008,219원, 빼지 않으면 3,506,849원입니다.',
      '적용 제외 사유가 있으면 이 기간은 적용하지 않을 수 있습니다. 사유에 해당하는지는 회사가 주장하고 법원이 정합니다(근로기준법 제37조 제3항, 시행령 제18조).',
    ]);
    expect(v.meta?.[0]).toBe('항목 1 20,000,000원 · 기준일 2월 14일(토): 퇴직 때 정산하는 임금·퇴직금 — 마지막 근무일에서 14일째 되는 날(근로기준법 제37조 제1항 제1호) · 12월 31일(목) 지급까지 지연 320일, 적용 제외 228일을 빼면 92일 → 지연이자 1,008,219원');
    expect(v.amounts.map((a) => a.value)).toEqual(['1,008,219원', '3,506,849원']);
  });
});

describe('0원·해당 없음에도 다음 할 일', () => {
  it('B1 14일째 지급 = 붙지 않음 + 항목 줄 + nextNote + next', () => {
    const v = view(B1);
    expect(v.verdict).toEqual(['지연이자가 붙지 않습니다.', '모든 항목을 기준일까지 지급했습니다. 지급한 날이 기준일과 같거나 앞섭니다.']);
    expect(v.meta?.[0]).toBe('항목 1 10,000,000원 · 기준일 4월 14일(화): 퇴직 때 정산하는 임금·퇴직금 — 마지막 근무일에서 14일째 되는 날(근로기준법 제37조 제1항 제1호) · 4월 14일(화) 지급까지 지연 0일 → 지연이자 0원');
    expect(v.amounts).toEqual([]);
    expect(v.nextNote).toBeTruthy();
  });
  it('E1 재직 중 시행 전 정기지급일 = 붙지 않음(부칙 제2조), 마지막 근무일 줄 없음', () => {
    const v = view(E1);
    expect(v.verdict).toEqual([
      '지연이자가 붙지 않습니다.',
      '정기지급일이 2025년 10월 23일 전인 임금은 재직 중 이 지연이자가 붙지 않습니다(법률 제20520호 부칙 제2조). 퇴직할 때까지 받지 못하면 마지막 근무일에서 14일째 되는 날의 다음 날부터 붙습니다.',
    ]);
    expect(v.meta).toEqual(['항목 1 3,000,000원 · 2025년 10월 23일 전 정기지급일 — 재직 중에는 이 지연이자가 붙지 않습니다(법률 제20520호 부칙 제2조) → 지연이자 0원']);
    expect(v.nextNote).toBeTruthy();
  });
});

describe('기준일 — rates.ts 의 지연이자율 줄에서만', () => {
  it('연 20% · 확인일 = wageDelayInterestPerMillion.checked', () => {
    const rate = rateOn('wageDelayInterestPerMillion', TODAY)!;
    expect(view(A).asOf).toEqual([`지연이자율 연 ${rate.value / 10_000}%(근로기준법 시행령 제17조) 기준 · 확인 ${dotDate(rate.checked)}`]);
    expect(view(A).asOf[0]).toContain('연 20%');
  });
});

describe('공통 — 링크·금지어·문체', () => {
  const views = [view(A), view(B1), view(E1), view(F, F_EXCL)];
  it('다음 할 일은 1~2개이고 실제로 있는 경로다', () => {
    for (const v of views) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 법제처 조문 주소이고 같은 주소가 두 번 나오지 않는다', () => {
    for (const v of views) {
      for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
      expect(new Set(v.basis.map((b) => b.href)).size).toBe(v.basis.length);
    }
  });
  it('금지어·느낌표·이모지·해요체가 없다', () => {
    for (const v of views) {
      const t = allText(v);
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/해요|예요|에요/);
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
    expect(src).toContain('지금 일하고 있습니까?');
    expect(src).toContain('어떤 돈입니까?');
  });
  it('라디오·체크 라벨 6개(항목별 적용 제외 체크 포함, P3 #5)가 모두 choiceLabel', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(6);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
