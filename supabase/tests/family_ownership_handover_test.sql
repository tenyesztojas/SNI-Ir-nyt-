-- Védett Család – családtulajdonosi szerep átadása (20261104000000) SQL-tesztje.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison:
--   _bootstrap_stub.sql, _supabase_default_privileges_stub.sql, a családi és fióktörlési
--   migrációk, 20261027*, 20261030000000, 20261103000000, 20261104000000, majd ez a fájl
--   (lásd account-deletion/scratch_suites.txt: family_ownership_handover).
-- SOHA nem production vagy távoli Supabase DB-n: az első blokk ezt ellenőrzi.

do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2
     or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'realtime', 'vault'))
  then raise exception 'family_ownership_handover_test: nem eldobható scratch adatbázis – leállás'; end if;
end $$;

create schema fo;
grant usage on schema fo to anon, authenticated;
create table fo.ctx(k text primary key, v uuid);
create function fo.id(n text) returns uuid language sql stable as $$ select v from fo.ctx where k = n $$;
create function fo.put(n text, val uuid) returns void language sql as $$
  insert into fo.ctx(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
create function fo.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = u), ''), false);
end $$;
create function fo.mkuser(n text, beta boolean default false) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, pilot_access) values (u, n, case when beta then array['family_db_beta'] else '{}'::text[] end);
  perform fo.put(n, u); return u;
end $$;
-- 'ok' vagy 'ERR:<sqlstate>' (hiba esetén a hint, ha van: 'ERR:P0001:<hint>')
create function fo.run(u uuid, q text) returns text language plpgsql as $$
declare v_hint text; begin
  perform fo.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q;
    execute 'reset role';
    return 'ok';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    return 'ERR:' || sqlstate || coalesce(':' || nullif(v_hint, ''), '');
  end;
end $$;
create function fo.affected(u uuid, q text) returns text language plpgsql as $$
declare n bigint; begin
  perform fo.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q; get diagnostics n = row_count; execute 'reset role'; return n::text;
  exception when others then return 'ERR:' || sqlstate; end;
end $$;
create function fo.vis(u uuid, q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform fo.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || q || ') s' into n; execute 'reset role'; return n;
  exception when insufficient_privilege then return -1; end;
end $$;
create function fo.status(f uuid, u uuid) returns text language sql stable as $$
  select status from public.family_members where family_id = f and user_id = u $$;
create function fo.perm(c uuid, u uuid) returns text language sql stable as $$
  select status from public.guardian_child_permissions where child_id = c and guardian_user_id = u $$;
create function fo.accept(u uuid, f uuid) returns text language plpgsql as $$
declare v uuid; begin
  select id into v from public.family_guardian_invitations
   where family_id = f and invited_email = (select email from auth.users where id = u) and status = 'pending'
   order by created_at desc limit 1;
  if v is null then return 'no_invitation'; end if;
  return fo.run(u, format('select public.accept_family_guardian_invitation(%L)', v));
end $$;

create function fo.role(f uuid, u uuid) returns text language sql stable as $$
  select role from public.family_members where family_id = f and user_id = u $$;
create function fo.owners(f uuid) returns int language sql stable as $$
  select count(*)::int from public.family_members where family_id = f and role = 'owner' and status = 'active' $$;

-- Szereplők: a (owner, A), b (owner, B), g (gondviselő A-ban és B-ben), h (gondviselő A-ban),
-- r (A-ból eltávolított), p (A-ba meghívott, még nem fogadta el), x (idegen), k (gyermekfiók).
select fo.mkuser('a', true), fo.mkuser('b', true), fo.mkuser('g'), fo.mkuser('h'), fo.mkuser('r'),
       fo.mkuser('p'), fo.mkuser('x'), fo.mkuser('k');

do $$
declare a uuid := fo.id('a'); b uuid := fo.id('b'); g uuid := fo.id('g'); h uuid := fo.id('h'); r uuid := fo.id('r');
        k uuid := fo.id('k'); fa uuid; fb uuid; ca uuid; item uuid;
begin
  assert fo.run(a, $q$select public.create_family_with_owner('A')$q$) = 'ok', 'S1';
  assert fo.run(b, $q$select public.create_family_with_owner('B')$q$) = 'ok', 'S2';
  fa := (select id from public.families where created_by = a); fb := (select id from public.families where created_by = b);
  perform fo.put('fa', fa); perform fo.put('fb', fb);
  assert fo.vis(a, format('select 1 where (public.start_family_trial(%L)->>''started'')::boolean', fa)) = 1, 'S3 A próbaidő';
  insert into public.family_feature_grants(family_id, feature_key, source) values (fa, 'family.schedule.advanced', 'pilot_grandfather');
  assert fo.run(a, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Anna')) = 'ok', 'S4';
  ca := (select child_id from public.family_children where family_id = fa); perform fo.put('ca', ca);
  foreach g in array array[fo.id('g'), fo.id('h'), fo.id('r')] loop
    assert fo.run(a, format('select public.invite_family_guardian(%L, %L)', fa, (select email from auth.users where id = g))) = 'ok', 'S5 meghívó';
    assert fo.accept(g, fa) = 'ok', 'S6 elfogadás';
  end loop;
  g := fo.id('g');
  assert fo.run(b, format('select public.invite_family_guardian(%L, %L)', fb, 'g@example.invalid')) = 'ok' and fo.accept(g, fb) = 'ok', 'S7 g a B-ben is';
  assert fo.run(a, format('select public.remove_family_member(%L, %L)', fa, r)) = 'ok', 'S8 r eltávolítva';
  assert fo.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'p@example.invalid')) = 'ok', 'S9 p függő meghívó';
  assert fo.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, h)) = 'ok', 'S10';
  insert into public.child_accounts(child_id, auth_user_id, status) values (ca, k, 'active');
  assert fo.run(a, format('select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''08:00'', p_start_date => current_date)', ca, 'Iskola')) = 'ok', 'S11';
  item := (select id from public.child_schedule_items where child_id = ca);
  assert fo.run(k, format('select public.set_child_travel_status(%L, %L)', item, 'depart')) = 'ok', 'S12';
end $$;

-- T1. Séma, jogosultság, közvetlen szerepmódosítás --------------------------------------
do $$
declare a uuid := fo.id('a'); g uuid := fo.id('g'); fa uuid := fo.id('fa'); p oid := 'public.handover_family_ownership(uuid,uuid)'::regprocedure;
begin
  assert (select prosecdef from pg_proc where oid = p), 'T1a SECURITY DEFINER';
  assert (select array_to_string(proconfig, ',') like '%search_path=public, pg_temp%' from pg_proc where oid = p), 'T1b rögzített search_path';
  assert not has_function_privilege('anon', p, 'EXECUTE') and has_function_privilege('authenticated', p, 'EXECUTE'), 'T1c EXECUTE csak authenticated';
  assert not has_table_privilege('authenticated', 'public.family_members', 'UPDATE') and not has_table_privilege('anon', 'public.family_members', 'UPDATE'), 'T1d nincs tábla-UPDATE jog';
  assert not has_column_privilege('authenticated', 'public.family_members', 'role', 'UPDATE') and not has_column_privilege('anon', 'public.family_members', 'role', 'UPDATE'), 'T1e nincs oszlop-UPDATE jog a role-ra';
  assert has_table_privilege('service_role', 'public.family_members', 'UPDATE'), 'T1f service_role UPDATE megmaradt';
  assert fo.run(g, format('update public.family_members set role = %L where family_id = %L and user_id = %L', 'owner', fa, g)) = 'ERR:42501', 'T1g gondviselő nem léptetheti elő magát';
  assert fo.run(a, format('update public.family_members set role = %L where family_id = %L and user_id = %L', 'owner', fa, g)) = 'ERR:42501', 'T1h owner sem közvetlenül';
  assert fo.role(fa, g) = 'guardian', 'T1i szerep változatlan';
  assert to_regprocedure('public.transfer_family_ownership(uuid,uuid)') is not null, 'T1j a fióktörlési transfer_family_ownership változatlanul megvan';
end $$;

-- T2. Jogosulatlan és érvénytelen átadások ----------------------------------------------
do $$
declare a uuid := fo.id('a'); b uuid := fo.id('b'); g uuid := fo.id('g'); h uuid := fo.id('h'); r uuid := fo.id('r');
        p uuid := fo.id('p'); x uuid := fo.id('x'); k uuid := fo.id('k'); fa uuid := fo.id('fa'); fb uuid := fo.id('fb');
        ho text := 'select public.handover_family_ownership(%L, %L)';
begin
  assert fo.run(null, format(ho, fa, g)) like 'ERR:%', 'T2a anon';
  assert fo.run(x, format(ho, fa, g)) = 'ERR:P0001:family_not_owner', 'T2b idegen';
  assert fo.run(b, format(ho, fa, g)) = 'ERR:P0001:family_not_owner', 'T2c másik család ownerje';
  assert fo.run(g, format(ho, fa, h)) = 'ERR:P0001:family_not_owner', 'T2d gondviselő nem kezdeményezhet';
  assert fo.run(a, format(ho, fa, a)) = 'ERR:P0001:family_transfer_to_self', 'T2e saját magának';
  assert fo.run(a, format(ho, fa, b)) = 'ERR:P0001:family_transfer_target_invalid', 'T2f idegen család tagja (b) nem célpont';
  assert fo.run(a, format(ho, fa, x)) = 'ERR:P0001:family_transfer_target_invalid', 'T2g nem tag nem célpont';
  assert fo.run(a, format(ho, fa, r)) = 'ERR:P0001:family_transfer_target_invalid', 'T2h visszavont tag nem célpont';
  assert fo.run(a, format(ho, fa, p)) = 'ERR:P0001:family_transfer_target_invalid', 'T2i függő meghívott nem célpont';
  assert fo.run(a, format(ho, fa, k)) = 'ERR:P0001:family_transfer_target_invalid', 'T2j gyermekfiók nem célpont';
  assert fo.run(a, format(ho, fb, g)) = 'ERR:P0001:family_not_owner', 'T2k más család nevében nem';
  assert fo.owners(fa) = 1 and fo.role(fa, a) = 'owner', 'T2l semmi nem változott';
end $$;

-- T3. Jogosult átadás --------------------------------------------------------------------
do $$
declare a uuid := fo.id('a'); b uuid := fo.id('b'); g uuid := fo.id('g'); h uuid := fo.id('h'); k uuid := fo.id('k');
        fa uuid := fo.id('fa'); fb uuid := fo.id('fb'); ca uuid := fo.id('ca');
        travel bigint := (select count(*) from public.child_travel_statuses);
        sub text := (select status from public.family_subscriptions where family_id = fo.id('fa'));
begin
  assert fo.run(a, format('select public.handover_family_ownership(%L, %L)', fa, g)) = 'ok', 'T3a a átadja g-nek';
  assert fo.role(fa, g) = 'owner' and fo.status(fa, g) = 'active', 'T3b g aktív owner';
  assert fo.role(fa, a) = 'guardian' and fo.status(fa, a) = 'active', 'T3c a aktív gondviselő lett';
  assert fo.owners(fa) = 1, 'T3d pontosan egy owner';
  assert fo.role(fb, g) = 'guardian' and fo.role(fb, b) = 'owner', 'T3e B család változatlan';
  assert fo.role(fa, h) = 'guardian' and fo.perm(ca, h) = 'active', 'T3f h és joga változatlan';
  assert (select count(*) from public.family_members where family_id = fa and status = 'active') = 3, 'T3g létszám változatlan';
  assert exists (select 1 from public.child_profiles where id = ca) and (select status from public.child_accounts where child_id = ca) = 'active'
     and (select auth_user_id from public.child_accounts where child_id = ca) = k, 'T3h gyermekprofil és gyermekfiók változatlan';
  assert (select count(*) from public.child_schedule_items where child_id = ca) = 1 and (select count(*) from public.child_travel_statuses) = travel, 'T3i napirend és utazási előzmény változatlan';
  assert (select status from public.family_subscriptions where family_id = fa) = sub and sub = 'trialing', 'T3j előfizetés (próbaidő) változatlan';
  assert exists (select 1 from public.family_feature_grants where family_id = fa and source = 'pilot_grandfather'), 'T3k családszintű kiadás megmaradt';
  -- új owner valóban owner-jogú, a régi már nem
  assert fo.vis(g, format('select 1 where (public.get_family_capacity(%L)->>''children_used'')::int = 1', fa)) = 1, 'T3l az új owner látja a családot';
  assert fo.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, a)) like 'ERR:%', 'T3m a régi owner már nem adhat jogot';
  assert fo.run(g, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, a)) = 'ok', 'T3n az új owner adhat jogot a régi ownernek';
end $$;

-- T4. Ismételt / „párhuzamos” átadás: a második kérés már nem owner nevében fut -------------
do $$
declare a uuid := fo.id('a'); g uuid := fo.id('g'); h uuid := fo.id('h'); fa uuid := fo.id('fa');
begin
  assert fo.run(a, format('select public.handover_family_ownership(%L, %L)', fa, h)) = 'ERR:P0001:family_not_owner', 'T4a a régi owner második átadása elutasítva';
  assert fo.owners(fa) = 1 and fo.role(fa, g) = 'owner' and fo.role(fa, h) = 'guardian', 'T4b nincs második owner';
  assert (select prosrc like '%pg_advisory_xact_lock%family_capacity%' and prosrc like '%for update%' from pg_proc where proname = 'handover_family_ownership'), 'T4c családonkénti zár és sorzár';
end $$;

-- T5. Utolsó owner védelme ----------------------------------------------------------------
do $$
declare ok boolean := false; g uuid := fo.id('g'); fa uuid := fo.id('fa');
begin
  begin update public.family_members set role = 'guardian' where family_id = fa and user_id = g;
  exception when others then ok := true; end;
  assert ok and fo.role(fa, g) = 'owner', 'T5a az egyetlen owner szuperuserként sem fokozható le';
  assert fo.run(g, format('select public.leave_family(%L)', fa)) = 'ERR:P0001:family_owner_cannot_leave', 'T5b az új owner nem léphet ki';
end $$;

-- T6. A régi owner kilépése és a tag-eltávolítás kompatibilitása ---------------------------
do $$
declare a uuid := fo.id('a'); g uuid := fo.id('g'); h uuid := fo.id('h'); fa uuid := fo.id('fa'); ca uuid := fo.id('ca');
begin
  assert fo.run(a, format('select public.remove_family_member(%L, %L)', fa, h)) = 'ERR:P0001:family_not_owner', 'T6a a régi owner már nem távolíthat el';
  assert fo.run(g, format('select public.remove_family_member(%L, %L)', fa, h)) = 'ok', 'T6b az új owner eltávolíthat';
  assert fo.run(h, format('select public.remove_family_member(%L, %L)', fa, g)) like 'ERR:%', 'T6c owner nem távolítható el';
  assert fo.run(a, format('select public.leave_family(%L)', fa)) = 'ok', 'T6d a régi owner kiléphet';
  assert fo.status(fa, a) = 'revoked' and fo.perm(ca, a) = 'revoked', 'T6e kilépés után joga is megszűnt';
  assert fo.owners(fa) = 1 and (select count(*) from public.family_members where family_id = fa and status = 'active') = 1, 'T6f csak az új owner maradt';
end $$;

select 'family_ownership_handover: T1-T6 OK' as result;
