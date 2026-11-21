import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// 판례·판정례·행정해석 상세에 복사·내려받기 표지(data-export)가 맞는 상자에 붙는지 본다.
const rows = vi.hoisted(() => ({
  nlrc: {
    id: 'id_marker', title: '합성 부당해고 구제신청', case_number: '2020부해OOO', case_number_real: null, case_number_qualified: null,
    department: '중앙노동위원회', decision_date: '2020-03-04', decision_result: 'dismissed', reason_category: ['misconduct'], issue_type_primary: 'misconduct',
    key_issue: '합성 쟁점', holding_points: '합성 정리 '.repeat(30), holding_summary: '합성 판정 요지 고유 문구', reason_detail: '합성 해고 사유', url: null,
  },
  case: {
    id: 'case_marker', case_number: '2021다1', court: '서울고등법원', title: '합성 판례', decision_date: '2021-06-07', case_type: null, verdict_type: null,
    keywords_matched: [], summary: '합성 요약 고유 문구', holding_points: '합성 상세 고유 문구', law_references: '근로기준법 제23조', url: 'https://bigcase.ai/cases/1', original_url: null,
  },
  interp: {
    id: 'ml_marker', title: '합성 질의회시', case_number: '근로기준정책과-1', decision_date: '2021-08-09', keywords_matched: [],
    inquiry_summary: '합성 질의 요약', answer_summary: '합성 회시 요약', full_text: '<p>합성 수집 본문</p>', url: 'https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820',
  },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const data = table === 'nlrc_decisions' ? rows.nlrc : null;
      Object.assign(chain, {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        single: () => Promise.resolve({ data, error: null }), maybeSingle: () => Promise.resolve({ data, error: null }),
      });
      return chain;
    },
  },
}));
vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const row = table === 'cases' ? rows.case : table === 'molab_interpretations' ? rows.interp : null;
      Object.assign(chain, {
        select: () => chain, eq: () => chain, neq: () => chain, contains: () => chain, order: () => chain, limit: () => chain,
        single: () => Promise.resolve({ data: row, error: null }), maybeSingle: () => Promise.resolve({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      });
      return chain;
    },
  },
}));
vi.mock('@/components/SubscribeForm', () => ({ default: () => null }));
import DecisionPage from '@/app/decisions/[id]/page';
import CasePage from '@/app/cases/[id]/page';
import InterpretationPage from '@/app/interpretations/[id]/page';

const bar = ['전문 복사', '요지 복사', '인용 형식 복사', '선택 복사', '.md 내려받기', '.jsonl 내려받기'];

it('labor commission detail marks every stored text as AI summary, never as original', async () => {
  const html = renderToStaticMarkup(await DecisionPage({ params: Promise.resolve({ id: 'id_marker' }) }));
  bar.forEach(label => expect(html).toContain(label));
  expect(html).toContain('「[관련 판정] …」');
  expect(html).toContain('data-export="section" data-export-title="핵심쟁점" data-export-ai="true"');
  expect(html).toContain('data-export="section" data-export-title="해고 사유" data-export-ai="true"');
  expect(html).toContain('data-export="section summary" data-export-title="판정 요지" data-export-ai="true"');
  expect(html).not.toContain('data-export-ai="false"');
});

it('case detail marks summary and detail as AI and references as plain data', async () => {
  const html = renderToStaticMarkup(await CasePage({ params: Promise.resolve({ id: 'case_marker' }) }));
  bar.forEach(label => expect(html).toContain(label));
  expect(html).toContain('「[관련 판결] …」');
  expect(html).toContain('data-export="section summary" data-export-title="요약" data-export-ai="true"');
  expect(html).toContain('data-export="section" data-export-title="상세" data-export-ai="true"');
  expect(html).toContain('data-export="section" data-export-title="참조 법령" data-export-ai="false"');
  expect(html).not.toContain('bigcase.ai');
});

it('interpretation detail exposes inquiry, answer and collected body sections', async () => {
  const html = renderToStaticMarkup(await InterpretationPage({ params: Promise.resolve({ id: 'ml_marker' }) }));
  bar.forEach(label => expect(html).toContain(label));
  expect(html).toContain('「[관련 행정해석] …」');
  expect(html).toContain('data-export="section summary" data-export-title="질의 요지" data-export-ai="false"');
  expect(html).toContain('data-export="section summary" data-export-title="회시 요지" data-export-ai="false"');
  expect(html).toContain('data-export="section" data-export-title="본문" data-export-ai="false"');
  expect(html).toContain('id="collected-source-body">');
});

it('interpretation bodies drop law_cite annotations before they reach the screen and the export', async () => {
  const before = { ...rows.interp };
  const cite = (text: string) => `<law_cite ref="javascript:alert(1)">${text}</law_cite>`;
  Object.assign(rows.interp, {
    inquiry_summary: `질의 ${cite('근로기준법 제23조')}`,
    answer_summary: `회시 ${cite('근로기준법 제56조')}`,
    full_text: `<p>본문 ${cite('근로기준법 제60조')}</p>`,
  });
  try {
    // 머리의 JSON-LD 설명문은 복사·내려받기 대상이 아니다 — 화면 본문만 본다.
    const html = renderToStaticMarkup(await InterpretationPage({ params: Promise.resolve({ id: 'ml_marker' }) }))
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    expect(html).not.toContain('law_cite');
    expect(html).not.toContain('javascript:');
    for (const text of ['질의 근로기준법 제23조', '회시 근로기준법 제56조', '본문 근로기준법 제60조']) expect(html).toContain(text);
  } finally {
    Object.assign(rows.interp, before);
  }
});

it('the 「공식 원문 미확인」 note after a private source link is screen-only, not export text', async () => {
  const before = rows.case.summary;
  rows.case.summary = '합성 요약 [원문 보기](https://bigcase.ai/cases/1) 끝';
  try {
    const html = renderToStaticMarkup(await CasePage({ params: Promise.resolve({ id: 'case_marker' }) }));
    expect(html).toContain('원문 보기<span data-export-skip=""> (공식 원문 미확인)</span>');
  } finally {
    rows.case.summary = before;
  }
});
