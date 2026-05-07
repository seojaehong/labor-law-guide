import type { SupabaseClient } from '@supabase/supabase-js';
import { rerankPassages } from './rerank';

type FaqRow = {
  id: number;
  unified_category?: string;
  category?: string;
  question: string;
  answer: string;
};

export type FaqContextResult = {
  context: string;
  matched: boolean;
  count: number;
  categories: string[];
  topIds: number[];
};

const CITATION_GUIDE =
  '\n[인용 규칙 — 반드시 준수]\n' +
  '1) 위 DB 내용을 토대로 답변하세요. 그대로 복사 X, 질문 맥락에 맞춰 재구성.\n' +
  '2) DB 매칭이 있는 경우(=위에 항목들이 보일 때) 답변에 최소 1건 이상 `[FAQ#숫자]` 형식 출처를 반드시 포함하세요. 예: "5인 미만 사업장은 부당해고 구제신청 대상이 아닙니다 [FAQ#12345].".\n' +
  '3) 여러 항목을 종합한 경우 `[FAQ#123, FAQ#456]` 콤마로 나열.\n' +
  '4) 출처 표기를 빼면 사용자가 답변을 검증할 수 없으므로 출처 표기는 신뢰 최우선 사항입니다.';

export async function buildFaqContext(
  db: SupabaseClient,
  searchQuery: string,
  queryEmbedding: number[] | null
): Promise<FaqContextResult> {
  let dbFaq: FaqRow[] | null = null;
  let dbErr: { message: string } | null = null;

  // NIM Reranker 활성 시 후보 16건 retrieval → rerank → top 5 사용 (token 절감 + 적합도 향상)
  // 비활성 시 기존 top 8 그대로 (변경 없음, fail-safe)
  const RERANK_ON = process.env.NIM_RERANK_ENABLED === 'true';
  const RETRIEVE_K = RERANK_ON ? 16 : 8;
  const FINAL_N = RERANK_ON ? 5 : 8;

  // 3-layer: combined → hybrid → legacy
  const combined = await db.rpc('search_faq_combined', {
    query_text: searchQuery,
    query_embedding: queryEmbedding,
    max_results: RETRIEVE_K,
    canonical_only: false,
  });
  if (!combined.error && combined.data && combined.data.length > 0) {
    dbFaq = combined.data;
  } else if (combined.error) {
    const hybrid = await db.rpc('search_faq_hybrid', {
      query_text: searchQuery,
      max_results: RETRIEVE_K,
    });
    if (!hybrid.error && hybrid.data && hybrid.data.length > 0) {
      dbFaq = hybrid.data;
    } else {
      const legacy = await db.rpc('search_faq', {
        query: searchQuery,
        result_limit: RETRIEVE_K,
      });
      dbFaq = legacy.data;
      dbErr = legacy.error;
    }
  }

  const matched = !dbErr && dbFaq !== null && dbFaq.length > 0;
  let matchedFaqs: FaqRow[] = matched && dbFaq ? dbFaq : [];

  // NIM Reranker — query에 대해 top N 만 추출 (timeout/error 시 입력 그대로 사용)
  if (RERANK_ON && matchedFaqs.length > FINAL_N) {
    const rerankInput = matchedFaqs.map((f) => ({
      id: f.id,
      text: `Q: ${f.question}\nA: ${f.answer}`,
    }));
    const reranked = await rerankPassages(searchQuery, rerankInput, FINAL_N);
    const idOrder = new Map(reranked.map((r, i) => [r.id, i]));
    matchedFaqs = matchedFaqs
      .filter((f) => idOrder.has(f.id))
      .sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));
  } else if (matchedFaqs.length > FINAL_N) {
    matchedFaqs = matchedFaqs.slice(0, FINAL_N);
  }
  const categories = [
    ...new Set(matchedFaqs.map((f) => f.unified_category || f.category || '')),
  ].filter(Boolean);

  let context = '';
  let topIds: number[] = [];

  if (matched) {
    context = '\n\n═══ 관련 지식DB 매칭 결과 (참고하여 답변) ═══\n';
    for (const faq of matchedFaqs) {
      context += `\n#${faq.id} [${faq.unified_category || faq.category}] Q: ${faq.question}\nA: ${faq.answer}\n`;
    }
    context += CITATION_GUIDE;
    topIds = matchedFaqs.slice(0, 3).map((f) => f.id);
  }

  return { context, matched, count: matchedFaqs.length, categories, topIds };
}
