import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(),
  select: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
  path: vi.fn(), tag: vi.fn(),
}));
vi.mock('@/lib/admin-auth', () => ({ checkAdminAuth: mocks.auth }));
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: mocks.from }, supabaseServer: null,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.path, revalidateTag: mocks.tag }));

import { PATCH } from '@/app/api/admin/articles/route';
import { POST } from '@/app/api/admin/articles/[id]/revalidate/route';

const slug = 'daily-20261020-01';
const context = { params: Promise.resolve({ id: slug }) };
const request = (method: string, body?: object) => new NextRequest(
  'https://example.test/api/admin/articles',
  { method, ...(body ? { body: JSON.stringify(body) } : {}) },
);

beforeEach(() => {
  vi.resetAllMocks();
  const query = {
    update: mocks.update, eq: mocks.eq, select: mocks.select,
    single: mocks.single, maybeSingle: mocks.maybeSingle,
  };
  for (const fn of [mocks.from, mocks.update, mocks.eq, mocks.select]) fn.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: { slug }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { slug }, error: null });
});

describe('article cache refresh', () => {
  it('rejects unauthorized save and refresh before reading or invalidating', async () => {
    mocks.auth.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    expect((await PATCH(request('PATCH', { slug }))).status).toBe(401);
    expect((await POST(request('POST'), context)).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.path).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });

  it('refreshes existing SQL-corrected content without any DB write', async () => {
    expect((await POST(request('POST'), context)).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith('slug', slug);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.path.mock.calls).toEqual([[`/blog/${slug}`], [`/og/${slug}`]]);
    expect(mocks.tag).toHaveBeenCalledWith('blog-article-lists', { expire: 0 });
  });

  it('does not invalidate a failed lookup', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } });
    expect((await POST(request('POST'), context)).status).toBe(500);
    expect(mocks.path).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });

  // #179(261110) — 지운 글이 행이 없을 때가 오히려 캐시를 비워야 할 때다. 404 로 거절하지 않고 경로를 비운 뒤 missing 을 알린다.
  it('still invalidates a missing row and reports missing', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(request('POST'), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: true, slug, missing: true });
    expect(mocks.path.mock.calls).toEqual([[`/blog/${slug}`], [`/og/${slug}`]]);
    expect(mocks.tag).toHaveBeenCalledWith('blog-article-lists', { expire: 0 });
  });

  it('invalidates only after a successful save', async () => {
    expect((await PATCH(request('PATCH', { slug, content: 'corrected' }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'corrected' }));
    expect(mocks.path).toHaveBeenCalledWith(`/blog/${slug}`);
    expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.path.mock.invocationCallOrder[0]);
    mocks.path.mockClear();
    mocks.tag.mockClear();
    mocks.single.mockResolvedValue({ data: null, error: { message: 'Save failed' } });
    expect((await PATCH(request('PATCH', { slug, content: 'corrected' }))).status).toBe(500);
    expect(mocks.path).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });
});
