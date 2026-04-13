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

alter table if exists public.business_profiles
  add column if not exists user_id uuid,
  add column if not exists business_name text,
  add column if not exists sector text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists address_line_1 text,
  add column if not exists city text,
  add column if not exists postcode text,
  add column if not exists description text,
  add column if not exists verification_status public.verification_status not null default 'pending',
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_profiles'
      and column_name = 'address'
  ) then
    execute '
      update public.business_profiles
      set address_line_1 = coalesce(address_line_1, address)
      where address_line_1 is null
        and address is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_profiles'
      and column_name = 'business_type'
  ) then
    execute '
      update public.business_profiles
      set sector = coalesce(sector, business_type)
      where sector is null
        and business_type is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_profiles'
      and column_name = 'name'
  ) then
    execute '
      update public.business_profiles
      set business_name = coalesce(business_name, name)
      where business_name is null
        and name is not null
    ';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_profiles_pkey'
      and conrelid = 'public.business_profiles'::regclass
  ) and not exists (
    select user_id
    from public.business_profiles
    group by user_id
    having count(*) > 1
  ) then
    alter table public.business_profiles
      add constraint business_profiles_pkey primary key (user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_profiles_user_id_fkey'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class
    where relname = 'set_updated_at'
      and relnamespace = 'public'::regnamespace
  ) then
    drop trigger if exists business_profiles_set_updated_at on public.business_profiles;
    create trigger business_profiles_set_updated_at
    before update on public.business_profiles
    for each row execute procedure public.set_updated_at();
  end if;
end $$;
