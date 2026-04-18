-- 2026-04-18: 검색 RPC에 original_url 반환 추가
-- url이 내부 URL로 전환됨에 따라 원문 외부 링크용 original_url 필요

DROP FUNCTION IF EXISTS search_cases(TEXT, INT, INT);
DROP FUNCTION IF EXISTS search_admin(TEXT, INT, INT);
DROP FUNCTION IF EXISTS search_nlrc(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION search_cases(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
RETURNS TABLE (
  id TEXT,
  case_number TEXT,
  court TEXT,
  title TEXT,
  decision_date DATE,
  case_type TEXT,
  verdict_type TEXT,
  keywords_matched TEXT[],
  summary TEXT,
  holding_points TEXT,
  law_references TEXT,
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
    c.id, c.case_number, c.court, c.title, c.decision_date,
    c.case_type, c.verdict_type, c.keywords_matched, c.summary, c.holding_points,
    c.law_references, c.url, c.original_url,
    (
      ts_rank(COALESCE(c.search_tsv, ''::tsvector), tsquery_val) * 0.7 +
      GREATEST(
        similarity(c.title, query),
        similarity(COALESCE(c.summary, ''), query),
        similarity(COALESCE(c.holding_points, ''), query)
      ) * 0.3
    )::REAL AS relevance
  FROM cases c
  WHERE
    c.search_tsv @@ tsquery_val
    OR c.title ILIKE '%' || query || '%'
    OR c.summary ILIKE '%' || query || '%'
    OR c.holding_points ILIKE '%' || query || '%'
    OR c.case_number ILIKE '%' || query || '%'
    OR query = ANY(c.keywords_matched)
  ORDER BY relevance DESC, c.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

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
      ts_rank(COALESCE(a.search_tsv, ''::tsvector), tsquery_val) * 0.7 +
      GREATEST(
        similarity(a.title, query),
        similarity(COALESCE(a.summary, ''), query),
        similarity(COALESCE(a.holding_points, ''), query)
      ) * 0.3
    )::REAL AS relevance
  FROM admin_interpretations a
  WHERE
    a.search_tsv @@ tsquery_val
    OR a.title ILIKE '%' || query || '%'
    OR a.summary ILIKE '%' || query || '%'
    OR a.holding_points ILIKE '%' || query || '%'
    OR query = ANY(a.keywords_matched)
  ORDER BY relevance DESC, a.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

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
  WITH candidates AS (
    SELECT n.id AS cid
    FROM nlrc_decisions n
    WHERE n.search_tsv @@ tsquery_val
       OR n.title ILIKE '%' || query || '%'
       OR n.case_number ILIKE '%' || query || '%'
    LIMIT 200
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
  INNER JOIN candidates c ON c.cid = n.id
  ORDER BY relevance DESC, n.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;
