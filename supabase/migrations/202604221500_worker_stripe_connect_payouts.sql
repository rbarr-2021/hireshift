alter table if exists public.worker_profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_onboarding_completed_at timestamptz,
  add column if not exists stripe_connect_last_synced_at timestamptz;

create unique index if not exists worker_profiles_stripe_connect_account_id_idx
  on public.worker_profiles (stripe_connect_account_id)
  where stripe_connect_account_id is not null;

create index if not exists worker_profiles_stripe_connect_payouts_enabled_idx
  on public.worker_profiles (stripe_connect_payouts_enabled);
