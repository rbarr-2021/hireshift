create table if not exists public.admin_users (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can read own admin access" on public.admin_users;
create policy "Admins can read own admin access"
on public.admin_users for select
using (auth.uid() = user_id);

alter table if exists public.bookings
  add column if not exists requested_role_label text,
  add column if not exists shift_duration_hours numeric(6,2);

alter table if exists public.payments
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_checkout_url text,
  add column if not exists stripe_checkout_expires_at timestamptz;

create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_booking_status_idx on public.payments (booking_id, status);
create unique index if not exists payments_stripe_checkout_session_id_idx
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

update public.bookings
set shift_duration_hours = greatest(
  round(
    (
      extract(epoch from (
        ((coalesce(shift_end_date, shift_date))::text || ' ' || end_time::text)::timestamptz -
        (shift_date::text || ' ' || start_time::text)::timestamptz
      )) / 3600
    )::numeric,
    2
  ),
  0
)
where shift_duration_hours is null;

