do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'shift_listings_time_order'
      and conrelid = 'public.shift_listings'::regclass
  ) then
    alter table public.shift_listings
      drop constraint shift_listings_time_order;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shift_listings_datetime_order_check'
      and conrelid = 'public.shift_listings'::regclass
  ) then
    alter table public.shift_listings
      add constraint shift_listings_datetime_order_check
      check (
        ((coalesce(shift_end_date, shift_date)::text || ' ' || end_time::text)::timestamp) >
        ((shift_date::text || ' ' || start_time::text)::timestamp)
      );
  end if;
end $$;
