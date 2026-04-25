-- Phase 2.1: cases 테이블 시맨틱 검색용 pgvector 컬럼
-- nlrc_decisions에는 이미 embedding 있음, cases에는 신규 추가

ALTER TABLE cases ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS cases_embedding_ivfflat_idx
  ON cases USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- search_cases_semantic: cases 테이블 단독 시맨틱
CREATE OR REPLACE FUNCTION search_cases_semantic(
  query_embedding vector(1536),
  max_results int DEFAULT 5,
  min_similarity float DEFAULT 0.4
)
RETURNS TABLE (
  id text,
  case_number text,
  court text,
  title text,
  decision_date date,
  case_type text,
  verdict_type text,
  summary text,
  url text,
  similarity float
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.case_number,
    c.court,
    c.title,
    c.decision_date,
    c.case_type,
    c.verdict_type,
    c.summary,
    c.url,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM cases c
  WHERE c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION search_cases_semantic(vector, int, float) TO anon, authenticated, service_role;

COMMENT ON FUNCTION search_cases_semantic IS 'cases(법원 판례) 단독 시맨틱 검색 — pgvector cosine';
