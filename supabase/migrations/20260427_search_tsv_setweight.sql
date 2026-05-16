-- Phase 5A: search_tsv setweight 차등 가중치 적용
-- 적용 시점: 임베딩 재계산 (Phase 1) 완료 후
-- 검증: R1 평가셋 240문항 재실행 → 정확도 향상 입증 시 채택

-- 1. 트리거 함수 업데이트 (setweight 적용)
CREATE OR REPLACE FUNCTION public.update_nlrc_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.case_number, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.key_issue, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.holding_summary, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.holding_points, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.case_type, '')), 'D');
  RETURN NEW;
END;
$function$;

-- 2. 기존 행 search_tsv 일괄 재생성 (트리거 함수 변경만으론 기존 행에 적용 안 됨)
-- WARNING: 57,833행 UPDATE — 약 1-3분 소요. 트랜잭션 분할 권장.
-- UPDATE nlrc_decisions SET title = title;  -- 트리거만 강제 발동시키는 방식 (id별 batch 필요)

-- 안전한 batch 적용 (10,000행씩):
-- DO $$
-- DECLARE
--   batch_size INT := 10000;
--   total_updated INT := 0;
--   max_id_seen TEXT := '';
-- BEGIN
--   LOOP
--     UPDATE nlrc_decisions
--     SET search_tsv =
--       setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
--       setweight(to_tsvector('simple', COALESCE(case_number, '')), 'A') ||
--       setweight(to_tsvector('simple', COALESCE(key_issue, '')), 'B') ||
--       setweight(to_tsvector('simple', COALESCE(holding_summary, '')), 'B') ||
--       setweight(to_tsvector('simple', COALESCE(holding_points, '')), 'C') ||
--       setweight(to_tsvector('simple', COALESCE(case_type, '')), 'D')
--     WHERE id IN (
--       SELECT id FROM nlrc_decisions
--       WHERE id > max_id_seen
--       ORDER BY id
--       LIMIT batch_size
--     )
--     RETURNING id INTO max_id_seen;
--     EXIT WHEN NOT FOUND;
--     total_updated := total_updated + batch_size;
--     RAISE NOTICE 'Updated % rows', total_updated;
--   END LOOP;
-- END $$;

-- 3. RPC search_similar_cases_hybrid는 search_tsv 사용 안 함 (trigram + embedding 사용)
-- → setweight 효과는 search_tsv를 직접 사용하는 다른 검색 (search_modes.ts textSearch)에만 영향

-- 4. RPC search_faq_combined / search_faq_hybrid 등 FAQ 검색은 별도 search_tsv (faq 테이블)
-- → 이 마이그레이션은 nlrc_decisions만 적용. FAQ 가중치는 별도 마이그레이션 필요 시 작성.

-- 검증 SQL:
-- SELECT id, title, ts_rank_cd(search_tsv, plainto_tsquery('simple', '부당해고')) AS rank
-- FROM nlrc_decisions
-- WHERE search_tsv @@ plainto_tsquery('simple', '부당해고')
-- ORDER BY rank DESC LIMIT 10;
-- → 제목에 "부당해고" 있는 행이 본문 매칭 행보다 위로
