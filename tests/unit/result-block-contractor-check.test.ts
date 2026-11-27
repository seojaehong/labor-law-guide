// 3.3% 계약 점검 결과 카드 둘(261124) — 공용 ResultBlock 으로 옮긴 뒤에도 화면 글자가 같은지 고정한다.
// 기대 글자는 옮기기 전 화면(CHECK_HEADLINE·itemSentence·moneyHeadline·moneyRows)에서 실측한 것이다(오늘 = 2026-11-24 고정, 2026년 요율).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { rateOn } from '@/content/rates';
import { TOOLS } from '@/content/tools-registry';
import { QUESTIONS, checkItems, compareTakeHome, type Answers } from '@/lib/calc/contractor-check';
import { WITHHOLDING_REVISION } from '@/lib/calc/wage-withholding-2026-02-27';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_COMPARE, STATUS_ESTIMATE, dotDate, type ResultView } from '@/components/tool-result/result-view';
import { HOMETAX_LINK, NOTICE, moneyRows } from '@/app/tools/contractor-check/copy';
import { CHECK_LABEL, MONEY_LABEL, contractorCheckView, contractorMoneyView } from '@/app/tools/contractor-check/result';

const TODAY = '2026-11-24';
const CLIENT = 'src/app/tools/contractor-check/ContractorCheckClient.tsx';

const money = (pay: number, meal = 0, family = 1) => {
  const r = compareTakeHome({ pay, meal, family }, TODAY);
  return { r, v: contractorMoneyView(r, TODAY) };
};
const answersOf = (list: ('yes' | 'no')[]): Answers => Object.fromEntries(QUESTIONS.map((q, i) => [q.id, list[i]]));
// verify.mts P3(2004다29736 사실관계형)·P2(독립 쪽 전부) 입력
const P3 = answersOf(['yes', 'yes', 'no', 'no', 'yes', 'no', 'no', 'no']);
const P2 = answersOf(['no', 'no', 'yes', 'yes', 'no', 'no', 'no', 'no']);

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

describe('① 점검 카드 — 글자 고정', () => {
  it('답 문장은 CHECK_HEADLINE 그대로, 상태는 확인용 비교', () => {
    const v = contractorCheckView(checkItems({}));
    expect(v.status).toBe(STATUS_COMPARE);
    expect(v.verdict).toEqual([
      '계약서 이름이나 3.3% 공제가 아니라 실제로 일한 모습으로 근로자인지 봅니다.',
      '항목마다 대법원 판례의 기준과 대조한 결과입니다. 근로자인지는 이 요소들을 종합해 정해지고, 이 도구는 결론을 내지 않습니다.',
    ]);
    expect(v.amounts).toEqual([]);
  });
  it('답 없음 = nextNote + next, 답을 고르면 nextNote 없음', () => {
    expect(contractorCheckView(checkItems({})).nextNote).toMatch(/확인이 필요합니다/);
    expect(contractorCheckView(checkItems(P3)).nextNote).toBeUndefined();
  });
  it('카드에 더한 글자에 「적습니다」·「요소가 있습니다」가 없다(verify.mts P2·P3 는 카드 전체에서 이 말을 센다)', () => {
    for (const a of [{}, P3, P2]) {
      const t = allText(contractorCheckView(checkItems(a)));
      expect(t).not.toMatch(/적습니다/);
      expect(t).not.toMatch(/요소가 있습니다/);
    }
  });
  it('기준일 — 판결 대조일은 코드 값이 아니라 비운다', () => {
    expect(contractorCheckView(checkItems({})).asOf).toEqual([]);
  });
});

describe('② 금액 카드 — 글자 고정(옮기기 전 화면 실측)', () => {
  it('300만: 3.3% 2,901,000원 · 근로소득 2,626,700원', () => {
    const { r, v } = money(3_000_000);
    expect(v.status).toBe(STATUS_ESTIMATE);
    expect(v.verdict).toEqual(['같은 보수 3,000,000원의 예상 실수령은 3.3%로 떼면 2,901,000원, 근로소득으로 떼면 2,626,700원입니다.']);
    expect(v.amounts).toEqual([
      { label: '3.3%로 뗀 예상 실수령', value: '2,901,000원' },
      { label: '근로소득으로 뗀 예상 실수령', value: '2,626,700원' },
    ]);
    // 표(children)의 줄도 그대로
    expect(moneyRows(r).map((x) => [x.label, x.business, x.wage])).toEqual([
      ['소득세', '90,000원', '74,350원'], ['지방소득세', '9,000원', '7,430원'], ['국민연금', '—', '142,500원'],
      ['건강보험', '—', '107,850원'], ['장기요양보험', '—', '14,170원'], ['고용보험', '—', '27,000원'], ['예상 실수령', '2,901,000원', '2,626,700원'],
    ]);
    expect(v.nextNote).toBeUndefined();
  });
  it('1,200만(표 밖): 근로소득 실수령은 내지 않고 4대보험 909,100원만', () => {
    const { v } = money(12_000_000);
    expect(v.verdict).toEqual([
      '같은 보수 12,000,000원의 예상 실수령은 3.3%로 떼면 11,604,000원입니다.',
      '근로소득 쪽은 월 과세 급여가 1,000만원을 넘어 소득세를 계산하지 않고, 4대보험 근로자 몫 909,100원만 보입니다.',
    ]);
    expect(v.amounts).toEqual([{ label: '3.3%로 뗀 예상 실수령', value: '11,604,000원' }]);
    expect(v.nextNote).toBeTruthy();
  });
  it('3만원(근로소득 쪽 멈춤): 3.3% 29,010원만 + nextNote + next', () => {
    const { v } = money(30_000);
    expect(v.verdict).toEqual([
      '같은 보수 30,000원의 예상 실수령은 3.3%로 떼면 29,010원입니다.',
      '근로소득 쪽은 계산하지 않았습니다. 공제 합계(국민연금·건강보험 하한 포함)가 월 보수보다 많습니다. 금액을 원 단위로 넣었는지 확인해 주세요.',
    ]);
    expect(v.amounts).toEqual([{ label: '3.3%로 뗀 예상 실수령', value: '29,010원' }]);
    expect(v.nextNote).toBeTruthy();
    expect(v.next.length).toBeGreaterThanOrEqual(1);
  });
  it('가족 칸 비움: 3.3% 쪽은 남고 근로소득 쪽만 멈춘다', () => {
    const { v } = money(3_000_000, 0, 0);
    expect(v.verdict[0]).toBe('같은 보수 3,000,000원의 예상 실수령은 3.3%로 떼면 2,901,000원입니다.');
    expect(v.verdict[1]).toContain('공제대상가족 수를 확인해 주세요');
  });
});

describe('② 금액 카드 기준일 — rates.ts 확인일·간이세액표 개정판에서만', () => {
  it('열 줄 가운데 가장 이른 확인일 + WITHHOLDING_REVISION', () => {
    const keys = ['npsEmployeePerMillion', 'npsIncomeFloor', 'npsIncomeCap', 'healthEmployeePerMillion', 'ltcEmployeePerMillion',
      'ltcToHealthPerMillion', 'healthPremiumFloor', 'healthPremiumCap', 'employmentEmployeePerMillion', 'mealNonTaxMonthly'] as const;
    const oldest = keys.map((k) => rateOn(k, TODAY)!.checked).sort()[0];
    expect(oldest).toBe('2026-10-28');
    expect(money(3_000_000).v.asOf).toEqual([
      `근로소득 쪽 4대보험 요율·기준소득월액 하한·식대 비과세 한도는 ${dotDate(TODAY)}에 적용되는 값 기준 · 확인 ${dotDate(oldest)}`,
      `근로소득 쪽 소득세는 ${WITHHOLDING_REVISION} 간이세액표 기준`,
    ]);
  });
  it('표 밖(1,200만)은 4대보험 줄만, 근로소득 쪽 멈춤(3만원)은 비운다 — 셈하지 않은 값의 기준일을 적지 않는다', () => {
    expect(money(12_000_000).v.asOf).toHaveLength(1);
    expect(money(12_000_000).v.asOf[0]).toMatch(/^근로소득 쪽 4대보험 요율/);
    expect(money(30_000).v.asOf).toEqual([]);
  });
  it('멈춘 까닭마다 다음 일 — 표 밖은 실수령액 계산기로 보내지 않는다', () => {
    expect(money(12_000_000).v.nextNote).toMatch(/간이세액표 밖/);
    expect(money(30_000).v.nextNote).toMatch(/그 칸을 고치면/);
    const r = compareTakeHome({ pay: 3_000_000, meal: 0, family: 1 }, '2027-07-01');
    expect(contractorMoneyView(r, '2027-07-01').nextNote).toMatch(/보험료율·기준이 반영되면/);
  });
  it('요율 줄이 없는 날(2027-07-01, 국민연금 기준소득월액 고시 없음)은 비운다', () => {
    const r = compareTakeHome({ pay: 3_000_000, meal: 0, family: 1 }, '2027-07-01');
    expect(r.rates).toBeNull();
    expect(contractorMoneyView(r, '2027-07-01').asOf).toEqual([]);
  });
});

describe('공통 — 링크·금지어·문체·연락 유도', () => {
  const views = [
    contractorCheckView(checkItems({})), contractorCheckView(checkItems(P3)), contractorCheckView(checkItems(P2)),
    money(3_000_000).v, money(12_000_000).v, money(30_000).v, money(33_000).v,
  ];
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
  it('금지어·느낌표·이모지·해요체·연락 유도·단정이 없다', () => {
    for (const v of views) {
      const t = allText(v);
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/해요|예요|에요/);
      expect(t).not.toMatch(/연락|문의/);
      expect(allText({ ...v, status: '' })).not.toMatch(/확정/);
    }
  });
});

describe('화면 — 두 카드 순서·이름, 세무 고지 그대로, 44px 선택지', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('ResultBlock 두 개 — 점검 카드가 먼저, 서로 다른 label, data-part 손잡이 유지', () => {
    expect(src).not.toMatch(/AnswerCard/);
    const blocks = [...src.matchAll(/<ResultBlock [^>]*label=\{(\w+)\}/g)].map((m) => m[1]);
    expect(blocks).toEqual(['CHECK_LABEL', 'MONEY_LABEL']);
    expect(CHECK_LABEL).not.toBe(MONEY_LABEL);
    expect(src.indexOf('data-part="check"')).toBeGreaterThan(-1);
    expect(src.indexOf('data-part="check"')).toBeLessThan(src.indexOf('data-part="money"'));
    expect(src.indexOf('CHECK_LABEL}')).toBeLessThan(src.indexOf('MONEY_LABEL}'));
  });
  it('점검 카드 안에 항목 문장(itemSentence)·답·꼬리표가 남는다', () => {
    const check = src.slice(src.indexOf('label={CHECK_LABEL}'), src.indexOf('</ResultBlock>'));
    for (const s of ['itemSentence(i)', 'answerLabel(i)', 'itemTag(i)', 'i.question.element']) expect(check).toContain(s);
  });
  it('금액 카드 안에 표·MONEY_NOTES, 확정신고 고지·홈택스 링크는 카드 밖에서 입력 오류일 때도 보인다(접지 않는다)', () => {
    const start = src.indexOf('label={MONEY_LABEL}');
    const moneyBlock = src.slice(start, src.indexOf('</ResultBlock>', start));
    for (const s of ['moneyRows(out.r!)', 'MONEY_NOTES']) expect(moneyBlock).toContain(s);
    expect(moneyBlock).not.toMatch(/FoldedDetail|<details/);
    // 고지 문단은 data-part="money" 묶음(오류·결과 분기)이 닫힌 뒤, 산식 접기 앞 — 어느 분기에서도 보인다
    const part = src.indexOf('data-part="money"');
    const partEnd = src.indexOf('</div>', src.indexOf('</ResultBlock>', start));
    const notice = src.slice(partEnd, src.indexOf('</p>', partEnd));
    expect(src.indexOf("'error' in out ?", part)).toBeLessThan(partEnd);
    for (const s of ['{NOTICE}', 'href={HOMETAX_URL}', '{HOMETAX_LINK.text}', '{HOMETAX_LINK.after}']) expect(notice).toContain(s);
    expect(notice).not.toMatch(/'r' in out|'error' in out/);
    expect(NOTICE).toBe('참고용 계산이며, 1년 소득은 대개 다음 해 5월 종합소득세 확정신고에서 본인이 다시 계산합니다(연말정산 대상 사업소득은 예외).');
    expect(HOMETAX_LINK.text).toBe('홈택스(첫 화면)');
  });
  it('결과 블록(잉크 반전 바탕) 안 children 은 muted·ink 를 쓰지 않는다', () => {
    for (const label of ['label={CHECK_LABEL}', 'label={MONEY_LABEL}']) {
      const s = src.indexOf(label);
      const block = src.slice(s, src.indexOf('</ResultBlock>', s));
      expect(block).not.toMatch(/style=\{(muted|ink)\}/);
      expect(block).toMatch(/style=\{rbSub\}/);
    }
  });
  it('질문 라디오 라벨이 choiceLabel', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(1);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
