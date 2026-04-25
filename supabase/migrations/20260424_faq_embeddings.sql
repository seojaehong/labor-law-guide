-- FAQ 시맨틱 검색을 위한 pgvector 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- faq.embedding 컬럼 (1536차원 OpenAI text-embedding-3-small)
ALTER TABLE faq ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- IVFFlat 인덱스 (cosine similarity) — 임베딩 생성 후 REINDEX 필요
-- 초기에는 비어있으니 리스트 수 적게 (lists=50 → 데이터 쌓이면 sqrt(rows))
CREATE INDEX IF NOT EXISTS faq_embedding_ivfflat_idx
  ON faq USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- search_faq_semantic: 임베딩 기반 시맨틱 검색
-- query_embedding을 받아 cosine similarity 상위 N건 반환
CREATE OR REPLACE FUNCTION search_faq_semantic(
  query_embedding vector(1536),
  max_results int DEFAULT 10,
  canonical_only boolean DEFAULT false,
  min_similarity float DEFAULT 0.4
)
RETURNS TABLE (
  id bigint,
  unified_category text,
  question text,
  answer text,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.unified_category,
    f.question,
    f.answer,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM faq f
  WHERE f.embedding IS NOT NULL
    AND (NOT canonical_only OR f.is_canonical = true)
    AND (1 - (f.embedding <=> query_embedding)) >= min_similarity
  ORDER BY f.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;

-- search_faq_combined: hybrid (tsvector+trigram+ILIKE) + semantic (embedding) 결합
-- 가중치: hybrid rank × 1.0 + semantic similarity × 5.0
CREATE OR REPLACE FUNCTION search_faq_combined(
  query_text text,
  query_embedding vector(1536) DEFAULT NULL,
  max_results int DEFAULT 10,
  canonical_only boolean DEFAULT false
)
RETURNS TABLE (
  id bigint,
  unified_category text,
  question text,
  answer text,
  final_rank float,
  hybrid_rank float,
  semantic_sim float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF query_embedding IS NULL THEN
    -- 임베딩 없으면 hybrid만
    RETURN QUERY
    SELECT
      h.id,
      COALESCE(h.unified_category, h.category) AS unified_category,
      h.question,
      h.answer,
      h.rank AS final_rank,
      h.rank AS hybrid_rank,
      0.0::float AS semantic_sim
    FROM search_faq_hybrid(query_text, max_results * 2) h
    ORDER BY h.rank DESC
    LIMIT max_results;
  ELSE
    -- 둘 다
    RETURN QUERY
    WITH hybrid AS (
      SELECT h.id, h.question, h.answer, h.rank,
             COALESCE(h.unified_category, h.category) AS cat
      FROM search_faq_hybrid(query_text, max_results * 3) h
    ),
    semantic AS (
      SELECT s.id, s.question, s.answer, s.unified_category AS cat, s.similarity
      FROM search_faq_semantic(query_embedding, max_results * 3, canonical_only, 0.3) s
    ),
    merged AS (
      SELECT
        COALESCE(h.id, s.id) AS id,
        COALESCE(h.cat, s.cat) AS cat,
        COALESCE(h.question, s.question) AS question,
        COALESCE(h.answer, s.answer) AS answer,
        COALESCE(h.rank, 0) AS hybrid_rank,
        COALESCE(s.similarity, 0) AS semantic_sim
      FROM hybrid h
      FULL OUTER JOIN semantic s ON h.id = s.id
    )
    SELECT
      m.id,
      m.cat AS unified_category,
      m.question,
      m.answer,
      (m.hybrid_rank * 1.0 + m.semantic_sim * 5.0)::float AS final_rank,
      m.hybrid_rank AS hybrid_rank,
      m.semantic_sim AS semantic_sim
    FROM merged m
    ORDER BY final_rank DESC
    LIMIT max_results;
  END IF;
END;
$$;

-- 권한
GRANT EXECUTE ON FUNCTION search_faq_semantic(vector, int, boolean, float) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_faq_combined(text, vector, int, boolean) TO anon, authenticated, service_role;

COMMENT ON FUNCTION search_faq_semantic IS 'pgvector 기반 시맨틱 검색 (cosine similarity)';
COMMENT ON FUNCTION search_faq_combined IS 'hybrid(tsvector+trigram+ILIKE) + semantic(embedding) 결합 검색';
