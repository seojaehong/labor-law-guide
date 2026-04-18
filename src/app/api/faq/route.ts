import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseAdmin || supabase;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const category = searchParams.get('category') || null;
  const query = searchParams.get('q') || null;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt(searchParams.get('size') || '20', 10)));
  const offset = (page - 1) * size;

  const { data, error } = await db.rpc('get_faq_by_category', {
    cat: category,
    page_size: size,
    page_offset: offset,
    search_query: query,
  });

  if (error) {
    return NextResponse.json({ faqs: [], total: 0, error: error.message }, { status: 500 });
  }

  const faqs = (data || []).map((row: { id: number; unified_category: string; question: string; answer: string; total_count: number }) => ({
    id: row.id,
    unified_category: row.unified_category,
    question: row.question,
    answer: row.answer,
  }));

  const total = data?.[0]?.total_count || 0;

  return NextResponse.json({ faqs, total });
}
