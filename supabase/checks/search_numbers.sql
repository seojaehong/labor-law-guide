-- 검색 번호 추출 도우미 기대결과(20261119c). 운영·브랜치 DB 어디서나 읽기 전용으로 돈다. 틀리면 예외.
-- 실행: Management API 또는 psql 로 이 파일 전체를 한 번에 보낸다.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('2012다89399',                                   array['2012다89399']),
    ('2012다 89399',                                  array['2012다89399']),
    ('대법원 2012다89399',                            array['2012다89399']),
    ('2015년 6월 3일 선고 2014나12345',               array['2014나12345']),
    ('대법원 2013. 12. 18. 선고 2012다89399 판결',    array['2012다89399']),
    ('근로기준법 제23조 2019다12345',                 array['2019다12345']),
    ('주 52시간 2018년 7월 1일 시행',                 array[]::text[]),
    ('2024년 5월 해고',                               array[]::text[]),
    ('계속된 1차',                                    array[]::text[]),
    ('2016다26662, 26679, 26686',                     array['2016다26662','2016다26679','2016다26686']),
    ('2013누8174, 2013누8181(병합)',                  array['2013누8174','2013누8181']),
    ('2016나24452(본소), 2019나24682(반소)',          array['2016나24452','2019나24682']),
    ('69나332,333',                                   array['69나332','69나333']),
    ('2021노904(분리)',                               array['2021노904']),
    ('2020나2014459',                                 array['2020나2014459']),
    ('중앙 2022부해 415',                             array['2022부해415']),
    ('중노위 98부해 676',                             array['98부해676']),
    ('서울지노위2016부해406',                         array['2016부해406'])
  ) t(q, want) loop
    if public.case_numbers_in(r.q) is distinct from r.want then
      raise exception 'case_numbers_in(%) = %, 기대 %', r.q, public.case_numbers_in(r.q), r.want;
    end if;
  end loop;

  for r in select * from (values
    ('근로기준정책과-1852 연차',      '근로기준정책과1852'),
    ('근기 68207-390, 2003.3.31.',    '근기68207390'),
    ('68207-390',                     '68207390'),
    ('1852\',                         '1852'),
    ('1_3',                           '13'),
    ('노조01254-',                    '노조01254')
  ) t(q, want) loop
    if public.admin_query_numkey(r.q) is distinct from r.want then
      raise exception 'admin_query_numkey(%) = %, 기대 %', r.q, public.admin_query_numkey(r.q), r.want;
    end if;
  end loop;

  if public.court_variants('') <> '{}'::text[] then raise exception 'court_variants 빈 값'; end if;
  if not ('서울고등법원' = any (public.court_variants('서울고법'))) then raise exception 'court_variants 약칭→정식'; end if;
  if not ('서울고법' = any (public.court_variants('서울고등법원'))) then raise exception 'court_variants 정식→약칭'; end if;
  if public.admin_search_patterns('...') is not null then raise exception 'admin_search_patterns 기호 낱말'; end if;
end $$;
select 'search_numbers checks passed' as result;
