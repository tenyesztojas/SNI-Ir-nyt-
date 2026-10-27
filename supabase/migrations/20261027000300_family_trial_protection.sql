-- =====================================================================
-- Védett Család — egyszeri, 14 napos próbaidő védelme + jogosultság-kulcsok.
-- A 20261021_family_subscriptions_foundation.sql UTÁN futtatandó, kézzel.
-- Újrafuttatható. A 20261021 migrációt NEM módosítja (create or replace /
-- drop trigger if exists).
--
-- FIGYELEM — a teszt-DB-ben kézzel létrehozott triggerek:
--   protect_family_trial_history_trigger, prevent_family_trial_restart_trigger
-- definíciója a repóban nincs meg. Ez a migráció UGYANEZEN a néven, a
-- public.family_subscriptions táblán hozza létre őket (a régieket drop-olja).
-- Ha bármelyik név MÁS táblán létezik, a migráció megáll (nem találgat).
-- A régi trigger-FÜGGVÉNYEK neve ismeretlen; azokat ez a migráció nem törli —
-- futtatás előtt/után kézzel ellenőrizendő (lásd a jelentést).
--
-- Próbaidő-szabályok (DB-ben kikényszerítve, minden íróra, service_role-ra is):
--   - pontosan 14 nap: trial_ends_at = trial_started_at + 14 nap (a szerver számolja);
--   - családonként egyszer: trial_started_at egyszer állítható be, utána
--     sem nem törölhető, sem nem módosítható; trial_ends_at sem hosszabbítható;
--   - újraindítás tiltva: 'trialing' csak akkor, ha a próbaidő még nem indult,
--     vagy a sor már 'trialing' változatlan dátumokkal (ismételt esemény);
--   - lejárat után nincs Plusz (a _family_subscription_effective dátum alapján
--     számol); fizetős aktiválás (active stb.) bármikor lehetséges;
--   - az előfizetés-sor nem törölhető közvetlenül (a próbaidő-történet ne
--     nullázódjon); a család törlésekor (CASCADE) igen.
-- Család törlése + újralétrehozása: az új család új azonosítót kap, így ÚJ
-- próbaidőt indíthat. Ez a DB-ben nem zárható ki megbízhatóan (a családnak
-- nincs a törlést túlélő azonosítója); a visszaélés elleni védelem (pl.
-- fizetési eszköz / fiók szintű korlát) a fizetési integráció feladata.
-- =====================================================================

do $$
begin
  if exists (
    select 1 from pg_trigger t
    where t.tgname in ('protect_family_trial_history_trigger', 'prevent_family_trial_restart_trigger')
      and not t.tgisinternal
      and t.tgrelid <> 'public.family_subscriptions'::regclass
  ) then
    raise exception 'trial_trigger_on_unexpected_table: kézi ellenőrzés szükséges';
  end if;
end $$;

-- 1. Jogosultság-kulcsok (a teszt-DB-ben már meglévők; idempotens) -----------
insert into public.subscription_plan_features (plan_key, feature_key) values
  ('free', 'family.child_profile.basic'),
  ('free', 'family.schedule.basic'),
  ('free', 'family.safety.basic'),
  ('free', 'family.notification.basic'),
  ('family_plus', 'family.child_profile.basic'),
  ('family_plus', 'family.schedule.basic'),
  ('family_plus', 'family.safety.basic'),
  ('family_plus', 'family.notification.basic'),
  ('family_plus', 'family.children.multiple'),
  ('family_plus', 'family.schedule.advanced'),
  ('family_plus', 'family.guardians.multiple'),
  ('family_plus', 'family.notification.advanced')
on conflict (plan_key, feature_key) do nothing;

-- 2. Próbaidő-történet védelme ----------------------------------------------
create or replace function public.protect_family_trial_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- csak a család törlésével (CASCADE) együtt törölhető
    if exists (select 1 from public.families where id = old.family_id) then
      raise exception 'trial_history_protected';
    end if;
    return old;
  end if;
  if old.trial_started_at is not null and new.trial_started_at is distinct from old.trial_started_at then
    raise exception 'trial_history_protected';
  end if;
  if old.trial_ends_at is not null and new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'trial_history_protected';
  end if;
  if new.family_id is distinct from old.family_id then
    raise exception 'trial_history_protected';
  end if;
  return new;
end;
$$;

-- 3. Újraindítás tiltása + pontosan 14 nap ----------------------------------
create or replace function public.prevent_family_trial_restart()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'trialing' then
    if tg_op = 'UPDATE' and old.trial_started_at is not null
       and not (old.status = 'trialing' and new.trial_started_at = old.trial_started_at) then
      raise exception 'trial_already_used';
    end if;
    if new.trial_started_at is null then
      raise exception 'trial_start_required';
    end if;
  end if;
  if (new.trial_started_at is null) <> (new.trial_ends_at is null) then
    raise exception 'trial_dates_inconsistent';
  end if;
  if new.trial_started_at is not null and new.trial_ends_at <> new.trial_started_at + interval '14 days' then
    raise exception 'trial_length_invalid';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_family_trial_history() from public, anon, authenticated;
revoke all on function public.prevent_family_trial_restart() from public, anon, authenticated;

drop trigger if exists protect_family_trial_history_trigger on public.family_subscriptions;
create trigger protect_family_trial_history_trigger
  before update or delete on public.family_subscriptions
  for each row execute function public.protect_family_trial_history();

drop trigger if exists prevent_family_trial_restart_trigger on public.family_subscriptions;
create trigger prevent_family_trial_restart_trigger
  before insert or update on public.family_subscriptions
  for each row execute function public.prevent_family_trial_restart();

-- 4. set_family_subscription_state: a próbaidő dátumait a SZERVER számolja ---
-- Azonos aláírás, zár/idempotencia/időrend-logika változatlan (20261021).
-- Változás: p_trial_ends_at-nak NULL-nak kell lennie (a vég = kezdet + 14 nap);
-- a próbaidő kezdete/vége a későbbi állapotváltásoknál megmarad.
create or replace function public.set_family_subscription_state(
  p_family_id uuid,
  p_plan_key text,
  p_status text,
  p_trial_ends_at timestamptz default null,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_grace_until timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_source text default 'manual',
  p_provider text default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_provider_event_id text default null,
  p_provider_event_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_last timestamptz;
  v_trial_start timestamptz;
  v_event uuid;
  v_stale boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('family_subscription:' || coalesce(p_family_id::text, ''), 0));

  if not exists (select 1 from public.families where id = p_family_id) then
    raise exception 'subscription_family_not_found';
  end if;
  if p_trial_ends_at is not null then
    raise exception 'trial_end_is_server_defined';
  end if;

  select status, last_provider_event_at, trial_started_at into v_old, v_last, v_trial_start
  from public.family_subscriptions where family_id = p_family_id for update;

  v_stale := p_provider_event_at is not null and v_last is not null and p_provider_event_at < v_last;

  insert into public.family_subscription_events
    (family_id, old_status, new_status, plan_key, source, provider_event_id, provider_event_at, outcome)
  values
    (p_family_id, v_old, p_status, p_plan_key, p_source, p_provider_event_id, p_provider_event_at,
     case when v_stale then 'stale' else 'applied' end)
  on conflict (source, provider_event_id) where provider_event_id is not null do nothing
  returning id into v_event;

  if v_event is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_stale then
    return jsonb_build_object('ok', true, 'duplicate', false, 'stale', true,
                              'state', public._family_subscription_effective(p_family_id));
  end if;

  -- Próbaidő: új indításnál most; különben a meglévő (a trigger tiltja az újraindítást).
  if p_status = 'trialing' and v_trial_start is null then
    v_trial_start := now();
  end if;

  insert into public.family_subscriptions as fs (
    family_id, plan_key, status, trial_started_at, trial_ends_at,
    current_period_start, current_period_end, grace_until, cancel_at_period_end,
    canceled_at, provider, provider_customer_id, provider_subscription_id, last_provider_event_at, updated_at)
  values (
    p_family_id, p_plan_key, p_status,
    v_trial_start, v_trial_start + interval '14 days',
    p_current_period_start, p_current_period_end, p_grace_until, coalesce(p_cancel_at_period_end, false),
    case when p_status = 'canceled' then now() end,
    p_provider, p_provider_customer_id, p_provider_subscription_id, p_provider_event_at, now())
  on conflict (family_id) do update set
    plan_key = excluded.plan_key,
    status = excluded.status,
    trial_started_at = coalesce(fs.trial_started_at, excluded.trial_started_at),
    trial_ends_at = coalesce(fs.trial_ends_at, excluded.trial_ends_at),
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    grace_until = excluded.grace_until,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = case when excluded.status = 'canceled' then coalesce(fs.canceled_at, now()) else null end,
    provider = coalesce(excluded.provider, fs.provider),
    provider_customer_id = coalesce(excluded.provider_customer_id, fs.provider_customer_id),
    provider_subscription_id = coalesce(excluded.provider_subscription_id, fs.provider_subscription_id),
    last_provider_event_at = greatest(fs.last_provider_event_at, excluded.last_provider_event_at),
    updated_at = now();

  return jsonb_build_object('ok', true, 'duplicate', false, 'stale', false,
                            'state', public._family_subscription_effective(p_family_id));
end;
$$;
revoke all on function public.set_family_subscription_state(uuid, text, text, timestamptz, timestamptz, timestamptz,
  timestamptz, boolean, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_family_subscription_state(uuid, text, text, timestamptz, timestamptz, timestamptz,
  timestamptz, boolean, text, text, text, text, text, timestamptz) to service_role;

-- ROLLBACK (kézzel): a két trigger és függvény drop-ja, majd a 20261021
-- set_family_subscription_state újrafuttatása. A jogosultság-kulcsok maradhatnak.
