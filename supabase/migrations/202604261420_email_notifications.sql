create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (
    type in (
      'booking_confirmed_worker',
      'booking_confirmed_business',
      'shift_reminder_24h_worker',
      'shift_reminder_24h_business',
      'payment_received_worker'
    )
  ),
  recipient_email text not null,
  booking_id uuid null references public.bookings(id) on delete cascade,
  user_id uuid null references public.users(id) on delete set null,
  provider_message_id text null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists email_notifications_type_recipient_booking_unique
  on public.email_notifications (type, recipient_email, booking_id)
  where booking_id is not null;

create unique index if not exists email_notifications_type_recipient_unique
  on public.email_notifications (type, recipient_email)
  where booking_id is null;

create index if not exists email_notifications_booking_idx
  on public.email_notifications (booking_id);

create index if not exists email_notifications_user_idx
  on public.email_notifications (user_id);

alter table public.email_notifications enable row level security;

drop policy if exists "Users can read own email notifications" on public.email_notifications;
create policy "Users can read own email notifications"
on public.email_notifications
for select
to authenticated
using (user_id = auth.uid());
