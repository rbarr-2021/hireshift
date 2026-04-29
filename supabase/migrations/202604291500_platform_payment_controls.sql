create table if not exists public.platform_payment_controls (
  id uuid primary key default gen_random_uuid(),
  payouts_enabled boolean not null default true,
  refunds_enabled boolean not null default true,
  admin_manual_release_required boolean not null default true,
  max_single_payout_gbp numeric(10,2),
  max_single_refund_gbp numeric(10,2),
  emergency_hold_enabled boolean not null default false,
  emergency_hold_reason text,
  test_mode_banner_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  updated_by uuid references public.users(id) on delete set null
);

create unique index if not exists platform_payment_controls_singleton_idx
  on public.platform_payment_controls ((true));

insert into public.platform_payment_controls (
  payouts_enabled,
  refunds_enabled,
  admin_manual_release_required,
  emergency_hold_enabled,
  test_mode_banner_enabled
)
select true, true, true, false, true
where not exists (
  select 1 from public.platform_payment_controls
);

alter table public.platform_payment_controls enable row level security;

drop policy if exists "Admins can read payment controls" on public.platform_payment_controls;
create policy "Admins can read payment controls"
on public.platform_payment_controls for select
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "Admins can update payment controls" on public.platform_payment_controls;
create policy "Admins can update payment controls"
on public.platform_payment_controls for update
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);
