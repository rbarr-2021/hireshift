create table if not exists public.admin_payment_actions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  admin_user_id uuid not null references public.users(id) on delete cascade,
  action_type text not null check (
    action_type in (
      'release_payout',
      'hold_payout',
      'retry_payout',
      'refund_payment',
      'flag_issue'
    )
  ),
  reason text null,
  previous_payment_status text null,
  previous_payout_status text null,
  new_payment_status text null,
  new_payout_status text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admin_payment_actions_booking_id_idx
  on public.admin_payment_actions (booking_id);

create index if not exists admin_payment_actions_payment_id_idx
  on public.admin_payment_actions (payment_id);

create index if not exists admin_payment_actions_created_at_idx
  on public.admin_payment_actions (created_at desc);

alter table public.admin_payment_actions enable row level security;

drop policy if exists "Admins can read admin payment actions" on public.admin_payment_actions;
create policy "Admins can read admin payment actions"
on public.admin_payment_actions for select
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);
