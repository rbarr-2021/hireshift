alter table public.messages
  add column if not exists issue_type text null check (
    issue_type in (
      'booking_issue',
      'payment_question',
      'shift_cancellation',
      'worker_did_not_arrive',
      'business_issue',
      'account_issue',
      'other'
    )
  ),
  add column if not exists support_status text not null default 'open' check (
    support_status in ('open', 'reviewed', 'closed')
  ),
  add column if not exists support_reviewed_at timestamptz null,
  add column if not exists support_reviewed_by uuid null references public.users(id) on delete set null;

create index if not exists messages_support_status_idx
  on public.messages(support_status);
