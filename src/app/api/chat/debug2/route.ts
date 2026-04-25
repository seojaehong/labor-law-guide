import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseAdmin || supabase;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== 'court-debug-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get('q') || '대법원 통상임금 정기상여금';

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return NextResponse.json({ error: 'no key' });

  const embResp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: q, model: 'text-embedding-3-small' }),
  });
  const embJson = await embResp.json();
  const queryEmbedding = embJson?.data?.[0]?.embedding;

  // Direct call with various thresholds
  const results: Record<string, unknown> = { query: q, embedding_len: queryEmbedding?.length };

  for (const t of [0.0, 0.3, 0.35, 0.4, 0.5]) {
    const r = await db.rpc('search_cases_semantic', {
      query_embedding: queryEmbedding,
      max_results: 5,
      min_similarity: t,
    });
    results[`threshold_${t}`] = {
      error: r.error,
      count: r.data?.length || 0,
      top: r.data?.slice(0, 3).map((x: { id: string; title: string; similarity: number }) => ({
        id: x.id,
        title: x.title,
        sim: x.similarity,
      })),
    };
  }

  return NextResponse.json(results);
}
