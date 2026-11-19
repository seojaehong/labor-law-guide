-- 검색 S1 — 판례·노동위 사건번호 직행 + 동점 정렬 고정.
-- 정답 세트 기준선(261119): 판례 「2012다 89399」 0% · 「대법원 2012다89399」 72% · 노동위 「중앙 2023부해 1104」 0%.
-- 번호가 정확히 같은 문서는 맨 위(가점 10), 법원·위원회까지 맞으면 +1.
-- 반환 칼럼·시그니처는 그대로 둔다(/decisions runSearch, /api/cases 가 부른다).

-- 1) 질의에서 사건번호 하나를 뽑는다. 공백·대시는 무시한다. 없으면 NULL.
--    판례: 2012다89399 · 2012다 89399 · 대법원 2012다89399 → '2012다89399'
create or replace function public.query_case_number(query text) returns text
language sql immutable parallel safe as $$
  select m[1] || m[2] || m[3]
  from regexp_match(regexp_replace(coalesce(query, ''), '[－—–‒―−‐‑-]', '', 'g'),
                    '(\d{2,4})\s*([가-힣]{1,4})\s*(\d{1,7})') m
$$;

--    노동위: 중앙2023부해1104 · 중앙 2023부해 1104 → 위원회 '중앙' + 번호 '2023부해1104'
create or replace function public.query_nlrc_number(query text, out committee text, out num text)
language sql immutable parallel safe as $$
  select m[1], m[2] || m[3] || m[4]
  from regexp_match(regexp_replace(coalesce(query, ''), '[－—–‒―−‐‑-]', '', 'g'),
                    '([가-힣]{2})?\s*(\d{4})\s*([가-힣]{1,4})\s*(\d{1,6})') m
$$;

-- 2) 색인 — 따로 한 문장씩 CONCURRENTLY(아래 주석). 만든 뒤 indisvalid 확인.
-- create index concurrently if not exists cases_case_number_idx on public.cases (case_number);
-- create index concurrently if not exists cases_keywords_gin_idx on public.cases using gin (keywords_matched);
-- create index concurrently if not exists nlrc_case_number_real_idx on public.nlrc_decisions (case_number_real);
-- create index concurrently if not exists nlrc_case_number_qualified_idx on public.nlrc_decisions (case_number_qualified);

-- 3) 판례
CREATE OR REPLACE FUNCTION public.search_cases(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, case_number text, court text, title text, decision_date date, case_type text, verdict_type text, keywords_matched text[], summary text, holding_points text, law_references text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  tsquery_val tsquery := plainto_tsquery('simple', query);
  cnum TEXT := query_case_number(query);
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.case_number, c.court, c.title, c.decision_date,
    c.case_type, c.verdict_type, c.keywords_matched, c.summary, c.holding_points,
    c.law_references, c.url, c.original_url,
    (
      CASE WHEN c.case_number = cnum THEN 10 + CASE WHEN position(c.court in query) > 0 THEN 1 ELSE 0 END ELSE 0 END
      + ts_rank(COALESCE(c.search_tsv, ''::tsvector), tsquery_val) * 0.7
      + GREATEST(
          similarity(c.title, query),
          similarity(COALESCE(c.summary, ''), query),
          similarity(COALESCE(c.holding_points, ''), query)
        ) * 0.3
    )::REAL AS relevance
  FROM cases c
  WHERE
    c.case_number = cnum
    OR c.search_tsv @@ tsquery_val
    OR c.title ILIKE '%' || query || '%'
    OR c.summary ILIKE '%' || query || '%'
    OR c.holding_points ILIKE '%' || query || '%'
    OR c.case_number ILIKE '%' || query || '%'
    OR c.keywords_matched @> ARRAY[query]
  ORDER BY relevance DESC, c.decision_date DESC NULLS LAST, c.id
  LIMIT result_limit
  OFFSET page_offset;
END;
$function$;

-- 4) 노동위 — 기존 후보(tsv 200 · 번호 부분일치 20)에 번호 정확일치 후보를 더한다.
--    tsv 200건 자르기는 S3 에서 다룬다(여기서는 바꾸지 않는다).
CREATE OR REPLACE FUNCTION public.search_nlrc(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, case_number text, title text, department text, decision_date date, case_type text, decision_result text, reason_category text[], key_issue text, holding_summary text, holding_points text, summary_short text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
 SET enable_seqscan TO 'off'
AS $function$
DECLARE
  -- case_number 는 72%가 '2018부해OOO' 처럼 마스킹 — 정본은 case_number_real/_qualified(260902 복구).
  tsquery_val tsquery := plainto_tsquery('simple', query);
  nn RECORD := query_nlrc_number(query);
BEGIN
  RETURN QUERY
  WITH num_candidates AS (
    SELECT n.id AS cid FROM nlrc_decisions n
    WHERE n.case_number_real = nn.num
       OR (nn.committee IS NOT NULL AND n.case_number_qualified = nn.committee || nn.num)
  ),
  tsv_candidates AS (
    SELECT n.id AS cid FROM nlrc_decisions n
    WHERE n.search_tsv @@ tsquery_val
    LIMIT 200
  ),
  exact_candidates AS (
    SELECT n.id AS cid FROM nlrc_decisions n
    WHERE query ~ '[0-9]'
      AND length(query) >= 3
      AND coalesce(n.case_number_qualified, n.case_number_real, n.case_number) ILIKE '%' || query || '%'
    LIMIT 20
  ),
  all_candidates AS (
    SELECT DISTINCT cid FROM (
      SELECT cid FROM num_candidates UNION ALL SELECT cid FROM tsv_candidates UNION ALL SELECT cid FROM exact_candidates
    ) u
  )
  SELECT
    n.id,
    coalesce(n.case_number_qualified, n.case_number_real, n.case_number) AS case_number,
    n.title, n.department, n.decision_date,
    n.case_type, n.decision_result, n.reason_category,
    n.key_issue, n.holding_summary, n.holding_points, n.summary_short, n.url, n.original_url,
    (
      CASE WHEN nn.committee IS NOT NULL AND n.case_number_qualified = nn.committee || nn.num THEN 11
           WHEN n.case_number_real = nn.num THEN 10
           ELSE 0 END
      + ts_rank(COALESCE(n.search_tsv, ''::tsvector), tsquery_val) * 0.7
      + GREATEST(similarity(n.title, query), similarity(COALESCE(n.holding_summary, ''), query)) * 0.3
    )::REAL AS relevance
  FROM nlrc_decisions n
  INNER JOIN all_candidates c ON c.cid = n.id
  ORDER BY relevance DESC, n.decision_date DESC NULLS LAST, n.id
  LIMIT result_limit OFFSET page_offset;
END;
$function$;

-- 5) 행정해석 — 동점 정렬에 a.id 를 붙인다(번호 가점이 같은 행이 많아 쪽 넘김에서 중복·누락 가능). 본문은 20261119b 와 같다.
CREATE OR REPLACE FUNCTION public.search_admin_core(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, title text, doc_number text, decision_date date, keywords_matched text[], summary text, holding_points text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  normalized TEXT := normalize_labor_query(query);
  qkey TEXT := admin_interp_numkey(query);
  use_num BOOLEAN := query ~ '[0-9]' AND length(admin_interp_numkey(query)) >= 3;
  pats TEXT[] := admin_search_patterns(query);
  longest TEXT;
BEGIN
  SELECT p INTO longest FROM unnest(pats) p ORDER BY length(p) DESC LIMIT 1;
  RETURN QUERY EXECUTE format($q$
    SELECT a.id, a.title, a.doc_number, a.decision_date,
      a.keywords_matched, a.summary, a.holding_points, a.url, a.original_url,
      (
        %s
        + CASE WHEN $7 IS NOT NULL AND a.title ILIKE ALL ($7) THEN 0.5 ELSE 0 END
        + ts_rank(a.search_tsv, $2) * 0.7
        + similarity(a.title, $4) * 0.3
      )::REAL AS relevance
    FROM admin_interpretations a
    WHERE %s
    ORDER BY relevance DESC, a.decision_date DESC NULLS LAST, a.id
    LIMIT $8 OFFSET $9
  $q$,
    -- 번호 가점: 키 완전일치 10 · 끝부분 일치(「68207-390」→ 근기68207-390) 8 · 포함 5
    CASE WHEN use_num THEN
      'CASE WHEN admin_interp_numkey(a.doc_number) = $5 THEN 10'
      || ' WHEN admin_interp_numkey(a.doc_number) LIKE ''%'' || $5 THEN 8'
      || ' WHEN admin_interp_numkey(a.doc_number) LIKE ''%'' || $5 || ''%'' THEN 5 ELSE 0 END'
    ELSE '0' END,
    admin_search_where(use_num, longest IS NOT NULL))
  USING plainto_tsquery('simple', query), plainto_tsquery('simple', normalized), query, normalized,
        qkey, longest, pats, result_limit, page_offset;
END;
$function$;
