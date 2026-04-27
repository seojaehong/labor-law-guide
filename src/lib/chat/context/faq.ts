import type { SupabaseClient } from '@supabase/supabase-js';
import { searchQA } from '@/content/ai-knowledge';

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
  queryEmbedding: number[] | null,
  fallbackQuery: string
): Promise<FaqContextResult> {
  let dbFaq: FaqRow[] | null = null;
  let dbErr: { message: string } | null = null;

  // 3-layer: combined → hybrid → legacy
  const combined = await db.rpc('search_faq_combined', {
    query_text: searchQuery,
    query_embedding: queryEmbedding,
    max_results: 8,
    canonical_only: false,
  });
  if (!combined.error && combined.data && combined.data.length > 0) {
    dbFaq = combined.data;
  } else if (combined.error) {
    const hybrid = await db.rpc('search_faq_hybrid', {
      query_text: searchQuery,
      max_results: 8,
    });
    if (!hybrid.error && hybrid.data && hybrid.data.length > 0) {
      dbFaq = hybrid.data;
    } else {
      const legacy = await db.rpc('search_faq', {
        query: searchQuery,
        result_limit: 8,
      });
      dbFaq = legacy.data;
      dbErr = legacy.error;
    }
  }

  const matched = !dbErr && dbFaq !== null && dbFaq.length > 0;
  const matchedFaqs: FaqRow[] = matched && dbFaq ? dbFaq : [];
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
  } else {
    const inlineFaq = searchQA(fallbackQuery);
    if (inlineFaq.length > 0) {
      context = '\n\n═══ 관련 예상질문 DB 매칭 결과 (참고하여 답변) ═══\n';
      for (const faq of inlineFaq.slice(0, 3)) {
        context += `\nQ: ${faq.question}\nA: ${faq.answer}\n${faq.relatedArticle ? `관련조문: ${faq.relatedArticle}` : ''}\n`;
      }
      context += '\n위 DB 내용을 참고하되, 질문에 맞게 자연스럽게 재구성하여 답변하세요.';
    }
  }

  return { context, matched, count: matchedFaqs.length, categories, topIds };
}
