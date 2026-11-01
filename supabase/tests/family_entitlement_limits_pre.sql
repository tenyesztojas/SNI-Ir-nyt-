-- Előkészítés a family_entitlement_limits_test.sql-hez: egy "pilot" család,
-- amely a 20261030000000 migráció ELŐTT létezik (a migráció előtt futtatandó).
-- KIZÁRÓLAG eldobható (scratch) adatbázison.
do $$
declare o uuid := gen_random_uuid(); f uuid;
begin
  insert into auth.users(id, email) values (o, 'pilot_owner@t.hu');
  insert into public.profiles(id, display_name, pilot_access) values (o, 'pilot_owner', array['family_db_beta']);
  insert into public.families(name, created_by) values ('pilot', o) returning id into f;
  insert into public.family_members(family_id, user_id, role, status) values (f, o, 'owner', 'active');
end $$;
