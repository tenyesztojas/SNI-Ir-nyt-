-- Visszaállítás utáni ellenőrzés (izolált adatbázis): az új objektumok eltűntek,
-- a régiek megvannak. Futtatás: draft -> ROLLBACK.DRAFT -> ez a fájl -> meglévő lifecycle teszt.
do $$ begin
  assert to_regprocedure('public.delete_own_account(boolean)') is null, 'delete_own_account maradt';
  assert to_regprocedure('public.get_account_deletion_state_v2()') is null, 'state_v2 maradt';
  assert to_regprocedure('public._account_deletion_records_check(uuid)') is null, 'records_check maradt';
  assert to_regprocedure('public._account_deletion_family_cleanup(uuid,jsonb)') is null, 'family_cleanup maradt';
  assert to_regclass('public.account_deletion_retention_policy') is null, 'policy tábla maradt';
  assert to_regprocedure('public.prepare_account_deletion(boolean)') is not null, 'régi prepare hiányzik';
end $$;
select 'ROLLBACK CHECK PASSED' as result;
