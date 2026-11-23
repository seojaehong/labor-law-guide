import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: mock }));
import DecisionPage from '@/app/decisions/[id]/page';

// 합성 입력 — 운영 bc_da125932 의 모양(바깥 원천 543자 부분본 + 우리 화면을 긁은 recollect-v3 행)을 본떴다.
const stored = { id: 'bc_selfscrape_fixture', title: '합성 법원 자료', case_number: '2099다1', department: '대법원', decision_date: '2099-01-01', holding_points: '합성 AI 정리 '.repeat(20), holding_summary: '합성 AI 요약' };
const judgment = '대법원\n판결\n[이유]\n상고이유를 판단한다.\n' + '해고가 무효인 이상 근로관계는 계속된다. '.repeat(60);
const chrome = '\n원문 보기\n유사 판정례\nAI에게 질문하기\n전문가 상담이 필요하신가요?\n노무법인 위너스에서 사업장 맞춤 상담을 제공합니다.\n무료 상담 신청하기\n사건 정보\n판정결과\noverturned\n상담 문의';
const selfRow = {
  source_url: 'https://노란봉투법.com/decisions/bc_selfscrape_fixture',
  full_text_clean: `${judgment}\n판정 요지\n${judgment}${chrome}`,
  full_text_raw: '{"source_kind": "bigcase_html"}',
  body_sections: [{ title: '판결', text: `${judgment}${chrome}` }],
  completeness_flag: 'full',
  coverage_ratio: 0.13,
  parse_version: 'recollect-v3',
};
const externalRow = {
  source_url: 'https://bigcase.ai/cases/x',
  full_text_clean: judgment,
  full_text_raw: judgment,
  body_sections: [{ title: '판결', text: judgment }],
  completeness_flag: 'partial',
  coverage_ratio: 0.05,
  parse_version: 'recollect-v1',
};

function query(data: unknown) {
  const response = { data, error: null };
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), limit: vi.fn(), then: (resolve: (r: typeof response) => unknown) => Promise.resolve(response).then(resolve) };
  for (const m of ['select', 'eq', 'maybeSingle', 'order', 'limit'] as const) chain[m].mockReturnValue(chain);
  return chain;
}
function withRows(rows: unknown[]) {
  mock.from.mockImplementation((table: string) => query(table === 'nlrc_decisions' ? stored : table === 'decision_source_documents' ? rows : null));
}
const SITE_WORDS = /전문가 상담이 필요하신가요|무료 상담 신청하기|AI에게 질문하기|노무법인 위너스|판정결과|overturned/;

beforeEach(() => vi.clearAllMocks());

it('우리 사이트를 긁은 행은 수집 본문·요지로 내보내지 않고 바깥 원천 행을 쓴다', async () => {
  withRows([selfRow, externalRow]);
  const html = renderToStaticMarkup(await DecisionPage({ params: Promise.resolve({ id: stored.id }) }));
  expect(html).not.toMatch(SITE_WORDS);
  expect(html).toContain('해고가 무효인 이상 근로관계는 계속된다.');
  expect(html).toContain('확보한 수집 본문');
});

it('우리 사이트를 긁은 행만 있으면 원문이 없는 것으로 본다', async () => {
  withRows([selfRow]);
  const html = renderToStaticMarkup(await DecisionPage({ params: Promise.resolve({ id: stored.id }) }));
  expect(html).not.toMatch(SITE_WORDS);
  expect(html).not.toContain('확보한 수집 본문');
  expect(html).not.toContain('요지 · 판결문 원문');
});

it('바깥 원천 본문 끝에 붙은 화면 글자는 잘라 내고 보인다', async () => {
  withRows([{ ...externalRow, full_text_clean: judgment + chrome, body_sections: [{ title: '판결', text: judgment + chrome }] }]);
  const html = renderToStaticMarkup(await DecisionPage({ params: Promise.resolve({ id: stored.id }) }));
  expect(html).not.toMatch(SITE_WORDS);
  expect(html).toContain('해고가 무효인 이상 근로관계는 계속된다.');
});
