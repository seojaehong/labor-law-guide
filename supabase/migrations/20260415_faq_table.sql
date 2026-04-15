-- FAQ 테이블 생성 + 검색 함수
-- Supabase Dashboard > SQL Editor에서 실행

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS faq (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  type TEXT,
  metadata JSONB DEFAULT '{}',
  search_vector tsvector,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_faq_category ON faq(category);
CREATE INDEX IF NOT EXISTS idx_faq_source ON faq(source);
CREATE INDEX IF NOT EXISTS idx_faq_keywords ON faq USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_faq_search ON faq USING GIN(search_vector);

-- 3. search_vector 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION faq_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.question, '') || ' ' || COALESCE(NEW.answer, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faq_search_vector ON faq;
CREATE TRIGGER trg_faq_search_vector
  BEFORE INSERT OR UPDATE ON faq
  FOR EACH ROW EXECUTE FUNCTION faq_search_vector_trigger();

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_faq_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faq_updated_at ON faq;
CREATE TRIGGER trg_faq_updated_at
  BEFORE UPDATE ON faq
  FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

-- 5. 검색 RPC 함수 (전문 검색 + ILIKE fallback)
CREATE OR REPLACE FUNCTION search_faq(
  query TEXT,
  result_limit INT DEFAULT 5,
  category_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id INT,
  source TEXT,
  category TEXT,
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
  -- 검색어 정제: 특수문자 제거 후 공백 기준 & 연결
  sanitized := regexp_replace(trim(query), '[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]', '', 'g');
  sanitized := regexp_replace(sanitized, '\s+', ' & ', 'g');

  BEGIN
    ts_query := to_tsquery('simple', sanitized);
  EXCEPTION WHEN OTHERS THEN
    ts_query := plainto_tsquery('simple', query);
  END;

  -- 1차: tsvector 매칭
  RETURN QUERY
  SELECT
    f.id, f.source, f.category, f.question, f.answer, f.keywords, f.type,
    ts_rank(f.search_vector, ts_query) AS relevance
  FROM faq f
  WHERE f.search_vector @@ ts_query
    AND (category_filter IS NULL OR f.category = category_filter)
  ORDER BY relevance DESC
  LIMIT result_limit;

  -- tsvector 결과가 없으면 ILIKE fallback
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      f.id, f.source, f.category, f.question, f.answer, f.keywords, f.type,
      0.1::REAL AS relevance
    FROM faq f
    WHERE (f.question ILIKE '%' || query || '%' OR f.answer ILIKE '%' || query || '%')
      AND (category_filter IS NULL OR f.category = category_filter)
    ORDER BY f.id DESC
    LIMIT result_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. RLS 비활성화 (service_role만 접근)
ALTER TABLE faq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON faq
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anon read access" ON faq
  FOR SELECT USING (true);
