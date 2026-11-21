import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// 검증 전문(parse_version local-verified-v1) 선택과 표시. 조회마다 걸린 필터를 보고 다른 행을 돌려준다.
const baseDecision = vi.hoisted(() => ({
  id: 'bc_verified', title: '합성 해고무효확인', case_number: '2019두12345', department: '대법원', decision_date: '2020-01-05',
  decision_result: 'granted', reason_category: ['misconduct'], issue_type_primary: 'misconduct', tags: [],
  holding_points: '합성 AI 정리 '.repeat(20), holding_summary: '합성 저장 요약', url: null,
} as Record<string, unknown>));
const db = vi.hoisted(() => ({
  decision: {} as Record<string, unknown>,
  bigcase: [] as Record<string, unknown>[],
  verified: [] as Record<string, unknown>[],
  filters: [] as Record<string, unknown>[],
  orders: [] as Record<string, string[]>[],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const orders: Record<string, string[]> = { [table]: [] };
      db.filters.push(filters);
      db.orders.push(orders);
      const data = () => {
        if (table === 'nlrc_decisions') return db.decision;
        if (table !== 'decision_source_documents') return null;
        if (filters.parse_version === 'local-verified-v1') return db.verified;
        return filters.source_provider === 'bigcase' ? db.bigcase : [];
      };
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
        order: (column: string) => { orders[table].push(column); return chain; },
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: data(), error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve),
      });
      return chain;
    },
  },
}));
vi.mock('@/components/SubscribeForm', () => ({ default: () => null }));
import DecisionPage from '@/app/decisions/[id]/page';

const longCollected = (label: string) => ({ full_text_clean: `${label} `.repeat(200), full_text_raw: null, body_sections: [], completeness_flag: 'partial', coverage_ratio: 1, parse_version: 'bigcase-v2' });
const verifiedRow = {
  parse_version: 'local-verified-v1', completeness_flag: 'full', coverage_ratio: 1, full_text_raw: null,
  // 짧은 판결도 전문이다 — 1,000자 하한을 두지 않는다.
  full_text_clean: '대법원 판결 사건 2019두12345 주문 상고를 기각한다. 이유 상고이유를 판단한다. 대법관 합성',
  body_sections: [
    { title: '', text: '사       건    2019두12345 해고무효확인\n원고, 상고인    합성 주식회사\n    소송대리인 변호사 합성', type: 'head', index: 0 },
    { title: '주문', text: '상고를 기각한다.\n상고비용은 원고가 부담한다.', type: 'section', index: 1 },
    { title: '청구취지', text: '피고의 해고는 무효임을 확인한다.', type: 'section', index: 2 },
    { title: '이유', text: '상고이유를 판단한다.\n\n대법관 합성', type: 'section', index: 3 },
  ],
};
const render = async () => renderToStaticMarkup(await DecisionPage({ params: Promise.resolve({ id: 'bc_verified' }) }));

beforeEach(() => {
  db.decision = { ...baseDecision };
  db.bigcase = [];
  db.verified = [];
  db.filters = [];
  db.orders = [];
});

/** 그린 HTML 에서 이름이 같은 버튼 하나의 여는 태그 */
const buttonTag = (html: string, label: string) => html.split('<button').find((chunk) => chunk.includes(label))?.split('>')[0] ?? '';

it('puts the verified full judgment ahead of five equally covered collected rows', async () => {
  db.bigcase = Array.from({ length: 5 }, (_, i) => longCollected(`빅케이스 수집 본문 ${i}`));
  db.verified = [verifiedRow];
  const html = await render();
  expect(html).toContain('판결 전문 · 주문·이유·서명 확인');
  expect(html).toContain('판결 전문 및 출처');
  expect(html).toContain('판결 전문·출처 보기');
  expect(html).toContain('상고를 기각한다.');
  expect(html).toContain('피고의 해고는 무효임을 확인한다.');
  expect(html).not.toContain('빅케이스 수집 본문');
  expect(html).not.toContain('수집 본문 · 완전성 미확인');
  expect(html).not.toContain('전문 여부와 앞뒤 누락');
  expect(html).not.toContain('같은 수집본의 저장 텍스트 보기');
  // 검증 조회는 full 행만 받아 limit 안에서 partial 행에 밀리지 않고, 동률이면 제공처 이름으로 순서를 고정한다.
  expect(db.filters).toContainEqual({ internal_decision_id: 'bc_verified', parse_version: 'local-verified-v1', completeness_flag: 'full' });
  expect(db.filters).toContainEqual({ internal_decision_id: 'bc_verified', source_provider: 'bigcase' });
  expect(db.orders.filter((o) => o.decision_source_documents).map((o) => o.decision_source_documents)).toContainEqual(['coverage_ratio', 'source_provider']);
});

it('renders head as a label table that keeps the original spacing and the order in an emphasis box', async () => {
  db.verified = [verifiedRow];
  const html = await render();
  expect(html).toContain('data-export="section" data-export-title="" data-export-ai="false" data-export-kind="head"');
  // 간격은 숨긴 글자로 남긴다 — 격자 칸이 되지 않고, 화면 글자를 모으면 원래 줄이 나온다.
  expect(html).toContain('사       건</span><span class="hidden">    </span><span class="min-w-0 break-words">2019두12345 해고무효확인</span>');
  expect(html).toContain('<span class="break-words font-medium text-foreground/80"></span><span class="hidden">    </span><span class="min-w-0 break-words">소송대리인 변호사 합성</span>');
  expect(html).toMatch(/border-l-primary[^>]*><p data-export="section" data-export-title="주문" data-export-ai="false"/);
  expect(html).toContain('data-export-title="이유" data-export-ai="false"');
  expect(html).toContain('href="#judgment-part-1"');
});

it('head with ideographic-space gaps, spaced-out titles and blank lines keeps the grid and the original lines', async () => {
  db.verified = [{
    ...verifiedRow,
    body_sections: [
      { title: '', text: '대    법    원\n\n판    결\n\n사　　건　　2019두12345 해고무효확인', type: 'head', index: 0 },
      ...verifiedRow.body_sections.slice(1),
    ],
  }];
  const html = await render();
  expect(html).toContain('<div class="col-span-2 break-words">대    법    원</div>');
  expect(html).toContain('<div class="col-span-2 break-words">판    결</div>');
  expect(html).toContain('<div class="col-span-2 h-1">\n</div>');
  expect(html).toContain('사　　건</span><span class="hidden">　　</span><span class="min-w-0 break-words">2019두12345 해고무효확인</span>');
});

it('the stored text of an ordinary collected row stays quotable without being exported twice', async () => {
  db.bigcase = [{ ...longCollected('구획 수집본'), body_sections: [{ title: '이유', text: '구획 수집본 이유' }] }];
  const html = await render();
  expect(html).toContain('같은 수집본의 저장 텍스트 보기');
  expect(html).toMatch(/<\/summary><p data-export="quote" data-export-title="" data-export-ai="false"/);
});

it('the duplicate summary in the fallback card is quotable and marked AI', async () => {
  db.decision = { ...baseDecision, holding_points: '짧은 정리' };
  const html = await render();
  expect(html).toContain('data-export="quote" data-export-title="AI 정리" data-export-ai="true"');
  expect(html).not.toContain('판결요지');
});

/** 요지 상자(data-export="summary")의 글자 */
const summaryBlock = (html: string) => html.match(/<p[^>]*data-export="summary"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? null;
/** 검증 전문 이유 절의 글자 */
const reasonBlock = (html: string) => html.match(/<p data-export="section" data-export-title="이유"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? null;
/** 요지 복사를 쓸 수 없다는 까닭이 단추에 붙었는가 */
const expectSummaryUnavailable = (html: string) => {
  const tag = buttonTag(html, '요지 복사');
  expect(tag).toMatch(/\sdisabled=""/);
  expect(tag).toContain('title="원문 요지가 없습니다"');
  const describedBy = tag.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(describedBy).toBeTruthy();
  expect(html).toContain(`id="${describedBy}" class="mt-0.5 text-xs text-muted-foreground">요지 복사: 원문 요지가 없습니다</p>`);
};

it('AI holding points without an original stay an AI section and never become the 요지', async () => {
  db.decision = { ...baseDecision, holding_summary: null };
  const html = await render();
  expect(html).toContain('data-export="section" data-export-title="서비스 내 정리본" data-export-ai="true"');
  expect(html).not.toContain('data-export="section summary"');
  expect(summaryBlock(html)).toBeNull();
  expectSummaryUnavailable(html);
});

it('with a verified judgment the 요지 is the 이유 text verbatim and the stored AI summary moves into a closed details', async () => {
  db.verified = [verifiedRow];
  const html = await render();
  expect(html).toContain('<h3 class="font-semibold text-sm">요지 · 판결문 원문(이유 중 판단 부분)</h3>');
  expect(html).toContain('data-export="summary" data-export-title="요지(판결문 원문 · 이유 중 판단 부분)" data-export-ai="false"');
  // 번호 표제가 없는 이유는 전체가 판단 부분이다 — 이유 절 글자와 똑같다.
  expect(summaryBlock(html)).toBe('상고이유를 판단한다.\n\n대법관 합성');
  expect(summaryBlock(html)).toBe(reasonBlock(html));
  expect(html).toMatch(/<details[^>]*><summary[^>]*>AI 정리 보기 · 원문 아님<\/summary>/);
  expect(html).not.toMatch(/<details[^>]*\sopen/);
  expect(html).toContain('data-export="quote" data-export-title="AI 정리" data-export-ai="true"');
  expect(html).toContain('합성 저장 요약');
  expect(html).not.toContain('판결요지');
  expect(html).not.toContain('저장된 요약');
  for (const label of ['전문 복사', '요지 복사', '인용 형식 복사', '선택 복사', '.md 내려받기', '.jsonl 내려받기']) expect(html).toContain(label);
  expect(buttonTag(html, '요지 복사')).not.toMatch(/\sdisabled=""/);
  expect(buttonTag(html, '요지 복사')).not.toContain('title=');
  expect(html).not.toContain('granted');
});

it('the 요지 skips the fact and claim headings of a numbered 이유 and keeps the original spacing', async () => {
  const reason = '1. 기초사실\n원고는 합성 공사에 입사하였다.\n\n2. 당사자의 주장\n원고는 해고가 무효라고 주장한다.\n\n3. 판단\n가. 해고 사유\n  원고에게 해고 사유가   있다고 보기 어렵다.\n\n4. 결론\n원심의 판단에 잘못이 없다.\n\n대법관 합성';
  db.verified = [{ ...verifiedRow, body_sections: [...verifiedRow.body_sections.slice(0, 3), { title: '이유', text: reason, type: 'section', index: 3 }] }];
  const html = await render();
  const summary = summaryBlock(html);
  expect(summary).toBe(reason.slice(reason.indexOf('3. 판단')));
  expect(reasonBlock(html)).toBe(reason);
  expect(reasonBlock(html)!.includes(summary!)).toBe(true);
  // 짧은 요지는 접지 않는다.
  expect(html).not.toContain('전부 보기');
});

it('a long 요지 is clamped by height only, with the whole text still in the page', async () => {
  const judged = `3. 판단\n${'원고에게 해고 사유가 있다고 보기 어렵다.\n'.repeat(40)}4. 결론\n원심의 판단에 잘못이 없다.`;
  const reason = `1. 기초사실\n사실.\n2. 원고의 주장\n주장.\n${judged}`;
  db.verified = [{ ...verifiedRow, body_sections: [...verifiedRow.body_sections.slice(0, 3), { title: '이유', text: reason, type: 'section', index: 3 }] }];
  const html = await render();
  expect(summaryBlock(html)).toBe(judged);
  expect(html).toMatch(/class="relative max-h-80 overflow-hidden"><p id="[^"]+" data-export="summary"/);
  expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="[^"]+"[^>]*>전부 보기<\/button>/);
});

it('a collected row without sections gives the text after its 이 유 line as the 요지', async () => {
  const judged = `1. 처분의 경위\n경위.\n2. 원고의 주장\n주장.\n3. 처분의 적법 여부\n${'징계사유가 인정된다. '.repeat(80)}\n4. 결론\n원고의 청구를 기각한다.`;
  const full = `서울행정법원\n판결\n주 문\n원고의 청구를 기각한다.\n이    유\n${judged}`;
  db.bigcase = [{ full_text_clean: full, full_text_raw: null, body_sections: [], completeness_flag: 'partial', coverage_ratio: 1, parse_version: 'bigcase-v2' }];
  const html = await render();
  expect(html).toContain('수집 본문 · 완전성 미확인');
  expect(summaryBlock(html)).toBe(judged.slice(judged.indexOf('3. 처분의 적법 여부')).trimEnd());
  expect(full.includes(summaryBlock(html)!)).toBe(true);
});

it('an original without a findable 이유 has no 요지 and keeps the AI summary closed', async () => {
  db.bigcase = [longCollected('빅케이스 수집 본문')];
  const html = await render();
  expect(summaryBlock(html)).toBeNull();
  expect(html).not.toContain('요지 · 판결문 원문');
  expect(html).toMatch(/<summary[^>]*>AI 정리 보기 · 원문 아님<\/summary>/);
  expect(html).not.toContain('AI 정리 · 판결문 원문 아님');
  expectSummaryUnavailable(html);
});

it('a verified-version row that is not marked full stays an ordinary collected row', async () => {
  db.bigcase = [longCollected('빅케이스 수집 본문')];
  db.verified = [{ ...verifiedRow, completeness_flag: 'partial' }];
  const html = await render();
  expect(html).toContain('수집 본문 · 완전성 미확인');
  expect(html).toContain('빅케이스 수집 본문');
  expect(html).not.toContain('판결 전문 · 주문·이유·서명 확인');
});

it('ignores rows the verified query returns without the verified version', async () => {
  db.bigcase = [longCollected('빅케이스 수집 본문')];
  db.verified = [longCollected('검증 아닌 행')];
  const html = await render();
  expect(html).toContain('빅케이스 수집 본문');
  expect(html).not.toContain('검증 아닌 행');
  expect(html).toContain('수집 본문 · 완전성 미확인');
});

it('a verified bigcase row in the ordinary query is still sorted first', async () => {
  db.bigcase = [
    { ...longCollected('구획 있는 수집본'), body_sections: [{ title: '이유', text: '구획 있는 수집본 이유' }] },
    { ...verifiedRow },
  ];
  const html = await render();
  expect(html).toContain('판결 전문 · 주문·이유·서명 확인');
  expect(html).not.toContain('구획 있는 수집본');
});

it('without any source document keeps the AI summary fallback and its markers', async () => {
  const html = await render();
  expect(html).toContain('정리본 · 원문 미확보');
  expect(html).toContain('data-export="section" data-export-title="서비스 내 정리본" data-export-ai="true"');
  // AI 정리 카드는 요지가 아니다 — 「판결요지」라 부르지 않고, 요지로 내보내지 않는다(드래그 인용만).
  expect(html).toContain('<h3 class="font-semibold text-sm mb-2">AI 정리 · 판결문 원문 아님</h3>');
  expect(html).toContain('data-export="quote" data-export-title="AI 정리" data-export-ai="true"');
  expect(html).not.toContain('판결요지');
  expect(html).not.toContain('AI 정리 보기 · 원문 아님');
  expect(summaryBlock(html)).toBeNull();
  expectSummaryUnavailable(html);
});
