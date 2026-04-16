alter table if exists public.worker_profiles
  drop column if exists skills,
  drop column if exists daily_rate_gbp;
