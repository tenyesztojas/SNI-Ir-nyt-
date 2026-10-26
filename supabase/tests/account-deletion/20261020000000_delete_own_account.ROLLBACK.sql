-- =====================================================================
-- VISSZAÁLLÍTÁS — 20261020000000_delete_own_account (TERVEZET, NEM FUTTATVA)
-- A migráció additív, adatot nem módosított, ezért a visszaállítás az új
-- objektumok eldobása. A régi prepare_account_deletion / get_account_deletion_state
-- érintetlen, a régi API-folyamat a visszaállítás után is működik.
--
-- ELŐFELTÉTEL: az API már NEM hívja a delete_own_account / get_account_deletion_state_v2
-- RPC-t (különben a hívások 404/42883 hibát adnak).
--
-- FIGYELEM: a delete_own_account által MÁR végrehajtott fióktörlések NEM
-- állíthatók vissza ezzel a scripttel (csak mentésből / PITR-ből).
-- A policy-tábla eldobása előtt mentsd a döntési rekordokat (lásd 1. lépés).
-- =====================================================================
begin;
set local lock_timeout = '5s';

-- 1. (opcionális, csak olvasás) a döntések archiválása eldobás előtt:
--    select * from public.account_deletion_retention_policy order by rule_key;

drop function if exists public.delete_own_account(boolean);
drop function if exists public.get_account_deletion_state_v2();
drop function if exists public._account_deletion_family_cleanup(uuid, jsonb);
drop function if exists public._account_deletion_records_check(uuid);
drop table if exists public.account_deletion_retention_policy;

-- Utóellenőrzés: a régi függvények megvannak
do $$
begin
  if to_regprocedure('public.prepare_account_deletion(boolean)') is null
     or to_regprocedure('public.get_account_deletion_state()') is null
     or to_regprocedure('public._account_deletion_classify(uuid)') is null then
    raise exception 'A régi fióktörlési függvények hiányoznak — visszaállítás megszakítva';
  end if;
end $$;
commit;
