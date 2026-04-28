-- 2026-04-28: search_admin 성능 개선
-- 문제: search_tsv 컬럼 없이 to_tsvector() 매 행 동적 생성 → 14,781행 full scan → 10초+ timeout
-- 해결: search_tsv 컬럼 추가 + GIN 인덱스 + 함수 재작성

-- 1. search_tsv 컬럼 추가
ALTER TABLE admin_interpretations
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- 2. 기존 데이터 채우기
UPDATE admin_interpretations
SET search_tsv = to_tsvector('simple',
  COALESCE(title, '') || ' ' ||
  COALESCE(summary, '') || ' ' ||
  COALESCE(holding_points, '')
);

-- 3. GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_admin_interpretations_search_tsv
  ON admin_interpretations USING GIN (search_tsv);

-- 4. trigram 인덱스 (ILIKE 가속)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_admin_interpretations_title_trgm
  ON admin_interpretations USING GIN (title gin_trgm_ops);

-- 5. 자동 갱신 트리거
CREATE OR REPLACE FUNCTION admin_interpretations_tsv_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.summary, '') || ' ' ||
    COALESCE(NEW.holding_points, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_search_tsv ON admin_interpretations;
CREATE TRIGGER trg_admin_search_tsv
  BEFORE INSERT OR UPDATE OF title, summary, holding_points
  ON admin_interpretations
  FOR EACH ROW
  EXECUTE FUNCTION admin_interpretations_tsv_trigger();

-- 6. search_admin 함수 재작성 — 인덱스 활용
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
  normalized TEXT;
  tsquery_norm tsquery;
BEGIN
  normalized := normalize_labor_query(query);
  tsquery_val := plainto_tsquery('simple', query);
  tsquery_norm := plainto_tsquery('simple', normalized);

  RETURN QUERY
  SELECT
    a.id, a.title, a.doc_number, a.decision_date,
    a.keywords_matched, a.summary, a.holding_points, a.url, a.original_url,
    (
      ts_rank(a.search_tsv, tsquery_norm) * 0.7 +
      similarity(a.title, normalized) * 0.3
    )::REAL AS relevance
  FROM admin_interpretations a
  WHERE
    a.search_tsv @@ tsquery_val
    OR a.search_tsv @@ tsquery_norm
    OR a.title ILIKE '%' || query || '%'
    OR a.title ILIKE '%' || normalized || '%'
    OR query = ANY(a.keywords_matched)
  ORDER BY relevance DESC, a.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;
