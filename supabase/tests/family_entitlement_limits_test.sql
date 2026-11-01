-- Védett Család — létszámkorlátok (20261030000000_family_entitlement_enforcement).
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison:
--   _bootstrap_stub.sql, _supabase_default_privileges_stub.sql, a migrációk
--   20261027000400-ig, family_entitlement_limits_pre.sql, 20261030000000, majd ez.
-- SOHA nem production DB-n.

create schema if not exists le;
create or replace function le.as_user(u uuid, email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce(email, (select au.email from auth.users au where au.id = u), ''), false);
end $$;
create or replace function le.mkuser(n text, beta boolean default true) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id,email) values (u, n||'@t.hu');
  insert into public.profiles(id, display_name, pilot_access) values (u, n, case when beta then array['family_db_beta'] else '{}' end);
  return u; end $$;
-- RPC hívás a felhasználóként; hibánál a hint-et (vagy az üzenetet) adja
create or replace function le.try(u uuid, sql text) returns text language plpgsql as $$
declare v_hint text; v_msg text; begin
  perform le.as_user(u);
  execute sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_msg);
end $$;
create or replace function le.children(f uuid) returns int language sql as $$ select count(*)::int from public.family_children where family_id = f $$;
create or replace function le.adults(f uuid) returns int language sql as $$ select count(*)::int from public.family_members where family_id = f and status = 'active' $$;
create or replace function le.invite(o uuid, f uuid, email text) returns text language sql as $$
  select le.try(o, format('select public.invite_family_guardian(%L::uuid, %L)', f, email)) $$;
create or replace function le.accept(u uuid, f uuid) returns text language plpgsql as $$
declare v_id uuid; v_email text := (select email from auth.users where id = u); begin
  select id into v_id from public.family_guardian_invitations
   where family_id = f and invited_email = v_email and status = 'pending' order by created_at desc limit 1;
  if v_id is null then return 'no_invitation'; end if;
  return le.try(u, format('select public.accept_family_guardian_invitation(%L::uuid)', v_id));
end $$;
create or replace function le.add_child(o uuid, f uuid, n text) returns text language sql as $$
  select le.try(o, format('select public.create_child_profile_for_family(%L::uuid, %L, null)', f, n)) $$;
create or replace function le.new_family(o uuid) returns uuid language plpgsql as $$
declare f uuid; begin perform le.as_user(o); f := public.create_family_with_owner('fam'); return f; end $$;

-- L1: új (migráció utáni) család ingyenes korlátokkal ------------------------
do $$
declare o uuid := le.mkuser('o1'); g1 uuid := le.mkuser('g1', false); g2 uuid := le.mkuser('g2', false);
        f uuid; st jsonb; cap jsonb;
begin
  f := le.new_family(o);
  assert not exists (select 1 from family_feature_grants where family_id = f), 'L1a új család nem pilot';
  assert le.add_child(o, f, 'Anna') = 'ok', 'L1b első gyermek';
  assert le.add_child(o, f, 'Bence') = 'family_child_limit_reached', 'L1c második gyermek tiltva';
  assert le.children(f) = 1, 'L1d nem jött létre második gyermek';
  -- meghívó helyet foglal
  assert le.invite(o, f, 'g1@t.hu') = 'ok', 'L1e első meghívó';
  assert le.invite(o, f, 'g2@t.hu') = 'family_guardian_limit_reached', 'L1f második függő meghívó tiltva';
  -- visszavonás felszabadítja a helyet
  perform le.as_user(o);
  perform public.revoke_family_guardian_invitation((select id from family_guardian_invitations where family_id = f and invited_email = 'g1@t.hu'));
  assert le.invite(o, f, 'g2@t.hu') = 'ok', 'L1g visszavonás után új meghívó';
  assert le.accept(g2, f) = 'ok', 'L1h elfogadás (owner + 1 gondviselő)';
  assert le.adults(f) = 2, 'L1i két felnőtt';
  assert le.invite(o, f, 'g1@t.hu') = 'family_guardian_limit_reached', 'L1j harmadik felnőtt tiltva';
  perform le.as_user(o);
  cap := public.get_family_capacity(f);
  assert cap = '{"children_used":1,"children_limit":1,"adults_used":2,"adults_limit":2}'::jsonb, 'L1k kapacitás ' || cap::text;
  perform le.as_user(g1);
  assert public.get_family_capacity(f) is null, 'L1l nem családtag nem látja';
  perform le.as_user(o);
  st := public.get_family_subscription_state(f);
  assert (st->>'pilot')::boolean = false and st->'granted_features' = '[]'::jsonb, 'L1m nem pilot';
end $$;

-- L2: közvetlen táblaírás lezárva (authenticated szerepkör) ----------------
do $$
declare o uuid := le.mkuser('o2'); x uuid := le.mkuser('x2', false); f uuid; c uuid;
begin
  f := le.new_family(o);
  perform le.add_child(o, f, 'Csilla');
  perform le.as_user(o);
  set local role authenticated;
  begin insert into family_members(family_id,user_id,role,status) values (f, x, 'guardian', 'active'); assert false, 'L2a insert member';
  exception when insufficient_privilege then null; end;
  begin update family_members set role = 'owner' where family_id = f; assert false, 'L2b update member';
  exception when insufficient_privilege then null; end;
  begin insert into child_profiles(first_name, created_by) values ('y', o) returning id into c; assert false, 'L2c insert child_profile';
  exception when insufficient_privilege then null; end;
  begin insert into family_children(family_id, child_id) values (f, gen_random_uuid()); assert false, 'L2d insert family_children';
  exception when insufficient_privilege then null; end;
  begin insert into family_feature_grants(family_id, feature_key, source) values (f, 'family.children.multiple', 'self'); assert false, 'L2e grant insert';
  exception when insufficient_privilege then null; end;
  begin perform 1 from family_feature_grants; assert false, 'L2f grant select';
  exception when insufficient_privilege then null; end;
  reset role;
  assert le.adults(f) = 1 and le.children(f) = 1, 'L2g semmi nem változott';
end $$;

-- L3: próbaidő -> Plusz korlát; lejárat után puha korlát ---------------------
do $$
declare o uuid := le.mkuser('o3'); g1 uuid := le.mkuser('g31', false); g2 uuid := le.mkuser('g32', false);
        g3 uuid := le.mkuser('g33', false); kid uuid := le.mkuser('kid3', false);
        f uuid; r jsonb; c uuid; item uuid; i int; tok text;
begin
  f := le.new_family(o);
  assert le.add_child(o, f, 'Dóra') = 'ok', 'L3a első gyermek';
  perform le.as_user(o);
  r := public.start_family_trial(f);
  assert (r->>'ok')::boolean, 'L3b próbaidő indult ' || r::text;
  assert le.add_child(o, f, 'Ede') = 'ok', 'L3c második gyermek próbaidőben';
  assert le.invite(o, f, 'g31@t.hu') = 'ok' and le.invite(o, f, 'g32@t.hu') = 'ok' and le.invite(o, f, 'g33@t.hu') = 'ok', 'L3d három meghívó';
  assert le.accept(g1, f) = 'ok' and le.accept(g2, f) = 'ok', 'L3e két elfogadás próbaidőben';
  assert le.adults(f) = 3, 'L3f három felnőtt';
  -- a próbaidő lejár (a próbaidő-dátumok védettek, ezért a státusz jár le)
  update family_subscriptions set status = 'expired' where family_id = f;
  perform le.as_user(o);
  assert (public.get_family_subscription_state(f)->>'paid_access')::boolean = false, 'L3g nincs Plusz';
  -- meglévő adat és hozzáférés megmarad
  assert le.children(f) = 2 and le.adults(f) = 3, 'L3h semmi nem törlődött';
  assert exists (select 1 from family_members where family_id = f and user_id = g2 and status = 'active'), 'L3i a gondviselő aktív maradt';
  -- új felvétel tiltva, a próbaidőben küldött függő meghívó sem fogadható el
  assert le.add_child(o, f, 'Feri') = 'family_child_limit_reached', 'L3j új gyermek tiltva';
  assert le.accept(g3, f) = 'family_guardian_limit_reached', 'L3k függő meghívó lejárat után';
  assert le.invite(o, f, 'uj@t.hu') = 'family_guardian_limit_reached', 'L3l új meghívó tiltva';
  -- gyermekfiók, napirend, utazási státusz és segítségkérés továbbra is működik
  c := (select child_id from family_children where family_id = f order by created_at limit 1 offset 1);
  perform le.as_user(o);
  select t.token into tok from public.create_child_account_invitation(c, 72) t;
  assert tok is not null, 'L3m gyermekfiók-meghívó';
  perform le.as_user(kid);
  perform public.accept_child_account_invitation(tok);
  assert exists (select 1 from child_accounts where child_id = c and auth_user_id = kid and status = 'active'), 'L3n gyermekfiók összekapcsolva';
  insert into child_schedule_items(child_id,title,schedule_type,time_local,start_date)
    values (c, 'iskola', 'one_time', '08:00', (now() at time zone 'Europe/Budapest')::date) returning id into item;
  assert le.try(kid, format('select public.set_child_travel_status(%L::uuid, %L)', item, 'depart')) = 'ok', 'L3o elindultam';
  assert le.try(kid, format('select public.set_child_travel_status(%L::uuid, %L)', item, 'help')) = 'ok', 'L3p segítségkérés';
  assert le.try(kid, format('select public.set_child_travel_status(%L::uuid, %L)', item, 'arrive')) = 'ok', 'L3q megérkeztem';
  -- owner-átadás teli családban is működik (a létszám nem változik)
  perform le.as_user(o);
  perform public.transfer_family_ownership(f, g1);
  assert exists (select 1 from family_members where family_id = f and user_id = g1 and role = 'owner' and status = 'active'), 'L3r owner-átadás';
  assert le.adults(f) = 3, 'L3s létszám változatlan';
end $$;

-- L4: Plusz felső korlát: 10 gyermek, 10 felnőtt ---------------------------
do $$
declare o uuid := le.mkuser('o4'); f uuid; i int; u uuid; r jsonb;
begin
  f := le.new_family(o);
  perform le.as_user(o);
  r := public.start_family_trial(f);
  for i in 1..10 loop
    assert le.add_child(o, f, 'gy' || i) = 'ok', 'L4a gyermek ' || i;
  end loop;
  assert le.add_child(o, f, 'gy11') = 'family_child_limit_reached', 'L4b 11. gyermek';
  for i in 1..9 loop
    u := le.mkuser('p4_' || i, false);
    assert le.invite(o, f, 'p4_' || i || '@t.hu') = 'ok', 'L4c meghívó ' || i;
    if i <= 5 then assert le.accept(u, f) = 'ok', 'L4d elfogadás ' || i; end if;
  end loop;
  -- 1 owner + 5 aktív + 4 függő = 10 hely
  assert le.invite(o, f, 'p4_x@t.hu') = 'family_guardian_limit_reached', 'L4e 11. hely (függő is foglal)';
  assert le.children(f) = 10, 'L4f';
end $$;

-- L5: pilot család (a migráció előtt létezett) -----------------------------
do $$
declare o uuid := (select id from auth.users where email = 'pilot_owner@t.hu'); f uuid; st jsonb;
        g1 uuid := le.mkuser('g51', false); g2 uuid := le.mkuser('g52', false);
begin
  f := (select family_id from family_members where user_id = o);
  assert (select count(*) from family_feature_grants where family_id = f and source = 'pilot_grandfather' and expires_at is null) = 4, 'L5a pilot-kiadás';
  assert le.add_child(o, f, 'P1') = 'ok' and le.add_child(o, f, 'P2') = 'ok', 'L5b több gyermek';
  assert le.invite(o, f, 'g51@t.hu') = 'ok' and le.invite(o, f, 'g52@t.hu') = 'ok', 'L5c több gondviselő';
  assert le.accept(g1, f) = 'ok' and le.accept(g2, f) = 'ok', 'L5d elfogadás';
  perform le.as_user(o);
  st := public.get_family_subscription_state(f);
  assert (st->>'pilot')::boolean and (st->>'paid_access')::boolean = false, 'L5e pilot, nem fizetős ' || st::text;
  assert st->'features' ? 'family.children.multiple' and st->'features' ? 'family.safety.basic', 'L5f funkciók';
  -- a pilot-család próbaidőt is indíthat (független a kiadástól), és az nem vész el
  assert ((public.start_family_trial(f))->>'ok')::boolean, 'L5g próbaidő';
  update family_subscriptions set status = 'expired' where family_id = f;
  assert le.add_child(o, f, 'P3') = 'ok', 'L5h lejárat után is pilot-korlát';
end $$;

-- L6: visszavont gondviselő visszaaktiválása csak szabad helyre -------------
do $$
declare o uuid := le.mkuser('o6'); g uuid := le.mkuser('g6', false); h uuid := le.mkuser('h6', false); f uuid;
begin
  f := le.new_family(o);
  assert le.invite(o, f, 'g6@t.hu') = 'ok' and le.accept(g, f) = 'ok', 'L6a';
  update family_members set status = 'revoked' where family_id = f and user_id = g;   -- (superuser: owner-eltávolítás szimulálása)
  assert le.invite(o, f, 'h6@t.hu') = 'ok' and le.accept(h, f) = 'ok', 'L6b a felszabadult helyre új gondviselő';
  assert le.invite(o, f, 'g6@t.hu') = 'family_guardian_limit_reached', 'L6c a régi gondviselő nem fér vissza';
  update family_members set status = 'revoked' where family_id = f and user_id = h;
  assert le.invite(o, f, 'g6@t.hu') = 'ok' and le.accept(g, f) = 'ok', 'L6d visszaaktiválás szabad helyre';
  assert (select status from family_members where family_id = f and user_id = g) = 'active', 'L6e';
end $$;

select 'family_entitlement_limits: L1-L6 OK' as result;
