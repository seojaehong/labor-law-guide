// 퇴직소득세 계산기 → 공용 결과 블록(261124). 숫자·문장은 261124 이전 화면에서 뽑은 글자 그대로다.
// 세무사법 위험 표지(reference_tax_calculator_semusa_law): 「예상」 결과명·원천징수의무자(회사) 고지(D4 261126)·홈택스 모의계산 링크를 약하게 만들지 않는다.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BASIC_TAX_RATES, calcRetirementTax } from '@/lib/calc/retirement-tax';
import { TOOLS } from '@/content/tools-registry';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { ResultView } from '@/components/tool-result/result-view';
import { retirementTaxView } from '@/app/tools/retirement-tax/result';

const TODAY = '2026-11-24';
const view = (pay: number, hire: string, last: string) =>
  retirementTaxView({ r: calcRetirementTax({ pay, hireDate: hire, lastWorkDate: last }), hire, last, today: TODAY });

const T03 = view(20_000_000, '2021-08-01', '2026-07-31');
const T13 = view(60_000_000, '2014-01-02', '2026-07-15');
const ZERO = view(2_500_000, '2023-07-03', '2026-07-02');

const allText = (v: ResultView) => [
  v.status, ...v.verdict, ...(v.meta ?? []), ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.formula ?? '', ...(v.warnings ?? []), ...v.basis.map((b) => b.label), ...v.asOf, v.caveat ?? '', v.nextNote ?? '', ...v.next.map((n) => n.label),
].join('\n');

function hrefExists(href: string): boolean {
  if (TOOLS.some((t) => t.href === href)) return true;
  if (href.endsWith('.html')) return existsSync(`public${href}`);
  return existsSync(`src/app${href}/page.tsx`);
}

describe('퇴직소득세 결과 블록 — 숫자 고정(261124 이전 화면 글자)', () => {
  it('2,000만원 · 5년: 판정 문장과 금액·근속·과세표준 줄이 그대로다', () => {
    expect(T03.verdict[0]).toBe('예상 퇴직소득세는 280,000원, 지방소득세는 28,000원입니다.');
    expect(T03.amounts.map((a) => [a.label, a.value])).toEqual([['예상 퇴직소득세', '280,000원'], ['예상 지방소득세', '28,000원']]);
    expect(T03.meta).toContain('근속연수 5년(60개월) · 과세표준 11,200,000원 · 세율 6% 구간(소득세법 제55조) · 합계 308,000원');
    expect(T03.meta).toContain('입사 2021년 8월 1일(일) · 퇴사 7월 31일(금)');
    expect(T03.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
  });
  it('6,000만원 · 13년(151개월) · 10원 절사: 691,990원 · 69,190원', () => {
    expect(T13.amounts.map((a) => a.value)).toEqual(['691,990원', '69,190원']);
    expect(T13.meta).toContain('근속연수 13년(151개월) · 과세표준 10,646,154원 · 세율 6% 구간(소득세법 제55조) · 합계 761,180원');
  });
});

describe('퇴직소득세 0원 — 이유와 다음 할 일', () => {
  it('판정은 이유를 말하고 금액 칸은 비우며, 다음 할 일이 실제 경로다', () => {
    expect(ZERO.verdict).toEqual(['예상 퇴직소득세는 0원입니다.', '퇴직급여가 근속연수공제(3,000,000원)보다 적어 공제하고 남는 금액이 없습니다.']);
    expect(ZERO.amounts).toEqual([]);
    expect(ZERO.meta).toContain('근속연수 3년(36개월) · 과세표준 0원 · 합계 0원');
    expect(ZERO.nextNote).toMatch(/퇴직급여/);
    expect(ZERO.next.length).toBeGreaterThanOrEqual(1);
    expect(ZERO.next.length).toBeLessThanOrEqual(2);
    for (const v of [T03, ZERO]) for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
  });
});

describe('퇴직소득세 — 기준일은 코드의 세율표 확인일에서만', () => {
  it('소득세법 제55조 기본세율표(BASIC_TAX_RATES) 확인일을 그대로 쓴다', () => {
    expect(T03.asOf).toEqual([`소득세법 제55조 기본세율(${BASIC_TAX_RATES[0].from.slice(0, 4)}년 이후 과세기간) 기준 · 확인 2026.10.29.`]);
    expect(BASIC_TAX_RATES[0].checked).toBe('2026-10-29');
  });
  it('근거 조문은 법제처 원문 링크다', () => {
    expect(T03.basis.map((b) => b.label)).toEqual(['소득세법 제48조(퇴직소득공제)', '소득세법 제55조(세율)', '소득세법 제146조']);
    for (const b of T03.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/소득세법\/제\d+조$/);
  });
});

describe('퇴직소득세 — 퇴직소득세 전용 고지(D4 261126 → F1 261127)', () => {
  const client = readFileSync('src/app/tools/retirement-tax/RetirementTaxClient.tsx', 'utf8');
  it('결과 블록 안(children)에 「참고용 계산이며, 퇴직금을 현금으로 받으면 회사가 원천징수합니다. IRP로 옮기면 …」(RETIREMENT_TAX_NOTICE)와 홈택스 모의계산 링크가 남는다', () => {
    const block = client.slice(client.indexOf('<ResultBlock'), client.indexOf('</ResultBlock>'));
    expect(block).toContain('{RETIREMENT_TAX_NOTICE}');
    expect(block).not.toContain('회사가 직접 합니다');
    expect(block).toContain('href={HOMETAX.href}');
    expect(block).toContain('{HOMETAX.note}');
    expect(client).not.toContain('AnswerCard');
    // 결과 블록은 잉크 반전 바탕이다 — 고지에 회색(muted)을 주면 어두운 바탕에 어두운 글자가 된다. 블록 보조색(--rb-sub)을 쓴다
    expect(block).not.toContain('style={muted}');
    expect(block).toContain("color: 'var(--rb-sub)'");
  });
  it('결과 글자에 금지어·느낌표·해요체·「확정」 단정이 없다', () => {
    for (const v of [T03, T13, ZERO]) {
      const t = allText(v);
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|해요|에요|예요|세액 확정|환급 확정/);
    }
  });
});
