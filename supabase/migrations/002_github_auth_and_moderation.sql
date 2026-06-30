-- SNI Iránytű — GitHub Auth + Moderáció migráció
-- Futtatás: Supabase projekt > SQL Editor
-- Idempotens: biztonságosan újrafuttatható meglévő telepítésen.

-- ============================================================
-- PROFILES tábla bővítése
-- ============================================================

alter table public.profiles
  add column if not exists is_verified_account boolean not null default true,
  add column if not exists auth_provider text check (auth_provider in ('github', 'email', 'unknown')),
  add column if not exists last_login_at timestamptz,
  add column if not exists is_suspended boolean not null default false,
  add column if not exists fraud_risk_flag boolean not null default false,
  add column if not exists moderation_note text;

-- ============================================================
-- REVIEWS tábla bővítése
-- ============================================================

alter table public.reviews
  add column if not exists admin_note text,
  add column if not exists edited_count integer not null default 0,
  add column if not exists source_ip_hash text,
  add column if not exists risk_score integer not null default 0,
  add column if not exists published_at timestamptz;

-- Reviews status: allow 'redacted' is allapot
-- (meglévő check constraint eldobása + újra létrehozás)
alter table public.reviews
  drop constraint if exists reviews_status_check;
alter table public.reviews
  add constraint reviews_status_check
    check (status in ('pending', 'approved', 'rejected', 'redacted'));

-- ============================================================
-- PUBLIKUS NÉZETEK
-- ============================================================

-- Publikus profilok: csak adatvédelem-barát mezők
create or replace view public.public_profiles as
select
  id,
  display_name,
  is_verified_account,
  created_at
from public.profiles
where is_suspended = false;

-- Publikus értékelések: jóváhagyott, nem felfüggesztett szerzőktől
create or replace view public.public_reviews as
select
  r.id,
  r.place_id,
  r.overall_rating,
  r.noise_rating,
  r.crowd_rating,
  r.staff_empathy_rating,
  r.safety_rating,
  r.quiet_space_rating,
  r.title,
  r.positive_text,
  r.warning_text,
  r.would_return,
  r.created_at,
  r.published_at,
  r.edited_count,
  p.display_name as author_display_name
from public.reviews r
join public.profiles p on r.author_id = p.id
where r.status = 'approved'
  and p.is_suspended = false;

-- Jogosultságok a nézetekre
grant select on public.public_profiles to anon, authenticated;
grant select on public.public_reviews to anon, authenticated;

-- ============================================================
-- RLS: profiles select megnyitása (display_name pseudonymous)
-- ============================================================

-- Az összes felhasználó olvashat profil sorokat (pseudonymous nevek)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

-- Saját profil vagy admin frissíthet
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- ============================================================
-- handle_new_user trigger frissítése GitHub OAuth-hoz
-- ============================================================

-- GitHub OAuth esetén ne email-prefix-et, hanem generic nevet kapjon
-- (A tényleges random nevet az /auth/callback route állítja be.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_auth_provider text;
begin
  -- Auth provider detektálása
  v_auth_provider := coalesce(
    new.raw_app_meta_data ->> 'provider',
    'unknown'
  );

  -- Display name: e-mailes regisztrációnál a megadott nevet veszi,
  -- GitHub-nál placeholder (callback route frissíti randomra)
  if v_auth_provider = 'github' then
    v_display_name := 'Felhasználó' || floor(random() * 90000 + 10000)::text;
  else
    v_display_name := coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    );
  end if;

  insert into public.profiles (id, display_name, role, auth_provider)
  values (new.id, v_display_name, 'user', v_auth_provider)
  on conflict (id) do update
    set last_login_at = now(),
        auth_provider = excluded.auth_provider;

  return new;
end;
$$;

-- ============================================================
-- Indexek az új mezőkre
-- ============================================================

create index if not exists profiles_is_suspended_idx on public.profiles (is_suspended);
create index if not exists reviews_published_at_idx on public.reviews (published_at);
create index if not exists reviews_risk_score_idx on public.reviews (risk_score);
