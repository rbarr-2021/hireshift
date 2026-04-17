alter type public.booking_status add value if not exists 'no_show';

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'worker_reliability_status'
  ) then
    create type public.worker_reliability_status as enum (
      'good_standing',
      'warned',
      'temporarily_blocked'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'worker_reliability_event_type'
  ) then
    create type public.worker_reliability_event_type as enum (
      'completed',
      'cancelled_early',
      'cancelled_late',
      'no_show',
      'strike_applied',
      'block_applied'
    );
  end if;
end $$;

create table if not exists public.worker_reliability (
  worker_id uuid primary key references public.users(id) on delete cascade,
  active_strikes integer not null default 0 check (active_strikes >= 0),
  reliability_status public.worker_reliability_status not null default 'good_standing',
  blocked_until timestamptz,
  late_cancellations_count integer not null default 0 check (late_cancellations_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  completed_shifts_count integer not null default 0 check (completed_shifts_count >= 0),
  last_event_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.worker_reliability
  add column if not exists worker_id uuid,
  add column if not exists active_strikes integer not null default 0,
  add column if not exists reliability_status public.worker_reliability_status not null default 'good_standing',
  add column if not exists blocked_until timestamptz,
  add column if not exists late_cancellations_count integer not null default 0,
  add column if not exists no_show_count integer not null default 0,
  add column if not exists completed_shifts_count integer not null default 0,
  add column if not exists last_event_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_reliability_pkey'
      and conrelid = 'public.worker_reliability'::regclass
  ) then
    alter table public.worker_reliability
      add constraint worker_reliability_pkey primary key (worker_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_reliability_worker_id_fkey'
      and conrelid = 'public.worker_reliability'::regclass
  ) then
    alter table public.worker_reliability
      add constraint worker_reliability_worker_id_fkey
      foreign key (worker_id) references public.users(id) on delete cascade;
  end if;
end $$;

create table if not exists public.worker_reliability_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  event_type public.worker_reliability_event_type not null,
  strike_value integer not null default 0,
  occurred_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.worker_reliability_events
  add column if not exists worker_id uuid,
  add column if not exists booking_id uuid,
  add column if not exists event_type public.worker_reliability_event_type,
  add column if not exists strike_value integer not null default 0,
  add column if not exists occurred_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_reliability_events_worker_id_fkey'
      and conrelid = 'public.worker_reliability_events'::regclass
  ) then
    alter table public.worker_reliability_events
      add constraint worker_reliability_events_worker_id_fkey
      foreign key (worker_id) references public.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_reliability_events_booking_id_fkey'
      and conrelid = 'public.worker_reliability_events'::regclass
  ) then
    alter table public.worker_reliability_events
      add constraint worker_reliability_events_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete set null;
  end if;
end $$;

insert into public.worker_reliability (worker_id)
select id
from public.users
where role = 'worker'
on conflict (worker_id) do nothing;

create index if not exists worker_reliability_events_worker_idx
  on public.worker_reliability_events (worker_id, occurred_at desc);
create index if not exists worker_reliability_events_booking_idx
  on public.worker_reliability_events (booking_id);
create index if not exists worker_reliability_blocked_until_idx
  on public.worker_reliability (blocked_until);

drop trigger if exists worker_reliability_set_updated_at on public.worker_reliability;
create trigger worker_reliability_set_updated_at
before update on public.worker_reliability
for each row execute procedure public.set_updated_at();

alter table public.worker_reliability enable row level security;
alter table public.worker_reliability_events enable row level security;

drop policy if exists "Workers can read own reliability" on public.worker_reliability;
create policy "Workers can read own reliability"
on public.worker_reliability for select
using (auth.uid() = worker_id);

drop policy if exists "Workers can read own reliability events" on public.worker_reliability_events;
create policy "Workers can read own reliability events"
on public.worker_reliability_events for select
using (auth.uid() = worker_id);

create or replace function public.ensure_worker_reliability_row(target_worker_id uuid)
returns public.worker_reliability
language plpgsql
security definer
set search_path = public
as $$
declare
  next_summary public.worker_reliability;
begin
  insert into public.worker_reliability (worker_id)
  values (target_worker_id)
  on conflict (worker_id) do nothing;

  select *
  into next_summary
  from public.worker_reliability
  where worker_id = target_worker_id;

  return next_summary;
end;
$$;

create or replace function public.refresh_worker_reliability_status(target_worker_id uuid)
returns public.worker_reliability
language plpgsql
security definer
set search_path = public
as $$
declare
  next_summary public.worker_reliability;
begin
  perform public.ensure_worker_reliability_row(target_worker_id);

  update public.worker_reliability
  set reliability_status = case
        when blocked_until is not null and blocked_until > timezone('utc'::text, now()) then 'temporarily_blocked'::public.worker_reliability_status
        when active_strikes >= 1 then 'warned'::public.worker_reliability_status
        else 'good_standing'::public.worker_reliability_status
      end
  where worker_id = target_worker_id;

  select *
  into next_summary
  from public.worker_reliability
  where worker_id = target_worker_id;

  return next_summary;
end;
$$;

create or replace function public.record_worker_reliability_event(
  target_worker_id uuid,
  target_booking_id uuid,
  target_event_type public.worker_reliability_event_type,
  strike_delta integer default 0,
  event_metadata jsonb default '{}'::jsonb,
  event_time timestamptz default timezone('utc'::text, now())
)
returns public.worker_reliability
language plpgsql
security definer
set search_path = public
as $$
declare
  current_summary public.worker_reliability;
  next_summary public.worker_reliability;
  next_blocked_until timestamptz;
  block_duration interval := interval '7 days';
  block_threshold integer := 3;
begin
  current_summary := public.ensure_worker_reliability_row(target_worker_id);

  insert into public.worker_reliability_events (
    worker_id,
    booking_id,
    event_type,
    strike_value,
    occurred_at,
    metadata
  )
  values (
    target_worker_id,
    target_booking_id,
    target_event_type,
    strike_delta,
    event_time,
    coalesce(event_metadata, '{}'::jsonb)
  );

  if strike_delta > 0 then
    insert into public.worker_reliability_events (
      worker_id,
      booking_id,
      event_type,
      strike_value,
      occurred_at,
      metadata
    )
    values (
      target_worker_id,
      target_booking_id,
      'strike_applied',
      strike_delta,
      event_time,
      jsonb_build_object('source_event', target_event_type)
    );
  end if;

  next_blocked_until := current_summary.blocked_until;

  if current_summary.active_strikes + greatest(strike_delta, 0) >= block_threshold then
    next_blocked_until := greatest(coalesce(current_summary.blocked_until, event_time), event_time) + block_duration;
  end if;

  update public.worker_reliability
  set active_strikes = greatest(0, active_strikes + greatest(strike_delta, 0)),
      late_cancellations_count = late_cancellations_count + case when target_event_type = 'cancelled_late' then 1 else 0 end,
      no_show_count = no_show_count + case when target_event_type = 'no_show' then 1 else 0 end,
      completed_shifts_count = completed_shifts_count + case when target_event_type = 'completed' then 1 else 0 end,
      blocked_until = next_blocked_until,
      last_event_at = event_time
  where worker_id = target_worker_id;

  if next_blocked_until is not null and (current_summary.blocked_until is null or next_blocked_until > current_summary.blocked_until) then
    insert into public.worker_reliability_events (
      worker_id,
      booking_id,
      event_type,
      strike_value,
      occurred_at,
      metadata
    )
    values (
      target_worker_id,
      target_booking_id,
      'block_applied',
      0,
      event_time,
      jsonb_build_object('blocked_until', next_blocked_until, 'source_event', target_event_type)
    );
  end if;

  next_summary := public.refresh_worker_reliability_status(target_worker_id);
  return next_summary;
end;
$$;

create or replace function public.ensure_worker_can_take_shifts(target_worker_id uuid)
returns public.worker_reliability
language plpgsql
security definer
set search_path = public
as $$
declare
  next_summary public.worker_reliability;
begin
  next_summary := public.refresh_worker_reliability_status(target_worker_id);

  if next_summary.blocked_until is not null and next_summary.blocked_until > timezone('utc'::text, now()) then
    raise exception 'You are temporarily unable to take new shifts until %', next_summary.blocked_until;
  end if;

  return next_summary;
end;
$$;

create or replace function public.worker_cancel_booking(target_booking_id uuid)
returns public.booking_status
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_booking public.bookings%rowtype;
  shift_start timestamptz;
  strike_delta integer := 0;
  next_event_type public.worker_reliability_event_type := 'cancelled_early';
  next_claimed_positions integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_booking
  from public.bookings
  where id = target_booking_id
    and worker_id = current_user_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if target_booking.status <> 'accepted' then
    raise exception 'Only accepted bookings can be cancelled here';
  end if;

  shift_start := (target_booking.shift_date::text || ' ' || target_booking.start_time::text)::timestamptz;

  if shift_start - timezone('utc'::text, now()) < interval '24 hours' then
    next_event_type := 'cancelled_late';
    strike_delta := 1;
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = target_booking_id;

  if target_booking.shift_listing_id is not null then
    update public.shift_listings
    set claimed_positions = greatest(coalesce(claimed_positions, 0) - 1, 0),
        status = 'open'::public.shift_listing_status,
        claimed_worker_id = case
          when claimed_worker_id = current_user_id and greatest(coalesce(claimed_positions, 0) - 1, 0) = 0 then null
          else claimed_worker_id
        end,
        claimed_booking_id = case
          when claimed_booking_id = target_booking_id and greatest(coalesce(claimed_positions, 0) - 1, 0) = 0 then null
          else claimed_booking_id
        end
    where id = target_booking.shift_listing_id
      and status in ('open', 'claimed');
  end if;

  perform public.record_worker_reliability_event(
    current_user_id,
    target_booking_id,
    next_event_type,
    strike_delta,
    jsonb_build_object('cancelled_at', timezone('utc'::text, now()))
  );

  return 'cancelled'::public.booking_status;
end;
$$;

create or replace function public.respond_to_booking_request(
  target_booking_id uuid,
  next_status public.booking_status
)
returns public.booking_status
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_booking public.bookings%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('accepted', 'declined') then
    raise exception 'Unsupported booking response';
  end if;

  select *
  into target_booking
  from public.bookings
  where id = target_booking_id
    and worker_id = current_user_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if target_booking.status <> 'pending' then
    raise exception 'Only pending bookings can be updated here';
  end if;

  if next_status = 'accepted' then
    perform public.ensure_worker_can_take_shifts(current_user_id);
  end if;

  update public.bookings
  set status = next_status
  where id = target_booking_id;

  return next_status;
end;
$$;

create or replace function public.business_record_booking_outcome(
  target_booking_id uuid,
  outcome public.booking_status
)
returns public.booking_status
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_booking public.bookings%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if outcome not in ('completed', 'no_show') then
    raise exception 'Unsupported booking outcome';
  end if;

  select *
  into target_booking
  from public.bookings
  where id = target_booking_id
    and business_id = current_user_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if target_booking.status <> 'accepted' then
    raise exception 'Only accepted bookings can be marked completed or no-show';
  end if;

  update public.bookings
  set status = outcome
  where id = target_booking_id;

  if outcome = 'completed' then
    perform public.record_worker_reliability_event(
      target_booking.worker_id,
      target_booking_id,
      'completed',
      0,
      jsonb_build_object('recorded_by', current_user_id)
    );
  else
    perform public.record_worker_reliability_event(
      target_booking.worker_id,
      target_booking_id,
      'no_show',
      2,
      jsonb_build_object('recorded_by', current_user_id)
    );
  end if;

  return outcome;
end;
$$;

grant execute on function public.ensure_worker_reliability_row(uuid) to authenticated;
grant execute on function public.refresh_worker_reliability_status(uuid) to authenticated;
grant execute on function public.record_worker_reliability_event(uuid, uuid, public.worker_reliability_event_type, integer, jsonb, timestamptz) to authenticated;
grant execute on function public.ensure_worker_can_take_shifts(uuid) to authenticated;
grant execute on function public.worker_cancel_booking(uuid) to authenticated;
grant execute on function public.respond_to_booking_request(uuid, public.booking_status) to authenticated;
grant execute on function public.business_record_booking_outcome(uuid, public.booking_status) to authenticated;
