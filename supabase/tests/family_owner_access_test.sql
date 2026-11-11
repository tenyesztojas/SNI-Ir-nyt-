-- Védett Család – tulajdonosváltás utáni hozzáférés és tulajdonosváltási napló
-- (20261105000000) SQL-tesztje.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison (lásd
-- account-deletion/scratch_suites.txt: family_owner_access). SOHA nem távoli DB-n.

do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2
     or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'realtime', 'vault'))
  then raise exception 'family_owner_access_test: nem eldobható scratch adatbázis – leállás'; end if;
end $$;

create schema fz;
grant usage on schema fz to anon, authenticated;
create table fz.ctx(k text primary key, v uuid);
create function fz.id(n text) returns uuid language sql stable as $$ select v from fz.ctx where k = n $$;
create function fz.put(n text, val uuid) returns void language sql as $$
  insert into fz.ctx(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
create function fz.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = u), ''), false);
end $$;
create function fz.mkuser(n text, beta boolean default false) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, pilot_access) values (u, n, case when beta then array['family_db_beta'] else '{}'::text[] end);
  perform fz.put(n, u); return u;
end $$;
-- 'ok' vagy 'ERR:<sqlstate>' (hiba esetén a hint, ha van: 'ERR:P0001:<hint>')
create function fz.run(u uuid, q text) returns text language plpgsql as $$
declare v_hint text; begin
  perform fz.as_user(u);
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
create function fz.affected(u uuid, q text) returns text language plpgsql as $$
declare n bigint; begin
  perform fz.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q; get diagnostics n = row_count; execute 'reset role'; return n::text;
  exception when others then return 'ERR:' || sqlstate; end;
end $$;
create function fz.vis(u uuid, q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform fz.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || q || ') s' into n; execute 'reset role'; return n;
  exception when insufficient_privilege then return -1; end;
end $$;
create function fz.status(f uuid, u uuid) returns text language sql stable as $$
  select status from public.family_members where family_id = f and user_id = u $$;
create function fz.perm(c uuid, u uuid) returns text language sql stable as $$
  select status from public.guardian_child_permissions where child_id = c and guardian_user_id = u $$;
create function fz.accept(u uuid, f uuid) returns text language plpgsql as $$
declare v uuid; begin
  select id into v from public.family_guardian_invitations
   where family_id = f and invited_email = (select email from auth.users where id = u) and status = 'pending'
   order by created_at desc limit 1;
  if v is null then return 'no_invitation'; end if;
  return fz.run(u, format('select public.accept_family_guardian_invitation(%L)', v));
end $$;

create function fz.role(f uuid, u uuid) returns text language sql stable as $$
  select role from public.family_members where family_id = f and user_id = u $$;
create function fz.owners(f uuid) returns int language sql stable as $$
  select count(*)::int from public.family_members where family_id = f and role = 'owner' and status = 'active' $$;


-- Szereplők: a (béta owner), g (béta NÉLKÜLI gondviselő -> új owner), h (gondviselő),
-- r (eltávolított), x (idegen, béta nélkül), b (másik család béta ownere), k (gyermekfiók), n (új meghívott).
select fz.mkuser('a', true), fz.mkuser('g'), fz.mkuser('h'), fz.mkuser('r'), fz.mkuser('x'), fz.mkuser('b', true), fz.mkuser('k'), fz.mkuser('n');

do $$
declare a uuid := fz.id('a'); b uuid := fz.id('b'); k uuid := fz.id('k'); fa uuid; fb uuid; ca uuid; u uuid;
begin
  assert fz.run(a, $q$select public.create_family_with_owner('A')$q$) = 'ok', 'S1';
  assert fz.run(b, $q$select public.create_family_with_owner('B')$q$) = 'ok', 'S2';
  fa := (select id from public.families where created_by = a); fb := (select id from public.families where created_by = b);
  perform fz.put('fa', fa); perform fz.put('fb', fb);
  assert fz.vis(a, format('select 1 where (public.start_family_trial(%L)->>''started'')::boolean', fa)) = 1, 'S3';
  assert fz.run(a, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Anna')) = 'ok', 'S4';
  ca := (select child_id from public.family_children where family_id = fa); perform fz.put('ca', ca);
  foreach u in array array[fz.id('g'), fz.id('h'), fz.id('r')] loop
    assert fz.run(a, format('select public.invite_family_guardian(%L, %L)', fa, (select email from auth.users where id = u))) = 'ok' and fz.accept(u, fa) = 'ok', 'S5';
  end loop;
  assert fz.run(a, format('select public.remove_family_member(%L, %L)', fa, fz.id('r'))) = 'ok', 'S6 r eltávolítva';
  insert into public.child_accounts(child_id, auth_user_id, status) values (ca, k, 'active');
  assert not (select pilot_access @> array['family_db_beta'] from public.profiles where id = fz.id('g')), 'S7 g-nek nincs pilotjoga';
end $$;

-- A1. Átadás pilotjog nélküli gondviselőnek + napló ----------------------------------------
do $$
declare a uuid := fz.id('a'); g uuid := fz.id('g'); fa uuid := fz.id('fa');
begin
  assert fz.run(a, format('select public.handover_family_ownership(%L, %L)', fa, g)) = 'ok', 'A1a átadás g-nek';
  assert (select count(*) from public.family_ownership_events where family_id = fa and previous_owner_user_id = a and new_owner_user_id = g and method = 'handover') = 1, 'A1b napló bejegyzés';
end $$;

-- A2. Az új, pilotjog nélküli owner tulajdonosi műveletei ---------------------------------
do $$
declare g uuid := fz.id('g'); h uuid := fz.id('h'); a uuid := fz.id('a'); fa uuid := fz.id('fa'); ca uuid := fz.id('ca'); c2 uuid; item uuid;
begin
  assert fz.run(g, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Bence')) = 'ok', 'A2a gyermek felvétele pilotjog nélkül';
  c2 := (select child_id from public.family_children fc join public.child_profiles cp on cp.id = fc.child_id where fc.family_id = fa and cp.first_name = 'Bence');
  assert fz.run(g, format('select public.invite_family_guardian(%L, %L)', fa, 'n@example.invalid')) = 'ok', 'A2b gondviselő meghívása';
  assert fz.run(g, format('select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''08:00'', p_start_date => current_date)', ca, 'Iskola')) = 'ok', 'A2c napirend létrehozása';
  item := (select id from public.child_schedule_items where child_id = ca and title = 'Iskola');
  assert fz.run(g, format('select public.update_child_schedule_item(p_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''08:15'', p_start_date => current_date)', item, 'Iskola')) = 'ok', 'A2d napirend módosítása';
  assert fz.run(g, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, h)) = 'ok', 'A2e családi jogosultság kezelése';
  assert fz.run(g, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, a)) = 'ok', 'A2f jog a régi ownernek';
  assert fz.run(g, format('select public.create_child_account_invitation(%L, 72)', c2)) = 'ok', 'A2g gyermekfiók-meghívó';
  assert fz.run(g, format('select public.remove_family_member(%L, %L)', fa, h)) = 'ok', 'A2h családtag eltávolítása';
  assert fz.vis(g, format('select 1 from public.family_ownership_events where family_id = %L', fa)) = 1, 'A2i az új owner olvassa a naplót';
end $$;

-- A3. A régi owner jogai csökkentek, gyermekenkénti joga szerint lát --------------------
do $$
declare a uuid := fz.id('a'); g uuid := fz.id('g'); fa uuid := fz.id('fa'); ca uuid := fz.id('ca');
begin
  assert fz.run(a, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Tiltott')) like 'ERR:%', 'A3a nem vehet fel gyermeket';
  assert fz.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'q@example.invalid')) like 'ERR:%', 'A3b nem hívhat meg';
  assert fz.run(a, format('select public.remove_family_member(%L, %L)', fa, g)) like 'ERR:%', 'A3c nem távolíthat el';
  assert fz.run(a, format('select public.handover_family_ownership(%L, %L)', fa, g)) = 'ERR:P0001:family_not_owner', 'A3d nem adhat át';
  assert fz.vis(a, format('select 1 from public.child_profiles where id = %L', ca)) = 1, 'A3e a kapott megtekintési joggal látja a gyermeket';
  assert fz.vis(a, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 1, 'A3f látja a napirendet';
  assert fz.run(a, format('select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''09:00'', p_start_date => current_date)', ca, 'X')) like 'ERR:%', 'A3g kezelési jog nélkül nem hoz létre napirendet';
  assert fz.vis(a, format('select 1 from public.family_ownership_events where family_id = %L', fa)) = 0, 'A3h a régi owner (gondviselő) nem olvassa a naplót';
end $$;

-- A4. Visszavont tag, idegen, másik család ---------------------------------------------------
do $$
declare r uuid := fz.id('r'); x uuid := fz.id('x'); b uuid := fz.id('b'); fa uuid := fz.id('fa'); ca uuid := fz.id('ca');
begin
  assert fz.run(r, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'R')) like 'ERR:%', 'A4a visszavont tag nem kezelhet';
  assert fz.vis(r, format('select 1 from public.child_profiles where id = %L', ca)) = 0, 'A4b visszavont tag nem lát';
  assert fz.run(x, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'X')) like 'ERR:%', 'A4c idegen nem kezelhet';
  assert fz.run(b, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'B')) like 'ERR:%', 'A4d másik család béta ownere sem';
  assert fz.vis(x, format('select 1 from public.family_ownership_events where family_id = %L', fa)) = 0
     and fz.vis(b, format('select 1 from public.family_ownership_events where family_id = %L', fa)) = 0
     and fz.vis(r, format('select 1 from public.family_ownership_events where family_id = %L', fa)) = 0, 'A4e idegenek nem olvassák a naplót';
  assert fz.vis(null, 'select 1 from public.family_ownership_events') <= 0, 'A4f anon nem olvassa';
end $$;

-- A5. Új család továbbra is béta-kapus ------------------------------------------------------
do $$ begin
  assert fz.run(fz.id('g'), $q$select public.create_family_with_owner('G saját')$q$) like 'ERR:%', 'A5a az új (béta nélküli) owner sem hozhat létre új családot';
  assert fz.run(fz.id('x'), $q$select public.create_family_with_owner('X')$q$) like 'ERR:%', 'A5b idegen sem';
  assert not exists (select 1 from public.families where created_by in (fz.id('g'), fz.id('x'))), 'A5c nem jött létre család';
end $$;

-- A6. Napló jogosultságai -----------------------------------------------------------------
do $$
declare g uuid := fz.id('g'); fa uuid := fz.id('fa');
begin
  assert (select relrowsecurity from pg_class where oid = 'public.family_ownership_events'::regclass), 'A6a RLS bekapcsolva';
  assert not has_table_privilege('authenticated', 'public.family_ownership_events', 'INSERT')
     and not has_table_privilege('authenticated', 'public.family_ownership_events', 'UPDATE')
     and not has_table_privilege('authenticated', 'public.family_ownership_events', 'DELETE')
     and not has_table_privilege('anon', 'public.family_ownership_events', 'SELECT'), 'A6b csak olvasás, anon semmi';
  assert fz.run(g, format('insert into public.family_ownership_events(family_id, method) values (%L, %L)', fa, 'handover')) = 'ERR:42501', 'A6c az owner sem írhat közvetlenül';
  assert fz.run(g, format('delete from public.family_ownership_events where family_id = %L', fa)) = 'ERR:42501', 'A6d nem törölhető';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'family_ownership_events') = 6
     and not exists (select 1 from information_schema.columns where table_name = 'family_ownership_events' and column_name like '%child%'), 'A6e gyermekadat nincs a naplóban';
end $$;

-- A7. Fióktörlési átadás (transfer_family_ownership) is naplóz, viselkedése változatlan -------
do $$
declare g uuid := fz.id('g'); a uuid := fz.id('a'); fa uuid := fz.id('fa');
begin
  assert fz.run(g, format('select public.transfer_family_ownership(%L, %L)', fa, a)) = 'ok', 'A7a fióktörlési átadás';
  assert (select role from public.family_members where family_id = fa and user_id = a) = 'owner'
     and (select role from public.family_members where family_id = fa and user_id = g) = 'owner', 'A7b a régi viselkedés: mindkettő owner marad';
  assert exists (select 1 from public.family_ownership_events where family_id = fa and previous_owner_user_id = g and new_owner_user_id = a and method = 'account_transfer'), 'A7c naplózva';
end $$;

-- A8. Gyermekfiók regresszió ------------------------------------------------------------------
do $$
declare k uuid := fz.id('k'); ca uuid := fz.id('ca'); item uuid;
begin
  item := (select id from public.child_schedule_items where child_id = ca and title = 'Iskola');
  assert fz.vis(k, format('select 1 from public.child_schedule_items where child_id = %L', ca)) >= 1, 'A8a a gyermek látja a napirendjét';
  assert fz.run(k, format('select public.set_child_travel_status(%L, %L)', item, 'depart')) = 'ok', 'A8b utazási státusz működik';
  assert fz.run(k, format('select public.create_child_profile_for_family(%L, %L, null)', fz.id('fa'), 'K')) like 'ERR:%', 'A8c gyermekfiók nem kezel családot';
end $$;

select 'family_owner_access: A1-A8 OK' as result;
