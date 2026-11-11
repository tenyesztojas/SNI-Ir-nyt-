-- =====================================================================
-- Védett Család — tulajdonosváltás utáni hozzáférés + tulajdonosváltási napló
-- (2026-11-05)
-- =====================================================================
-- Hiba: a tulajdonjogot átvevő, pilotjog (family_db_beta) nélküli
-- felhasználó nem tudott gyermeket felvenni, mert a
-- create_child_profile_for_family a hívó SZEMÉLYES pilotjogát is megkövetelte
-- (a felületi server actionök pedig minden családi műveletnél).
-- Új szabály:
--   * Új család létrehozása: változatlanul béta-kapus (create_family_with_owner).
--   * Meglévő család kezelése: a hívó AKTÍV szerepe az ADOTT családban dönt
--     (owner / jogosult guardian / admin), személyes pilotjog nélkül.
--     Családok csak béta-kapus úton jönnek létre, így ez nem nyitja meg a
--     modult: aki nem tagja egy ilyen családnak, továbbra sem fér hozzá.
-- Napló: family_ownership_events — család, korábbi és új owner, mód, időpont.
--   Gyermekadat nincs benne. Írni csak a két SECURITY DEFINER átadó függvény
--   tud; olvasni a család aktív ownerje és az admin (RLS).
-- Függ: 20260926000000, 20261004 (transfer_family_ownership),
--   20261104000000 (handover_family_ownership).
-- =====================================================================

-- 1. Gyermekprofil: a személyes pilotjog-kapu megszűnik, az owner/admin
--    ellenőrzés és a létszámkorlát (20261030 trigger) marad.
create or replace function public.create_child_profile_for_family(
  p_family_id uuid,
  p_first_name text,
  p_birth_year integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_child_id  uuid;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges child_profile létrehozásához';
  end if;

  -- A pilotjog-kapu (family_db_beta) ELTÁVOLÍTVA: meglévő, engedélyezett
  -- család aktív ownerje kezelheti a gyermekeit (tulajdonosváltás után is).
  -- Új család létrehozása (create_family_with_owner) továbbra is béta-kapus.

  if not public.is_family_owner(p_family_id) and not public.is_admin() then
    raise exception 'Csak az adott family aktív ownerje (vagy admin) hozhat létre child_profile-t';
  end if;

  if p_first_name is null or btrim(p_first_name) = '' then
    raise exception 'first_name megadása kötelező';
  end if;

  -- A pontos "nem lehet jövőbeli év" validáció itt, futásidőben,
  -- a hívás pillanatának aktuális évéhez viszonyítva történik — NEM
  -- a child_profiles tábla CHECK constraintjében (lásd ott a
  -- birth_year megjegyzést).
  if p_birth_year is not null and p_birth_year > extract(year from now())::int then
    raise exception 'birth_year nem lehet jövőbeli év';
  end if;

  insert into public.child_profiles (first_name, birth_year, created_by)
  values (p_first_name, p_birth_year, v_uid)
  returning id into v_child_id;

  insert into public.family_children (family_id, child_id)
  values (p_family_id, v_child_id);

  return v_child_id;
end;
$$;


-- 2. Tulajdonosváltási napló ------------------------------------------
create table if not exists public.family_ownership_events (
  id                      uuid primary key default gen_random_uuid(),
  family_id               uuid not null references public.families (id) on delete cascade,
  previous_owner_user_id  uuid references public.profiles (id) on delete set null,
  new_owner_user_id       uuid references public.profiles (id) on delete set null,
  method                  text not null check (method in ('handover', 'account_transfer')),
  created_at              timestamptz not null default now()
);
create index if not exists idx_family_ownership_events_family_id on public.family_ownership_events (family_id, created_at desc);
alter table public.family_ownership_events enable row level security;
revoke all on public.family_ownership_events from public, anon, authenticated;
grant select on public.family_ownership_events to authenticated;
grant select, insert, update, delete on public.family_ownership_events to service_role;
drop policy if exists "family_ownership_events_select_owner_or_admin" on public.family_ownership_events;
create policy "family_ownership_events_select_owner_or_admin"
  on public.family_ownership_events for select
  using (public.is_family_owner(family_id) or public.is_admin());

-- 3. Naplózás a felületi átadásnál (20261104 függvény, változatlan logika + napló)
create or replace function public.handover_family_ownership(p_family_id uuid, p_new_owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_caller public.family_members%rowtype;
  v_target public.family_members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'Bejelentkezés szükséges.', hint = 'family_not_authenticated';
  end if;
  if p_family_id is null or p_new_owner_user_id is null then
    raise exception using errcode = 'P0001', message = 'Hiányzó adat.', hint = 'family_invalid_input';
  end if;
  if p_new_owner_user_id = v_uid then
    raise exception using errcode = 'P0001', message = 'Saját magadnak nem adhatod át a tulajdonjogot.', hint = 'family_transfer_to_self';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('family_capacity:' || p_family_id::text, 0));
  perform 1 from public.families where id = p_family_id for update;

  select * into v_caller from public.family_members
   where family_id = p_family_id and user_id = v_uid
   for update;
  if not found or v_caller.role <> 'owner' or v_caller.status <> 'active' then
    raise exception using errcode = 'P0001',
      message = 'Csak a család aktív tulajdonosa adhatja át a tulajdonjogot.', hint = 'family_not_owner';
  end if;

  select * into v_target from public.family_members
   where family_id = p_family_id and user_id = p_new_owner_user_id
   for update;
  if not found or v_target.role <> 'guardian' or v_target.status <> 'active' then
    raise exception using errcode = 'P0001',
      message = 'Új tulajdonos csak a család aktív gondviselője lehet.', hint = 'family_transfer_target_invalid';
  end if;
  if exists (select 1 from public.child_accounts ca where ca.auth_user_id = p_new_owner_user_id) then
    raise exception using errcode = 'P0001',
      message = 'Gyermekfiók nem lehet a család tulajdonosa.', hint = 'family_transfer_target_invalid';
  end if;

  update public.family_members set role = 'owner' where id = v_target.id;
  update public.family_members set role = 'guardian' where id = v_caller.id;

  insert into public.family_ownership_events (family_id, previous_owner_user_id, new_owner_user_id, method)
  values (p_family_id, v_uid, p_new_owner_user_id, 'handover');

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.handover_family_ownership(uuid, uuid) from public, anon;
grant execute on function public.handover_family_ownership(uuid, uuid) to authenticated;

-- 4. Naplózás a fióktörlési átadásnál (20261004 függvény, változatlan logika
--    és hibaüzenetek + napló)
create or replace function public.transfer_family_ownership(
  p_family_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges';
  end if;
  if p_family_id is null or p_target_user_id is null then
    raise exception 'Hiányzó paraméter';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'Önmagadnak nem adhatod át a tulajdonjogot';
  end if;

  perform 1 from public.families where id = p_family_id for update;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family_id and fm.user_id = v_uid
      and fm.role = 'owner' and fm.status = 'active'
  ) then
    raise exception 'Csak a család aktív ownerje adhat át tulajdonjogot';
  end if;

  if exists (select 1 from public.child_accounts ca where ca.auth_user_id = p_target_user_id) then
    raise exception 'Gyermek-account nem kaphat owner szerepkört';
  end if;

  update public.family_members
  set role = 'owner'
  where family_id = p_family_id
    and user_id = p_target_user_id
    and role = 'guardian'
    and status = 'active';
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'A kijelölt személy nem a család aktív guardian tagja';
  end if;

  insert into public.family_ownership_events (family_id, previous_owner_user_id, new_owner_user_id, method)
  values (p_family_id, v_uid, p_target_user_id, 'account_transfer');
end;
$$;

revoke execute on function public.transfer_family_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_family_ownership(uuid, uuid) to authenticated;

-- ROLLBACK (kézzel, külön jóváhagyással):
--   a create_child_profile_for_family a 20260926000000 szerint (pilot-kapuval),
--   a handover_family_ownership a 20261104000000 szerint,
--   a transfer_family_ownership a 20261004 szerint újra létrehozandó;
--   drop table if exists public.family_ownership_events;  (a napló elvész)
