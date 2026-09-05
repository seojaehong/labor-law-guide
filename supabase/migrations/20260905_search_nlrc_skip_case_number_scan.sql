-- search_nlrc: 사건번호 ILIKE 분기를 숫자가 든 질의에서만 돈다 (2026-09-05)
--
-- 증상: search_nlrc('해고')가 9.1초. 8/27 1.2초에서 계속 악화됐고, 9/4에 퇴직금
--       3.8초를 잡은 뒤에도 '해고'만 혼자 남아 5초 기준을 넘겼다.
-- 원인: exact_candidates 의 case_number ILIKE '%해고%'. 9/4에 추가한
--       idx_nlrc_case_number_trgm 은 2글자 한글 질의에서 추출할 트라이그램이
--       없어 인덱스 전체를 훑고(rows=57,835) 전 행을 heap 리체크한다
--       — EXPLAIN: "Rows Removed by Index Recheck: 57835", Heap Blocks 16,352.
--       결과는 항상 0건인데 캐시가 식으면 이 분기 하나가 14초를 쓴다.
--       (enable_seqscan=off 라 Seq Scan 대신 이 경로로 갈 뿐, 비용은 같은 전수 스캔)
-- 조치: 사건번호는 반드시 숫자를 포함하므로 query 에 숫자가 없으면 분기를 건너뛴다.
--       테이블을 참조하지 않는 조건이라 플래너가 One-Time Filter 로 처리해
--       스캔 자체가 실행되지 않는다. 3글자 미만도 제외 — trgm 이 좁히지 못한다.
--       사건번호 검색('2023부해1234' 등)은 그대로 동작한다.

CREATE OR REPLACE FUNCTION public.search_nlrc(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
RETURNS TABLE (
  id TEXT,
  case_number TEXT,
  title TEXT,
  department TEXT,
  decision_date DATE,
  case_type TEXT,
  decision_result TEXT,
  reason_category TEXT[],
  key_issue TEXT,
  holding_summary TEXT,
  holding_points TEXT,
  summary_short TEXT,
  url TEXT,
  original_url TEXT,
  relevance REAL
)
LANGUAGE plpgsql
SET enable_seqscan TO 'off'
AS $function$
DECLARE
  tsquery_val tsquery;
BEGIN
  tsquery_val := plainto_tsquery('simple', query);

  RETURN QUERY
  WITH tsv_candidates AS (
    -- Phase 1: tsvector 검색 (GIN 인덱스 사용, 빠름)
    SELECT n.id AS cid
    FROM nlrc_decisions n
    WHERE n.search_tsv @@ tsquery_val
    LIMIT 200
  ),
  exact_candidates AS (
    -- Phase 2: 사건번호 매칭. 숫자 없는 질의(일반 키워드)에서는 건너뛴다 —
    -- trgm 인덱스가 좁히지 못해 전수 스캔이 되고, 결과는 어차피 0건이다.
    SELECT n.id AS cid
    FROM nlrc_decisions n
    WHERE query ~ '[0-9]'
      AND length(query) >= 3
      AND n.case_number ILIKE '%' || query || '%'
      AND NOT EXISTS (SELECT 1 FROM tsv_candidates t WHERE t.cid = n.id)
    LIMIT 20
  ),
  all_candidates AS (
    SELECT cid FROM tsv_candidates
    UNION ALL
    SELECT cid FROM exact_candidates
  )
  SELECT
    n.id, n.case_number, n.title, n.department, n.decision_date,
    n.case_type, n.decision_result, n.reason_category,
    n.key_issue, n.holding_summary, n.holding_points, n.summary_short, n.url, n.original_url,
    (
      ts_rank(COALESCE(n.search_tsv, ''::tsvector), tsquery_val) * 0.7 +
      GREATEST(
        similarity(n.title, query),
        similarity(COALESCE(n.holding_summary, ''), query)
      ) * 0.3
    )::REAL AS relevance
  FROM nlrc_decisions n
  INNER JOIN all_candidates c ON c.cid = n.id
  ORDER BY relevance DESC, n.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$function$;
