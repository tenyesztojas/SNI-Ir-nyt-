-- Családi előfizetés alapjainak SQL-tesztje. FUTTATÁS: KIZÁRÓLAG eldobható
-- (scratch) Postgres adatbázison, a Family-migrációk + 20261021 után, a
-- _bootstrap_stub.sql stubjával. SOHA nem production DB-n.

create schema if not exists t;
create or replace function t.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
create or replace function t.mkuser(n text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id,email) values (u, n||'@t.hu');
  insert into public.profiles(id, display_name) values (u, n); return u; end $$;
create or replace function t.mkfamily(o uuid) returns uuid language plpgsql as $$
declare f uuid; begin
  insert into public.families(name, created_by) values ('fam', o) returning id into f;
  insert into public.family_members(family_id,user_id,role,status) values (f, o,'owner','active');
  return f; end $$;
create or replace function t.st(f uuid) returns jsonb language sql as $$ select public._family_subscription_effective(f) $$;
grant usage on schema t to authenticated;
grant execute on all functions in schema t to authenticated;

insert into subscription_plan_features(plan_key, feature_key) values ('family_plus','family.travel_notifications') on conflict do nothing;

do $$
declare
  o uuid := t.mkuser('owner'); g uuid := t.mkuser('guardian'); x uuid := t.mkuser('other'); kid uuid := t.mkuser('kid');
  f uuid := t.mkfamily(o); f2 uuid := t.mkfamily(x); c uuid; r jsonb; n int;
begin
  insert into family_members(family_id,user_id,role,status) values (f, g, 'guardian', 'active');
  insert into child_profiles(first_name, created_by) values ('k', o) returning id into c;
  insert into family_children(family_id, child_id) values (f, c);
  insert into child_accounts(child_id, auth_user_id, status, activated_at) values (c, kid, 'active', now());

  -- S1: nincs sor -> free
  r := t.st(f);
  assert r->>'status' = 'free' and not (r->>'paid_access')::bool and r->'features' = '[]'::jsonb, 'S1 ' || r::text;

  -- S3: próbaidő
  perform set_family_subscription_state(f, 'family_plus', 'trialing', now() + interval '14 days');
  r := t.st(f);
  assert (r->>'paid_access')::bool and r->'features' = '["family.travel_notifications"]'::jsonb, 'S3a ' || r::text;
  assert (select trial_started_at is not null from family_subscriptions where family_id = f), 'S3b';
  update family_subscriptions set trial_ends_at = now() - interval '1 minute' where family_id = f;
  r := t.st(f);
  assert not (r->>'paid_access')::bool and r->>'effective_plan_key' = 'free' and r->'features' = '[]'::jsonb, 'S3c lejárt próbaidő';

  -- S4: aktív / lejárt / past_due türelmi idő / lemondott / expired
  perform set_family_subscription_state(f, 'family_plus', 'active', null, now() - interval '1 day', now() + interval '29 days');
  assert (t.st(f)->>'paid_access')::bool, 'S4a active';
  perform set_family_subscription_state(f, 'family_plus', 'active', null, now() - interval '31 days', now() - interval '1 day');
  assert not (t.st(f)->>'paid_access')::bool, 'S4b active lejárt időszakkal';
  perform set_family_subscription_state(f, 'family_plus', 'past_due', null, now() - interval '31 days', now() - interval '1 day', now() + interval '3 days');
  assert (t.st(f)->>'paid_access')::bool, 'S4c past_due grace';
  perform set_family_subscription_state(f, 'family_plus', 'past_due', null, now() - interval '31 days', now() - interval '1 day', now() - interval '1 hour');
  assert not (t.st(f)->>'paid_access')::bool, 'S4d past_due grace lejárt';
  perform set_family_subscription_state(f, 'family_plus', 'canceled', null, now() - interval '1 day', now() + interval '5 days');
  assert (t.st(f)->>'paid_access')::bool, 'S4e canceled időszak végéig';
  assert (select canceled_at is not null from family_subscriptions where family_id = f), 'S4f';
  perform set_family_subscription_state(f, 'family_plus', 'expired');
  assert not (t.st(f)->>'paid_access')::bool, 'S4g expired';

  -- S9: konzisztencia
  begin perform set_family_subscription_state(f, 'family_plus', 'free'); assert false, 'S9a';
  exception when check_violation then null; end;
  begin perform set_family_subscription_state(f, 'family_plus', 'trialing'); assert false, 'S9b';
  exception when check_violation then null; end;
  begin perform set_family_subscription_state(f, 'nope', 'active', null, null, now() + interval '1 day'); assert false, 'S9c';
  exception when foreign_key_violation then null; end;

  -- S7: idempotens szolgáltatói esemény
  perform set_family_subscription_state(f, 'family_plus', 'active', null, now(), now() + interval '30 days',
    null, false, 'stripe', 'stripe', 'cus_1', 'sub_1', 'evt_1');
  r := set_family_subscription_state(f, 'free', 'free', null, null, null, null, false, 'stripe', null, null, null, 'evt_1');
  assert (r->>'duplicate')::bool, 'S7a';
  assert (select status from family_subscriptions where family_id = f) = 'active', 'S7b duplikált esemény nem írt felül';
  select count(*) into n from family_subscription_events where provider_event_id = 'evt_1';
  assert n = 1, 'S7c';

  -- S5/S6: olvasás — saját tag igen, más család / gyermekfiók / nem tag nem
  perform t.as_user(o);  assert (get_family_subscription_state(f)->>'paid_access')::bool, 'S5a owner';
  perform t.as_user(g);  assert get_family_subscription_state(f) is not null, 'S5b guardian';
  perform t.as_user(x);  assert get_family_subscription_state(f) is null, 'S5c más család';
  perform t.as_user(kid); assert get_family_subscription_state(f) is null, 'S6 gyermekfiók';
  perform t.as_user(null); assert get_family_subscription_state(f) is null, 'S5d anon';
  assert get_family_subscription_state(f2) is null, 'S5e';
end $$;

-- S5f: RLS a táblán (authenticated szerepkörben)
do $$
declare x uuid := (select id from profiles where display_name = 'other'); o uuid := (select id from profiles where display_name = 'owner'); n int;
begin
  perform t.as_user(x);
  set local role authenticated;
  select count(*) into n from family_subscriptions; assert n = 0, 'S5f más család sorai rejtve';
  reset role;
  perform t.as_user(o);
  set local role authenticated;
  select count(*) into n from family_subscriptions; assert n = 1, 'S5g saját család látszik';
  reset role;
end $$;

-- S2: jogosulatlan módosítás
do $$
declare o uuid := (select id from profiles where display_name = 'owner');
        kid uuid := (select id from profiles where display_name = 'kid');
        f uuid := (select family_id from family_subscriptions limit 1);
begin
  assert not has_function_privilege('authenticated', 'public.set_family_subscription_state(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,text,text,timestamptz)', 'execute'), 'S2a';
  assert not has_function_privilege('anon', 'public.set_family_subscription_state(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,text,text,timestamptz)', 'execute'), 'S2b';
  assert not has_function_privilege('authenticated', 'public._family_subscription_effective(uuid)', 'execute'), 'S2c';
  assert not has_function_privilege('anon', 'public.get_family_subscription_state(uuid)', 'execute'), 'S2d';
  for r in 1..1 loop
    foreach kid in array array[o, kid] loop
      perform t.as_user(kid);
      set local role authenticated;
      begin update family_subscriptions set status = 'active', current_period_end = now() + interval '1 year'; assert false, 'S2e update';
      exception when insufficient_privilege then null; end;
      begin insert into family_subscriptions(family_id, plan_key, status, current_period_end) values (f, 'family_plus', 'active', now() + interval '1 year'); assert false, 'S2f insert';
      exception when insufficient_privilege then null; end;
      begin insert into subscription_plan_features values ('free', 'family.travel_notifications'); assert false, 'S2g plan features';
      exception when insufficient_privilege then null; end;
      begin perform set_family_subscription_state(f, 'family_plus', 'active', null, now(), now() + interval '1 year'); assert false, 'S2h rpc';
      exception when insufficient_privilege then null; end;
      reset role;
    end loop;
  end loop;
  assert (select count(*) from subscription_plan_features where plan_key = 'free') = 0, 'S2i';
end $$;

-- S10: elavult (régebbi) szolgáltatói esemény nem ír vissza
do $$
declare f uuid := (select family_id from family_subscriptions limit 1); r jsonb;
begin
  r := set_family_subscription_state(f, 'family_plus', 'active', null, now(), now() + interval '30 days',
    null, false, 'stripe', 'stripe', null, null, 'evt_new', now());
  assert not (r->>'stale')::bool, 'S10a';
  r := set_family_subscription_state(f, 'family_plus', 'canceled', null, now() - interval '60 days', now() - interval '30 days',
    null, false, 'stripe', 'stripe', null, null, 'evt_old', now() - interval '1 hour');
  assert (r->>'stale')::bool, 'S10b';
  assert (select status from family_subscriptions where family_id = f) = 'active', 'S10c nem írt vissza';
  assert (select outcome from family_subscription_events where provider_event_id = 'evt_old') = 'stale', 'S10d naplózva';
  r := set_family_subscription_state(f, 'family_plus', 'canceled', null, now() - interval '60 days', now() - interval '30 days',
    null, false, 'stripe', 'stripe', null, null, 'evt_old', now() - interval '1 hour');
  assert (r->>'duplicate')::bool, 'S10e stale esemény ismétlése duplicate';
end $$;

-- S11: rollback — hibás állapot nem hagy foglalást, az esemény újraküldhető
do $$
declare f uuid := (select family_id from family_subscriptions limit 1); r jsonb;
begin
  begin
    perform set_family_subscription_state(f, 'family_plus', 'trialing', null, null, null, null, false,
      'stripe', 'stripe', null, null, 'evt_bad', now() + interval '1 minute');
    assert false, 'S11a';
  exception when check_violation then null; end;
  assert not exists (select 1 from family_subscription_events where provider_event_id = 'evt_bad'), 'S11b foglalás visszagördült';
  r := set_family_subscription_state(f, 'family_plus', 'trialing', now() + interval '7 days', null, null, null, false,
    'stripe', 'stripe', null, null, 'evt_bad', now() + interval '1 minute');
  assert not (r->>'duplicate')::bool and (select status from family_subscriptions where family_id = f) = 'trialing', 'S11c újraküldve alkalmazva';
end $$;

select 'family_subscriptions: S1-S11 OK' as result;
