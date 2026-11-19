-- 261119 S2 — 행정해석 탭에 법제처 해석(molab_interpretations) 중 행정해석에 없는 문서를 합친다.
--
-- 왜: molab 9,636건 중 7,698건은 행정해석(admin_interpretations)에 같은 정규화 번호·같은 회신일로 이미 있다.
--     나머지(약 1,900건, 법제처 동기화분·일련번호만 있는 288건 포함)는 /decisions 행정해석 탭에서 찾을 수 없었다.
-- 어떻게: 단독분만 담은 작은 검색 표 molab_only_search(번호키·제목·tsv)를 두고, search_admin 이 두 결과를 점수순으로 합친다.
--     처음 판은 검색 때마다 molab 원표에서 쌍둥이를 거르고 본문 tsv 를 만들어 「근로자」 첫 호출이 9.3초(캐시 빈 상태)였다 — 반영하지 않았다.
--     원표 본문(TOAST 88MB)은 결과 21행을 그릴 때만 읽는다.
-- 갱신: 행정해석·법제처 적재 뒤 `select refresh_molab_only_search();` (주간 법제처 동기화 끝에 부른다). 안 부르면 새 쌍둥이가 두 줄로 보일 수 있다.
-- 점수: 행정해석과 같은 식 — 번호 완전 10·끝 8·포함 5 + ts_rank*0.7 + 제목 similarity*0.3.

CREATE TABLE IF NOT EXISTS public.molab_only_search (
  id text PRIMARY KEY REFERENCES public.molab_interpretations(id) ON DELETE CASCADE,
  numkey text,
  title text,
  decision_date date,
  tsv tsvector
);
ALTER TABLE public.molab_only_search ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS molab_only_search_read ON public.molab_only_search;
CREATE POLICY molab_only_search_read ON public.molab_only_search FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.molab_only_search TO anon, authenticated;
CREATE INDEX IF NOT EXISTS molab_only_search_tsv_idx ON public.molab_only_search USING gin (tsv);
CREATE INDEX IF NOT EXISTS molab_only_search_numkey_idx ON public.molab_only_search USING gin (numkey gin_trgm_ops);
CREATE INDEX IF NOT EXISTS molab_only_search_title_idx ON public.molab_only_search USING gin (title gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.refresh_molab_only_search()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE n integer;
BEGIN
  DELETE FROM molab_only_search;
  INSERT INTO molab_only_search (id, numkey, title, decision_date, tsv)
  SELECT m.id, admin_interp_numkey(m.case_number), m.title, m.decision_date,
         to_tsvector('simple', coalesce(m.title, '') || ' ' || coalesce(m.full_text, ''))
    FROM molab_interpretations m
   -- 쌍둥이 = 같은 회신일 + (정규화 번호 같음 OR 괄호·대시·공백을 뺀 번호키 같음).
   -- 번호키를 함께 보는 것은 법제처 쪽 번호 오타(「산안건안) 68307-10279」) 때문 — 같은 문서가 두 줄로 나와 원본을 밀어냈다(261119 평가).
   WHERE NOT EXISTS (SELECT 1 FROM admin_interpretations a
                      WHERE a.decision_date IS NOT DISTINCT FROM m.decision_date
                        AND (a.doc_number_norm = admin_interp_doc_norm(m.case_number)
                             OR admin_interp_numkey(a.doc_number) = admin_interp_numkey(m.case_number)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.refresh_molab_only_search() FROM public, anon, authenticated;

SELECT public.refresh_molab_only_search();

CREATE OR REPLACE FUNCTION public.search_molab_only(query text, result_limit integer DEFAULT 20)
 RETURNS TABLE(id text, title text, doc_number text, decision_date date, keywords_matched text[], summary text, holding_points text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  q TEXT := left(coalesce(query, ''), 100);
  tq tsquery := plainto_tsquery('simple', q);
  qkey TEXT := admin_query_numkey(q);
  use_num BOOLEAN := q ~ '[0-9]' AND length(admin_query_numkey(q)) >= 3;
  pats TEXT[] := admin_search_patterns(q);
  longest TEXT;
BEGIN
  SELECT p INTO longest FROM unnest(pats) p ORDER BY length(p) DESC LIMIT 1;
  RETURN QUERY
  WITH hit AS (
    SELECT s.id,
      ( CASE WHEN NOT use_num THEN 0
             WHEN s.numkey = qkey THEN 10
             WHEN right(s.numkey, length(qkey)) = qkey THEN 8
             WHEN strpos(s.numkey, qkey) > 0 THEN 5 ELSE 0 END
        + ts_rank(s.tsv, tq) * 0.7
        + similarity(s.title, q) * 0.3 )::REAL AS rel,
      s.decision_date AS d
    FROM molab_only_search s
    WHERE (use_num AND s.numkey LIKE '%' || qkey || '%')
       OR (numnode(tq) > 0 AND s.tsv @@ tq)
       OR (longest IS NOT NULL AND s.title ILIKE '%' || longest || '%')
    ORDER BY rel DESC, d DESC NULLS LAST, s.id
    LIMIT result_limit
  )
  SELECT m.id, m.title, m.case_number, m.decision_date, m.keywords_matched,
         m.inquiry_summary, m.answer_summary, m.url, NULL::text, h.rel
  FROM hit h JOIN molab_interpretations m ON m.id = h.id
  ORDER BY h.rel DESC, h.d DESC NULLS LAST, h.id;
END;
$function$;

-- 행정해석 + 법제처 단독분을 점수순으로 합친 한 쪽. 두 함수 모두 offset+limit 만큼 받아 합친 뒤 자른다.
CREATE OR REPLACE FUNCTION public.search_admin_merged(query text, result_limit integer, page_offset integer)
 RETURNS TABLE(id text, title text, doc_number text, decision_date date, keywords_matched text[], summary text, holding_points text, url text, original_url text, relevance real)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT * FROM (
    SELECT * FROM search_admin_core(query, result_limit + page_offset, 0)
    UNION ALL
    SELECT * FROM search_molab_only(query, result_limit + page_offset)
  ) u
  -- 점수가 같으면 행정해석 원본을 앞에(법제처 id 는 ml_ 로 시작)
  ORDER BY u.relevance DESC, (u.id LIKE 'ml\_%') , u.decision_date DESC NULLS LAST, u.id
  LIMIT result_limit OFFSET page_offset;
$function$;

CREATE OR REPLACE FUNCTION public.search_admin(query text, result_limit integer DEFAULT 20, page_offset integer DEFAULT 0)
 RETURNS TABLE(id text, title text, doc_number text, decision_date date, keywords_matched text[], summary text, holding_points text, url text, original_url text, relevance real)
 LANGUAGE plpgsql
AS $function$
DECLARE
  relaxed TEXT;
BEGIN
  RETURN QUERY SELECT * FROM search_admin_merged(query, result_limit, page_offset);
  IF FOUND THEN
    RETURN;
  END IF;

  -- 뒷페이지가 비는 것은 '결과 끝'이지 zero-result가 아니다.
  -- 1페이지에 결과가 있었다면 완화하지 않는다 (페이지 간 결과 집합 혼합 방지).
  IF page_offset > 0 THEN
    PERFORM 1 FROM search_admin_merged(query, 1, 0);
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  relaxed := relax_labor_query(query);
  IF relaxed IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM search_admin_merged(relaxed, result_limit, page_offset);
END;
$function$;
