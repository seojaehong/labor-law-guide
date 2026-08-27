-- 2026-08-27: search_admin 완화 재검색 (Query Relaxation) — DB 계층
-- 문제: search_admin('부당전보') 0건. normalize_labor_query가 만든 '부당' & '전보' AND
--       토큰도, title ILIKE '%부당전보%'/'%부당 전보%'도 매칭되지 않음.
--       admin_interpretations에는 '전보처분/전보명령' 형태로만 저장돼 있기 때문.
-- 기존 대응: 8/26 앱 계층(src/lib/search/relax-query.ts + /api/cases)에만 폴백 추가.
--       RPC를 직접 부르는 경로(/api/search, 챗봇, 자동점검 하네스)는 그대로 0건이라
--       zero-result 알림이 계속 재발함. 같은 규칙을 DB 계층으로 내림.
-- 해결: 1차 검색이 0건일 때만 수식어를 뗀 핵심어로 한 번 더 검색.
--       0건 경로에서만 도므로 정상 질의의 정밀도/응답시간에는 영향 없음.

-- 1. 수식어 제거 함수 (src/lib/search/relax-query.ts와 동일 규칙)
CREATE OR REPLACE FUNCTION relax_labor_query(raw_query TEXT)
RETURNS TEXT AS $$
DECLARE
  q TEXT := btrim(regexp_replace(COALESCE(raw_query, ''), '\s+', ' ', 'g'));
  prefix TEXT;
  core TEXT;
BEGIN
  IF q = '' THEN
    RETURN NULL;
  END IF;

  -- 긴 수식어부터 매칭 ('부당한' 이 '부당' 보다 먼저)
  FOREACH prefix IN ARRAY ARRAY['직장내', '부당한', '경영상', '업무상', '부당', '불법', '위법'] LOOP
    IF q LIKE prefix || '%' THEN
      -- 붙여쓰기('부당전보')와 띄어쓰기('부당 전보') 모두 처리
      core := btrim(substr(q, length(prefix) + 1));
      -- 핵심어가 2자 미만이면 검색 의미가 없음 (API 최소 길이와 동일 기준)
      IF length(core) >= 2 AND core <> q THEN
        RETURN core;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. 기존 search_admin 본문을 core 함수로 분리 (동작 동일, 20260428 정의 그대로)
CREATE OR REPLACE FUNCTION search_admin_core(query TEXT, result_limit INT DEFAULT 20, page_offset INT DEFAULT 0)
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

-- 3. search_admin — 0건일 때만 완화 재검색
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
  relaxed TEXT;
BEGIN
  RETURN QUERY SELECT * FROM search_admin_core(query, result_limit, page_offset);
  IF FOUND THEN
    RETURN;
  END IF;

  -- 뒷페이지가 비는 것은 '결과 끝'이지 zero-result가 아니다.
  -- 1페이지에 결과가 있었다면 완화하지 않는다 (페이지 간 결과 집합 혼합 방지).
  IF page_offset > 0 THEN
    PERFORM 1 FROM search_admin_core(query, 1, 0);
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  relaxed := relax_labor_query(query);
  IF relaxed IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM search_admin_core(relaxed, result_limit, page_offset);
END;
$$ LANGUAGE plpgsql;
