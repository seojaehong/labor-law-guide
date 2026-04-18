-- unified_category 컬럼 추가 + search_faq RPC 업그레이드
-- A-B-C 트랙 결과: 11,539건 FAQ에 33개 통합 카테고리 적용

-- 1. 컬럼 추가 (이미 DDL로 적용됨 — migration 정규화)
ALTER TABLE faq ADD COLUMN IF NOT EXISTS unified_category TEXT;
CREATE INDEX IF NOT EXISTS idx_faq_unified_category ON faq(unified_category);

-- 2. search_faq RPC 업그레이드: unified_category_filter 지원
CREATE OR REPLACE FUNCTION search_faq(
  query TEXT,
  result_limit INT DEFAULT 5,
  category_filter TEXT DEFAULT NULL,
  unified_category_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id INT,
  source TEXT,
  category TEXT,
  unified_category TEXT,
  question TEXT,
  answer TEXT,
  keywords TEXT[],
  type TEXT,
  relevance REAL
) AS $$
DECLARE
  ts_query tsquery;
  sanitized TEXT;
BEGIN
  sanitized := regexp_replace(trim(query), '[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]', '', 'g');
  sanitized := regexp_replace(sanitized, '\s+', ' & ', 'g');

  BEGIN
    ts_query := to_tsquery('simple', sanitized);
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('simple', query);
  END;

  RETURN QUERY
  SELECT
    f.id, f.source, f.category, f.unified_category, f.question, f.answer, f.keywords, f.type,
    ts_rank(f.search_vector, ts_query) AS relevance
  FROM faq f
  WHERE f.search_vector @@ ts_query
    AND (category_filter IS NULL OR f.category = category_filter)
    AND (unified_category_filter IS NULL OR f.unified_category = unified_category_filter)
  ORDER BY relevance DESC
  LIMIT result_limit;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      f.id, f.source, f.category, f.unified_category, f.question, f.answer, f.keywords, f.type,
      0.1::REAL AS relevance
    FROM faq f
    WHERE (f.question ILIKE '%' || query || '%' OR f.answer ILIKE '%' || query || '%')
      AND (category_filter IS NULL OR f.category = category_filter)
      AND (unified_category_filter IS NULL OR f.unified_category = unified_category_filter)
    ORDER BY f.id DESC
    LIMIT result_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. 카테고리별 FAQ 목록 조회 RPC (페이지네이션 지원)
CREATE OR REPLACE FUNCTION get_faq_by_category(
  cat TEXT DEFAULT NULL,
  page_size INT DEFAULT 20,
  page_offset INT DEFAULT 0,
  search_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  id INT,
  unified_category TEXT,
  question TEXT,
  answer TEXT,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id, f.unified_category, f.question, f.answer,
    COUNT(*) OVER() AS total_count
  FROM faq f
  WHERE (cat IS NULL OR f.unified_category = cat)
    AND (search_query IS NULL OR f.question ILIKE '%' || search_query || '%' OR f.answer ILIKE '%' || search_query || '%')
  ORDER BY f.id
  LIMIT page_size
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- 4. 카테고리별 건수 조회 RPC
CREATE OR REPLACE FUNCTION get_faq_category_counts()
RETURNS TABLE (
  unified_category TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT f.unified_category, COUNT(*) AS count
  FROM faq f
  WHERE f.unified_category IS NOT NULL
  GROUP BY f.unified_category
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. chat_logs 테이블 정규화 (기존에 없던 migration)
CREATE TABLE IF NOT EXISTS chat_logs (
  id SERIAL PRIMARY KEY,
  question TEXT,
  faq_matched BOOLEAN DEFAULT FALSE,
  faq_count INT DEFAULT 0,
  faq_categories TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at DESC);
