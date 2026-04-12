alter table if exists public.users
  add column if not exists role_selected boolean not null default false;

update public.users
set role_selected = true
where role_selected = false
  and (
    onboarding_complete = true
    or exists (
      select 1
      from public.worker_profiles
      where public.worker_profiles.user_id = public.users.id
    )
    or exists (
      select 1
      from public.business_profiles
      where public.business_profiles.user_id = public.users.id
    )
    or role = 'business'
  );

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
    role,
    role_selected,
    display_name,
    phone,
    onboarding_complete
  )
  values (
    new.id,
    new.email,
    'worker',
    false,
    next_display_name,
    next_phone,
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        role = coalesce(public.users.role, excluded.role),
        role_selected = coalesce(public.users.role_selected, false),
        display_name = coalesce(public.users.display_name, excluded.display_name),
        phone = coalesce(public.users.phone, excluded.phone),
        updated_at = timezone('utc'::text, now());
  return new;
end;
$$;
