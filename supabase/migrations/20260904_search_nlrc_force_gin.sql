-- search_nlrc: GIN 인덱스를 쓰도록 강제 (2026-09-04)
--
-- 증상: search_nlrc('퇴직금')이 매번 3.7~3.9초. 자동점검 하네스의 검색 지연
--       평균이 802ms → 1,472ms로 계속 악화되고 있었다.
-- 원인: tsv_candidates CTE의 `LIMIT 200` 때문에 플래너가 "앞에서 200건만
--       찾으면 끝난다"고 보고 idx_nlrc_search_tsv(GIN, 113MB) 대신 Seq Scan을
--       고른다. 그런데 search_tsv는 TOAST 컬럼이라 행마다 압축 해제가 붙어
--       5,295행을 훑는 데 2,066ms가 든다. 인덱스 경로는 같은 결과가 204ms.
--       (인덱스는 valid·ready 상태였고 REINDEX가 필요한 상황이 아니었다)
-- 조치: 함수 단위 SET enable_seqscan = off. 이 함수 안에서만 적용된다.
--       case_number ILIKE '%...%' 전체 스캔(215ms)도 같이 없애려고
--       case_number에 trigram 인덱스를 추가한다.

CREATE INDEX IF NOT EXISTS idx_nlrc_case_number_trgm
  ON public.nlrc_decisions USING gin (case_number gin_trgm_ops);

ALTER FUNCTION public.search_nlrc(text, integer, integer) SET enable_seqscan = off;
