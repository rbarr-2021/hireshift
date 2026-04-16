do $$
declare
  worker_fk_def text;
  business_fk_def text;
begin
  select pg_get_constraintdef(oid)
  into worker_fk_def
  from pg_constraint
  where conname = 'bookings_worker_id_fkey'
    and conrelid = 'public.bookings'::regclass;

  if worker_fk_def is not null and worker_fk_def not ilike '%references public.users(id)%' then
    alter table public.bookings drop constraint bookings_worker_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_worker_id_fkey'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_worker_id_fkey
      foreign key (worker_id) references public.users(id) on delete restrict;
  end if;

  select pg_get_constraintdef(oid)
  into business_fk_def
  from pg_constraint
  where conname = 'bookings_business_id_fkey'
    and conrelid = 'public.bookings'::regclass;

  if business_fk_def is not null and business_fk_def not ilike '%references public.users(id)%' then
    alter table public.bookings drop constraint bookings_business_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_business_id_fkey'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_business_id_fkey
      foreign key (business_id) references public.users(id) on delete restrict;
  end if;
end $$;

do $$
declare
  payment_worker_fk_def text;
  payment_business_fk_def text;
begin
  if to_regclass('public.payments') is null then
    return;
  end if;

  select pg_get_constraintdef(oid)
  into payment_worker_fk_def
  from pg_constraint
  where conname = 'payments_worker_id_fkey'
    and conrelid = 'public.payments'::regclass;

  if payment_worker_fk_def is not null and payment_worker_fk_def not ilike '%references public.users(id)%' then
    alter table public.payments drop constraint payments_worker_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_worker_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_worker_id_fkey
      foreign key (worker_id) references public.users(id) on delete restrict;
  end if;

  select pg_get_constraintdef(oid)
  into payment_business_fk_def
  from pg_constraint
  where conname = 'payments_business_id_fkey'
    and conrelid = 'public.payments'::regclass;

  if payment_business_fk_def is not null and payment_business_fk_def not ilike '%references public.users(id)%' then
    alter table public.payments drop constraint payments_business_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_business_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_business_id_fkey
      foreign key (business_id) references public.users(id) on delete restrict;
  end if;
end $$;
