create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'user_role'
  ) then
    create type public.user_role as enum ('worker', 'business');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'booking_status'
  ) then
    create type public.booking_status as enum (
      'pending',
      'accepted',
      'declined',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'payment_status'
  ) then
    create type public.payment_status as enum (
      'pending',
      'authorized',
      'captured',
      'released',
      'refunded',
      'failed'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'verification_status'
  ) then
    create type public.verification_status as enum (
      'pending',
      'verified',
      'rejected'
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role public.user_role,
  display_name text,
  phone text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.users
  add column if not exists id uuid,
  add column if not exists email text,
  add column if not exists role public.user_role,
  add column if not exists display_name text,
  add column if not exists phone text,
  add column if not exists onboarding_complete boolean not null default false,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_pkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users add primary key (id);
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'users_email_key'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_email_key;
  end if;
end $$;

create table if not exists public.worker_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  job_role text not null,
  bio text,
  skills text[] not null default '{}',
  hourly_rate_gbp numeric(10,2) not null check (hourly_rate_gbp >= 0),
  years_experience integer not null default 0 check (years_experience >= 0),
  city text not null,
  travel_radius_miles integer not null default 10 check (travel_radius_miles >= 0),
  availability_summary text,
  verification_status public.verification_status not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.worker_profiles
  add column if not exists user_id uuid,
  add column if not exists job_role text,
  add column if not exists bio text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists hourly_rate_gbp numeric(10,2),
  add column if not exists years_experience integer not null default 0,
  add column if not exists city text,
  add column if not exists travel_radius_miles integer not null default 10,
  add column if not exists availability_summary text,
  add column if not exists verification_status public.verification_status not null default 'pending',
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_profiles'
      and column_name = 'hourly_rate'
  ) then
    execute '
      update public.worker_profiles
      set hourly_rate_gbp = coalesce(hourly_rate_gbp, hourly_rate)
      where hourly_rate_gbp is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_profiles'
      and column_name = 'location'
  ) then
    execute '
      update public.worker_profiles
      set city = coalesce(city, location)
      where city is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_profiles'
      and column_name = 'name'
  ) then
    execute '
      update public.users
      set display_name = coalesce(public.users.display_name, wp.name)
      from public.worker_profiles wp
      where public.users.id = wp.user_id
        and public.users.display_name is null
        and wp.name is not null
    ';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_profiles_user_id_fkey'
      and conrelid = 'public.worker_profiles'::regclass
  ) then
    alter table public.worker_profiles
      add constraint worker_profiles_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

create table if not exists public.business_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  business_name text not null,
  sector text not null,
  contact_name text,
  phone text,
  address_line_1 text not null,
  city text not null,
  postcode text,
  description text,
  verification_status public.verification_status not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users(id) on delete restrict,
  business_id uuid not null references public.users(id) on delete restrict,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  hourly_rate_gbp numeric(10,2) not null check (hourly_rate_gbp >= 0),
  location text not null,
  notes text,
  status public.booking_status not null default 'pending',
  total_amount_gbp numeric(10,2) not null default 0 check (total_amount_gbp >= 0),
  platform_fee_gbp numeric(10,2) not null default 0 check (platform_fee_gbp >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint bookings_time_order check (end_time > start_time),
  constraint bookings_distinct_users check (worker_id <> business_id)
);

alter table if exists public.bookings
  add column if not exists id uuid,
  add column if not exists worker_id uuid,
  add column if not exists business_id uuid,
  add column if not exists shift_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists hourly_rate_gbp numeric(10,2),
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists status public.booking_status not null default 'pending',
  add column if not exists total_amount_gbp numeric(10,2) not null default 0,
  add column if not exists platform_fee_gbp numeric(10,2) not null default 0,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'date'
  ) then
    execute '
      update public.bookings
      set shift_date = coalesce(shift_date, date)
      where shift_date is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'time'
  ) then
    execute '
      update public.bookings
      set start_time = coalesce(start_time, time)
      where start_time is null
    ';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_worker_id_fkey'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_worker_id_fkey
      foreign key (worker_id) references public.users(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_business_id_fkey'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_business_id_fkey
      foreign key (business_id) references public.users(id) on delete restrict;
  end if;
end $$;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  reviewer_user_id uuid not null references public.users(id) on delete cascade,
  reviewee_user_id uuid not null references public.users(id) on delete cascade,
  punctuality_rating integer not null check (punctuality_rating between 1 and 5),
  skill_rating integer not null check (skill_rating between 1 and 5),
  attitude_rating integer not null check (attitude_rating between 1 and 5),
  reliability_rating integer not null check (reliability_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint reviews_distinct_users check (reviewer_user_id <> reviewee_user_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'reviewer_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'reviewer_user_id'
  ) then
    alter table public.reviews rename column reviewer_id to reviewer_user_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'reviewee_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'reviewee_user_id'
  ) then
    alter table public.reviews rename column reviewee_id to reviewee_user_id;
  end if;
end $$;

alter table if exists public.reviews
  add column if not exists reviewer_user_id uuid,
  add column if not exists reviewee_user_id uuid,
  add column if not exists comment text,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_booking_id_fkey'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_reviewer_user_id_fkey'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_reviewer_user_id_fkey
      foreign key (reviewer_user_id) references public.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_reviewee_user_id_fkey'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_reviewee_user_id_fkey
      foreign key (reviewee_user_id) references public.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_distinct_users'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_distinct_users
      check (reviewer_user_id <> reviewee_user_id);
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  business_id uuid not null references public.users(id) on delete restrict,
  worker_id uuid not null references public.users(id) on delete restrict,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  currency text not null default 'GBP',
  gross_amount_gbp numeric(10,2) not null check (gross_amount_gbp >= 0),
  platform_fee_gbp numeric(10,2) not null default 0 check (platform_fee_gbp >= 0),
  worker_payout_gbp numeric(10,2) not null default 0 check (worker_payout_gbp >= 0),
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.payments
  add column if not exists booking_id uuid,
  add column if not exists business_id uuid,
  add column if not exists worker_id uuid,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists currency text not null default 'GBP',
  add column if not exists gross_amount_gbp numeric(10,2),
  add column if not exists platform_fee_gbp numeric(10,2) not null default 0,
  add column if not exists worker_payout_gbp numeric(10,2) not null default 0,
  add column if not exists status public.payment_status not null default 'pending',
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_booking_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_business_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_business_id_fkey
      foreign key (business_id) references public.users(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_worker_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_worker_id_fkey
      foreign key (worker_id) references public.users(id) on delete restrict;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_display_name text := nullif(
    coalesce(
      metadata->>'display_name',
      metadata->>'full_name',
      metadata->>'name'
    ),
    ''
  );
  next_phone text := nullif(metadata->>'phone', '');
begin
  insert into public.users (
    id,
    email,
    display_name,
    phone,
    onboarding_complete
  )
  values (
    new.id,
    new.email,
    next_display_name,
    next_phone,
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.users.display_name, excluded.display_name),
        phone = coalesce(public.users.phone, excluded.phone),
        updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

drop trigger if exists worker_profiles_set_updated_at on public.worker_profiles;
create trigger worker_profiles_set_updated_at
before update on public.worker_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists business_profiles_set_updated_at on public.business_profiles;
create trigger business_profiles_set_updated_at
before update on public.business_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute procedure public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute procedure public.set_updated_at();

alter table public.users enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.business_profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Users can read own account" on public.users;
create policy "Users can read own account"
on public.users for select
using (auth.uid() = id);

drop policy if exists "Users can update own account" on public.users;
create policy "Users can update own account"
on public.users for update
using (auth.uid() = id);

drop policy if exists "Workers are publicly visible" on public.worker_profiles;
create policy "Workers are publicly visible"
on public.worker_profiles for select
using (true);

drop policy if exists "Workers can manage own profile" on public.worker_profiles;
create policy "Workers can manage own profile"
on public.worker_profiles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Businesses can read own profile" on public.business_profiles;
create policy "Businesses can read own profile"
on public.business_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Businesses can manage own profile" on public.business_profiles;
create policy "Businesses can manage own profile"
on public.business_profiles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Booking participants can read bookings" on public.bookings;
create policy "Booking participants can read bookings"
on public.bookings for select
using (auth.uid() = worker_id or auth.uid() = business_id);

drop policy if exists "Businesses can create bookings" on public.bookings;
create policy "Businesses can create bookings"
on public.bookings for insert
with check (auth.uid() = business_id);

drop policy if exists "Booking participants can update bookings" on public.bookings;
create policy "Booking participants can update bookings"
on public.bookings for update
using (auth.uid() = worker_id or auth.uid() = business_id);

drop policy if exists "Booking participants can read reviews" on public.reviews;
create policy "Booking participants can read reviews"
on public.reviews for select
using (
  exists (
    select 1
    from public.bookings
    where public.bookings.id = booking_id
      and (public.bookings.worker_id = auth.uid() or public.bookings.business_id = auth.uid())
  )
);

drop policy if exists "Booking participants can create reviews" on public.reviews;
create policy "Booking participants can create reviews"
on public.reviews for insert
with check (
  auth.uid() = reviewer_user_id
  and exists (
    select 1
    from public.bookings
    where public.bookings.id = booking_id
      and (public.bookings.worker_id = auth.uid() or public.bookings.business_id = auth.uid())
  )
);

drop policy if exists "Payment participants can read payments" on public.payments;
create policy "Payment participants can read payments"
on public.payments for select
using (auth.uid() = worker_id or auth.uid() = business_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_profiles'
      and column_name = 'city'
  ) then
    create index if not exists worker_profiles_city_idx on public.worker_profiles (city);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_profiles'
      and column_name = 'job_role'
  ) then
    create index if not exists worker_profiles_job_role_idx on public.worker_profiles (job_role);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_profiles'
      and column_name = 'hourly_rate_gbp'
  ) then
    create index if not exists worker_profiles_rate_idx on public.worker_profiles (hourly_rate_gbp);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'worker_id'
  ) then
    create index if not exists bookings_worker_idx on public.bookings (worker_id);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'business_id'
  ) then
    create index if not exists bookings_business_idx on public.bookings (business_id);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'shift_date'
  ) then
    create index if not exists bookings_shift_date_idx on public.bookings (shift_date);
  end if;
end $$;
