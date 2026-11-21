import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// 검증 전문(parse_version local-verified-v1) 선택과 표시. 조회마다 걸린 필터를 보고 다른 행을 돌려준다.
const db = vi.hoisted(() => ({
  decision: {
    id: 'bc_verified', title: '합성 해고무효확인', case_number: '2019두12345', department: '대법원', decision_date: '2020-01-05',
    decision_result: 'granted', reason_category: ['misconduct'], issue_type_primary: 'misconduct', tags: [],
    holding_points: '합성 AI 정리 '.repeat(20), holding_summary: '합성 저장 요약', url: null,
  } as Record<string, unknown>,
  bigcase: [] as Record<string, unknown>[],
  verified: [] as Record<string, unknown>[],
  filters: [] as Record<string, unknown>[],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      db.filters.push(filters);
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
        order: () => chain,
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
  db.bigcase = [];
  db.verified = [];
  db.filters = [];
});

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
  expect(db.filters).toContainEqual({ internal_decision_id: 'bc_verified', parse_version: 'local-verified-v1' });
  expect(db.filters).toContainEqual({ internal_decision_id: 'bc_verified', source_provider: 'bigcase' });
});

it('renders head as a label table that keeps the original spacing and the order in an emphasis box', async () => {
  db.verified = [verifiedRow];
  const html = await render();
  expect(html).toContain('data-export="section" data-export-title="" data-export-ai="false" data-export-kind="head"');
  expect(html).toContain('사       건</span>    <span class="min-w-0 break-words">2019두12345 해고무효확인</span>');
  expect(html).toContain('<span class="break-words font-medium text-foreground/80"></span>    <span class="min-w-0 break-words">소송대리인 변호사 합성</span>');
  expect(html).toMatch(/border-l-primary[^>]*><p data-export="section" data-export-title="주문" data-export-ai="false"/);
  expect(html).toContain('data-export-title="이유" data-export-ai="false"');
  expect(html).toContain('href="#judgment-part-1"');
});

it('marks the stored summary as AI and offers the export bar', async () => {
  db.verified = [verifiedRow];
  const html = await render();
  expect(html).toContain('data-export="summary" data-export-title="판결요지 정리" data-export-ai="true"');
  for (const label of ['전문 복사', '요지 복사', '인용 형식 복사', '선택 복사', '.md 내려받기', '.jsonl 내려받기']) expect(html).toContain(label);
  expect(html).not.toContain('granted');
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
});
