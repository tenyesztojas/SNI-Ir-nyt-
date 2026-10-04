-- VédettSarok — Biztonságos fióktörlési lifecycle (Family-kapcsolattal)
-- ────────────────────────────────────────────────────────────────
-- ADDITÍV, forward-only. NEM módosít FK-t (CASCADE/RESTRICT változatlan),
-- NEM töröl child_accounts sort, NEM érint GPS/live-location jogosultságot.
--
-- TARTALOM
--   1. protect_last_family_owner(): SZŰK, kétfeltételes kivétel kizárólag a
--      prepare_account_deletion() kontrollált Family-megszüntetéséhez.
--   2. _account_deletion_classify(uuid): belső állapot-osztályozó.
--   3. get_account_deletion_state(): a hívó SAJÁT törlési állapota (auth.uid()).
--   4. transfer_family_ownership(): owner-átadás (guardian -> owner).
--   5. prepare_account_deletion(boolean): egy tranzakcióban eltávolítja a
--      hívó Family-kapcsolatait; egyszerű sole-owner Family esetén explicit
--      megerősítéssel a Familyt és a kizárólagos gyermekadatot is törli.
--      Utána az API törli az auth usert (service role).
--
-- ÁLLAPOTOK (get_account_deletion_state().state)
--   READY | GUARDIAN_READY | OTHER_OWNER_READY
--   OWNER_TRANSFER_REQUIRED
--   SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED
--   COMPLEX_FAMILY_MANUAL_REVIEW | CHILD_ACCOUNT_MANUAL_REVIEW
--   CHILD_ACCOUNT_USER
--
-- ÖSSZEFÜGGÉS: a hívó identitása KIZÁRÓLAG auth.uid() — egyik RPC sem fogad
-- user_id paramétert a jogosultság eldöntéséhez (a transfer target a
-- jelölt, nem a hívó).

-- ────────────────────────────────────────────────────────────────
-- 1. Trigger: szűk kivétel a kontrollált Family-megszüntetéshez
-- ────────────────────────────────────────────────────────────────
-- A kivétel CSAK akkor él, ha EGYÜTT teljesül:
--   (a) DELETE művelet;
--   (b) a tranzakció-lokális vedettsarok.family_deletion_id beállítás
--       pontosan az érintett family_id (ezt kizárólag a
--       prepare_account_deletion() állítja, set_config(..., true));
--   (c) a families sor MÁR nem létezik (azaz a törlés a families sor
--       törlésének CASCADE-je).
-- Minden más eset (UPDATE, közvetlen family_members DELETE, egyszerű
-- families DELETE beállítás nélkül) a korábbi védelem szerint működik.
create or replace function public.protect_last_family_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_active_owner boolean;
  v_still_active_owner boolean;
  v_other_active_owner_exists boolean;
begin
  if tg_op = 'DELETE'
     and nullif(current_setting('vedettsarok.family_deletion_id', true), '') = old.family_id::text
     and not exists (select 1 from public.families f where f.id = old.family_id) then
    return old;
  end if;

  v_was_active_owner := (old.role = 'owner' and old.status = 'active');

  if tg_op = 'DELETE' then
    v_still_active_owner := false;
  else
    v_still_active_owner := (new.role = 'owner' and new.status = 'active');
  end if;

  if v_was_active_owner and not v_still_active_owner then
    select exists (
      select 1
      from public.family_members fm
      where fm.family_id = old.family_id
        and fm.role = 'owner'
        and fm.status = 'active'
        and fm.id <> old.id
    ) into v_other_active_owner_exists;

    if not v_other_active_owner_exists then
      raise exception
        'Egy family nem maradhat aktív owner nélkül — ez az utolsó aktív owner, a művelet blokkolva (family_id=%)',
        old.family_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

revoke execute on function public.protect_last_family_owner() from public;

-- ────────────────────────────────────────────────────────────────
-- 2. Belső osztályozó (NEM hívható közvetlenül klienstől)
-- ────────────────────────────────────────────────────────────────
create or replace function public._account_deletion_classify(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fam record;
  v_guardian boolean := false;
  v_other_owner boolean := false;
  v_transfer jsonb := '[]'::jsonb;
  v_delete jsonb := '[]'::jsonb;
  v_manual_child_account boolean := false;
  v_manual_complex boolean := false;
  v_n_other_owners int;
  v_n_other_members int;
  v_cands jsonb;
  v_child_count int;
  v_multi int;
  v_accounts int;
  v_state text;
begin
  if p_uid is null then
    return jsonb_build_object('state', 'READY');
  end if;

  -- Gyermek-account user: külön kezelés, automatikus lifecycle NINCS.
  if exists (select 1 from public.child_accounts ca where ca.auth_user_id = p_uid) then
    return jsonb_build_object('state', 'CHILD_ACCOUNT_USER');
  end if;

  for fam in
    select fm.family_id, fm.role, f.name
    from public.family_members fm
    join public.families f on f.id = fm.family_id
    where fm.user_id = p_uid and fm.status = 'active'
    order by fm.family_id
  loop
    if fam.role <> 'owner' then
      v_guardian := true;
      continue;
    end if;

    select count(*) into v_n_other_owners
    from public.family_members fm
    where fm.family_id = fam.family_id and fm.role = 'owner'
      and fm.status = 'active' and fm.user_id <> p_uid;
    if v_n_other_owners > 0 then
      v_other_owner := true;
      continue;
    end if;

    -- Egyetlen aktív owner: van-e másik aktív tag?
    select count(*) into v_n_other_members
    from public.family_members fm
    where fm.family_id = fam.family_id and fm.status = 'active' and fm.user_id <> p_uid;

    if v_n_other_members > 0 then
      -- Átadható jelöltek: aktív guardian, nem gyermek-account user.
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', fm.user_id,
               'display_name', p.display_name) order by p.display_name), '[]'::jsonb)
        into v_cands
      from public.family_members fm
      join public.profiles p on p.id = fm.user_id
      where fm.family_id = fam.family_id and fm.role = 'guardian'
        and fm.status = 'active' and fm.user_id <> p_uid
        and not exists (select 1 from public.child_accounts ca where ca.auth_user_id = fm.user_id);

      if jsonb_array_length(v_cands) = 0 then
        v_manual_complex := true;
      else
        v_transfer := v_transfer || jsonb_build_array(jsonb_build_object(
          'family_id', fam.family_id, 'family_name', fam.name, 'candidates', v_cands));
      end if;
      continue;
    end if;

    -- Egyetlen aktív owner, nincs másik aktív tag: egyszerű-e a Family?
    select count(*) into v_child_count
    from public.family_children fc where fc.family_id = fam.family_id;

    select count(*) into v_multi
    from public.family_children fc
    where fc.family_id = fam.family_id
      and (select count(*) from public.family_children x where x.child_id = fc.child_id) > 1;

    select count(*) into v_accounts
    from public.child_accounts ca
    join public.family_children fc on fc.child_id = ca.child_id
    where fc.family_id = fam.family_id;

    if v_accounts > 0 then
      v_manual_child_account := true;
    elsif v_multi > 0 then
      v_manual_complex := true;
    else
      v_delete := v_delete || jsonb_build_array(jsonb_build_object(
        'family_id', fam.family_id, 'family_name', fam.name, 'child_count', v_child_count));
    end if;
  end loop;

  if v_manual_child_account then
    v_state := 'CHILD_ACCOUNT_MANUAL_REVIEW';
  elsif v_manual_complex then
    v_state := 'COMPLEX_FAMILY_MANUAL_REVIEW';
  elsif jsonb_array_length(v_transfer) > 0 then
    v_state := 'OWNER_TRANSFER_REQUIRED';
  elsif jsonb_array_length(v_delete) > 0 then
    v_state := 'SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED';
  elsif v_other_owner then
    v_state := 'OTHER_OWNER_READY';
  elsif v_guardian then
    v_state := 'GUARDIAN_READY';
  else
    v_state := 'READY';
  end if;

  return jsonb_build_object(
    'state', v_state,
    'transfer', v_transfer,
    'family_deletion', v_delete
  );
end;
$$;

revoke execute on function public._account_deletion_classify(uuid) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- 3. Állapot lekérdezése (a hívó SAJÁT fiókjára)
-- ────────────────────────────────────────────────────────────────
create or replace function public.get_account_deletion_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Bejelentkezés szükséges';
  end if;
  return public._account_deletion_classify(auth.uid());
end;
$$;

revoke execute on function public.get_account_deletion_state() from public, anon;
grant execute on function public.get_account_deletion_state() to authenticated;

-- ────────────────────────────────────────────────────────────────
-- 4. Owner transfer (NEM automatikus: a hívó explicit választ célt)
-- ────────────────────────────────────────────────────────────────
-- Az új owner ELŐSZÖR kap owner szerepkört (guardian -> owner), a régi
-- owner NEM kerül demotálásra vagy törlésre itt: a két owner együtt
-- biztosítja, hogy a Family sosem marad owner nélkül; a régi owner
-- tagsága a fióktörlés (prepare_account_deletion) során távolítható el.
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
end;
$$;

revoke execute on function public.transfer_family_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_family_ownership(uuid, uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────
-- 5. Fióktörlés előkészítése — EGY tranzakció (a függvénytörzs)
-- ────────────────────────────────────────────────────────────────
-- Visszatérés: {ok:true,state,deleted_families,deleted_children} vagy
-- {ok:false,state,...} (fail closed: SEMMIT nem töröl). Ha ok:true, az
-- API utána törli az auth usert; a profiles CASCADE-je ekkor már nem talál
-- Family-sort.
--
-- TÖRLÉSI SORREND egy egyszerű sole-owner Familyre (FK-k alapján):
--   1. child_schedule_items        (child_id -> child_profiles, CASCADE)
--   2. guardian_child_permissions  (child_id)
--   3. child_account_invitations   (child_id; child_accounts sor NINCS,
--                                   így a source_invitation_id RESTRICT nem akad)
--   4. family_children             (a child_profiles törlése előtt)
--   5. child_profiles              (kizárólag a Family gyermekei; RESTRICT
--                                   a child_accounts miatt újraellenőrizve)
--   6. family_guardian_invitations
--   7. families (CASCADE -> family_members; trigger-kivétel, lásd 1.)
-- guardian_authorizations: child_id/guardian_user_id ON DELETE SET NULL —
-- az audit-sorok megmaradnak, személyhez kötés nélkül.
create or replace function public.prepare_account_deletion(
  p_confirm_family_deletion boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class jsonb;
  v_state text;
  v_item jsonb;
  v_fid uuid;
  v_children uuid[];
  v_deleted_families int := 0;
  v_deleted_children int := 0;
begin
  if v_uid is null then
    raise exception 'Bejelentkezés szükséges';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  perform 1 from public.families
   where id in (select family_id from public.family_members where user_id = v_uid)
   order by id for update;

  v_class := public._account_deletion_classify(v_uid);
  v_state := v_class->>'state';

  if v_state not in ('READY', 'GUARDIAN_READY', 'OTHER_OWNER_READY',
                     'SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED') then
    return jsonb_build_object('ok', false) || v_class;
  end if;

  if v_state = 'SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED'
     and coalesce(p_confirm_family_deletion, false) is not true then
    return jsonb_build_object('ok', false) || v_class;
  end if;

  for v_item in select * from jsonb_array_elements(v_class->'family_deletion')
  loop
    v_fid := (v_item->>'family_id')::uuid;

    select coalesce(array_agg(child_id), '{}') into v_children
    from public.family_children where family_id = v_fid;

    -- Újraellenőrzés közvetlenül törlés előtt (fail closed).
    if exists (select 1 from public.child_accounts where child_id = any(v_children))
       or exists (
         select 1 from public.family_children
         where child_id = any(v_children) and family_id <> v_fid)
       or exists (
         select 1 from public.family_members
         where family_id = v_fid and status = 'active' and user_id <> v_uid) then
      raise exception 'A család állapota megváltozott, a törlés megszakadt';
    end if;

    delete from public.child_schedule_items where child_id = any(v_children);
    delete from public.guardian_child_permissions where child_id = any(v_children);
    delete from public.child_account_invitations where child_id = any(v_children);
    delete from public.family_children where family_id = v_fid;
    delete from public.child_profiles where id = any(v_children);
    delete from public.family_guardian_invitations where family_id = v_fid;

    perform set_config('vedettsarok.family_deletion_id', v_fid::text, true);
    delete from public.families where id = v_fid;
    perform set_config('vedettsarok.family_deletion_id', '', true);

    v_deleted_families := v_deleted_families + 1;
    v_deleted_children := v_deleted_children + coalesce(array_length(v_children, 1), 0);
  end loop;

  -- Saját guardian jogosultságok és a megmaradó Family-tagságok eltávolítása
  -- (guardian / másik owner is van: a trigger itt nem blokkol).
  delete from public.guardian_child_permissions where guardian_user_id = v_uid;
  delete from public.family_members where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'state', v_state,
    'deleted_families', v_deleted_families,
    'deleted_children', v_deleted_children
  );
end;
$$;

revoke execute on function public.prepare_account_deletion(boolean) from public, anon;
grant execute on function public.prepare_account_deletion(boolean) to authenticated;

-- ROLLBACK:
--   drop function if exists public.prepare_account_deletion(boolean);
--   drop function if exists public.transfer_family_ownership(uuid, uuid);
--   drop function if exists public.get_account_deletion_state();
--   drop function if exists public._account_deletion_classify(uuid);
--   és a protect_last_family_owner() visszaállítása a
--   20260926_family_db_foundation.sql szerinti definícióra.
