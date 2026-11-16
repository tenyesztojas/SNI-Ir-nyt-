-- Védett Család – gondviselői meghívás elfogadása/elutasítása csak igazolt
-- e-mail-címmel (20261116000000) SQL-tesztje.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison, a
-- supabase/tests/account-deletion/scratch_suites.txt "family_invitation_email"
-- suite-jával (run_scratch_suites.sh). SOHA nem production vagy távoli Supabase DB-n:
-- az első blokk ezt ellenőrzi. Minden adat a frissen létrehozott, a futás végén
-- törölt scratch adatbázisban keletkezik.

do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2
     or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'realtime', 'vault'))
  then raise exception 'family_guardian_invitation_email_test: nem eldobható scratch adatbázis – leállás'; end if;
end $$;

-- A stub auth.users táblából hiányzik a valódi Supabase email_confirmed_at oszlopa.
alter table auth.users add column email_confirmed_at timestamptz;

create schema ve;
grant usage on schema ve to anon, authenticated;
create table ve.ctx(k text primary key, v uuid);
create function ve.id(n text) returns uuid language sql stable as $$ select v from ve.ctx where k = n $$;
create function ve.put(n text, val uuid) returns void language sql as $$
  insert into ve.ctx(k, v) values (n, val) on conflict (k) do update set v = excluded.v $$;
-- Munkamenet-szimuláció: sub = u; a token e-mail-állítása alapból a tárolt cím,
-- de felülírható (hamisított/elavult token-állítás szimulálása).
create function ve.as_user(u uuid, claim_email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claim.email',
    coalesce(claim_email, (select email from auth.users where id = u), ''), false);
end $$;
create function ve.mkuser(n text, confirmed boolean, beta boolean default false, email text default null) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email, email_confirmed_at)
  values (u, coalesce(email, n || '@example.invalid'), case when confirmed then now() end);
  insert into public.profiles(id, display_name, pilot_access)
  values (u, n, case when beta then array['family_db_beta'] else '{}'::text[] end);
  perform ve.put(n, u); return u;
end $$;
-- 'ok' vagy 'ERR:<sqlstate>[:<hint>]'
create function ve.run(u uuid, q text, claim_email text default null) returns text language plpgsql as $$
declare v_hint text; begin
  perform ve.as_user(u, claim_email);
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
create function ve.vis(u uuid, q text) returns bigint language plpgsql as $$
declare n bigint; begin
  perform ve.as_user(u);
  begin
    execute case when u is null then 'set local role anon' else 'set local role authenticated' end;
    execute 'select count(*) from (' || q || ') s' into n; execute 'reset role'; return n;
  exception when insufficient_privilege then return -1; end;
end $$;
create function ve.inv(f uuid, email text) returns uuid language sql stable as $$
  select id from public.family_guardian_invitations
   where family_id = f and invited_email = lower(btrim(email))
   order by created_at desc limit 1 $$;
create function ve.inv_status(i uuid) returns text language sql stable as $$
  select status from public.family_guardian_invitations where id = i $$;
create function ve.member(f uuid, u uuid) returns text language sql stable as $$
  select role || '/' || status from public.family_members where family_id = f and user_id = u $$;
create function ve.accept(u uuid, i uuid, claim_email text default null) returns text language sql as $$
  select ve.run(u, format('select public.accept_family_guardian_invitation(%L)', i), claim_email) $$;
create function ve.decline(u uuid, i uuid, claim_email text default null) returns text language sql as $$
  select ve.run(u, format('select public.decline_family_guardian_invitation(%L)', i), claim_email) $$;

-- Szereplők: o = tulajdonos (Plus-próbaidős T család: sok meghívó fér el),
-- p = tulajdonos (ingyenes F család: felnőttkorlát 2), meghívottak: g, u (nem igazolt),
-- v, x (idegen, igazolt), e (lejárt), r (visszavont), a (már elfogadott), d (elutasít),
-- n (e-mail nélküli fiók), m (OAuth-szerű: tárolt cím nagybetűvel/szóközzel), q, q2.
select ve.mkuser('o', true, true), ve.mkuser('p', true, true),
       ve.mkuser('g', true), ve.mkuser('u', false), ve.mkuser('v', true), ve.mkuser('x', true),
       ve.mkuser('e', true), ve.mkuser('r', true), ve.mkuser('d', true), ve.mkuser('d2', false),
       ve.mkuser('m', true, false, '  M@Example.Invalid '), ve.mkuser('q', true);
insert into auth.users(id, email, email_confirmed_at) values (gen_random_uuid(), null, now());
insert into ve.ctx values ('n', (select id from auth.users where email is null));
insert into public.profiles(id, display_name) values (ve.id('n'), 'n');

-- Előkészítés -------------------------------------------------------------------
do $$
declare o uuid := ve.id('o'); p uuid := ve.id('p'); ft uuid; ff uuid; c uuid; addr text;
begin
  assert ve.run(o, $q$select public.create_family_with_owner('T')$q$) = 'ok', 'S1 T család';
  assert ve.run(p, $q$select public.create_family_with_owner('F')$q$) = 'ok', 'S2 F család';
  ft := (select id from public.families where created_by = o); ff := (select id from public.families where created_by = p);
  perform ve.put('ft', ft); perform ve.put('ff', ff);
  assert ve.vis(o, format('select 1 where (public.start_family_trial(%L)->>''started'')::boolean', ft)) = 1, 'S3 T próbaidő (Plus-keret)';
  assert ve.run(o, format('select public.create_child_profile_for_family(%L, %L, null)', ft, 'Tamara')) = 'ok', 'S4 T gyermek';
  c := (select child_id from public.family_children where family_id = ft); perform ve.put('c', c);
  foreach addr in array array['g','u','v','e','r','d','d2','m'] loop
    assert ve.run(o, format('select public.invite_family_guardian(%L, %L)', ft, addr || '@example.invalid')) = 'ok', 'S5 meghívó: ' || addr;
  end loop;
  -- lejárt meghívó (fixture: a lejárat múltba állítása)
  update public.family_guardian_invitations set expires_at = now() - interval '1 minute'
   where id = ve.inv(ft, 'e@example.invalid');
  -- visszavont meghívó a tulajdonos saját RPC-jével
  assert ve.run(o, format('select public.revoke_family_guardian_invitation(%L)', ve.inv(ft, 'r@example.invalid'))) = 'ok', 'S6 visszavonás';
  -- a tulajdonos saját címére szóló meghívó (fixture: az invite RPC ezt tiltja)
  insert into public.family_guardian_invitations(family_id, invited_email, invited_by, expires_at)
  values (ft, 'o@example.invalid', o, now() + interval '7 days');
end $$;

-- V1. Jogosultságok és függvénybeállítások ----------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.accept_family_guardian_invitation(uuid)', 'public.decline_family_guardian_invitation(uuid)'] loop
    assert (select prosecdef from pg_proc where oid = f::regprocedure), 'V1a SECURITY DEFINER: ' || f;
    assert (select array_to_string(proconfig, ',') = 'search_path=public, pg_temp' from pg_proc where oid = f::regprocedure), 'V1b rögzített search_path: ' || f;
    assert not has_function_privilege('anon', f, 'EXECUTE'), 'V1c anon nem futtathatja: ' || f;
    assert has_function_privilege('authenticated', f, 'EXECUTE'), 'V1d authenticated futtathatja: ' || f;
    assert not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'), 'V1e PUBLIC nem futtathatja: ' || f;
    assert (select prosrc like '%email_confirmed_at%' and prosrc like '%from auth.users%' and prosrc not like '%auth.email()%'
              from pg_proc where oid = f::regprocedure), 'V1f a cím és az igazolás az auth.users táblából jön: ' || f;
  end loop;
  assert exists (select 1 from pg_trigger where tgname = 'enforce_family_adult_limit_trigger' and tgenabled = 'O'), 'V1g felnőttkorlát-trigger él';
  assert exists (select 1 from pg_trigger where tgname = 'family_members_protect_last_owner' and tgenabled = 'O'), 'V1h owner-védelem trigger él';
end $$;

-- V2. Nem igazolt e-mail: elfogadás és elutasítás is tiltott, semmi nem változik -------
do $$
declare u uuid := ve.id('u'); ft uuid := ve.id('ft'); i uuid := ve.inv(ve.id('ft'), 'u@example.invalid');
begin
  assert ve.accept(u, i) = 'ERR:P0001:family_invitation_email_unverified', 'V2a nem igazolt cím: elfogadás elutasítva';
  assert ve.decline(u, i) = 'ERR:P0001:family_invitation_email_unverified', 'V2b nem igazolt cím: elutasítás is tiltott';
  assert ve.inv_status(i) = 'pending', 'V2c a meghívó függő maradt';
  assert ve.member(ft, u) is null, 'V2d nem lett családtag';
  -- a token e-mail-állítása sem segít: a tárolt igazolási állapot dönt
  assert ve.accept(u, i, 'u@example.invalid') = 'ERR:P0001:family_invitation_email_unverified', 'V2e token-állítás nem írja felül';
end $$;

-- V3. Eltérő e-mail és hamisított token-állítás -------------------------------------
do $$
declare x uuid := ve.id('x'); ft uuid := ve.id('ft'); iv uuid := ve.inv(ve.id('ft'), 'v@example.invalid');
begin
  assert ve.accept(x, iv) = 'ERR:P0001', 'V3a igazolt, de eltérő cím: elutasítva';
  assert ve.accept(x, iv, 'v@example.invalid') = 'ERR:P0001', 'V3b a token a meghívott címét állítja, a tárolt cím más: elutasítva';
  assert ve.decline(x, iv, 'v@example.invalid') = 'ERR:P0001', 'V3c ugyanez elutasításnál';
  assert ve.inv_status(iv) = 'pending' and ve.member(ft, x) is null, 'V3d semmi nem változott';
end $$;

-- V4. Lejárt, visszavont és már megválaszolt meghívó -----------------------------------
do $$
declare ft uuid := ve.id('ft'); ie uuid := ve.inv(ve.id('ft'), 'e@example.invalid'); ir uuid := ve.inv(ve.id('ft'), 'r@example.invalid');
begin
  assert ve.accept(ve.id('e'), ie) = 'ERR:P0001', 'V4a lejárt: elfogadás elutasítva';
  assert ve.decline(ve.id('e'), ie) = 'ERR:P0001', 'V4b lejárt: elutasítás elutasítva';
  assert ve.inv_status(ie) = 'pending' and ve.member(ft, ve.id('e')) is null, 'V4c lejárt meghívó változatlan';
  assert ve.accept(ve.id('r'), ir) = 'ERR:P0001', 'V4d visszavont: elutasítva';
  assert ve.inv_status(ir) = 'revoked' and ve.member(ft, ve.id('r')) is null, 'V4e visszavont meghívó változatlan';
end $$;

-- V5. Jogosulatlan hívók ------------------------------------------------------------
do $$
declare ig uuid := ve.inv(ve.id('ft'), 'g@example.invalid');
begin
  assert ve.accept(null, ig) like 'ERR:42501%', 'V5a anon: nincs EXECUTE jog';
  assert ve.decline(null, ig) like 'ERR:42501%', 'V5b anon: nincs EXECUTE jog (elutasítás)';
  assert ve.accept(ve.id('n'), ig) = 'ERR:P0001:family_invitation_email_missing', 'V5c e-mail nélküli fiók: elutasítva';
  assert ve.accept(ve.id('n'), ig, 'g@example.invalid') = 'ERR:P0001:family_invitation_email_missing', 'V5d e-mail nélküli fiók token-állítással is';
  assert ve.accept(ve.id('o'), ve.inv(ve.id('ft'), 'o@example.invalid')) = 'ERR:P0001', 'V5e tulajdonos saját címére szóló meghívó: owner-sor nem módosulhat';
  assert ve.inv_status(ve.inv(ve.id('ft'), 'o@example.invalid')) = 'pending', 'V5f a sikertelen kísérlet visszagörgetődött';
  assert ve.member(ve.id('ft'), ve.id('o')) = 'owner/active', 'V5g a tulajdonos szerepe változatlan';
  assert ve.inv_status(ig) = 'pending', 'V5h g meghívója még érintetlen';
end $$;

-- V6. Igazolt, egyező e-mail: elfogadás és elutasítás működik; gyermekjog nem keletkezik -----
do $$
declare g uuid := ve.id('g'); d uuid := ve.id('d'); ft uuid := ve.id('ft'); c uuid := ve.id('c');
        ig uuid := ve.inv(ve.id('ft'), 'g@example.invalid'); id_ uuid := ve.inv(ve.id('ft'), 'd@example.invalid');
        perms_before bigint := (select count(*) from public.guardian_child_permissions);
begin
  assert ve.accept(g, ig) = 'ok', 'V6a igazolt, egyező cím: elfogadva';
  assert ve.inv_status(ig) = 'accepted' and ve.member(ft, g) = 'guardian/active', 'V6b aktív gondviselő lett';
  assert (select count(*) from public.guardian_child_permissions) = perms_before, 'V6c nem keletkezett gyermekenkénti jog';
  assert not exists (select 1 from public.guardian_child_permissions where guardian_user_id = g), 'V6d g-nek nincs gyermekjoga';
  assert ve.vis(g, format('select 1 from public.child_profiles where id = %L', c)) = 0, 'V6e g nem látja a gyermekprofilt';
  assert ve.vis(g, format('select 1 from public.child_schedule_items where child_id = %L', c)) = 0, 'V6f g nem látja a napirendet';
  assert ve.accept(g, ig) = 'ERR:P0001', 'V6g már elfogadott meghívó újra: elutasítva';
  assert ve.decline(g, ig) = 'ERR:P0001', 'V6h már elfogadott meghívó elutasítása: elutasítva';
  assert ve.decline(d, id_) = 'ok', 'V6i igazolt, egyező cím: elutasítás működik';
  assert ve.inv_status(id_) = 'declined' and ve.member(ft, d) is null, 'V6j elutasítva, tagság nincs';
  assert ve.accept(d, id_) = 'ERR:P0001', 'V6k elutasított meghívó utólag nem fogadható el';
end $$;

-- V7. OAuth-/admin-igazolású fiókok kompatibilitása ----------------------------------
do $$
declare m uuid := ve.id('m'); u uuid := ve.id('u'); ft uuid := ve.id('ft');
begin
  -- a tárolt cím kis-/nagybetűs és szóközös: normalizálva egyezik
  assert ve.accept(m, ve.inv(ft, 'm@example.invalid')) = 'ok', 'V7a igazolt (pl. OAuth) fiók, eltérő írásmódú tárolt cím: elfogadva';
  -- a korábban nem igazolt u megerősíti a címét (Auth tölti ki az email_confirmed_at-et): ezután működik
  update auth.users set email_confirmed_at = now() where id = u;
  assert ve.accept(u, ve.inv(ft, 'u@example.invalid')) = 'ok', 'V7b megerősítés után az elfogadás működik';
  assert ve.member(ft, u) = 'guardian/active', 'V7c u aktív gondviselő';
  -- d2 (nem igazolt) elutasítani sem tud
  assert ve.decline(ve.id('d2'), ve.inv(ft, 'd2@example.invalid')) = 'ERR:P0001:family_invitation_email_unverified', 'V7d nem igazolt elutasítás tiltva';
end $$;

-- V8. Ingyenes csomag felnőttkorlátja változatlan --------------------------------------
do $$
declare p uuid := ve.id('p'); q uuid := ve.id('q'); ff uuid := ve.id('ff');
begin
  assert ve.run(p, format('select public.invite_family_guardian(%L, %L)', ff, 'q@example.invalid')) = 'ok', 'V8a első gondviselő meghívható';
  assert ve.run(p, format('select public.invite_family_guardian(%L, %L)', ff, 'q2@example.invalid')) = 'ERR:P0001:family_guardian_limit_reached', 'V8b függő meghívó mellett nincs második hely';
  assert ve.accept(q, ve.inv(ff, 'q@example.invalid')) = 'ok', 'V8c igazolt elfogadás az ingyenes családban';
  assert ve.run(p, format('select public.invite_family_guardian(%L, %L)', ff, 'q2@example.invalid')) = 'ERR:P0001:family_guardian_limit_reached', 'V8d tulajdonos + 1 gondviselő után nincs több hely';
  assert (select count(*) from public.family_members where family_id = ff and status = 'active') = 2, 'V8e pontosan 2 aktív felnőtt';
end $$;

select 'family_guardian_invitation_email: V1-V8 OK' as result;
