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
  shift_start timestamp;
  shift_end timestamp;
  next_claimed_positions integer;
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

  perform public.ensure_worker_can_take_shifts(current_user_id);

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

  if target_listing.status <> 'open' then
    raise exception 'This shift is no longer available';
  end if;

  if coalesce(target_listing.claimed_positions, 0) >= coalesce(target_listing.open_positions, 1) then
    raise exception 'This shift is fully booked';
  end if;

  if exists (
    select 1
    from public.bookings
    where worker_id = current_user_id
      and shift_listing_id = target_listing_id
      and status in ('pending', 'accepted', 'completed')
  ) then
    raise exception 'You have already taken this shift';
  end if;

  shift_start := (target_listing.shift_date::text || ' ' || target_listing.start_time::text)::timestamp;
  shift_end := (coalesce(target_listing.shift_end_date, target_listing.shift_date)::text || ' ' || target_listing.end_time::text)::timestamp;

  duration_hours := extract(epoch from (shift_end - shift_start)) / 3600.0;

  if duration_hours <= 0 then
    raise exception 'Shift duration must be valid';
  end if;

  total_amount := round((duration_hours * target_listing.hourly_rate_gbp)::numeric, 2);

  insert into public.bookings (
    worker_id,
    business_id,
    shift_date,
    shift_end_date,
    shift_listing_id,
    start_time,
    end_time,
    hourly_rate_gbp,
    location,
    notes,
    status,
    total_amount_gbp,
    platform_fee_gbp
  )
  values (
    current_user_id,
    target_listing.business_id,
    target_listing.shift_date,
    coalesce(target_listing.shift_end_date, target_listing.shift_date),
    target_listing.id,
    target_listing.start_time,
    target_listing.end_time,
    target_listing.hourly_rate_gbp,
    target_listing.location,
    target_listing.description,
    'accepted',
    total_amount,
    0
  )
  returning id into next_booking_id;

  next_claimed_positions := coalesce(target_listing.claimed_positions, 0) + 1;

  update public.shift_listings
  set claimed_positions = next_claimed_positions,
      status = case
        when next_claimed_positions >= coalesce(target_listing.open_positions, 1)
          then 'claimed'::public.shift_listing_status
        else 'open'::public.shift_listing_status
      end,
      claimed_worker_id = coalesce(claimed_worker_id, current_user_id),
      claimed_booking_id = coalesce(claimed_booking_id, next_booking_id)
  where id = target_listing_id;

  return next_booking_id;
end;
$$;

grant execute on function public.claim_shift_listing(uuid) to authenticated;
