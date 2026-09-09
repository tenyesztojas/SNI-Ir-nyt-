-- ============================================================
-- Védett Útvonal — ZÁRT BÉTA HOZZÁFÉRÉS (2026-09-09)
-- ============================================================
--
-- Ez a migráció NEM hoz létre új permission/feature-access rendszert —
-- a projektben MÁR LÉTEZŐ, generikus pilot/béta-modul mechanizmust
-- (public.profiles.pilot_access text[] tömb, lásd app/admin/tesztelok/)
-- használja újra a "vedett_route_beta" kulccsal (lásd
-- lib/vedett-route/config.ts VEDETT_ROUTE_BETA_FEATURE_KEY).
--
-- Ez a fájl SZÁNDÉKOSAN NINCS automatikusan alkalmazva a remote adatbázisra
-- — csak létrehozva és auditálva. Kézi `supabase db push` (vagy a projekt
-- szokásos migrációs folyamata) szükséges az alkalmazásához, egy erre
-- jogosult ember jóváhagyásával.
--
-- Tartalom:
--   1) `pilot_access` oszlop idempotens biztosítása (reprodukálhatóság —
--      az oszlop eredetileg a Supabase dashboardon/SQL editoron keresztül
--      lett létrehozva, NEM egy korábbi migrációban, lásd audit jegyzet
--      lent).
--   2) BIZTONSÁGI JAVÍTÁS: a `pilot_access` oszlopot védő trigger, ami
--      megakadályozza, hogy egy nem-admin felhasználó saját magának
--      béta-hozzáférést adjon (ugyanaz a minta, mint a MÁR LÉTEZŐ
--      `prevent_role_self_escalation()` a `role` oszlopra — lásd
--      supabase/schema.sql).
--   3) Opcionális GIN index a `pilot_access` tömbön, az admin
--      `listPilotTesters()` (.contains() lekérdezés) teljesítményéhez.
--   4) Rollback dokumentáció (lent, kommentként).
--
-- AUDIT JEGYZET (Section 1/4 — "Ha már van hasonló adatmodell: NE hozz
-- létre duplikációt"): a `feature_access_grants` tábla (a specifikációban
-- javasolt modell) NEM készül el, mert a `profiles.pilot_access` tömb már
-- pontosan ugyanezt a célt szolgálja 3 másik pilot modulhoz
-- (vedett-jelzes, vedett-partner, vedettmunka), admin UI-val
-- (/admin/tesztelok) és menü-gating logikával (HeaderClient.tsx) együtt.
-- Trade-off, amit ez a döntés jelent: nincs per-grant `expires_at` mező
-- (egyik meglévő pilot modulnak sincs ilyenje sem) — ha ez a jövőben
-- szükségessé válik, egy KÜLÖN, additív migráció adhatja hozzá anélkül,
-- hogy ez az újrahasznosítási döntés érvénytelenné válna.

-- ------------------------------------------------------------
-- 1) `pilot_access` oszlop idempotens biztosítása
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists pilot_access text[] not null default '{}';

-- ------------------------------------------------------------
-- 2) BIZTONSÁGI JAVÍTÁS — self-escalation védelem a pilot_access oszlopra
-- ------------------------------------------------------------
-- Talált probléma: a "profiles_update_own" RLS policy (lásd
-- supabase/schema.sql) `using (id = auth.uid() or public.is_admin())`
-- feltétellel enged UPDATE-et a saját sorra, de NINCS `with check`
-- oszlop-szintű megszorítása. A `role` oszlopot MÁR védi a
-- `prevent_role_self_escalation()` trigger — a `pilot_access` oszlopot
-- viszont eddig SEMMI nem védte, tehát bármely bejelentkezett
-- felhasználó egy közvetlen kliens oldali Supabase update hívással saját
-- magának adhatott volna bármilyen pilot modult (a most bevezetett
-- "vedett_route_beta"-t is beleértve). Ez a trigger ezt zárja le, a
-- meglévő role-védelemmel TELJESEN analóg mintát követve.
create or replace function public.prevent_pilot_access_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() NULL, ha nincs Supabase Auth JWT-kontextus (pl. SQL Editor /
  -- service_role kulcs, admin szerver akció createAdminClient()-en
  -- keresztül) — ilyenkor engedjük a változást, mert a
  -- setPilotAccess()/listPilotTesters() szerver akciók MÁR ELVÉGZIK a
  -- saját `isCurrentUserAdmin()` ellenőrzésüket a hívás előtt (lásd
  -- app/admin/tesztelok/actions.ts). Az alkalmazáson keresztül, a
  -- felhasználó saját JWT-jével (auth.uid() nem NULL) viszont csak admin
  -- módosíthatja BÁRKI pilot_access-ét — sima felhasználó a sajátját sem.
  if new.pilot_access is distinct from old.pilot_access
     and auth.uid() is not null
     and not public.is_admin() then
    new.pilot_access = old.pilot_access;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_pilot_access_escalation on public.profiles;
create trigger profiles_prevent_pilot_access_escalation before update on public.profiles
  for each row execute function public.prevent_pilot_access_self_escalation();

-- ------------------------------------------------------------
-- 3) GIN index — .contains("pilot_access", [key]) lekérdezésekhez
--    (app/admin/tesztelok/actions.ts listPilotTesters())
-- ------------------------------------------------------------
create index if not exists profiles_pilot_access_gin_idx
  on public.profiles using gin (pilot_access);

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Ez a migráció additív és nem-destruktív (nem töröl adatot, nem
-- módosít meglévő oszlopot/típust). Visszavonás esetén, EBBEN A
-- SORRENDBEN:
--
--   drop index if exists public.profiles_pilot_access_gin_idx;
--   drop trigger if exists profiles_prevent_pilot_access_escalation on public.profiles;
--   drop function if exists public.prevent_pilot_access_self_escalation();
--
-- A `pilot_access` oszlopot NEM javasolt visszavonáskor eldobni (`drop
-- column`), mert azt a MÁR LÉTEZŐ 3 pilot modul (vedett-jelzes,
-- vedett-partner, vedettmunka) is használja — ez a migráció csak
-- idempotensen BIZTOSÍTOTTA a létezését, nem ő hozta létre eredetileg.
