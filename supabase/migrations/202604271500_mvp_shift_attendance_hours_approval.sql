alter table if exists public.bookings
  add column if not exists check_in_lat numeric(9,6),
  add column if not exists check_in_lng numeric(9,6),
  add column if not exists check_out_lat numeric(9,6),
  add column if not exists check_out_lng numeric(9,6),
  add column if not exists worker_hours_claimed numeric(6,2),
  add column if not exists business_hours_approved numeric(6,2),
  add column if not exists attendance_status text not null default 'not_started',
  add column if not exists business_adjustment_reason text,
  add column if not exists approved_by_business_at timestamptz,
  add column if not exists approved_by_business_id uuid references public.users(id) on delete set null,
  add column if not exists admin_override_reason text,
  add column if not exists attendance_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_attendance_status_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_attendance_status_check
      check (
        attendance_status in (
          'not_started',
          'checked_in',
          'checked_out',
          'pending_approval',
          'approved',
          'disputed',
          'adjusted'
        )
      );
  end if;
end $$;

create index if not exists bookings_attendance_status_idx
  on public.bookings (attendance_status);

create index if not exists bookings_approved_by_business_id_idx
  on public.bookings (approved_by_business_id);

update public.bookings
set attendance_status = case
  when attendance_status in (
    'not_started',
    'checked_in',
    'checked_out',
    'pending_approval',
    'approved',
    'disputed',
    'adjusted'
  ) then attendance_status
  when status = 'no_show' then 'disputed'
  when status = 'completed' and coalesce(business_hours_approved, 0) > 0 then 'approved'
  when worker_checked_out_at is not null then 'pending_approval'
  when worker_checked_in_at is not null then 'checked_in'
  else 'not_started'
end;
