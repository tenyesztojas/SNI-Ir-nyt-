-- =====================================================================
-- Védett Család — start_family_trial(p_family_id): a 14 napos próbaidő
-- indítása a bejelentkezett owner nevében, EGY tranzakcióban.
-- Sorrend: 20261021 -> 20261022 -> EZ. Kézzel futtatandó; újrafuttatható.
--
-- Jogosultság és zárolás:
--   - SECURITY DEFINER, rögzített search_path; EXECUTE csak authenticated.
--   - A hívó azonosítója KIZÁRÓLAG auth.uid(); a p_family_id csak kijelöli a
--     családot. Owner = aktív family_members sor role='owner' (mint
--     is_family_owner()). Nem tag / idegen / nem létező család -> 'not_owner'
--     (létezés sem derül ki).
--   - Ugyanaz a családonkénti advisory lock, mint a
--     set_family_subscription_state()-ben (újrabelépő ugyanabban a
--     tranzakcióban); az owner-sor FOR SHARE zárolása miatt a szerepkör a
--     tranzakció végéig nem módosulhat (ellenőrzés és írás atomi).
--   - Csak 'trialing' indítható: a meglévő set_family_subscription_state()
--     hívódik rögzített paraméterekkel (a 14 napot a DB számolja, a
--     próbaidő-triggerek és az eseményazonosító-idempotencia érvényesek).
--     Élő fizetős hozzáférést vagy felhasznált próbaidőt nem ír felül.
-- =====================================================================

create or replace function public.start_family_trial(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.family_subscriptions%rowtype;
  v_eff jsonb;
  v_res jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_family_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('family_subscription:' || p_family_id::text, 0));

  perform 1 from public.family_members
   where family_id = p_family_id and user_id = v_uid and role = 'owner' and status = 'active'
   for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  select * into v_sub from public.family_subscriptions where family_id = p_family_id for update;
  if found and v_sub.trial_started_at is not null then
    if v_sub.status = 'trialing' and v_sub.trial_ends_at > now() then
      return jsonb_build_object('ok', true, 'started', false);
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;

  v_eff := public._family_subscription_effective(p_family_id);
  if coalesce((v_eff->>'paid_access')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;

  v_res := public.set_family_subscription_state(
    p_family_id => p_family_id,
    p_plan_key => 'family_plus',
    p_status => 'trialing',
    p_source => 'owner_trial',
    p_provider_event_id => 'trial_start:' || p_family_id::text);

  return jsonb_build_object('ok', true, 'started', not coalesce((v_res->>'duplicate')::boolean, false));
end;
$$;

revoke all on function public.start_family_trial(uuid) from public, anon;
grant execute on function public.start_family_trial(uuid) to authenticated;

-- ROLLBACK (kézzel): drop function if exists public.start_family_trial(uuid);
