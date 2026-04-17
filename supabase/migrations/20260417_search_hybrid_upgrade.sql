-- 2026-04-17: 검색 전면 개선
-- 1. search_nlrc 수정 (serial_number/keywords_matched/summary 컬럼 미존재 버그 수정)
-- 2. search_cases를 tsvector 하이브리드로 업그레이드
-- 3. search_admin을 tsvector 하이브리드로 업그레이드 + url 반환
-- 4. cases/admin GIN 인덱스 + 자동 업데이트 트리거

-- ============================================================
-- 0. 기존 RPC 삭제 (반환 타입 변경 시 필수)
-- ============================================================
DROP FUNCTION IF EXISTS search_cases(TEXT, INT, INT);
DROP FUNCTION IF EXISTS search_admin(TEXT, INT, INT);
DROP FUNCTION IF EXISTS search_nlrc(TEXT, INT, INT);

-- ============================================================
-- 1. GIN 인덱스 (이미 search_tsv가 백필되어 있음)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cases_search_tsv ON cases USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_admin_search_tsv ON admin_interpretations USING GIN (search_tsv);

-- ============================================================
-- 2. search_cases — tsvector 하이브리드
-- ============================================================
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
    c.law_references, c.url,
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

-- ============================================================
-- 3. search_admin — tsvector 하이브리드 + url 반환
-- ============================================================
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
  relevance REAL
) AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  tsquery_val := plainto_tsquery('simple', query);

  RETURN QUERY
  SELECT
    a.id, a.title, a.doc_number, a.decision_date,
    a.keywords_matched, a.summary, a.holding_points, a.url,
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

-- ============================================================
-- 4. search_nlrc — 실제 컬럼에 맞게 수정
--    (serial_number, keywords_matched, summary 컬럼 미존재 버그 수정)
-- ============================================================
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
    n.key_issue, n.holding_summary, n.holding_points, n.summary_short, n.url,
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

-- ============================================================
-- 5. cases search_tsv 자동 업데이트 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_cases_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.summary, '') || ' ' ||
    COALESCE(NEW.holding_points, '') || ' ' ||
    COALESCE(NEW.case_number, '') || ' ' ||
    COALESCE(NEW.case_type, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_search_tsv ON cases;
CREATE TRIGGER trg_cases_search_tsv
  BEFORE INSERT OR UPDATE OF title, summary, holding_points
  ON cases
  FOR EACH ROW
  EXECUTE FUNCTION update_cases_search_tsv();

-- ============================================================
-- 6. admin_interpretations search_tsv 자동 업데이트 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_admin_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.summary, '') || ' ' ||
    COALESCE(NEW.holding_points, '') || ' ' ||
    COALESCE(NEW.doc_number, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_search_tsv ON admin_interpretations;
CREATE TRIGGER trg_admin_search_tsv
  BEFORE INSERT OR UPDATE OF title, summary, holding_points
  ON admin_interpretations
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_search_tsv();
