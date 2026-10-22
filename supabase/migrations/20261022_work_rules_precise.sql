-- 취업규칙 정밀 점검 — 실행 기록과 조문별 반응(정답지 수집). 서비스 롤만 쓴다(RLS 켜고 정책 없음).
-- 본문(rules_text·old_text)은 사용자가 저장에 동의했을 때만 채운다.
create table if not exists public.work_rules_precise_runs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  articles int not null,
  flagged int not null,
  usd numeric(8, 4) not null,
  seconds numeric(6, 1) not null,
  headcount text,
  rows jsonb not null,
  stored_text boolean not null default false,
  rules_text text,
  old_text text
);

create table if not exists public.work_rules_precise_feedback (
  run_id uuid not null references public.work_rules_precise_runs (id) on delete cascade,
  article text not null,
  verdict text not null check (verdict in ('right', 'wrong', 'unsure')),
  note text,
  created_at timestamptz not null default now(),
  primary key (run_id, article)
);

alter table public.work_rules_precise_runs enable row level security;
alter table public.work_rules_precise_feedback enable row level security;
