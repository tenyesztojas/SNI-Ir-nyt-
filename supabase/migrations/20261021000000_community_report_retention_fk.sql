-- =====================================================================
-- Forrás: docs/account-deletion/migration/20261021000000_community_report_retention_fk.DRAFT.sql
-- (SNI_Iranytu_ios_auth_release; az előfeltétel-ellenőrzés újrafuttathatóvá bővítve).
-- Éles adatbázissal összevetve: 2026-10-26 (függvény- és triggerdefiníciók,
-- FK-szabályok és oszlopok egyeznek). Élesben már telepítve: ott újrafuttatás
-- helyett a migrációs nyilvántartásban rögzítendő.
-- Újrafuttathatóság (családi release): a MÁR ÁTALAKÍTOTT FK-t (SET NULL /
-- RESTRICT) elfogadja és nem cseréli; CASCADE-ról átalakít; minden más szabályt
-- (NO ACTION, SET DEFAULT, ismeretlen) továbbra is hibával elutasít.
-- =====================================================================

-- =====================================================================
-- VédettSarok — közösségi bejelentések megőrzése fióktörléskor (FK-átalakítás)
-- TERVEZET (DRAFT) — NEM FUTTATVA. Ne helyezd supabase/migrations/ alá
-- jóváhagyás és izolált teszt (tests/community_retention_test.sql) előtt.
-- Indoklás: docs/account-deletion/REPORT_RETENTION.md
--
-- VÁLTOZÁSOK (adatot nem ír át, sort nem töröl):
--   1. community_user_reports.reporter_user_id, reported_user_id:
--        DROP NOT NULL + FK: ON DELETE CASCADE -> ON DELETE SET NULL
--        (a fióktörlés nem semmisíti meg az ügyiratot; az anonimizáló cron
--        a reporter_user_id-t NULL-ra állíthatja a csupa nulla UUID helyett).
--   2. community_report_appeals.report_id: ON DELETE CASCADE -> RESTRICT
--        (bejelentés nem törölhető, amíg fellebbezés tartozik hozzá; a cron
--        előbb a már nem megőrzendő fellebbezést törli). Adatot nem törlő irány.
--   VÁLTOZATLAN (döntésre vár, lásd a fájl végét):
--   - community_report_appeals.appellant_user_id: NOT NULL + NO ACTION marad.
--     Fellebbezővel rendelkező fiók törlése így blokkolva (kézi ügyintézés):
--     a fellebbezés a fellebbező azonosítójával együtt megmarad. A pszeudonimizálás
--     (SET NULL) jogi jóváhagyást igényel.
--   - community_report_audit_log.admin_user_id: NOT NULL + NO ACTION marad
--     (admin fiók csak kézi ügyintézéssel törölhető; az auditnapló teljes marad).
--   - community_report_audit_log.report_id: CASCADE marad (megőrzése a
--     bejelentéssel azonos — KS AT 3.).
--   - community_report_appeals.reviewed_by: a korábbi 3 FK-s SET NULL tervezet kezeli.
-- Visszaállítás: a fájl végén (a SET NOT NULL csak NULL értékek nélkül megy).
-- Élesben jelenleg 0 bejelentés van (a felhasználó közlése) — adatmigráció nem kell.
-- =====================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $mig$
declare
  r record;
  v_cnt int;
  v_con text;
  v_rule "char";
  v_target regclass;
begin
  for r in select * from (values
      ('community_user_reports',   'reporter_user_id', 'auth.users',             'c', 'SET NULL', 'n', true),
      ('community_user_reports',   'reported_user_id', 'auth.users',             'c', 'SET NULL', 'n', true),
      ('community_report_appeals', 'report_id',        'community_user_reports', 'c', 'RESTRICT', 'r', false)
    ) as t(tbl, col, ref, expect_rule, new_rule, new_rule_code, drop_not_null)
  loop
    v_target := case when r.ref = 'auth.users' then 'auth.users'::regclass
                     else format('public.%I', r.ref)::regclass end;
    select count(*), min(c.conname), min(c.confdeltype::text)::"char" into v_cnt, v_con, v_rule
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.conrelid = format('public.%I', r.tbl)::regclass
      and c.confrelid = v_target
      and array_length(c.conkey, 1) = 1
      and a.attname = r.col;
    if v_cnt <> 1 then
      raise exception 'Előfeltétel: public.%.% -> % FK száma % (elvárt 1)', r.tbl, r.col, r.ref, v_cnt;
    end if;
    -- Már a célállapotban (korábbi kézi/éles telepítés): nem cserélünk FK-t.
    -- A SET NULL-hoz nullable oszlop kell; a DROP NOT NULL idempotens.
    if v_rule = r.new_rule_code::"char" then
      if r.drop_not_null then
        execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
      end if;
      raise notice '%.% (%): már % — kihagyva', r.tbl, r.col, v_con, r.new_rule;
      continue;
    end if;
    if v_rule <> r.expect_rule::"char" then
      raise exception 'Előfeltétel: public.%.% (%) ON DELETE szabálya % (elvárt CASCADE vagy %)', r.tbl, r.col, v_con, v_rule, r.new_rule;
    end if;

    if r.drop_not_null then
      execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    end if;
    execute format('alter table public.%I drop constraint %I', r.tbl, v_con);
    execute format('alter table public.%I add constraint %I foreign key (%I) references %s (id) on delete %s',
                   r.tbl, v_con, r.col, v_target::text, r.new_rule);
    raise notice '%.% (%): CASCADE -> %', r.tbl, r.col, v_con, r.new_rule;
  end loop;

  -- Utófeltétel
  select count(*) into v_cnt from pg_constraint c
   where c.contype = 'f' and c.conrelid = 'public.community_user_reports'::regclass
     and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'n';
  if v_cnt <> 2 then raise exception 'Utófeltétel: community_user_reports SET NULL FK-k száma %', v_cnt; end if;
  select count(*) into v_cnt from pg_constraint c
   where c.contype = 'f' and c.conrelid = 'public.community_report_appeals'::regclass
     and c.confrelid = 'public.community_user_reports'::regclass and c.confdeltype = 'r';
  if v_cnt <> 1 then raise exception 'Utófeltétel: appeals.report_id RESTRICT hiányzik'; end if;
end
$mig$;

commit;

-- ---------------------------------------------------------------------
-- DÖNTÉSRE VÁR (NEM aktív): fellebbező pszeudonimizálása fióktörléskor
--   alter table public.community_report_appeals alter column appellant_user_id drop not null;
--   -- + FK csere ON DELETE SET NULL-ra (ugyanazzal a mintával)
-- Csak jogi jóváhagyás után; addig a fellebbezővel rendelkező fiók törlése kézi ügy.
-- ---------------------------------------------------------------------
-- VISSZAÁLLÍTÁS (tervezet):
--   * appeals.report_id -> ON DELETE CASCADE (FK csere ugyanazzal a névvel)
--   * reporter/reported -> ON DELETE CASCADE
--   * SET NOT NULL csak akkor, ha nincs NULL érték:
--       select count(*) from public.community_user_reports
--        where reporter_user_id is null or reported_user_id is null;  -- 0 kell
-- ---------------------------------------------------------------------
