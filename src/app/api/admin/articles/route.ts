import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { checkAdminAuth } from '@/lib/admin-auth';

const db = supabaseAdmin || supabaseServer;

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = db
    .from('blog_articles')
    .select('id, slug, title, subtitle, category, author, published_at, updated_at, is_published, view_count, tags', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
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
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('blog_articles')
    .update(updates)
    .eq('id', id)
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
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await db
    .from('blog_articles')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
