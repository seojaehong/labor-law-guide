import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

const { rpcMock, fromMock, selectMock, inMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  inMock: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { rpc: rpcMock, from: fromMock },
}));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { GET } from '@/app/api/faq/route';
import FaqClient from '@/app/faq/FaqClient';

function faq(id: number, metadata: { unified_category?: string | null; category?: string | null } = {}) {
  return { id, question: `Question ${id}`, answer: `Answer ${id}`, ...metadata };
}

beforeEach(() => {
  vi.resetAllMocks();
  fromMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ in: inMock });
  inMock.mockResolvedValue({ data: [], error: null });
});

describe('FAQ hybrid category metadata', () => {
  it('batches only missing categories and preserves result order, text, and total', async () => {
    const rows = [
      faq(3),
      faq(1, { unified_category: '통상임금', category: '임금일반' }),
      faq(2, { category: '퇴직금' }),
      faq(4, { unified_category: null, category: null }),
    ];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    inMock.mockResolvedValue({
      data: [
        { id: 4, unified_category: null, category: '주휴수당' },
        { id: 3, unified_category: '연차유급휴가', category: '휴일/휴게' },
      ],
      error: null,
    });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      faqs: [
        { id: 3, unified_category: '연차유급휴가', question: 'Question 3', answer: 'Answer 3' },
        { id: 1, unified_category: '통상임금', question: 'Question 1', answer: 'Answer 1' },
        { id: 2, unified_category: '퇴직금', question: 'Question 2', answer: 'Answer 2' },
        { id: 4, unified_category: '주휴수당', question: 'Question 4', answer: 'Answer 4' },
      ],
      total: 4,
    });
    expect(fromMock).toHaveBeenCalledExactlyOnceWith('faq');
    expect(selectMock).toHaveBeenCalledExactlyOnceWith('id, unified_category, category');
    expect(inMock).toHaveBeenCalledExactlyOnceWith('id', [3, 4]);
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('search_faq_hybrid', {
      query_text: 'test', max_results: 20,
    });
  });

  it('hydrates only the current 20-result page and keeps pagination unchanged', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => faq(index + 1));
    rpcMock.mockResolvedValue({ data: rows, error: null });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test&page=2&size=20'));
    const body = await response.json();
    expect(inMock).toHaveBeenCalledExactlyOnceWith('id', rows.slice(20).map((row) => row.id));
    expect(body.faqs).toHaveLength(20);
    expect(body.faqs.map((row: { id: number }) => row.id)).toEqual(rows.slice(20).map((row) => row.id));
    expect(body.total).toBe(40);
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('search_faq_hybrid', {
      query_text: 'test', max_results: 40,
    });
  });

  it('does not read the FAQ table when categories are already present', async () => {
    rpcMock.mockResolvedValue({ data: [faq(1, { unified_category: '퇴직금' }), faq(2, { category: '주휴수당' })], error: null });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test'));
    expect((await response.json()).faqs.map((row: { unified_category: string }) => row.unified_category)).toEqual(['퇴직금', '주휴수당']);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('preserves the API maximum of 50 results without a separate hydration cap', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => faq(index + 1));
    rpcMock.mockResolvedValue({ data: rows, error: null });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test&size=100'));
    expect((await response.json()).faqs).toHaveLength(50);
    expect(inMock).toHaveBeenCalledExactlyOnceWith('id', rows.map((row) => row.id));
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('search_faq_hybrid', {
      query_text: 'test', max_results: 50,
    });
  });

  it('leaves missing categories null when the read is incomplete', async () => {
    rpcMock.mockResolvedValue({ data: [faq(1), faq(2), faq(3)], error: null });
    inMock.mockResolvedValue({ data: [{ id: 1, unified_category: '퇴직금', category: null }, { id: 2, unified_category: null, category: null }], error: null });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test'));
    expect(await response.json()).toEqual({
      faqs: [faq(1, { unified_category: '퇴직금' }), faq(2, { unified_category: null }), faq(3, { unified_category: null })],
      total: 3,
    });
  });

  it('retains hybrid results with a null category when the metadata read fails', async () => {
    rpcMock.mockResolvedValue({ data: [faq(1)], error: null });
    inMock.mockResolvedValue({ data: null, error: { message: 'metadata unavailable' } });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ faqs: [faq(1, { unified_category: null })], total: 1 });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('retains the legacy search fallback if hybrid search fails', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'hybrid unavailable' } })
      .mockResolvedValueOnce({ data: [{ ...faq(7, { unified_category: '퇴직금' }), total_count: 21 }], error: null });

    const response = await GET(new NextRequest('http://localhost/api/faq?q=test&page=2&size=20'));
    expect(await response.json()).toEqual({ faqs: [faq(7, { unified_category: '퇴직금' })], total: 21 });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'get_faq_by_category', {
      cat: null, page_size: 20, page_offset: 20, search_query: 'test', canonical_only: false,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('FAQ category links', () => {
  it('renders valid category links and skips absent or empty categories', () => {
    const html = renderToStaticMarkup(createElement(FaqClient, {
      initialFaqs: [
        { ...faq(1), unified_category: '실업급여/고용보험' },
        { ...faq(2), unified_category: null },
        { ...faq(3), unified_category: '' },
      ],
      categoryCounts: [],
      totalCount: 3,
    }));

    expect(html).toContain(`href="/faq/${encodeURIComponent('실업급여/고용보험')}"`);
    expect(html.match(/href="\/faq\//g)).toHaveLength(1);
    expect(html).not.toMatch(/href="\/faq\/(?:undefined|null)?"/);
    expect(html).toContain('Question 2');
    expect(html).toContain('Question 3');
  });

  it('keeps category links hidden when a category is already active', () => {
    const html = renderToStaticMarkup(createElement(FaqClient, {
      initialFaqs: [{ ...faq(1), unified_category: '퇴직금' }],
      categoryCounts: [],
      totalCount: 1,
      initialCategory: '퇴직금',
    }));

    expect(html).not.toContain('href="/faq/');
    expect(html).toContain('Question 1');
  });
});
