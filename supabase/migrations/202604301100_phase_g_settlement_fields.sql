alter table if exists public.payments
  add column if not exists settlement_status text not null default 'settled',
  add column if not exists settlement_difference_gbp numeric(10,2),
  add column if not exists refund_due_gbp numeric(10,2),
  add column if not exists top_up_due_gbp numeric(10,2),
  add column if not exists final_gross_amount_gbp numeric(10,2),
  add column if not exists final_platform_fee_gbp numeric(10,2),
  add column if not exists final_worker_payout_gbp numeric(10,2),
  add column if not exists settlement_calculated_at timestamptz,
  add column if not exists settlement_issue text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_settlement_status_check'
  ) then
    alter table public.payments
      add constraint payments_settlement_status_check
      check (settlement_status in ('settled','refund_due','top_up_required','manual_review'));
  end if;
end $$;
