import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { checkAdminAuth } from '@/lib/admin-auth';

const db = supabaseAdmin || supabaseServer;

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const authorParam = searchParams.get('author');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = db
    .from('blog_articles')
    .select('slug, title, subtitle, category, author, published_at, updated_at, tags', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  if (authorParam && authorParam !== 'all') {
    query = query.eq('author', authorParam);
  }
  if (dateFrom) {
    query = query.gte('published_at', `${dateFrom}T00:00:00+09:00`);
  }
  if (dateTo) {
    query = query.lte('published_at', `${dateTo}T23:59:59+09:00`);
  }
  if (search) {
    const safeSearch = search.replace(/[%_\\,().]/g, '');
    query = query.or(`title.ilike.%${safeSearch}%,slug.ilike.%${safeSearch}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data, total: count, page, limit });
}

export async function PATCH(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;
  const body = await req.json();
  const slug = body.slug || body.id;

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const ALLOWED_FIELDS = ['title', 'subtitle', 'content', 'summary', 'category', 'tags', 'seo_title', 'seo_description', 'author', 'subtype'] as const;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await db
    .from('blog_articles')
    .update(updates)
    .eq('slug', slug)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data });
}

export async function DELETE(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || searchParams.get('id');

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const { error } = await db
    .from('blog_articles')
    .delete()
    .eq('slug', slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
