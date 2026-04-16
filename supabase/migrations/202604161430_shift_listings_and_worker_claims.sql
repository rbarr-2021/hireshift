do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'shift_listing_status'
  ) then
    create type public.shift_listing_status as enum ('open', 'claimed', 'cancelled');
  end if;
end $$;

create table if not exists public.shift_listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.users(id) on delete cascade,
  role_label text not null,
  title text,
  description text,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  hourly_rate_gbp numeric(10,2) not null check (hourly_rate_gbp >= 0),
  location text not null,
  city text,
  status public.shift_listing_status not null default 'open',
  claimed_worker_id uuid references public.users(id) on delete set null,
  claimed_booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint shift_listings_time_order check (end_time > start_time),
  constraint shift_listings_distinct_claim check (claimed_worker_id is null or claimed_worker_id <> business_id)
);

alter table if exists public.shift_listings
  add column if not exists business_id uuid,
  add column if not exists role_label text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists shift_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists hourly_rate_gbp numeric(10,2),
  add column if not exists location text,
  add column if not exists city text,
  add column if not exists status public.shift_listing_status not null default 'open',
  add column if not exists claimed_worker_id uuid,
  add column if not exists claimed_booking_id uuid,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shift_listings_business_id_fkey'
      and conrelid = 'public.shift_listings'::regclass
  ) then
    alter table public.shift_listings
      add constraint shift_listings_business_id_fkey
      foreign key (business_id) references public.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shift_listings_claimed_worker_id_fkey'
      and conrelid = 'public.shift_listings'::regclass
  ) then
    alter table public.shift_listings
      add constraint shift_listings_claimed_worker_id_fkey
      foreign key (claimed_worker_id) references public.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shift_listings_claimed_booking_id_fkey'
      and conrelid = 'public.shift_listings'::regclass
  ) then
    alter table public.shift_listings
      add constraint shift_listings_claimed_booking_id_fkey
      foreign key (claimed_booking_id) references public.bookings(id) on delete set null;
  end if;
end $$;

create index if not exists shift_listings_business_idx on public.shift_listings (business_id);
create index if not exists shift_listings_status_idx on public.shift_listings (status);
create index if not exists shift_listings_shift_date_idx on public.shift_listings (shift_date);
create index if not exists shift_listings_role_label_idx on public.shift_listings (role_label);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pg_function_is_visible(oid)
  ) then
    drop trigger if exists shift_listings_set_updated_at on public.shift_listings;
    create trigger shift_listings_set_updated_at
    before update on public.shift_listings
    for each row execute procedure public.set_updated_at();
  end if;
end $$;

alter table public.shift_listings enable row level security;

drop policy if exists "Workers can browse open shift listings" on public.shift_listings;
create policy "Workers can browse open shift listings"
on public.shift_listings for select
using (
  (
    status = 'open'
    and exists (
      select 1
      from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'worker'
    )
  )
  or business_id = auth.uid()
  or claimed_worker_id = auth.uid()
);

drop policy if exists "Businesses can manage own shift listings" on public.shift_listings;
create policy "Businesses can manage own shift listings"
on public.shift_listings for all
using (business_id = auth.uid())
with check (business_id = auth.uid());

create or replace function public.claim_shift_listing(target_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_role public.user_role;
  is_shift_ready boolean;
  target_listing public.shift_listings%rowtype;
  next_booking_id uuid;
  duration_hours numeric;
  total_amount numeric;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select role, onboarding_complete
  into current_user_role, is_shift_ready
  from public.users
  where id = current_user_id;

  if current_user_role is distinct from 'worker' then
    raise exception 'Only workers can take shifts';
  end if;

  if coalesce(is_shift_ready, false) is not true then
    raise exception 'Complete your profile to take this shift';
  end if;

  if not exists (
    select 1
    from public.worker_profiles
    where user_id = current_user_id
  ) then
    raise exception 'Complete your worker profile before taking shifts';
  end if;

  select *
  into target_listing
  from public.shift_listings
  where id = target_listing_id
  for update;

  if not found then
    raise exception 'Shift not found';
  end if;

  if target_listing.status <> 'open' or target_listing.claimed_worker_id is not null then
    raise exception 'This shift is no longer available';
  end if;

  duration_hours :=
    extract(epoch from (target_listing.end_time - target_listing.start_time)) / 3600.0;

  if duration_hours <= 0 then
    raise exception 'Shift duration must be valid';
  end if;

  total_amount := round((duration_hours * target_listing.hourly_rate_gbp)::numeric, 2);

  insert into public.bookings (
    worker_id,
    business_id,
    shift_date,
    start_time,
    end_time,
    hourly_rate_gbp,
    location,
    notes,
    status,
    total_amount_gbp,
    platform_fee_gbp
  )
  values (
    current_user_id,
    target_listing.business_id,
    target_listing.shift_date,
    target_listing.start_time,
    target_listing.end_time,
    target_listing.hourly_rate_gbp,
    target_listing.location,
    target_listing.description,
    'accepted',
    total_amount,
    0
  )
  returning id into next_booking_id;

  update public.shift_listings
  set status = 'claimed',
      claimed_worker_id = current_user_id,
      claimed_booking_id = next_booking_id
  where id = target_listing_id;

  return next_booking_id;
end;
$$;

grant execute on function public.claim_shift_listing(uuid) to authenticated;
