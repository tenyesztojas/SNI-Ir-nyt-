-- Védett Család – családi jogosultságok (RPC + RLS + direkt táblaírás) SQL-tesztje.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison, ebben a sorrendben:
--   _bootstrap_stub.sql, _supabase_default_privileges_stub.sql, a családi migrációk
--   20260926000000 … 20261027000400, opcionálisan 20261030000000, végül ez a fájl.
--   Lásd: account-deletion/scratch_suites.txt (family_core_access, family_core_access_pre1030).
-- SOHA nem production vagy távoli Supabase DB-n: az első blokk ezt ellenőrzi és leáll.
-- A teszt a 20261030000000 meglétét a public.family_feature_grants táblából ismeri fel.
-- A hibás viselkedést NEM javítja: az ismert hiányosságokat az fc.result táblába írja
-- (a kimenet utolsó sora), az elvárt viselkedést assert-tel ellenőrzi.

-- 0. Biztonsági őr: csak a stub-os scratch adatbázison fut ---------------------------
do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2
     or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'realtime', 'vault'))
  then
    raise exception 'family_core_access_test: nem eldobható scratch adatbázis – leállás';
  end if;
end $$;

-- Segédek ------------------------------------------------------------------------
create schema fc;
grant usage on schema fc to anon, authenticated;
create table fc.ctx(k text primary key, v uuid);
create table fc.tok(k text primary key, v text);
create table fc.result(k text primary key, v text);

create function fc.id(n text) returns uuid language sql stable as $$ select v from fc.ctx where k = n $$;
create function fc.put(n text, val uuid) returns void language sql as $$
  insert into fc.ctx(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
create function fc.note(n text, val text) returns void language sql as $$
  insert into fc.result(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
create function fc.post1030() returns boolean language sql stable as $$
  select to_regclass('public.family_feature_grants') is not null $$;

create function fc.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = u), ''), false);
end $$;

create function fc.mkuser(n text, beta boolean default false) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, pilot_access)
  values (u, n, case when beta then array['family_db_beta'] else '{}'::text[] end);
  perform fc.put(n, u);
  return u;
end $$;

-- SQL futtatása a felhasználó nevében (u = NULL → anon), valódi szerepkörrel (RLS él).
-- 'ok' vagy 'ERR:<sqlstate>'; hiba esetén a szerepkör a részművelettel együtt visszaáll.
create function fc.run(u uuid, q text) returns text language plpgsql as $$
begin
  perform fc.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q;
    execute 'reset role';
    return 'ok';
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end $$;

-- Érintett sorok száma (UPDATE/DELETE) a felhasználó nevében, vagy 'ERR:<sqlstate>'.
create function fc.affected(u uuid, q text) returns text language plpgsql as $$
declare n bigint; begin
  perform fc.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q;
    get diagnostics n = row_count;
    execute 'reset role';
    return n::text;
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end $$;

-- Látható sorok száma; -1, ha a szerepkörnek SELECT joga sincs.
create function fc.vis(u uuid, q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform fc.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || q || ') s' into n;
    execute 'reset role';
    return n;
  exception when insufficient_privilege then
    return -1;
  end;
end $$;

-- Visszautasítva: RPC-hiba vagy jogosultsági hiba (és NEM siker).
create function fc.denied(r text) returns boolean language sql immutable as $$ select r like 'ERR:%' $$;
-- Direkt írás blokkolva: hiba, vagy 0 érintett sor.
create function fc.blocked(r text) returns boolean language sql immutable as $$ select r like 'ERR:%' or r = '0' $$;

-- Szereplők: a, b = két külön család bétás ownerje; g = meghívott guardian; x = idegen;
-- k = gyermek-fiók; r, y = meghívás visszavonás/elutasítás alanyai; g2 = soha nem meghívott.
select fc.mkuser('a', true), fc.mkuser('b', true), fc.mkuser('c', true), fc.mkuser('g'), fc.mkuser('x'),
       fc.mkuser('k'), fc.mkuser('r'), fc.mkuser('y'), fc.mkuser('g2');

-- C1. Család létrehozása -----------------------------------------------------------
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x'); fa uuid; fb uuid;
begin
  assert fc.run(a, $q$select public.create_family_with_owner('A család')$q$) = 'ok', 'C1a owner (béta) létrehozhat családot';
  assert fc.run(b, $q$select public.create_family_with_owner('B család')$q$) = 'ok', 'C1b másik béta owner is';
  fa := (select id from public.families where created_by = a);
  fb := (select id from public.families where created_by = b);
  perform fc.put('fa', fa); perform fc.put('fb', fb);
  assert exists (select 1 from public.family_members where family_id = fa and user_id = a and role = 'owner' and status = 'active'), 'C1c owner tagság létrejött';
  assert fc.denied(fc.run(x, $q$select public.create_family_with_owner('X')$q$)), 'C1d béta nélküli felhasználó elutasítva';
  assert fc.denied(fc.run(null, $q$select public.create_family_with_owner('anon')$q$)), 'C1e anon elutasítva';
  assert not exists (select 1 from public.families where created_by = x), 'C1f nem jött létre család x-nek';
  -- direkt táblaírás
  assert fc.run(x, format('insert into public.families(name, created_by) values (%L, %L)', 'X', x)) = 'ERR:42501', 'C1g béta nélküli direkt INSERT tiltva';
  assert fc.run(b, format('insert into public.families(name, created_by) values (%L, %L)', 'hamis', a)) = 'ERR:42501', 'C1h más nevében (created_by) direkt INSERT tiltva';
  assert fc.run(null, format('insert into public.families(name, created_by) values (%L, null)', 'anon')) like 'ERR:%', 'C1i anon direkt INSERT tiltva';
end $$;

-- C2. Gyermekprofil létrehozása -----------------------------------------------------
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x'); fa uuid := fc.id('fa'); fb uuid := fc.id('fb');
begin
  assert fc.run(a, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Anna')) = 'ok', 'C2a owner létrehoz gyermeket';
  perform fc.put('ca', (select child_id from public.family_children where family_id = fa));
  assert fc.denied(fc.run(b, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Idegen'))), 'C2b másik család ownerje elutasítva';
  assert fc.denied(fc.run(x, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Idegen'))), 'C2c nem tag elutasítva';
  assert fc.denied(fc.run(null, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Anon'))), 'C2d anon elutasítva';
  assert (select count(*) from public.family_children where family_id = fa) = 1, 'C2e pontosan 1 gyermek';
  assert fc.run(b, format('select public.create_child_profile_for_family(%L, %L, null)', fb, 'Bori')) = 'ok', 'C2f B család saját gyermeke';
  perform fc.put('cb', (select child_id from public.family_children where family_id = fb));
  -- direkt INSERT a child_profiles-ba: nincs insert policy
  assert fc.run(a, 'insert into public.child_profiles default values') = 'ERR:42501', 'C2g direkt child_profiles INSERT tiltva';
  -- direkt UPDATE idegen gyermekprofilon: 0 sor
  assert fc.blocked(fc.affected(b, format('update public.child_profiles set updated_at = now() where id = %L', fc.id('ca')))), 'C2h idegen gyermekprofil UPDATE 0 sor';
  assert fc.blocked(fc.affected(b, format('delete from public.child_profiles where id = %L', fc.id('ca')))), 'C2i idegen gyermekprofil DELETE 0 sor';
  assert exists (select 1 from public.child_profiles where id = fc.id('ca')), 'C2j gyermekprofil megmaradt';
end $$;

-- C3. Guardian meghívás: létrehozás, láthatóság, elfogadás, visszavonás, elutasítás ----
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x'); g uuid := fc.id('g');
        r uuid := fc.id('r'); y uuid := fc.id('y'); fa uuid := fc.id('fa'); fb uuid := fc.id('fb'); inv uuid;
begin
  -- meghívás: csak a saját család ownerje
  assert fc.denied(fc.run(b, format('select public.invite_family_guardian(%L, %L)', fa, 'r@example.invalid'))), 'C3a másik család ownerje nem hívhat meg';
  assert fc.denied(fc.run(x, format('select public.invite_family_guardian(%L, %L)', fa, 'r@example.invalid'))), 'C3b nem tag nem hívhat meg';
  assert fc.denied(fc.run(null, format('select public.invite_family_guardian(%L, %L)', fa, 'r@example.invalid'))), 'C3c anon nem hívhat meg';
  assert not exists (select 1 from public.family_guardian_invitations where family_id = fa), 'C3d elutasított hívásból nincs meghívó';
  -- visszavonás (r): először, hogy a Free 2 felnőttes keretbe beleférjen
  assert fc.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'r@example.invalid')) = 'ok', 'C3e owner meghív (r)';
  inv := (select id from public.family_guardian_invitations where family_id = fa and invited_email = 'r@example.invalid');
  assert fc.denied(fc.run(b, format('select public.revoke_family_guardian_invitation(%L)', inv))), 'C3f másik család ownerje nem vonhat vissza';
  assert fc.denied(fc.run(r, format('select public.revoke_family_guardian_invitation(%L)', inv))), 'C3g a címzett nem vonhat vissza';
  assert fc.denied(fc.run(null, format('select public.revoke_family_guardian_invitation(%L)', inv))), 'C3h anon nem vonhat vissza';
  assert (select status from public.family_guardian_invitations where id = inv) = 'pending', 'C3i még függő';
  assert fc.run(a, format('select public.revoke_family_guardian_invitation(%L)', inv)) = 'ok', 'C3j owner visszavon';
  assert fc.denied(fc.run(r, format('select public.accept_family_guardian_invitation(%L)', inv))), 'C3k visszavont meghívó nem fogadható el';
  assert not exists (select 1 from public.family_members where family_id = fa and user_id = r), 'C3l r nem lett tag';
  -- elfogadás (g)
  assert fc.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'g@example.invalid')) = 'ok', 'C3m owner meghív (g)';
  inv := (select id from public.family_guardian_invitations where family_id = fa and invited_email = 'g@example.invalid');
  perform fc.put('inv_g', inv);
  assert fc.vis(g, format('select 1 from public.family_guardian_invitations where id = %L', inv)) = 1, 'C3n a címzett látja a meghívót';
  assert fc.vis(a, format('select 1 from public.family_guardian_invitations where id = %L', inv)) = 1, 'C3o az owner látja a meghívót';
  assert fc.vis(x, format('select 1 from public.family_guardian_invitations where id = %L', inv)) = 0, 'C3p idegen nem látja';
  assert fc.vis(b, format('select 1 from public.family_guardian_invitations where id = %L', inv)) = 0, 'C3q másik család ownerje nem látja';
  assert fc.vis(null, format('select 1 from public.family_guardian_invitations where id = %L', inv)) <= 0, 'C3r anon nem látja';
  assert fc.denied(fc.run(x, format('select public.accept_family_guardian_invitation(%L)', inv))), 'C3s más e-mail-című felhasználó nem fogadhatja el';
  assert fc.denied(fc.run(null, format('select public.accept_family_guardian_invitation(%L)', inv))), 'C3t anon nem fogadhatja el';
  assert fc.run(g, format('select public.accept_family_guardian_invitation(%L)', inv)) = 'ok', 'C3u a címzett elfogadja';
  assert exists (select 1 from public.family_members where family_id = fa and user_id = g and role = 'guardian' and status = 'active'), 'C3v g aktív guardian';
  assert fc.denied(fc.run(g, format('select public.accept_family_guardian_invitation(%L)', inv))), 'C3w elfogadott meghívó nem használható újra';
  -- direkt írás a meghívótáblába: nincs insert/update policy
  assert fc.run(x, format('insert into public.family_guardian_invitations(family_id, invited_email, invited_by) values (%L, %L, %L)', fa, 'x@example.invalid', x)) like 'ERR:%', 'C3x direkt meghívó INSERT tiltva';
  assert fc.blocked(fc.affected(x, format('update public.family_guardian_invitations set status = %L where family_id = %L', 'pending', fa))), 'C3y direkt meghívó UPDATE 0 sor';
  -- elutasítás (y) a B családban
  assert fc.run(b, format('select public.invite_family_guardian(%L, %L)', fb, 'y@example.invalid')) = 'ok', 'C3z B owner meghív (y)';
  inv := (select id from public.family_guardian_invitations where family_id = fb and invited_email = 'y@example.invalid');
  assert fc.denied(fc.run(a, format('select public.decline_family_guardian_invitation(%L)', inv))), 'C3za nem címzett nem utasíthatja el';
  assert fc.run(y, format('select public.decline_family_guardian_invitation(%L)', inv)) = 'ok', 'C3zb a címzett elutasítja';
  assert fc.denied(fc.run(y, format('select public.accept_family_guardian_invitation(%L)', inv))), 'C3zc elutasított meghívó nem fogadható el';
  assert not exists (select 1 from public.family_members where family_id = fb and user_id = y), 'C3zd y nem lett tag';
end $$;

-- C4. Gyermekenkénti guardian-jogosultság -------------------------------------------
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x'); g uuid := fc.id('g'); ca uuid := fc.id('ca');
begin
  assert fc.denied(fc.run(b, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, g))), 'C4a másik család ownerje nem adhat jogot';
  assert fc.denied(fc.run(g, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, g))), 'C4b guardian nem adhat jogot saját magának';
  assert fc.denied(fc.run(x, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, x))), 'C4c nem tag nem adhat jogot';
  assert fc.denied(fc.run(null, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, g))), 'C4d anon nem adhat jogot';
  assert fc.denied(fc.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, x))), 'C4e owner sem adhat jogot nem családtagnak';
  assert not exists (select 1 from public.guardian_child_permissions where child_id = ca), 'C4f elutasított hívásokból nincs jogosultság';
  assert fc.vis(g, format('select 1 from public.child_profiles where id = %L', ca)) = 0, 'C4g jog nélkül g nem látja a gyermeket';
  assert fc.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, g)) = 'ok', 'C4h owner csak megtekintési jogot ad';
  assert fc.vis(g, format('select 1 from public.child_profiles where id = %L', ca)) = 1, 'C4i g látja a gyermeket';
  assert fc.vis(x, format('select 1 from public.child_profiles where id = %L', ca)) = 0, 'C4j idegen nem látja';
  assert fc.vis(b, format('select 1 from public.child_profiles where id = %L', ca)) = 0, 'C4k másik család ownerje nem látja';
  assert fc.vis(g, format('select 1 from public.guardian_child_permissions where child_id = %L', ca)) = 1, 'C4l g látja a saját jogát';
  assert fc.vis(b, format('select 1 from public.guardian_child_permissions where child_id = %L', ca)) = 0, 'C4m b nem látja';
  -- direkt írás: jogosultság-emelés megkísérlése
  assert fc.blocked(fc.affected(g, format('update public.guardian_child_permissions set can_manage_schedule = true where child_id = %L', ca))), 'C4n g nem emelheti a saját jogát direkt UPDATE-tel';
  assert fc.run(g, format('insert into public.guardian_child_permissions(child_id, guardian_user_id, can_manage_schedule) values (%L, %L, true)', fc.id('cb'), g)) = 'ERR:42501', 'C4o direkt INSERT tiltva';
  assert not (select can_manage_schedule from public.guardian_child_permissions where child_id = ca and guardian_user_id = g), 'C4p a jog nem emelkedett';
end $$;

-- C5. Napirend: létrehozás, láthatóság, kezelési jog, visszavonás, direkt írás ------
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x'); g uuid := fc.id('g'); ca uuid := fc.id('ca');
        mk text := 'select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''08:00'', p_start_date => current_date)';
        item uuid;
begin
  assert fc.run(a, format(mk, ca, 'Iskola')) = 'ok', 'C5a owner létrehoz napirendi elemet';
  item := (select id from public.child_schedule_items where child_id = ca and title = 'Iskola');
  perform fc.put('item', item);
  assert fc.denied(fc.run(b, format(mk, ca, 'B'))), 'C5b másik család ownerje elutasítva';
  assert fc.denied(fc.run(x, format(mk, ca, 'X'))), 'C5c idegen elutasítva';
  assert fc.denied(fc.run(null, format(mk, ca, 'anon'))), 'C5d anon elutasítva';
  assert fc.denied(fc.run(g, format(mk, ca, 'G'))), 'C5e csak megtekintési joggal nem hozhat létre';
  assert (select count(*) from public.child_schedule_items where child_id = ca) = 1, 'C5f csak az owner eleme jött létre';
  assert fc.vis(g, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 1, 'C5g g látja (view)';
  assert fc.vis(b, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 0, 'C5h b nem látja';
  assert fc.vis(x, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 0, 'C5i x nem látja';
  assert fc.vis(null, format('select 1 from public.child_schedule_items where child_id = %L', ca)) <= 0, 'C5j anon nem látja';
  -- kezelési jog
  assert fc.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, g)) = 'ok', 'C5k owner kezelési jogot ad';
  assert fc.run(g, format(mk, ca, 'Edzés')) = 'ok', 'C5l kezelési joggal g létrehozhat';
  -- visszavonás
  assert fc.denied(fc.run(b, format('select public.revoke_guardian_child_permission(%L, %L)', ca, g))), 'C5m b nem vonhatja vissza';
  assert fc.run(a, format('select public.revoke_guardian_child_permission(%L, %L)', ca, g)) = 'ok', 'C5o owner visszavonja';
  assert fc.denied(fc.run(g, format(mk, ca, 'Visszavont'))), 'C5p visszavont g nem hozhat létre';
  assert fc.vis(g, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 0, 'C5q visszavont g nem látja';
  assert fc.vis(g, format('select 1 from public.child_profiles where id = %L', ca)) = 0, 'C5r visszavont g a gyermeket sem látja';
  -- direkt írás megkerülési kísérletek
  assert fc.blocked(fc.affected(b, format('update public.child_schedule_items set title = %L where id = %L', 'feltört', item))), 'C5s b direkt UPDATE 0 sor';
  assert fc.blocked(fc.affected(g, format('update public.child_schedule_items set title = %L where id = %L', 'feltört', item))), 'C5t visszavont g direkt UPDATE 0 sor';
  assert fc.blocked(fc.affected(x, format('delete from public.child_schedule_items where id = %L', item))), 'C5u x direkt DELETE 0 sor';
  assert fc.blocked(fc.affected(g, format('delete from public.child_schedule_items where id = %L', item))), 'C5v visszavont g direkt DELETE 0 sor';
  assert fc.blocked(fc.affected(null, format('delete from public.child_schedule_items where id = %L', item))), 'C5w anon direkt DELETE 0 sor';
  assert (select title from public.child_schedule_items where id = item) = 'Iskola', 'C5x a cím változatlan';
  assert fc.run(a, 'insert into public.child_schedule_items default values') = 'ERR:42501', 'C5y direkt INSERT (owner is) tiltva';
  assert fc.affected(a, format('update public.child_schedule_items set title = %L where id = %L', 'Iskola', item)) = '1', 'C5z pozitív kontroll: owner direkt UPDATE 1 sor';
end $$;

-- C6. Gyermekfiók: meghívó, összekapcsolás, láthatóság, visszavonás ----------------
-- A meghívó tokenjét a felhasználó nevében hívott RPC adja vissza.
create function fc.child_invite(u uuid, child uuid) returns text language plpgsql as $$
declare t text; begin
  perform fc.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select token from public.create_child_account_invitation($1, 72)' into t using child;
    execute 'reset role';
    return t;
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end $$;

do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x'); g uuid := fc.id('g'); k uuid := fc.id('k');
        y uuid := fc.id('y'); ca uuid := fc.id('ca'); tok text;
begin
  assert fc.denied(fc.child_invite(b, ca)), 'C6a másik család ownerje nem hívhat meg gyermekfiókot';
  assert fc.denied(fc.child_invite(g, ca)), 'C6b guardian nem hívhat meg gyermekfiókot';
  assert fc.denied(fc.child_invite(x, ca)), 'C6c idegen nem hívhat meg';
  assert fc.denied(fc.child_invite(null, ca)), 'C6d anon nem hívhat meg';
  tok := fc.child_invite(a, ca);
  assert tok is not null and tok not like 'ERR:%', 'C6e owner meghívót hoz létre';
  assert fc.vis(a, format('select 1 from public.child_account_invitations where child_id = %L', ca)) = 1, 'C6f owner látja a meghívót';
  assert fc.vis(b, format('select 1 from public.child_account_invitations where child_id = %L', ca)) = 0, 'C6g b nem látja';
  assert fc.vis(g, format('select 1 from public.child_account_invitations where child_id = %L', ca)) = 0, 'C6h guardian nem látja';
  assert fc.vis(null, format('select 1 from public.child_account_invitations where child_id = %L', ca)) <= 0, 'C6i anon nem látja';
  assert fc.denied(fc.run(g, format('select public.accept_child_account_invitation(%L)', tok))), 'C6j aktív családtag nem lehet gyermekfiók';
  assert fc.denied(fc.run(null, format('select public.accept_child_account_invitation(%L)', tok))), 'C6k anon nem fogadhatja el';
  assert fc.denied(fc.run(k, format('select public.accept_child_account_invitation(%L)', 'hamis-token'))), 'C6l hamis token elutasítva';
  assert fc.run(k, format('select public.accept_child_account_invitation(%L)', tok)) = 'ok', 'C6m a gyermek elfogadja';
  assert exists (select 1 from public.child_accounts where child_id = ca and auth_user_id = k and status = 'active'), 'C6n aktív gyermekfiók';
  assert fc.denied(fc.run(y, format('select public.accept_child_account_invitation(%L)', tok))), 'C6o a token nem használható újra';
  assert fc.vis(k, format('select 1 from public.child_accounts where auth_user_id = %L', k)) = 1, 'C6p a gyermek látja a saját fiókját';
  assert fc.vis(a, format('select 1 from public.child_accounts where child_id = %L', ca)) = 1, 'C6q az owner látja';
  assert fc.vis(b, format('select 1 from public.child_accounts where child_id = %L', ca)) = 0, 'C6r b nem látja';
  assert fc.vis(x, format('select 1 from public.child_accounts where child_id = %L', ca)) = 0, 'C6s x nem látja';
  assert fc.vis(k, format('select 1 from public.child_schedule_items where child_id = %L', ca)) >= 1, 'C6t a gyermek látja a saját napirendjét';
  -- visszavonás
  assert fc.denied(fc.run(b, format('select public.revoke_child_account(%L)', ca))), 'C6u b nem vonhatja vissza';
  assert fc.denied(fc.run(k, format('select public.revoke_child_account(%L)', ca))), 'C6v a gyermek nem vonhatja vissza';
  assert fc.denied(fc.run(g, format('select public.revoke_child_account(%L)', ca))), 'C6w guardian nem vonhatja vissza';
  assert fc.denied(fc.run(null, format('select public.revoke_child_account(%L)', ca))), 'C6x anon nem vonhatja vissza';
  assert (select status from public.child_accounts where child_id = ca) = 'active', 'C6y még aktív';
  assert fc.run(a, format('select public.revoke_child_account(%L)', ca)) = 'ok', 'C6z owner visszavonja';
  assert (select status from public.child_accounts where child_id = ca) = 'revoked', 'C6za visszavonva';
  assert fc.vis(k, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 0, 'C6zb visszavont gyermekfiók nem látja a napirendet';
  -- direkt írás: újraaktiválás, hamis összekapcsolás
  assert fc.blocked(fc.affected(k, format('update public.child_accounts set status = %L where auth_user_id = %L', 'active', k))), 'C6zc a gyermek nem aktiválhatja újra magát';
  assert fc.blocked(fc.affected(a, format('update public.child_accounts set status = %L where child_id = %L', 'active', ca))), 'C6zd az owner sem direkt UPDATE-tel';
  assert (select status from public.child_accounts where child_id = ca) = 'revoked', 'C6ze továbbra is visszavont';
  assert fc.run(x, format('insert into public.child_accounts(child_id, auth_user_id, status) values (%L, %L, %L)', fc.id('cb'), x, 'active')) like 'ERR:%', 'C6zf direkt gyermekfiók INSERT tiltva';
  assert not exists (select 1 from public.child_accounts where auth_user_id = x), 'C6zg nem jött létre';
end $$;

-- C7. Családok közötti izoláció (olvasás) -------------------------------------------
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); x uuid := fc.id('x');
        fa uuid := fc.id('fa'); fb uuid := fc.id('fb'); ca uuid := fc.id('ca'); cb uuid := fc.id('cb');
        q text; n bigint;
        tabs text[] := array[
          format('select 1 from public.families where id = %L', fa),
          format('select 1 from public.family_members where family_id = %L', fa),
          format('select 1 from public.family_children where family_id = %L', fa),
          format('select 1 from public.child_profiles where id = %L', ca),
          format('select 1 from public.child_schedule_items where child_id = %L', ca),
          format('select 1 from public.family_guardian_invitations where family_id = %L', fa),
          format('select 1 from public.guardian_child_permissions where child_id = %L', ca),
          format('select 1 from public.child_accounts where child_id = %L', ca),
          format('select 1 from public.child_account_invitations where child_id = %L', ca),
          format('select 1 from public.guardian_authorizations where child_id = %L', ca)];
begin
  foreach q in array tabs loop
    assert fc.vis(b, q) = 0, 'C7 másik család ownerje lát: ' || q;
    assert fc.vis(x, q) = 0, 'C7 idegen lát: ' || q;
    assert fc.vis(null, q) <= 0, 'C7 anon lát: ' || q;
  end loop;
  -- pozitív kontroll: az owner látja (a guardian_authorizations üres, kimarad)
  foreach q in array tabs[1:9] loop
    n := fc.vis(a, q);
    assert n > 0, 'C7 pozitív kontroll: az owner nem látja: ' || q;
  end loop;
  -- fordított irány
  assert fc.vis(a, format('select 1 from public.families where id = %L', fb)) = 0, 'C7 a nem látja B családot';
  assert fc.vis(a, format('select 1 from public.child_profiles where id = %L', cb)) = 0, 'C7 a nem látja B gyermekét';
  assert fc.vis(a, format('select 1 from public.family_members where family_id = %L', fb)) = 0, 'C7 a nem látja B tagjait';
end $$;

-- C8. Direkt táblaírási megkerülés (a 20261030000000 meglététől függően) ------------
do $$
declare a uuid := fc.id('a'); b uuid := fc.id('b'); g uuid := fc.id('g'); g2 uuid := fc.id('g2');
        fa uuid := fc.id('fa'); fb uuid := fc.id('fb'); cb uuid := fc.id('cb'); r text;
begin
  -- más család / nem owner: mindkét sémán tiltott
  assert fc.run(b, format('insert into public.family_members(family_id, user_id, role, status) values (%L, %L, %L, %L)', fa, b, 'guardian', 'active')) = 'ERR:42501', 'C8a b nem veheti fel magát A családba';
  assert fc.blocked(fc.affected(b, format('update public.family_members set role = %L where family_id = %L', 'guardian', fa))), 'C8b b nem módosíthat A tagságot';
  assert fc.blocked(fc.affected(b, format('delete from public.family_members where family_id = %L', fa))), 'C8c b nem törölhet A tagságot';
  assert fc.blocked(fc.affected(b, format('update public.families set name = %L where id = %L', 'feltört', fa))), 'C8d b nem nevezheti át A családot';
  assert fc.blocked(fc.affected(g, format('update public.families set name = %L where id = %L', 'feltört', fa))), 'C8e guardian nem nevezheti át a családot';
  assert fc.blocked(fc.affected(g, format('update public.family_members set role = %L where family_id = %L and user_id = %L', 'owner', fa, g))), 'C8f guardian nem lehet direkt owner';
  assert fc.run(g, format('insert into public.family_members(family_id, user_id, role, status) values (%L, %L, %L, %L)', fa, g2, 'guardian', 'active')) like 'ERR:%', 'C8g guardian nem vehet fel tagot';
  assert fc.run(b, format('insert into public.family_children(family_id, child_id) values (%L, %L)', fa, cb)) like 'ERR:%', 'C8h b nem köthet gyermeket A családhoz';
  assert (select name from public.families where id = fa) = 'A család', 'C8i a család neve változatlan';
  assert (select role from public.family_members where family_id = fa and user_id = g) = 'guardian', 'C8j g szerepe változatlan';

  -- az owner direkt írásai: 20261030 után tiltottak, előtte megengedettek (ismert rés)
  r := fc.run(a, format('insert into public.family_members(family_id, user_id, role, status) values (%L, %L, %L, %L)', fa, g2, 'guardian', 'active'));
  if fc.post1030() then
    assert r = 'ERR:42501', 'C8k 1030 után az owner sem vehet fel tagot meghívó nélkül';
    assert fc.run(a, format('insert into public.family_children(family_id, child_id) values (%L, %L)', fa, cb)) = 'ERR:42501', 'C8l 1030 után az owner sem köthet direkt gyermeket';
    assert fc.blocked(fc.affected(a, format('update public.family_members set status = %L where family_id = %L and user_id = %L', 'active', fa, g))), 'C8m 1030 után owner direkt tagság-UPDATE tiltva';
    assert not exists (select 1 from public.family_children where family_id = fa and child_id = cb), 'C8n B gyermeke nem került A-hoz';
  else
    perform fc.note('HIBA_pre1030_owner_direkt_tagfelvetel', r || ' (g2 meghívó és beleegyezés nélkül aktív guardian lett)');
    r := fc.run(a, format('insert into public.family_children(family_id, child_id) values (%L, %L)', fa, cb));
    perform fc.note(case when r = 'ok' then 'HIBA_pre1030_idegen_gyermek_bekotese' else 'INFO_pre1030_idegen_gyermek_bekotese_blokkolva' end,
      r || ', a ezután látja B gyermekét: '
      || fc.vis(a, format('select 1 from public.child_profiles where id = %L', cb))
      || ', B napirendet hozhat létre rá: '
      || fc.run(a, format('select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''08:00'', p_start_date => current_date)', cb, 'idegen')));
    -- takarítás (superuserként), hogy a további szakaszok determinisztikusak maradjanak
    delete from public.child_schedule_items where child_id = cb and title = 'idegen';
    delete from public.family_children where family_id = fa and child_id = cb;
    delete from public.family_members where family_id = fa and user_id = g2;
  end if;
end $$;

-- C9. Free / Plus (próbaidő) létszámkorlátok – csak a 20261030000000 utáni sémán ------
do $$
declare c uuid := fc.id('c'); b uuid := fc.id('b'); fcf uuid; r text; i int;
        kid text := 'select public.create_child_profile_for_family(%L, %L, null)';
begin
  assert fc.run(c, $q$select public.create_family_with_owner('C család')$q$) = 'ok', 'C9a új család';
  fcf := (select id from public.families where created_by = c);
  assert fc.run(c, format(kid, fcf, 'Első')) = 'ok', 'C9b első gyermek';
  if not fc.post1030() then
    perform fc.note('SKIP_C9_limitek', 'a 20261030000000 nincs telepítve; második gyermek: ' || fc.run(c, format(kid, fcf, 'Második')));
    return;
  end if;
  assert not exists (select 1 from public.family_feature_grants where family_id = fcf), 'C9c új család nem pilot';
  assert fc.run(c, format(kid, fcf, 'Második')) = 'ERR:P0001', 'C9d Free: második gyermek tiltva';
  assert fc.run(c, format('select public.invite_family_guardian(%L, %L)', fcf, 'c1@example.invalid')) = 'ok', 'C9e Free: első felnőtt meghívó';
  assert fc.run(c, format('select public.invite_family_guardian(%L, %L)', fcf, 'c2@example.invalid')) = 'ERR:P0001', 'C9f Free: harmadik felnőtt tiltva';
  assert fc.vis(b, format('select 1 where public.get_family_capacity(%L) is not null', fcf)) = 0, 'C9g idegennek a keret-lekérdezés NULL';
  assert fc.vis(c, format('select 1 where (public.get_family_capacity(%L)->>''children_limit'')::int = 1', fcf)) = 1, 'C9ga owner: Free gyermekkeret = 1';
  -- a start_family_trial hibát jsonb-ben ad vissza ({ok:false,error:not_owner}), nem kivétellel
  assert fc.vis(b, format('select 1 where public.start_family_trial(%L)->>''error'' = ''not_owner''', fcf)) = 1, 'C9h idegen nem indíthat próbaidőt';
  assert fc.vis(null, format('select 1 where (public.start_family_trial(%L)->>''ok'')::boolean', fcf)) <= 0, 'C9ha anon nem indíthat próbaidőt';
  assert not exists (select 1 from public.family_subscriptions where family_id = fcf and status = 'trialing'), 'C9hb nem indult próbaidő';
  assert fc.vis(c, format('select 1 where (public.start_family_trial(%L)->>''started'')::boolean', fcf)) = 1, 'C9i owner próbaidőt indít';
  for i in 2..10 loop
    assert fc.run(c, format(kid, fcf, 'Gyermek ' || i)) = 'ok', 'C9j Plus/próbaidő: gyermek ' || i;
  end loop;
  assert fc.run(c, format(kid, fcf, 'Tizenegyedik')) = 'ERR:P0001', 'C9k 11. gyermek tiltva';
  assert (select count(*) from public.family_children where family_id = fcf) = 10, 'C9l pontosan 10 gyermek';
  assert fc.run(c, format('select public.invite_family_guardian(%L, %L)', fcf, 'c2@example.invalid')) = 'ok', 'C9m próbaidőben második meghívó is';
  assert fc.run(c, format('insert into public.family_children(family_id, child_id) values (%L, %L)', fcf, fc.id('cb'))) = 'ERR:42501', 'C9n a korlát direkt INSERT-tel sem kerülhető meg';
end $$;

select 'family_core_access: C1-C9 OK; 20261030=' || fc.post1030()::text
       || coalesce('; ' || (select string_agg(k || '=' || v, '; ' order by k) from fc.result), '') as result;
