-- =====================================================================
-- Közösségi bejelentések megőrzése — IZOLÁLT SQL-tesztek (szintetikus adatok)
-- Sorrend (lásd tests/run-pglite.mjs):
--   delete_own_account_stubs.sql → 20261020000000_delete_own_account.DRAFT.sql →
--   community_retention_stubs.sql → 20261021000000_community_report_retention_fk.DRAFT.sql →
--   20261021000100_community_report_appeals_closed_at.DRAFT.sql → EZ a fájl
-- =====================================================================
create schema if not exists tr;
create or replace function tr.mkuser(n text, r text default 'user') returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, role) values (u, n, r);
  return u; end $$;
create or replace function tr.report(rep uuid, red uuid) returns uuid language sql as $$
  insert into public.community_user_reports(reporter_user_id, reported_user_id, status)
  values (rep, red, 'resolved_warning_sent') returning id $$;

-- R1. A cron korábbi „csupa nulla UUID” anonimizálása FK-hibát ad; a NULL működik
do $$ declare a uuid := tr.mkuser('r1a'); b uuid := tr.mkuser('r1b'); rp uuid := tr.report(a, b); begin
  begin
    update public.community_user_reports set reporter_user_id = '00000000-0000-0000-0000-000000000000' where id = rp;
    assert false, 'R1 nil UUID nem bukott el';
  exception when foreign_key_violation then null; end;
  update public.community_user_reports set reporter_user_id = null, description = '[anonimizálva]', anonymized_at = now() where id = rp;
  assert (select reporter_user_id is null and reported_user_id = b from public.community_user_reports where id = rp), 'R1 null';
end $$;

-- R2. Fióktörlés bármely útvonalon (itt közvetlen auth.users-törlés = GoTrue/Dashboard):
--     az ügyirat és az auditnapló megmarad, a hivatkozás NULL; más ügyek érintetlenek
do $$ declare a uuid := tr.mkuser('r2a'); b uuid := tr.mkuser('r2b'); c uuid := tr.mkuser('r2c'); adm uuid := tr.mkuser('r2adm', 'admin');
  rp uuid; rp_other uuid; begin
  rp := tr.report(a, b); rp_other := tr.report(c, b);
  insert into public.community_report_audit_log(report_id, admin_user_id, action) values (rp, adm, 'status_change');
  delete from auth.users where id = a;                       -- bejelentő törlése
  assert (select reporter_user_id is null and reported_user_id = b from public.community_user_reports where id = rp), 'R2 reporter null';
  assert exists (select 1 from public.community_report_audit_log where report_id = rp and admin_user_id = adm), 'R2 audit megmaradt';
  delete from auth.users where id = b;                       -- bejelentett törlése
  assert (select count(*) from public.community_user_reports where id in (rp, rp_other) and reported_user_id is null) = 2, 'R2 reported null';
  assert (select reporter_user_id from public.community_user_reports where id = rp_other) = c, 'R2 más bejelentő hivatkozása megmaradt';
end $$;

-- R3. A fellebbező fiókja (NO ACTION, döntésre vár) nem törölhető: a fellebbezés teljes egészében megmarad
do $$ declare a uuid := tr.mkuser('r3a'); b uuid := tr.mkuser('r3b'); rp uuid; ap uuid; begin
  rp := tr.report(a, b);
  insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rp, b, 'rejected') returning id into ap;
  begin delete from auth.users where id = b; assert false, 'R3 törlődött';
  exception when foreign_key_violation then null; end;
  assert exists (select 1 from public.community_report_appeals where id = ap and appellant_user_id = b), 'R3 fellebbezés megmaradt';
  assert exists (select 1 from auth.users where id = b), 'R3 user megmaradt';
end $$;

-- R4. Bejelentés nem törölhető, amíg fellebbezés tartozik hozzá (RESTRICT);
--     a fellebbezés törlése után a bejelentés és vele az auditnapló törölhető (CASCADE)
do $$ declare a uuid := tr.mkuser('r4a'); b uuid := tr.mkuser('r4b'); adm uuid := tr.mkuser('r4adm', 'admin'); rp uuid; begin
  rp := tr.report(a, b);
  insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rp, b, 'upheld');
  insert into public.community_report_audit_log(report_id, admin_user_id, action) values (rp, adm, 'x');
  begin delete from public.community_user_reports where id = rp; assert false, 'R4 RESTRICT';
  exception when restrict_violation or foreign_key_violation then null; end;
  assert exists (select 1 from public.community_user_reports where id = rp), 'R4 bejelentés megmaradt';
  delete from public.community_report_appeals where report_id = rp;
  delete from public.community_user_reports where id = rp;
  assert not exists (select 1 from public.community_report_audit_log where report_id = rp), 'R4 audit CASCADE a bejelentéssel';
end $$;

-- R5. closed_at: lezáráskor kitöltődik, nem íródik felül, INSERT-nél nem találjuk ki
do $$ declare a uuid := tr.mkuser('r5a'); b uuid := tr.mkuser('r5b'); rp uuid; ap uuid; ap2 uuid; t1 timestamptz; begin
  rp := tr.report(a, b);
  insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rp, b, 'pending') returning id into ap;
  update public.community_report_appeals set status = 'under_review' where id = ap;
  assert (select closed_at is null from public.community_report_appeals where id = ap), 'R5 nyitott: nincs closed_at';
  update public.community_report_appeals set status = 'rejected' where id = ap;
  select closed_at into t1 from public.community_report_appeals where id = ap;
  assert t1 is not null, 'R5 lezáráskor kitöltve';
  update public.community_report_appeals set status = 'upheld', closed_at = closed_at where id = ap;
  assert (select closed_at from public.community_report_appeals where id = ap) = t1, 'R5 nem íródik felül';
  update public.community_report_appeals set admin_response = 'x' where id = ap;
  assert (select closed_at from public.community_report_appeals where id = ap) = t1, 'R5 más mező módosítása nem érinti';
  insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rp, b, 'rejected') returning id into ap2;
  assert (select closed_at is null from public.community_report_appeals where id = ap2), 'R5 INSERT-nél ismeretlen marad';
end $$;

-- R6. delete_own_account: a bejelentett felhasználó (fellebbezés nélkül) törlése sikeres,
--     az ügyirat megmarad; fellebbezővel rendelkező fiók kézi ügy, semmi nem változik
do $$ declare a uuid := tr.mkuser('r6a'); b uuid := tr.mkuser('r6b'); c uuid := tr.mkuser('r6c'); rp uuid; rp2 uuid; r jsonb; begin
  rp := tr.report(a, b);
  perform set_config('request.jwt.claim.sub', b::text, false);
  r := public.delete_own_account(false);
  assert (r->>'ok')::bool, 'R6 ok ' || r::text;
  assert (select reporter_user_id = a and reported_user_id is null from public.community_user_reports where id = rp), 'R6 ügyirat megmaradt';
  assert exists (select 1 from auth.users where id = a), 'R6 más user megmaradt';
  rp2 := tr.report(a, c);
  insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rp2, c, 'rejected');
  perform set_config('request.jwt.claim.sub', c::text, false);
  r := public.delete_own_account(false);
  assert not (r->>'ok')::bool and r->>'state' = 'RECORDS_MANUAL_REVIEW', 'R6 fellebbező kézi ' || r::text;
  assert exists (select 1 from auth.users where id = c) and exists (select 1 from public.community_report_appeals where report_id = rp2 and appellant_user_id = c), 'R6 változatlan';
end $$;

-- R7. legal_hold: a delete_own_account kézi ügyintézésre küldi
do $$ declare a uuid := tr.mkuser('r7a'); b uuid := tr.mkuser('r7b'); r jsonb; begin
  insert into public.community_user_reports(reporter_user_id, reported_user_id, legal_hold) values (a, b, true);
  perform set_config('request.jwt.claim.sub', b::text, false);
  r := public.delete_own_account(false);
  assert not (r->>'ok')::bool and r->'reasons' ? 'legal_hold', 'R7 ' || r::text;
end $$;

select 'ALL community retention SQL TESTS PASSED' as result;
