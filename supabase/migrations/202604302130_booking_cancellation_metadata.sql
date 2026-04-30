alter table if exists public.bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists cancelled_by_role text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text;

create index if not exists bookings_cancelled_at_idx
  on public.bookings (cancelled_at desc)
  where cancelled_at is not null;
