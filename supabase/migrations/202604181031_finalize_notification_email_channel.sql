alter table if exists public.notification_jobs
  alter column channel set default 'email';

create or replace function public.enqueue_notification_job(
  target_booking_id uuid,
  target_recipient_user_id uuid,
  target_job_type public.notification_job_type,
  target_scheduled_for timestamptz,
  target_metadata jsonb default '{}'::jsonb
)
returns public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  next_job public.notification_jobs;
begin
  insert into public.notification_jobs (
    booking_id,
    recipient_user_id,
    job_type,
    channel,
    status,
    scheduled_for,
    locked_at,
    processed_at,
    last_error,
    metadata
  )
  values (
    target_booking_id,
    target_recipient_user_id,
    target_job_type,
    'email',
    'pending',
    target_scheduled_for,
    null,
    null,
    null,
    coalesce(target_metadata, '{}'::jsonb)
  )
  on conflict (booking_id, recipient_user_id, job_type, channel)
  do update
    set scheduled_for = excluded.scheduled_for,
        metadata = coalesce(public.notification_jobs.metadata, '{}'::jsonb) || excluded.metadata,
        status = case
          when public.notification_jobs.status = 'sent' then public.notification_jobs.status
          when public.notification_jobs.status = 'skipped' then public.notification_jobs.status
          else 'pending'::public.notification_job_status
        end,
        locked_at = case
          when public.notification_jobs.status in ('sent', 'skipped') then public.notification_jobs.locked_at
          else null
        end,
        processed_at = case
          when public.notification_jobs.status in ('sent', 'skipped') then public.notification_jobs.processed_at
          else null
        end,
        last_error = case
          when public.notification_jobs.status in ('sent', 'skipped') then public.notification_jobs.last_error
          else null
        end;

  select *
  into next_job
  from public.notification_jobs
  where booking_id = target_booking_id
    and recipient_user_id = target_recipient_user_id
    and job_type = target_job_type
    and channel = 'email';

  return next_job;
end;
$$;
