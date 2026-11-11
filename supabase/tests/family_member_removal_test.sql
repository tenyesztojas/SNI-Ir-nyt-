-- Védett Család – családtag eltávolítása és önkéntes kilépés (20261103000000) SQL-tesztje.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison:
--   _bootstrap_stub.sql, _supabase_default_privileges_stub.sql, a családi migrációk,
--   20261027*, 20261030000000, 20261103000000, majd ez a fájl
--   (lásd account-deletion/scratch_suites.txt: family_member_removal).
-- SOHA nem production vagy távoli Supabase DB-n: az első blokk ezt ellenőrzi.

do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2
     or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'realtime', 'vault'))
  then raise exception 'family_member_removal_test: nem eldobható scratch adatbázis – leállás'; end if;
end $$;

create schema fr;
grant usage on schema fr to anon, authenticated;
create table fr.ctx(k text primary key, v uuid);
create function fr.id(n text) returns uuid language sql stable as $$ select v from fr.ctx where k = n $$;
create function fr.put(n text, val uuid) returns void language sql as $$
  insert into fr.ctx(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
create function fr.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = u), ''), false);
end $$;
create function fr.mkuser(n text, beta boolean default false) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, pilot_access) values (u, n, case when beta then array['family_db_beta'] else '{}'::text[] end);
  perform fr.put(n, u); return u;
end $$;
-- 'ok' vagy 'ERR:<sqlstate>' (hiba esetén a hint, ha van: 'ERR:P0001:<hint>')
create function fr.run(u uuid, q text) returns text language plpgsql as $$
declare v_hint text; begin
  perform fr.as_user(u);
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
create function fr.affected(u uuid, q text) returns text language plpgsql as $$
declare n bigint; begin
  perform fr.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute q; get diagnostics n = row_count; execute 'reset role'; return n::text;
  exception when others then return 'ERR:' || sqlstate; end;
end $$;
create function fr.vis(u uuid, q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform fr.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || q || ') s' into n; execute 'reset role'; return n;
  exception when insufficient_privilege then return -1; end;
end $$;
create function fr.status(f uuid, u uuid) returns text language sql stable as $$
  select status from public.family_members where family_id = f and user_id = u $$;
create function fr.perm(c uuid, u uuid) returns text language sql stable as $$
  select status from public.guardian_child_permissions where child_id = c and guardian_user_id = u $$;
create function fr.accept(u uuid, f uuid) returns text language plpgsql as $$
declare v uuid; begin
  select id into v from public.family_guardian_invitations
   where family_id = f and invited_email = (select email from auth.users where id = u) and status = 'pending'
   order by created_at desc limit 1;
  if v is null then return 'no_invitation'; end if;
  return fr.run(u, format('select public.accept_family_guardian_invitation(%L)', v));
end $$;

-- Szereplők: a (owner, A család), b (owner, B család), g (gondviselő A-ban ÉS B-ben),
-- h (gondviselő A-ban), x (idegen), k (gyermekfiók A gyermekéhez), y (B új meghívottja).
select fr.mkuser('a', true), fr.mkuser('b', true), fr.mkuser('g'), fr.mkuser('h'), fr.mkuser('x'), fr.mkuser('k'), fr.mkuser('y');

-- Előkészítés -------------------------------------------------------------------
do $$
declare a uuid := fr.id('a'); b uuid := fr.id('b'); g uuid := fr.id('g'); h uuid := fr.id('h'); k uuid := fr.id('k');
        fa uuid; fb uuid; ca uuid; cb uuid; item uuid;
begin
  assert fr.run(a, $q$select public.create_family_with_owner('A')$q$) = 'ok', 'S1 A család';
  assert fr.run(b, $q$select public.create_family_with_owner('B')$q$) = 'ok', 'S2 B család';
  fa := (select id from public.families where created_by = a); fb := (select id from public.families where created_by = b);
  perform fr.put('fa', fa); perform fr.put('fb', fb);
  -- A család próbaidőn (Plus-keret: 3 felnőtt kell), B ingyenes (2 felnőtt).
  assert fr.vis(a, format('select 1 where (public.start_family_trial(%L)->>''started'')::boolean', fa)) = 1, 'S3 A próbaidő';
  assert fr.run(a, format('select public.create_child_profile_for_family(%L, %L, null)', fa, 'Anna')) = 'ok', 'S4 A gyermek';
  assert fr.run(b, format('select public.create_child_profile_for_family(%L, %L, null)', fb, 'Bori')) = 'ok', 'S5 B gyermek';
  ca := (select child_id from public.family_children where family_id = fa); cb := (select child_id from public.family_children where family_id = fb);
  perform fr.put('ca', ca); perform fr.put('cb', cb);
  assert fr.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'g@example.invalid')) = 'ok', 'S6';
  assert fr.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'h@example.invalid')) = 'ok', 'S7';
  assert fr.run(b, format('select public.invite_family_guardian(%L, %L)', fb, 'g@example.invalid')) = 'ok', 'S8';
  assert fr.accept(g, fa) = 'ok' and fr.accept(h, fa) = 'ok' and fr.accept(g, fb) = 'ok', 'S9 elfogadások';
  assert fr.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, true, false, false, false)', ca, g)) = 'ok', 'S10';
  assert fr.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, h)) = 'ok', 'S11';
  assert fr.run(b, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', cb, g)) = 'ok', 'S12';
  -- gyermekfiók, napirend és utazási előzmény az A gyermekhez (fixture)
  insert into public.child_accounts(child_id, auth_user_id, status) values (ca, k, 'active');
  assert fr.run(a, format('select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''08:00'', p_start_date => current_date)', ca, 'Iskola')) = 'ok', 'S13 napirend';
  item := (select id from public.child_schedule_items where child_id = ca);
  assert fr.run(k, format('select public.set_child_travel_status(%L, %L)', item, 'depart')) = 'ok', 'S14 utazás indult';
  -- függő meghívó a g címére az A családban (fixture: a régi meghívó ismételt kiküldése helyett)
  insert into public.family_guardian_invitations(family_id, invited_email, invited_by, expires_at) values (fa, 'g@example.invalid', a, now() + interval '7 days');
end $$;

-- R1. Jogosultsági és séma-ellenőrzések -----------------------------------------------
do $$ begin
  assert (select prosecdef from pg_proc where oid = 'public.remove_family_member(uuid,uuid)'::regprocedure), 'R1a remove: SECURITY DEFINER';
  assert (select prosecdef from pg_proc where oid = 'public.leave_family(uuid)'::regprocedure), 'R1b leave: SECURITY DEFINER';
  assert (select array_to_string(proconfig, ',') like '%search_path=public, pg_temp%' from pg_proc where oid = 'public.remove_family_member(uuid,uuid)'::regprocedure), 'R1c rögzített search_path';
  assert not has_function_privilege('anon', 'public.remove_family_member(uuid,uuid)', 'EXECUTE'), 'R1d anon nem futtathatja (remove)';
  assert not has_function_privilege('anon', 'public.leave_family(uuid)', 'EXECUTE'), 'R1e anon nem futtathatja (leave)';
  assert has_function_privilege('authenticated', 'public.remove_family_member(uuid,uuid)', 'EXECUTE'), 'R1f authenticated futtathatja';
  assert not has_function_privilege('authenticated', 'public._family_member_revoke(uuid,uuid)', 'EXECUTE'), 'R1g belső függvény nem hívható';
  assert not has_table_privilege('authenticated', 'public.family_members', 'DELETE'), 'R1h authenticated DELETE jog nincs';
  assert not has_table_privilege('anon', 'public.family_members', 'DELETE'), 'R1i anon DELETE jog nincs';
  assert has_table_privilege('service_role', 'public.family_members', 'DELETE'), 'R1j service_role DELETE megmaradt';
  assert not exists (select 1 from pg_policies where tablename = 'family_members' and cmd = 'DELETE'), 'R1k nincs DELETE policy';
end $$;

-- R2. Jogosulatlan eltávolítás és közvetlen DELETE -------------------------------------
do $$
declare a uuid := fr.id('a'); b uuid := fr.id('b'); g uuid := fr.id('g'); h uuid := fr.id('h'); x uuid := fr.id('x');
        fa uuid := fr.id('fa'); fb uuid := fr.id('fb');
        rm text := 'select public.remove_family_member(%L, %L)';
begin
  assert fr.run(null, format(rm, fa, h)) like 'ERR:%', 'R2a anon nem távolíthat el';
  assert fr.run(x, format(rm, fa, h)) = 'ERR:P0001:family_not_owner', 'R2b idegen nem távolíthat el';
  assert fr.run(b, format(rm, fa, h)) = 'ERR:P0001:family_not_owner', 'R2c másik család ownerje nem intézkedhet';
  assert fr.run(g, format(rm, fa, h)) = 'ERR:P0001:family_not_owner', 'R2d gondviselő nem távolíthat el';
  assert fr.run(a, format(rm, fa, a)) = 'ERR:P0001:family_cannot_remove_self', 'R2e owner saját magát nem';
  assert fr.run(a, format(rm, fa, b)) = 'ERR:P0001:family_member_not_found', 'R2f idegen család tagja nem távolítható el';
  assert fr.run(a, format(rm, fb, g)) = 'ERR:P0001:family_not_owner', 'R2g más család tagját az A ownere nem távolíthatja el';
  -- közvetlen DELETE (owner, gondviselő, anon): jogosultsági hiba
  assert fr.run(a, format('delete from public.family_members where family_id = %L and user_id = %L', fa, h)) = 'ERR:42501', 'R2h owner közvetlen DELETE tiltva';
  assert fr.run(h, format('delete from public.family_members where family_id = %L and user_id = %L', fa, h)) = 'ERR:42501', 'R2i saját sor közvetlen DELETE tiltva';
  assert fr.run(null, format('delete from public.family_members where family_id = %L', fa)) like 'ERR:%', 'R2j anon DELETE tiltva';
  assert fr.status(fa, h) = 'active' and fr.status(fa, g) = 'active', 'R2k semmi nem változott';
end $$;

-- R3. Jogosult eltávolítás: csak az érintett család jogai változnak ----------------------
do $$
declare a uuid := fr.id('a'); g uuid := fr.id('g'); h uuid := fr.id('h'); k uuid := fr.id('k');
        fa uuid := fr.id('fa'); fb uuid := fr.id('fb'); ca uuid := fr.id('ca'); cb uuid := fr.id('cb');
        travel_before bigint := (select count(*) from public.child_travel_statuses);
        r text;
begin
  assert fr.vis(a, format('select 1 where (public.remove_family_member(%L, %L)->>''revoked_permissions'')::int = 1', fa, g)) = 1, 'R3a owner eltávolítja g-t (1 gyermekjog visszavonva)';
  assert fr.status(fa, g) = 'revoked', 'R3b g tagsága revoked';
  assert (select revoked_by from public.family_members where family_id = fa and user_id = g) = a, 'R3c revoked_by = owner';
  assert (select revoked_at is not null from public.family_members where family_id = fa and user_id = g), 'R3d revoked_at kitöltve';
  assert fr.perm(ca, g) = 'revoked', 'R3e g joga az A gyermekre megszűnt';
  assert (select not (can_view_schedule or can_manage_schedule) from public.guardian_child_permissions where child_id = ca and guardian_user_id = g), 'R3f jogjelzők kikapcsolva';
  assert fr.perm(cb, g) = 'active', 'R3g g joga a B gyermekre változatlan';
  assert fr.status(fb, g) = 'active', 'R3h g B-tagsága változatlan';
  assert fr.status(fa, h) = 'active' and fr.perm(ca, h) = 'active', 'R3i h nem érintett';
  assert not exists (select 1 from public.family_guardian_invitations where family_id = fa and invited_email = 'g@example.invalid' and status = 'pending')
     and exists (select 1 from public.family_guardian_invitations where family_id = fa and invited_email = 'g@example.invalid' and status = 'revoked'), 'R3j g függő A-meghívója visszavonva';
  -- láthatóság és műveletek g számára
  assert fr.vis(g, format('select 1 from public.families where id = %L', fa)) = 0, 'R3k g nem látja az A családot';
  assert fr.vis(g, format('select 1 from public.child_profiles where id = %L', ca)) = 0, 'R3l g nem látja az A gyermeket';
  assert fr.vis(g, format('select 1 from public.child_schedule_items where child_id = %L', ca)) = 0, 'R3m g nem látja az A napirendet';
  assert fr.vis(g, format('select 1 from public.families where id = %L', fb)) = 1, 'R3n g továbbra is látja a B családot';
  assert fr.vis(g, format('select 1 from public.child_profiles where id = %L', cb)) = 1, 'R3o g továbbra is látja a B gyermeket';
  r := fr.run(g, format('select public.create_child_schedule_item(p_child_id => %L, p_title => %L, p_schedule_type => ''one_time'', p_time_local => ''09:00'', p_start_date => current_date)', ca, 'tiltott'));
  assert r like 'ERR:%', 'R3p g nem hozhat létre napirendet az A gyermeknek';
  assert fr.run(a, format('select public.upsert_guardian_child_permission(%L, %L, true, false, false, false, false)', ca, g)) like 'ERR:%', 'R3q eltávolított tagnak nem adható új jog';
  -- értesítési címzettek: g kiesik, h és az owner marad
  assert not exists (select 1 from public._child_travel_notification_recipients(ca) where user_id = g), 'R3r g nem kap utazási értesítést';
  assert exists (select 1 from public._child_travel_notification_recipients(ca) where user_id = h), 'R3s h továbbra is címzett';
  assert exists (select 1 from public._child_travel_notification_recipients(cb) where user_id = g), 'R3t g a B gyermekről továbbra is címzett';
  -- gyermekadat érintetlen
  assert exists (select 1 from public.child_profiles where id = ca), 'R3u gyermekprofil megmaradt';
  assert (select status from public.child_accounts where child_id = ca) = 'active' and (select auth_user_id from public.child_accounts where child_id = ca) = k, 'R3v gyermekfiók érintetlen';
  assert (select count(*) from public.child_travel_statuses) = travel_before and travel_before >= 1, 'R3w utazási előzmények megmaradtak';
  assert (select count(*) from public.child_schedule_items where child_id = ca) = 1, 'R3x napirend megmaradt';
end $$;

-- R4. Ismételt eltávolítás ---------------------------------------------------------------
do $$ begin
  assert fr.run(fr.id('a'), format('select public.remove_family_member(%L, %L)', fr.id('fa'), fr.id('g'))) = 'ERR:P0001:family_member_not_found', 'R4a ismételt eltávolítás elutasítva';
  assert (select revoked_by from public.family_members where family_id = fr.id('fa') and user_id = fr.id('g')) = fr.id('a'), 'R4b a napló nem íródott felül';
end $$;

-- R5. Önkéntes kilépés és tiltásai -------------------------------------------------------
do $$
declare a uuid := fr.id('a'); b uuid := fr.id('b'); g uuid := fr.id('g'); h uuid := fr.id('h'); x uuid := fr.id('x');
        fa uuid := fr.id('fa'); fb uuid := fr.id('fb'); ca uuid := fr.id('ca');
        lv text := 'select public.leave_family(%L)';
begin
  assert fr.run(null, format(lv, fa)) like 'ERR:%', 'R5a anon nem léphet ki';
  assert fr.run(x, format(lv, fa)) = 'ERR:P0001:family_not_member', 'R5b nem tag nem léphet ki (más nevében sem)';
  assert fr.run(g, format(lv, fa)) = 'ERR:P0001:family_not_member', 'R5c visszavont tagság nem jogosít';
  assert fr.run(a, format(lv, fa)) = 'ERR:P0001:family_owner_cannot_leave', 'R5d owner nem léphet ki';
  assert fr.run(b, format(lv, fb)) = 'ERR:P0001:family_owner_cannot_leave', 'R5e B owner sem';
  -- a leave_family-nek nincs felhasználó-paramétere: másik ember nevében nem hívható
  assert (select pronargs from pg_proc where oid = 'public.leave_family(uuid)'::regprocedure) = 1, 'R5f csak család-paraméter';
  assert fr.run(h, format(lv, fa)) = 'ok', 'R5g h önként kilép';
  assert fr.status(fa, h) = 'revoked' and (select revoked_by from public.family_members where family_id = fa and user_id = h) = h, 'R5h revoked_by = saját maga';
  assert fr.perm(ca, h) = 'revoked', 'R5i h gyermekjoga megszűnt';
  assert fr.run(h, format(lv, fa)) = 'ERR:P0001:family_not_member', 'R5j ismételt kilépés elutasítva';
  assert fr.status(fa, a) = 'active', 'R5k az owner érintetlen';
end $$;

-- R6. Utolsó owner védelme változatlan -----------------------------------------------------
do $$
declare ok boolean := false; begin
  begin
    delete from public.family_members where family_id = fr.id('fa') and user_id = fr.id('a');
  exception when others then ok := true; end;
  assert ok, 'R6a az utolsó owner szuperuserként sem törölhető (trigger)';
  assert fr.status(fr.id('fa'), fr.id('a')) = 'active', 'R6b owner aktív';
end $$;

-- R7. Újrameghívás eltávolítás után + létszámkorlát-regresszió ----------------------------
do $$
declare a uuid := fr.id('a'); b uuid := fr.id('b'); g uuid := fr.id('g'); y uuid := fr.id('y');
        fa uuid := fr.id('fa'); fb uuid := fr.id('fb');
begin
  assert fr.run(a, format('select public.invite_family_guardian(%L, %L)', fa, 'g@example.invalid')) = 'ok', 'R7a g újra meghívható';
  assert fr.accept(g, fa) = 'ok', 'R7b g újra elfogadja';
  assert fr.status(fa, g) = 'active', 'R7c g ismét aktív';
  assert (select revoked_at is null and revoked_by is null from public.family_members where family_id = fa and user_id = g), 'R7d visszavonási adat törlődött';
  assert fr.perm(fr.id('ca'), g) = 'revoked', 'R7e a korábbi gyermekjog nem éledt fel automatikusan';
  -- B (ingyenes, 2 felnőtt: b + g): új meghívó a korlát miatt tilos, g eltávolítása után megengedett
  assert fr.run(b, format('select public.invite_family_guardian(%L, %L)', fb, 'y@example.invalid')) = 'ERR:P0001:family_guardian_limit_reached', 'R7f Free korlát: harmadik felnőtt tiltva';
  assert fr.run(b, format('select public.remove_family_member(%L, %L)', fb, g)) = 'ok', 'R7g b eltávolítja g-t';
  assert fr.run(b, format('select public.invite_family_guardian(%L, %L)', fb, 'y@example.invalid')) = 'ok', 'R7h felszabadult hely: új meghívó';
  assert fr.accept(y, fb) = 'ok', 'R7i y elfogadja';
  assert (select count(*) from public.family_members where family_id = fb and status = 'active') = 2, 'R7j B-ben 2 aktív felnőtt';
end $$;

-- R8. Fióktörlési kompatibilitás (a 20261020 delete_own_account-tal) ----------------------
do $$
declare h uuid := fr.id('h'); fa uuid := fr.id('fa'); c uuid; z uuid; fc uuid; r jsonb;
begin
  if to_regprocedure('public.delete_own_account(boolean)') is null then
    raise notice 'R8 SKIP: delete_own_account nincs telepítve'; return;
  end if;
  -- eltávolított (revoked) tag saját fióktörlése
  perform fr.as_user(h);
  r := public.delete_own_account(false);
  assert not exists (select 1 from auth.users where id = h), 'R8a a kilépett tag fiókja törölhető: ' || r::text;
  assert not exists (select 1 from public.family_members where user_id = h), 'R8b revoked sora is törlődött';
  assert exists (select 1 from public.families where id = fa), 'R8c az A család megmaradt';
  -- owner, akinek a családjában csak visszavont tag maradt: a család törölhető
  c := fr.mkuser('c', true); z := fr.mkuser('z');
  assert fr.run(c, $q$select public.create_family_with_owner('C')$q$) = 'ok', 'R8d C család';
  fc := (select id from public.families where created_by = c);
  assert fr.run(c, format('select public.invite_family_guardian(%L, %L)', fc, 'z@example.invalid')) = 'ok', 'R8e';
  assert fr.accept(z, fc) = 'ok', 'R8f z elfogad';
  assert fr.run(c, format('select public.remove_family_member(%L, %L)', fc, z)) = 'ok', 'R8g c eltávolítja z-t';
  perform fr.as_user(c);
  r := public.delete_own_account(true);
  assert not exists (select 1 from public.families where id = fc), 'R8h a C család törölve: ' || r::text;
  assert exists (select 1 from auth.users where id = z), 'R8i z fiókja megmaradt';
  assert not exists (select 1 from public.family_members where user_id = z), 'R8j z visszavont sora a családdal törlődött';
end $$;

select 'family_member_removal: R1-R8 OK' as result;
