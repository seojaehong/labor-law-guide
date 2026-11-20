-- 검색 S1 — 판례·노동위 사건번호 직행 + 동점 정렬 고정 (+ 행정해석 검색 보완, PR #224 검토 반영).
-- 정답 세트 기준선(261119): 판례 「2012다 89399」 0% · 「대법원 2012다89399」 72% · 노동위 「중앙 2023부해 1104」 0%.
-- 번호가 정확히 같은 문서는 맨 위(가점 10), 법원·위원회까지 맞으면 +1.
-- 반환 칼럼·시그니처는 그대로 둔다(/decisions runSearch, /api/cases 가 부른다).
--
-- 261119 1차 반영 회귀(운영 약 1시간): search_nlrc 에서 exact_candidates 의 NOT EXISTS 를 빼자
--   enable_seqscan off 아래 플래너가 6.2만 행 전체를 랭킹·정렬하는 계획으로 뒤집혀 숫자 든 질의가 15~38초.
--   → NOT EXISTS 를 되살렸다. 반영 전에 begin…rollback 안에서 실행시간 상한(3초)을 재고 넘으면 반영하지 않는다.

-- 1) 문자열에서 사건번호를 모두 뽑는다(질의·저장값 공용). 대시류·공백은 무시.
--    · 「2015년 6월 3일 선고 2014나12345」 → {2014나12345} — 날짜·조문·단위(년 월 일 조 항 호 시간 개월 억 만 원 명 회 세)는 먼저 지운다
--    · 「2016다26662, 26679」 → {2016다26662, 2016다26679} — 쉼표 뒤 숫자만 있는 조각은 앞 번호의 연도·부호를 잇는다
--    · 「2013누8174, 2013누8181(병합)」 → {2013누8174, 2013누8181}
create or replace function public.case_numbers_in(v text) returns text[]
language plpgsql immutable parallel safe
set search_path = pg_catalog
as $$
declare
  s text := regexp_replace(coalesce(v, ''), '[－—–‒―−‐‑-]', '', 'g');
  part text;
  m text[];
  prefix text;
  found boolean;
  out text[] := '{}';
begin
  s := regexp_replace(s, '\d+\s*(년|월|일|조|항|호|시간|개월|억|만|원|명|회|세)(?![가-힣])', ' ', 'g');
  foreach part in array regexp_split_to_array(s, '[,，/]') loop
    found := false;
    for m in select regexp_matches(part, '(\d{2,4})\s*([가-힣]{1,4})\s*(\d{1,7})(?!\d)', 'g') loop
      out := out || (m[1] || m[2] || m[3]);
      prefix := m[1] || m[2];
      found := true;
    end loop;
    if not found and prefix is not null then
      m := regexp_match(part, '^\s*(\d{1,7})\s*(\([^)]*\))?\s*$');
      if m is not null then out := out || (prefix || m[1]); end if;
    end if;
  end loop;
  return out;
end
$$;

-- 2) 법원 표기 변형(약칭 ↔ 정식). 빈 값은 빈 배열 — 빈 court 가 모든 질의에 +1 받던 결함(검토 지적) 방지.
create or replace function public.court_variants(court text) returns text[]
language sql immutable parallel safe
set search_path = pg_catalog
as $$
  select case when coalesce(btrim(court), '') = '' then '{}'::text[] else array[
    court,
    replace(replace(replace(court, '고법', '고등법원'), '행법', '행정법원'), '지법', '지방법원'),
    replace(replace(replace(court, '고등법원', '고법'), '행정법원', '행법'), '지방법원', '지법')
  ] end
$$;

-- 1차 판 도우미는 쓰지 않는다
drop function if exists public.query_case_number(text);
drop function if exists public.query_nlrc_number(text);

-- 3) 색인 — 따로 한 문장씩 CONCURRENTLY(아래 주석). apply_mig.py 가 먼저 만들고 indisvalid 를 확인한다.
--    판례 표는 4천 행이라 번호 비교에 색인을 두지 않는다(ILIKE 갈래와 OR 이라 어차피 순차 스캔).
-- create index concurrently if not exists nlrc_case_number_real_idx on public.nlrc_decisions (case_number_real);
-- · 번호 부분일치(exact_candidates)는 색인이 없어 숫자 든 질의마다 128MB 를 순차로 읽었다 — 캐시가 차 있으면 0.2초, 비면 1~4초(261119 실측).
-- create index concurrently if not exists nlrc_casenum_any_trgm_idx
--   on public.nlrc_decisions using gin ((coalesce(case_number_qualified, case_number_real, case_number)) gin_trgm_ops);
-- · 행정해석 제목 부분일치도 색인이 없어 OR 전체가 1.2GB 순차 스캔이었다(「근로자」 2~3초).
-- create index concurrently if not exists admin_interp_title_trgm_idx
--   on public.admin_interpretations using gin (title gin_trgm_ops);

-- 4) 판례
CREATE OR REPLACE FUNCTION public.search_cases(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, case_number text, court text, title text, decision_date date, case_type text, verdict_type text, keywords_matched text[], summary text, holding_points text, law_references text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  tsquery_val tsquery := plainto_tsquery('simple', query);
  qnums TEXT[] := case_numbers_in(query);
  -- 번호 끝 일련번호 숫자 — 저장값에 이 숫자가 들어 있는 행에서만 case_numbers_in 을 부른다(4천 행 전부 부르면 +0.4초, 261119 실측)
  qtails TEXT[] := array(SELECT substring(x from '(\d+)$') FROM unnest(case_numbers_in(query)) x);
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.case_number, c.court, c.title, c.decision_date,
    c.case_type, c.verdict_type, c.keywords_matched, c.summary, c.holding_points,
    c.law_references, c.url, c.original_url,
    (
      CASE WHEN CASE WHEN EXISTS (SELECT 1 FROM unnest(qtails) t WHERE strpos(c.case_number, t) > 0)
                THEN case_numbers_in(c.case_number) && qnums ELSE false END
           THEN 10 + CASE WHEN EXISTS (SELECT 1 FROM unnest(court_variants(c.court)) v WHERE position(v in query) > 0)
                          THEN 1 ELSE 0 END
           ELSE 0 END
      + ts_rank(COALESCE(c.search_tsv, ''::tsvector), tsquery_val) * 0.7
      + GREATEST(
          similarity(c.title, query),
          similarity(COALESCE(c.summary, ''), query),
          similarity(COALESCE(c.holding_points, ''), query)
        ) * 0.3
    )::REAL AS relevance
  FROM cases c
  WHERE
    (CASE WHEN EXISTS (SELECT 1 FROM unnest(qtails) t WHERE strpos(c.case_number, t) > 0)
                THEN case_numbers_in(c.case_number) && qnums ELSE false END)
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

-- 5) 노동위 — 기존 후보(tsv 200 · 번호 부분일치 20, NOT EXISTS 그대로)에 번호 정확일치 후보를 더한다.
--    위원회는 번호 접두를 조립하지 않고 department 로 본다(「중노위」「서울지노위」「중앙노동위원회」 모두).
--    법원 행(source bigcase*)은 case_number_real 이 비어 있어 번호 직행 대상이 아니다 — 판례 탭 몫.
CREATE OR REPLACE FUNCTION public.search_nlrc(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, case_number text, title text, department text, decision_date date, case_type text, decision_result text, reason_category text[], key_issue text, holding_summary text, holding_points text, summary_short text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
 SET enable_seqscan TO 'off'
 -- 같은 연결에서 5회 넘게 부르면 plpgsql 이 질의값을 모르는 범용 계획으로 바꿔 「중앙2022부해992」가 0.2→4초(261119 실측). 매번 질의값으로 계획한다.
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  -- case_number 는 72%가 '2018부해OOO' 처럼 마스킹 — 정본은 case_number_real/_qualified(260902 복구).
  tsquery_val tsquery := plainto_tsquery('simple', query);
  qnums TEXT[] := case_numbers_in(query);
BEGIN
  RETURN QUERY
  WITH num_candidates AS (
    -- 「cardinality(qnums) > 0 AND」를 앞에 붙이면 범용 계획에서 색인을 못 타 9초대(261119 실측). 빈 배열이면 = ANY 가 0건이다.
    SELECT n.id AS cid FROM nlrc_decisions n
    WHERE n.case_number_real = ANY (qnums)
  ),
  tsv_candidates AS (
    SELECT n.id AS cid FROM nlrc_decisions n
    WHERE n.search_tsv @@ tsquery_val
    LIMIT 200
  ),
  exact_candidates AS (
    -- NOT EXISTS 를 빼면 계획이 전체 랭킹으로 뒤집힌다(261119 회귀). 지우지 말 것.
    SELECT n.id AS cid FROM nlrc_decisions n
    WHERE query ~ '[0-9]'
      AND length(query) >= 3
      AND coalesce(n.case_number_qualified, n.case_number_real, n.case_number) ILIKE '%' || query || '%'
      AND NOT EXISTS (SELECT 1 FROM tsv_candidates t WHERE t.cid = n.id)
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
      CASE WHEN n.case_number_real = ANY (qnums)
           THEN 10 + CASE WHEN n.department LIKE '%노동위원회'
                           AND (position(left(n.department, 2) in query) > 0
                                OR (n.department = '중앙노동위원회' AND query LIKE '%중노위%'))
                          THEN 1 ELSE 0 END
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

-- 6) 행정해석 낱말 패턴 — 한글·영숫자 3자 이상 낱말이 있어야 부분일치를 켠다(「...」 같은 기호 낱말 제외), 낱말은 앞 8개까지.
create or replace function public.admin_search_patterns(query text) returns text[]
language sql immutable parallel safe as $$
  with w as (
    select regexp_replace(x, '[%_\\]', '', 'g') as w, ord
    from regexp_split_to_table(trim(left(coalesce(query, ''), 100)), '[[:space:]]+') with ordinality t(x, ord)
  ), k as (
    select w, length(regexp_replace(w, '[^가-힣A-Za-z0-9]', '', 'g')) as core from w order by ord limit 8
  )
  select case when exists (select 1 from k where core >= 3)
              then array(select '%' || w || '%' from k where core >= 2)
         end
$$;

-- 7) 행정해석 질의 번호 키 — 번호 뒤에 붙은 날짜(「, 2003.3.31.」)·낱말(「연차」)을 떼고, LIKE 특수문자를 지운다.
create or replace function public.admin_query_numkey(query text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(
           admin_interp_numkey(
             regexp_replace(
               regexp_replace(left(coalesce(query, ''), 100), ',?\s*\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?\s*$', ''),
               '([0-9])[^0-9]*$', '\1')),
           '[%_\\]', '', 'g')
$$;

-- 8) 행정해석 목록 — 20261119b 와 같되 ①번호 키를 admin_query_numkey 로 ②정렬 동점에 a.id ③질의 100자 상한.
CREATE OR REPLACE FUNCTION public.search_admin_core(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, title text, doc_number text, decision_date date, keywords_matched text[], summary text, holding_points text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  q TEXT := left(coalesce(query, ''), 100);
  normalized TEXT := normalize_labor_query(q);
  qkey TEXT := admin_query_numkey(q);
  use_num BOOLEAN := q ~ '[0-9]' AND length(admin_query_numkey(q)) >= 3;
  pats TEXT[] := admin_search_patterns(q);
  longest TEXT;
BEGIN
  SELECT p INTO longest FROM unnest(pats) p ORDER BY length(p) DESC LIMIT 1;
  -- 흔한 낱말(「근로자」 tsv 1만여 건)에 부분일치까지 켜면 전부 점수를 매겨 8초대(261119 실측).
  -- 원문 tsv 로 이미 200건 이상 나오면 부분일치 갈래는 끈다 — 조사 붙은 드문 낱말 구제가 목적이다.
  IF longest IS NOT NULL THEN
    PERFORM 1 FROM (SELECT 1 FROM admin_interpretations a WHERE a.search_tsv @@ plainto_tsquery('simple', q) LIMIT 200) t
      HAVING count(*) >= 200;
    IF FOUND THEN longest := NULL; END IF;
  END IF;
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
      || ' WHEN right(admin_interp_numkey(a.doc_number), length($5)) = $5 THEN 8'
      || ' WHEN strpos(admin_interp_numkey(a.doc_number), $5) > 0 THEN 5 ELSE 0 END'
    ELSE '0' END,
    admin_search_where(use_num, longest IS NOT NULL))
  USING plainto_tsquery('simple', q), plainto_tsquery('simple', normalized), q, normalized,
        qkey, longest, pats, result_limit, page_offset;
END;
$function$;

-- 9) 행정해석 「총 N건」 — 운영 화면(/decisions)은 쓰지 않고, 부르던 /database 는 /decisions 로 이동돼 호출처가 없다.
--    공개 실행 권한을 거둔다(함수 삭제는 /database 화면 삭제 PR 에서).
revoke execute on function public.search_admin_count(text) from public, anon, authenticated;

-- 10) 반영 확인 — 함수가 기대는 색인이 있고 유효해야 한다(없으면 2.9GB 노동위 표 순차 스캔).
do $$
declare missing text;
begin
  select string_agg(n, ', ') into missing
  from unnest(array['nlrc_case_number_real_idx', 'idx_nlrc_search_tsv', 'nlrc_casenum_any_trgm_idx', 'admin_interp_title_trgm_idx',
                    'admin_interp_numkey_trgm_idx', 'admin_interp_keywords_gin_idx', 'admin_interp_fulltext_trgm_idx']) n
  where not exists (select 1 from pg_class c join pg_index i on i.indexrelid = c.oid where c.relname = n and i.indisvalid);
  if missing is not null then
    raise exception '색인이 없거나 무효: % — 마이그레이션 주석의 CONCURRENTLY 문장을 먼저 실행할 것', missing;
  end if;
end $$;
