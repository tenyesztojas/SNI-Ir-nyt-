-- Védett Útvonal: Community Intelligence data foundation (schema_version 2).
-- Előfeltétel: 20261006_vedett_route_community_reports.sql.
-- (A fájlnév dátuma szándékosan 20261007: így lexikálisan ÉS numerikusan is az
-- alap migráció UTÁN fut.)
--
-- Minden report-sor egy ESEMÉNY kontextusát írja le (melyik járat/trip/
-- szakasz, milyen navigációs fázisban), NEM a felhasználó mozgását:
--   - nincs user_id / IP / email / név,
--   - nincs felhasználói GPS-pozíció: a szakasz-koordináták a MOTIS által
--     adott MEGÁLLÓ-koordináták (közlekedési infrastruktúra),
--   - nincs session- vagy eszköz-azonosító, így reportok nem fűzhetők
--     felhasználónkénti útvonallá.
-- RLS változatlanul fail-closed (lásd alap migráció); új policy nincs.

ALTER TABLE public.vedett_route_community_reports
  ADD COLUMN IF NOT EXISTS schema_version     SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intensity          SMALLINT,
  ADD COLUMN IF NOT EXISTS base_confidence    REAL NOT NULL DEFAULT 0.333,
  ADD COLUMN IF NOT EXISTS context_phase      TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS context_source     TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS context_confidence REAL NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS headsign           TEXT,
  ADD COLUMN IF NOT EXISTS segment_from_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS segment_from_lon   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS segment_to_lat     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS segment_to_lon     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_cell           TEXT;

ALTER TABLE public.vedett_route_community_reports
  DROP CONSTRAINT IF EXISTS vr_community_reports_v2_chk;
ALTER TABLE public.vedett_route_community_reports
  ADD CONSTRAINT vr_community_reports_v2_chk CHECK (
    schema_version BETWEEN 1 AND 100
    AND (intensity IS NULL OR intensity BETWEEN 1 AND 3)
    AND base_confidence BETWEEN 0 AND 1
    AND context_confidence BETWEEN 0 AND 1
    AND context_phase IN ('onboard', 'onboard_uncertain', 'transit_leg', 'at_stop', 'walking', 'unknown')
    AND context_source IN ('active_leg', 'next_leg', 'none')
    AND (headsign IS NULL OR char_length(headsign) BETWEEN 1 AND 80)
    AND (segment_from_lat IS NULL OR segment_from_lat BETWEEN -90 AND 90)
    AND (segment_from_lon IS NULL OR segment_from_lon BETWEEN -180 AND 180)
    AND (segment_to_lat IS NULL OR segment_to_lat BETWEEN -90 AND 90)
    AND (segment_to_lon IS NULL OR segment_to_lon BETWEEN -180 AND 180)
    AND ((segment_from_lat IS NULL) = (segment_from_lon IS NULL))
    AND ((segment_to_lat IS NULL) = (segment_to_lon IS NULL))
    AND (geo_cell IS NULL OR char_length(geo_cell) <= 40)
  );

-- ── Indexek a várható lekérdezésekhez ─────────────────────────────────────
-- Friss aktív reportok típus szerint (pl. aktív "dugó" jelzések):
--   WHERE report_type = $1 AND expires_at > now()
CREATE INDEX IF NOT EXISTS vr_community_reports_type_active_idx
  ON public.vedett_route_community_reports (report_type, expires_at DESC);
-- Trip-hez kötött aktív jelzések, csak erősen köthető fázisokra (dugó -> trip):
CREATE INDEX IF NOT EXISTS vr_community_reports_trip_attributable_idx
  ON public.vedett_route_community_reports (trip_id, report_type, expires_at DESC)
  WHERE trip_id IS NOT NULL AND context_phase IN ('onboard', 'onboard_uncertain', 'transit_leg');
-- Tér/idő: durva cella + időrend (realtime közeli jelzések, térbeli hőtérkép).
CREATE INDEX IF NOT EXISTS vr_community_reports_geo_time_idx
  ON public.vedett_route_community_reports (geo_cell, created_at DESC)
  WHERE geo_cell IS NOT NULL;
-- Historikus aggregáció szakasz + hét napja + 15 perces sáv szerint:
CREATE INDEX IF NOT EXISTS vr_community_reports_segment_profile_idx
  ON public.vedett_route_community_reports (segment_key, weekday, time_bucket)
  WHERE segment_key IS NOT NULL;
-- Időablakos batch-aggregáció (append-only tábla -> BRIN olcsó és hatékony):
CREATE INDEX IF NOT EXISTS vr_community_reports_created_brin_idx
  ON public.vedett_route_community_reports USING BRIN (created_at);

-- RLS / jogosultság: változatlan (fail-closed), csak megerősítjük.
ALTER TABLE public.vedett_route_community_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedett_route_community_reports FROM anon, authenticated;
