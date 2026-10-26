-- ────────────────────────────────────────────────────────────────
-- Gyermekfiók v1 — ZÁRÓ HARDENING a commit előtt
-- ────────────────────────────────────────────────────────────────
-- FORWARD-ONLY, ADDITÍV migráció. NEM módosítja a
-- 20260927_child_account_foundation.sql-ben már DEFINIÁLT táblákat
-- (csak EGY ÚJ, nullable oszlopot ad hozzá a child_accounts táblához)
-- és KIZÁRÓLAG CREATE OR REPLACE FUNCTION-nel cseréli a két érintett
-- RPC-t — a token-hash-elés, a lejárat-ellenőrzés, a status-
-- átmenetek, a used_at-kezelés, a child-self RLS, a family-tagsági
-- szabályok és a duplikált-account védelem BYTE-RA VÁLTOZATLANOK.
--
-- KÉT, EGYMÁSTÓL FÜGGETLEN célzott korrekció:
--   1) child_accounts.source_invitation_id — a pontos
--      meghívó -> account kapcsolat EXPLICIT rögzítése, hogy a
--      jövőben NE kelljen timestamp-alapú következtetésre hagyatkozni
--      (lásd az előző feladat auditability-jelentését).
--   2) create_child_account_invitation() — a has_pilot_access(
--      'family_db_beta') kapu törlése, UGYANAZZAL a mintával, mint a
--      20261001_guardian_child_permission_remove_pilot_gate.sql és a
--      20261001_family_guardian_invitation_remove_pilot_gate.sql
--      migrációknál: KIZÁRÓLAG az owner-oldali rollout-flag törölve,
--      a valódi jogosultság-ellenőrzés (is_child_family_owner)
--      ÉRINTETLEN marad.

-- ────────────────────────────────────────────────────────────────
-- 1. child_accounts.source_invitation_id
-- ────────────────────────────────────────────────────────────────
-- NULLABLE — egy child_account sor elvileg létezhetne meghívó nélkül
-- is (bár a jelenlegi egyetlen RPC, ami child_accounts sort létrehoz,
-- az accept_child_account_invitation, mindig egy konkrét meghívóból
-- indul ki), és NULLABLE oszlopot kér a feladat is ("nullable source
-- invitation reference").
--
-- FK DELETE VISELKEDÉS: "on delete restrict" — SZÁNDÉKOSAN, UGYANAZ a
-- minta, mint a child_accounts.child_id FK-nál pár sorral feljebb
-- (references public.child_profiles (id) on delete restrict). Az
-- "on delete cascade" itt VESZÉLYES lenne: egy child_account_
-- invitations sor törlése (ha valaha lenne ilyen útvonal) a
-- hozzá tartozó, ÉRTÉKES audit-adatot hordozó child_accounts sort is
-- törölné — pontosan azt az információt veszítenénk el, amit ez a
-- migráció MEGŐRIZNI akar (lásd a feladat "Historical auditability is
-- important" megjegyzését). "on delete set null" sem jó választás:
-- csendben elvágná a kapcsolatot, és a jövőben ÚJRA
-- timestamp-alapú következtetésre kényszerítené az audit-lekérdezést
-- — pontosan azt a problémát állítaná vissza, amit ez a migráció
-- megszüntet. "on delete restrict" garantálja, hogy egy még
-- hivatkozott meghívó-sor SOSE törölhető véletlenül/észrevétlenül —
-- jelenleg amúgy sincs olyan RPC, ami egyáltalán DELETE-elne egy
-- child_account_invitations sort (kizárólag UPDATE-ek vannak), tehát
-- ez a választás a gyakorlatban nem korlátoz semmit, csak explicit
-- véd egy jövőbeli, véletlen DELETE ellen.
alter table public.child_accounts
  add column if not exists source_invitation_id uuid
    references public.child_account_invitations (id) on delete restrict;

comment on column public.child_accounts.source_invitation_id is
  'Az accept_child_account_invitation(text) RPC hívásban pontosan melyik child_account_invitations sor elfogadása hozta létre ezt a child_accounts sort. NULLABLE (elméleti jövőbeli account-létrehozási útvonalak miatt), de az accept_child_account_invitation MINDIG kitölti. ON DELETE RESTRICT — lásd a migráció fejléc-kommentjét: a cél a pontos audit-lánc megőrzése, timestamp-alapú következtetés nélkül.';

create index if not exists idx_child_accounts_source_invitation_id
  on public.child_accounts (source_invitation_id);

-- ────────────────────────────────────────────────────────────────
-- 2. accept_child_account_invitation(text) — source_invitation_id
--    rögzítése
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260927_child_account_foundation.sql): a UPDATE ...
-- RETURNING csak a child_id-t olvasta ki (`returning child_id into
-- v_child_id`), az INSERT ... child_accounts nem hivatkozott semmilyen
-- meghívó-azonosítóra.
--
-- ÚJ: a UPDATE ... RETURNING MOST az invitation id-t IS kiolvassa
-- (`returning id, child_id into v_invitation_id, v_child_id`), és az
-- INSERT ... child_accounts a kapott v_invitation_id-t írja a
-- source_invitation_id oszlopba. MINDEN EGYÉB sor (token-hash-elés,
-- lejárat-/status-feltétel a UPDATE WHERE-ben, a két duplikált-account
-- ellenőrzés, a "nincs aktív family_members sora" ellenőrzés, a
-- visszatérési érték) BYTE-RA VÁLTOZATLAN.
create or replace function public.accept_child_account_invitation(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text;
  v_invitation_id uuid;
  v_child_id uuid;
  v_account_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges a meghívó elfogadásához';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'Érvénytelen meghívó token';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.user_id = v_uid
      and fm.status = 'active'
  ) then
    raise exception 'Ez a felhasználói fiók jelenleg aktív tagja egy familynek (owner vagy guardian) — meglévő felnőtt/családtag fiók nem linkelhető gyermek-accountként';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  update public.child_account_invitations
  set status = 'accepted',
      used_at = now()
  where token_hash = v_token_hash
    and status = 'pending'
    and expires_at > now()
  returning id, child_id into v_invitation_id, v_child_id;

  if v_child_id is null then
    raise exception 'Érvénytelen, lejárt, visszavont vagy már felhasznált meghívó';
  end if;

  if exists (
    select 1 from public.child_accounts
    where auth_user_id = v_uid
  ) then
    raise exception 'Ez a felhasználói fiók már egy másik gyermek-accounthoz van kapcsolva';
  end if;

  if exists (
    select 1 from public.child_accounts
    where child_id = v_child_id
  ) then
    raise exception 'Ehhez a gyermekhez már létezik gyermek-account';
  end if;

  insert into public.child_accounts
    (child_id, auth_user_id, status, activated_at, source_invitation_id)
  values
    (v_child_id, v_uid, 'active', now(), v_invitation_id)
  returning id into v_account_id;

  return v_account_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 3. create_child_account_invitation(...) — family_db_beta kapu
--    törlése
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260927_child_account_foundation.sql):
--   if not public.has_pilot_access('family_db_beta') then
--     raise exception 'family_db_beta hozzáférés szükséges meghívó létrehozásához';
--   end if;
--
-- ÚJ: ez a blokk TELJESEN törölve. MINDEN MÁS feltétel (bejelentkezés,
-- is_child_family_owner(p_child_id), a TTL-tartomány-ellenőrzés, az
-- "egy gyermekhez legfeljebb egy nem-revoked account" ellenőrzés, a
-- korábbi pending meghívók automatikus visszavonása, a token
-- generálás/hash-elés, a unique_violation kezelése) BYTE-RA
-- VÁLTOZATLAN. Ugyanaz a termék-döntés és minta, mint a
-- 20261001_guardian_child_permission_remove_pilot_gate.sql és a
-- 20261001_family_guardian_invitation_remove_pilot_gate.sql
-- migrációknál: a family_db_beta rollout-flag a UI/kinyitás-kontroll
-- feladata, NEM egy már legitim family owner meglévő gyermekéhez
-- tartozó Gyermekfiók-funkció használatának gátja.
create or replace function public.create_child_account_invitation(
  p_child_id uuid,
  p_ttl_hours integer default 72
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges meghívó létrehozásához';
  end if;

  if not public.is_child_family_owner(p_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje hozhat létre gyermek-account meghívót';
  end if;

  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 720 then
    raise exception 'A meghívó érvényességi ideje 1 és 720 óra (30 nap) között kell legyen';
  end if;

  if exists (
    select 1 from public.child_accounts ca
    where ca.child_id = p_child_id and ca.status <> 'revoked'
  ) then
    raise exception 'Ehhez a gyermekhez már létezik gyermek-account (pending/active/suspended)';
  end if;

  update public.child_account_invitations
  set status = 'revoked', revoked_at = now()
  where child_id = p_child_id and status = 'pending';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + (p_ttl_hours || ' hours')::interval;

  begin
    insert into public.child_account_invitations
      (child_id, created_by, token_hash, expires_at)
    values
      (p_child_id, v_uid, v_token_hash, v_expires_at)
    returning id into v_invitation_id;
  exception
    when unique_violation then
      raise exception 'Ehhez a gyermekhez éppen most jött létre másik függő meghívó egy konkurens kérésből — próbáld újra';
  end;

  return query select v_invitation_id, v_raw_token, v_expires_at;
end;
$$;
