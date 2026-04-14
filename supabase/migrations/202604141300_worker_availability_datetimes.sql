do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'worker_availability_status'
  ) then
    create type public.worker_availability_status as enum (
      'available',
      'unavailable',
      'partial'
    );
  end if;
end $$;

create table if not exists public.worker_availability (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users(id) on delete cascade,
  availability_date date not null,
  status public.worker_availability_status not null default 'available',
  start_datetime timestamp without time zone,
  end_datetime timestamp without time zone,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint worker_availability_date_unique unique (worker_id, availability_date)
);

alter table public.worker_availability
  add column if not exists availability_date date,
  add column if not exists status public.worker_availability_status not null default 'available',
  add column if not exists start_datetime timestamp without time zone,
  add column if not exists end_datetime timestamp without time zone,
  add column if not exists created_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_availability'
      and column_name = 'start_time'
  ) then
    execute $sql$
      update public.worker_availability
      set
        start_datetime = coalesce(
          start_datetime,
          case
            when start_time is not null
            then (availability_date::text || ' ' || start_time::text)::timestamp
            else null
          end
        ),
        end_datetime = coalesce(
          end_datetime,
          case
            when end_time is not null
            then (availability_date::text || ' ' || end_time::text)::timestamp
            else null
          end
        )
      where start_datetime is null
         or end_datetime is null
    $sql$;
  end if;
end $$;

update public.worker_availability
set availability_date = coalesce(
  availability_date,
  case
    when start_datetime is not null then start_datetime::date
    else availability_date
  end
)
where availability_date is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'worker_availability_time_order'
      and conrelid = 'public.worker_availability'::regclass
  ) then
    alter table public.worker_availability
      drop constraint worker_availability_time_order;
  end if;
end $$;

alter table public.worker_availability
  drop constraint if exists worker_availability_datetime_order;

alter table public.worker_availability
  add constraint worker_availability_datetime_order check (
    (
      status = 'unavailable'
      and start_datetime is null
      and end_datetime is null
    )
    or (
      status in ('available', 'partial')
      and start_datetime is not null
      and end_datetime is not null
      and end_datetime > start_datetime
    )
  );

create unique index if not exists worker_availability_worker_date_idx
  on public.worker_availability (worker_id, availability_date);

drop trigger if exists worker_availability_set_updated_at on public.worker_availability;
create trigger worker_availability_set_updated_at
before update on public.worker_availability
for each row execute procedure public.set_updated_at();

alter table public.worker_availability enable row level security;

drop policy if exists "Workers can read own date availability" on public.worker_availability;
create policy "Workers can read own date availability"
on public.worker_availability for select
using (auth.uid() = worker_id);

drop policy if exists "Workers can manage own date availability" on public.worker_availability;
create policy "Workers can manage own date availability"
on public.worker_availability for all
using (auth.uid() = worker_id)
with check (auth.uid() = worker_id);
