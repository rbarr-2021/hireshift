alter table if exists public.payments
  add column if not exists stripe_last_synced_at timestamptz,
  add column if not exists stripe_payment_status text,
  add column if not exists stripe_transfer_status text,
  add column if not exists reconciliation_status text not null default 'needs_review',
  add column if not exists reconciliation_issue text,
  add column if not exists reconciliation_checked_at timestamptz;

create index if not exists payments_reconciliation_status_idx
  on public.payments (reconciliation_status);

create index if not exists payments_reconciliation_checked_at_idx
  on public.payments (reconciliation_checked_at desc);
