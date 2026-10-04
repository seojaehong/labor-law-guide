import type { SupabaseClient } from '@supabase/supabase-js';
import { jevRerank } from './jev';
import { toLexQuery } from './lex-query';

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
  // NVIDIA NIM 리랭커는 2026-05-18 에 서비스가 종료됐다(HTTP 410 Gone,
  // "This endpoint has reached its end of life on 2026-05-18").
  // 그런데 rerank 함수가 실패 시 입력을 그대로 돌려주는 fail-safe 라서 아무도 몰랐다.
  //
  // 문제는 조용히 실패하는 데서 끝나지 않았다. 리랭크가 켜져 있으면 후보를 16건 뽑아
  // 상위 5건만 쓰는데, 리랭크가 죽었으므로 '재정렬 없이 앞 5건'을 쓰게 된다.
  // 즉 리랭크를 켜 둔 탓에 오히려 FAQ 8건 대신 5건만 넣고 있었다 — 정확성 손해다.
  //
  // 재선택(② 단계). NIM 리랭커는 엔드포인트가 죽어 2026 중반부터 꺼져 있었고,
  // 그 사이 **재선택 자리가 비어 있었다** — 임베딩 1위가 그대로 LLM 으로 갔다.
  //
  // 2026-10-04 실측: 「부당노동행위 구제신청은 언제까지 해야 하나요?」의 1위가
  // 「실업급여 신청은 언제까지 해야 하나요?」였다. **말투가 주제를 눌렀다.**
  // 그래서 Jev 재선택(순서를 뒤집어 두 번 묻기)으로 그 자리를 채운다.
  // 기존 Vertex 클라이언트를 쓰므로 새 키·새 의존성이 없다.
  //
  // JEV_ON=false 로 끌 수 있다. 실패하면 jevRerank 가 원래 순서를 그대로 돌려준다.
  const JEV_ON = process.env.JEV_ON !== 'false';
  // 그물을 넓히고 고르기는 Jev 에 맡긴다. 재선택은 **풀 밖의 것을 꺼내올 수 없다** —
  // K=16 일 때 24질의 루브릭의 물리적 천장이 86.7% 였다(2026-10-04 실측).
  //
  // K 는 100 이 상한이다. 지연을 직접 쟀다(같은 3질의 × 2회):
  //   K=40 중위 252ms · K=60 251ms · K=100 267ms · **K=134 1,239ms(최대 2,053ms)**
  // 134 는 5배 느리고 한 번은 500(statement timeout)도 났다. 챗봇 경로에 쓸 수 없다.
  const RETRIEVE_K = JEV_ON ? 100 : 8;
  // 재선택에 넣는 수. 100건을 LLM 에 보여주지 않는다 — semantic_sim 으로 먼저 줄인다.
  const JEV_IN = 16;
  const FINAL_N = JEV_ON ? 5 : 8;

  // 어휘검색에는 내용어만 넘긴다(lex-query.ts 주석에 근거).
  // **임베딩은 원문 문장 그대로** 쓴다 — 밀집검색은 문장이 길어야 좋다.
  const lexQuery = toLexQuery(searchQuery);

  // 3-layer: combined → hybrid → legacy
  const combined = await db.rpc('search_faq_combined', {
    query_text: lexQuery,
    query_embedding: queryEmbedding,
    max_results: RETRIEVE_K,
    canonical_only: false,
  });
  if (!combined.error && combined.data && combined.data.length > 0) {
    dbFaq = combined.data;
  } else {
    // 🔴 2026-10-04 수정. 전에는 `else if (combined.error)` 였다 —
    // **combined 가 오류 없이 0건을 반환하면 폴백이 아예 안 돌았다.**
    const hybrid = await db.rpc('search_faq_hybrid', {
      query_text: lexQuery,
      max_results: RETRIEVE_K,
    });
    if (!hybrid.error && hybrid.data && hybrid.data.length > 0) {
      dbFaq = hybrid.data;
    } else {
      const legacy = await db.rpc('search_faq', {
        query: lexQuery,
        result_limit: RETRIEVE_K,
      });
      dbFaq = legacy.data;
      dbErr = legacy.error;
    }
  }

  const matched = !dbErr && dbFaq !== null && dbFaq.length > 0;
  let matchedFaqs: FaqRow[] = matched && dbFaq ? dbFaq : [];

  // 넓게 받은 뒤 **RPC 가 준 순서(final_rank)를 그대로** 상위 JEV_IN 만 재선택에 넣는다.
  //
  // 🔴 semantic_sim 내림차순 재정렬을 넣었다가 되돌렸다(2026-10-04). 구조적으로 틀렸다.
  // search_faq_combined 은 어휘 분기와 의미 분기를 FULL OUTER JOIN 하고
  // `COALESCE(s.similarity, 0)` 를 쓴다. 게다가 의미 분기에는 임계값 0.3 이 걸려 있다.
  // 즉 **semantic_sim = 0 은 「유사도가 낮다」가 아니라 「의미 분기 집합에 없다」**는 뜻이다.
  // 그걸로 내림차순 정렬하면 어휘로만 걸린 정답이 전부 맨 뒤로 간다.
  //
  // 실측 — 「산재 신청은 어떻게 하나요?」: 후보 100건에 산재 질문 38건이 들어오는데
  // 전부 semantic_sim 0.000 이라 재정렬 후 top5 에 한 건도 남지 않았다(0/5).
  // 「노동위원회 구제신청과 민사소송」도 같은 이유로 5/5 → 0/5 가 됐다.
  // faq 25,844건 전부 임베딩이 있다 — 결측이 원인이 아니다.
  if (JEV_ON && matchedFaqs.length > JEV_IN) {
    matchedFaqs = matchedFaqs.slice(0, JEV_IN);
  }

  // Jev 재선택 — 실패·타임아웃이면 입력 순서를 그대로 쓴다(답이 안 나가는 것이 더 나쁘다)
  //
  // ⚠ 병합 규칙은 **바꾸지 않는다.** 2026-10-04 에 네 가지 변경안(원래 1위 보호 ·
  // 동률을 검색순위로 타이브레이크 · 교차만 승격 · baseline 좋으면 skip)을 적대적으로
  // 측정했더니 **전부 점수를 떨어뜨렸다**(1위 보호는 −5.2점). 손대지 말 것.
  if (JEV_ON && matchedFaqs.length > FINAL_N) {
    matchedFaqs = await jevRerank(searchQuery, matchedFaqs, FINAL_N);
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
