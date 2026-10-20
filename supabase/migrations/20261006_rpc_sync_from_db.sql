-- DB 에만 적용돼 있던 RPC 두 개를 레포에 맞춘다 (2026-10-06)
--
-- 서버1 지적 — 「DB 변경 누락」. 맞다. 아래 둘은 Supabase 에 직접 적용했고
-- 마이그레이션 파일에 넣지 않았다. 레포만 보고 DB 를 다시 세우면 어긋난다.
--
--   ① search_interpretation_semantic_v2   후보 LIMIT 를 상수로 (2026-10-05 적용)
--   ② search_law_articles_hybrid          plpgsql + HNSW 설정 (2026-10-06 적용)
--
-- ②는 `20261005_law_articles_corpus.sql` §5 에 **sql STABLE 판**이 적혀 있고 §6 에
-- 「전문은 DB 의 현재 정의를 보라」고만 써 두었다. 그것으로는 재현되지 않는다.
-- 이 파일이 **실행 가능한 최종판**이다. 두 파일을 순서대로 적용하면 DB 와 같아진다.

-- ────────────────────────────────────────────────────────────────────
-- ① 행정해석 v2 — 후보 LIMIT 를 상수로
--
-- 증상: 콜드에서 8초~타임아웃. 2026-10-05 챗봇 로그에 `_interp=timeout/5000ms` 가 찍혔다.
-- 원인: 후보 단계 `LIMIT max_results * 4` 가 **변수식**이라 플래너가 ivfflat 상위N
--       최적화를 포기한다. 호출당 **4,288MB** 를 만졌고 이 DB 의
--       `effective_cache_size` 가 128MB 라 캐시에 들어갈 수 없었다.
-- 조치: 후보는 `LIMIT 48` 상수로 뽑고 그 뒤 `max_results * 4` 로 자른다.
--       읽는 양 4,288MB → 119MB. 실측 172ms(v1 139ms). 결과 동일 20/20.
-- ⚠ 중복제거 로직은 **건드리지 않았다.** 「더 정확하게」 바꿨다가 20개 표본 중 6개에서
--   결과가 달라져 되돌렸다. 탈락 쌍 5,788건의 임베딩 유사도를 재니 87%가 같은 문서였다.
-- 원본 백업: 서버2 `shared/rpc-backup/search_interpretation_semantic_v2_원본_20261005.sql`

CREATE OR REPLACE FUNCTION public.search_interpretation_semantic_v2(
  query_embedding vector,
  max_results integer DEFAULT 3,
  min_similarity double precision DEFAULT 0.3,
  min_date date DEFAULT NULL::date
)
RETURNS TABLE(
  id text, case_number text, title text, inquiry_summary text, answer_summary text,
  decision_date date, url text, source text, similarity double precision
)
LANGUAGE sql STABLE AS $function$
  -- 후보 단계의 LIMIT 은 반드시 상수여야 한다. max_results*4 처럼 변수식을 쓰면
  -- 플래너가 ivfflat 상위N 최적화를 포기하고 호출당 4GB 를 만진다 (2026-10-05 실측).
  WITH m0 AS (
    SELECT m.id, m.case_number, m.title, m.inquiry_summary, m.answer_summary,
           m.decision_date, m.url, 'molab'::text AS source,
           (1 - (m.embedding <=> query_embedding))::float AS similarity,
           replace(coalesce(m.case_number,''),'－','-') AS key_num
    FROM molab_interpretations m
    WHERE m.embedding IS NOT NULL
      AND (1 - (m.embedding <=> query_embedding)) >= min_similarity
      AND (min_date IS NULL OR m.decision_date >= min_date)
    ORDER BY m.embedding <=> query_embedding
    LIMIT 48            -- max_results 12 까지 커버. 넘으면 아래 자르기에서 모자랄 수 있다
  ), a0 AS (
    SELECT a.id::text, a.doc_number AS case_number, a.title,
           NULL::text AS inquiry_summary,
           nullif(trim(concat_ws(E'\n', a.summary, a.holding_points)), '') AS answer_summary,
           a.decision_date, coalesce(a.original_url, a.url) AS url, 'admin'::text AS source,
           (1 - (a.embedding <=> query_embedding))::float AS similarity,
           replace(coalesce(a.doc_number,''),'－','-') AS key_num
    FROM admin_interpretations a
    WHERE a.embedding IS NOT NULL
      AND (1 - (a.embedding <=> query_embedding)) >= min_similarity
      AND nullif(trim(coalesce(a.summary,'')), '') IS NOT NULL   -- 본문 없는 320건 제외
      AND (min_date IS NULL OR a.decision_date >= min_date)
    ORDER BY a.embedding <=> query_embedding
    LIMIT 48
  ), m AS (SELECT * FROM m0 ORDER BY similarity DESC LIMIT max_results * 4),
     a AS (SELECT * FROM a0 ORDER BY similarity DESC LIMIT max_results * 4),
  u AS (
    SELECT * FROM m
    UNION ALL
    SELECT a.* FROM a
    WHERE NOT EXISTS (
      SELECT 1 FROM molab_interpretations x
      WHERE replace(coalesce(x.case_number,''),'－','-') = a.key_num
        AND x.decision_date IS NOT DISTINCT FROM a.decision_date)
  )
  SELECT id, case_number, title, inquiry_summary, answer_summary,
         decision_date, url, source, similarity
  FROM u ORDER BY similarity DESC LIMIT max_results;
$function$;

-- ────────────────────────────────────────────────────────────────────
-- ② 조문 하이브리드 검색 — plpgsql 최종판
--
-- `20261005_law_articles_corpus.sql` §5 의 sql STABLE 판을 **이것으로 대체한다.**
-- plpgsql 로 바꾼 이유는 `set_config` 를 쓰기 위해서다. sql STABLE 함수에서는 못 쓴다.
--
-- ivfflat → HNSW 로 바꿨고(§6), 플래너가 HNSW 를 스스로 고르지 않는다.
-- 16ms 인덱스 스캔보다 2.8초 Seq Scan 을 싸게 본다. 그래서 트랜잭션 로컬로 끈다.
-- `hnsw.ef_search` 는 LIMIT 이상이어야 회수가 유지된다(기본 40).
--
-- 설계 근거 (2026-10-06 실측) — 어휘가 주력, 의미가 보조다.
--   정답이 60위 안에 드는 비율: 어휘 4/6 · 의미 1/6(ivfflat) → 3/6(HNSW)
--   RRF 동등 결합을 먼저 시험했다가 어휘가 맞추던 것까지 깨졌다
--   (「연차 유급휴가 며칠」이 제60조 → 별표로 퇴보). 그래서 의미는 가산으로만 쓴다.

DROP FUNCTION IF EXISTS public.search_law_articles_hybrid(text, vector, integer, text);

CREATE FUNCTION public.search_law_articles_hybrid(
  query_text text,
  query_embedding vector DEFAULT NULL::vector,
  max_results integer DEFAULT 6,
  law_hint text DEFAULT NULL::text
)
RETURNS TABLE(
  law_name text, article_label text, article_title text, body text,
  law_kind text, effective_date date,
  lex_rank integer, vec_rank integer, score double precision, via text
)
LANGUAGE plpgsql STABLE AS $function$
BEGIN
  IF query_embedding IS NOT NULL THEN
    PERFORM set_config('enable_seqscan', 'off', true);
    PERFORM set_config('hnsw.ef_search', greatest(120, max_results * 2)::text, true);
  END IF;

  RETURN QUERY
  WITH toks AS (
    SELECT DISTINCT t FROM unnest(
      regexp_split_to_array(regexp_replace(trim(coalesce(query_text,'')), '\s+', ' ', 'g'), ' ')
    ) AS t WHERE length(t) >= 2
  ), lex0 AS (
    SELECT a.id,
           sum(CASE WHEN a.article_title ILIKE '%' || k.t || '%' THEN 4 ELSE 0 END
             + CASE WHEN a.body ILIKE '%' || k.t || '%' THEN 1 ELSE 0 END)::float
           + coalesce(max(similarity(a.article_title, query_text)) * 4, 0) AS s
    FROM law_articles a CROSS JOIN toks k
    WHERE NOT a.is_heading AND NOT a.is_deleted AND NOT a.is_byeolpyo
      AND a.body IS NOT NULL
      AND (a.article_title ILIKE '%' || k.t || '%' OR a.body ILIKE '%' || k.t || '%')
    GROUP BY a.id ORDER BY s DESC LIMIT 80
  ), lex AS (SELECT id, s, row_number() OVER (ORDER BY s DESC) AS r FROM lex0),
  vec0 AS (
    SELECT a.id FROM law_articles a
    WHERE query_embedding IS NOT NULL AND a.embedding IS NOT NULL
      AND NOT a.is_heading AND NOT a.is_deleted AND NOT a.is_byeolpyo
    ORDER BY a.embedding <=> query_embedding
    LIMIT 60                 -- ★ 상수여야 한다
  ), vec AS (SELECT id, row_number() OVER () AS r FROM vec0),
  merged AS (
    SELECT coalesce(l.id, v.id) AS id, l.r AS lr, v.r AS vr, l.s AS ls,
           CASE WHEN l.id IS NOT NULL AND v.id IS NOT NULL THEN 'both'
                WHEN l.id IS NOT NULL THEN 'lex' ELSE 'vec' END AS via
    FROM lex l FULL OUTER JOIN vec v ON l.id = v.id
  )
  SELECT a.law_name, a.article_label, a.article_title, a.body,
         a.law_kind, a.effective_date, m.lr::int, m.vr::int,
         ( coalesce(m.ls, 0)
         + CASE WHEN m.vr IS NOT NULL THEN 6.0/(1 + m.vr) ELSE 0 END
         + CASE WHEN m.via = 'both' THEN 2.5 ELSE 0 END
         + CASE a.law_kind WHEN '법률' THEN 0.6 ELSE 0 END
         + CASE WHEN law_hint IS NOT NULL AND a.law_name = law_hint THEN 2.0 ELSE 0 END
         )::float, m.via
  FROM merged m JOIN law_articles a ON a.id = m.id
  ORDER BY 9 DESC, length(a.body) ASC
  LIMIT max_results;
END;
$function$;
