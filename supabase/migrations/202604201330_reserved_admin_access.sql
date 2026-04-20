create table if not exists public.admin_users (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can read own admin access" on public.admin_users;
create policy "Admins can read own admin access"
on public.admin_users for select
using (auth.uid() = user_id);

create or replace function public.sync_reserved_admin_access()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.email, '')) = 'admin@gmail.com' then
    insert into public.admin_users (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  else
    delete from public.admin_users
    where user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists users_sync_reserved_admin_access on public.users;
create trigger users_sync_reserved_admin_access
after insert or update of email on public.users
for each row
execute function public.sync_reserved_admin_access();

insert into public.admin_users (user_id)
select id
from public.users
where lower(coalesce(email, '')) = 'admin@gmail.com'
on conflict (user_id) do nothing;

delete from public.admin_users
where user_id not in (
  select id
  from public.users
  where lower(coalesce(email, '')) = 'admin@gmail.com'
);
