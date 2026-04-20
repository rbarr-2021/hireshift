alter table if exists public.payments
  add column if not exists payout_status text not null default 'pending_confirmation',
  add column if not exists shift_completed_at timestamptz,
  add column if not exists shift_completion_confirmed_by uuid references public.users(id) on delete set null,
  add column if not exists payout_approved_at timestamptz,
  add column if not exists payout_approved_by uuid references public.users(id) on delete set null,
  add column if not exists payout_sent_at timestamptz,
  add column if not exists dispute_reason text,
  add column if not exists disputed_at timestamptz,
  add column if not exists payout_hold_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_payout_status_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_payout_status_check
      check (
        payout_status in (
          'pending_confirmation',
          'awaiting_shift_completion',
          'awaiting_business_approval',
          'approved_for_payout',
          'paid',
          'disputed',
          'on_hold'
        )
      );
  end if;
end $$;

update public.payments
set payout_status = case
  when status in ('captured', 'released') then 'awaiting_shift_completion'
  when status = 'failed' then 'on_hold'
  when status = 'refunded' then 'on_hold'
  else 'pending_confirmation'
end
where payout_status is null
   or payout_status not in (
     'pending_confirmation',
     'awaiting_shift_completion',
     'awaiting_business_approval',
     'approved_for_payout',
     'paid',
     'disputed',
     'on_hold'
   );

create index if not exists payments_payout_status_idx on public.payments (payout_status);
create index if not exists payments_shift_completed_at_idx on public.payments (shift_completed_at);

