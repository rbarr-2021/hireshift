create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null references public.bookings(id) on delete set null,
  sender_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid null references public.users(id) on delete set null,
  recipient_role text null check (recipient_role in ('worker', 'business', 'admin')),
  sender_role text not null check (sender_role in ('worker', 'business', 'admin')),
  subject text null,
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'read')),
  read_at timestamptz null,
  email_notification_status text not null default 'pending' check (
    email_notification_status in ('pending', 'sent', 'failed', 'skipped')
  ),
  whatsapp_notification_status text not null default 'not_configured' check (
    whatsapp_notification_status in ('not_configured', 'pending_future')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists messages_sender_id_idx
  on public.messages(sender_id);
create index if not exists messages_recipient_id_idx
  on public.messages(recipient_id);
create index if not exists messages_booking_id_idx
  on public.messages(booking_id);
create index if not exists messages_recipient_role_idx
  on public.messages(recipient_role);
create index if not exists messages_created_at_idx
  on public.messages(created_at desc);
create index if not exists messages_read_at_idx
  on public.messages(read_at);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row
execute function public.set_updated_at();

alter table public.messages enable row level security;

drop policy if exists "messages_select_sender_or_recipient_or_admin" on public.messages;
create policy "messages_select_sender_or_recipient_or_admin"
on public.messages
for select
to authenticated
using (
  sender_id = auth.uid()
  or recipient_id = auth.uid()
  or exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  )
);

drop policy if exists "messages_insert_sender_or_admin" on public.messages;
create policy "messages_insert_sender_or_admin"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  or exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  )
);

drop policy if exists "messages_update_recipient_or_admin" on public.messages;
create policy "messages_update_recipient_or_admin"
on public.messages
for update
to authenticated
using (
  recipient_id = auth.uid()
  or exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  )
)
with check (
  recipient_id = auth.uid()
  or exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  )
);
