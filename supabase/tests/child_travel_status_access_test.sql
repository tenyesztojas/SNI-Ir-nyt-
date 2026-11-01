-- Gyermekutazási státusz: hozzáférés, családok közötti izoláció és állapotgép.
-- FUTTATÁS: KIZÁRÓLAG eldobható (scratch) Postgres adatbázison, a
-- _bootstrap_stub.sql + Family-migrációk + 20261027000000_child_travel_status
-- és 20261030000000 után. SOHA nem production DB-n.
--
-- A Supabase alapértelmezett táblajogait emuláljuk a családi alaptáblákra
-- (ezekre a migrációk nem adnak/vonnak explicit jogot), hogy az RLS-policy
-- guardian-ágának al-lekérdezései valós szerepkörben fussanak.

grant select on public.families, public.family_members, public.family_children,
  public.guardian_child_permissions, public.child_accounts, public.child_profiles,
  public.child_schedule_items to authenticated;

create schema if not exists ts;
create or replace function ts.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
create or replace function ts.mkuser(n text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id,email) values (u, n||'@t.hu');
  insert into public.profiles(id, display_name) values (u, n); return u; end $$;
create or replace function ts.today() returns date language sql as $$ select (now() at time zone 'Europe/Budapest')::date $$;
create or replace function ts.setup(n text, out f uuid, out o uuid, out c uuid, out item uuid, out kid uuid) language plpgsql as $$
begin
  o := ts.mkuser(n||'_owner'); kid := ts.mkuser(n||'_kid');
  insert into public.families(name, created_by) values ('fam', o) returning id into f;
  insert into public.family_members(family_id,user_id,role,status) values (f, o,'owner','active');
  -- teszt-fixture: több gondviselő kell, ezért Plusz-szintű létszám (20261030000000)
  insert into public.family_feature_grants(family_id, feature_key, source)
    values (f, 'family.guardians.multiple', 'test_fixture'), (f, 'family.children.multiple', 'test_fixture');
  insert into public.child_profiles(first_name, created_by) values ('kid', o) returning id into c;
  insert into public.family_children(family_id, child_id) values (f, c);
  insert into public.child_schedule_items(child_id,title,schedule_type,time_local,start_date)
    values (c,'iskola','one_time','08:00',ts.today()) returning id into item;
  insert into public.child_accounts(child_id, auth_user_id, status, activated_at) values (c, kid, 'active', now());
end $$;
-- látható sorok száma a megadott felhasználóként (authenticated szerepkör)
create or replace function ts.visible(u uuid, c uuid) returns int language plpgsql as $$
declare n int; begin
  perform ts.as_user(u);
  set local role authenticated;
  select count(*) into n from public.child_travel_statuses where child_id = c;
  reset role;
  return n; end $$;
-- RPC-hívás a megadott felhasználóként; hibánál az üzenetet adja vissza
create or replace function ts.try_set(u uuid, item uuid, action text) returns text language plpgsql as $$
begin
  perform ts.as_user(u);
  set local role authenticated;
  perform public.set_child_travel_status(item, action);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end $$;
grant usage on schema ts to authenticated;

do $$
declare
  a record; b record; r public.child_travel_statuses; dep timestamptz; msg text; n int;
  g_view uuid := ts.mkuser('g_view'); g_viewoff uuid := ts.mkuser('g_viewoff');
  g_revoked uuid := ts.mkuser('g_revoked'); g_nomember uuid := ts.mkuser('g_nomember');
  y_item uuid; nt_item uuid; off_item uuid;
begin
  select * into a from ts.setup('a');
  select * into b from ts.setup('b');   -- másik család
  insert into family_members(family_id,user_id,role,status) values
    (a.f, g_view,'guardian','active'), (a.f, g_viewoff,'guardian','active'), (a.f, g_revoked,'guardian','active');
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule) values
    (a.c, g_view, true), (a.c, g_revoked, true), (a.c, g_nomember, true);
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule,can_manage_schedule) values
    (a.c, g_viewoff, false, false);
  update guardian_child_permissions set status = 'revoked', revoked_at = now() where guardian_user_id = g_revoked;

  -- A1: más család gyermeke / szülő / guardian nem állíthat státuszt
  assert ts.try_set(b.kid, a.item, 'depart') = 'travel_item_not_found', 'A1a idegen gyermek';
  assert ts.try_set(a.o, a.item, 'depart') = 'travel_not_child', 'A1b szülő nem gyermek';
  assert ts.try_set(g_view, a.item, 'depart') = 'travel_not_child', 'A1c guardian nem gyermek';
  assert ts.try_set(null, a.item, 'depart') = 'travel_not_child', 'A1d anon';
  assert ts.try_set(a.kid, a.item, 'teleport') = 'travel_invalid_action', 'A1e érvénytelen akció';
  assert (select count(*) from child_travel_statuses) = 0, 'A1f nem jött létre sor';

  -- S1: indulás előtt nincs érkezés
  assert ts.try_set(a.kid, a.item, 'arrive') = 'travel_not_departed', 'S1 arrive before depart';
  -- S2: ismételt indulás idempotens (ugyanaz a sor és indulási idő)
  assert ts.try_set(a.kid, a.item, 'depart') = 'ok', 'S2a depart';
  select departed_at into dep from child_travel_statuses where schedule_item_id = a.item;
  perform pg_sleep(0.01);
  assert ts.try_set(a.kid, a.item, 'depart') = 'ok', 'S2b depart again';
  assert (select count(*) from child_travel_statuses where schedule_item_id = a.item) = 1, 'S2c egy sor';
  assert (select departed_at from child_travel_statuses where schedule_item_id = a.item) = dep, 'S2d indulási idő változatlan';
  -- S3: segítségkérés, majd ismételt segítségkérés idempotens
  assert ts.try_set(a.kid, a.item, 'help') = 'ok', 'S3a help';
  assert ts.try_set(a.kid, a.item, 'help') = 'ok', 'S3b help again';
  assert (select status from child_travel_statuses where schedule_item_id = a.item) = 'help_requested', 'S3c';
  -- S4: érkezés lezár; utána semmi nem módosíthatja
  assert ts.try_set(a.kid, a.item, 'arrive') = 'ok', 'S4a arrive';
  assert ts.try_set(a.kid, a.item, 'depart') = 'travel_closed', 'S4b depart after arrive';
  assert ts.try_set(a.kid, a.item, 'help') = 'travel_closed', 'S4c help after arrive';
  assert ts.try_set(a.kid, a.item, 'arrive') = 'travel_closed', 'S4d arrive twice';

  -- R1: olvasás – családok közötti izoláció és guardian-jogosultság
  assert ts.visible(a.o, a.c) = 1, 'R1a owner látja';
  assert ts.visible(a.kid, a.c) = 1, 'R1b gyermek látja a sajátját';
  assert ts.visible(g_view, a.c) = 1, 'R1c guardian látási joggal';
  assert ts.visible(g_viewoff, a.c) = 0, 'R1d guardian látási jog nélkül';
  assert ts.visible(g_revoked, a.c) = 0, 'R1e visszavont guardian';
  assert ts.visible(g_nomember, a.c) = 0, 'R1f jog van, családtagság nincs';
  assert ts.visible(b.o, a.c) = 0, 'R1g másik család ownere';
  assert ts.visible(b.kid, a.c) = 0, 'R1h másik család gyermeke';
  perform ts.as_user(null);
  set local role anon;
  begin select count(*) into n from child_travel_statuses; assert false, 'R1i anon';
  exception when insufficient_privilege then null; end;
  reset role;

  -- W1: közvetlen írás tiltva (csak az RPC írhat)
  perform ts.as_user(a.kid);
  set local role authenticated;
  begin insert into child_travel_statuses(child_id,schedule_item_id,travel_date,status) values (a.c,a.item,ts.today()-1,'arrived'); assert false, 'W1a insert';
  exception when insufficient_privilege then null; end;
  begin update child_travel_statuses set status = 'departed'; assert false, 'W1b update';
  exception when insufficient_privilege then null; end;
  begin delete from child_travel_statuses; assert false, 'W1c delete';
  exception when insufficient_privilege then null; end;
  reset role;

  -- D1: tegnapi, még nyitott út ma lezárható; tegnapi lezárt út nem blokkolja a mai indulást
  insert into child_schedule_items(child_id,title,schedule_type,time_local,days_of_week)
    values (b.c,'edzés','recurring','17:00', array[1,2,3,4,5,6,7]::smallint[]) returning id into y_item;
  insert into child_travel_statuses(child_id,schedule_item_id,travel_date,status,departed_at)
    values (b.c, y_item, ts.today()-1, 'departed', now() - interval '1 day');
  assert ts.try_set(b.kid, y_item, 'arrive') = 'ok', 'D1a tegnapi nyitott út lezárása';
  assert (select status from child_travel_statuses where schedule_item_id = y_item and travel_date = ts.today()-1) = 'arrived', 'D1b tegnapi sor zárult';
  assert ts.try_set(b.kid, y_item, 'depart') = 'ok', 'D1c mai új indulás';
  assert (select count(*) from child_travel_statuses where schedule_item_id = y_item) = 2, 'D1d két külön nap';

  -- D2: nem mai / inaktív elem
  insert into child_schedule_items(child_id,title,schedule_type,time_local,start_date)
    values (b.c,'holnap','one_time','09:00',ts.today()+1) returning id into nt_item;
  assert ts.try_set(b.kid, nt_item, 'depart') = 'travel_not_today', 'D2a nem mai';
  insert into child_schedule_items(child_id,title,schedule_type,time_local,start_date,is_active)
    values (b.c,'ki','one_time','09:00',ts.today(),false) returning id into off_item;
  assert ts.try_set(b.kid, off_item, 'depart') = 'travel_item_not_found', 'D2b inaktív';

  -- K1: visszavont gyermekfiók nem állíthat státuszt
  update child_accounts set status = 'revoked', revoked_at = now() where child_id = b.c;
  assert ts.try_set(b.kid, y_item, 'help') = 'travel_not_child', 'K1 visszavont gyermekfiók';
end $$;

select 'child_travel_status_access: A1, S1-S4, R1, W1, D1-D2, K1 OK' as result;
