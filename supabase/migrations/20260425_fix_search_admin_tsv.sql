-- 2026-04-25: search_admin RPC 수정
-- admin_interpretations 테이블에 search_tsv 컬럼이 없어 400 에러 발생
-- search_tsv 참조를 동적 tsvector 생성으로 대체

DROP FUNCTION IF EXISTS search_admin(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION search_admin(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  doc_number TEXT,
  decision_date DATE,
  keywords_matched TEXT[],
  summary TEXT,
  holding_points TEXT,
  url TEXT,
  original_url TEXT,
  relevance REAL
) AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  tsquery_val := plainto_tsquery('simple', query);

  RETURN QUERY
  SELECT
    a.id, a.title, a.doc_number, a.decision_date,
    a.keywords_matched, a.summary, a.holding_points, a.url, a.original_url,
    (
      ts_rank(
        to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.holding_points, '')),
        tsquery_val
      ) * 0.7 +
      GREATEST(
        similarity(a.title, query),
        similarity(COALESCE(a.summary, ''), query),
        similarity(COALESCE(a.holding_points, ''), query)
      ) * 0.3
    )::REAL AS relevance
  FROM admin_interpretations a
  WHERE
    to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.holding_points, '')) @@ tsquery_val
    OR a.title ILIKE '%' || query || '%'
    OR a.summary ILIKE '%' || query || '%'
    OR a.holding_points ILIKE '%' || query || '%'
    OR query = ANY(a.keywords_matched)
  ORDER BY relevance DESC, a.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;
