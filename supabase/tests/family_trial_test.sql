-- Próbaidő-védelem SQL-tesztje (20261021 + 20261022 után). KIZÁRÓLAG
-- eldobható (scratch) Postgres adatbázison. SOHA nem production DB-n.

create schema if not exists t;
create or replace function t.mkuser(n text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id,email) values (u, n||'@t.hu');
  insert into public.profiles(id, display_name) values (u, n); return u; end $$;
create or replace function t.mkfamily(o uuid) returns uuid language plpgsql as $$
declare f uuid; begin
  insert into public.families(name, created_by) values ('fam', o) returning id into f;
  insert into public.family_members(family_id,user_id,role,status) values (f, o,'owner','active');
  return f; end $$;
create or replace function t.err(sql text) returns text language plpgsql as $$
begin execute sql; return 'OK'; exception when others then return sqlerrm; end $$;
create or replace function t.set(f uuid, st text, ev text default null, pend interval default '30 days')
returns jsonb language sql as $$
  select public.set_family_subscription_state(f, case when st in ('free') then 'free' else 'family_plus' end, st,
    null, now(), case when st in ('active','past_due','canceled') then now() + pend end, null, false,
    'test', 'test', null, null, ev, null) $$;

do $$
declare o uuid := t.mkuser('o'); f uuid := t.mkfamily(o); f2 uuid; r jsonb; s record; n int;
begin
  -- K: jogosultság-kulcsok (4 ingyenes, 8 Plusz)
  assert (select count(*) from subscription_plan_features where plan_key = 'free') = 4, 'K1';
  assert (select count(*) from subscription_plan_features where plan_key = 'family_plus') = 8, 'K2';
  assert (public._family_subscription_effective(f)->'features') @> '["family.safety.basic"]', 'K3 biztonság ingyenes';

  -- T1: indítás -> pontosan 14 nap, Plusz-hozzáférés
  r := t.set(f, 'trialing', 'e1');
  select * into s from family_subscriptions where family_id = f;
  assert s.trial_ends_at = s.trial_started_at + interval '14 days', 'T1a 14 nap';
  assert (r->'state'->>'paid_access')::bool and (r->'state'->'features') @> '["family.schedule.advanced"]', 'T1b';
  -- ismételt 'trialing' esemény: nem indít újra, dátum változatlan
  perform t.set(f, 'trialing', 'e2');
  assert (select trial_started_at from family_subscriptions where family_id = f) = s.trial_started_at, 'T1c';
  -- kliens által megadott vég tiltott
  assert t.err(format($q$select set_family_subscription_state(%L,'family_plus','trialing',now()+interval '90 days')$q$, f))
         = 'trial_end_is_server_defined', 'T1d';

  -- T2: hosszabbítás / történet-átírás tiltva (service_role-ként közvetlenül is)
  assert t.err(format($q$update family_subscriptions set trial_ends_at = trial_ends_at + interval '30 days' where family_id = %L$q$, f)) ~ '^trial_(history_protected|length_invalid|already_used|start_required)$', 'T2a';
  assert t.err(format($q$update family_subscriptions set trial_started_at = now() + interval '1 day', trial_ends_at = now() + interval '15 days' where family_id = %L$q$, f)) ~ '^trial_(history_protected|length_invalid|already_used|start_required)$', 'T2b';
  assert t.err(format($q$update family_subscriptions set trial_started_at = null, trial_ends_at = null where family_id = %L$q$, f)) ~ '^trial_(history_protected|length_invalid|already_used|start_required)$', 'T2c';
  assert t.err(format($q$delete from family_subscriptions where family_id = %L$q$, f)) = 'trial_history_protected', 'T2d';

  -- T3: lemondás / státuszváltás után nincs újraindítás
  perform t.set(f, 'canceled', 'e3', '0 days'::interval + interval '1 second');
  assert t.err(format($q$select t.set(%L, 'trialing', 'e4')$q$, f)) = 'trial_already_used', 'T3a';
  assert not exists (select 1 from family_subscription_events where provider_event_id = 'e4'), 'T3b rollback: nincs foglalás';
  perform t.set(f, 'expired', 'e5');
  assert t.err(format($q$select t.set(%L, 'trialing', 'e6')$q$, f)) = 'trial_already_used', 'T3c';
  assert t.err(format($q$update family_subscriptions set status = 'trialing' where family_id = %L$q$, f)) = 'trial_already_used', 'T3d';

  -- T4: fizetős aktiválás a próbaidő után lehetséges, a próbaidő-történet megmarad
  r := t.set(f, 'active', 'e7');
  assert (r->'state'->>'paid_access')::bool, 'T4a';
  assert (select trial_started_at from family_subscriptions where family_id = f) = s.trial_started_at, 'T4b';

  -- T5: lejárt próbaidő nem ad Plusz-t (dátum szerint)
  f2 := t.mkfamily(t.mkuser('o2'));
  perform t.set(f2, 'trialing', 'f2e1');
  alter table family_subscriptions disable trigger protect_family_trial_history_trigger;
  alter table family_subscriptions disable trigger prevent_family_trial_restart_trigger;
  update family_subscriptions set trial_started_at = now() - interval '15 days', trial_ends_at = now() - interval '1 day' where family_id = f2;
  alter table family_subscriptions enable trigger protect_family_trial_history_trigger;
  alter table family_subscriptions enable trigger prevent_family_trial_restart_trigger;
  r := public._family_subscription_effective(f2);
  assert not (r->>'paid_access')::bool and r->>'effective_plan_key' = 'free'
     and not (r->'features') @> '["family.schedule.advanced"]' and (r->'features') @> '["family.safety.basic"]', 'T5';
  assert t.err(format($q$select t.set(%L, 'trialing', 'f2e2')$q$, f2)) = 'OK', 'T5b ismételt trialing esemény nem hiba';
  assert not (public._family_subscription_effective(f2)->>'paid_access')::bool, 'T5c és nem hosszabbít';

  -- T6: fizetős előfizetés próbaidő nélkül; később próbaidő is indítható (egyszer)
  f2 := t.mkfamily(t.mkuser('o3'));
  perform t.set(f2, 'active', 'f3e1');
  assert (select trial_started_at is null from family_subscriptions where family_id = f2), 'T6a';

  -- T7: család törlése -> az előfizetés-sor CASCADE törlődik (új család = új azonosító)
  -- (scratch: a last-owner védelmet a 20261004-es törlési kivétel kezeli élesben)
  alter table family_members disable trigger family_members_protect_last_owner;
  delete from families where id = f2;
  alter table family_members enable trigger family_members_protect_last_owner;
  assert not exists (select 1 from family_subscriptions where family_id = f2), 'T7';

  -- T8: a korábbi védelem megmaradt (idempotencia, időrend)
  r := t.set(f, 'active', 'e7');
  assert (r->>'duplicate')::bool, 'T8a';
  assert not has_function_privilege('authenticated', 'public.set_family_subscription_state(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,text,text,timestamptz)', 'execute'), 'T8b';
  assert has_function_privilege('service_role', 'public.set_family_subscription_state(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,text,text,timestamptz)', 'execute'), 'T8c';
  select count(*) into n from pg_trigger where tgrelid = 'public.family_subscriptions'::regclass
    and tgname in ('protect_family_trial_history_trigger', 'prevent_family_trial_restart_trigger');
  assert n = 2, 'T8d';
end $$;

select 'family_trial: K1-K3, T1-T8 OK' as result;
