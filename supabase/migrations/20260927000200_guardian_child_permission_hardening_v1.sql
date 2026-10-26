-- VédettSarok — Guardian/Child permission HARDENING v1
-- Dátum: 2026-09-27
--
-- ELŐZMÉNY: a READ-ONLY audit ("VédettSarok – guardian / child /
-- schedule permission audit") bizonyította, hogy a
-- 20260926_family_db_foundation.sql és a
-- 20260926_child_schedule_items_foundation.sql RLS policy-jai a
-- child_profiles/family_children/child_schedule_items SELECT-et (és a
-- schedule CREATE/UPDATE/DELETE-et) kizárólag family_members-tagság
-- (is_family_member / is_family_owner / is_child_family_member /
-- is_child_family_owner) alapján engedik — a guardian_child_permissions
-- táblát SEHOL nem konzultálják. Ez megsérti az alapelvet:
--
--     family membership != child permission.
--
-- Ez a migráció EZT a hézagot zárja le, KIZÁRÓLAG a feladat által
-- megkért szűk körben:
--   - child_profiles SELECT policy (redefiníció)
--   - family_children SELECT policy (redefiníció)
--   - child_schedule_items SELECT / UPDATE / DELETE policy (redefiníció)
--   - create_child_schedule_item / update_child_schedule_item RPC
--     (redefiníció, CSAK a jogosultság-gate módosul, minden egyéb
--     validációs logika SZÓ SZERINT megegyezik az eredetivel)
--
-- NEM MÓDOSÍT (szándékosan, a feladat explicit korlátozása szerint):
--   - a MEGLÉVŐ migration fájlok szövegét (ez egy ÚJ, additív fájl —
--     a policy/RPC "redefiníció" itt azt jelenti, hogy egy KÉSŐBBI
--     migráció DROP POLICY IF EXISTS + CREATE POLICY / CREATE OR
--     REPLACE FUNCTION mintával felülírja a KORÁBBI migráció által
--     létrehozott policy/function TESTét — ugyanaz a technika, mint a
--     korábbi pgcrypto-hotfixnél és a family_children_child_id_unique
--     constraint bővítésénél, amikor egy meglévő objektumot egy
--     KÉSŐBBI migráció módosított anélkül, hogy a korábbi fájlt
--     szerkesztette volna);
--   - semelyik is_admin() bypasst (mindenhol MEGMARAD "or
--     public.is_admin()", szó szerint, ahol eddig is ott volt);
--   - a guardian_child_permissions tábla schemáját (nincs új oszlop,
--     nincs új flag);
--   - a child_accounts, family_guardian_invitations,
--     child_account_invitations táblákat/RPC-ket/policy-kat (ezekhez
--     nem nyúl);
--   - az owner-oldali RPC-k (create_family_with_owner,
--     create_child_profile_for_family) jogosultság-logikáját;
--   - a create_child_schedule_item/update_child_schedule_item RPC-k
--     validációs törzsét (title/schedule_type/days_of_week/dátum/
--     koordináta-ellenőrzések) — KIZÁRÓLAG a jogosultság-gate blokk
--     változik mindkét függvényben.
--
-- Additív, idempotens migráció — biztonságosan újrafuttatható. Ez a
-- fájl NEM lett alkalmazva semmilyen (sem local, sem production)
-- adatbázisra — csak létrehozva és statikusan auditálva. Kézi jóváhagyás
-- és `supabase db push` szükséges az alkalmazásához.
--
-- CÉLZOTT KORREKCIÓ #1 (ugyanazon a napon, az első verzió statikus
-- validálása UTÁN, alkalmazás ELŐTT): az EREDETI verzióban a guardian
-- schedule WRITE (create/update/delete) ágakon a explicit
-- can_manage_schedule=true jogosultság FÖLÉ egy MÁSODIK, felesleges
-- authorization gate került (has_pilot_access('family_db_beta') a
-- guardian oldalán is). Ez javítva: a family_db_beta rollout-flag
-- MOSTANTÓL KIZÁRÓLAG az owner-ág feltétele (VÁLTOZATLAN, az eredeti
-- owner-követelmény szerint) — a guardian oldalán az owner által
-- explicit megadott can_manage_schedule=true + status='active' sor
-- ÖNMAGÁBAN elegendő. can_view_schedule logika, child-self logika,
-- is_admin() viselkedés és minden más fájl VÁLTOZATLAN.
--
-- CÉLZOTT KORREKCIÓ #2 (a teljes SQL review során talált MÁSODIK
-- authorization hiba javítása): a guardian_child_permissions AKTÍV
-- sora ÖNMAGÁBAN NEM lehet elegendő — egy owner adhatott jogot egy
-- guardiannek, de HA a guardian family_members tagsága utólag
-- revoked/pending-re változik (vagy role-ja már nem 'guardian'), a
-- guardian_child_permissions sor NEM válik automatikusan érvénytelenné
-- (nincs trigger, ami ezt szinkronizálná — ez a jelenlegi schema
-- MEGLÉVŐ, ismert tulajdonsága, amit ez a migráció NEM módosít). MINDEN
-- guardian ágon (SELECT, UPDATE USING/WITH CHECK, DELETE, mindkét RPC)
-- MOSTANTÓL egy MÁSODIK, kötelező feltétel is szerepel:
--
--   exists (
--     select 1
--     from public.family_children fc
--     join public.family_members fm on fm.family_id = fc.family_id
--     where fc.child_id = <az adott child_id>
--       and fm.user_id = <a hívó auth.uid()-ja>
--       and fm.role = 'guardian'
--       and fm.status = 'active'
--   )
--
-- Ez SZÁNDÉKOSAN NEM public.is_family_member() (ami owner-t is
-- beleértene, tehát túl tág lenne itt) — itt kifejezetten az AKTÍV
-- GUARDIAN szerepkört ellenőrizzük, explicit role='guardian' feltétellel.
-- A végeredmény minden guardian ágon: "aktív family guardian" ÉS
-- "aktív explicit child permission" EGYÜTT szükséges — ha bármelyik
-- feltétel hamis (a family_members sor revoked/pending, VAGY role
-- nem guardian, VAGY a guardian_child_permissions sor nem aktív/nincs
-- flag), a teljes guardian ág hamis, függetlenül attól, hogy a MÁSIK
-- feltétel véletlenül igaz maradt.

-- ────────────────────────────────────────────────────────────────
-- 1. child_profiles SELECT — guardian membership-alapú hozzáférés
--    megszüntetése, child-self hozzáférés bevezetése
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260926_family_db_foundation.sql) definíció:
--   using (
--     public.is_admin()
--     or exists (
--       select 1 from public.family_children fc
--       where fc.child_id = child_profiles.id
--         and public.is_family_member(fc.family_id)   -- <- IDE: owner ÉS guardian egyaránt átment
--     )
--   );
--
-- ÚJ viselkedés:
--   - is_admin(): VÁLTOZATLAN, megmarad.
--   - owner: is_family_member(...) helyett is_family_owner(...) — a
--     sima guardian membership önmagában TÖBBÉ NEM elég.
--   - ÚJ ág: a gyermek SAJÁT, aktív child_accountja
--     (child_accounts.auth_user_id = auth.uid() AND status='active' AND
--     ugyanarra a child_id-re) — ez adja a "child self" hozzáférést,
--     amely korábban teljesen hiányzott (lásd audit 5. blocker pontja).
--   - Szándékosan NINCS guardian_child_permissions-alapú ág itt — a
--     feladat explicit tiltja, hogy egy permission flag (pl.
--     can_view_schedule) teljes child_profiles SELECT-et adjon a
--     guardiannek. A guardian minimális child-identitásának
--     megjelenítése egy KÉSŐBBI, külön kontrollált megoldás feladata.
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
      select 1 from public.child_accounts ca
      where ca.child_id = child_profiles.id
        and ca.auth_user_id = auth.uid()
        and ca.status = 'active'
    )
  );

comment on policy "child_profiles_select_via_family" on public.child_profiles is
  'Owner (is_family_owner) VAGY a gyermek SAJÁT aktív child_accountja VAGY admin. Sima guardian family membership ÖNMAGÁBAN NEM elég — lásd 20260927_guardian_child_permission_hardening_v1.sql.';

-- ────────────────────────────────────────────────────────────────
-- 2. family_children SELECT — a guardian-oldali "membership alapján
--    minden child-kapcsolatot felsorolhat" kerülőút lezárása
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260926_family_db_foundation.sql) definíció:
--   using (public.is_family_member(family_id) or public.is_admin());
--
-- ÚJ: is_family_member(...) -> is_family_owner(...). Egy sima guardian
-- (aktív, de owner szerepkör nélküli family_members tag) TÖBBÉ NEM
-- láthatja a family_children kapcsoló-sorokat — pontosan ez volt a
-- production smoke teszten megfigyelt leak strukturális oka
-- (lib/family/data.ts::getMyFamilies() ezen a policy-n keresztül adta
-- vissza MINDEN family gyermekét minden aktív tagnak, owner-nek ÉS
-- guardiannek egyaránt).
--
-- Szándékosan NINCS itt guardian_child_permissions-alapú vagy
-- child-self ág — a family_children maga csak a family<->child
-- KAPCSOLATOT jelzi (nem a gyermek adatait), és a feladat kifejezetten
-- csak azt kéri, hogy a guardian NE kapjon child-listát pusztán
-- membershipből; a gyermek saját, konkrét child_id-jét a child self
-- policy-k (1. és 4. szakasz) közvetlenül, family_children nélkül
-- engedik.
drop policy if exists "family_children_select_via_membership" on public.family_children;
create policy "family_children_select_via_membership"
  on public.family_children for select
  using (
    public.is_admin()
    or public.is_family_owner(family_id)
  );

comment on policy "family_children_select_via_membership" on public.family_children is
  'KIZÁRÓLAG a family aktív ownerje VAGY admin. Sima (owner nélküli) guardian membership TÖBBÉ NEM ad hozzáférést a family<->child kapcsoló-sorokhoz — ez zárja a korábbi "guardian membership alapján minden child felsorolható" kerülőutat. Lásd 20260927_guardian_child_permission_hardening_v1.sql.';

-- ────────────────────────────────────────────────────────────────
-- 3. child_schedule_items SELECT — guardian_child_permissions
--    (can_view_schedule VAGY can_manage_schedule) + child-self
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260926_child_schedule_items_foundation.sql) definíció:
--   using (public.is_child_family_member(child_id) or public.is_admin());
--
-- ÚJ:
--   - is_admin(): változatlan.
--   - owner: is_child_family_member(...) helyett is_child_family_owner(...).
--   - ÚJ guardian ág: KIZÁRÓLAG akkor enged, ha van SAJÁT
--     (guardian_user_id = auth.uid()), AKTÍV (status='active')
--     guardian_child_permissions sor EHHEZ a child_id-hez, ÉS
--     (can_view_schedule=true VAGY can_manage_schedule=true) — a
--     feladat explicit kéri, hogy can_manage_schedule=true IMPLICIT
--     read jogot is jelentsen — ÉS (2. korrekció) a hívó JELENLEG IS
--     aktív ('active'), 'guardian' role-ú family_members tagja annak a
--     familynek, amelyhez ez a child a family_children kapcsolaton
--     keresztül tartozik. A permission sor önmagában NEM elég.
--   - ÚJ child-self ág: ugyanaz a minta, mint a child_profiles-nál.
drop policy if exists "child_schedule_items_select_via_family" on public.child_schedule_items;
create policy "child_schedule_items_select_via_family"
  on public.child_schedule_items for select
  using (
    public.is_admin()
    or public.is_child_family_owner(child_id)
    or exists (
      select 1 from public.guardian_child_permissions gcp
      where gcp.child_id = child_schedule_items.child_id
        and gcp.guardian_user_id = auth.uid()
        and gcp.status = 'active'
        and (gcp.can_view_schedule or gcp.can_manage_schedule)
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
    or exists (
      select 1 from public.child_accounts ca
      where ca.child_id = child_schedule_items.child_id
        and ca.auth_user_id = auth.uid()
        and ca.status = 'active'
    )
  );

comment on policy "child_schedule_items_select_via_family" on public.child_schedule_items is
  'Owner (is_child_family_owner) VAGY [SAJÁT aktív guardian_child_permissions sor can_view_schedule=true VAGY can_manage_schedule=true flaggel ÉS jelenleg is aktív guardian family_members tag ugyanahhoz a childhoz] VAGY a gyermek saját aktív child_accountja VAGY admin. Sima guardian membership ÖNMAGÁBAN NEM elég, ÉS az explicit permission sor ÖNMAGÁBAN sem elég family membership nélkül. Lásd 20260927_guardian_child_permission_hardening_v1.sql.';

-- ────────────────────────────────────────────────────────────────
-- 4. child_schedule_items UPDATE / DELETE — guardian_child_permissions
--    can_manage_schedule=true (JAVÍTVA: a guardian ág NEM követeli meg
--    a has_pilot_access('family_db_beta') rollout-flaget — lásd a
--    célzott korrekció megjegyzését lent)
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260926_child_schedule_items_foundation.sql) definíció
-- (UPDATE és DELETE is ugyanezt használta):
--   using (
--     public.is_admin()
--     or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
--   )
--   [UPDATE-nél with check is ugyanez volt]
--
-- ÚJ: a fenti owner-ág VÁLTOZATLAN (owner-nek TOVÁBBRA IS kell
-- family_db_beta), egy ÚJ guardian-ág kerül hozzá.
--
-- CÉLZOTT KORREKCIÓ (a hardening v1 első verziójához képest): a
-- guardian-ág EREDETILEG tartalmazott egy "and
-- public.has_pilot_access('family_db_beta')" feltételt is — ez egy
-- MÁSODIK authorization gate lett volna az owner által már explicit
-- megadott child-permission FÖLÖTT. Ez törölve: a guardian-ág mostantól
-- KIZÁRÓLAG a SAJÁT (guardian_user_id = auth.uid()), AKTÍV
-- (status = 'active'), can_manage_schedule = true
-- guardian_child_permissions sor meglétét követeli — a family_db_beta
-- rollout-flag a guardian oldalán NEM authorization feltétel (az owner
-- oldali family_db_beta követelmény ettől függetlenül, VÁLTOZATLANUL
-- megmarad).
drop policy if exists "child_schedule_items_update_via_family_owner" on public.child_schedule_items;
create policy "child_schedule_items_update_via_family_owner"
  on public.child_schedule_items for update
  using (
    public.is_admin()
    or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
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
    or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
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
  'Owner (is_child_family_owner + family_db_beta) VAGY [SAJÁT aktív guardian_child_permissions sor can_manage_schedule=true flaggel ÉS jelenleg is aktív guardian family_members tag ugyanahhoz a childhoz] (family_db_beta NEM követelmény a guardian ágon) VAGY admin. Lásd 20260927_guardian_child_permission_hardening_v1.sql.';

drop policy if exists "child_schedule_items_delete_via_family_owner" on public.child_schedule_items;
create policy "child_schedule_items_delete_via_family_owner"
  on public.child_schedule_items for delete
  using (
    public.is_admin()
    or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
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
  'Owner (is_child_family_owner + family_db_beta) VAGY [SAJÁT aktív guardian_child_permissions sor can_manage_schedule=true flaggel ÉS jelenleg is aktív guardian family_members tag ugyanahhoz a childhoz] (family_db_beta NEM követelmény a guardian ágon) VAGY admin. Lásd 20260927_guardian_child_permission_hardening_v1.sql.';

-- ────────────────────────────────────────────────────────────────
-- 5. create_child_schedule_item RPC — a jogosultság-gate bővítése
--    guardian can_manage_schedule ággal (a validációs törzs
--    VÁLTOZATLAN, szó szerint megegyezik az eredetivel)
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI (20260926_child_schedule_items_foundation.sql) gate:
--   if not public.is_child_family_owner(p_child_id) and not public.is_admin() then
--     raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje (vagy admin) hozhat létre napirendi elemet';
--   end if;
--
-- ÚJ gate: a fenti feltétel logikai NEGÁCIÓját egy explicit, 3-ágú
-- pozitív feltétellé alakítjuk (owner+beta VAGY admin VAGY guardian
-- can_manage_schedule=true), a hibaüzenetet ennek megfelelően bővítve.
--
-- CÉLZOTT KORREKCIÓ (a hardening v1 első verziójához képest): az
-- EREDETI hardening v1-ben egy KÜLÖN, MINDENKIRE (owner-re ÉS
-- guardianra egyaránt) vonatkozó, a 3-ágú gate ELŐTTI blanket
-- "if not has_pilot_access('family_db_beta') and not is_admin() then
-- raise" ellenőrzés volt — ez a guardian explicit, owner által már
-- megadott can_manage_schedule jogosultsága FÖLÉ egy MÁSODIK
-- authorization gate-et (a rollout-flaget) állította volna. Ez a
-- külön blanket check TÖRÖLVE: a family_db_beta követelmény mostantól
-- KIZÁRÓLAG az owner-ág feltétele (pontosan úgy, mint korábban — az
-- owner-oldali viselkedés NEM változott), a guardian-ág explicit
-- can_manage_schedule jogosultsága ÖNMAGÁBAN elegendő, family_db_beta
-- nélkül is.
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

  -- HARDENING v1 (JAVÍTVA): owner+family_db_beta VAGY admin VAGY SAJÁT
  -- (guardian_user_id = auth.uid()), AKTÍV (status = 'active'),
  -- can_manage_schedule = true guardian_child_permissions sor. Sima
  -- family membership (akár owner, akár guardian) ÖNMAGÁBAN NEM elég
  -- ezen az ágon kívül. A family_db_beta rollout-flag KIZÁRÓLAG az
  -- owner-ág feltétele — a guardian-ág explicit can_manage_schedule
  -- jogosultsága ÖNMAGÁBAN elegendő, nincs második, rollout-flag-alapú
  -- gate fölötte.
  if not (
    public.is_admin()
    or (public.is_child_family_owner(p_child_id) and public.has_pilot_access('family_db_beta'))
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
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje (family_db_beta hozzáféréssel), vagy explicit can_manage_schedule jogosultsággal ÉS aktív guardian family_members tagsággal rendelkező guardian (vagy admin) hozhat létre napirendi elemet';
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
-- 6. update_child_schedule_item RPC — ugyanaz a gate-bővítés, a
--    validációs törzs itt is VÁLTOZATLAN
-- ────────────────────────────────────────────────────────────────
-- KORÁBBI gate (a v_child_id kikeresése UTÁN):
--   if not public.is_child_family_owner(v_child_id) and not public.is_admin() then
--     raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje (vagy admin) módosíthatja ezt a napirendi elemet';
--   end if;
--
-- CÉLZOTT KORREKCIÓ (a hardening v1 első verziójához képest): ugyanaz
-- a javítás, mint create_child_schedule_item-ben — a KÜLÖN, MINDENKIRE
-- vonatkozó blanket family_db_beta check TÖRÖLVE, a beta-követelmény
-- mostantól KIZÁRÓLAG az owner-ág feltétele, a guardian-ág explicit
-- can_manage_schedule jogosultsága önmagában elegendő.
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

  -- HARDENING v1 (JAVÍTVA): ugyanaz a gate-szerkezet, mint
  -- create_child_schedule_item-ben — family_db_beta KIZÁRÓLAG az
  -- owner-ág feltétele, a guardian-ág explicit can_manage_schedule
  -- jogosultsága önmagában elegendő.
  if not (
    public.is_admin()
    or (public.is_child_family_owner(v_child_id) and public.has_pilot_access('family_db_beta'))
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
    raise exception 'Csak a gyermekhez kapcsolt family aktív ownerje (family_db_beta hozzáféréssel), vagy explicit can_manage_schedule jogosultsággal ÉS aktív guardian family_members tagsággal rendelkező guardian (vagy admin) módosíthatja ezt a napirendi elemet';
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
-- letiltva) a KORÁBBI migrációból (20260926_child_schedule_items_foundation.sql,
-- 7. szakasz) MÁR megvan mindkét function-re, és egy CREATE OR REPLACE
-- FUNCTION nem törli a meglévő GRANT/REVOKE bejegyzéseket (ugyanaz a
-- Postgres-viselkedés, amire a Child Account pgcrypto hotfix migrációja
-- is támaszkodott) — ezért itt NEM ismételjük meg a GRANT/REVOKE-ot,
-- nincs is rá szükség, és ez is minimalizálja a migráció felszínét.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Ez a migráció KIZÁRÓLAG policy- és function-DEFINÍCIÓkat cserél
-- (nem hoz létre/töröl táblát, oszlopot, indexet, triggert). Visszavonás
-- esetén a KORÁBBI (20260926-os migrációkban rögzített) definíciókat
-- kell visszaállítani, EBBEN A SORRENDBEN:
--
--   -- 6. update_child_schedule_item — az EREDETI gate visszaállítása:
--   --    "if not public.is_child_family_owner(v_child_id) and not
--   --    public.is_admin() then raise exception '...' end if;"
--   --    (a teljes eredeti function body a
--   --    20260926_child_schedule_items_foundation.sql 7.2 szakaszában).
--   -- 5. create_child_schedule_item — ugyanígy, az EREDETI gate:
--   --    "if not public.is_child_family_owner(p_child_id) and not
--   --    public.is_admin() then raise exception '...' end if;"
--   drop policy if exists "child_schedule_items_delete_via_family_owner" on public.child_schedule_items;
--   create policy "child_schedule_items_delete_via_family_owner"
--     on public.child_schedule_items for delete
--     using (
--       public.is_admin()
--       or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
--     );
--   drop policy if exists "child_schedule_items_update_via_family_owner" on public.child_schedule_items;
--   create policy "child_schedule_items_update_via_family_owner"
--     on public.child_schedule_items for update
--     using (
--       public.is_admin()
--       or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
--     )
--     with check (
--       public.is_admin()
--       or (public.is_child_family_owner(child_id) and public.has_pilot_access('family_db_beta'))
--     );
--   drop policy if exists "child_schedule_items_select_via_family" on public.child_schedule_items;
--   create policy "child_schedule_items_select_via_family"
--     on public.child_schedule_items for select
--     using (public.is_child_family_member(child_id) or public.is_admin());
--   drop policy if exists "family_children_select_via_membership" on public.family_children;
--   create policy "family_children_select_via_membership"
--     on public.family_children for select
--     using (public.is_family_member(family_id) or public.is_admin());
--   drop policy if exists "child_profiles_select_via_family" on public.child_profiles;
--   create policy "child_profiles_select_via_family"
--     on public.child_profiles for select
--     using (
--       public.is_admin()
--       or exists (
--         select 1 from public.family_children fc
--         where fc.child_id = child_profiles.id
--           and public.is_family_member(fc.family_id)
--       )
--     );
--
-- Nincs új tábla/oszlop/index/trigger/grant, tehát ezeken kívül nincs
-- más visszavonandó elem.
