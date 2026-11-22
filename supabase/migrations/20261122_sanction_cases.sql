-- 양정 사례(법원 판결 발췌) — 계획서 PLAN_양정코퍼스_261119 P4 1차 조각.
-- 원천 = legal-data-pipeline p4_export.py → data/sanction_corpus/p4_export/cases.jsonl (행 = 판결×유형)
-- 기존 nlrc_decisions·검색 RPC 는 건드리지 않는다(새 표만).
-- 1차는 우리만 쓴다(261122 재홍님 결정) — RLS 를 켜고 정책을 두지 않아 anon·authenticated 는 읽지 못한다. 서버 역할로만 읽는다.
-- quote·evidence = 판결 원문 글자 그대로(문장 통째). generated_note = 모델 메모라 원문 칸과 이름을 가른다.

create table if not exists public.sanction_cases (
  id              text primary key,                -- '{type}:{정규화 법원}|{사건번호}'
  doc_key         text not null,                   -- '{정규화 법원}|{사건번호}' — 두 유형에 걸린 판결은 같은 값
  type            text not null check (type in ('sexual','harass','attend','secret','fraud','embezzle','neglect','drunk','dignity')),
  court           text not null,
  case_number     text not null,
  decided_on      date,
  dispute         text not null,                   -- 심급을 묶은 분쟁 키
  kind            text,
  disposition     text,
  reason          text,                            -- 사유: 전부 인정 / 일부 인정 / 불인정 / 미판단
  reason_upheld   text,
  sanction        text check (sanction in ('적정','과중')),
  procedure       text,
  plaintiff_side  text,
  quote           text not null,
  quote_len       int  not null,
  quote_fits      boolean not null,                -- 10줄(450자) 안에 문장 통째로 드는가
  evidence        text,
  evidence_fits   boolean,
  generated_note  text,
  related         text[] not null default '{}',
  reversed_by     text,
  also_types      text[] not null default '{}',
  source          text,
  quote_sha1      text not null,
  corpus_version  text not null,
  loaded_at       timestamptz not null default now()
);

alter table public.sanction_cases enable row level security;
revoke all on public.sanction_cases from anon, authenticated;
-- 2026-10-30 부터 새 표는 service_role 에도 자동으로 열리지 않는다(NOW.md) — 명시한다. anon·authenticated 는 주지 않는다.
grant select, insert, update, delete on table public.sanction_cases to service_role;

create index if not exists sanction_cases_type_sanction_idx on public.sanction_cases (type, sanction, decided_on desc);
create index if not exists sanction_cases_doc_key_idx on public.sanction_cases (doc_key);
