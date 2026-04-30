alter table if exists public.shift_listings
  add column if not exists meeting_point text,
  add column if not exists site_contact_name text,
  add column if not exists site_contact_phone text,
  add column if not exists dress_code text,
  add column if not exists equipment_required text,
  add column if not exists expected_duties text,
  add column if not exists arrival_instructions text,
  add column if not exists parking_info text,
  add column if not exists staff_entrance_info text,
  add column if not exists break_policy text,
  add column if not exists meal_provided boolean not null default false,
  add column if not exists safety_or_ppe_requirements text,
  add column if not exists experience_level_required text;

alter table if exists public.bookings
  add column if not exists dress_code text,
  add column if not exists equipment_required text,
  add column if not exists expected_duties text,
  add column if not exists parking_info text,
  add column if not exists staff_entrance_info text,
  add column if not exists break_policy text,
  add column if not exists meal_provided boolean not null default false,
  add column if not exists safety_or_ppe_requirements text,
  add column if not exists experience_level_required text;

create or replace function public.validate_shift_listing_instructions()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if coalesce(new.status::text, 'open') = 'open' then
      if nullif(btrim(new.meeting_point), '') is null then
        raise exception 'Meeting point is required';
      end if;

      if nullif(btrim(new.site_contact_name), '') is null then
        raise exception 'Site contact name is required';
      end if;

      if nullif(btrim(new.site_contact_phone), '') is null then
        raise exception 'Site contact phone is required';
      end if;

      if nullif(btrim(new.dress_code), '') is null then
        raise exception 'Dress code is required';
      end if;

      if nullif(btrim(new.expected_duties), '') is null then
        raise exception 'Expected duties are required';
      end if;

      if not (new.site_contact_phone ~* '^[0-9+()\\-\\s]{7,24}$') then
        raise exception 'Site contact phone format is invalid';
      end if;
    end if;
  end if;

  new.meeting_point := nullif(left(btrim(coalesce(new.meeting_point, '')), 240), '');
  new.site_contact_name := nullif(left(btrim(coalesce(new.site_contact_name, '')), 160), '');
  new.site_contact_phone := nullif(left(btrim(coalesce(new.site_contact_phone, '')), 50), '');
  new.dress_code := nullif(left(btrim(coalesce(new.dress_code, '')), 500), '');
  new.equipment_required := nullif(left(btrim(coalesce(new.equipment_required, '')), 500), '');
  new.expected_duties := nullif(left(btrim(coalesce(new.expected_duties, '')), 1000), '');
  new.arrival_instructions := nullif(left(btrim(coalesce(new.arrival_instructions, '')), 1000), '');
  new.parking_info := nullif(left(btrim(coalesce(new.parking_info, '')), 500), '');
  new.staff_entrance_info := nullif(left(btrim(coalesce(new.staff_entrance_info, '')), 500), '');
  new.break_policy := nullif(left(btrim(coalesce(new.break_policy, '')), 500), '');
  new.safety_or_ppe_requirements := nullif(left(btrim(coalesce(new.safety_or_ppe_requirements, '')), 500), '');
  new.experience_level_required := nullif(left(btrim(coalesce(new.experience_level_required, '')), 160), '');

  return new;
end;
$$;

drop trigger if exists shift_listings_validate_instructions on public.shift_listings;
create trigger shift_listings_validate_instructions
before insert or update on public.shift_listings
for each row
execute procedure public.validate_shift_listing_instructions();

create table if not exists public.shift_listing_events (
  id uuid primary key default gen_random_uuid(),
  shift_listing_id uuid not null references public.shift_listings(id) on delete cascade,
  business_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists shift_listing_events_shift_listing_idx
  on public.shift_listing_events(shift_listing_id);
create index if not exists shift_listing_events_business_idx
  on public.shift_listing_events(business_id);
create index if not exists shift_listing_events_created_idx
  on public.shift_listing_events(created_at desc);

create or replace function public.log_shift_instruction_updates()
returns trigger
language plpgsql
as $$
begin
  if
    coalesce(old.meeting_point, '') is distinct from coalesce(new.meeting_point, '')
    or coalesce(old.site_contact_name, '') is distinct from coalesce(new.site_contact_name, '')
    or coalesce(old.site_contact_phone, '') is distinct from coalesce(new.site_contact_phone, '')
    or coalesce(old.dress_code, '') is distinct from coalesce(new.dress_code, '')
    or coalesce(old.equipment_required, '') is distinct from coalesce(new.equipment_required, '')
    or coalesce(old.expected_duties, '') is distinct from coalesce(new.expected_duties, '')
    or coalesce(old.arrival_instructions, '') is distinct from coalesce(new.arrival_instructions, '')
    or coalesce(old.parking_info, '') is distinct from coalesce(new.parking_info, '')
    or coalesce(old.staff_entrance_info, '') is distinct from coalesce(new.staff_entrance_info, '')
    or coalesce(old.break_policy, '') is distinct from coalesce(new.break_policy, '')
    or coalesce(old.meal_provided, false) is distinct from coalesce(new.meal_provided, false)
    or coalesce(old.safety_or_ppe_requirements, '') is distinct from coalesce(new.safety_or_ppe_requirements, '')
    or coalesce(old.experience_level_required, '') is distinct from coalesce(new.experience_level_required, '')
  then
    insert into public.shift_listing_events (
      shift_listing_id,
      business_id,
      event_type,
      metadata
    ) values (
      new.id,
      new.business_id,
      'shift_instructions_updated',
      jsonb_build_object(
        'previous', jsonb_build_object(
          'meeting_point', old.meeting_point,
          'site_contact_name', old.site_contact_name,
          'site_contact_phone', old.site_contact_phone,
          'dress_code', old.dress_code,
          'equipment_required', old.equipment_required,
          'expected_duties', old.expected_duties,
          'arrival_instructions', old.arrival_instructions,
          'parking_info', old.parking_info,
          'staff_entrance_info', old.staff_entrance_info,
          'break_policy', old.break_policy,
          'meal_provided', old.meal_provided,
          'safety_or_ppe_requirements', old.safety_or_ppe_requirements,
          'experience_level_required', old.experience_level_required
        ),
        'updated', jsonb_build_object(
          'meeting_point', new.meeting_point,
          'site_contact_name', new.site_contact_name,
          'site_contact_phone', new.site_contact_phone,
          'dress_code', new.dress_code,
          'equipment_required', new.equipment_required,
          'expected_duties', new.expected_duties,
          'arrival_instructions', new.arrival_instructions,
          'parking_info', new.parking_info,
          'staff_entrance_info', new.staff_entrance_info,
          'break_policy', new.break_policy,
          'meal_provided', new.meal_provided,
          'safety_or_ppe_requirements', new.safety_or_ppe_requirements,
          'experience_level_required', new.experience_level_required
        )
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists shift_listings_log_instruction_updates on public.shift_listings;
create trigger shift_listings_log_instruction_updates
after update on public.shift_listings
for each row
execute procedure public.log_shift_instruction_updates();

create or replace function public.claim_shift_listing(target_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_role public.user_role;
  is_shift_ready boolean;
  target_listing public.shift_listings%rowtype;
  next_booking_id uuid;
  duration_hours numeric;
  total_amount numeric;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select role, onboarding_complete
  into current_user_role, is_shift_ready
  from public.users
  where id = current_user_id;

  if current_user_role is distinct from 'worker' then
    raise exception 'Only workers can take shifts';
  end if;

  if coalesce(is_shift_ready, false) is not true then
    raise exception 'Complete your profile to take this shift';
  end if;

  if not exists (
    select 1
    from public.worker_profiles
    where user_id = current_user_id
  ) then
    raise exception 'Complete your worker profile before taking shifts';
  end if;

  select *
  into target_listing
  from public.shift_listings
  where id = target_listing_id
  for update;

  if not found then
    raise exception 'Shift not found';
  end if;

  if target_listing.status <> 'open' or target_listing.claimed_worker_id is not null then
    raise exception 'This shift is no longer available';
  end if;

  duration_hours :=
    extract(epoch from (target_listing.end_time - target_listing.start_time)) / 3600.0;

  if duration_hours <= 0 then
    raise exception 'Shift duration must be valid';
  end if;

  total_amount := round((duration_hours * target_listing.hourly_rate_gbp)::numeric, 2);

  insert into public.bookings (
    worker_id,
    business_id,
    shift_date,
    start_time,
    end_time,
    hourly_rate_gbp,
    location,
    notes,
    status,
    total_amount_gbp,
    platform_fee_gbp,
    meeting_point,
    site_contact_name,
    site_contact_phone,
    arrival_instructions,
    dress_code,
    equipment_required,
    expected_duties,
    parking_info,
    staff_entrance_info,
    break_policy,
    meal_provided,
    safety_or_ppe_requirements,
    experience_level_required
  )
  values (
    current_user_id,
    target_listing.business_id,
    target_listing.shift_date,
    target_listing.start_time,
    target_listing.end_time,
    target_listing.hourly_rate_gbp,
    target_listing.location,
    target_listing.description,
    'accepted',
    total_amount,
    0,
    target_listing.meeting_point,
    target_listing.site_contact_name,
    target_listing.site_contact_phone,
    target_listing.arrival_instructions,
    target_listing.dress_code,
    target_listing.equipment_required,
    target_listing.expected_duties,
    target_listing.parking_info,
    target_listing.staff_entrance_info,
    target_listing.break_policy,
    coalesce(target_listing.meal_provided, false),
    target_listing.safety_or_ppe_requirements,
    target_listing.experience_level_required
  )
  returning id into next_booking_id;

  update public.shift_listings
  set status = 'claimed',
      claimed_worker_id = current_user_id,
      claimed_booking_id = next_booking_id
  where id = target_listing_id;

  return next_booking_id;
end;
$$;
