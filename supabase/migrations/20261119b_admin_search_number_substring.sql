-- 행정해석 검색 업그레이드 — 문서번호 검색 + 한글 부분일치(pg_trgm).
-- 이전 검색은 본문 tsvector('simple')·제목 ILIKE 만 봐서
--   ① 문서번호(「근로기준정책과-1852」「근기 68207-390」)로는 0건
--   ② 조사가 붙은 낱말(「아이돌보미의」)은 「아이돌보미」로 못 찾았다.
-- PGroonga 는 기본 설정이 crash safe 가 아니라(공식 문서) 운영 DB 에는 pg_trgm 을 쓴다.
-- 반환 칼럼·시그니처는 그대로 둔다(화면이 SEARCH_LIMIT+1·offset·relax 폴백에 기댄다).

-- 1) 번호 비교 키: 공백·괄호·마침표·대시류를 모두 뺀다(「근로기준정책과 1852」 = 「근로기준정책과-1852」)
create or replace function public.admin_interp_numkey(v text) returns text
language sql immutable parallel safe as $$
  select lower(regexp_replace(coalesce(v, ''), '[[:space:]()（）.·－—–‒―−‐‑-]', '', 'g'))
$$;

-- 2) 부분일치 대상 본문
create or replace function public.admin_interp_fulltext(t text, s text, h text) returns text
language sql immutable parallel safe as $$
  select coalesce(t, '') || ' ' || coalesce(s, '') || ' ' || coalesce(h, '')
$$;

-- 3) 색인 — 마이그레이션 본문과 따로, 한 문장씩 CONCURRENTLY 로 만든다(아래 주석). 만든 뒤 indisvalid 확인.
-- create index concurrently if not exists admin_interp_numkey_trgm_idx
--   on public.admin_interpretations using gin (public.admin_interp_numkey(doc_number) gin_trgm_ops);
-- create index concurrently if not exists admin_interp_keywords_gin_idx
--   on public.admin_interpretations using gin (keywords_matched);
-- create index concurrently if not exists admin_interp_fulltext_trgm_idx
--   on public.admin_interpretations using gin (public.admin_interp_fulltext(title, summary, holding_points) gin_trgm_ops);

-- 4) 질의 → 낱말 패턴(2글자 이상, 와일드카드 문자 제거). 3글자 이상 낱말이 하나도 없으면 부분일치를 쓰지 않는다
--    (2글자만으로는 trigram 이 안 나와 색인을 못 탄다. 그런 질의는 기존 tsvector 경로가 맡는다).
create or replace function public.admin_search_patterns(query text) returns text[]
language sql immutable parallel safe as $$
  with w as (
    select regexp_replace(x, '[%_\\]', '', 'g') as w
    from regexp_split_to_table(trim(coalesce(query, '')), '[[:space:]]+') x
  )
  select case when exists (select 1 from w where length(w) >= 3)
              then array(select '%' || w || '%' from w where length(w) >= 2)
         end
$$;

-- 5) 검색 조건 — 목록·건수가 같은 조건을 쓴다. 쓰지 않는 갈래는 아예 넣지 않는다
--    (변수로 켜고 끄면 플래너가 색인 OR 를 못 짜서 전수 스캔, 실측 1.1초 → 상수 조건 0.12초).
--    $1 tsquery(원문) $2 tsquery(정규화) $3 원문 $4 정규화 $5 번호키 $6 가장 긴 낱말 패턴 $7 낱말 패턴들
create or replace function public.admin_search_where(use_num boolean, use_sub boolean) returns text
language sql immutable parallel safe as $$
  select 'a.duplicate_of IS NULL AND ('
      || 'a.search_tsv @@ $1 OR a.search_tsv @@ $2'
      || ' OR a.title ILIKE ''%'' || $3 || ''%'' OR a.title ILIKE ''%'' || $4 || ''%'''
      || ' OR a.keywords_matched @> ARRAY[$3]'
      || case when use_num then ' OR admin_interp_numkey(a.doc_number) LIKE ''%'' || $5 || ''%''' else '' end
      || case when use_sub then ' OR (admin_interp_fulltext(a.title, a.summary, a.holding_points) ILIKE $6'
                             || ' AND admin_interp_fulltext(a.title, a.summary, a.holding_points) ILIKE ALL ($7))' else '' end
      || ')'
$$;

-- 6) 목록 검색
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
    ORDER BY relevance DESC, a.decision_date DESC NULLS LAST
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

-- 7) 목록 「총 N건」 — 화면의 ILIKE 세기는 번호를 못 보고 본문 전수 스캔이었다. 같은 조건으로 센다.
CREATE OR REPLACE FUNCTION public.search_admin_count(query text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  normalized TEXT := normalize_labor_query(query);
  use_num BOOLEAN := query ~ '[0-9]' AND length(admin_interp_numkey(query)) >= 3;
  pats TEXT[] := admin_search_patterns(query);
  longest TEXT;
  n BIGINT;
BEGIN
  SELECT p INTO longest FROM unnest(pats) p ORDER BY length(p) DESC LIMIT 1;
  EXECUTE 'SELECT count(*) FROM admin_interpretations a WHERE ' || admin_search_where(use_num, longest IS NOT NULL)
    INTO n
    USING plainto_tsquery('simple', query), plainto_tsquery('simple', normalized), query, normalized,
          admin_interp_numkey(query), longest, pats;
  RETURN n;
END;
$function$;

grant execute on function public.search_admin_count(text) to anon, authenticated;
