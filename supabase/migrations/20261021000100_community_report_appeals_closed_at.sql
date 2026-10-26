-- =====================================================================
-- Forrás: docs/account-deletion/migration/20261021000100_community_report_appeals_closed_at.DRAFT.sql
-- (SNI_Iranytu_ios_auth_release, változatlan SQL-tartalommal átvéve).
-- Éles adatbázissal összevetve: 2026-10-26 (függvény- és triggerdefiníciók,
-- FK-szabályok és oszlopok egyeznek). Élesben már telepítve: ott újrafuttatás
-- helyett a migrációs nyilvántartásban rögzítendő.
-- =====================================================================

-- =====================================================================
-- VédettSarok — fellebbezések lezárási időpontja (closed_at)
-- TERVEZET (DRAFT) — NEM FUTTATVA.
-- Ok: a 3 éves megőrzés a fellebbezés LEZÁRÁSÁTÓL számít (KS AT 4.), de a
-- séma nem tárol lezárási időpontot (a reviewed_at „felülvizsgálat időpontja”,
-- nem garantáltan a lezárásé; az alkalmazás jelenleg nem is írja a táblát).
--
-- Megoldás:
--   * új, nullable closed_at oszlop;
--   * trigger: amikor a status NEM lezártból lezártra (upheld/rejected) vált,
--     és closed_at üres -> closed_at = now(). Meglévő értéket nem ír felül.
--   * INSERT-nél NEM állít be időpontot (egy már lezártként felvitt sor
--     lezárási ideje ismeretlen — nem találjuk ki).
--   * Visszamenőleges kitöltés NINCS. A NULL closed_at-ú lezárt fellebbezést
--     a cron megőrzendőnek tekinti (soha nem törli automatikusan).
-- Visszaállítás: drop trigger + drop function + (opcionálisan) drop column.
-- =====================================================================
begin;
set local lock_timeout = '5s';

alter table public.community_report_appeals
  add column if not exists closed_at timestamptz null;

create or replace function public.community_report_appeals_set_closed_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('upheld', 'rejected')
     and old.status is distinct from new.status
     and old.status not in ('upheld', 'rejected')
     and new.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists community_report_appeals_closed_at on public.community_report_appeals;
create trigger community_report_appeals_closed_at
  before update of status on public.community_report_appeals
  for each row execute function public.community_report_appeals_set_closed_at();

commit;

-- VISSZAÁLLÍTÁS (tervezet):
--   drop trigger if exists community_report_appeals_closed_at on public.community_report_appeals;
--   drop function if exists public.community_report_appeals_set_closed_at();
--   alter table public.community_report_appeals drop column if exists closed_at;  -- adatvesztés: lezárási idők!
