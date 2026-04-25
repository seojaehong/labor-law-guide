import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseAdmin || supabase;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== 'interp-debug-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get('q') || '근로개선정책과 임금체불 행정해석';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'no openai' });

  const embResp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: q, model: 'text-embedding-3-small' }),
  });
  const queryEmbedding = (await embResp.json())?.data?.[0]?.embedding;

  const interpResult = await db.rpc('search_interpretation_semantic', {
    query_embedding: queryEmbedding,
    max_results: 3,
    min_similarity: 0.35,
  });
  const courtResult = await db.rpc('search_cases_semantic', {
    query_embedding: queryEmbedding,
    max_results: 5,
    min_similarity: 0.35,
  });

  return NextResponse.json({
    q,
    embedding_len: queryEmbedding?.length,
    interp: { error: interpResult.error?.message, count: interpResult.data?.length, top: interpResult.data?.slice(0, 3).map((x: { id: string; title: string; similarity: number }) => ({ id: x.id, title: x.title, sim: x.similarity })) },
    court: { error: courtResult.error?.message, count: courtResult.data?.length, top: courtResult.data?.slice(0, 3).map((x: { id: string; title: string; similarity: number }) => ({ id: x.id, title: x.title, sim: x.similarity })) },
  });
}
