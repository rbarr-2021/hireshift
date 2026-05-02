alter table public.business_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_default_payment_method_id text,
  add column if not exists stripe_payment_method_ready_at timestamptz,
  add column if not exists stripe_payment_method_last_error text,
  add column if not exists stripe_payment_method_last_synced_at timestamptz;

create unique index if not exists business_profiles_stripe_customer_id_idx
on public.business_profiles (stripe_customer_id)
where stripe_customer_id is not null;
