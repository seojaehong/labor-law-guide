import type { SupabaseClient } from '@supabase/supabase-js';
import { type Retrieval } from './result';

export async function buildInterpretationsContext(
  db: SupabaseClient,
  queryEmbedding: number[]
): Promise<Retrieval> {
  try {
    const interpResult = await db.rpc('search_interpretation_semantic', {
      query_embedding: queryEmbedding,
      max_results: 3,
      min_similarity: 0.35,
    });
    if (interpResult.error) {
      console.error('[interpretations.ts] rpc error:', JSON.stringify(interpResult.error));
      return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
    }
    const interps = (interpResult.data ?? []) as Array<{
      id: string;
      case_number?: string;
      title: string;
      inquiry_summary?: string;
      answer_summary?: string;
      decision_date?: string;
      url?: string;
    }>;
    if (interps.length === 0) {
      // 2026-09-01: 같은 질의가 824자와 0자를 오갔다. 0건인지 잘린 건지 구분이 안 돼서
      // 원인을 좁힐 수 없었다. 0건이면 0건이라고 남긴다.
      console.warn('[interpretations.ts] rpc 0 rows (min_similarity=0.35)');
      return { ctx: '', rows: 0, via: 'rpc', status: '0rows' };
    }
    let ctx = '\n\n═══ 관련 행정해석 (3건, 답변 시 [INTERP#id] 인용) ═══\n';
    for (const it of interps) {
      const date = it.decision_date || '';
      const summary = (it.answer_summary || it.inquiry_summary || '').slice(0, 280);
      ctx += `\n#${it.id} [${it.case_number || ''} ${date}] ${it.title}\n  ${summary}\n`;
    }
    ctx +=
      '\n[행정해석 인용 규칙] 답변 시 위 회신을 인용할 때 `[INTERP#id]` 형식 (id는 위 #뒤 ml_xxxx 그대로). 행정해석은 노동부 공식 입장.';
    return { ctx, rows: interps.length, via: 'rpc', status: 'ok' };
  } catch (err) {
    console.error('[interpretations.ts] 예외:', (err as Error)?.message?.slice(0, 150));
    return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
  }
}
