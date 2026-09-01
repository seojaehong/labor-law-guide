import type { SupabaseClient } from '@supabase/supabase-js';

export async function buildNlrcCasesContext(
  db: SupabaseClient,
  searchQuery: string,
  queryEmbedding: number[]
): Promise<string> {
  try {
    // search_similar_cases_hybrid 는 쓰지 않는다.
    //
    // 2026-09-01 실측: 파라미터를 어떻게 바꿔도(limit 1, 검색어 비움, 가중치 변경)
    // 10.13초에 statement timeout(57014)으로 죽는다. 입력 문제가 아니라 함수가 고장이다.
    // 게다가 error 일 때 조용히 빈 문자열을 반환하도록 되어 있어 장애가 드러나지 않았다.
    // chat_logs 최근 400건(8/24~9/1) 전부 _nlrc_len=0 — 판정례를 한 번도 못 쓰고 답해 왔다.
    //
    // 함수를 고치려면 DB 접근 권한이 필요해서, 그전까지 search_tsv 전문검색으로 우회한다.
    // 실측 0.1~0.6초. 의미검색이 아니라 키워드 검색이라 정확도는 손해지만,
    // 지금은 결과가 아예 0건이므로 무조건 이득이다. RPC 가 고쳐지면 되돌린다.
    const terms = searchQuery
      .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 6)
      .join(' ');
    if (!terms) return '';

    const caseResult = await db
      .from('nlrc_decisions')
      .select('id, title, decision_result, holding_summary, key_issue, decision_date')
      .textSearch('search_tsv', terms, { type: 'plain' })
      .not('is_non_labor', 'is', true)
      .gte('confidence_level', 0.8)
      .limit(3);

    if (caseResult.error) {
      console.error('[cases.ts] nlrc fts error:', JSON.stringify(caseResult.error));
      return '';
    }
    if (!Array.isArray(caseResult.data) || caseResult.data.length === 0) {
      console.warn('[cases.ts] nlrc fts 0 rows:', terms.slice(0, 80));
      return '';
    }
    const cases = caseResult.data as Array<{
      id: string;
      title: string;
      decision_result?: string;
      holding_summary?: string;
      key_issue?: string;
      decision_date?: string;
    }>;
    let ctx = '\n\n═══ 관련 노동위 판정례 (3건, 답변 시 [CASE#id] 형식 인용) ═══\n';
    for (const c of cases) {
      const date = c.decision_date ? c.decision_date.slice(0, 10) : '';
      const summary = (c.holding_summary || c.key_issue || '').slice(0, 280);
      ctx += `\n#${c.id} [${date}${c.decision_result ? ' / ' + c.decision_result : ''}] ${c.title}\n  ${summary}\n`;
    }
    ctx +=
      '\n[판정례 인용 규칙] 답변에서 위 노동위 판정례 인용 시 `[CASE#id]` 형식 사용. 사용자 케이스와 사실관계가 다르면 차이점 명시.';
    return ctx;
  } catch {
    return '';
  }
}

export async function buildCourtCasesContext(
  db: SupabaseClient,
  queryEmbedding: number[]
): Promise<string> {
  try {
    const courtResult = await db.rpc('search_cases_semantic', {
      query_embedding: queryEmbedding,
      max_results: 5,
      min_similarity: 0.35,
    });
    if (courtResult.error || !Array.isArray(courtResult.data) || courtResult.data.length === 0) return '';
    const courts = courtResult.data as Array<{
      id: string;
      title: string;
      court?: string;
      decision_date?: string;
      verdict_type?: string;
      summary?: string;
    }>;
    let ctx = '\n\n═══ 관련 법원 판례 (최대 5건) ═══\n';
    for (const c of courts) {
      const date = c.decision_date && c.decision_date !== '0001-01-01' ? c.decision_date : '';
      const summary = (c.summary || '').slice(0, 280);
      ctx += `\n#${c.id} [${c.court || ''} ${date}${c.verdict_type ? ' / ' + c.verdict_type : ''}] ${c.title}\n  ${summary}\n`;
    }
    ctx +=
      '\n[법원 판례 인용 규칙 — 반드시 준수]\n' +
      '1) 답변에서 위 판례 중 관련된 것을 인용할 때 반드시 `[COURT#id]` 형식 사용 (id는 위 #뒤 문자열 그대로). 예: "대법원은 정기상여금이 통상임금 요건을 충족하면 인정한다고 판시 [COURT#대법원_2023다302838].".\n' +
      '2) 일반적인 "대법원은 ... 라고 판시" 식으로 답변하지 말고 위 DB의 구체적 판례 id를 사용하세요.\n' +
      '3) 학습 데이터에 있는 판례번호("2020다247190" 등)를 임의로 인용하지 말고, 반드시 위 DB에 있는 id만 인용하세요.';
    return ctx;
  } catch {
    return '';
  }
}
