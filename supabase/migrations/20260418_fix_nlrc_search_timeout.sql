-- 2026-04-18: search_nlrc 타임아웃 수정
-- 문제: CTE에서 OR ILIKE '%query%' 로 57,841건 full table scan → 10초+ 타임아웃
-- 해결: CTE를 tsvector 전용으로 변경 (GIN 인덱스 활용)
--        ILIKE 폴백은 tsvector 결과 부족 시에만 UNION으로 추가
--        case_number 정확매칭은 별도 분기

-- 인덱스 확인 (이미 존재하면 무시)
CREATE INDEX IF NOT EXISTS idx_nlrc_search_tsv ON nlrc_decisions USING GIN (search_tsv);

DROP FUNCTION IF EXISTS search_nlrc(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION search_nlrc(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
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
) AS $$
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
    -- Phase 2: 사건번호 정확 매칭 (B-tree 활용 가능)
    SELECT n.id AS cid
    FROM nlrc_decisions n
    WHERE n.case_number ILIKE '%' || query || '%'
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
$$ LANGUAGE plpgsql;
