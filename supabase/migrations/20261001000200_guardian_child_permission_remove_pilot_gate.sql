-- VédettSarok — Family modul: a family_db_beta pilot-gate ELTÁVOLÍTÁSA
-- az upsert_guardian_child_permission() OWNER-ágáról (production hiba,
-- 2026-10-01).
--
-- ROOT CAUSE: a Family onboarding/hozzáférés-modell ezen a ponton már
-- túlnőtt a family_db_beta rollout-flagen — egy owner MOST már a
-- rollout-flag NÉLKÜL is kezelheti a MEGLÉVŐ családját (lásd
-- 20261001_family_guardian_invitation_remove_pilot_gate.sql és
-- 20261001_family_schedule_authorization_completion.sql: a meghívás-
-- elfogadás és a napirend-írás owner-ága már korábban megkapta ugyanezt
-- a javítást). Az upsert_guardian_child_permission() RPC-t azonban
-- EKKOR kimaradt a hasonló javításból — az owner-ág a MAI napig
-- megkövetelte a has_pilot_access('family_db_beta')-t, ami a
-- production hibát okozta: "family_db_beta hozzáférés szükséges
-- guardian jogosultság megadásához".
--
-- EZ A MIGRÁCIÓ KIZÁRÓLAG a has_pilot_access('family_db_beta') IF-blokk
-- törlését végzi az upsert_guardian_child_permission() owner-oldali
-- ellenőrzéséből. NEM MÓDOSÍTJA:
--   - a caller-authentikáció ellenőrzését (v_uid is null check);
--   - a is_child_family_owner(p_child_id) owner-ellenőrzést;
--   - a target guardian aktív family_members-tagság ellenőrzését
--     (family_children + family_members join, fm.status = 'active');
--   - az 5 permission flag kezelését/validációját;
--   - az insert/on-conflict-do-update (upsert) logikát, a status/
--     granted_at/revoked_at mezőket;
--   - a function signature-t, a SECURITY DEFINER / search_path
--     beállítást;
--   - a meglévő GRANT/REVOKE EXECUTE jogosultságokat (azok a
--     CREATE OR REPLACE FUNCTION-től függetlenül, külön statementek,
--     ezért automatikusan megmaradnak — nincs szükség újra kiadni
--     őket).
--
-- A revoke_guardian_child_permission() RPC-t (lásd
-- supabase/migrations/20260927_child_account_foundation.sql) NEM
-- tartalmazza ugyanez a has_pilot_access('family_db_beta') feltétel —
-- az owner-ellenőrzése KIZÁRÓLAG is_child_family_owner(p_child_id),
-- tehát ott NINCS obszolét rollout-gate, amit el kellene távolítani.
-- Ez a migráció ezért SZÁNDÉKOSAN NEM módosítja
-- revoke_guardian_child_permission()-t.
--
-- NINCS RLS-módosítás, NINCS family-membership-szabály módosítás,
-- NINCS child-láthatósági/napirend-authorizációs módosítás, NINCS
-- meghívás-logika módosítás, NINCS tábla/oszlop/index/trigger/grant
-- módosítás — forward-only, additív migráció.

create or replace function public.upsert_guardian_child_permission(
  p_child_id uuid,
  p_guardian_user_id uuid,
  p_can_view_schedule boolean default false,
  p_can_manage_schedule boolean default false,
  p_can_start_supervised_journey boolean default false,
  p_can_view_active_journey boolean default false,
  p_can_view_live_location boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges guardian jogosultság megadásához';
  end if;

  -- OBSZOLÉT family_db_beta pilot-gate ELTÁVOLÍTVA (lásd a fájl fejét) —
  -- a tényleges jogosultságot ettől függetlenül VÁLTOZATLANUL a lenti
  -- is_child_family_owner(p_child_id) owner-ellenőrzés ÉS a target
  -- guardian aktív family_members-tagságának ellenőrzése adja.
  if not public.is_child_family_owner(p_child_id) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje adhat guardian jogosultságot';
  end if;

  if not exists (
    select 1
    from public.family_children fc
    join public.family_members fm
      on fm.family_id = fc.family_id
    where fc.child_id = p_child_id
      and fm.user_id = p_guardian_user_id
      and fm.status = 'active'
  ) then
    raise exception 'A megadott guardian_user_id nem aktív tagja a gyermek családjának';
  end if;

  insert into public.guardian_child_permissions (
    child_id,
    guardian_user_id,
    can_view_schedule,
    can_manage_schedule,
    can_start_supervised_journey,
    can_view_active_journey,
    can_view_live_location,
    status,
    granted_at,
    revoked_at
  )
  values (
    p_child_id,
    p_guardian_user_id,
    coalesce(p_can_view_schedule, false),
    coalesce(p_can_manage_schedule, false),
    coalesce(p_can_start_supervised_journey, false),
    coalesce(p_can_view_active_journey, false),
    coalesce(p_can_view_live_location, false),
    'active',
    now(),
    null
  )
  on conflict (child_id, guardian_user_id)
  do update set
    can_view_schedule = coalesce(p_can_view_schedule, false),
    can_manage_schedule = coalesce(p_can_manage_schedule, false),
    can_start_supervised_journey = coalesce(p_can_start_supervised_journey, false),
    can_view_active_journey = coalesce(p_can_view_active_journey, false),
    can_view_live_location = coalesce(p_can_view_live_location, false),
    status = 'active',
    granted_at = now(),
    revoked_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_guardian_child_permission(uuid, uuid, boolean, boolean, boolean, boolean, boolean) is
  'Owner (is_child_family_owner) adhat/módosíthat guardian_child_permissions sort egy SAJÁT gyermekéhez, KIZÁRÓLAG egy, a gyermek családjában aktív family_members-tagsággal rendelkező guardian_user_id-ra. A family_db_beta rollout-flag NEM követelmény (2026-10-01-én eltávolítva, lásd 20261001_guardian_child_permission_remove_pilot_gate.sql) — ugyanaz a döntés, mint a meghívás-elfogadás és a napirend-írás owner-ágán.';

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Additív, nem-destruktív migráció — csak a function definícióját
-- cseréli, nem hoz létre/töröl táblát, oszlopot, indexet, triggert
-- vagy grantot. Visszavonás esetén az EREDETI (has_pilot_access(
-- 'family_db_beta')-t is tartalmazó) definíció visszaállítható a
-- supabase/migrations/20260927_child_account_foundation.sql fájlból,
-- ugyanezzel a CREATE OR REPLACE FUNCTION mintával.
