do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'notification_job_type'
  ) then
    create type public.notification_job_type as enum (
      'booking_confirmation',
      'booking_reminder_24h'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'notification_job_channel'
  ) then
    create type public.notification_job_channel as enum (
      'whatsapp'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'notification_job_status'
  ) then
    create type public.notification_job_status as enum (
      'pending',
      'processing',
      'sent',
      'skipped',
      'failed',
      'cancelled'
    );
  end if;
end $$;

alter table if exists public.users
  add column if not exists whatsapp_opt_in boolean not null default false;

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  job_type public.notification_job_type not null,
  channel public.notification_job_channel not null default 'whatsapp',
  status public.notification_job_status not null default 'pending',
  scheduled_for timestamptz not null,
  locked_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.notification_jobs
  add column if not exists booking_id uuid,
  add column if not exists recipient_user_id uuid,
  add column if not exists job_type public.notification_job_type,
  add column if not exists channel public.notification_job_channel not null default 'whatsapp',
  add column if not exists status public.notification_job_status not null default 'pending',
  add column if not exists scheduled_for timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_jobs_booking_id_fkey'
      and conrelid = 'public.notification_jobs'::regclass
  ) then
    alter table public.notification_jobs
      add constraint notification_jobs_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_jobs_recipient_user_id_fkey'
      and conrelid = 'public.notification_jobs'::regclass
  ) then
    alter table public.notification_jobs
      add constraint notification_jobs_recipient_user_id_fkey
      foreign key (recipient_user_id) references public.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists notification_jobs_unique_booking_channel_type_idx
  on public.notification_jobs (booking_id, recipient_user_id, job_type, channel);

create index if not exists notification_jobs_due_idx
  on public.notification_jobs (status, scheduled_for);

create index if not exists notification_jobs_booking_idx
  on public.notification_jobs (booking_id);

create index if not exists notification_jobs_recipient_idx
  on public.notification_jobs (recipient_user_id);

drop trigger if exists notification_jobs_set_updated_at on public.notification_jobs;
create trigger notification_jobs_set_updated_at
before update on public.notification_jobs
for each row execute procedure public.set_updated_at();

alter table public.notification_jobs enable row level security;

create or replace function public.enqueue_notification_job(
  target_booking_id uuid,
  target_recipient_user_id uuid,
  target_job_type public.notification_job_type,
  target_scheduled_for timestamptz,
  target_metadata jsonb default '{}'::jsonb
)
returns public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  next_job public.notification_jobs;
begin
  insert into public.notification_jobs (
    booking_id,
    recipient_user_id,
    job_type,
    channel,
    status,
    scheduled_for,
    locked_at,
    processed_at,
    last_error,
    metadata
  )
  values (
    target_booking_id,
    target_recipient_user_id,
    target_job_type,
    'whatsapp',
    'pending',
    target_scheduled_for,
    null,
    null,
    null,
    coalesce(target_metadata, '{}'::jsonb)
  )
  on conflict (booking_id, recipient_user_id, job_type, channel)
  do update
    set scheduled_for = excluded.scheduled_for,
        metadata = coalesce(public.notification_jobs.metadata, '{}'::jsonb) || excluded.metadata,
        status = case
          when public.notification_jobs.status = 'sent' then public.notification_jobs.status
          when public.notification_jobs.status = 'skipped' then public.notification_jobs.status
          else 'pending'::public.notification_job_status
        end,
        locked_at = case
          when public.notification_jobs.status in ('sent', 'skipped') then public.notification_jobs.locked_at
          else null
        end,
        processed_at = case
          when public.notification_jobs.status in ('sent', 'skipped') then public.notification_jobs.processed_at
          else null
        end,
        last_error = case
          when public.notification_jobs.status in ('sent', 'skipped') then public.notification_jobs.last_error
          else null
        end;

  select *
  into next_job
  from public.notification_jobs
  where booking_id = target_booking_id
    and recipient_user_id = target_recipient_user_id
    and job_type = target_job_type
    and channel = 'whatsapp';

  return next_job;
end;
$$;

create or replace function public.cancel_pending_booking_reminder_jobs(target_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_jobs
  set status = 'cancelled',
      processed_at = timezone('utc'::text, now()),
      locked_at = null,
      last_error = null
  where booking_id = target_booking_id
    and job_type = 'booking_reminder_24h'
    and status in ('pending', 'failed');
end;
$$;

create or replace function public.sync_booking_notification_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_start timestamptz;
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    shift_start := (new.shift_date::text || ' ' || new.start_time::text)::timestamptz;

    perform public.enqueue_notification_job(
      new.id,
      new.worker_id,
      'booking_confirmation',
      timezone('utc'::text, now()),
      jsonb_build_object('source_status', new.status)
    );

    perform public.enqueue_notification_job(
      new.id,
      new.worker_id,
      'booking_reminder_24h',
      shift_start - interval '24 hours',
      jsonb_build_object('source_status', new.status, 'shift_start', shift_start)
    );
  end if;

  if new.status = 'cancelled' and (tg_op = 'UPDATE' and old.status is distinct from 'cancelled') then
    perform public.cancel_pending_booking_reminder_jobs(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_notification_jobs on public.bookings;
create trigger bookings_sync_notification_jobs
after insert or update of status on public.bookings
for each row execute procedure public.sync_booking_notification_jobs();

grant execute on function public.enqueue_notification_job(uuid, uuid, public.notification_job_type, timestamptz, jsonb) to authenticated;
grant execute on function public.cancel_pending_booking_reminder_jobs(uuid) to authenticated;
