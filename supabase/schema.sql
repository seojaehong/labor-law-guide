-- 노란봉투법 사이트 Supabase 스키마
-- 실행: Supabase Dashboard > SQL Editor에서 실행

-- 1. 판례 테이블
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  case_number TEXT NOT NULL,
  court TEXT,
  title TEXT NOT NULL,
  decision_date DATE,
  case_type TEXT,
  verdict_type TEXT,
  keywords_matched TEXT[],
  summary TEXT,
  holding_points TEXT,
  law_references TEXT,
  url TEXT,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 행정해석 테이블
CREATE TABLE IF NOT EXISTS admin_interpretations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  doc_number TEXT,
  decision_date DATE,
  keywords_matched TEXT[],
  summary TEXT,
  holding_points TEXT,
  url TEXT,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 뉴스 테이블
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT,
  published_at TIMESTAMPTZ,
  url TEXT,
  summary TEXT,
  keywords_matched TEXT[],
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 노동위결정문 테이블
CREATE TABLE IF NOT EXISTS nlrc_decisions (
  id TEXT PRIMARY KEY,
  serial_number TEXT,
  case_number TEXT NOT NULL,
  title TEXT NOT NULL,
  department TEXT,
  decision_date DATE,
  case_type TEXT,
  decision_result TEXT,
  keywords_matched TEXT[],
  holding_points TEXT,
  summary TEXT,
  url TEXT,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 한국어 검색을 위한 인덱스 (GIN trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_cases_title_trgm ON cases USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cases_summary_trgm ON cases USING GIN (summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cases_holding_trgm ON cases USING GIN (holding_points gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cases_date ON cases (decision_date DESC);

CREATE INDEX IF NOT EXISTS idx_admin_title_trgm ON admin_interpretations USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_admin_summary_trgm ON admin_interpretations USING GIN (summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_news_title_trgm ON news USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_news_published ON news (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_nlrc_title_trgm ON nlrc_decisions USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nlrc_summary_trgm ON nlrc_decisions USING GIN (summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nlrc_holding_trgm ON nlrc_decisions USING GIN (holding_points gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nlrc_date ON nlrc_decisions (decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_nlrc_case_type ON nlrc_decisions (case_type);

-- 5. RPC 함수: 판례 검색 (trigram similarity)
CREATE OR REPLACE FUNCTION search_cases(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
RETURNS TABLE (
  id TEXT,
  case_number TEXT,
  court TEXT,
  title TEXT,
  decision_date DATE,
  case_type TEXT,
  keywords_matched TEXT[],
  summary TEXT,
  holding_points TEXT,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.case_number, c.court, c.title, c.decision_date,
    c.case_type, c.keywords_matched, c.summary, c.holding_points,
    GREATEST(
      similarity(c.title, query),
      similarity(COALESCE(c.summary, ''), query),
      similarity(COALESCE(c.holding_points, ''), query)
    ) AS relevance
  FROM cases c
  WHERE
    c.title ILIKE '%' || query || '%'
    OR c.summary ILIKE '%' || query || '%'
    OR c.holding_points ILIKE '%' || query || '%'
    OR c.case_number ILIKE '%' || query || '%'
    OR query = ANY(c.keywords_matched)
  ORDER BY relevance DESC, c.decision_date DESC
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- 6. RPC 함수: 행정해석 검색
CREATE OR REPLACE FUNCTION search_admin(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  doc_number TEXT,
  decision_date DATE,
  keywords_matched TEXT[],
  summary TEXT,
  holding_points TEXT,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.title, a.doc_number, a.decision_date,
    a.keywords_matched, a.summary, a.holding_points,
    GREATEST(
      similarity(a.title, query),
      similarity(COALESCE(a.summary, ''), query),
      similarity(COALESCE(a.holding_points, ''), query)
    ) AS relevance
  FROM admin_interpretations a
  WHERE
    a.title ILIKE '%' || query || '%'
    OR a.summary ILIKE '%' || query || '%'
    OR a.holding_points ILIKE '%' || query || '%'
    OR query = ANY(a.keywords_matched)
  ORDER BY relevance DESC, a.decision_date DESC
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- 8. RPC 함수: 노동위결정문 검색
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
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.serial_number, n.case_number, n.title, n.department, n.decision_date,
    n.case_type, n.decision_result, n.keywords_matched, n.holding_points, n.summary, n.url,
    GREATEST(
      similarity(n.title, query),
      similarity(COALESCE(n.summary, ''), query),
      similarity(COALESCE(n.holding_points, ''), query)
    ) AS relevance
  FROM nlrc_decisions n
  WHERE
    n.title ILIKE '%' || query || '%'
    OR n.summary ILIKE '%' || query || '%'
    OR n.holding_points ILIKE '%' || query || '%'
    OR n.case_number ILIKE '%' || query || '%'
    OR n.case_type ILIKE '%' || query || '%'
    OR query = ANY(n.keywords_matched)
  ORDER BY relevance DESC, n.decision_date DESC
  LIMIT result_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- 9. RLS (Row Level Security) - 읽기만 허용
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

ALTER TABLE nlrc_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cases" ON cases FOR SELECT USING (true);
CREATE POLICY "Public read admin" ON admin_interpretations FOR SELECT USING (true);
CREATE POLICY "Public read news" ON news FOR SELECT USING (true);
CREATE POLICY "Public read nlrc" ON nlrc_decisions FOR SELECT USING (true);
