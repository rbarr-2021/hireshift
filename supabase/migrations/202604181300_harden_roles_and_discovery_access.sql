create index if not exists users_role_idx on public.users (role);

drop policy if exists "Workers are publicly visible" on public.worker_profiles;
create policy "Workers are visible to signed-in users"
on public.worker_profiles for select
using (auth.uid() is not null);

drop policy if exists "Workers can read own availability" on public.worker_availability_slots;
create policy "Workers and businesses can read worker availability"
on public.worker_availability_slots for select
using (
  auth.uid() = worker_id
  or exists (
    select 1
    from public.users
    where public.users.id = auth.uid()
      and public.users.role = 'business'
  )
);

drop policy if exists "Booking participants can read reviews" on public.reviews;
create policy "Businesses and booking participants can read reviews"
on public.reviews for select
using (
  exists (
    select 1
    from public.bookings
    where public.bookings.id = booking_id
      and (
        public.bookings.worker_id = auth.uid()
        or public.bookings.business_id = auth.uid()
      )
  )
  or exists (
    select 1
    from public.users
    where public.users.id = auth.uid()
      and public.users.role = 'business'
  )
);

create or replace function public.assert_user_has_role(
  target_user_id uuid,
  expected_role public.user_role,
  context_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_role public.user_role;
begin
  select role
  into actual_role
  from public.users
  where id = target_user_id;

  if actual_role is null then
    raise exception '% references a missing user', context_label;
  end if;

  if actual_role is distinct from expected_role then
    raise exception '% must reference a % account', context_label, expected_role;
  end if;
end;
$$;

create or replace function public.enforce_marketplace_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists worker_profiles_enforce_roles on public.worker_profiles;
create trigger worker_profiles_enforce_roles
before insert or update on public.worker_profiles
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists business_profiles_enforce_roles on public.business_profiles;
create trigger business_profiles_enforce_roles
before insert or update on public.business_profiles
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists worker_availability_slots_enforce_roles on public.worker_availability_slots;
create trigger worker_availability_slots_enforce_roles
before insert or update on public.worker_availability_slots
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists worker_availability_enforce_roles on public.worker_availability;
create trigger worker_availability_enforce_roles
before insert or update on public.worker_availability
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists worker_documents_enforce_roles on public.worker_documents;
create trigger worker_documents_enforce_roles
before insert or update on public.worker_documents
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists worker_roles_enforce_roles on public.worker_roles;
create trigger worker_roles_enforce_roles
before insert or update on public.worker_roles
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists worker_reliability_enforce_roles on public.worker_reliability;
create trigger worker_reliability_enforce_roles
before insert or update on public.worker_reliability
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists worker_reliability_events_enforce_roles on public.worker_reliability_events;
create trigger worker_reliability_events_enforce_roles
before insert or update on public.worker_reliability_events
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists shift_listings_enforce_roles on public.shift_listings;
create trigger shift_listings_enforce_roles
before insert or update on public.shift_listings
for each row execute procedure public.enforce_marketplace_roles();

drop trigger if exists bookings_enforce_roles on public.bookings;
create trigger bookings_enforce_roles
before insert or update on public.bookings
for each row execute procedure public.enforce_marketplace_roles();
