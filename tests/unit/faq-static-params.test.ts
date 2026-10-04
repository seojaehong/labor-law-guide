import { describe, expect, it, vi } from 'vitest';
import { FAQ_CATEGORIES } from '@/lib/faq-categories';
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: [] })));
vi.mock('@/lib/supabase-server', () => ({ supabaseServer: { rpc } }));
vi.mock('@/app/faq/FaqClient', () => ({ default: () => null }));
import FaqCategoryPage, { generateStaticParams, generateMetadata } from '@/app/faq/[category]/page';

describe('FAQ static route parameters', () => {
  it('passes raw category names to Next, including slashes', async () => {
    expect(await generateStaticParams()).toEqual(FAQ_CATEGORIES.map(category => ({ category })));
  });
  it('queries the decoded category passed by the actual route', async () => {
    rpc.mockClear();
    await FaqCategoryPage({ params: Promise.resolve({ category: '산업재해' }) });
    expect(rpc).toHaveBeenCalledWith('get_faq_by_category', expect.objectContaining({ cat: '산업재해' }));
  });
  it.each(['산업재해', '실업급여/고용보험'])('keeps %s readable with exactly one URL encoding', async category => {
    const metadata = await generateMetadata({ params: Promise.resolve({ category }) });
    expect(metadata.title).toBe(`${category} FAQ — 노동법 질문과 답변`);
    expect(metadata.alternates?.canonical).toBe(`https://yellowenvelope.kr/faq/${encodeURIComponent(category)}`);
    const fromEncodedParam = await generateMetadata({ params: Promise.resolve({ category: encodeURIComponent(category) }) });
    expect(fromEncodedParam.title).toBe(metadata.title);
  });
});
