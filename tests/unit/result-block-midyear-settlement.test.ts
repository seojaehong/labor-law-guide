// 중도퇴사 연말정산 계산기 — 공용 결과 블록(result.ts) 이전을 고정한다(261124).
// ① 답 문장·근거 줄·대조 줄은 이전 직전(AnswerCard) 화면에서 뽑은 글자 그대로다(verify-llg 가 이 순서로 읽는다).
// ② A·B 두 경로는 같은 무게(금액 칸 둘)로 내고 하나를 고르지 않는다. 1천원 미만 추징에는 「징수하지 않음」을 금액 옆에 붙인다.
// ③ 범위 밖(SCOPE_STOP)·기준 없는 해·총급여 1.2억 이상은 멈춘다 — 금액 없음, 추정 띠 아님, 고지·홈택스 링크는 남는다.
// ④ 기준일은 그해 규칙(rules.year·basis·checked)에서만 나온다.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import { calcMidyear, rulesFor, type MidyearInput } from '@/lib/calc/midyear-settlement';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_ESTIMATE, type ResultView } from '@/components/tool-result/result-view';
import { allCopy, HOMETAX_LINK, HOMETAX_URL, NOTICE, SCOPE_STOP } from '@/app/tools/midyear-settlement/copy';
import { midyearScopeStopView, midyearView, STATUS_STOP } from '@/app/tools/midyear-settlement/result';

const CLIENT = 'src/app/tools/midyear-settlement/MidyearSettlementClient.tsx';
const RESULT = 'src/app/tools/midyear-settlement/result.ts';

const S2: MidyearInput = { year: 2026, totalPay: 26_000_000, nonTaxable: 1_200_000, pension: 1_178_000, health: 891_560, longTermCare: 117_240, employment: 223_200, paidIncomeTax: 300_000, paidLocalTax: 29_980, lastMonthSimpleTax: 31_000 };
const S3: MidyearInput = { year: 2026, totalPay: 41_000_000, nonTaxable: 1_000_000, pension: 1_900_000, health: 1_438_000, longTermCare: 188_960, employment: 360_000, paidIncomeTax: 1_500_000, paidLocalTax: 150_000, lastMonthSimpleTax: 160_000 };
const ZERO: MidyearInput = { year: 2026, totalPay: 0, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 0, paidLocalTax: 0, lastMonthSimpleTax: 0 };
const v = (i: MidyearInput) => midyearView(calcMidyear(i));

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

describe('숫자 고정 — 261124 이전 화면 실측과 같은 글자', () => {
  it('S2: 답 문장 A·B·기준 줄, 근거 첫 줄, 대조 줄', () => {
    const x = v(S2);
    expect(x.status).toBe(STATUS_ESTIMATE);
    expect(x.verdict).toEqual([
      '보험료 소득공제를 신청했다면(A) 퇴직월에 소득세 21,840원을 더 내는 것으로 예상합니다. 지방소득세는 2,200원을 더 내는 것으로 예상합니다.',
      '신청하지 않았다면(B) 퇴직월에 소득세 74,890원을 돌려받는 것으로 예상합니다. 지방소득세는 7,470원을 돌려받는 것으로 예상합니다.',
      '어느 쪽인지는 근로자가 건강·장기요양·고용보험료 소득공제를 신청했는지로 정해집니다(소득세법 제52조 제8항, 제59조의4 제9항 제1호).',
    ]);
    expect(x.meta?.[0]).toBe('보험료 소득공제(A)로 계산하면 소득세 +21,840원·지방소득세 +2,200원, 표준세액공제 13만원(B)으로 계산하면 소득세 −74,890원·지방소득세 −7,470원입니다.');
    expect(x.meta?.[4]).toBe('B 예상 결정세액 225,104원 − 이미 낸 소득세 300,000원 = −74,896원, 10원 미만을 0 쪽으로 버려 −74,890원입니다(국고금 관리법 제47조).');
    expect(x.warnings?.[1]).toBe('퇴직월 간이세액 31,000원은 계산에 쓰지 않았습니다. 회사가 퇴직월 급여에서 이 간이세액을 먼저 떼고 그것까지 이미 낸 소득세로 넣어 정산했다면 영수증의 차감징수세액은 A −9,160원, B −105,890원으로 예상합니다(소득세법 제137조 제1항 제3호).');
  });
  it('S2: A·B 금액 칸 둘(같은 무게) — 부호와 지방소득세', () => {
    const x = v(S2);
    expect(x.amounts.map((a) => a.value)).toEqual(['+21,840원', '−74,890원']);
    expect(x.amounts.map((a) => a.note?.[0])).toEqual(['지방소득세 +2,200원', '지방소득세 −7,470원']);
    expect(x.amounts[0].label).toMatch(/^A /);
    expect(x.amounts[1].label).toMatch(/^B /);
    for (const a of x.amounts) expect(a.label).toContain('예상');
    expect(x.formula).toMatch(/\+는 .*더 내는.*−는 .*돌려받는/);
  });
  it('S3: 대조 줄에 영수증 값 A −99,540원, B +68,500원', () => {
    const x = v(S3);
    expect(x.amounts.map((a) => a.value)).toEqual(['+60,450원', '+228,500원']);
    expect(x.warnings?.join(' ')).toContain('영수증의 차감징수세액은 A −99,540원, B +68,500원으로 예상합니다');
  });
  it('X2: 1천원 미만 추징 금액 옆에 「징수하지 않음」', () => {
    const x = v({ ...S2, paidIncomeTax: 225_000, paidLocalTax: 22_000 });
    expect(x.amounts[1].value).toBe('+100원');
    expect(x.amounts[1].note).toContain('1천원 미만이라 징수하지 않음(소득세법 제86조 제1호)');
    expect(x.amounts[0].note ?? []).not.toContain('1천원 미만이라 징수하지 않음(소득세법 제86조 제1호)');
  });
});

describe('0원 — 까닭과 다음 할 일', () => {
  it('급여·세금이 모두 0이면 한 경로 0원 + 까닭', () => {
    const x = v(ZERO);
    expect(x.verdict[0]).toBe('퇴직월에 더 내거나 돌려받을 소득세가 없는 것으로 예상합니다(보험료 소득공제와 표준세액공제 어느 쪽으로 계산해도 같음).');
    expect(x.amounts.map((a) => a.value)).toEqual(['0원']);
    expect(x.nextNote).toMatch(/10원 미만/);
    expect(x.next.length).toBeGreaterThanOrEqual(1);
  });
  it('정산액이 있으면 nextNote 없음', () => {
    expect(v(S2).nextNote).toBeUndefined();
  });
});

describe('멈춤 — 계산하지 않는 세 경우', () => {
  const stops: [string, ResultView, string[]][] = [
    ['범위 밖(SCOPE_STOP)', midyearScopeStopView(), SCOPE_STOP],
    ['총급여 1.2억 이상', v({ ...S2, totalPay: 121_200_000 }), ['총급여(받은 급여 − 비과세) 120,000,000원은 1억 2천만원 이상이라 이 도구가 계산하지 않습니다.', '고정형은 총급여 1억 2천만원 미만까지만 계산합니다.']],
    ['기준 없는 해', v({ ...S2, year: 2024 }), ['2024년 기준은 이 도구에 아직 넣지 않았습니다.', '다른 해 기준으로 계산하지 않습니다.']],
  ];
  it.each(stops)('%s: 문장 그대로, 금액 없음, 추정 띠 아님, 다음 할 일', (_n, x, verdict) => {
    expect(x.verdict).toEqual(verdict);
    expect(x.amounts).toEqual([]);
    expect(x.status).toBe(STATUS_STOP);
    expect(x.status).not.toMatch(/추정/);
    expect(x.nextNote).toBeTruthy();
    expect(x.next.length).toBeGreaterThanOrEqual(1);
  });
});

describe('기준일 — 그해 규칙에서만', () => {
  it('2026년 귀속 · rules.basis · 조문 확인 rules.checked', () => {
    const r = rulesFor(2026)!;
    expect(v(S2).asOf).toEqual([`${r.year}년 귀속 · ${r.basis} 기준 · 조문 확인 ${r.checked.replace(/-/g, '.')}.`]);
  });
  it('멈춤에는 기준일을 달지 않는다', () => {
    expect(midyearScopeStopView().asOf).toEqual([]);
  });
  it('근거 조문 링크는 rules.basis 에 적힌 소득세법 조문 + 지방세법 제103조의13', () => {
    const r = rulesFor(2026)!;
    const hrefs = v(S2).basis.map((b) => b.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) {
      expect(h).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
      const art = h.split('/').pop()!;
      if (h.includes('/소득세법/')) expect(r.basis).toMatch(new RegExp(`${art}(?![의\\d])`));
    }
  });
});

describe('세무 위험 표지 — 결과 블록 안에 글자 그대로', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('고지 두 줄(둘째 줄은 D4 261126 원천징수의무자 문구)·홈택스 링크', () => {
    expect(NOTICE).toEqual([
      '예상 금액입니다. 회사가 실제로 적용한 공제에 따라 달라질 수 있습니다.',
      '참고용 계산이며, 원천징수와 신고는 회사(원천징수의무자)가 합니다. 원천징수영수증이나 신고서를 만들지 않습니다.',
    ]);
    expect(HOMETAX_URL).toBe('https://www.hometax.go.kr');
    expect(`${HOMETAX_LINK.text}${HOMETAX_LINK.after}`).toBe('홈택스(첫 화면)에서 연말정산 모의계산 메뉴를 찾아 한 번 더 확인할 수 있습니다.');
  });
  it('멈춤·계산 결과 두 ResultBlock 모두 children 에 Notice 가 있다', () => {
    const blocks = [...src.matchAll(/<ResultBlock view=\{[^}]*\}>\s*<Notice \/>\s*<\/ResultBlock>/g)];
    expect(blocks.length).toBe(2);
    expect(src).toMatch(/NOTICE\.map/);
    expect(src).toMatch(/href=\{HOMETAX_URL\}/);
    expect(src).not.toMatch(/<AnswerCard /);
  });
  it('결과 블록 안 고지는 회색(muted)·ink 로 덮지 않는다', () => {
    const notice = src.slice(src.indexOf('function Notice()'), src.indexOf('export default'));
    expect(notice).not.toMatch(/style=\{(muted|ink)\}/);
  });
  it('「확정」 단정·「유리한·작은 쪽·가정」·금지어·느낌표·해요체가 없다', () => {
    const views = [v(S2), v(S3), v(ZERO), v({ ...S2, paidIncomeTax: 225_000, paidLocalTax: 22_000 }), v({ ...S2, totalPay: 121_200_000 }), v({ ...S2, year: 2024 }), midyearScopeStopView()];
    for (const x of views) {
      const t = allText(x);
      expect(bannedHits(t)).toEqual([]);
      expect(t.replace(/확정 금액이 아닙니다/g, '')).not.toMatch(/확정/);
      expect(t).not.toMatch(/유리한|작은 쪽|가정/);
      expect(t).not.toMatch(/[!！]|해요|예요|에요/);
      expect(t).not.toMatch(/연락|문의/);
      for (const n of x.next) expect(hrefExists(n.href), n.href).toBe(true);
      expect(x.next.length).toBeLessThanOrEqual(2);
    }
    expect(readFileSync(RESULT, 'utf8')).not.toMatch(/유리한|작은 쪽|가정|연락|문의/);
  });
});

describe('라디오 라벨은 44px 히트 영역(choiceLabel)', () => {
  it('범위 질문 라디오 둘', () => {
    const src = readFileSync(CLIENT, 'utf8');
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(2);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});

describe('폴더 화면 문구(allCopy) — 느낌표·이모지·해요체 없음', () => {
  it('S2·S3·0원·멈춤 두 가지의 화면 문장 전부', () => {
    for (const i of [S2, S3, ZERO, { ...S2, totalPay: 121_200_000 }, { ...S2, year: 2024 }]) {
      expect(allCopy(calcMidyear(i)).join('\n')).not.toMatch(/[!！]|해요|예요|에요|\p{Extended_Pictographic}/u);
    }
  });
});
