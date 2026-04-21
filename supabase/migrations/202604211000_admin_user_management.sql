alter table if exists public.users
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

create index if not exists users_suspended_at_idx
  on public.users (suspended_at);
