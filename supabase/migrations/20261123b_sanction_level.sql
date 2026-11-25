-- 처분 수준(중징계·경징계) — 골라 내려받기 화면 거르기용(261123 재홍님 결정: 처분별이 아니라 두 칸으로만).
-- 처분명(disposition)에서 적재 때 분류한다(legal-data-pipeline p4_export.level_of). 분류 못 한 처분은 null(「전부」에서만 보인다).
-- 구분은 공무원 징계령 기준: 중징계 = 파면·해임·강등·정직(해고·면직·각종 정지 포함), 경징계 = 감봉·견책(경고·근신·영창 포함).
alter table public.sanction_cases
  add column if not exists sanction_level text;

alter table public.sanction_cases
  add constraint sanction_cases_level_values
  check (sanction_level is null or sanction_level in ('중징계', '경징계'));
