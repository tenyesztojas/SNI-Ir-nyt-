-- SNI Iránytű — Google OAuth (natív Supabase signInWithOAuth) támogatás
-- Futtatás: Supabase projekt > SQL Editor
-- Idempotens: biztonságosan újrafuttatható meglévő telepítésen.
--
-- Kontextus: a 002_github_auth_and_moderation.sql migráció a
-- profiles.auth_provider oszlopra egy CHECK constraint-et vezetett be, ami
-- csak ('github', 'email', 'unknown') értékeket engedélyezett. Emiatt a
-- natív Supabase OAuth-tal (signInWithOAuth) érkező Google és Facebook
-- bejelentkezések auth_provider = 'google' / 'facebook' értéke elutasításra
-- került volna (illetve a handle_new_user() trigger insertje hibázott
-- volna). Ez a migráció bővíti az engedélyezett értékkészletet, és
-- újra létrehozza a handle_new_user() trigger függvényt, hogy a
-- raw_app_meta_data->>'provider' alapú provider-felismerés explicit módon
-- lefedje a Google és Facebook natív OAuth ágakat is (a GitHub-ra és
-- email/jelszavas regisztrációra vonatkozó viselkedés változatlan).

-- ============================================================
-- profiles.auth_provider CHECK constraint bővítése
-- ============================================================

alter table public.profiles
  drop constraint if exists profiles_auth_provider_check;

alter table public.profiles
  add constraint profiles_auth_provider_check
    check (auth_provider in ('email', 'google', 'facebook', 'github', 'unknown'));

-- ============================================================
-- handle_new_user trigger: Google + Facebook natív OAuth felismerés
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_auth_provider text;
  v_is_oauth boolean;
begin
  -- Auth provider detektálása: natív Supabase OAuth (Google, Facebook,
  -- GitHub) esetén a Supabase Auth a raw_app_meta_data->>'provider' mezőbe
  -- írja a tényleges provider nevét (pl. 'google', 'facebook', 'github').
  -- Email/jelszavas regisztrációnál ez a mező hiányzik vagy 'email'.
  v_auth_provider := coalesce(
    new.raw_app_meta_data ->> 'provider',
    'email'
  );

  if v_auth_provider not in ('email', 'google', 'facebook', 'github') then
    v_auth_provider := 'unknown';
  end if;

  v_is_oauth := v_auth_provider in ('google', 'facebook', 'github');

  -- Display name: e-mailes regisztrációnál a megadott nevet veszi,
  -- natív OAuth (Google/Facebook/GitHub) esetén placeholder nevet kap
  -- (a /auth/callback route generál neki véglegeset, ha szükséges).
  if v_is_oauth then
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
