-- Védett Család – gyermekfiók és felnőtt családtagság szétválasztása (20261106000000) SQL-tesztje.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison (lásd
-- account-deletion/scratch_suites.txt: family_role_separation). SOHA nem távoli DB-n.

do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2
     or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'realtime', 'vault'))
  then raise exception 'family_role_separation_test: nem eldobható scratch adatbázis – leállás'; end if;
end $$;

create schema fs;
grant usage on schema fs to anon, authenticated;
create table fs.ctx(k text primary key, v uuid);
create function fs.id(n text) returns uuid language sql stable as $$ select v from fs.ctx where k = n $$;
create function fs.put(n text, val uuid) returns void language sql as $$
  insert into fs.ctx(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
create function fs.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = u), ''), false);
end $$;
create function fs.mkuser(n text, beta boolean default false) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, pilot_access) values (u, n, case when beta then array['family_db_beta'] else '{}'::text[] end);
  perform fs.put(n, u); return u;
end $$;
-- 'ok' vagy 'ERR:<sqlstate>' (hiba esetén a hint, ha van: 'ERR:P0001:<hint>')
create function fs.run(u uuid, q text) returns text language plpgsql as $$
declare v_hint text; begin
  perform fs.as_user(u);
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
create function fs.affected(u uuid, q text) returns text language plpgsql as $$
declare n bigint; begin
  perform fs.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q; get diagnostics n = row_count; execute 'reset role'; return n::text;
  exception when others then return 'ERR:' || sqlstate; end;
end $$;
create function fs.vis(u uuid, q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform fs.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || q || ') s' into n; execute 'reset role'; return n;
  exception when insufficient_privilege then return -1; end;
end $$;
create function fs.status(f uuid, u uuid) returns text language sql stable as $$
  select status from public.family_members where family_id = f and user_id = u $$;
create function fs.perm(c uuid, u uuid) returns text language sql stable as $$
  select status from public.guardian_child_permissions where child_id = c and guardian_user_id = u $$;
create function fs.accept(u uuid, f uuid) returns text language plpgsql as $$
declare v uuid; begin
  select id into v from public.family_guardian_invitations
   where family_id = f and invited_email = (select email from auth.users where id = u) and status = 'pending'
   order by created_at desc limit 1;
  if v is null then return 'no_invitation'; end if;
  return fs.run(u, format('select public.accept_family_guardian_invitation(%L)', v));
end $$;

create function fs.role(f uuid, u uuid) returns text language sql stable as $$
  select role from public.family_members where family_id = f and user_id = u $$;
create function fs.owners(f uuid) returns int language sql stable as $$
  select count(*)::int from public.family_members where family_id = f and role = 'owner' and status = 'active' $$;



-- gyermekfiók-meghívó tokenje az owner nevében (szuperuserként, JWT-kontextussal)
create function fs.child_token(owner uuid, child uuid) returns text language plpgsql as $$
declare t text; begin
  perform fs.as_user(owner);
  select token into t from public.create_child_account_invitation(child, 72);
  return t;
end $$;
create function fs.link_child(u uuid, tok text) returns text language plpgsql as $$
declare v_hint text; begin
  perform fs.as_user(u);
  begin
    perform public.accept_child_account_invitation(tok);
    return 'ok';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    return 'ERR:' || sqlstate || coalesce(':' || nullif(v_hint, ''), '');
  end;
end $$;
create function fs.invite_accept(owner uuid, f uuid, u uuid) returns text language plpgsql as $$
begin
  if fs.run(owner, format('select public.invite_family_guardian(%L, %L)', f, (select email from auth.users where id = u))) <> 'ok' then
    return 'invite_failed';
  end if;
  return fs.accept(u, f);
end $$;
create function fs.member(f uuid, u uuid) returns text language sql stable as $$
  select status from public.family_members where family_id = f and user_id = u $$;

-- Szereplők: a, b (béta ownerek); k1 (élő gyermekfiók), k2 (visszavont gyermekfiók),
-- k3 (felfüggesztett gyermekfiók), k4 (béta + élő gyermekfiók), g (felnőtt), m (függő tag).
select fs.mkuser('a', true), fs.mkuser('b', true), fs.mkuser('k1'), fs.mkuser('k2'), fs.mkuser('k3'), fs.mkuser('k4', true), fs.mkuser('g'), fs.mkuser('m');

do $$
declare a uuid := fs.id('a'); b uuid := fs.id('b'); fa uuid; fb uuid; n text;
begin
  assert fs.run(a, $q$select public.create_family_with_owner('A')$q$) = 'ok' and fs.run(b, $q$select public.create_family_with_owner('B')$q$) = 'ok', 'S1';
  fa := (select id from public.families where created_by = a); fb := (select id from public.families where created_by = b);
  perform fs.put('fa', fa); perform fs.put('fb', fb);
  assert fs.vis(a, format('select 1 where (public.start_family_trial(%L)->>''started'')::boolean', fa)) = 1, 'S2 A próbaidő';
  foreach n in array array['c1', 'c2', 'c4', 'c5', 'c6'] loop
    assert fs.run(a, format('select public.create_child_profile_for_family(%L, %L, null)', fa, n)) = 'ok', 'S3 ' || n;
    perform fs.put(n, (select fc.child_id from public.family_children fc join public.child_profiles cp on cp.id = fc.child_id where fc.family_id = fa and cp.first_name = n));
  end loop;
  assert fs.run(b, format('select public.create_child_profile_for_family(%L, %L, null)', fb, 'c3')) = 'ok', 'S4';
  perform fs.put('c3', (select child_id from public.family_children where family_id = fb));
  assert fs.link_child(fs.id('k1'), fs.child_token(a, fs.id('c1'))) = 'ok', 'S5 k1 élő gyermekfiók';
  assert fs.link_child(fs.id('k2'), fs.child_token(a, fs.id('c2'))) = 'ok', 'S6 k2 gyermekfiók';
  assert fs.run(a, format('select public.revoke_child_account(%L)', fs.id('c2'))) = 'ok', 'S7 k2 kapcsolata visszavonva';
  assert fs.link_child(fs.id('k3'), fs.child_token(b, fs.id('c3'))) = 'ok', 'S8 k3 gyermekfiók';
  update public.child_accounts set status = 'suspended' where auth_user_id = fs.id('k3');
  assert fs.link_child(fs.id('k4'), fs.child_token(a, fs.id('c4'))) = 'ok', 'S9 k4 gyermekfiók';
end $$;

-- N1–N3: élő (active / suspended) gyermekfiók nem lehet gondviselő --------------------------
do $$
declare a uuid := fs.id('a'); b uuid := fs.id('b'); fa uuid := fs.id('fa'); fb uuid := fs.id('fb');
begin
  assert fs.invite_accept(a, fa, fs.id('k1')) = 'ERR:P0001:family_child_account_conflict', 'N1a aktív gyermekfiók ugyanabban a családban elutasítva';
  assert fs.member(fa, fs.id('k1')) is null, 'N1b nem lett tag';
  assert exists (select 1 from public.family_guardian_invitations where family_id = fa and invited_email = 'k1@example.invalid' and status = 'pending'), 'N1c a meghívó függőben maradt (tranzakció visszagörgetve)';
  assert fs.invite_accept(b, fb, fs.id('k1')) = 'ERR:P0001:family_child_account_conflict', 'N2 másik családban sem';
  assert fs.invite_accept(a, fa, fs.id('k3')) = 'ERR:P0001:family_child_account_conflict', 'N3 felfüggesztett gyermekfiók sem';
end $$;

-- P1–P2: megszűnt (revoked) kapcsolat és sima felnőtt -----------------------------------------
do $$
declare a uuid := fs.id('a'); fa uuid := fs.id('fa'); r text;
begin
  r := fs.invite_accept(a, fa, fs.id('k2'));
  assert r = 'ok', 'P1a visszavont gyermekfiókos felnőtt lehet gondviselő: ' || r;
  assert fs.member(fa, fs.id('k2')) = 'active', 'P1b aktív tag';
  r := fs.invite_accept(a, fa, fs.id('g'));
  assert r = 'ok' and fs.member(fa, fs.id('g')) = 'active', 'P2 sima felnőtt meghívás változatlan: ' || r;
end $$;

-- N4–N6: fordított irány és tulajdonosi szerep ---------------------------------------------------
do $$
declare a uuid := fs.id('a'); b uuid := fs.id('b'); fa uuid := fs.id('fa'); fb uuid := fs.id('fb'); r text;
begin
  -- N4: aktív tag (k2) nem kapcsolható vissza gyermekfiókként
  assert fs.link_child(fs.id('k2'), fs.child_token(a, fs.id('c2'))) like 'ERR:P0001%', 'N4a aktív tag gyermekfiók-visszakapcsolása elutasítva';
  assert (select status from public.child_accounts where child_id = fs.id('c2')) = 'revoked', 'N4b a kapcsolat visszavont maradt';
  -- N5: FÜGGŐ (pending) tag sem kapcsolható (a korábbi ellenőrzés ezt nem nézte)
  insert into public.family_members(family_id, user_id, role, status) values (fa, fs.id('m'), 'guardian', 'pending');
  assert fs.link_child(fs.id('m'), fs.child_token(a, fs.id('c5'))) = 'ERR:P0001:family_child_account_conflict', 'N5a függő tag sem lehet gyermekfiók';
  assert not exists (select 1 from public.child_accounts where auth_user_id = fs.id('m')), 'N5b nem jött létre kapcsolat';
  -- N6: élő gyermekfiókos (de béta) felhasználó nem lehet tulajdonos sem
  assert fs.run(fs.id('k4'), $q$select public.create_family_with_owner('K4')$q$) = 'ERR:P0001:family_child_account_conflict', 'N6a család létrehozása elutasítva';
  assert not exists (select 1 from public.families where created_by = fs.id('k4')), 'N6b nem jött létre család';
  -- N7: közvetlen (szuperuser) írás is ütközik — adatbázis-szintű szabály
  r := 'ok';
  begin insert into public.family_members(family_id, user_id, role, status) values (fb, fs.id('k1'), 'guardian', 'active');
  exception when others then r := sqlstate; end;
  assert r = 'P0001', 'N7 közvetlen beszúrás is tiltott';
end $$;

-- P3–P5: meglévő folyamatok -------------------------------------------------------------------------
do $$
declare a uuid := fs.id('a'); fa uuid := fs.id('fa');
begin
  -- P3: kilépés után a felnőtt újra kapcsolható gyermekfiókként (megszűnt tagság nem tilt)
  assert fs.run(fs.id('k2'), format('select public.leave_family(%L)', fa)) = 'ok', 'P3a k2 kilép';
  assert fs.link_child(fs.id('k2'), fs.child_token(a, fs.id('c2'))) = 'ok', 'P3b újrakapcsolás megszűnt tagság után';
  assert (select status from public.child_accounts where child_id = fs.id('c2')) = 'active', 'P3c aktív';
  -- P4: élő kapcsolat állapotváltása (active -> suspended -> active) nem ütközik
  update public.child_accounts set status = 'suspended' where child_id = fs.id('c1');
  update public.child_accounts set status = 'active' where child_id = fs.id('c1');
  assert (select status from public.child_accounts where child_id = fs.id('c1')) = 'active', 'P4 állapotváltás működik';
  -- P5: gondviselő tagság állapotváltása / szerepváltása nem ütközik
  assert fs.run(a, format('select public.handover_family_ownership(%L, %L)', fa, fs.id('g'))) = 'ok', 'P5a tulajdonosváltás működik';
  assert fs.run(fs.id('g'), format('select public.remove_family_member(%L, %L)', fa, a)) = 'ok', 'P5b eltávolítás működik';
  -- P6: a visszavont gyermekfiók-kapcsolat visszavonása nem érinti a tagságot
  assert fs.run(fs.id('g'), format('select public.revoke_child_account(%L)', fs.id('c1'))) = 'ok', 'P6 gyermekfiók visszavonása működik';
end $$;

select 'family_role_separation: N1-N7, P1-P6 OK' as result;
