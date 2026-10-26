-- =====================================================================
-- IZOLÁLT (scratch) teszt-stubok a delete_own_account tervezethez.
-- SOHA NEM éles adatbázison. Szintetikus séma: az FK-szabályok, NOT NULL
-- megkötések és ON DELETE viselkedések a repóban lévő definíciókat és az
-- éles, csak olvasó ellenőrzés eredményeit követik (11 NO ACTION FK az
-- auth.users-re). Csak a teszthez szükséges oszlopok szerepelnek.
-- Előfeltétel: supabase/tests/_bootstrap_stub.sql + Family-migrációk + 20261004.
-- =====================================================================

-- Supabase Auth gyerektáblák mintája (élesben: auth.identities, auth.sessions,
-- auth.refresh_tokens, auth.mfa_factors, auth.one_time_tokens ... ON DELETE CASCADE —
-- élesben ELLENŐRIZENDŐ, lásd TEST_PLAN.md C-szakasz).
create table auth.identities (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, provider text not null);
create table auth.sessions (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade);

-- Helyek / értékelések / bejelentések (schema.sql minta)
create table public.places (id uuid primary key default gen_random_uuid(), name text not null default 'hely');
create table public.reviews (id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null);
create table public.reports (id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  reported_by uuid references public.profiles(id) on delete set null,
  description text not null default 'x');

-- migration_place_claims.sql minta (NO ACTION FK-k)
create table public.place_claims (id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id),
  verification_data text, status text not null default 'pending');
create table public.place_responses (id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  responder_user_id uuid not null references auth.users(id),
  text text not null default 'valasz szoveg');
alter table public.reports add column response_id uuid references public.place_responses(id) on delete set null;
create table public.messages (id uuid primary key default gen_random_uuid(),
  review_id uuid references public.reviews(id) on delete set null,
  place_id uuid not null references public.places(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  recipient_user_id uuid not null references auth.users(id),
  sender_role text not null default 'reviewer', text text not null default 'uzenet');
create table public.consent_log (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  place_id uuid not null references public.places(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete set null,
  consent_type text not null default 'anonymous_only',
  granted_at timestamptz default now(), revoked_at timestamptz,
  unique (user_id, place_id, review_id));

-- Közösségi bejelentések + moderáció (community_help*.sql minta)
create table public.community_user_reports (id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending', legal_hold boolean not null default false);
create table public.community_report_audit_log (id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.community_user_reports(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id), action text not null default 'x',
  justification text not null default 'x');
create table public.community_report_appeals (id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.community_user_reports(id) on delete cascade,
  appellant_user_id uuid not null references auth.users(id),
  appeal_text text not null default 'fellebbezes', status text not null default 'pending',
  reviewed_by uuid null references auth.users(id));

-- Akadémia / szolgáltatók (academy.sql, migration_booking.sql minta)
create table public.academy_source_documents (id uuid primary key default gen_random_uuid(),
  filename text not null default 'f.docx', uploaded_by uuid not null references auth.users(id));
create table public.provider_registrations (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null default 'ceg', reviewed_by uuid references auth.users(id));
create table public.provider_profiles (id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  registration_id uuid references public.provider_registrations(id));
create table public.academy_partner_settings (id uuid primary key default gen_random_uuid(),
  partner_id uuid not null unique references public.provider_profiles(id) on delete cascade,
  annual_confirmed_at timestamptz null, annual_confirmed_by uuid null references auth.users(id));

-- Önellenőrzés: pontosan 11 NO ACTION FK az auth.users-re (mint élesben)
do $$ declare n int; begin
  select count(*) into n from pg_constraint
   where contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype = 'a';
  assert n = 11, 'stub: elvárt 11 NO ACTION FK, kapott ' || n;
end $$;
