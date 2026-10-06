-- Védett Útvonal: Historical Sensory Load Engine (community load profiles).
-- Előfeltétel: 20261006/20261007/20261008 community migrációk.
-- Additív: a meglévő nyers report-adatot NEM módosítja (csak egy indexet
-- és egy új, napokra szűkített token-purge függvényt ad hozzá).
--
-- Kétlépcsős modell:
--   vedett_route_community_load_daily    — napi részaggregátum (decay nélkül);
--       a tartós "igazságforrás": nyers reportok később törölhetők, ez marad.
--   vedett_route_community_load_profiles — napi job által (asOf napra) decay-jel
--       újraszámolt profil: hét napja + 15 perces sáv + fajta.
--   vedett_route_community_load_days     — mely szolgáltatási napok vannak már
--       aggregálva (a token-purge és a felzárkóztatás ehhez igazodik).
-- PRIVACY: egyik tábla sem tartalmaz user_id-t, reporter tokent, IP-t,
-- session-azonosítót, trip_id-t vagy koordinátát. RLS fail-closed, policy nincs.

CREATE TABLE IF NOT EXISTS public.vedett_route_community_load_daily (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source               TEXT NOT NULL DEFAULT 'community',
  scope_type           TEXT NOT NULL,
  route_id             TEXT NOT NULL,
  segment_key          TEXT NOT NULL DEFAULT '',
  service_date         DATE NOT NULL,
  weekday              SMALLINT NOT NULL,
  time_bucket          SMALLINT NOT NULL,
  kind                 TEXT NOT NULL,
  sample_count         INTEGER NOT NULL,
  legacy_sample_count  INTEGER NOT NULL DEFAULT 0,
  strength             REAL NOT NULL,
  score_sum            REAL NOT NULL,
  positive_strength    REAL NOT NULL DEFAULT 0,
  negative_strength    REAL NOT NULL DEFAULT 0,
  first_observed_at    TIMESTAMPTZ NOT NULL,
  last_observed_at     TIMESTAMPTZ NOT NULL,
  model_version        SMALLINT NOT NULL DEFAULT 1,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vr_load_daily_source_chk CHECK (source IN ('community', 'bkk_realtime', 'bkk_historical', 'vehicle_profile')),
  CONSTRAINT vr_load_daily_scope_chk CHECK (scope_type IN ('route_segment', 'route')),
  CONSTRAINT vr_load_daily_segment_chk CHECK ((scope_type = 'route') = (segment_key = '')),
  CONSTRAINT vr_load_daily_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT vr_load_daily_bucket_chk CHECK (time_bucket BETWEEN 0 AND 95),
  CONSTRAINT vr_load_daily_kind_chk CHECK (kind IN ('crowding', 'traffic_jam', 'vehicle_stopped', 'service_problem', 'noisy', 'bright_light', 'vibration', 'too_hot')),
  CONSTRAINT vr_load_daily_counts_chk CHECK (sample_count >= 0 AND legacy_sample_count BETWEEN 0 AND sample_count AND strength >= 0 AND score_sum >= 0),
  CONSTRAINT vr_load_daily_len_chk CHECK (char_length(route_id) <= 200 AND char_length(segment_key) <= 401)
);

CREATE UNIQUE INDEX IF NOT EXISTS vr_load_daily_key_idx
  ON public.vedett_route_community_load_daily (source, scope_type, route_id, segment_key, service_date, time_bucket, kind);
-- Profil-újraépítés időablakra + napi újraépítés:
CREATE INDEX IF NOT EXISTS vr_load_daily_service_date_idx
  ON public.vedett_route_community_load_daily (service_date);

CREATE TABLE IF NOT EXISTS public.vedett_route_community_load_profiles (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                     TEXT NOT NULL DEFAULT 'community',
  scope_type                 TEXT NOT NULL,
  route_id                   TEXT NOT NULL,
  segment_key                TEXT NOT NULL DEFAULT '',
  weekday                    SMALLINT NOT NULL,
  day_type                   TEXT NOT NULL,
  time_bucket                SMALLINT NOT NULL,
  kind                       TEXT NOT NULL,
  sample_count               INTEGER NOT NULL,
  distinct_days              INTEGER NOT NULL,
  effective_sample_strength  REAL NOT NULL,
  weighted_score_sum         REAL NOT NULL,
  positive_strength          REAL NOT NULL DEFAULT 0,
  negative_strength          REAL NOT NULL DEFAULT 0,
  expected_score             REAL,
  confidence                 REAL NOT NULL,
  data_quality               TEXT NOT NULL,
  first_observed_at          TIMESTAMPTZ NOT NULL,
  last_observed_at           TIMESTAMPTZ NOT NULL,
  computed_for_date          DATE NOT NULL,
  model_version              SMALLINT NOT NULL DEFAULT 1,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vr_load_profiles_source_chk CHECK (source IN ('community', 'bkk_realtime', 'bkk_historical', 'vehicle_profile')),
  CONSTRAINT vr_load_profiles_scope_chk CHECK (scope_type IN ('route_segment', 'route')),
  CONSTRAINT vr_load_profiles_segment_chk CHECK ((scope_type = 'route') = (segment_key = '')),
  CONSTRAINT vr_load_profiles_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT vr_load_profiles_day_type_chk CHECK (day_type IN ('workday', 'saturday', 'sunday')),
  CONSTRAINT vr_load_profiles_bucket_chk CHECK (time_bucket BETWEEN 0 AND 95),
  CONSTRAINT vr_load_profiles_kind_chk CHECK (kind IN ('crowding', 'traffic_jam', 'vehicle_stopped', 'service_problem', 'noisy', 'bright_light', 'vibration', 'too_hot')),
  CONSTRAINT vr_load_profiles_quality_chk CHECK (data_quality IN ('insufficient', 'low', 'usable', 'strong')),
  CONSTRAINT vr_load_profiles_values_chk CHECK (
    sample_count >= 0 AND distinct_days >= 0 AND effective_sample_strength >= 0
    AND (expected_score IS NULL OR expected_score BETWEEN 0 AND 1)
    AND confidence BETWEEN 0 AND 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vr_load_profiles_key_idx
  ON public.vedett_route_community_load_profiles (source, scope_type, route_id, segment_key, weekday, time_bucket, kind);
-- Expected-load lekérdezés: route(ok) + hét napja + sáv(ok) egyetlen lekérdezésben.
CREATE INDEX IF NOT EXISTS vr_load_profiles_lookup_idx
  ON public.vedett_route_community_load_profiles (route_id, weekday, time_bucket);
-- Elavult profilok törlése a job végén:
CREATE INDEX IF NOT EXISTS vr_load_profiles_updated_idx
  ON public.vedett_route_community_load_profiles (updated_at);

CREATE TABLE IF NOT EXISTS public.vedett_route_community_load_days (
  service_date     DATE PRIMARY KEY,
  report_count     INTEGER NOT NULL DEFAULT 0,
  partial_count    INTEGER NOT NULL DEFAULT 0,
  model_version    SMALLINT NOT NULL DEFAULT 1,
  built_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Napi aggregáció a nyers táblán szolgáltatási nap szerint:
CREATE INDEX IF NOT EXISTS vr_community_reports_service_date_idx
  ON public.vedett_route_community_reports (service_date);

-- Reporter token purge, csak MÁR AGGREGÁLT és az újraépítési ablakon KÍVÜL eső
-- napokra (így egy újraépítés mindig ugyanazzal a dedup-inputtal fut).
CREATE OR REPLACE FUNCTION public.vedett_route_purge_reporter_tokens_before(p_before DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.vedett_route_community_reports r
     SET reporter_scope_token = NULL
   WHERE r.reporter_scope_token IS NOT NULL
     AND r.expires_at < now()
     AND r.service_date < p_before
     AND EXISTS (SELECT 1 FROM public.vedett_route_community_load_days d WHERE d.service_date = r.service_date);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.vedett_route_purge_reporter_tokens_before(DATE) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.vedett_route_community_load_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vedett_route_community_load_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vedett_route_community_load_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedett_route_community_load_daily FROM anon, authenticated;
REVOKE ALL ON public.vedett_route_community_load_profiles FROM anon, authenticated;
REVOKE ALL ON public.vedett_route_community_load_days FROM anon, authenticated;
-- Szándékosan NINCS policy: kliens nem olvas/ír; csak szerver (service_role).
