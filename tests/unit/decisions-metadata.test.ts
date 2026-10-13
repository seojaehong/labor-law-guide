import { expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({supabase:{}}));
vi.mock('next/cache', () => ({unstable_cache: (fn: unknown) => fn}));
import { generateMetadata } from '@/app/decisions/page';
import type { Search } from '@/lib/decisions-query';
import { SITE_URL } from '@/lib/constants';
it.each([
  [{},true],
  [{q:'성희롱'},false],
  [{reason:'no_dismissal'},false],
  [{reason:'no_dismissal',page:'2'},false],
  [{reason:'constructor'},false],
  [{reason:''},false],
  [{reason:'no_dismissal',q:'해고'},false],
] as [Search,boolean][])('preserves canonical and robots for %j', async (params,index) => {
  const metadata=await generateMetadata({searchParams:Promise.resolve(params)});
  expect(metadata.robots).toEqual({index,follow:true});
  expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/decisions`);
  expect(metadata.openGraph?.url).toBe(`${SITE_URL}/decisions`);
});
