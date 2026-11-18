-- #218 조각 5·6·7 — admin_interpretations 정제용 칼럼과 검색 RPC.
-- 생성 칼럼(STORED)은 임베딩이 든 표 전체를 다시 쓰므로 쓰지 않는다(Micro 컴퓨트, 261101 장애 선례).
-- 일반 칼럼 + 트리거 + 배치 백필로 채운다. id·doc_number 원값은 바꾸지 않는다(주소·챗 인용 링크).

-- 1) 칼럼
alter table public.admin_interpretations
  add column if not exists doc_number_norm text,   -- 표시·중복 판정용: 전각·긴 대시 → '-', 공백 제거
  add column if not exists duplicate_of text,      -- 같은 문서가 띄어쓰기만 달리 두 번 들어간 행 → 대표 id
  add column if not exists agency_dept text;       -- 번호에 부서명이 그대로 적힌 행만(약어 접두는 풀지 않음)

create or replace function public.admin_interp_doc_norm(v text) returns text
language sql immutable as $$
  select regexp_replace(translate(coalesce(v, ''), '－—–', '---'), '\s+', '', 'g')
$$;

create or replace function public.admin_interp_set_norm() returns trigger
language plpgsql as $$
begin
  new.doc_number_norm := public.admin_interp_doc_norm(new.doc_number);
  return new;
end $$;

drop trigger if exists admin_interp_set_norm on public.admin_interpretations;
create trigger admin_interp_set_norm before insert or update of doc_number on public.admin_interpretations
  for each row execute function public.admin_interp_set_norm();

create index if not exists admin_interpretations_doc_number_norm_idx on public.admin_interpretations (doc_number_norm);

-- 2) 백필은 배치로 따로 돈다(아래 주석). 마이그레이션 본문에 넣지 않는다.
-- update admin_interpretations set doc_number_norm = admin_interp_doc_norm(doc_number)
--   where id in (select id from admin_interpretations where doc_number_norm is null limit 2000);

-- 3) 목록 검색: 중복 표시 행 제외
CREATE OR REPLACE FUNCTION public.search_admin_core(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, title text, doc_number text, decision_date date, keywords_matched text[], summary text, holding_points text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
AS $function$
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
  WHERE a.duplicate_of IS NULL
    AND (
      a.search_tsv @@ tsquery_val
      OR a.search_tsv @@ tsquery_norm
      OR a.title ILIKE '%' || query || '%'
      OR a.title ILIKE '%' || normalized || '%'
      OR query = ANY(a.keywords_matched)
    )
  ORDER BY relevance DESC, a.decision_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET page_offset;
END;
$function$;

-- 4) 챗·도구 의미 검색: 중복 표시 행 제외 + molab 과 겹침 판정을 정규화 번호로
CREATE OR REPLACE FUNCTION public.search_interpretation_semantic_v2(query_embedding vector, max_results integer DEFAULT 3, min_similarity double precision DEFAULT 0.3, min_date date DEFAULT NULL::date)
 RETURNS TABLE(id text, case_number text, title text, inquiry_summary text, answer_summary text, decision_date date, url text, source text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  -- 후보 단계의 LIMIT 은 반드시 상수여야 한다. max_results*4 처럼 변수식을 쓰면
  -- 플래너가 ivfflat 상위N 최적화를 포기하고 호출당 4GB 를 만진다 (2026-10-05 실측).
  WITH m0 AS (
    SELECT m.id, m.case_number, m.title, m.inquiry_summary, m.answer_summary,
           m.decision_date, m.url, 'molab'::text AS source,
           (1 - (m.embedding <=> query_embedding))::float AS similarity,
           public.admin_interp_doc_norm(m.case_number) AS key_num
    FROM molab_interpretations m
    WHERE m.embedding IS NOT NULL
      AND (1 - (m.embedding <=> query_embedding)) >= min_similarity
      AND (min_date IS NULL OR m.decision_date >= min_date)
    ORDER BY m.embedding <=> query_embedding
    LIMIT 48            -- max_results 12 까지 커버. 넘으면 아래 자르기에서 모자랄 수 있다
  ), a0 AS (
    SELECT a.id::text, a.doc_number AS case_number, a.title,
           NULL::text AS inquiry_summary,
           nullif(trim(concat_ws(E'\n', a.summary, a.holding_points)), '') AS answer_summary,
           a.decision_date, coalesce(a.original_url, a.url) AS url, 'admin'::text AS source,
           (1 - (a.embedding <=> query_embedding))::float AS similarity,
           coalesce(a.doc_number_norm, public.admin_interp_doc_norm(a.doc_number)) AS key_num
    FROM admin_interpretations a
    WHERE a.embedding IS NOT NULL
      AND (1 - (a.embedding <=> query_embedding)) >= min_similarity
      AND nullif(trim(coalesce(a.summary,'')), '') IS NOT NULL   -- 본문 없는 행 제외
      AND a.duplicate_of IS NULL                                  -- #218 중복 표시 행 제외
      AND (min_date IS NULL OR a.decision_date >= min_date)
    ORDER BY a.embedding <=> query_embedding
    LIMIT 48
  ), m AS (SELECT * FROM m0 ORDER BY similarity DESC LIMIT max_results * 4),
     a AS (SELECT * FROM a0 ORDER BY similarity DESC LIMIT max_results * 4),
  u AS (
    SELECT * FROM m
    UNION ALL
    SELECT a.* FROM a
    WHERE NOT EXISTS (
      SELECT 1 FROM molab_interpretations x
      WHERE public.admin_interp_doc_norm(x.case_number) = a.key_num
        AND x.decision_date IS NOT DISTINCT FROM a.decision_date)
  )
  SELECT id, case_number, title, inquiry_summary, answer_summary,
         decision_date, url, source, similarity
  FROM u ORDER BY similarity DESC LIMIT max_results;
$function$;
