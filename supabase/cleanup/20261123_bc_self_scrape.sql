-- 법원 판례(bc_) 원천 표에서 「우리 사이트를 긁은 행」 정리 — 작성만 했다. 실행 결정은 사람 몫이다.
--
-- 원인: 2026-03-28~04-01 recollect-v3 수집이 bigcase 대신 nlrc_decisions.url(= 우리 상세 페이지
--   https://노란봉투법.com/decisions/bc_…)을 받아 decision_source_documents 에 source_provider='bigcase',
--   parse_version='recollect-v3' 로 넣었다(full_text_raw = {"extraction_method": "fallback_body"}).
--   본문은 우리 화면 글자 + 우리 AI 정리라 판결문 원천이 아니다.
-- 화면은 src/lib/source-self-scrape.ts(screenSourceRow)가 같은 술어로 이미 거른다 — 이 SQL 은 데이터 정리용.
-- 술어(우리 도메인 주소)는 screenSourceRow 의 isOwnSiteUrl 과 같다. 2026-11-23 실측: 10,307행, 모두 recollect-v3.
--
-- 실행 순서: 0(확인) → 1(백업) → 2(삭제, 0행이 될 때까지 반복) → 3(확인). 대량 쓰기 규칙(배치·휴식·health)은
-- 운영 메모 reference_supabase_management_api_local 을 따른다. 되돌림 = 백업 표에서 다시 넣기(4).

-- 0. 대상 확인 (읽기 전용) ------------------------------------------------------
select parse_version, completeness_flag, count(*)
from decision_source_documents
where source_url like 'http%://노란봉투법.com/%'
   or source_url like 'http%://www.노란봉투법.com/%'
   or source_url ilike 'http%://xn--o80bk8isxeinax68f.com/%'
   or source_url ilike 'http%://www.xn--o80bk8isxeinax68f.com/%'
   or source_url ilike 'http%://yellowenvelope.kr/%'
   or source_url ilike 'http%://www.yellowenvelope.kr/%'
group by 1, 2
order by 1, 2;

-- 1. 백업 -----------------------------------------------------------------------
create table if not exists decision_source_documents_bak_selfscrape_261123 as
select *
from decision_source_documents
where source_url like 'http%://노란봉투법.com/%'
   or source_url like 'http%://www.노란봉투법.com/%'
   or source_url ilike 'http%://xn--o80bk8isxeinax68f.com/%'
   or source_url ilike 'http%://www.xn--o80bk8isxeinax68f.com/%'
   or source_url ilike 'http%://yellowenvelope.kr/%'
   or source_url ilike 'http%://www.yellowenvelope.kr/%';

-- 백업 표는 API 로 열리지 않게 한다.
alter table decision_source_documents_bak_selfscrape_261123 enable row level security;

-- 2. 삭제 — 한 번에 500행. 영향 행이 0 이 될 때까지 반복한다(배치 사이 1~2초 휴식). --------
delete from decision_source_documents
where id in (
  select b.id
  from decision_source_documents_bak_selfscrape_261123 b
  join decision_source_documents d on d.id = b.id
  limit 500
);

-- 3. 확인 — 0 이어야 한다 -------------------------------------------------------
select count(*) as remaining_self_scrape
from decision_source_documents d
join decision_source_documents_bak_selfscrape_261123 b on b.id = d.id;

-- 4. 되돌림(필요할 때만) ----------------------------------------------------------
-- insert into decision_source_documents
-- select * from decision_source_documents_bak_selfscrape_261123 b
-- where not exists (select 1 from decision_source_documents d where d.id = b.id);
