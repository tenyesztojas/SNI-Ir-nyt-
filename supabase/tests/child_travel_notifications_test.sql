-- Gyermekutazási értesítések SQL-tesztje. FUTTATÁS: KIZÁRÓLAG eldobható
-- (scratch) Postgres adatbázison, a Family-migrációk + 20261014 + 20261019
-- után, a _bootstrap_stub.sql stubjával. SOHA nem production DB-n.

create schema if not exists t;
create or replace function t.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
create or replace function t.mkuser(n text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id,email) values (u, n||'@t.hu');
  insert into public.profiles(id, display_name) values (u, n); return u; end $$;
create or replace function t.today() returns date language sql as $$ select (now() at time zone 'Europe/Budapest')::date $$;
-- család: owner + 1 gyermek + mai napirendi elem + aktív gyermekfiók
create or replace function t.setup(n text, out f uuid, out o uuid, out c uuid, out item uuid, out kid uuid) language plpgsql as $$
begin
  o := t.mkuser(n||'_owner'); kid := t.mkuser(n||'_kid');
  insert into public.families(name, created_by) values ('fam', o) returning id into f;
  insert into public.family_members(family_id,user_id,role,status) values (f, o,'owner','active');
  insert into public.child_profiles(first_name, created_by) values ('kid', o) returning id into c;
  insert into public.family_children(family_id, child_id) values (f, c);
  insert into public.child_schedule_items(child_id,title,schedule_type,time_local,start_date,origin_label,origin_lat,origin_lon)
    values (c,'iskola','one_time','08:00',t.today(),'otthon',47.5,19.0) returning id into item;
  insert into public.child_accounts(child_id, auth_user_id, status, activated_at) values (c, kid, 'active', now());
end $$;
create or replace function t.claim(id uuid, ev text) returns uuid[] language sql as $$
  select coalesce(array_agg(recipient_user_id order by recipient_user_id), '{}')
  from public.claim_child_travel_notification(id, ev) $$;
create or replace function t.sorted(a uuid[]) returns uuid[] language sql as $$
  select array_agg(x order by x) from unnest(a) x $$;

do $$
declare
  s1 record; s2 record;
  g_ok uuid := t.mkuser('g_ok'); g_noperm uuid := t.mkuser('g_noperm'); g_viewoff uuid := t.mkuser('g_viewoff');
  g_revoked uuid := t.mkuser('g_revoked'); g_nomember uuid := t.mkuser('g_nomember');
  r public.child_travel_statuses; r2 public.child_travel_statuses; got uuid[]; n int;
begin
  select * into s1 from t.setup('a');
  select * into s2 from t.setup('b');  -- másik család
  insert into family_members(family_id,user_id,role,status) values
    (s1.f, g_ok, 'guardian','active'), (s1.f, g_noperm,'guardian','active'),
    (s1.f, g_viewoff,'guardian','active'), (s1.f, g_revoked,'guardian','active');
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule) values (s1.c, g_ok, true);
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule,can_manage_schedule) values (s1.c, g_viewoff, false, false);
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule) values (s1.c, g_revoked, true);
  update guardian_child_permissions set status = 'revoked', revoked_at = now() where guardian_user_id = g_revoked;
  -- jogosultság, de NEM tagja a családnak
  insert into guardian_child_permissions(child_id,guardian_user_id,can_view_schedule) values (s1.c, g_nomember, true);

  -- N1: indulás -> címzett: owner + jogosult guardian; más senki
  perform t.as_user(s1.kid);
  r := public.set_child_travel_status(s1.item, 'depart');
  perform t.as_user(null);
  got := t.claim(r.id, 'departed');
  assert got = t.sorted(array[s1.o, g_ok]), 'N1 recipients: ' || got::text;
  assert not (got && array[s2.o, s1.kid, g_noperm, g_viewoff, g_revoked, g_nomember]), 'N1 leak';
  select recipient_count into n from child_travel_notifications where travel_status_id = r.id and event = 'departed';
  assert n = 2, 'N1 count';

  -- N2: ismételt gombnyomás / ismételt claim -> nincs második értesítés
  perform t.as_user(s1.kid);
  r := public.set_child_travel_status(s1.item, 'depart');
  perform t.as_user(null);
  assert t.claim(r.id, 'departed') = '{}', 'N2 dup';
  assert (select count(*) from child_travel_notifications where travel_status_id = r.id) = 1, 'N2 rows';

  -- N3: még meg nem történt esemény -> semmi, sor sem keletkezik
  assert t.claim(r.id, 'arrived') = '{}' and t.claim(r.id, 'help_requested') = '{}', 'N3';
  assert (select count(*) from child_travel_notifications where travel_status_id = r.id) = 1, 'N3 rows';

  -- N4: segítségkérés egyszer; ismétlés nem küld újra
  perform t.as_user(s1.kid);
  r := public.set_child_travel_status(s1.item, 'help');
  r := public.set_child_travel_status(s1.item, 'help');
  perform t.as_user(null);
  assert t.claim(r.id, 'help_requested') = t.sorted(array[s1.o, g_ok]), 'N4';
  assert t.claim(r.id, 'help_requested') = '{}', 'N4 dup';

  -- N5: megérkezés
  perform t.as_user(s1.kid);
  r := public.set_child_travel_status(s1.item, 'arrive');
  perform t.as_user(null);
  assert t.claim(r.id, 'arrived') = t.sorted(array[s1.o, g_ok]), 'N5';

  -- N6: másik család: csak a saját ownere
  perform t.as_user(s2.kid);
  r2 := public.set_child_travel_status(s2.item, 'help');
  perform t.as_user(null);
  assert t.claim(r2.id, 'help_requested') = array[s2.o], 'N6';

  -- N7: elavult esemény (késői ismétlés) nem küld
  update child_travel_statuses set departed_at = now() - interval '2 hours' where id = r2.id;
  assert t.claim(r2.id, 'departed') = '{}', 'N7';

  -- N8: ismeretlen sor / érvénytelen esemény
  assert t.claim(gen_random_uuid(), 'departed') = '{}', 'N8a';
  begin perform t.claim(r2.id, 'x'); assert false, 'N8b'; exception when others then assert sqlerrm = 'travel_notify_invalid_event', 'N8b ' || sqlerrm; end;

  -- N9: a gyermek már nincs családban -> nincs címzett, de a foglalás rögzül (no_recipients)
  delete from family_children where child_id = s2.c;
  update child_travel_statuses set arrived_at = now(), status = 'arrived' where id = r2.id;
  select array_agg(recipient_user_id) into got from public.claim_child_travel_notification(r2.id, 'arrived');
  assert got = array[null::uuid], 'N9 ' || coalesce(got::text, 'null');
  assert (select recipient_count from child_travel_notifications where travel_status_id = r2.id and event = 'arrived') = 0, 'N9 count';
end $$;

-- N10: jogosultságok
do $$ begin
  assert not has_function_privilege('authenticated', 'public.claim_child_travel_notification(uuid,text)', 'execute'), 'N10a';
  assert not has_function_privilege('anon', 'public.claim_child_travel_notification(uuid,text)', 'execute'), 'N10b';
  assert has_function_privilege('service_role', 'public.claim_child_travel_notification(uuid,text)', 'execute'), 'N10c';
  assert not has_function_privilege('authenticated', 'public._child_travel_notification_recipients(uuid)', 'execute'), 'N10d';
  assert not has_function_privilege('anon', 'public._child_travel_notification_recipients(uuid)', 'execute'), 'N10e';
  assert not has_table_privilege('authenticated', 'public.child_travel_notifications', 'select'), 'N10f';
  assert not has_table_privilege('authenticated', 'public.child_travel_notifications', 'insert'), 'N10g';
  assert not has_table_privilege('anon', 'public.child_travel_notifications', 'select'), 'N10h';
  assert (select relrowsecurity from pg_class where oid = 'public.child_travel_notifications'::regclass), 'N10i';
end $$;

select 'child_travel_notifications: N1-N10 OK' as result;
