import type { SupabaseClient } from '@supabase/supabase-js';
import { type Retrieval } from './result';

type NlrcRow = {
  id: string;
  title: string;
  decision_result?: string;
  holding_summary?: string;
  key_issue?: string;
  decision_date?: string;
};

/**
 * 질문에서 tsquery 로 쓸 낱말을 뽑는다. (우회 경로 전용)
 *
 * (1) plainto_tsquery 는 모든 낱말을 AND 로 묶는다. 질문을 통째로 넣으면
 *     '연차휴가는 & 며칠인가요' 가 되어 0건이 나온다(실측). 그래서 OR(|) 로 묶는다.
 * (2) 조사·어미가 붙은 채로 넣으면 색인어와 안 맞고, 안 맞는 낱말이 많을수록 느리다.
 *     '연차휴가는 | 며칠인가요' 는 5.2초, '연차 | 휴가' 는 0.24초였다.
 */
function toTerms(searchQuery: string): string[] {
  const STOP_TAIL = /(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|에게|한테)$/;
  const QUESTION_TAIL = /(나요|까요|인가요|습니까|는지|한가요|될까요|되나요|하나요|입니까)$/;
  return Array.from(
    new Set(
      searchQuery
        .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => w.replace(QUESTION_TAIL, '').replace(STOP_TAIL, ''))
        .filter((w) => w.length >= 2)
    )
  ).slice(0, 5);
}

function renderNlrc(cases: NlrcRow[]): string {
  let ctx = '\n\n═══ 관련 노동위 판정례 (3건, 답변 시 [CASE#id] 형식 인용) ═══\n';
  for (const c of cases) {
    const date = c.decision_date ? String(c.decision_date).slice(0, 10) : '';
    const summary = (c.holding_summary || c.key_issue || '').slice(0, 280);
    ctx += `\n#${c.id} [${date}${c.decision_result ? ' / ' + c.decision_result : ''}] ${c.title}\n  ${summary}\n`;
  }
  ctx +=
    '\n[판정례 인용 규칙] 답변에서 위 노동위 판정례 인용 시 `[CASE#id]` 형식 사용. 사용자 케이스와 사실관계가 다르면 차이점 명시.';
  return ctx;
}

/** 우회 경로 — 임베딩 없는 키워드 전문검색. RPC 가 실패했을 때만 쓴다. */
async function nlrcByFullText(db: SupabaseClient, searchQuery: string): Promise<Retrieval> {
  const terms = toTerms(searchQuery);
  if (terms.length === 0) return { ctx: '', rows: 0, via: 'fts', status: '0rows' };

  const res = await db
    .from('nlrc_decisions')
    .select('id, title, decision_result, holding_summary, key_issue, decision_date')
    .textSearch('search_tsv', terms.join(' | '))
    .not('is_non_labor', 'is', true)
    .gte('confidence_level', 0.8)
    .limit(3);

  if (res.error) {
    console.error('[cases.ts] nlrc fts error:', JSON.stringify(res.error));
    return { ctx: '', rows: 0, via: 'fts', status: 'error' };
  }
  const rows = (res.data ?? []) as NlrcRow[];
  if (rows.length === 0) {
    console.warn('[cases.ts] nlrc fts 0 rows:', terms.join(' | '));
    return { ctx: '', rows: 0, via: 'fts', status: '0rows' };
  }
  return { ctx: renderNlrc(rows), rows: rows.length, via: 'fts', status: 'ok' };
}

/**
 * 판정례 컨텍스트.
 *
 * 2026-09-01 오전에는 search_similar_cases_hybrid 가 10.13초에 statement timeout(57014)
 * 으로 죽어서 키워드 전문검색으로 우회했다. 같은 날 DB 마이그레이션 2건으로 함수를 고쳤고
 * (key_issue 트라이그램 가지 제거 + 벡터 후보 150→200), 실측 0.5~0.9초가 됐다.
 * 그래서 하이브리드로 되돌린다 — 우회는 의미검색이 빠진 키워드 검색이라 정확성 손해였다.
 *
 * 우회 경로는 지우지 않고 폴백으로 남긴다. 되돌린 판단이 틀렸을 때 0건으로 떨어지는 것보다
 * 키워드 검색이라도 하는 편이 낫고, 어느 경로로 얻었는지는 via 로 사후에 구분된다.
 */
export async function buildNlrcCasesContext(
  db: SupabaseClient,
  searchQuery: string,
  queryEmbedding: number[]
): Promise<Retrieval> {
  try {
    // 오버로드가 2개라 위치인자로 부르면 42725(is not unique)로 죽는다.
    // PostgREST 가 키 이름으로 고르므로 plpgsql 판의 키셋을 정확히 보낸다.
    const res = await db.rpc('search_similar_cases_hybrid', {
      query_text: searchQuery,
      query_embedding: queryEmbedding,
      category: null,
      match_count: 3,
      semantic_weight: 0.7,
    });

    if (res.error) {
      console.error('[cases.ts] nlrc rpc error — fts 로 폴백:', JSON.stringify(res.error));
      return await nlrcByFullText(db, searchQuery);
    }
    const rows = (res.data ?? []) as NlrcRow[];
    if (rows.length === 0) {
      console.warn('[cases.ts] nlrc rpc 0 rows — fts 로 폴백:', searchQuery.slice(0, 60));
      return await nlrcByFullText(db, searchQuery);
    }
    return { ctx: renderNlrc(rows), rows: rows.length, via: 'rpc', status: 'ok' };
  } catch (err) {
    console.error('[cases.ts] nlrc 예외 — fts 로 폴백:', (err as Error)?.message?.slice(0, 150));
    try {
      return await nlrcByFullText(db, searchQuery);
    } catch {
      return { ctx: '', rows: 0, via: 'none', status: 'error' };
    }
  }
}

export async function buildCourtCasesContext(
  db: SupabaseClient,
  queryEmbedding: number[]
): Promise<Retrieval> {
  try {
    const courtResult = await db.rpc('search_cases_semantic', {
      query_embedding: queryEmbedding,
      max_results: 5,
      min_similarity: 0.35,
    });
    if (courtResult.error) {
      console.error('[cases.ts] court rpc error:', JSON.stringify(courtResult.error));
      return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
    }
    const courts = (courtResult.data ?? []) as Array<{
      id: string;
      title: string;
      court?: string;
      decision_date?: string;
      verdict_type?: string;
      summary?: string;
    }>;
    if (courts.length === 0) {
      console.warn('[cases.ts] court rpc 0 rows');
      return { ctx: '', rows: 0, via: 'rpc', status: '0rows' };
    }
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
    return { ctx, rows: courts.length, via: 'rpc', status: 'ok' };
  } catch (err) {
    console.error('[cases.ts] court 예외:', (err as Error)?.message?.slice(0, 150));
    return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
  }
}
