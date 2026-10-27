-- =====================================================================
-- Védett Család — családhoz kötött előfizetések ALAPJA (adatmodell +
-- szerveroldali jogosultság-lekérdezés). NEM fut automatikusan: kézzel,
-- ellenőrzés után. Újrafuttatható (if not exists / create or replace /
-- on conflict do nothing / drop policy if exists).
--
-- Elvek:
--   - Előfizetés a CSALÁDHOZ tartozik (families.id), nem userhez.
--   - Írás KIZÁRÓLAG service_role-lal, a set_family_subscription_state()
--     függvényen át (később: fizetési webhook / admin eszköz). authenticated
--     és anon semmit nem írhat; családtag és gyermekfiók nem adhat magának
--     fizetős hozzáférést.
--   - Olvasás: a család aktív tagjai (owner/guardian) a saját családjuk
--     állapotát látják; gyermekfiók (nem family_members tag) és más család
--     tagja nem.
--   - NINCS fizetési korlátozás bevezetve: ez a migráció egyetlen meglévő
--     policy-t / RPC-t sem módosít. A béta (profiles.pilot_access
--     'family_db_beta') hozzáférés változatlan.
--   - Nincs fizetési szolgáltató integráció; a provider* oszlopok későbbi
--     integrációhoz vannak.
-- =====================================================================

-- 1. CSOMAGOK ÉS FUNKCIÓK -------------------------------------------------
create table if not exists public.subscription_plans (
  plan_key    text primary key check (plan_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text not null,
  is_paid     boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.subscription_plan_features (
  plan_key     text not null references public.subscription_plans (plan_key) on delete cascade,
  feature_key  text not null check (feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  primary key (plan_key, feature_key)
);

-- Alapcsomagok (a fizetős csomag funkciólistája üzleti döntés — most üres).
insert into public.subscription_plans (plan_key, name, is_paid) values
  ('free', 'Ingyenes', false),
  ('family_plus', 'Védett Család Plusz', true)
on conflict (plan_key) do nothing;

-- 2. CSALÁDI ELŐFIZETÉS ----------------------------------------------------
create table if not exists public.family_subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  family_id                 uuid not null unique references public.families (id) on delete cascade,
  plan_key                  text not null references public.subscription_plans (plan_key),
  status                    text not null default 'free'
    check (status in ('free', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_started_at          timestamptz,
  trial_ends_at             timestamptz,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  grace_until               timestamptz,
  cancel_at_period_end      boolean not null default false,
  canceled_at               timestamptz,
  provider                  text check (provider is null or provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_customer_id      text check (provider_customer_id is null or char_length(provider_customer_id) <= 255),
  provider_subscription_id  text check (provider_subscription_id is null or char_length(provider_subscription_id) <= 255),
  -- A legutóbb ALKALMAZOTT szolgáltatói esemény ideje (régi esemény ne írjon vissza).
  last_provider_event_at    timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint family_subscriptions_trial_dates
    check (status <> 'trialing' or (trial_ends_at is not null)),
  constraint family_subscriptions_active_period
    check (status not in ('active', 'past_due') or current_period_end is not null),
  constraint family_subscriptions_period_order
    check (current_period_start is null or current_period_end is null or current_period_start < current_period_end),
  constraint family_subscriptions_free_plan
    check (status <> 'free' or plan_key = 'free'),
  constraint family_subscriptions_provider_ids
    check (provider_subscription_id is null or provider is not null)
);

create unique index if not exists family_subscriptions_provider_sub_uniq
  on public.family_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

-- 3. AUDIT / IDEMPOTENCIA ---------------------------------------------------
create table if not exists public.family_subscription_events (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families (id) on delete cascade,
  old_status         text,
  new_status         text not null,
  plan_key           text not null,
  source             text not null check (source ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_event_id  text check (provider_event_id is null or char_length(provider_event_id) <= 255),
  provider_event_at  timestamptz,
  -- applied: állapotot változtatott; stale: régebbi az utoljára alkalmazottnál,
  -- csak naplózva (nem írt vissza).
  outcome            text not null default 'applied' check (outcome in ('applied', 'stale')),
  created_at         timestamptz not null default now()
);
create unique index if not exists family_subscription_events_provider_event_uniq
  on public.family_subscription_events (source, provider_event_id)
  where provider_event_id is not null;

-- 4. JOGOSULTSÁGOK (RLS + GRANT) -------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_features enable row level security;
alter table public.family_subscriptions enable row level security;
alter table public.family_subscription_events enable row level security;

revoke all on public.subscription_plans, public.subscription_plan_features,
              public.family_subscriptions, public.family_subscription_events
  from public, anon, authenticated;
grant select on public.subscription_plans, public.subscription_plan_features to authenticated;
grant select on public.family_subscriptions to authenticated;
grant select, insert, update, delete on public.subscription_plans, public.subscription_plan_features,
                                        public.family_subscriptions, public.family_subscription_events
  to service_role;

drop policy if exists "subscription_plans_read" on public.subscription_plans;
create policy "subscription_plans_read" on public.subscription_plans
  for select to authenticated using (true);
drop policy if exists "subscription_plan_features_read" on public.subscription_plan_features;
create policy "subscription_plan_features_read" on public.subscription_plan_features
  for select to authenticated using (true);
-- Saját család előfizetése: csak aktív family_members tag (owner/guardian).
drop policy if exists "family_subscriptions_member_read" on public.family_subscriptions;
create policy "family_subscriptions_member_read" on public.family_subscriptions
  for select to authenticated using (public.is_family_member(family_id) or public.is_admin());
-- family_subscription_events: nincs authenticated policy (csak service_role).

-- 5. HATÁLYOS ÁLLAPOT (egyetlen igazságforrás) ------------------------------
-- Fizetős funkciók akkor járnak, ha:
--   trialing  és trial_ends_at > most
--   active    és current_period_end > most
--   past_due  és grace_until > most
--   canceled  és current_period_end > most (az előfizetett időszak végéig)
-- Minden más (free, expired, lejárt dátum, hiányzó sor) -> 'free' csomag.
create or replace function public._family_subscription_effective(p_family_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select fs.* from public.family_subscriptions fs where fs.family_id = p_family_id
  ), eff as (
    select
      coalesce((select status from s), 'free') as status,
      coalesce((select plan_key from s), 'free') as plan_key,
      coalesce((
        select case
          when s.status = 'trialing' then s.trial_ends_at > now()
          when s.status = 'active'   then s.current_period_end > now()
          when s.status = 'past_due' then coalesce(s.grace_until > now(), false)
          when s.status = 'canceled' then coalesce(s.current_period_end > now(), false)
          else false
        end from s), false) as paid_access,
      (select current_period_end from s) as current_period_end,
      (select trial_ends_at from s) as trial_ends_at
  )
  select jsonb_build_object(
    'status', eff.status,
    'plan_key', eff.plan_key,
    'effective_plan_key', case when eff.paid_access then eff.plan_key else 'free' end,
    'paid_access', eff.paid_access,
    'trial_ends_at', eff.trial_ends_at,
    'current_period_end', eff.current_period_end,
    'features', coalesce((
      select jsonb_agg(f.feature_key order by f.feature_key)
      from public.subscription_plan_features f
      join public.subscription_plans p on p.plan_key = f.plan_key and p.is_active
      where f.plan_key = case when eff.paid_access then eff.plan_key else 'free' end
    ), '[]'::jsonb)
  )
  from eff;
$$;
revoke all on function public._family_subscription_effective(uuid) from public, anon, authenticated;
grant execute on function public._family_subscription_effective(uuid) to service_role;

-- Bejelentkezett user: csak a SAJÁT (aktív tag) családjára kap választ;
-- idegen család / gyermekfiók / nem tag -> NULL (nem árul el létezést).
create or replace function public.get_family_subscription_state(p_family_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if not (public.is_family_member(p_family_id) or public.is_admin()) then
    return null;
  end if;
  return public._family_subscription_effective(p_family_id);
end;
$$;
revoke all on function public.get_family_subscription_state(uuid) from public, anon;
grant execute on function public.get_family_subscription_state(uuid) to authenticated, service_role;

-- 6. ÁLLAPOTVÁLTÁS — KIZÁRÓLAG service_role --------------------------------
-- Egyetlen tranzakció (a függvényhívás maga), sorrend:
--   1) családonkénti sorosítás: pg_advisory_xact_lock (tranzakció végén
--      oldódik; nem blokkolja a families sor egyéb módosítását);
--   2) eseményfoglalás: INSERT … ON CONFLICT (source, provider_event_id)
--      DO NOTHING. Párhuzamos azonos eseménynél a második INSERT megvárja az
--      első tranzakciót: ha az commitolt -> duplicate:true (nincs hiba, nincs
--      második állapotváltás); ha az visszagördült -> a második alkalmaz.
--   3) elavult esemény szűrése (lásd lent), 4) előfizetés upsert.
-- Bármely hiba (pl. CHECK) az egész hívást visszagörgeti: a foglalás sem
-- marad meg, az esemény újraküldhető.
--
-- Régi esemény visszaírása elleni védelem: ha a hívó megadja a szolgáltató
-- saját eseményidejét (p_provider_event_at), az ennél SZIGORÚAN régebbi esemény
-- 'stale'-ként naplózódik, és nem változtat állapotot. Egyenlő idő nem
-- dönthető el általánosan (pl. másodperces felbontás) — ezért a webhook-
-- integráció KÖTELEZŐ szabálya: (a) aláírás-ellenőrzés, (b) a szolgáltató
-- eseményidejének átadása, (c) azonos/bizonytalan sorrendnél a szolgáltató
-- API-jából frissen lekért előfizetés-pillanatkép írása (nem az esemény
-- payloadja). p_provider_event_at nélkül (pl. kézi admin) nincs sorrend-
-- ellenőrzés.
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
  v_event uuid;
  v_stale boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('family_subscription:' || coalesce(p_family_id::text, ''), 0));

  if not exists (select 1 from public.families where id = p_family_id) then
    raise exception 'subscription_family_not_found';
  end if;

  select status, last_provider_event_at into v_old, v_last
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

  insert into public.family_subscriptions as fs (
    family_id, plan_key, status, trial_started_at, trial_ends_at,
    current_period_start, current_period_end, grace_until, cancel_at_period_end,
    canceled_at, provider, provider_customer_id, provider_subscription_id, last_provider_event_at, updated_at)
  values (
    p_family_id, p_plan_key, p_status,
    case when p_status = 'trialing' then now() end, p_trial_ends_at,
    p_current_period_start, p_current_period_end, p_grace_until, coalesce(p_cancel_at_period_end, false),
    case when p_status = 'canceled' then now() end,
    p_provider, p_provider_customer_id, p_provider_subscription_id, p_provider_event_at, now())
  on conflict (family_id) do update set
    plan_key = excluded.plan_key,
    status = excluded.status,
    trial_started_at = case when excluded.status = 'trialing' and fs.status <> 'trialing'
                            then now() else fs.trial_started_at end,
    trial_ends_at = excluded.trial_ends_at,
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

-- ROLLBACK (kézzel):
--   drop function if exists public.set_family_subscription_state(uuid, text, text, timestamptz, timestamptz,
--     timestamptz, timestamptz, boolean, text, text, text, text, text, timestamptz);
--   drop function if exists public.get_family_subscription_state(uuid);
--   drop function if exists public._family_subscription_effective(uuid);
--   drop table if exists public.family_subscription_events;
--   drop table if exists public.family_subscriptions;
--   drop table if exists public.subscription_plan_features;
--   drop table if exists public.subscription_plans;
