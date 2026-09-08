-- 2026-09-08 자동수정: 링크 스텁 집계의 statement timeout(57014) 해소
--
-- 배경: 하네스 Phase 0(site-autoresearch.sh)은 결측을 NULL + 빈값 + 스텁으로 센다.
-- 스텁 중 '본문 없이 마크다운 원문 링크 한 줄만 남은 행'은 선행 와일드카드 LIKE 라
-- 인덱스를 못 타고, nlrc_decisions(57,840행)에서는 PostgREST 기본 statement_timeout(8s)
-- 을 넘겨 57014로 실패했다. 실패 시 0으로 덮지 않고 stub_error 를 남기도록 9/7에
-- 조치했지만, 그 결과 nlrc 의 링크 스텁 수는 매일 '미집계'로 남았다.
-- (9/8 실측: nlrc 0건, admin_interpretations 294건, cases 0건)
--
-- 해법: 함수 안에서만 statement_timeout 을 올려 전수 스캔을 끝까지 돌린다.
-- length() 프리필터로 가속하는 방법은 쓰지 않는다 — length<300 으로 자르면
-- admin_interpretations 의 링크 스텁 294건 중 7건이 누락된다(287건만 잡힘).
create or replace function public.count_link_stub(p_table text, p_column text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  n bigint;
  typ text;
begin
  -- security definer + 동적 SQL 이므로 식별자는 카탈로그로 검증한다.
  select data_type into typ
    from information_schema.columns
   where table_schema = 'public'
     and table_name = p_table
     and column_name = p_column;

  if typ is null then
    raise exception 'unknown column %.%', p_table, p_column;
  end if;

  -- 스텁은 text 계열에만 의미가 있다. date/tsvector 등은 호출측에서 0으로 둔다.
  if typ not in ('text', 'character varying', 'character') then
    raise exception 'not a text column: %.% (%)', p_table, p_column, typ;
  end if;

  -- 패턴은 값 전체를 겨냥한다. 뒤에 %를 붙이면 본문 끝에 출처 링크를 덧붙인
  -- 정상 행까지 걸린다(2026-09-07 확인: 14,773건).
  execute format(
    'select count(*) from public.%I where %I like ''-%%원문 링크%%)''',
    p_table, p_column
  ) into n;

  return n;
end;
$$;

revoke all on function public.count_link_stub(text, text) from public;
grant execute on function public.count_link_stub(text, text) to service_role;
