import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { revalidateArticle } from '@/lib/article-cache';

const db = supabaseAdmin || supabaseServer;

// Refresh after an out-of-band correction without rewriting article content.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const { data, error } = await db
    .from('blog_articles')
    .select('slug')
    .eq('slug', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  revalidateArticle(data.slug);
  return NextResponse.json({ revalidated: true, slug: data.slug });
}
