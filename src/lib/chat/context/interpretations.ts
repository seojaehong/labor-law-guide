import type { SupabaseClient } from '@supabase/supabase-js';
import { type Retrieval } from './result';

const MIN_SIMILARITY = 0.35;

export async function buildInterpretationsContext(
  db: SupabaseClient,
  queryEmbedding: number[]
): Promise<Retrieval> {
  try {
    // 2026-10-05: v1 → v2. v1 은 molab_interpretations 9,636건만 읽고
    // admin_interpretations 16,541건을 보지 못했다. v2 가 둘을 합쳐 읽는다.
    //
    // v2 는 느려서 못 붙이고 있었다(콜드 8초~타임아웃). 원인은 후보 LIMIT 이
    // 변수식이라 ivfflat 최적화가 꺼진 것이었고, 상수로 바꿔 호출당 읽는 양을
    // 4,288MB → 119MB 로 줄였다. 실측 172ms(v1 139ms).
    //
    // min_date 는 넘기지 않는다. 행정해석은 법이 바뀌지 않았으면 오래된 것도 유효하고,
    // 하한 2010 을 걸면 「주휴수당 계산」 질의가 3건 → 1건으로 줄었다(실측).
    // 대신 아래에서 회신일을 보여주고 낡은 해석일 수 있음을 알린다.
    const interpResult = await db.rpc('search_interpretation_semantic_v2', {
      query_embedding: queryEmbedding,
      max_results: 3,
      min_similarity: MIN_SIMILARITY,
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
      source?: string;
    }>;
    if (interps.length === 0) {
      // 2026-09-01: 같은 질의가 824자와 0자를 오갔다. 0건인지 잘린 건지 구분이 안 돼서
      // 원인을 좁힐 수 없었다. 0건이면 0건이라고 남긴다.
      console.warn(`[interpretations.ts] rpc 0 rows (min_similarity=${MIN_SIMILARITY})`);
      return { ctx: '', rows: 0, via: 'rpc', status: '0rows' };
    }
    // 건수를 하드코딩하지 않는다. 3건을 요청해도 1건만 올 수 있다(실측).
    let ctx = `\n\n═══ 관련 행정해석 (${interps.length}건, 답변 시 [INTERP#id] 인용) ═══\n`;
    for (const it of interps) {
      const date = it.decision_date || '';
      const summary = (it.answer_summary || it.inquiry_summary || '').slice(0, 280);
      ctx += `\n#${it.id} [${it.case_number || ''} ${date}] ${it.title}\n  ${summary}\n`;
    }
    // id 형식이 두 가지다 — molab 은 ml_xxxx, admin 은 「기관명-번호」(예: 노사관계법제과-2110).
    // 종전 프롬프트가 'ml_xxxx 그대로'라고만 적어 두어, admin 을 읽히면 인용이 깨질 수 있었다.
    ctx +=
      '\n[행정해석 인용 규칙] 위 회신을 인용할 때 `[INTERP#id]` 형식을 쓴다. id 는 위 #뒤 문자열을 ' +
      '**그대로** 옮긴다 — `ml_xxxx` 형태와 `노사관계법제과-2110` 같은 기관명-번호 형태가 둘 다 있다. ' +
      '형식을 고치거나 번역하지 않는다.\n' +
      '[주의] 행정해석은 노동부 공식 입장이지만 회신일 당시의 법령 기준이다. 대괄호 안의 회신일이 오래된 경우 ' +
      '그 뒤 법이 개정되었을 수 있으므로 현행 조문과 다를 수 있다고 함께 밝힌다. 단정하지 않는다.';
    return { ctx, rows: interps.length, via: 'rpc', status: 'ok' };
  } catch (err) {
    console.error('[interpretations.ts] 예외:', (err as Error)?.message?.slice(0, 150));
    return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
  }
}
