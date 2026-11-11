-- =====================================================================
-- Védett Család — családtag eltávolítása és önkéntes kilépés (2026-11-03)
-- =====================================================================
-- Döntések:
--   * Fizikai törlés HELYETT "revoked" státusz (a family_members.status
--     check már ismeri). Ok: a tagsági sor megmarad nyomon követhetőnek,
--     az RLS (is_family_member: csak 'active'), a felületi lekérdezések
--     (status = 'active'), a létszámkorlát (csak active/pending számít) és
--     az értesítési címzettek (csak active tagság) a revoked sort már most
--     is kizárják. Újbóli meghívás után az accept_family_guardian_invitation
--     upsertje a sort visszaállítja 'active'-ra (a korlát-trigger ellenőriz).
--   * Minimális eseményadat: revoked_at, revoked_by (ki hajtotta végre).
--     revoked_by = user_id -> önkéntes kilépés; más -> owner eltávolította.
--     Gyermekadat nincs benne. Új tábla nincs.
--   * Egy tranzakcióban: tagság visszavonása + az ADOTT család gyermekeire
--     vonatkozó guardian_child_permissions visszavonása + az eltávolított
--     e-mail-címére szóló, ebben a családban függő meghívók visszavonása
--     (különben azonnal visszaléphetne).
--   * Változatlan marad: gyermekprofilok, gyermekfiókok, napirend, utazási
--     státuszok és értesítési előzmények, guardian_authorizations (napló).
--     A jövőbeli utazási értesítésekből a címzett-számítás
--     (_child_travel_notification_recipients: aktív tagság + aktív jog)
--     automatikusan kizárja.
--   * Más családok jogai nem változnak: a gyermek pontosan egy családhoz
--     tartozik (family_children_child_id_unique), a visszavonás erre a
--     családra szűr.
--   * Párhuzamosság: ugyanaz a családonkénti advisory lock, mint a
--     létszámkorlátoknál ('family_capacity:<family_id>'), majd sorzár.
--   * A family_members közvetlen DELETE útja (RLS-policy + táblajog)
--     lezárva anon/authenticated számára. A fióktörlés és a család törlése
--     SECURITY DEFINER függvényeken / FK-kaszkádon fut, erre nem hat;
--     a service_role jogai változatlanok.
-- Függ: 20260926000000 (family_members, is_family_owner), 20260927000000
-- (guardian_child_permissions), 20260927000100 (meghívók). A 20261030 után
-- futtatandó (azonos lock-kulcs), de attól nem függ.
-- =====================================================================

-- 1. Minimális eseményadat --------------------------------------------
alter table public.family_members
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles (id) on delete set null;

-- Újraaktiváláskor (pl. új meghívó elfogadása) a visszavonási adat törlődik.
create or replace function public.family_members_clear_revocation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'revoked' then
    new.revoked_at := null;
    new.revoked_by := null;
  end if;
  return new;
end;
$$;
revoke all on function public.family_members_clear_revocation() from public, anon, authenticated;

drop trigger if exists family_members_clear_revocation on public.family_members;
create trigger family_members_clear_revocation
  before update of status on public.family_members
  for each row execute function public.family_members_clear_revocation();

-- 2. Közös belső művelet ---------------------------------------------
-- Csak a két nyilvános RPC hívja; jogosultságot NEM ellenőriz.
create or replace function public._family_member_revoke(p_member_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.family_members%rowtype;
  v_email text;
  v_perms int;
  v_invs int;
begin
  select * into v_m from public.family_members where id = p_member_id for update;

  update public.family_members
     set status = 'revoked', revoked_at = now(), revoked_by = p_actor
   where id = v_m.id;

  update public.guardian_child_permissions gcp
     set status = 'revoked', revoked_at = now(),
         can_view_schedule = false, can_manage_schedule = false,
         can_start_supervised_journey = false, can_view_active_journey = false,
         can_view_live_location = false
   where gcp.guardian_user_id = v_m.user_id
     and gcp.status = 'active'
     and gcp.child_id in (select fc.child_id from public.family_children fc where fc.family_id = v_m.family_id);
  get diagnostics v_perms = row_count;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_m.user_id;
  v_invs := 0;
  if v_email is not null then
    update public.family_guardian_invitations i
       set status = 'revoked', revoked_at = now()
     where i.family_id = v_m.family_id and i.status = 'pending' and i.invited_email = v_email;
    get diagnostics v_invs = row_count;
  end if;

  return jsonb_build_object('ok', true, 'revoked_permissions', v_perms, 'revoked_invitations', v_invs);
end;
$$;
revoke all on function public._family_member_revoke(uuid, uuid) from public, anon, authenticated;

-- 3. Owner eltávolít egy nem owner tagot ------------------------------
create or replace function public.remove_family_member(p_family_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.family_members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'Bejelentkezés szükséges.', hint = 'family_not_authenticated';
  end if;
  if p_family_id is null or p_user_id is null then
    raise exception using errcode = 'P0001', message = 'Hiányzó adat.', hint = 'family_invalid_input';
  end if;
  if p_user_id = v_uid then
    raise exception using errcode = 'P0001',
      message = 'Saját magadat nem távolíthatod el. Tulajdonosként előbb add át a családot.', hint = 'family_cannot_remove_self';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('family_capacity:' || p_family_id::text, 0));

  -- A hívó aktív owner ebben a családban (sorzárral, párhuzamos átadás ellen).
  perform 1 from public.family_members
   where family_id = p_family_id and user_id = v_uid and role = 'owner' and status = 'active'
   for share;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'Csak a család aktív tulajdonosa távolíthat el családtagot.', hint = 'family_not_owner';
  end if;

  select * into v_target from public.family_members
   where family_id = p_family_id and user_id = p_user_id
   for update;
  if not found or v_target.status not in ('active', 'pending') then
    raise exception using errcode = 'P0001',
      message = 'Ez a személy nem aktív tagja a családnak.', hint = 'family_member_not_found';
  end if;
  if v_target.role = 'owner' then
    raise exception using errcode = 'P0001',
      message = 'Tulajdonos ezen a felületen nem távolítható el.', hint = 'family_cannot_remove_owner';
  end if;

  return public._family_member_revoke(v_target.id, v_uid);
end;
$$;
revoke all on function public.remove_family_member(uuid, uuid) from public, anon;
grant execute on function public.remove_family_member(uuid, uuid) to authenticated;

-- 4. Nem owner tag önkéntes kilépése ----------------------------------
-- Nincs user-paraméter: kizárólag a hívó saját tagsága.
create or replace function public.leave_family(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_self public.family_members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'Bejelentkezés szükséges.', hint = 'family_not_authenticated';
  end if;
  if p_family_id is null then
    raise exception using errcode = 'P0001', message = 'Hiányzó adat.', hint = 'family_invalid_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('family_capacity:' || p_family_id::text, 0));

  select * into v_self from public.family_members
   where family_id = p_family_id and user_id = v_uid
   for update;
  if not found or v_self.status <> 'active' then
    raise exception using errcode = 'P0001',
      message = 'Nem vagy aktív tagja ennek a családnak.', hint = 'family_not_member';
  end if;
  if v_self.role = 'owner' then
    raise exception using errcode = 'P0001',
      message = 'Tulajdonosként nem léphetsz ki. Előbb add át a családot egy másik tagnak.', hint = 'family_owner_cannot_leave';
  end if;

  return public._family_member_revoke(v_self.id, v_uid);
end;
$$;
revoke all on function public.leave_family(uuid) from public, anon;
grant execute on function public.leave_family(uuid) to authenticated;

-- 5. Közvetlen DELETE kiskapu lezárása --------------------------------
drop policy if exists "family_members_delete_owner_or_admin" on public.family_members;
revoke delete on public.family_members from anon, authenticated;

-- ROLLBACK (kézzel, külön jóváhagyással):
--   drop function if exists public.remove_family_member(uuid, uuid), public.leave_family(uuid),
--     public._family_member_revoke(uuid, uuid);
--   drop trigger if exists family_members_clear_revocation on public.family_members;
--   drop function if exists public.family_members_clear_revocation();
--   a "family_members_delete_owner_or_admin" policy visszaállítása a 20260926000000 szerint
--   (434–437. sor) és a DELETE jog visszaadása kizárólag azoknak a szerepköröknek, amelyeknél
--   élesítés előtt megvolt (has_table_privilege lekérdezéssel rögzítendő).
--   A revoked_at / revoked_by oszlopok megtarthatók (nullable, adatvesztés nélkül).
