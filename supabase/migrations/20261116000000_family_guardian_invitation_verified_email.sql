-- Védett Család — gondviselői meghívás elfogadása/elutasítása csak IGAZOLT
-- e-mail-címmel (20261116000000).
--
-- MIÉRT
--   Az accept_family_guardian_invitation() és decline_family_guardian_invitation()
--   (20260927000100) a hívó e-mail-címét kizárólag a munkamenet-tokenből
--   (auth.email()) vette. Az e-mail igazoltságát a függvény nem ellenőrizte:
--   a védelem egyetlen külső feltételen (Supabase Auth "Confirm email") és
--   azon múlt, hogy minden bejelentkezési út csak igazolt címet ad a tokenbe.
--   Ha bármelyik nem teljesül (kikapcsolt megerősítés, nem igazolt címet
--   elfogadó külső belépés), egy idegen e-mail-címet regisztráló felhasználó
--   elfogadhatta (vagy elutasíthatta) a más címére szóló meghívót.
--
-- MIT VÁLTOZTAT (csak ez a két függvény)
--   * A hívót auth.uid() azonosítja; az e-mail-címet és az igazolás idejét az
--     auth.users táblából olvassuk (nem a tokenből). A Supabase Auth az
--     email_confirmed_at mezőt e-mail-megerősítéskor, magic link / OTP
--     ellenőrzésekor, igazolt e-mailt adó OAuth-identitásnál és admin
--     email_confirm=true létrehozáskor tölti ki — ez az adatbázisban tárolt,
--     megbízható igazolási állapot. "Secure email change" mellett az
--     auth.users.email csak megerősített címre változik.
--   * Hiányzó e-mail (pl. anonim vagy telefonos fiók) és nem igazolt e-mail
--     esetén a függvény hibával leáll, mielőtt bármit módosítana.
--   * Minden meglévő védelem változatlan: pending státusz, lejárat, pontos
--     (kisbetűsített) címegyezés, atomikus állapotváltás, az owner-sor
--     védelme, és — a family_members triggerein át — a felnőttkorlát
--     (enforce_family_adult_limit) és a gyermekfiók/családtag szétválasztás.
--   * search_path: public, pg_temp (a meglévő 'public' szigorítása; minden
--     objektum sémával minősítve).
--   * Jogosultság változatlan: PUBLIC és anon nem, authenticated (és a
--     tulajdonos, service_role) futtathatja.
--
-- NEM VÁLTOZIK: invite/revoke, gyermekenkénti jogok (az elfogadás továbbra
-- sem ad guardian_child_permissions jogot), felnőttkorlát, más modulok.
--
-- VISSZAÁLLÍTÁS: a két függvény korábbi definíciója a
-- 20260927000100_family_guardian_invitation_foundation.sql 4.3–4.4 szakasza
-- (újrafuttatható "create or replace"); a jogosultságok azonosak.

-- 1. accept_family_guardian_invitation -------------------------------------
create or replace function public.accept_family_guardian_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email_norm text;
  v_email_confirmed_at timestamptz;
  v_family_id uuid;
  v_membership_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívás elfogadásához';
  end if;

  -- A hívó tényleges, tárolt e-mail-címe és igazolási állapota (nem a token).
  select lower(btrim(u.email)), u.email_confirmed_at
    into v_email_norm, v_email_confirmed_at
    from auth.users u
   where u.id = v_uid;

  if v_email_norm is null or v_email_norm = '' then
    raise exception using errcode = 'P0001',
      message = 'A fiókodhoz nincs e-mail-cím rendelve, a meghívás emiatt nem fogadható el',
      hint = 'family_invitation_email_missing';
  end if;

  if v_email_confirmed_at is null then
    raise exception using errcode = 'P0001',
      message = 'Az e-mail-címed még nincs megerősítve. Erősítsd meg, majd próbáld újra a meghívás elfogadását.',
      hint = 'family_invitation_email_unverified';
  end if;

  -- (a) Az invitation atomikus, race-safe állapotváltása (változatlan).
  update public.family_guardian_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id
    and status = 'pending'
    and expires_at > now()
    and invited_email = v_email_norm
  returning family_id into v_family_id;

  if v_family_id is null then
    raise exception 'Érvénytelen, lejárt, visszavont, elutasított vagy már elfogadott meghívás, vagy nem a hozzád tartozó e-mail-címre szól';
  end if;

  -- (b) family_members atomikus insert/reaktiválás (változatlan; az owner-sor
  -- nem módosulhat, a felnőttkorlátot a family_members triggere kényszeríti ki).
  insert into public.family_members (family_id, user_id, role, status)
  values (v_family_id, v_uid, 'guardian', 'active')
  on conflict (family_id, user_id) do update
    set role = 'guardian', status = 'active'
    where public.family_members.role = 'guardian'
  returning id into v_membership_id;

  if v_membership_id is null then
    raise exception 'Ez a felhasználó már a family ownerje — a meghívás elfogadása nem módosíthatja az owner szerepkört';
  end if;
end;
$$;

-- 2. decline_family_guardian_invitation ------------------------------------
create or replace function public.decline_family_guardian_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email_norm text;
  v_email_confirmed_at timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívás elutasításához';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at
    into v_email_norm, v_email_confirmed_at
    from auth.users u
   where u.id = v_uid;

  if v_email_norm is null or v_email_norm = '' then
    raise exception using errcode = 'P0001',
      message = 'A fiókodhoz nincs e-mail-cím rendelve, a meghívás emiatt nem utasítható el',
      hint = 'family_invitation_email_missing';
  end if;

  if v_email_confirmed_at is null then
    raise exception using errcode = 'P0001',
      message = 'Az e-mail-címed még nincs megerősítve. Erősítsd meg, majd próbáld újra a meghívás elutasítását.',
      hint = 'family_invitation_email_unverified';
  end if;

  update public.family_guardian_invitations
  set status = 'declined', responded_at = now()
  where id = p_invitation_id
    and status = 'pending'
    and expires_at > now()
    and invited_email = v_email_norm
  returning id into v_id;

  if v_id is null then
    raise exception 'Érvénytelen, lejárt vagy már megválaszolt meghívás, vagy nem a hozzád tartozó e-mail-címre szól';
  end if;
end;
$$;

-- 3. Jogosultságok (változatlanok, explicit megerősítve) -------------------
revoke execute on function public.accept_family_guardian_invitation(uuid) from public;
revoke execute on function public.accept_family_guardian_invitation(uuid) from anon;
grant execute on function public.accept_family_guardian_invitation(uuid) to authenticated;

revoke execute on function public.decline_family_guardian_invitation(uuid) from public;
revoke execute on function public.decline_family_guardian_invitation(uuid) from anon;
grant execute on function public.decline_family_guardian_invitation(uuid) to authenticated;

comment on function public.accept_family_guardian_invitation(uuid) is
  'Gondviselői meghívás elfogadása. A hívót auth.uid() azonosítja; az e-mail-címet és az igazolást (email_confirmed_at) az auth.users táblából olvassa — nem igazolt vagy eltérő cím esetén elutasít (20261116000000). Pending + nem lejárt meghívó, atomikus állapotváltás, owner-sor védelme, felnőttkorlát a family_members triggerén. Gyermekenkénti jogot NEM ad.';
comment on function public.decline_family_guardian_invitation(uuid) is
  'Gondviselői meghívás elutasítása. Ugyanaz az igazolt-e-mail feltétel, mint az elfogadásnál (20261116000000); csak a meghívó státusza változik.';
