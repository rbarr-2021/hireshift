do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'business_document_type'
  ) then
    create type public.business_document_type as enum ('verification_document');
  end if;
end $$;

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.users(id) on delete cascade,
  document_type public.business_document_type not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (business_id, document_type)
);

create index if not exists business_documents_business_idx
  on public.business_documents (business_id);

drop trigger if exists business_documents_set_updated_at on public.business_documents;
create trigger business_documents_set_updated_at
before update on public.business_documents
for each row execute procedure public.set_updated_at();

alter table public.business_documents enable row level security;

drop policy if exists "Businesses can read own documents" on public.business_documents;
create policy "Businesses can read own documents"
on public.business_documents for select
using (auth.uid() = business_id);

drop policy if exists "Businesses can manage own documents" on public.business_documents;
create policy "Businesses can manage own documents"
on public.business_documents for all
using (auth.uid() = business_id)
with check (auth.uid() = business_id);

insert into storage.buckets (id, name, public)
values ('business-documents', 'business-documents', false)
on conflict (id) do nothing;

drop policy if exists "Businesses can upload own documents" on storage.objects;
create policy "Businesses can upload own documents"
on storage.objects for insert
with check (
  bucket_id = 'business-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Businesses can update own documents" on storage.objects;
create policy "Businesses can update own documents"
on storage.objects for update
using (
  bucket_id = 'business-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'business-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Businesses can read own documents from storage" on storage.objects;
create policy "Businesses can read own documents from storage"
on storage.objects for select
using (
  bucket_id = 'business-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Businesses can delete own documents" on storage.objects;
create policy "Businesses can delete own documents"
on storage.objects for delete
using (
  bucket_id = 'business-documents'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

create or replace function public.enforce_marketplace_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  listing_business_id uuid;
  booking_worker_id uuid;
begin
  case tg_table_name
    when 'worker_profiles' then
      perform public.assert_user_has_role(new.user_id, 'worker', 'worker_profiles.user_id');
    when 'worker_availability_slots' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'worker_availability_slots.worker_id');
    when 'worker_availability' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'worker_availability.worker_id');
    when 'worker_documents' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'worker_documents.worker_id');
    when 'worker_roles' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'worker_roles.worker_id');
    when 'worker_reliability' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'worker_reliability.worker_id');
    when 'worker_reliability_events' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'worker_reliability_events.worker_id');
      if new.booking_id is not null then
        select worker_id
        into booking_worker_id
        from public.bookings
        where id = new.booking_id;

        if booking_worker_id is null then
          raise exception 'worker_reliability_events.booking_id references a missing booking';
        end if;

        if booking_worker_id is distinct from new.worker_id then
          raise exception 'worker_reliability_events.worker_id must match the booking worker';
        end if;
      end if;
    when 'business_profiles' then
      perform public.assert_user_has_role(new.user_id, 'business', 'business_profiles.user_id');
    when 'business_documents' then
      perform public.assert_user_has_role(new.business_id, 'business', 'business_documents.business_id');
    when 'shift_listings' then
      perform public.assert_user_has_role(new.business_id, 'business', 'shift_listings.business_id');
    when 'bookings' then
      perform public.assert_user_has_role(new.worker_id, 'worker', 'bookings.worker_id');
      perform public.assert_user_has_role(new.business_id, 'business', 'bookings.business_id');

      if new.shift_listing_id is not null then
        select business_id
        into listing_business_id
        from public.shift_listings
        where id = new.shift_listing_id;

        if listing_business_id is null then
          raise exception 'bookings.shift_listing_id references a missing shift listing';
        end if;

        if listing_business_id is distinct from new.business_id then
          raise exception 'bookings.business_id must match the shift listing business';
        end if;
      end if;
  end case;

  return new;
end;
$function$;

drop trigger if exists business_documents_enforce_roles on public.business_documents;
create trigger business_documents_enforce_roles
before insert or update on public.business_documents
for each row execute procedure public.enforce_marketplace_roles();
