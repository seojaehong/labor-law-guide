-- Phase 2.2: 행정해석 DB
-- 옵시디언 볼트의 노동부 회신·행정해석을 Supabase로 import + 임베딩
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS admin_interpretations (
  id text PRIMARY KEY,                  -- 회신번호 (예: 근기68207-1598)
  title text NOT NULL,
  doc_number text,                      -- 회신번호 별칭 (page expects 이 컬럼)
  decision_date date,                   -- 회신일
  keywords_matched text[],              -- 키워드 (검색 보조)
  summary text,                         -- 요약 (질의 부분)
  holding_points text,                  -- 본문 전체 (회시) — 임베딩 대상
  url text,                             -- 외부 링크 (있을 때)
  original_url text,                    -- 원본 링크
  agency text,                          -- 발행부처
  topic_category text,                  -- 주제 분류
  source_path text,                     -- 옵시디언 원본 파일 경로
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_interp_embedding_ivfflat_idx
  ON admin_interpretations USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 30);

CREATE INDEX IF NOT EXISTS admin_interp_topic_idx ON admin_interpretations (topic_category);
CREATE INDEX IF NOT EXISTS admin_interp_date_idx ON admin_interpretations (decision_date DESC);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION admin_interp_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_interp_updated_at_trg ON admin_interpretations;
CREATE TRIGGER admin_interp_updated_at_trg
  BEFORE UPDATE ON admin_interpretations
  FOR EACH ROW EXECUTE FUNCTION admin_interp_set_updated_at();

-- search_interpretation_semantic: 임베딩 기반 행정해석 검색
CREATE OR REPLACE FUNCTION search_interpretation_semantic(
  query_embedding vector(1536),
  max_results int DEFAULT 3,
  min_similarity float DEFAULT 0.3
)
RETURNS TABLE (
  id text,
  doc_number text,
  title text,
  summary text,
  holding_points text,
  agency text,
  decision_date date,
  topic_category text,
  similarity float
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.doc_number,
    a.title,
    a.summary,
    a.holding_points,
    a.agency,
    a.decision_date,
    a.topic_category,
    (1 - (a.embedding <=> query_embedding))::float AS similarity
  FROM admin_interpretations a
  WHERE a.embedding IS NOT NULL
    AND (1 - (a.embedding <=> query_embedding)) >= min_similarity
  ORDER BY a.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION search_interpretation_semantic(vector, int, float) TO anon, authenticated, service_role;

COMMENT ON TABLE admin_interpretations IS 'Phase 2.2 행정해석 — 노동부 회신/유권해석 (옵시디언 볼트 import)';
COMMENT ON FUNCTION search_interpretation_semantic IS '행정해석 시맨틱 검색';
