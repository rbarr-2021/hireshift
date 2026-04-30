alter table if exists public.users
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_version text;

update public.users
set
  terms_accepted_at = coalesce(terms_accepted_at, timezone('utc', now())),
  terms_version = coalesce(terms_version, '2026-04-30'),
  privacy_accepted_at = coalesce(privacy_accepted_at, timezone('utc', now())),
  privacy_version = coalesce(privacy_version, '2026-04-30')
where onboarding_complete = true
  and (
    terms_accepted_at is null
    or terms_version is null
    or privacy_accepted_at is null
    or privacy_version is null
  );

alter table if exists public.users
  drop constraint if exists users_onboarding_requires_legal_acceptance;

alter table if exists public.users
  add constraint users_onboarding_requires_legal_acceptance
  check (
    onboarding_complete = false
    or (
      terms_accepted_at is not null
      and terms_version is not null
      and privacy_accepted_at is not null
      and privacy_version is not null
    )
  );
