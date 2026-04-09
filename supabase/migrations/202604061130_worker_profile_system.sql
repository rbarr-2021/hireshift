do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'worker_document_type'
  ) then
    create type public.worker_document_type as enum (
      'food_safety_certificate',
      'right_to_work',
      'id_document',
      'other'
    );
  end if;
end $$;

alter table public.worker_profiles
  alter column hourly_rate_gbp drop not null,
  add column if not exists daily_rate_gbp numeric(10,2) check (daily_rate_gbp is null or daily_rate_gbp >= 0),
  add column if not exists postcode text,
  add column if not exists profile_photo_url text,
  add column if not exists profile_photo_path text,
  add column if not exists work_history jsonb not null default '[]'::jsonb;

create table if not exists public.worker_availability_slots (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint worker_availability_time_order check (end_time > start_time)
);

create table if not exists public.worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.users(id) on delete cascade,
  document_type public.worker_document_type not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (worker_id, document_type)
);

create index if not exists worker_availability_worker_idx
  on public.worker_availability_slots (worker_id, day_of_week);

create index if not exists worker_documents_worker_idx
  on public.worker_documents (worker_id);

drop trigger if exists worker_availability_slots_set_updated_at on public.worker_availability_slots;
create trigger worker_availability_slots_set_updated_at
before update on public.worker_availability_slots
for each row execute procedure public.set_updated_at();

drop trigger if exists worker_documents_set_updated_at on public.worker_documents;
create trigger worker_documents_set_updated_at
before update on public.worker_documents
for each row execute procedure public.set_updated_at();

alter table public.worker_availability_slots enable row level security;
alter table public.worker_documents enable row level security;

drop policy if exists "Workers can read own availability" on public.worker_availability_slots;
create policy "Workers can read own availability"
on public.worker_availability_slots for select
using (auth.uid() = worker_id);

drop policy if exists "Workers can manage own availability" on public.worker_availability_slots;
create policy "Workers can manage own availability"
on public.worker_availability_slots for all
using (auth.uid() = worker_id)
with check (auth.uid() = worker_id);

drop policy if exists "Workers can read own documents" on public.worker_documents;
create policy "Workers can read own documents"
on public.worker_documents for select
using (auth.uid() = worker_id);

drop policy if exists "Workers can manage own documents" on public.worker_documents;
create policy "Workers can manage own documents"
on public.worker_documents for all
using (auth.uid() = worker_id)
with check (auth.uid() = worker_id);

insert into storage.buckets (id, name, public)
values ('worker-profile-assets', 'worker-profile-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('worker-documents', 'worker-documents', false)
on conflict (id) do nothing;

drop policy if exists "Workers can upload profile assets" on storage.objects;
create policy "Workers can upload profile assets"
on storage.objects for insert
with check (
  bucket_id = 'worker-profile-assets'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can update profile assets" on storage.objects;
create policy "Workers can update profile assets"
on storage.objects for update
using (
  bucket_id = 'worker-profile-assets'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'worker-profile-assets'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can read own profile assets" on storage.objects;
create policy "Workers can read own profile assets"
on storage.objects for select
using (
  bucket_id = 'worker-profile-assets'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can delete profile assets" on storage.objects;
create policy "Workers can delete profile assets"
on storage.objects for delete
using (
  bucket_id = 'worker-profile-assets'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can upload own documents" on storage.objects;
create policy "Workers can upload own documents"
on storage.objects for insert
with check (
  bucket_id = 'worker-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can update own documents" on storage.objects;
create policy "Workers can update own documents"
on storage.objects for update
using (
  bucket_id = 'worker-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'worker-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can read own documents from storage" on storage.objects;
create policy "Workers can read own documents from storage"
on storage.objects for select
using (
  bucket_id = 'worker-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Workers can delete own documents" on storage.objects;
create policy "Workers can delete own documents"
on storage.objects for delete
using (
  bucket_id = 'worker-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);
