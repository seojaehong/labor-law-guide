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

  // 261110 — 행이 없을 때가 오히려 비워야 할 때다. 종전에는 404 로 거절해서
  // 내린 글의 캐시를 비울 방법이 없었다. 없으면 경로만 비우고 missing 을 알린다.
  revalidateArticle(data?.slug ?? id);
  return NextResponse.json({ revalidated: true, slug: data?.slug ?? id, missing: !data });
}
