do $$
begin
  if exists (
    select 1 from pg_type where typname = 'notification_job_channel'
  ) and not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.notification_job_channel'::regtype
      and enumlabel = 'email'
  ) then
    alter type public.notification_job_channel add value 'email';
  end if;
end $$;
