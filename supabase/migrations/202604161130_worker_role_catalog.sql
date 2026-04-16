create table if not exists public.role_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.role_categories(id) on delete restrict,
  slug text not null unique,
  label text not null,
  search_terms text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table if exists public.worker_profiles
  add column if not exists primary_role_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_profiles_primary_role_id_fkey'
      and conrelid = 'public.worker_profiles'::regclass
  ) then
    alter table public.worker_profiles
      add constraint worker_profiles_primary_role_id_fkey
      foreign key (primary_role_id) references public.roles(id) on delete set null;
  end if;
end $$;

create table if not exists public.worker_roles (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (worker_id, role_id)
);

create index if not exists roles_category_id_idx on public.roles (category_id);
create index if not exists worker_profiles_primary_role_id_idx on public.worker_profiles (primary_role_id);
create index if not exists worker_roles_role_id_idx on public.worker_roles (role_id);
create unique index if not exists worker_roles_single_primary_idx
  on public.worker_roles (worker_id)
  where is_primary;

with category_seed (slug, label, sort_order) as (
  values
    ('back-of-house', 'Back of House', 1),
    ('front-of-house', 'Front of House', 2),
    ('bar', 'Bar', 3),
    ('management', 'Management', 4),
    ('events-support', 'Events / Support', 5)
)
insert into public.role_categories (slug, label, sort_order, is_active)
select slug, label, sort_order, true
from category_seed
on conflict (slug) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

with role_seed (category_slug, slug, label, search_terms, sort_order) as (
  values
    ('back-of-house', 'chef', 'Chef', array['kitchen', 'cook', 'line chef']::text[], 1),
    ('back-of-house', 'kitchen-porter', 'Kitchen Porter', array['kp', 'kitchen assistant', 'porter']::text[], 2),
    ('back-of-house', 'commis-chef', 'Commis Chef', array['junior chef', 'commis']::text[], 3),
    ('back-of-house', 'demi-chef-de-partie', 'Demi Chef de Partie', array['demi cdp', 'chef de partie']::text[], 4),
    ('back-of-house', 'chef-de-partie', 'Chef de Partie', array['cdp', 'section chef']::text[], 5),
    ('back-of-house', 'senior-chef-de-partie', 'Senior Chef de Partie', array['senior cdp', 'lead cdp']::text[], 6),
    ('back-of-house', 'junior-sous-chef', 'Junior Sous Chef', array['junior sous', 'jr sous']::text[], 7),
    ('back-of-house', 'sous-chef', 'Sous Chef', array['sous']::text[], 8),
    ('back-of-house', 'head-chef', 'Head Chef', array['lead chef', 'kitchen lead']::text[], 9),
    ('back-of-house', 'executive-head-chef', 'Executive Head Chef', array['exec chef', 'executive chef']::text[], 10),
    ('back-of-house', 'pastry-chef', 'Pastry Chef', array['dessert', 'pastry']::text[], 11),
    ('back-of-house', 'breakfast-chef', 'Breakfast Chef', array['morning chef', 'brunch chef']::text[], 12),
    ('back-of-house', 'prep-chef', 'Prep Chef', array['preparation', 'prep']::text[], 13),
    ('back-of-house', 'grill-chef', 'Grill Chef', array['grill', 'chargrill']::text[], 14),
    ('back-of-house', 'pizza-chef', 'Pizza Chef', array['pizzaiolo', 'pizza']::text[], 15),
    ('front-of-house', 'server', 'Server', array['wait staff', 'serving']::text[], 1),
    ('front-of-house', 'food-runner', 'Food Runner', array['runner', 'food service']::text[], 2),
    ('front-of-house', 'waiter', 'Waiter', array['server', 'front of house']::text[], 3),
    ('front-of-house', 'waitress', 'Waitress', array['server', 'front of house']::text[], 4),
    ('front-of-house', 'senior-waiter', 'Senior Waiter', array['head waiter', 'lead server']::text[], 5),
    ('front-of-house', 'host', 'Host', array['reception', 'greeter']::text[], 6),
    ('front-of-house', 'hostess', 'Hostess', array['reception', 'greeter']::text[], 7),
    ('front-of-house', 'front-of-house-supervisor', 'Front of House Supervisor', array['foh supervisor', 'floor supervisor']::text[], 8),
    ('front-of-house', 'supervisor', 'Supervisor', array['floor supervisor', 'service supervisor']::text[], 9),
    ('front-of-house', 'barista', 'Barista', array['coffee', 'espresso']::text[], 10),
    ('bar', 'bartender', 'Bartender', array['bar staff', 'mixology']::text[], 1),
    ('bar', 'cocktail-bartender', 'Cocktail Bartender', array['mixologist', 'cocktail']::text[], 2),
    ('bar', 'senior-bartender', 'Senior Bartender', array['lead bartender', 'bar lead']::text[], 3),
    ('bar', 'bar-supervisor', 'Bar Supervisor', array['bar lead', 'supervisor']::text[], 4),
    ('bar', 'bar-manager', 'Bar Manager', array['bar operations', 'manager']::text[], 5),
    ('management', 'assistant-manager', 'Assistant Manager', array['assistant gm', 'deputy manager']::text[], 1),
    ('management', 'duty-manager', 'Duty Manager', array['shift manager', 'duty']::text[], 2),
    ('management', 'restaurant-manager', 'Restaurant Manager', array['rm', 'operations manager']::text[], 3),
    ('management', 'general-manager', 'General Manager', array['gm', 'venue manager']::text[], 4),
    ('events-support', 'event-staff', 'Event Staff', array['events', 'festival staff']::text[], 1),
    ('events-support', 'porter', 'Porter', array['support', 'portering']::text[], 2),
    ('events-support', 'runner', 'Runner', array['general runner', 'support runner']::text[], 3),
    ('events-support', 'catering-assistant', 'Catering Assistant', array['catering', 'assistant']::text[], 4)
)
insert into public.roles (category_id, slug, label, search_terms, sort_order, is_active)
select
  category.id,
  role_seed.slug,
  role_seed.label,
  role_seed.search_terms,
  role_seed.sort_order,
  true
from role_seed
join public.role_categories as category
  on category.slug = role_seed.category_slug
on conflict (slug) do update
set category_id = excluded.category_id,
    label = excluded.label,
    search_terms = excluded.search_terms,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

update public.worker_profiles as profile
set primary_role_id = role_match.id
from public.roles as role_match
where profile.primary_role_id is null
  and lower(profile.job_role) = lower(role_match.label);

insert into public.worker_roles (worker_id, role_id, is_primary)
select profile.user_id, profile.primary_role_id, true
from public.worker_profiles as profile
where profile.primary_role_id is not null
on conflict (worker_id, role_id) do update
set is_primary = excluded.is_primary;

alter table public.role_categories enable row level security;
alter table public.roles enable row level security;
alter table public.worker_roles enable row level security;

drop policy if exists "Role categories are publicly visible" on public.role_categories;
create policy "Role categories are publicly visible"
on public.role_categories for select
using (true);

drop policy if exists "Roles are publicly visible" on public.roles;
create policy "Roles are publicly visible"
on public.roles for select
using (true);

drop policy if exists "Worker roles are publicly visible" on public.worker_roles;
create policy "Worker roles are publicly visible"
on public.worker_roles for select
using (true);

drop policy if exists "Workers can manage own role selections" on public.worker_roles;
create policy "Workers can manage own role selections"
on public.worker_roles for all
using (auth.uid() = worker_id)
with check (auth.uid() = worker_id);
