-- Fióktörlés lifecycle SQL-tesztek. FUTTATÁS: KIZÁRÓLAG eldobható (scratch)
-- Postgres adatbázison, a Family-migrációk + a 20261004 migráció után, a
-- _bootstrap_stub.sql auth/profiles stubjával. SOHA nem production DB-n.
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/account_deletion_lifecycle.sql
-- Minden ellenőrzés `assert`; bármely hiba megállítja a futást.

create schema if not exists t;
create or replace function t.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false) $$;
create or replace function t.mkuser(n text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id,email) values (u, n||'@t.hu');
  insert into public.profiles(id, display_name) values (u, n); return u; end $$;
create or replace function t.mkfamily(owner_id uuid, nchildren int) returns uuid language plpgsql as $$
declare f uuid; c uuid; i int; begin
  insert into public.families(name, created_by) values ('fam', owner_id) returning id into f;
  insert into public.family_members(family_id,user_id,role,status) values (f, owner_id,'owner','active');
  for i in 1..nchildren loop
    insert into public.child_profiles(first_name, created_by) values ('kid'||i, owner_id) returning id into c;
    insert into public.family_children(family_id, child_id) values (f, c);
    insert into public.child_schedule_items(child_id,title,schedule_type,time_local,start_date,origin_label,origin_lat,origin_lon)
      values (c,'iskola','one_time','08:00','2026-10-05','otthon',47.5,19.0);
  end loop; return f; end $$;
create or replace function t.addmember(f uuid, u uuid, r text) returns void language sql as $$
  insert into public.family_members(family_id,user_id,role,status) values (f,u,r,'active') $$;
create or replace function t.state(u uuid) returns text language sql as $$
  select public._account_deletion_classify(u)->>'state' $$;

-- 1. nincs Family
do $$ declare u uuid := t.mkuser('plain'); r jsonb; begin
  perform t.as_user(u);
  assert t.state(u)='READY', '1 state';
  r := public.prepare_account_deletion(false);
  assert (r->>'ok')::bool, '1 ok';
  delete from auth.users where id=u;
  assert not exists(select 1 from public.profiles where id=u), '1 deleted';
end $$;

-- 2. guardian: saját membership eltűnik, Family+child marad
do $$ declare o uuid := t.mkuser('o2'); g uuid := t.mkuser('g2'); f uuid := t.mkfamily(o,1); c uuid; r jsonb; begin
  perform t.addmember(f,g,'guardian'); select child_id into c from family_children where family_id=f;
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule) values (c,g,true);
  perform t.as_user(g);
  assert t.state(g)='GUARDIAN_READY', '2 state';
  r := public.prepare_account_deletion(false); assert (r->>'ok')::bool, '2 ok';
  assert not exists(select 1 from family_members where user_id=g), '2 membership gone';
  assert not exists(select 1 from guardian_child_permissions where guardian_user_id=g), '2 perms gone';
  assert exists(select 1 from families where id=f) and exists(select 1 from child_profiles where id=c), '2 family+child stay';
  assert exists(select 1 from child_schedule_items where child_id=c), '2 schedule stays';
  delete from auth.users where id=g;
end $$;

-- 3. owner + másik owner
do $$ declare o uuid := t.mkuser('o3'); o2 uuid := t.mkuser('o3b'); f uuid := t.mkfamily(o,1); r jsonb; begin
  perform t.addmember(f,o2,'owner'); perform t.as_user(o);
  assert t.state(o)='OTHER_OWNER_READY', '3 state';
  r := public.prepare_account_deletion(false); assert (r->>'ok')::bool, '3 ok';
  assert exists(select 1 from families where id=f) and exists(select 1 from family_members where user_id=o2 and role='owner'), '3 stays';
  assert not exists(select 1 from family_members where user_id=o), '3 mine gone';
  delete from auth.users where id=o;
end $$;

-- 4–6. sole owner + guardian -> transfer kell; transfer; régi owner törölhető
do $$ declare o uuid := t.mkuser('o4'); g uuid := t.mkuser('g4'); f uuid := t.mkfamily(o,1); r jsonb; begin
  perform t.addmember(f,g,'guardian'); perform t.as_user(o);
  assert t.state(o)='OWNER_TRANSFER_REQUIRED', '4 state';
  r := public.prepare_account_deletion(true);
  assert not (r->>'ok')::bool and r->>'state'='OWNER_TRANSFER_REQUIRED', '4 blocked even with confirm';
  assert exists(select 1 from family_members where user_id=o), '4 nothing deleted';
  assert (public._account_deletion_classify(o)->'transfer'->0->'candidates'->0->>'user_id')::uuid = g, '4 candidate listed';
  -- 5. transfer: nem owner nem hívhatja, nem guardian nem választható
  begin perform public.transfer_family_ownership(f, o); assert false,'self'; exception when others then assert sqlerrm like 'Önmagadnak%', sqlerrm; end;
  perform t.as_user(g);
  begin perform public.transfer_family_ownership(f, g); assert false; exception when others then null; end;
  begin perform public.transfer_family_ownership(f, o); assert false,'guardian caller'; exception when others then assert sqlerrm like 'Csak a család%', sqlerrm; end;
  perform t.as_user(o);
  begin perform public.transfer_family_ownership(f, t.mkuser('stranger')); assert false,'stranger'; exception when others then assert sqlerrm like 'A kijelölt%', sqlerrm; end;
  perform public.transfer_family_ownership(f, g);
  assert (select role from family_members where family_id=f and user_id=g)='owner', '5 promoted';
  assert (select role from family_members where family_id=f and user_id=o)='owner', '5 old owner still owner (never ownerless)';
  -- 6. régi owner törölhető
  assert t.state(o)='OTHER_OWNER_READY', '6 state';
  r := public.prepare_account_deletion(false); assert (r->>'ok')::bool, '6 ok';
  assert exists(select 1 from families where id=f), '6 family stays';
  delete from auth.users where id=o;
end $$;

-- 7–8. sole owner + egyszerű Family: confirm nélkül nem töröl; confirmmel igen
do $$ declare o uuid := t.mkuser('o7'); f uuid := t.mkfamily(o,2); r jsonb; kids uuid[]; begin
  select array_agg(child_id) into kids from family_children where family_id=f;
  insert into child_account_invitations(child_id, created_by, token_hash, expires_at) values (kids[1], o, 'h'||f, now()+interval '1 day');
  insert into guardian_authorizations(child_id, guardian_user_id, authorization_type, document_version) values (kids[1], o, 'CHILD_ACCOUNT_ACTIVATION','v1');
  perform t.as_user(o);
  assert t.state(o)='SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED', '7 state';
  assert (public._account_deletion_classify(o)->'family_deletion'->0->>'child_count')::int=2, '7 child_count';
  r := public.prepare_account_deletion(false);
  assert not (r->>'ok')::bool, '7 not ok without confirm';
  assert exists(select 1 from families where id=f) and exists(select 1 from child_profiles where id=kids[1]), '7 nothing deleted';
  r := public.prepare_account_deletion(true);
  assert (r->>'ok')::bool and (r->>'deleted_families')::int=1 and (r->>'deleted_children')::int=2, '8 ok '||r::text;
  assert not exists(select 1 from families where id=f), '8 family';
  assert not exists(select 1 from family_members where family_id=f), '8 members';
  assert not exists(select 1 from child_profiles where id=any(kids)), '8 children';
  assert not exists(select 1 from child_schedule_items where child_id=any(kids)), '8 schedule';
  assert not exists(select 1 from child_account_invitations where child_id=any(kids)), '8 invitations';
  assert (select count(*) from guardian_authorizations where child_id is null and guardian_user_id=o)=1, '8 audit row kept (SET NULL)';
  delete from auth.users where id=o;
  assert (select count(*) from guardian_authorizations where child_id is null and guardian_user_id is null and document_version='v1')>=1, '8 audit anonymised';
end $$;

-- 8b. sole owner, 0 gyerek is rendben
do $$ declare o uuid := t.mkuser('o8b'); f uuid := t.mkfamily(o,0); r jsonb; begin
  perform t.as_user(o); r := public.prepare_account_deletion(true);
  assert (r->>'ok')::bool and not exists(select 1 from families where id=f), '8b'; delete from auth.users where id=o; end $$;

-- 9. több Familyhez tartozó gyerek -> fail closed. A séma ma UNIQUE(child_id)-ot
-- kényszerít; a védelmet a constraint ideiglenes eldobásával szimuláljuk (drift).
do $$ declare o uuid := t.mkuser('o9'); o2 uuid := t.mkuser('o9b'); f uuid := t.mkfamily(o,1); f2 uuid := t.mkfamily(o2,0); c uuid; r jsonb; begin
  select child_id into c from family_children where family_id=f;
  alter table family_children drop constraint family_children_child_id_unique;
  insert into family_children(family_id, child_id) values (f2, c);
  perform t.as_user(o);
  assert t.state(o)='COMPLEX_FAMILY_MANUAL_REVIEW', '9 state';
  r := public.prepare_account_deletion(true);
  assert not (r->>'ok')::bool and exists(select 1 from families where id=f) and exists(select 1 from child_profiles where id=c), '9 nothing deleted';
  delete from family_children where family_id=f2;
  alter table family_children add constraint family_children_child_id_unique unique (child_id);
end $$;

-- 10. child_accounts sor (bármely státusz) -> fail closed, a child account megmarad
do $$ declare o uuid := t.mkuser('o10'); cu uuid := t.mkuser('cu10'); f uuid := t.mkfamily(o,1); c uuid; r jsonb; begin
  select child_id into c from family_children where family_id=f;
  insert into child_accounts(child_id, auth_user_id, status, activated_at) values (c, cu, 'active', now());
  perform t.as_user(o);
  assert t.state(o)='CHILD_ACCOUNT_MANUAL_REVIEW', '10 state';
  r := public.prepare_account_deletion(true);
  assert not (r->>'ok')::bool and exists(select 1 from families where id=f) and exists(select 1 from child_accounts where child_id=c), '10 kept';
  -- revoked is blokkol
  update child_accounts set status='revoked', revoked_at=now() where child_id=c;
  assert t.state(o)='CHILD_ACCOUNT_MANUAL_REVIEW', '10 revoked still blocks';
  -- 11. child-account user külön státusz, semmi nem törlődik
  perform t.as_user(cu);
  assert t.state(cu)='CHILD_ACCOUNT_USER', '11 state';
  r := public.prepare_account_deletion(true);
  assert not (r->>'ok')::bool and r->>'state'='CHILD_ACCOUNT_USER' and exists(select 1 from child_accounts where child_id=c), '11';
end $$;

-- 12. másik guardian child adata nem törlődik (guardian törlése)
do $$ declare o uuid := t.mkuser('o12'); g1 uuid := t.mkuser('g12a'); g2 uuid := t.mkuser('g12b'); f uuid := t.mkfamily(o,1); c uuid; begin
  select child_id into c from family_children where family_id=f;
  perform t.addmember(f,g1,'guardian'); perform t.addmember(f,g2,'guardian');
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule) values (c,g1,true),(c,g2,true);
  perform t.as_user(g1); perform public.prepare_account_deletion(false);
  assert exists(select 1 from guardian_child_permissions where child_id=c and guardian_user_id=g2), '12 other guardian perm stays';
  assert exists(select 1 from child_schedule_items where child_id=c), '12 schedule stays';
end $$;

-- 13. több Family: sole-owner egyszerű + guardian máshol -> mindkettő rendeződik
do $$ declare o uuid := t.mkuser('o13'); x uuid := t.mkuser('x13'); f1 uuid := t.mkfamily(o,1); f2 uuid := t.mkfamily(x,1); r jsonb; begin
  perform t.addmember(f2,o,'guardian'); perform t.as_user(o);
  r := public.prepare_account_deletion(true);
  assert (r->>'ok')::bool and not exists(select 1 from families where id=f1) and exists(select 1 from families where id=f2), '13';
  assert not exists(select 1 from family_members where user_id=o), '13 membership gone';
end $$;

-- 14. last-owner védelem normál műveleteknél továbbra is működik
do $$ declare o uuid := t.mkuser('o14'); f uuid := t.mkfamily(o,1); begin
  begin delete from family_members where family_id=f and user_id=o; assert false,'direct delete'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
  begin update family_members set role='guardian' where family_id=f and user_id=o; assert false,'demote'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
  begin update family_members set status='revoked' where family_id=f and user_id=o; assert false,'revoke'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
  begin delete from families where id=f; assert false,'plain family delete without RPC setting'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
  -- a GUC önmagában (families sor még létezik) nem elég
  perform set_config('vedettsarok.family_deletion_id', f::text, true);
  begin delete from family_members where family_id=f and user_id=o; assert false,'guc alone'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
  perform set_config('vedettsarok.family_deletion_id', '', true);
  begin delete from auth.users where id=o; assert false,'auth delete of sole owner'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
end $$;

-- 15. jogosultságok: anon nem hívhat; belső osztályozó authenticated-nek sem
do $$ begin
  set local role anon;
  begin perform public.prepare_account_deletion(true); assert false,'anon'; exception when insufficient_privilege then null; end;
  begin perform public.get_account_deletion_state(); assert false,'anon2'; exception when insufficient_privilege then null; end;
  begin perform public.transfer_family_ownership(gen_random_uuid(), gen_random_uuid()); assert false,'anon3'; exception when insufficient_privilege then null; end;
  set local role authenticated;
  begin perform public._account_deletion_classify(gen_random_uuid()); assert false,'internal'; exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- 16. nincs session -> hiba (nem user_id paraméterből dönt)
do $$ begin
  perform set_config('request.jwt.claim.sub','',false);
  begin perform public.prepare_account_deletion(true); assert false,'no session'; exception when others then assert sqlerrm like 'Bejelentkezés%', sqlerrm; end;
end $$;

\echo ALL ACCOUNT-DELETION SQL TESTS PASSED
