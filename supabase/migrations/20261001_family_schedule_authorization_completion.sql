-- VédettSarok — Family Napirend: hitelesítési hiányok lezárása.
-- Dátum: 2026-10-01
--
-- CÉL (2 szűk, egymástól független javítás a MÁR ÉLES Napirend
-- hitelesítési modellen):
--
--   A) GUARDIAN CHILD IDENTITY — a 20260927_guardian_child_permission_
--      hardening_v1.sql SZÁNDÉKOSAN deferrelte ("egy KÉSŐBBI, külön
--      kontrollált megoldás feladata") a guardian minimális
--      child-identitás hozzáférését. A Napirend UI-nak ez most már
--      kell: egy guardian, akinek EXPLICIT, AKTÍV
--      guardian_child_permissions sora van (can_view_schedule VAGY
--      can_manage_schedule = true) ÉS jelenleg is aktív, 'guardian'
--      role-ú family_members tagja a child familyjének, kapjon
--      SELECT-et a family_children kapcsoló-sorra és a child_profiles
--      sorra — KIZÁRÓLAG ehhez a szűk célhoz, sima membership vagy
--      journey/GPS-only permission sor NEM elég.
--
--   B) OWNER SCHEDULE WRITE — a family_db_beta pilot-gate OBSZOLÉT az
--      owner-oldali schedule write ágon (ugyanaz a hiba-osztály, mint
--      a korábbi invite_family_guardian javításnál, lásd
--      20261001_family_guardian_invitation_remove_pilot_gate.sql) — a
--      Napirend MOST már a valódi /csalad UI része, nem zárt béta.
--
-- EZ A MIGRÁCIÓ KIZÁRÓLAG EZT A KÉT HIÁNYT JAVÍTJA:
--   - family_children SELECT policy (redefiníció — ÚJ guardian ág)
--   - child_profiles SELECT policy (redefiníció — ÚJ guardian ág)
--   - child_schedule_items UPDATE / DELETE policy (redefiníció —
--     KIZÁRÓLAG az owner-ágról törölve a family_db_beta feltétel)
--   - create_child_schedule_item / update_child_schedule_item RPC
--     (redefiníció — KIZÁRÓLAG az owner-ágról törölve a family_db_beta
--     feltétel, minden egyéb validációs logika SZÓ SZERINT megegyezik)
--
-- NEM MÓDOSÍT (szándékosan):
--   - a MEGLÉVŐ migrációs fájlok szövegét (ez egy ÚJ, additív fájl);
--   - semelyik is_admin() bypasst;
--   - a guardian_child_permissions / family_members / family_children /
--     child_profiles / child_schedule_items tábla schemáját (nincs új
--     oszlop, nincs új tábla);
--   - a guardian schedule WRITE (can_manage_schedule) feltételét — az
--     MÁR eddig is beta-mentes volt és MARAD;
--   - a child_schedule_items SELECT policy owner-ágát — az MÁR eddig
--     is beta-mentes volt (is_child_family_owner, has_pilot_access
--     NÉLKÜL) — csak a UPDATE/DELETE owner-ág tartalmazta a felesleges
--     beta-feltételt;
--   - a child-self / admin ágakat sehol;
--   - a GRANT/REVOKE EXECUTE jogosultságokat — egy CREATE OR REPLACE
--     FUNCTION nem törli a meglévő grantokat, nincs is rá szükség.
--
-- Additív, idempotens migráció (DROP POLICY IF EXISTS + CREATE POLICY,
-- CREATE OR REPLACE FUNCTION) — biztonságosan újrafuttatható. Ez a
-- fájl NEM lett alkalmazva semmilyen adatbázisra — csak létrehozva és
-- auditálva. Kézi jóváhagyás és `supabase db push` szükséges.

-- ────────────────────────────────────────────────────────────────
-- A.1 family_children SELECT — guardian child-identity ág hozzáadása
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260927_guardian_child_permission_hardening_v1.sql):
--   using (public.is_admin() or public.is_family_owner(family_id));
--
-- ÚJ: a fenti két ág VÁLTOZATLAN, egy ÚJ guardian-ág kerül hozzá —
-- KIZÁRÓLAG akkor enged, ha a hívónak van SAJÁT (guardian_user_id =
-- auth.uid()), AKTÍV (status='active') guardian_child_permissions
-- sora EHHEZ a child_id-hez, can_view_schedule VAGY can_manage_schedule
-- = true FLAGGEL, ÉS a hívó JELENLEG IS aktív, 'guardian' role-ú tagja
-- EZEN A SOR family_id-jén (a family_children.family_id közvetlenül
-- elérhető itt, nincs szükség külön join-ra a saját táblájára).
-- Journey/GPS-only permission sor (can_start_supervised_journey stb.)
-- ÖNMAGÁBAN NEM elég — csak a schedule-flagek.
drop policy if exists "family_children_select_via_membership" on public.family_children;
create policy "family_children_select_via_membership"
  on public.family_children for select
  using (
    public.is_admin()
    or public.is_family_owner(family_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = family_children.child_id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and (gcp.can_view_schedule or gcp.can_manage_schedule)
        and exists (
          select 1 from public.family_members fm
          where fm.family_id = family_children.family_id
            and fm.user_id = auth.uid()
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
  );

comment on policy "family_children_select_via_membership" on public.family_children is
  'Owner (is_family_owner) VAGY admin VAGY [SAJÁT aktív guardian_child_permissions sor can_view_schedule=true VAGY can_manage_schedule=true flaggel EHHEZ a child_id-hez, ÉS jelenleg is aktív guardian family_members tag ugyanezen a family_id-n]. Sima guardian membership és journey/GPS-only permission sor ÖNMAGÁBAN NEM elég. Lásd 20261001_family_schedule_authorization_completion.sql.';

-- ────────────────────────────────────────────────────────────────
-- A.2 child_profiles SELECT — ugyanaz a guardian child-identity ág
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260927_guardian_child_permission_hardening_v1.sql):
--   using (
--     public.is_admin()
--     or exists (select 1 from family_children fc where fc.child_id = child_profiles.id and is_family_owner(fc.family_id))
--     or exists (select 1 from child_accounts ca where ca.child_id = child_profiles.id and ca.auth_user_id = auth.uid() and ca.status = 'active')
--   );
--
-- ÚJ: a fenti három ág VÁLTOZATLAN (owner / child-self / admin), egy
-- ÚJ guardian-ág kerül hozzá — itt a child_profiles.id-hez a
-- family_id-t a family_children táblán ÁT kell elérni (ellentétben
-- az A.1 ponttal, ahol már a family_children SOR saját family_id-je
-- volt elérhető), ugyanaz a minta, mint a child_schedule_items SELECT
-- policy guardian-ágánál (20260927_guardian_child_permission_
-- hardening_v1.sql 3. szakasza).
drop policy if exists "child_profiles_select_via_family" on public.child_profiles;
create policy "child_profiles_select_via_family"
  on public.child_profiles for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.family_children fc
      where fc.child_id = child_profiles.id
        and public.is_family_owner(fc.family_id)
    )
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = child_profiles.id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and (gcp.can_view_schedule or gcp.can_manage_schedule)
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = child_profiles.id
            and fm.user_id = auth.uid()
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
    or exists (
      select 1 from public.child_accounts ca
      where ca.child_id = child_profiles.id
        and ca.auth_user_id = auth.uid()
        and ca.status = 'active'
    )
  );

comment on policy "child_profiles_select_via_family" on public.child_profiles is
  'Owner (is_family_owner) VAGY [SAJÁT aktív guardian_child_permissions sor can_view_schedule=true VAGY can_manage_schedule=true flaggel ÉS jelenleg is aktív guardian family_members tag ugyanahhoz a childhoz] VAGY a gyermek saját aktív child_accountja VAGY admin. Sima guardian membership és journey/GPS-only permission sor ÖNMAGÁBAN NEM elég. Lásd 20261001_family_schedule_authorization_completion.sql.';

-- ────────────────────────────────────────────────────────────────
-- B.1 child_schedule_items UPDATE — owner-ág family_db_beta törlése
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260927_guardian_child_permission_hardening_v1.sql):
--   using (
--     is_admin()
--     or (is_child_family_owner(child_id) and has_pilot_access('family_db_beta'))
--     or exists (... guardian can_manage_schedule ág, VÁLTOZATLAN ...)
--   )
--   with check (ugyanez)
--
-- ÚJ: KIZÁRÓLAG az owner-ágból törölve a "and has_pilot_access(...)"
-- feltétel — a guardian-ág és az is_admin() ág BYTE-RA VÁLTOZATLAN.
drop policy if exists "child_schedule_items_update_via_family_owner" on public.child_schedule_items;
create policy "child_schedule_items_update_via_family_owner"
  on public.child_schedule_items for update
  using (
    public.is_admin()
    or public.is_child_family_owner(child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = child_schedule_items.child_id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and gcp.can_manage_schedule
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = child_schedule_items.child_id
            and fm.user_id = auth.uid()
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
  )
  with check (
    public.is_admin()
    or public.is_child_family_owner(child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = child_schedule_items.child_id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and gcp.can_manage_schedule
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = child_schedule_items.child_id
            and fm.user_id = auth.uid()
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
  );

comment on policy "child_schedule_items_update_via_family_owner" on public.child_schedule_items is
  'Owner (is_child_family_owner, family_db_beta NEM követelmény többé) VAGY [SAJÁT aktív guardian_child_permissions sor can_manage_schedule=true flaggel ÉS jelenleg is aktív guardian family_members tag ugyanahhoz a childhoz] VAGY admin. Lásd 20261001_family_schedule_authorization_completion.sql.';

-- ────────────────────────────────────────────────────────────────
-- B.2 child_schedule_items DELETE — ugyanaz a törlés
-- ────────────────────────────────────────────────────────────────
drop policy if exists "child_schedule_items_delete_via_family_owner" on public.child_schedule_items;
create policy "child_schedule_items_delete_via_family_owner"
  on public.child_schedule_items for delete
  using (
    public.is_admin()
    or public.is_child_family_owner(child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = child_schedule_items.child_id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and gcp.can_manage_schedule
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = child_schedule_items.child_id
            and fm.user_id = auth.uid()
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
  );

comment on policy "child_schedule_items_delete_via_family_owner" on public.child_schedule_items is
  'Owner (is_child_family_owner, family_db_beta NEM követelmény többé) VAGY [SAJÁT aktív guardian_child_permissions sor can_manage_schedule=true flaggel ÉS jelenleg is aktív guardian family_members tag ugyanahhoz a childhoz] VAGY admin. Lásd 20261001_family_schedule_authorization_completion.sql.';

-- ────────────────────────────────────────────────────────────────
-- B.3 create_child_schedule_item RPC — owner-ág family_db_beta törlése
-- ────────────────────────────────────────────────────────────────
-- KIZÁRÓLAG a jogosultság-gate owner-ágából törölve a
-- "and has_pilot_access('family_db_beta')" feltétel — a guardian-ág,
-- az is_admin() ág és a TELJES validációs törzs (title, schedule_type,
-- days_of_week, dátumok, koordinátapár) SZÓ SZERINT megegyezik az
-- eredetivel.
create or replace function public.create_child_schedule_item(
  p_child_id uuid,
  p_title text,
  p_schedule_type text,
  p_time_local time,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_arrival_time_local time default null,
  p_timezone text default 'Europe/Budapest',
  p_days_of_week smallint[] default null,
  p_origin_label text default null,
  p_origin_lat double precision default null,
  p_origin_lon double precision default null,
  p_destination_label text default null,
  p_destination_lat double precision default null,
  p_destination_lon double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges napirendi elem létrehozásához';
  end if;

  -- OBSZOLÉT family_db_beta pilot-gate ELTÁVOLÍTVA az owner-ágról
  -- (lásd a fájl fejét) — a Napirend MOST már a valódi /csalad UI
  -- része, nem zárt béta. A guardian-ág VÁLTOZATLAN.
  if not (
    public.is_admin()
    or public.is_child_family_owner(p_child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = p_child_id
        and gcp.guardian_user_id = v_uid
        and gcp.status = 'active'
        and gcp.can_manage_schedule
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = p_child_id
            and fm.user_id = v_uid
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
  ) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje, vagy explicit can_manage_schedule jogosultsággal ÉS aktív guardian family_members tagsággal rendelkező guardian (vagy admin) hozhat létre napirendi elemet';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'title megadása kötelező';
  end if;

  if p_schedule_type not in ('one_time', 'recurring') then
    raise exception 'schedule_type csak one_time vagy recurring lehet';
  end if;

  if p_schedule_type = 'recurring'
     and (p_days_of_week is null or cardinality(p_days_of_week) = 0) then
    raise exception 'recurring napirendi elemhez days_of_week megadása kötelező';
  end if;

  if p_schedule_type = 'one_time' and p_days_of_week is not null then
    raise exception 'one_time napirendi elemhez days_of_week nem adható meg (legyen NULL)';
  end if;

  if p_days_of_week is not null
     and cardinality(p_days_of_week) <> cardinality(array(select distinct unnest(p_days_of_week))) then
    raise exception 'days_of_week nem tartalmazhat duplikált napot';
  end if;

  if p_schedule_type = 'one_time' and p_start_date is null then
    raise exception 'one_time napirendi elemhez start_date megadása kötelező';
  end if;

  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
    raise exception 'end_date nem lehet start_date előtt';
  end if;

  if (p_origin_lat is null) <> (p_origin_lon is null) then
    raise exception 'origin_lat és origin_lon együtt kötelező vagy együtt hiányzó';
  end if;

  if (p_destination_lat is null) <> (p_destination_lon is null) then
    raise exception 'destination_lat és destination_lon együtt kötelező vagy együtt hiányzó';
  end if;

  insert into public.child_schedule_items (
    child_id, title, description, schedule_type, start_date, end_date,
    time_local, arrival_time_local, timezone, days_of_week,
    origin_label, origin_lat, origin_lon,
    destination_label, destination_lat, destination_lon,
    created_by
  ) values (
    p_child_id, p_title, p_description, p_schedule_type, p_start_date, p_end_date,
    p_time_local, p_arrival_time_local, coalesce(p_timezone, 'Europe/Budapest'), p_days_of_week,
    p_origin_label, p_origin_lat, p_origin_lon,
    p_destination_label, p_destination_lat, p_destination_lon,
    v_uid
  )
  returning id into v_item_id;

  return v_item_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- B.4 update_child_schedule_item RPC — ugyanaz a törlés
-- ────────────────────────────────────────────────────────────────
create or replace function public.update_child_schedule_item(
  p_id uuid,
  p_title text,
  p_schedule_type text,
  p_time_local time,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_arrival_time_local time default null,
  p_timezone text default 'Europe/Budapest',
  p_days_of_week smallint[] default null,
  p_origin_label text default null,
  p_origin_lat double precision default null,
  p_origin_lon double precision default null,
  p_destination_label text default null,
  p_destination_lat double precision default null,
  p_destination_lon double precision default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child_id uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges napirendi elem módosításához';
  end if;

  select child_id into v_child_id
  from public.child_schedule_items
  where id = p_id;

  if v_child_id is null then
    raise exception 'A napirendi elem nem található';
  end if;

  -- OBSZOLÉT family_db_beta pilot-gate ELTÁVOLÍTVA az owner-ágról —
  -- ugyanaz a javítás, mint create_child_schedule_item-ben. A
  -- guardian-ág VÁLTOZATLAN.
  if not (
    public.is_admin()
    or public.is_child_family_owner(v_child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = v_child_id
        and gcp.guardian_user_id = v_uid
        and gcp.status = 'active'
        and gcp.can_manage_schedule
        and exists (
          select 1
          from public.family_children fc
          join public.family_members fm on fm.family_id = fc.family_id
          where fc.child_id = v_child_id
            and fm.user_id = v_uid
            and fm.role = 'guardian'
            and fm.status = 'active'
        )
    )
  ) then
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje, vagy explicit can_manage_schedule jogosultsággal ÉS aktív guardian family_members tagsággal rendelkező guardian (vagy admin) módosíthatja ezt a napirendi elemet';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'title megadása kötelező';
  end if;

  if p_schedule_type not in ('one_time', 'recurring') then
    raise exception 'schedule_type csak one_time vagy recurring lehet';
  end if;

  if p_schedule_type = 'recurring'
     and (p_days_of_week is null or cardinality(p_days_of_week) = 0) then
    raise exception 'recurring napirendi elemhez days_of_week megadása kötelező';
  end if;

  if p_schedule_type = 'one_time' and p_days_of_week is not null then
    raise exception 'one_time napirendi elemhez days_of_week nem adható meg (legyen NULL)';
  end if;

  if p_days_of_week is not null
     and cardinality(p_days_of_week) <> cardinality(array(select distinct unnest(p_days_of_week))) then
    raise exception 'days_of_week nem tartalmazhat duplikált napot';
  end if;

  if p_schedule_type = 'one_time' and p_start_date is null then
    raise exception 'one_time napirendi elemhez start_date megadása kötelező';
  end if;

  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
    raise exception 'end_date nem lehet start_date előtt';
  end if;

  if (p_origin_lat is null) <> (p_origin_lon is null) then
    raise exception 'origin_lat és origin_lon együtt kötelező vagy együtt hiányzó';
  end if;

  if (p_destination_lat is null) <> (p_destination_lon is null) then
    raise exception 'destination_lat és destination_lon együtt kötelező vagy együtt hiányzó';
  end if;

  update public.child_schedule_items set
    title = p_title,
    description = p_description,
    schedule_type = p_schedule_type,
    start_date = p_start_date,
    end_date = p_end_date,
    time_local = p_time_local,
    arrival_time_local = p_arrival_time_local,
    timezone = coalesce(p_timezone, 'Europe/Budapest'),
    days_of_week = p_days_of_week,
    origin_label = p_origin_label,
    origin_lat = p_origin_lat,
    origin_lon = p_origin_lon,
    destination_label = p_destination_label,
    destination_lat = p_destination_lat,
    destination_lon = p_destination_lon,
    is_active = coalesce(p_is_active, true)
  where id = p_id;

  return p_id;
end;
$$;

-- Az EXECUTE grant/revoke állapot (authenticated-only, anon/public
-- letiltva) a KORÁBBI migrációból MÁR megvan mindkét function-re, és
-- egy CREATE OR REPLACE FUNCTION nem törli a meglévő GRANT/REVOKE
-- bejegyzéseket — itt NEM ismételjük meg, nincs is rá szükség.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Ez a migráció KIZÁRÓLAG policy- és function-DEFINÍCIÓkat cserél
-- (nem hoz létre/töröl táblát, oszlopot, indexet, triggert, grantot).
-- Visszavonás esetén a 20260927_guardian_child_permission_
-- hardening_v1.sql-ben rögzített EREDETI definíciókat kell
-- visszaállítani (owner-ág ismét has_pilot_access('family_db_beta')
-- feltétellel a child_schedule_items UPDATE/DELETE policy-kon és
-- mindkét RPC-n; family_children/child_profiles SELECT policy a
-- guardian child-identity ág NÉLKÜL) — a teljes eredeti SQL ott, a
-- fájl saját ROLLBACK szakaszában és a policy/function definíciókban
-- megtalálható.
