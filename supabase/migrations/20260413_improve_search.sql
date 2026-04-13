-- 2026-04-13: 검색 성능 개선
-- search_tsv 백필 완료 후 적용
-- 1. search_tsv GIN 인덱스 생성
-- 2. search_nlrc 함수를 tsvector 기반으로 변경 (ILIKE fallback 유지)
-- 3. search_tsv 자동 업데이트 트리거

-- ============================================================
-- 1. GIN 인덱스 (search_tsv 백필 후에만 의미 있음)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_nlrc_search_tsv ON nlrc_decisions USING GIN (search_tsv);

-- ============================================================
-- 2. search_nlrc 함수 — tsvector 우선, ILIKE fallback
-- ============================================================
CREATE OR REPLACE FUNCTION search_nlrc(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
RETURNS TABLE (
  id TEXT,
  serial_number TEXT,
  case_number TEXT,
  title TEXT,
  department TEXT,
  decision_date DATE,
  case_type TEXT,
  decision_result TEXT,
  keywords_matched TEXT[],
  holding_points TEXT,
  summary TEXT,
  url TEXT,
  relevance REAL
) AS $$
DECLARE
  tsquery_val tsquery;
  has_tsv_results BOOLEAN;
BEGIN
  -- 한국어는 simple config으로 처리 (공백 기준 토큰화)
  tsquery_val := plainto_tsquery('simple', query);

  -- 먼저 tsvector 검색 시도 (훨씬 빠름)
  RETURN QUERY
  SELECT
    n.id, n.serial_number, n.case_number, n.title, n.department, n.decision_date,
    n.case_type, n.decision_result, n.keywords_matched, n.holding_points, n.summary, n.url,
    (
      ts_rank(COALESCE(n.search_tsv, ''::tsvector), tsquery_val) * 0.7 +
      GREATEST(
        similarity(n.title, query),
        similarity(COALESCE(n.holding_points, ''), query)
      ) * 0.3
    )::REAL AS relevance
  FROM nlrc_decisions n
  WHERE
    n.search_tsv @@ tsquery_val
    OR n.title ILIKE '%' || query || '%'
    OR n.case_number ILIKE '%' || query || '%'
    OR n.case_type ILIKE '%' || query || '%'
    OR query = ANY(n.keywords_matched)
  ORDER BY relevance DESC, n.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. search_tsv 자동 업데이트 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_nlrc_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.holding_summary, '') || ' ' ||
    COALESCE(NEW.holding_points, '') || ' ' ||
    COALESCE(NEW.key_issue, '') || ' ' ||
    COALESCE(NEW.case_number, '') || ' ' ||
    COALESCE(NEW.case_type, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nlrc_search_tsv ON nlrc_decisions;
CREATE TRIGGER trg_nlrc_search_tsv
  BEFORE INSERT OR UPDATE OF title, holding_summary, holding_points, key_issue
  ON nlrc_decisions
  FOR EACH ROW
  EXECUTE FUNCTION update_nlrc_search_tsv();
