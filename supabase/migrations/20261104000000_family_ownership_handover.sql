-- =====================================================================
-- Védett Család — családtulajdonosi szerep átadása a családkezelő felületről
-- (2026-11-04)
-- =====================================================================
-- Döntések:
--   * ÚJ RPC: handover_family_ownership(p_family_id, p_new_owner_user_id).
--     A meglévő transfer_family_ownership(uuid, uuid) (20261004, élesben is
--     fut) a fióktörlési folyamat szerződése: ott a régi owner SZÁNDÉKOSAN
--     owner marad, amíg a fiókját nem törli. Azt nem módosítjuk.
--   * Itt a régi owner az átadás után AKTÍV GONDVISELŐ lesz (utána a
--     leave_family-vel kiléphet). Gyermekenkénti jogot nem kap automatikusan;
--     ezt az új owner adhatja meg.
--   * Sorrend: ELŐBB a célszemély lesz owner, CSAK UTÁNA lesz a hívó
--     guardian. A family_members_protect_last_owner trigger (BEFORE UPDATE)
--     a hívó lefokozásakor már látja az új aktív ownert, így a család
--     átmenetileg sem marad owner nélkül; fordított sorrendben a trigger
--     megállítaná a műveletet. Szerepkörre nincs egyediségi korlát (csak
--     UNIQUE(family_id, user_id)), így a köztes kétowneres állapot érvényes.
--     A szerepváltás a korlát-triggereket nem érinti (azok status/family_id
--     változásra futnak), a létszám nem változik.
--   * Párhuzamosság: ugyanaz a családonkénti advisory lock, mint a
--     létszámkorlát és a tag-eltávolítás ('family_capacity:<family_id>'),
--     majd a families sor és a két tagsági sor zárolása; a jogosultságot a
--     zárak MEGSZERZÉSE UTÁN ellenőrizzük.
--   * Közvetlen szerepmódosítás: a 20261030 már visszavonta az UPDATE jogot
--     (anon, authenticated) és törölte az update-policy-t; itt
--     ismételhetően megerősítjük (a service_role jogai változatlanok).
--   * Változatlan: gyermekprofilok, gyermekfiókok, napirend, utazási
--     előzmények, előfizetés (family_subscriptions), családszintű kiadások
--     (family_feature_grants), más családok tagságai.
-- Függ: 20260926000000, 20261004 (protect_last_family_owner), 20261030.
-- =====================================================================

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

  -- 1) előléptetés, 2) lefokozás — lásd a fejléc indoklását.
  update public.family_members set role = 'owner' where id = v_target.id;
  update public.family_members set role = 'guardian' where id = v_caller.id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.handover_family_ownership(uuid, uuid) from public, anon;
grant execute on function public.handover_family_ownership(uuid, uuid) to authenticated;

-- Közvetlen szerepmódosítás lezárásának megerősítése (ismételhető).
drop policy if exists "family_members_update_owner_or_admin" on public.family_members;
revoke update on public.family_members from anon, authenticated;

-- ROLLBACK (kézzel, külön jóváhagyással):
--   drop function if exists public.handover_family_ownership(uuid, uuid);
--   (a revoke/drop policy a 20261030 állapotát ismétli, visszaállítani nem kell)
