-- Fióktörlés INGYENES (nem pilot, Plusz-jogosultság nélküli) családban, a
-- 20261030000000 létszámkorlát mellett: gondviselő, majd owner fióktörlése
-- (családtörlés megerősítéssel). Teszt-fixture NINCS: a család a valódi
-- RPC-kkel, az ingyenes korlátokon belül (owner + 1 gondviselő + 1 gyermek) jön létre.
-- FUTTATÁS: KIZÁRÓLAG eldobható scratch adatbázison (lásd scratch_suites.txt).

do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users') > 2 then
    raise exception 'free_family_deletion_test: csak eldobható scratch adatbázison futtatható';
  end if;
end $$;

do $$
declare o uuid := gen_random_uuid(); g uuid := gen_random_uuid(); f uuid; r jsonb; inv uuid;
begin
  insert into auth.users(id, email) values (o, 'free_owner@example.invalid'), (g, 'free_guardian@example.invalid');
  insert into public.profiles(id, display_name, pilot_access) values (o, 'free_owner', array['family_db_beta']), (g, 'free_guardian', '{}');
  perform set_config('request.jwt.claim.sub', o::text, false);
  f := public.create_family_with_owner('ingyenes');
  perform public.create_child_profile_for_family(f, 'Gyerek', null);
  inv := public.invite_family_guardian(f, 'free_guardian@example.invalid');
  perform set_config('request.jwt.claim.sub', g::text, false);
  perform set_config('request.jwt.claim.email', 'free_guardian@example.invalid', false);
  perform public.accept_family_guardian_invitation(inv);
  assert not exists (select 1 from public.family_feature_grants where family_id = f), 'F1 ingyenes család (nincs kiadás)';
  assert (select count(*) from public.family_members where family_id = f and status = 'active') = 2, 'F2 owner + gondviselő';

  -- gondviselő fióktörlése
  r := public.delete_own_account(false);
  assert not exists (select 1 from auth.users where id = g), 'F3 gondviselő törölve: ' || r::text;
  assert exists (select 1 from public.families where id = f), 'F4 a család megmarad';

  -- owner fióktörlése családtörléssel
  perform set_config('request.jwt.claim.sub', o::text, false);
  perform set_config('request.jwt.claim.email', 'free_owner@example.invalid', false);
  r := public.delete_own_account(true);
  assert not exists (select 1 from auth.users where id = o), 'F5 owner törölve: ' || r::text;
  assert not exists (select 1 from public.families where id = f), 'F6 család törölve';
  assert not exists (select 1 from public.child_profiles where created_by = o), 'F7 gyermekprofil törölve';
end $$;

select 'free_family_deletion: F1-F7 OK' as result;
