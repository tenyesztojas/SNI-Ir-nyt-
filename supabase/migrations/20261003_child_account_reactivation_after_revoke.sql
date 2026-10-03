-- ────────────────────────────────────────────────────────────────
-- Gyermekfiók — ÉLES HIBAJAVÍTÁS: revoke után a visszakapcsolás
-- (re-link) jelenleg lehetetlen
-- ────────────────────────────────────────────────────────────────
-- FORWARD-ONLY, ADDITÍV migráció. NEM módosítja a child_accounts
-- táblát, a UNIQUE constraint-eket vagy a CHECK constraint-eket —
-- KIZÁRÓLAG CREATE OR REPLACE FUNCTION-nel cseréli a két érintett
-- függvényt.
--
-- GYÖKÉROK (lásd a child_accounts tábla definícióját,
-- 20260927_child_account_foundation.sql):
--   1) child_accounts.child_id ÉS child_accounts.auth_user_id
--      MINDKETTŐ külön-külön UNIQUE NOT NULL — tehát egy childhoz és
--      egy auth userhez a TELJES TÖRTÉNELEM alatt LEGFELJEBB egy-egy
--      child_accounts sor létezhet, státusztól függetlenül. Egy
--      revoked sor megléte ezért ÖNMAGÁBAN is lehetetlenné teszi egy
--      ÚJ sor insertelését ugyanahhoz a childhoz vagy userhez — ez
--      NEM bug, hanem a séma szándékos, szoros egyediség-garanciája.
--   2) child_accounts_guard_status_transition() trigger a
--      revoked -> BÁRMI átmenetet feltétel nélkül blokkolja (ezt a
--      korábbi audit "szándékosan irreverzibilis"-nek jelezte).
--   3) accept_child_account_invitation() a duplikátum-védelmi
--      ellenőrzéseket (auth_user_id már van sora / child_id már van
--      sora) STÁTUSZTÓL FÜGGETLENÜL, bármilyen (tehát revoked) sorra
--      is lefuttatta, és revoked sor esetén is "már kapcsolva" hibát
--      dobott, majd — mivel a UNIQUE constraint miatt INSERT sem
--      lehetséges — a felhasználó véglegesen kizáródott az
--      újra-linkelésből.
--
-- JAVÍTÁS: a kettős UNIQUE constraint miatt egy revoked sor
-- ÚJRAFELHASZNÁLÁSA (UPDATE a meglévő sorra) az EGYETLEN lehetséges
-- út egy új elfogadáshoz — ÚJ sor sosem insertelhető, ha már van
-- bármilyen (akár revoked) sor a childhoz VAGY a userhez. Ezért:
--   a) a trigger MINIMÁLISAN kiegészül egy explicit
--      revoked -> active kivétellel (minden más revoked -> X átmenet
--      TOVÁBBRA IS blokkolva marad — a trigger nem válik általános
--      "revoke visszavonható" mechanizmussá);
--   b) accept_child_account_invitation() a duplikátum-ellenőrzéseket
--      KIZÁRÓLAG 'active' státuszú sorokra szűkíti (a termék-
--      szemantika szerint csak az ACTIVE számít "jelenleg linkelt"-nek
--      — lásd a feladat PRODUCT SEMANTICS szekcióját), majd egy
--      meglévő (a childhoz ÉS/VAGY a userhez tartozó) revoked sort
--      ÚJRAHASZNÁL (UPDATE: status='active', activated_at=now(),
--      revoked_at=null, source_invitation_id=az ÚJ meghívó), új
--      historikus sort SOHA nem hoz létre, meglévő revoked sort SOHA
--      nem töröl.
--
-- A REAKTIVÁLÁS KIZÁRÓLAG ezen a SECURITY DEFINER RPC-n keresztül,
-- KIZÁRÓLAG sikeres, érvényes token-ellenőrzés UTÁN érhető el — nincs
-- RLS UPDATE policy a child_accounts táblán (csak SELECT, lásd
-- 20260927_child_account_foundation.sql), tehát semmilyen kliens nem
-- tud közvetlenül UPDATE-elni ezen a táblán; az egyetlen más RPC, ami
-- ide ír (revoke_child_account), csak active/suspended -> revoked
-- irányba módosít, a trigger kiegészítése ezt nem érinti. A token-
-- validáció (hash-elés, lejárat, egyszer-használhatóság, used_at), a
-- family_members-tagsági blokk és a status-tranzíció ÖSSZES többi
-- szabálya BYTE-RA VÁLTOZATLAN.

-- ────────────────────────────────────────────────────────────────
-- 1. child_accounts_guard_status_transition() — minimális kivétel
-- ────────────────────────────────────────────────────────────────
create or replace function public.child_accounts_guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- KIZÁRÓLAG EGY explicit kivétel a "revoked véglegesített" szabály
  -- alól: revoked -> active. Minden más revoked -> X átmenet
  -- (pending, suspended, vagy revoked -> revoked no-op-on érintetlen
  -- marad) TOVÁBBRA IS feltétel nélkül blokkolva — ez NEM teszi a
  -- revoke-ot általánosan visszavonhatóvá, csak az explicit,
  -- meghívás-alapú újra-linkelést (accept_child_account_invitation())
  -- engedi át, AMI az egyetlen hívó, ami revoked -> active UPDATE-et
  -- egyáltalán kiadhat (nincs RLS UPDATE policy ezen a táblán).
  if old.status = 'revoked' and new.status is distinct from 'revoked'
     and new.status is distinct from 'active' then
    raise exception
      'A gyermek-account visszavonása véglegesített állapot, nem állítható vissza (child_account id=%)',
      old.id;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('active', 'revoked'))
      or (old.status = 'active' and new.status in ('suspended', 'revoked'))
      or (old.status = 'suspended' and new.status in ('active', 'revoked'))
      or (old.status = 'revoked' and new.status = 'active')
    ) then
      raise exception
        'Érvénytelen gyermek-account állapotváltás: % -> % (child_account id=%)',
        old.status, new.status, old.id;
    end if;
  end if;

  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 2. accept_child_account_invitation(text) — reaktiválás meglévő
--    revoked sor UPDATE-jével, státusz-szűkített duplikátum-védelem
-- ────────────────────────────────────────────────────────────────
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
  v_existing_by_child uuid;
  v_existing_by_user uuid;
  v_reuse_id uuid;
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

  -- TERMÉK-SZEMANTIKA (lásd a feladat PRODUCT SEMANTICS szekcióját):
  -- KIZÁRÓLAG 'active' számít "jelenleg linkelt"-nek — egy revoked
  -- sor NEM blokkolja az új elfogadást, csak egy MÁSIK aktív sor.
  if exists (
    select 1 from public.child_accounts
    where auth_user_id = v_uid and status = 'active'
  ) then
    raise exception 'Ez a felhasználói fiók már egy másik gyermek-accounthoz van kapcsolva';
  end if;

  if exists (
    select 1 from public.child_accounts
    where child_id = v_child_id and status = 'active'
  ) then
    raise exception 'Ehhez a gyermekhez már létezik gyermek-account';
  end if;

  -- A child_accounts.child_id ÉS .auth_user_id mindkettő külön UNIQUE
  -- (lásd a migráció fejléc-kommentjét) — ÚJ sor insertelése LEHETETLEN,
  -- ha már létezik BÁRMILYEN (ezen a ponton csakis revoked, mert az
  -- active esetet a fenti két ellenőrzés már kizárta) sor a childhoz
  -- VAGY a userhez. Ezért itt EXPLICIT megkeressük az esetleg
  -- újrahasznosítandó sort mindkét kulcs szerint.
  select id into v_existing_by_child
  from public.child_accounts
  where child_id = v_child_id;

  select id into v_existing_by_user
  from public.child_accounts
  where auth_user_id = v_uid;

  if v_existing_by_child is not null
     and v_existing_by_user is not null
     and v_existing_by_child <> v_existing_by_user then
    -- Ritka, egymásnak nem megfelelő "kettős stale" eset: a childhoz
    -- és a userhez is létezik egy-egy, de KÜLÖNBÖZŐ revoked sor — egy
    -- sima UPDATE nem elégítené ki egyszerre mindkét UNIQUE
    -- constraint-et row-törlés/összevonás nélkül. Szándékosan NEM
    -- próbálunk itt automatikus sor-összevonást/törlést végezni (ez
    -- tönkretenné a historikus auditot) — explicit, informatív hibát
    -- dobunk, hogy ezt az esetet manuálisan, tudatosan kelljen
    -- kezelni.
    raise exception
      'A gyermekfiók-helyreállítás nem egyértelmű: a childhoz és a felhasználóhoz is különböző korábbi gyermekfiók-bejegyzés tartozik (child_account id=% és id=%) — kézi felülvizsgálat szükséges',
      v_existing_by_child, v_existing_by_user;
  end if;

  v_reuse_id := coalesce(v_existing_by_child, v_existing_by_user);

  if v_reuse_id is not null then
    -- Reaktiválás: a MEGLÉVŐ (revoked) sor frissítése — SOHA nem
    -- törli, SOHA nem hoz létre új historikus sort. A
    -- child_accounts_non_revoked_has_no_revoked_at CHECK constraint
    -- miatt revoked_at-ot EXPLICIT null-ra kell állítani, különben a
    -- constraint elutasítaná az UPDATE-et.
    update public.child_accounts
    set auth_user_id = v_uid,
        child_id = v_child_id,
        status = 'active',
        activated_at = now(),
        revoked_at = null,
        source_invitation_id = v_invitation_id
    where id = v_reuse_id
    returning id into v_account_id;
  else
    insert into public.child_accounts
      (child_id, auth_user_id, status, activated_at, source_invitation_id)
    values
      (v_child_id, v_uid, 'active', now(), v_invitation_id)
    returning id into v_account_id;
  end if;

  return v_account_id;
end;
$$;
