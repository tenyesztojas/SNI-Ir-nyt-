-- start_family_trial SQL-teszt (20261021 + 20261022 + 20261023 után).
-- KIZÁRÓLAG eldobható (scratch) Postgres adatbázison.
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
-- hívás authenticated szerepkörben (mint a PostgREST)
create or replace function t.start(u uuid, f uuid) returns jsonb language plpgsql as $$
declare r jsonb; begin
  perform t.as_user(u);
  set local role authenticated;
  r := public.start_family_trial(f);
  reset role;
  perform t.as_user(null);
  return r; end $$;
grant usage on schema t to authenticated;
grant execute on all functions in schema t to authenticated;

do $$
declare o uuid := t.mkuser('o'); g uuid := t.mkuser('g'); x uuid := t.mkuser('x');
        f uuid := t.mkfamily(o); fx uuid := t.mkfamily(x); fp uuid := t.mkfamily(t.mkuser('p')); r jsonb; s record;
begin
  insert into family_members(family_id,user_id,role,status) values (f, g, 'guardian', 'active');

  -- jogosultságok
  assert has_function_privilege('authenticated', 'public.start_family_trial(uuid)', 'execute'), 'P1';
  assert not has_function_privilege('anon', 'public.start_family_trial(uuid)', 'execute'), 'P2';
  assert not has_function_privilege('authenticated', 'public.set_family_subscription_state(uuid,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,text,text,text,text,text,timestamptz)', 'execute'), 'P3';
  assert (select prosecdef from pg_proc where oid = 'public.start_family_trial(uuid)'::regprocedure), 'P4 definer';
  assert (select proconfig::text like '%search_path=public, pg_temp%' from pg_proc where oid = 'public.start_family_trial(uuid)'::regprocedure), 'P5 search_path';

  -- bejelentkezés nélkül
  assert (select public.start_family_trial(f)->>'error') = 'not_authenticated', 'A1';
  -- gondviselő
  r := t.start(g, f); assert r->>'error' = 'not_owner', 'G1 ' || r::text;
  -- idegen család / nem létező család
  r := t.start(o, fx); assert r->>'error' = 'not_owner', 'X1';
  r := t.start(o, gen_random_uuid()); assert r->>'error' = 'not_owner', 'X2';
  assert not exists (select 1 from family_subscriptions where family_id in (f, fx)), 'X3 semmi nem íródott';

  -- tulajdonos: indít, pontosan 14 nap
  r := t.start(o, f); assert r = '{"ok": true, "started": true}'::jsonb, 'O1 ' || r::text;
  select * into s from family_subscriptions where family_id = f;
  assert s.status = 'trialing' and s.trial_ends_at = s.trial_started_at + interval '14 days', 'O2';
  assert exists (select 1 from family_subscription_events where provider_event_id = 'trial_start:' || f and source = 'owner_trial'), 'O3';
  -- ismételt indítás
  r := t.start(o, f); assert r = '{"ok": true, "started": false}'::jsonb, 'R1';
  assert (select trial_started_at from family_subscriptions where family_id = f) = s.trial_started_at, 'R2';
  -- korábbi (lejárt / lemondott) próbaidő
  perform set_family_subscription_state(f, 'family_plus', 'canceled', null, now(), now() + interval '1 day');
  r := t.start(o, f); assert r->>'error' = 'not_eligible', 'T1';
  assert (select status from family_subscriptions where family_id = f) = 'canceled', 'T2 nem írta felül';
  -- aktív fizetős előfizetés, próbaidő nélkül
  perform set_family_subscription_state(fp, 'family_plus', 'active', null, now(), now() + interval '30 days');
  r := t.start((select user_id from family_members where family_id = fp), fp); assert r->>'error' = 'not_eligible', 'A2';
  assert (select status from family_subscriptions where family_id = fp) = 'active', 'A3';
end $$;

select 'start_family_trial: P1-P5, A1-A3, G1, X1-X3, O1-O3, R1-R2, T1-T2 OK' as result;
