-- VédettSarok — Family modul: a family_db_beta pilot-gate ELTÁVOLÍTÁSA
-- az invite_family_guardian() RPC-ből.
-- Dátum: 2026-10-01
--
-- CÉL: a Family guardian-meghívás funkció MOST már a valódi /csalad
-- produkciós UI-n keresztül használt, nem csak zárt bétás pilot
-- felhasználóknak — a has_pilot_access('family_db_beta') ellenőrzés
-- emiatt OBSZOLÉT lett ezen az RPC-n, és jelenleg hibásan elutasítja
-- az egyébként jogosult (aktív owner) hívásokat is, ha az owner
-- saját profilján nincs beállítva a family_db_beta pilot flag.
--
-- EZ A MIGRÁCIÓ KIZÁRÓLAG EZT A SZŰK HIBÁT JAVÍTJA:
--   - EGYETLEN function: invite_family_guardian(uuid, text) —
--     CREATE OR REPLACE FUNCTION, UGYANAZZAL a szignatúrával.
--   - A MÁR MEGLÉVŐ 20260927_family_guardian_invitation_foundation.sql
--     fájlt NEM módosítjuk (az már production-ben lefutott — ez itt
--     egy ÚJ, forward-only migráció, ugyanúgy, mint minden korábbi
--     CREATE OR REPLACE FUNCTION-alapú javítás ebben a projektben).
--   - Az is_family_owner(p_family_id) ellenőrzés TELJES EGÉSZÉBEN
--     MEGMARAD, szó szerint ugyanott, ugyanazzal a hibaüzenettel — ez
--     a jogosultság-ellenőrzés egyetlen karaktere sem változik.
--   - Minden egyéb ellenőrzés/logika (bejelentkezés-ellenőrzés,
--     e-mail normalizálás/validálás, önmeghívás-blokkolás, 168 órás
--     TTL, unique_violation kezelés) SZÓ SZERINT MEGEGYEZIK az eredeti
--     migrációban lévő verzióval — az EGYETLEN különbség a lenti diff:
--     a `has_pilot_access('family_db_beta')` IF-blokk teljes törlése.
--
--   - revoke_family_guardian_invitation(uuid) NEM igényel javítást:
--     ellenőrzött (lásd az eredeti migrációt), az a function SOHA nem
--     tartalmazott family_db_beta/has_pilot_access ellenőrzést —
--     kizárólag is_family_owner()-t kér, ami helyes és változatlan.
--
-- NINCS ebben a migrációban (szándékosan):
--   - tábla/RLS/policy módosítás (a has_pilot_access(), is_family_owner()
--     helperek, a family_guardian_invitations tábla és annak RLS
--     policy-ja TELJESEN érintetlen);
--   - accept_family_guardian_invitation()/decline_family_guardian_invitation()
--     módosítás (azok sosem igényeltek family_db_beta-t, a recipiens
--     jogosultságát a saját session e-mail-je igazolja, nem egy pilot
--     flag);
--   - guardian_child_permissions / child/schedule RLS / journey/GPS
--     jogosultság módosítás.
--
-- ────────────────────────────────────────────────────────────────
-- BIZTONSÁGI GARANCIA (a family_db_beta eltávolítása UTÁN is):
--
--   - authenticated hívó kötelező (auth.uid() is null check, változatlan);
--   - az adott family AKTÍV, 'owner' role-ú tagsága KÖTELEZŐ
--     (is_family_owner(p_family_id), változatlan — ez a KIZÁRÓLAGOS
--     jogosultság-forrás, nem az általános family-tagság: egy
--     guardian-role-ú tag az is_family_owner() definíciója szerint
--     (role = 'owner' AND status = 'active') SOHA nem térhet vissza
--     true-val, tehát guardian NEM hívhatja meg ezt az RPC-t sikeresen
--     — ugyanúgy, mint egy, a familyhez egyáltalán nem tartozó user);
--   - a function továbbra is SECURITY DEFINER + explicit
--     REVOKE FROM PUBLIC/anon + GRANT TO authenticated (az 5. szakasz
--     EXECUTE-grantjai az eredeti migrációból MEGMARADNAK, ez a
--     migráció nem ad ki új grantot — a CREATE OR REPLACE FUNCTION
--     nem törli a meglévő EXECUTE jogosultságokat).
--
-- Additív, idempotens (CREATE OR REPLACE FUNCTION), biztonságosan
-- újrafuttatható migráció.

create or replace function public.invite_family_guardian(
  p_family_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_email text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges családtag meghívásához';
  end if;

  -- OBSZOLÉT family_db_beta pilot-gate ELTÁVOLÍTVA (lásd a fájl
  -- fejét) — a Family guardian-meghívás MOST már a valódi /csalad
  -- produkciós UI-n keresztül használt funkció, nem zárt béta. Az
  -- EGYETLEN jogosultság-forrás innentől is_family_owner(), amely
  -- lentebb VÁLTOZATLANUL megmarad.

  if not public.is_family_owner(p_family_id) then
    raise exception 'Csak a family aktív ownerje hívhat meg új családtagot';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'E-mail-cím megadása kötelező';
  end if;

  v_email := lower(btrim(p_email));

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Érvénytelen e-mail-cím formátum';
  end if;

  -- Önmeghívás blokkolása. auth.email() a hívó SAJÁT, session-beli
  -- e-mail-címe — ha ez null (pl. telefonszám-alapú auth, nincs
  -- ismert email-claim), az összehasonlítás NULL-safe módon nem
  -- egyezik semmivel, tehát nem blokkol feleslegesen, de ez esetben
  -- a recipiens-oldali RPC-k (accept/decline) is elutasítanák a hívót
  -- (lower(auth.email()) = invited_email sosem lehet igaz NULL
  -- auth.email()-re) — konzisztens, fail-closed viselkedés.
  v_caller_email := auth.email();
  if v_caller_email is not null and v_email = lower(v_caller_email) then
    raise exception 'Nem hívhatod meg saját magadat családtagként';
  end if;

  v_expires_at := now() + interval '168 hours';

  begin
    insert into public.family_guardian_invitations (family_id, invited_by, invited_email, status, expires_at)
    values (p_family_id, v_uid, v_email, 'pending', v_expires_at)
    returning id into v_invitation_id;
  exception
    when unique_violation then
      raise exception 'Ehhez a családhoz és e-mail-címhez már létezik függő meghívás — vond vissza a meglévőt, mielőtt újat küldenél';
  end;

  return v_invitation_id;
end;
$$;

comment on function public.invite_family_guardian(uuid, text) is
  'Owner-gated (is_family_owner) családtag-meghívás e-mail alapján. A family_db_beta pilot-gate 2026-10-01-én eltávolítva (lásd 20261001_family_guardian_invitation_remove_pilot_gate.sql) — a funkció a valódi /csalad produkciós UI-n keresztül használt, nem zárt béta.';

-- ============================================================
-- ROLLBACK
-- ============================================================
-- CREATE OR REPLACE FUNCTION-alapú migráció — visszaállításhoz az
-- EREDETI (has_pilot_access('family_db_beta') ellenőrzést is
-- tartalmazó) function-definíciót kellene újra lefuttatni, szó
-- szerint az eredeti
-- 20260927_family_guardian_invitation_foundation.sql 4.1 szakaszából
-- (az eredeti fájlt magát NEM kell/szabad módosítani).
