-- Phase 2.3: 법조항 실시간 검증용 캐시 테이블
-- 법제처 API 호출 결과를 영구 캐시. 답변 검증 시 조회.

CREATE TABLE IF NOT EXISTS law_articles (
  law_name text NOT NULL,
  article_number int NOT NULL,
  exists_flag boolean NOT NULL DEFAULT true,
  raw_title text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (law_name, article_number)
);

CREATE INDEX IF NOT EXISTS law_articles_name_idx ON law_articles (law_name);

-- chat_logs에 허위 인용 추적 컬럼
ALTER TABLE chat_logs
  ADD COLUMN IF NOT EXISTS legal_citations jsonb,
  ADD COLUMN IF NOT EXISTS hallucinated_citations jsonb;

COMMENT ON TABLE law_articles IS 'Phase 2.3 법조항 캐시 — 법제처 API 응답 보관';
COMMENT ON COLUMN chat_logs.legal_citations IS '답변에서 추출된 법조항 [{law, article}, ...]';
COMMENT ON COLUMN chat_logs.hallucinated_citations IS '존재하지 않는 조항으로 검증된 인용';
