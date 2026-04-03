import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { checkAdminAuth } from '@/lib/admin-auth';

const db = supabaseAdmin || supabaseServer;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkAdminAuth(_req);
  if (authError) return authError;

  const { id } = await params;

  const { data, error } = await db
    .from('blog_articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data });
}
