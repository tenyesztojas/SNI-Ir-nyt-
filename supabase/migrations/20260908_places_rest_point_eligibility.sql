-- ============================================================
-- Places — Pihenőpont-alkalmassági jelző (rest_point_eligible)
-- Sprint E.1 hotfix, 2026-09-08
-- ============================================================
--
-- OK (staging audit, 2026-09-08): a Sprint E.1 VédettSarok
-- pihenőpont-providere (lib/vedett-route/restStopFlow/discovery/
-- vedettSarokProvider.ts) eredetileg MINDEN "published" places sort
-- automatikusan pihenőpontként ajánlott a hatótávolságon belül —
-- koordinátától és "published" státusztól eltekintve semmilyen más
-- feltételt nem vizsgált. Ez staging teszten egy szemantikailag hibás
-- találatot eredményezett: egy coach/mentor szakember rekordja
-- ("Novák Léna neuroaffirmatív tinicoach, ADHD-mentor") jelent meg
-- "pihenőpontként" — holott egy szolgáltató/szakember profilja NEM
-- ugyanaz, mint egy fizikailag meglátogatható, leülésre/pihenésre
-- alkalmas hely.
--
-- SZABÁLY (a jövőben is kötelező betartani): attól, hogy egy places sor
-- koordinátával rendelkezik és publikált, AUTOMATIKUSAN NEM válik
-- pihenőponttá. A pihenőpont-alkalmasság EXPLICIT, admin/moderációs
-- döntés — SOHA nem következtetés a category mezőből (pl. "kávézó" vs
-- "coach" szöveges egyezés), mert a category egy szabadon bővíthető,
-- adminok által karbantartott tábla (lásd `categories` tábla és
-- lib/data.ts getCategories()), nem egy zárt, kódban biztonságosan
-- kategorizálható enum.
--
-- Lásd még: docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md "O) VédettSarok
-- pihenőpont integrációs terv" szakasza — ez a migráció az ott leírt
-- "3. Kritikus feltétel: egy VédettSarok hely soha nem válik automatikusan
-- pihenőponttá" elvet valósítja meg, a legkönnyebb súlyú lehetséges
-- módon (egy explicit boolean mező a places táblán, NEM egy külön
-- rest_points/external_ref sor-pár — az utóbbi egy jövőbeli, nagyobb
-- sprint terve marad, lásd ugyanott).

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS rest_point_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN places.rest_point_eligible IS
  'Explicit admin/moderációs döntés arról, hogy ez a hely fizikailag '
  'alkalmas és ajánlható pihenőpontként a Védett Útvonal "Pihenőre van '
  'szükségem" funkciójában. Alapértelmezetten FALSE (UNKNOWN != '
  'ELIGIBLE) — SOHA nem szabad a category mezőből vagy bármilyen más '
  'szöveges/kulcsszavas jelből levezetni; kizárólag ez a mező dönt. '
  'Amíg egy admin explicit true-ra nem állítja, a hely nem jelenik meg '
  'a pihenőpont-keresésben, még akkor sem, ha van koordinátája és '
  'published státuszú.';

-- Index a szűréshez (a vedettSarokProvider.ts WHERE rest_point_eligible
-- = true feltétellel dolgozik majd, amikor a lekérdezés a jövőben
-- server-side szűrésre vált a jelenlegi in-memory szűrés helyett —
-- lásd a provider TODO kommentjét).
CREATE INDEX IF NOT EXISTS places_rest_point_eligible_idx
  ON places (rest_point_eligible)
  WHERE rest_point_eligible = true;

-- SZÁNDÉKOSAN NINCS backfill/UPDATE ebben a migrációban — egyetlen
-- meglévő places sor sem válik automatikusan eligible-lé. Egy adminnak
-- explicit, egyenként (vagy egy jövőbeli admin-UI tömeges művelettel)
-- kell minden ténylegesen pihenésre alkalmas helyet megjelölnie, pl.:
--
--   UPDATE places SET rest_point_eligible = true WHERE slug = '...';
--
-- Amíg egyetlen sor sincs megjelölve, a VédettSarok provider 0
-- eredményt ad — ez a SZÁNDÉKOS, biztonságos alapállapot (lásd
-- vedettSarokProvider.ts: "UNKNOWN != ELIGIBLE").
