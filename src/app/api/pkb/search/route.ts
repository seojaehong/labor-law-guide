// PKB 검색 + RAG API
// POST /api/pkb/search
//   body: { query: string, k?: number, folder?: string, withAnswer?: boolean }
//   resp: { chunks: [...], answer?: string, citations?: [...] }
//
// 인증: 개인 사용용이라 ADMIN_PKB_TOKEN 환경변수와 Bearer 비교.
// (Phase 1 단순화 — 추후 Supabase Auth 통합 가능)

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { embedQuery } from '@/lib/vertex/embeddings';
import { getGenerativeModel } from '@/lib/vertex/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_TOKEN = process.env.ADMIN_PKB_TOKEN || process.env.ADMIN_TOKEN || '';

type Chunk = {
  id: number;
  source_path: string;
  folder: string;
  doc_id: string | null;
  title: string | null;
  section: string | null;
  content: string;
  meta: Record<string, unknown> | null;
  similarity: number;
};

function isAuthorized(req: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const h = req.headers.get('authorization') || '';
  return h === `Bearer ${ADMIN_TOKEN}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase admin not configured' }, { status: 500 });
  }

  let body: { query?: string; k?: number; folder?: string; withAnswer?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const query = (body.query || '').trim();
  if (!query) return NextResponse.json({ error: 'query empty' }, { status: 400 });
  const k = Math.min(Math.max(body.k ?? 8, 1), 20);
  const folder = body.folder || null;
  const withAnswer = body.withAnswer !== false; // 기본 true

  // 1) 쿼리 임베딩
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query);
  } catch (e) {
    return NextResponse.json({ error: 'embed failed', detail: String(e) }, { status: 500 });
  }

  // 2) pgvector RPC 호출
  const { data: rows, error } = await supabaseAdmin.rpc('pkb_search', {
    query_embedding: queryEmbedding,
    match_count: k,
    filter_folder: folder,
  });
  if (error) {
    return NextResponse.json({ error: 'search rpc failed', detail: error.message }, { status: 500 });
  }
  const chunks = (rows || []) as Chunk[];

  if (!withAnswer || chunks.length === 0) {
    return NextResponse.json({ chunks, answer: null, citations: [] });
  }

  // 3) RAG 답변 (Gemini)
  const ctx = chunks
    .map((c, i) => {
      const folder = c.folder;
      const title = c.title || c.doc_id || '';
      const section = c.section ? ` > ${c.section}` : '';
      const src = c.source_path.split('Obsidian Vault/').pop() || c.source_path;
      return `[${i + 1}] (${folder}/${src}${section}) ${title}\n${c.content}`;
    })
    .join('\n\n---\n\n');

  const prompt = `당신은 공인노무사 서재홍의 개인 지식관리 비서입니다.
아래 발췌(vault 본인 자문/상담/사건/레퍼런스/브리핑 + 참고자료)를 근거로 질문에 답하세요.

규칙:
- 발췌 내용에 명확히 근거가 있을 때만 답한다. 추측·일반 지식만으로 답하지 않는다.
- 답변 끝에 인용 번호 [1] [2] 형태로 출처 표시.
- 본인 자문 사례가 있으면 우선 인용.
- 답변은 한국어, 핵심부터 간결하게.

질문: ${query}

발췌:
${ctx}

답변:`;

  let answer = '';
  try {
    const model = getGenerativeModel('gemini-2.5-flash-preview-04-17');
    const result = await model.generateContent(prompt);
    const cand = result.response.candidates?.[0];
    const parts = cand?.content?.parts || [];
    answer = parts.map((p) => (typeof p === 'object' && 'text' in p ? p.text : '')).join('').trim();
  } catch (e) {
    answer = `(LLM 답변 생성 실패: ${String(e).slice(0, 120)})`;
  }

  const citations = chunks.map((c, i) => ({
    n: i + 1,
    folder: c.folder,
    title: c.title,
    section: c.section,
    source_path: c.source_path,
    similarity: Number(c.similarity?.toFixed(3) ?? 0),
  }));

  return NextResponse.json({ chunks, answer, citations });
}
