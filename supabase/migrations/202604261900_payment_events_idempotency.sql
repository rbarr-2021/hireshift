create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null references public.bookings(id) on delete set null,
  payment_id uuid null references public.payments(id) on delete set null,
  event_type text not null,
  source text not null default 'stripe',
  stripe_event_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists payment_events_booking_id_idx
  on public.payment_events (booking_id);

create index if not exists payment_events_payment_id_idx
  on public.payment_events (payment_id);

create index if not exists payment_events_event_type_idx
  on public.payment_events (event_type);

create unique index if not exists payment_events_stripe_event_id_uidx
  on public.payment_events (stripe_event_id)
  where stripe_event_id is not null;

alter table public.payment_events enable row level security;
