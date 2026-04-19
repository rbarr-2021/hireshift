create or replace view public.marketplace_users as
select
  id,
  role,
  nullif(trim(display_name), '') as display_name
from public.users
where role_selected = true
  and role is not null;

grant select on public.marketplace_users to authenticated;
