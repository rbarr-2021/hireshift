alter table if exists public.shift_listings
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

create index if not exists shift_listings_location_lat_idx
  on public.shift_listings (location_lat);

create index if not exists shift_listings_location_lng_idx
  on public.shift_listings (location_lng);
