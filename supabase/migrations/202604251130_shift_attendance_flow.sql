alter table if exists public.bookings
  add column if not exists worker_checked_in_at timestamptz,
  add column if not exists worker_checked_out_at timestamptz,
  add column if not exists business_confirmed_start_at timestamptz,
  add column if not exists business_confirmed_end_at timestamptz,
  add column if not exists business_confirmed_at timestamptz,
  add column if not exists business_confirmed_by uuid references public.users(id) on delete set null,
  add column if not exists manager_confirmation_name text;

create index if not exists bookings_worker_checked_in_at_idx
  on public.bookings (worker_checked_in_at);

create index if not exists bookings_worker_checked_out_at_idx
  on public.bookings (worker_checked_out_at);

create index if not exists bookings_business_confirmed_at_idx
  on public.bookings (business_confirmed_at);
