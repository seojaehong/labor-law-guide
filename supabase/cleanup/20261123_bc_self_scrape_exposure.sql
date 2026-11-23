-- 읽기 전용: 상세 페이지 선택 규칙을 SQL 로 모사해 「우리 사이트를 긁은 행」이 화면에 뽑히는 bc_ 건수를 센다(2026-11-23).
-- 결과(그날): 원천 행 있는 id 15,931 · 수집 본문 표시 12,829 → 7,300 · 그중 우리 화면이 뽑힌 것 7,371(동률 처리에 따라 7,371~7,419) ·
-- 상담 권유 문구 노출 5,021 · 고친 뒤 바깥 원문으로 내려감 1,842 · 원문 없음(AI 정리만) 5,529. 모사값이며 렌더 실측이 아니다.
with base as (
  select internal_decision_id iid, id rid, parse_version, completeness_flag, coverage_ratio,
    coalesce(source_url like '%노란봉투법.com%' or source_url ilike '%yellowenvelope.kr%' or source_url ilike '%xn--o80bk8isxeinax68f.com%', false) own,
    (parse_version = 'local-verified-v1' and completeness_flag = 'full') ver,
    coalesce(btrim(full_text_clean), '') c, coalesce(btrim(full_text_raw), '') r, body_sections s
  from decision_source_documents
  where internal_decision_id like 'bc\_%'
    and (source_provider = 'bigcase' or (parse_version = 'local-verified-v1' and completeness_flag = 'full'))
), f as (
  select *,
    (c ~ '(콘텐츠 이용량이 많아|서비스 접속이 원활하지 않|친구초대 30,000P|MY빅케이스|Law&Company Co., Ltd|\(C\) Law|슈퍼로이어|로톡뉴스)' or (strpos(c, '''item'':') > 0 and strpos(c, '''content'':') > 0)) c_bad,
    (r ~ '(콘텐츠 이용량이 많아|서비스 접속이 원활하지 않|친구초대 30,000P|MY빅케이스|Law&Company Co., Ltd|\(C\) Law|슈퍼로이어|로톡뉴스)' or (strpos(r, '''item'':') > 0 and strpos(r, '''content'':') > 0)) r_bad,
    (jsonb_typeof(s) = 'array' and exists (select 1 from jsonb_array_elements(s) e where jsonb_typeof(e) = 'object' and jsonb_typeof(e->'text') = 'string' and length(btrim(e->>'text')) > 0
       and (e->>'text') !~ '(콘텐츠 이용량이 많아|서비스 접속이 원활하지 않|친구초대 30,000P|MY빅케이스|Law&Company Co., Ltd|\(C\) Law|슈퍼로이어|로톡뉴스)')) is_list
  from base
), cand as (
  select iid, rid, own, ver, is_list, coverage_ratio, c,
    case when length(c) >= (case when ver then 1 else 1000 end) and not c_bad then 1
         when length(r) >= 1000 and not r_bad then 2 else 9 end pass
  from f
), pick_before as (
  select distinct on (iid) iid, rid, own, pass, c from cand where pass < 9
  order by iid, pass, ver desc, is_list desc, coverage_ratio desc nulls last, rid
), pick_after as (
  select distinct on (iid) iid, rid, own, pass from cand where pass < 9 and not own
  order by iid, pass, ver desc, is_list desc, coverage_ratio desc nulls last, rid
), ids as (select distinct iid from base)
select
  (select count(*) from ids) ids_with_source_rows,
  (select count(*) from pick_before) ids_with_text_before,
  (select count(*) from pick_before where own) ids_showing_own_page_before,
  (select count(*) from pick_before where own and c ~ '(전문가 상담이 필요하신가요|무료 상담 신청하기|AI에게 질문하기|노무법인 위너스)') ids_showing_ad_words_before,
  (select count(*) from pick_before b join pick_after a using (iid) where b.own) own_then_external_text_after,
  (select count(*) from pick_before b left join pick_after a using (iid) where b.own and a.iid is null) own_then_no_text_after,
  (select count(*) from pick_after) ids_with_text_after,
  (select count(*) from pick_before b join pick_after a using (iid) where not b.own and b.rid <> a.rid) nonown_changed
