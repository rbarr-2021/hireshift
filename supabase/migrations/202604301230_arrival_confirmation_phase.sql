alter table if exists public.bookings
  add column if not exists meeting_point text,
  add column if not exists site_contact_name text,
  add column if not exists site_contact_phone text,
  add column if not exists arrival_instructions text,
  add column if not exists business_arrival_confirmed_at timestamptz,
  add column if not exists business_arrival_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists arrival_confirmation_status text not null default 'not_checked_in',
  add column if not exists arrival_confirmation_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_arrival_confirmation_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_arrival_confirmation_status_check
      check (
        arrival_confirmation_status in (
          'not_checked_in',
          'worker_checked_in',
          'business_confirmed',
          'issue_reported'
        )
      );
  end if;
end $$;
