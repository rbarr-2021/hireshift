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
  start_time time,
  end_time time,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint worker_availability_date_unique unique (worker_id, availability_date),
  constraint worker_availability_time_order check (
    (
      status = 'unavailable'
      and start_time is null
      and end_time is null
    )
    or (
      status in ('available', 'partial')
      and start_time is not null
      and end_time is not null
      and end_time > start_time
    )
  )
);

create index if not exists worker_availability_worker_date_idx
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
