-- 2026-04-27: 검색 쿼리 한국어 노동법 용어 정규화
-- 문제: "직장내괴롭힘" (붙여쓰기) → DB에 "직장 내 괴롭힘" (띄어쓰기)로 저장되어 zero-result
-- 해결: 자주 검색되는 노동법 복합어의 띄어쓰기 정규화 함수 추가

-- 1. 노동법 검색어 정규화 함수
CREATE OR REPLACE FUNCTION normalize_labor_query(raw_query TEXT)
RETURNS TEXT AS $$
DECLARE
  q TEXT := raw_query;
BEGIN
  -- 붙여쓰기 → 띄어쓰기 변환 (노동법 고빈도 복합어)
  q := replace(q, '직장내괴롭힘', '직장 내 괴롭힘');
  q := replace(q, '직장내성희롱', '직장 내 성희롱');
  q := replace(q, '부당해고', '부당 해고');
  q := replace(q, '부당전보', '부당 전보');
  q := replace(q, '부당징계', '부당 징계');
  q := replace(q, '부당노동행위', '부당 노동 행위');
  q := replace(q, '경영상해고', '경영상 해고');
  q := replace(q, '갱신기대권', '갱신 기대권');
  q := replace(q, '임금체불', '임금 체불');
  q := replace(q, '산업재해', '산업 재해');
  q := replace(q, '업무상재해', '업무상 재해');
  q := replace(q, '통상임금', '통상 임금');
  q := replace(q, '퇴직금', '퇴직 금');
  q := replace(q, '근로계약', '근로 계약');
  RETURN q;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. search_admin 업데이트 — 정규화된 쿼리 + 원본 쿼리 모두 검색
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
      ts_rank(
        to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.holding_points, '')),
        tsquery_norm
      ) * 0.7 +
      GREATEST(
        similarity(a.title, normalized),
        similarity(COALESCE(a.summary, ''), normalized),
        similarity(COALESCE(a.holding_points, ''), normalized)
      ) * 0.3
    )::REAL AS relevance
  FROM admin_interpretations a
  WHERE
    -- 원본 쿼리 매칭
    to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.holding_points, '')) @@ tsquery_val
    OR a.title ILIKE '%' || query || '%'
    OR a.summary ILIKE '%' || query || '%'
    OR a.holding_points ILIKE '%' || query || '%'
    OR query = ANY(a.keywords_matched)
    -- 정규화된 쿼리 매칭 (붙여쓰기↔띄어쓰기)
    OR to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.holding_points, '')) @@ tsquery_norm
    OR a.title ILIKE '%' || normalized || '%'
    OR a.summary ILIKE '%' || normalized || '%'
    OR a.holding_points ILIKE '%' || normalized || '%'
  ORDER BY relevance DESC, a.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;
