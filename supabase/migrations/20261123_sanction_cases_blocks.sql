-- P5 검수 블록 칸 — 판결 전문에서 정본 [관련 판결] 형식으로 다시 자르고 독립 채점한 결과.
-- block_status = pass 일 때만 block_body 가 있다. 그 밖(long_judgment·no_fit·fail 등)은 블록 없음 사유.
-- long_text = 양정 판단이 한 문장으로 길어 블록에 못 싣는 판결의 그 판단 원문(md 보기용).
alter table public.sanction_cases
  add column if not exists block_status text,
  add column if not exists block_body   text,
  add column if not exists long_text    text;

alter table public.sanction_cases
  add constraint sanction_cases_block_body_only_pass
  check (block_body is null or block_status = 'pass');
