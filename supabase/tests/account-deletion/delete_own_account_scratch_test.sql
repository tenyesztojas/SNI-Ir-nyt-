-- =====================================================================
-- delete_own_account — IZOLÁLT SQL-TESZTEK (szintetikus felhasználók)
-- FUTTATÁS KIZÁRÓLAG eldobható adatbázison, ebben a sorrendben:
--   1. supabase/tests/_bootstrap_stub.sql
--   2. a Family-migrációk (20260926 … 20261003) + 20261004_account_deletion_lifecycle.sql
--   3. docs/account-deletion/tests/delete_own_account_stubs.sql
--   4. docs/account-deletion/migration/20261020000000_delete_own_account.DRAFT.sql
--   5. EZ a fájl
-- Minden ellenőrzés assert; az első hiba megállítja a futást.
-- Valódi adat, valódi felhasználó, titkos kulcs NINCS.
-- =====================================================================

create schema if not exists td;
create or replace function td.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
create or replace function td.mkuser(n text, r text default 'user') returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid(); begin
  insert into auth.users(id, email) values (u, n || '@example.invalid');
  insert into public.profiles(id, display_name, role) values (u, n, r);
  insert into auth.identities(user_id, provider) values (u, 'email');
  insert into auth.sessions(user_id) values (u);
  return u; end $$;
create or replace function td.mkfamily(owner_id uuid, nchildren int) returns uuid language plpgsql as $$
declare f uuid; c uuid; i int; begin
  insert into public.families(name, created_by) values ('fam', owner_id) returning id into f;
  insert into public.family_members(family_id, user_id, role, status) values (f, owner_id, 'owner', 'active');
  for i in 1..nchildren loop
    insert into public.child_profiles(first_name, created_by) values ('kid' || i, owner_id) returning id into c;
    insert into public.family_children(family_id, child_id) values (f, c);
    insert into public.child_schedule_items(child_id, title, schedule_type, time_local, start_date, origin_label, origin_lat, origin_lon)
      values (c, 'iskola', 'one_time', '08:00', '2026-10-05', 'otthon', 47.5, 19.0);
  end loop; return f; end $$;
create or replace function td.set_policy(k text, a text) returns void language sql as $$
  update public.account_deletion_retention_policy set action = a, decided_by = 'TESZT', decided_at = now() where rule_key = k $$;
create or replace function td.reset_policies() returns void language sql as $$
  update public.account_deletion_retention_policy
     set action = case when rule_key = 'admin_metadata_nullable' then 'set_null' else 'manual' end,
         decided_by = null, decided_at = null $$;
create or replace function td.place() returns uuid language sql as $$
  insert into public.places default values returning id $$;
create or replace function td.review(p uuid) returns uuid language sql as $$
  insert into public.reviews(place_id) values (p) returning id $$;
-- Ujjlenyomat: minden, a userhez vagy a Familyjéhez kötődő sor száma
create or replace function td.fp(u uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'auth', (select count(*) from auth.users where id = u),
    'profile', (select count(*) from public.profiles where id = u),
    'identities', (select count(*) from auth.identities where user_id = u),
    'sessions', (select count(*) from auth.sessions where user_id = u),
    'members', (select count(*) from public.family_members where user_id = u),
    'families', (select count(*) from public.families where created_by = u),
    'children', (select count(*) from public.child_profiles where created_by = u),
    'schedule', (select count(*) from public.child_schedule_items s join public.child_profiles c on c.id = s.child_id where c.created_by = u),
    'claims', (select count(*) from public.place_claims where claimant_user_id = u),
    'responses', (select count(*) from public.place_responses where responder_user_id = u),
    'msg_sent', (select count(*) from public.messages where sender_user_id = u),
    'msg_recv', (select count(*) from public.messages where recipient_user_id = u),
    'consent', (select count(*) from public.consent_log where user_id = u),
    'appeals', (select count(*) from public.community_report_appeals where appellant_user_id = u),
    'reports', (select count(*) from public.community_user_reports where reporter_user_id = u or reported_user_id = u)) $$;

select td.reset_policies();

-- 1. Egyszerű felhasználó: automatikus törlés; auth + profil + identities + sessions eltűnik
do $$ declare u uuid := td.mkuser('plain'); r jsonb; begin
  perform td.as_user(u);
  assert public.get_account_deletion_state_v2()->>'state' = 'READY', '1 state';
  r := public.delete_own_account(false);
  assert (r->>'ok')::bool, '1 ok ' || r::text;
  assert not exists (select 1 from auth.users where id = u), '1 auth';
  assert not exists (select 1 from public.profiles where id = u), '1 profile';
  assert not exists (select 1 from auth.identities where user_id = u), '1 identities (CASCADE)';
  assert not exists (select 1 from auth.sessions where user_id = u), '1 sessions (CASCADE)';
end $$;

-- 2. Sole owner egyszerű Familyvel: megerősítés nélkül semmi; megerősítéssel minden egy tranzakcióban
do $$ declare o uuid := td.mkuser('o2'); f uuid := td.mkfamily(o, 2); r jsonb; before jsonb; begin
  perform td.as_user(o); before := td.fp(o);
  r := public.delete_own_account(false);
  assert not (r->>'ok')::bool and r->>'state' = 'SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED', '2a ' || r::text;
  assert td.fp(o) = before, '2a semmi nem változott';
  r := public.delete_own_account(true);
  assert (r->>'ok')::bool and (r->>'deleted_families')::int = 1 and (r->>'deleted_children')::int = 2, '2b ' || r::text;
  assert not exists (select 1 from public.families where id = f), '2b family';
  assert not exists (select 1 from auth.users where id = o), '2b auth';
end $$;

-- 3. *** RÉSZLEGES ADATVESZTÉS ELLENI ROLLBACK-TESZT ***
--    Sole owner + Family + egy ISMERETLEN (új) NO ACTION FK-n blokkoló sor.
--    Elvárás: strukturált RECORDS_MANUAL_REVIEW, és a Family, gyerekek,
--    tagság, auth user, profil, identities/sessions BITRE AZONOS marad.
create table public.zz_future_blocker (id serial primary key, user_id uuid not null references auth.users(id));
do $$ declare o uuid := td.mkuser('o3'); f uuid := td.mkfamily(o, 2); r jsonb; before jsonb; begin
  insert into public.zz_future_blocker(user_id) values (o);
  perform td.as_user(o); before := td.fp(o);
  r := public.delete_own_account(true);
  assert not (r->>'ok')::bool, '3 nem ok';
  assert r->>'state' = 'RECORDS_MANUAL_REVIEW' and r->'reasons' ? 'db_constraint', '3 state ' || r::text;
  assert r->>'blocked_by' = 'zz_future_blocker.zz_future_blocker_user_id_fkey', '3 blocked_by ' || r::text;
  assert r->>'sqlstate' = '23503', '3 sqlstate';
  assert td.fp(o) = before, '3 TELJES ROLLBACK: ' || td.fp(o)::text || ' vs ' || before::text;
  assert exists (select 1 from public.families where id = f), '3 family megmaradt';
  assert (select count(*) from public.family_children where family_id = f) = 2, '3 gyerekek megmaradtak';
  -- a blokkoló sor eltávolítása után ugyanaz a hívás sikeres
  delete from public.zz_future_blocker where user_id = o;
  r := public.delete_own_account(true);
  assert (r->>'ok')::bool and not exists (select 1 from auth.users where id = o), '3 utána ok';
end $$;
drop table public.zz_future_blocker;

-- 4. Alapértelmezett (konzervatív) policy: minden ismert, döntést igénylő
--    rekordtípus KÉZI ügyintézés, és semmi nem módosul.
do $$ declare u uuid; other uuid := td.mkuser('other4'); p uuid := td.place(); rv uuid := td.review(p);
  rep uuid; r jsonb; before jsonb; k text; begin
  for k in select unnest(array['place_claims','place_responses','messages_sent','messages_received','consent_log','appeals_closed']) loop
    u := td.mkuser('u4_' || k);
    if k = 'place_claims' then insert into public.place_claims(place_id, claimant_user_id) values (p, u);
    elsif k = 'place_responses' then insert into public.place_responses(review_id, place_id, responder_user_id) values (rv, p, u);
    elsif k = 'messages_sent' then insert into public.messages(place_id, sender_user_id, recipient_user_id) values (p, u, other);
    elsif k = 'messages_received' then insert into public.messages(place_id, sender_user_id, recipient_user_id) values (p, other, u);
    elsif k = 'consent_log' then insert into public.consent_log(user_id, place_id) values (u, p);
    elsif k = 'appeals_closed' then
      insert into public.community_user_reports(reporter_user_id, reported_user_id, status) values (other, u, 'resolved_warning_sent') returning id into rep;
      insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rep, u, 'rejected');
    end if;
    perform td.as_user(u); before := td.fp(u);
    assert public.get_account_deletion_state_v2()->>'state' = 'RECORDS_MANUAL_REVIEW', '4 state ' || k;
    r := public.delete_own_account(true);
    assert not (r->>'ok')::bool and r->'reasons' ? k, '4 ' || k || ' ' || r::text;
    assert td.fp(u) = before, '4 változatlan ' || k;
  end loop;
end $$;

-- 5. KEMÉNY szabályok (policy-tól függetlenül): admin, admin-auditnapló,
--    akadémiai forrásdokumentum, nyitott fellebbezés, legal hold
do $$ declare adm uuid := td.mkuser('adm5', 'admin'); exadm uuid := td.mkuser('exadm5'); upl uuid := td.mkuser('upl5');
  ap uuid := td.mkuser('ap5'); lh uuid := td.mkuser('lh5'); x uuid := td.mkuser('x5'); rep uuid; r jsonb; begin
  perform td.set_policy('appeals_closed', 'pseudonymize');   -- a nyitott fellebbezést ez sem engedheti
  insert into public.community_user_reports(reporter_user_id, reported_user_id) values (x, ap) returning id into rep;
  insert into public.community_report_audit_log(report_id, admin_user_id) values (rep, exadm);
  insert into public.academy_source_documents(uploaded_by) values (upl);
  insert into public.community_report_appeals(report_id, appellant_user_id, status) values (rep, ap, 'under_review');
  insert into public.community_user_reports(reporter_user_id, reported_user_id, legal_hold) values (x, lh, true);
  perform td.as_user(adm); r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->'reasons' ? 'admin_account', '5 admin';
  perform td.as_user(exadm); r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->'reasons' ? 'admin_audit_log', '5 audit';
  perform td.as_user(upl); r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->'reasons' ? 'academy_source_documents', '5 academy';
  perform td.as_user(ap); r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->'reasons' ? 'appeal_open', '5 open appeal';
  perform td.as_user(lh); r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->'reasons' ? 'legal_hold', '5 legal hold';
  assert (select count(*) from auth.users where id in (adm, exadm, upl, ap, lh)) = 5, '5 mind megmaradt';
  perform td.reset_policies();
end $$;

-- 6. 'pseudonymize' policy a szükséges DROP NOT NULL NÉLKÜL: not_null_violation
--    -> strukturált kézi ügyintézés + TELJES rollback (konfigurációs hiba sem okoz részleges törlést)
do $$ declare u uuid := td.mkuser('u6'); other uuid := td.mkuser('o6'); p uuid := td.place(); f uuid; r jsonb; before jsonb; begin
  f := td.mkfamily(u, 1);
  insert into public.messages(place_id, sender_user_id, recipient_user_id) values (p, other, u);
  perform td.set_policy('messages_received', 'pseudonymize');
  perform td.as_user(u); before := td.fp(u);
  r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->>'sqlstate' = '23502', '6 not null ' || r::text;
  assert td.fp(u) = before and exists (select 1 from public.families where id = f), '6 teljes rollback';
  perform td.reset_policies();
end $$;

-- 7. Döntések után (delete / set_null / pseudonymize + DROP NOT NULL):
--    a felhasználó MIND a 9 nem-kemény kapcsolatban szerepel; a törlés sikeres,
--    és MÁS felhasználók adatai megmaradnak.
alter table public.messages alter column recipient_user_id drop not null;
alter table public.consent_log alter column user_id drop not null;
alter table public.community_report_appeals alter column appellant_user_id drop not null;
do $$ declare u uuid := td.mkuser('u7'); b uuid := td.mkuser('b7'); adm uuid := td.mkuser('adm7'); p uuid := td.place();
  rv uuid := td.review(p); resp uuid; rep uuid; rep_b uuid; pr uuid; pp uuid; r jsonb; m_b uuid; m_u uuid; begin
  perform td.set_policy('place_claims', 'delete');
  perform td.set_policy('place_responses', 'delete');
  perform td.set_policy('messages_sent', 'delete');
  perform td.set_policy('messages_received', 'pseudonymize');
  perform td.set_policy('consent_log', 'revoke_pseudonymize');
  perform td.set_policy('appeals_closed', 'pseudonymize');
  -- u saját rekordjai
  insert into public.place_claims(place_id, claimant_user_id, verification_data) values (p, u, 'x@ceg.invalid');
  insert into public.place_responses(review_id, place_id, responder_user_id) values (rv, p, u) returning id into resp;
  insert into public.reports(place_id, reported_by, response_id) values (p, b, resp);         -- b bejelentése u válaszára
  insert into public.messages(place_id, sender_user_id, recipient_user_id) values (p, u, b) returning id into m_u;
  insert into public.messages(place_id, sender_user_id, recipient_user_id) values (p, b, u) returning id into m_b;
  insert into public.consent_log(user_id, place_id) values (u, p);
  insert into public.community_user_reports(reporter_user_id, reported_user_id, status) values (b, u, 'resolved_no_action') returning id into rep;
  insert into public.community_report_appeals(report_id, appellant_user_id, status, reviewed_by) values (rep, u, 'upheld', adm);
  -- u mint (volt) felülvizsgáló MÁS felhasználók rekordjain (nullable admin-metaadat)
  insert into public.community_user_reports(reporter_user_id, reported_user_id) values (u, b) returning id into rep_b;
  insert into public.provider_registrations(user_id, reviewed_by) values (b, u) returning id into pr;
  insert into public.provider_profiles(user_id, registration_id) values (b, pr) returning id into pp;
  insert into public.academy_partner_settings(partner_id, annual_confirmed_at, annual_confirmed_by) values (pp, now(), u);
  -- b saját adatai, amelyeknek meg kell maradniuk
  insert into public.place_claims(place_id, claimant_user_id) values (p, b);
  insert into public.consent_log(user_id, place_id) values (b, p);

  perform td.as_user(u);
  r := public.delete_own_account(false);
  assert (r->>'ok')::bool, '7 ok ' || r::text;
  assert not exists (select 1 from auth.users where id = u), '7 auth törölve';
  assert not exists (select 1 from public.place_claims where claimant_user_id = u), '7 claim';
  assert not exists (select 1 from public.place_responses where id = resp), '7 response';
  assert exists (select 1 from public.reports where reported_by = b and response_id is null), '7 b bejelentése megmaradt (SET NULL)';
  assert not exists (select 1 from public.messages where id = m_u), '7 u küldött üzenete törölve';
  assert exists (select 1 from public.messages where id = m_b and recipient_user_id is null and sender_user_id = b), '7 b üzenete megmaradt, pszeudonimizálva';
  assert exists (select 1 from public.consent_log where user_id is null and revoked_at is not null), '7 consent visszavonva+pszeudonim';
  -- FONTOS MEGÁLLAPÍTÁS: a fellebbező mindig a bejelentett user, és a
  -- community_user_reports.reported_user_id ON DELETE CASCADE — ezért a
  -- report ÉS a (pszeudonimizált) fellebbezés a meglévő séma miatt törlődik.
  -- A 3 éves megőrzés így NEM teljesül; döntés kell (E3), lásd a dokumentációt.
  -- A REPORT_RETENTION FK-migráció (20261021000000) után a bejelentés SET NULL-lal
  -- megmarad, így a pszeudonimizált fellebbezés is; előtte CASCADE-del törlődik.
  if exists (select 1 from pg_constraint where conrelid = 'public.community_user_reports'::regclass
             and confrelid = 'auth.users'::regclass and confdeltype = 'n') then
    assert exists (select 1 from public.community_report_appeals where report_id = rep and appellant_user_id is null), '7 appeal megmaradt (retention FK)';
  else
    assert not exists (select 1 from public.community_report_appeals where report_id = rep), '7 appeal a report CASCADE-jével törlődött (dokumentált)';
  end if;
  assert exists (select 1 from public.provider_registrations where id = pr and user_id = b and reviewed_by is null), '7 b regisztrációja megmaradt';
  assert exists (select 1 from public.academy_partner_settings where partner_id = pp and annual_confirmed_by is null and annual_confirmed_at is not null), '7 partner beállítás megmaradt';
  assert exists (select 1 from public.place_claims where claimant_user_id = b), '7 b claim megmaradt';
  assert exists (select 1 from public.consent_log where user_id = b), '7 b consent megmaradt';
  assert exists (select 1 from auth.users where id = b) and exists (select 1 from auth.users where id = adm), '7 más userek megmaradtak';
  perform td.reset_policies();
end $$;

-- 7b. DOKUMENTÁLT MELLÉKHATÁS: a community_user_reports reporter/reported FK-ja
--     CASCADE (meglévő séma) — a user törlésekor a róla szóló / általa tett,
--     legal_hold NÉLKÜLI bejelentések és azok fellebbezései is törlődnek.
do $$ declare u uuid := td.mkuser('u7b'); b uuid := td.mkuser('b7b'); rep uuid; r jsonb; begin
  insert into public.community_user_reports(reporter_user_id, reported_user_id) values (b, u) returning id into rep;
  perform td.as_user(u); r := public.delete_own_account(false);
  if exists (select 1 from pg_constraint where conrelid = 'public.community_user_reports'::regclass
             and confrelid = 'auth.users'::regclass and confdeltype = 'n') then
    assert (r->>'ok')::bool and exists (select 1 from public.community_user_reports where id = rep and reported_user_id is null and reporter_user_id = b), '7b megmaradt (retention FK)';
  else
    assert (r->>'ok')::bool and not exists (select 1 from public.community_user_reports where id = rep), '7b CASCADE (meglévő viselkedés)';
  end if;
end $$;

-- 8. Guardian egy MÁSIK Familyben: a másik Family, gyerekei, más guardian jogai megmaradnak
do $$ declare o uuid := td.mkuser('o8'); g uuid := td.mkuser('g8'); g2 uuid := td.mkuser('g8b'); f uuid := td.mkfamily(o, 1); c uuid; r jsonb; begin
  select child_id into c from public.family_children where family_id = f;
  insert into public.family_members(family_id, user_id, role, status) values (f, g, 'guardian', 'active'), (f, g2, 'guardian', 'active');
  insert into public.guardian_child_permissions(child_id, guardian_user_id, can_view_schedule) values (c, g, true), (c, g2, true);
  perform td.as_user(g); r := public.delete_own_account(false);
  assert (r->>'ok')::bool and r->>'state' = 'GUARDIAN_READY', '8 ' || r::text;
  assert exists (select 1 from public.families where id = f) and exists (select 1 from public.child_profiles where id = c), '8 family+gyerek';
  assert exists (select 1 from public.guardian_child_permissions where child_id = c and guardian_user_id = g2), '8 másik guardian joga';
  assert exists (select 1 from public.family_members where user_id = o and role = 'owner'), '8 owner tagság';
end $$;

-- 9. Owner-átadás szükséges / gyermekfiók: a meglévő kézi állapotok változatlanok, semmi nem törlődik
do $$ declare o uuid := td.mkuser('o9'); g uuid := td.mkuser('g9'); f uuid := td.mkfamily(o, 1); r jsonb; before jsonb; begin
  insert into public.family_members(family_id, user_id, role, status) values (f, g, 'guardian', 'active');
  perform td.as_user(o); before := td.fp(o);
  r := public.delete_own_account(true);
  assert not (r->>'ok')::bool and r->>'state' = 'OWNER_TRANSFER_REQUIRED', '9 ' || r::text;
  assert td.fp(o) = before, '9 változatlan';
end $$;

-- 10. Sole owner auth-törlése cleanup NÉLKÜL továbbra is tiltott (a trigger védelme él)
do $$ declare o uuid := td.mkuser('o10'); f uuid := td.mkfamily(o, 1); begin
  begin delete from auth.users where id = o; assert false, '10 direct'; exception when others then assert sqlerrm like 'Egy family nem maradhat%', sqlerrm; end;
end $$;

-- 11. Jogosultságok
do $$ declare u uuid := td.mkuser('u11'); r jsonb; begin
  set local role anon;
  begin perform public.delete_own_account(false); assert false, 'anon delete'; exception when insufficient_privilege then null; end;
  begin perform public.get_account_deletion_state_v2(); assert false, 'anon state'; exception when insufficient_privilege then null; end;
  set local role authenticated;
  begin perform public._account_deletion_records_check(u); assert false, 'internal1'; exception when insufficient_privilege then null; end;
  begin perform public._account_deletion_family_cleanup(u, '{}'); assert false, 'internal2'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.account_deletion_retention_policy; assert false, 'policy read'; exception when insufficient_privilege then null; end;
  -- authenticated szerepkörrel a saját törlés működik
  perform set_config('request.jwt.claim.sub', u::text, false);
  r := public.delete_own_account(false);
  assert (r->>'ok')::bool, '11 authenticated ok';
  reset role;
  assert not exists (select 1 from auth.users where id = u), '11 törölve';
end $$;

-- 12. Nincs session -> kivétel, semmi nem törlődik
do $$ begin
  perform td.as_user(null);
  begin perform public.delete_own_account(true); assert false, '12'; exception when others then assert sqlerrm like 'Bejelentkezés%', sqlerrm; end;
end $$;

-- 13. A policy-tábla nem enged meg nem engedélyezett akciót
do $$ begin
  begin perform td.set_policy('consent_log', 'cascade_all'); assert false, '13'; exception when check_violation then null; end;
end $$;

select 'ALL delete_own_account SCRATCH TESTS PASSED' as result;
