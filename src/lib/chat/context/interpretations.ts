import type { SupabaseClient } from '@supabase/supabase-js';

export async function buildInterpretationsContext(
  db: SupabaseClient,
  queryEmbedding: number[]
): Promise<string> {
  try {
    const interpResult = await db.rpc('search_interpretation_semantic', {
      query_embedding: queryEmbedding,
      max_results: 3,
      min_similarity: 0.35,
    });
    if (interpResult.error || !Array.isArray(interpResult.data) || interpResult.data.length === 0)
      return '';
    const interps = interpResult.data as Array<{
      id: string;
      case_number?: string;
      title: string;
      inquiry_summary?: string;
      answer_summary?: string;
      decision_date?: string;
      url?: string;
    }>;
    let ctx = '\n\n═══ 관련 행정해석 (3건, 답변 시 [INTERP#id] 인용) ═══\n';
    for (const it of interps) {
      const date = it.decision_date || '';
      const summary = (it.answer_summary || it.inquiry_summary || '').slice(0, 280);
      ctx += `\n#${it.id} [${it.case_number || ''} ${date}] ${it.title}\n  ${summary}\n`;
    }
    ctx +=
      '\n[행정해석 인용 규칙] 답변 시 위 회신을 인용할 때 `[INTERP#id]` 형식 (id는 위 #뒤 ml_xxxx 그대로). 행정해석은 노동부 공식 입장.';
    return ctx;
  } catch {
    return '';
  }
}
