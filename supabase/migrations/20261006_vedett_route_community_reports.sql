-- Védett Útvonal: Community Reports v1 + Sensory & Traffic Intelligence profil-előkészítés.
--
-- PRIVACY:
--   - NINCS user_id, email, név, IP, koordináta, origin/destination, szabad szöveg.
--   - Csak közlekedési kontextus (route/trip/jármű/megálló-szakasz/járműtípus).
--   - Abuse prevention a szerveren, a meglévő rate limiterrel (rövid életű,
--     nem DB-ben tárolt kulcsokkal), így a historikus adat nem köthető userhez.
--
-- SECURITY (fail-closed):
--   - RLS bekapcsolva, policy NINCS -> anon/authenticated semmit nem lát/ír.
--   - Explicit REVOKE ALL anon/authenticated szerepkörtől.
--   - Írás kizárólag a POST /api/vedett-route/community-reports végponton át,
--     service_role-lal, csak INSERT. Nincs update/delete út a kliensnek.
--   - A lejárt reportokat NEM töröljük (historikus feldolgozáshoz kellenek).

CREATE TABLE IF NOT EXISTS public.vedett_route_community_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_type     TEXT NOT NULL,
  report_category TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'community',
  route_id        TEXT,
  trip_id         TEXT,
  vehicle_id      TEXT,
  direction_id    SMALLINT,
  from_stop_id    TEXT,
  to_stop_id      TEXT,
  segment_key     TEXT,
  vehicle_type    TEXT,
  service_date    DATE NOT NULL,
  time_bucket     SMALLINT NOT NULL,
  weekday         SMALLINT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT vr_community_reports_type_chk CHECK (report_type IN (
    'crowded', 'very_crowded', 'quiet', 'noisy', 'bright_light',
    'vibration', 'too_hot', 'traffic_jam', 'vehicle_stopped', 'service_problem'
  )),
  CONSTRAINT vr_community_reports_category_chk CHECK (report_category IN ('transport', 'sensory')),
  CONSTRAINT vr_community_reports_source_chk CHECK (source = 'community'),
  CONSTRAINT vr_community_reports_direction_chk CHECK (direction_id IS NULL OR direction_id IN (0, 1)),
  CONSTRAINT vr_community_reports_vehicle_type_chk CHECK (vehicle_type IS NULL OR vehicle_type IN (
    'bus', 'trolleybus', 'tram', 'subway', 'suburban_rail', 'rail', 'ferry', 'other'
  )),
  CONSTRAINT vr_community_reports_ids_len_chk CHECK (
    coalesce(char_length(route_id), 0) <= 200 AND coalesce(char_length(trip_id), 0) <= 200 AND
    coalesce(char_length(vehicle_id), 0) <= 200 AND coalesce(char_length(from_stop_id), 0) <= 200 AND
    coalesce(char_length(to_stop_id), 0) <= 200 AND coalesce(char_length(segment_key), 0) <= 401
  ),
  CONSTRAINT vr_community_reports_time_bucket_chk CHECK (time_bucket BETWEEN 0 AND 95),
  CONSTRAINT vr_community_reports_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT vr_community_reports_expiry_chk CHECK (expires_at > created_at AND expires_at <= created_at + interval '2 hours')
);

-- Friss állapot: route + szakasz + lejárat szerinti lekérdezés.
CREATE INDEX IF NOT EXISTS vr_community_reports_route_segment_expires_idx
  ON public.vedett_route_community_reports (route_id, from_stop_id, to_stop_id, expires_at);
CREATE INDEX IF NOT EXISTS vr_community_reports_trip_expires_idx
  ON public.vedett_route_community_reports (trip_id, expires_at) WHERE trip_id IS NOT NULL;
-- Historikus feldolgozás: route + hét napja + 15 perces sáv.
CREATE INDEX IF NOT EXISTS vr_community_reports_profile_idx
  ON public.vedett_route_community_reports (route_id, weekday, time_bucket);
CREATE INDEX IF NOT EXISTS vr_community_reports_created_idx
  ON public.vedett_route_community_reports (created_at);

ALTER TABLE public.vedett_route_community_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedett_route_community_reports FROM anon, authenticated;
-- Szándékosan NINCS policy: minden kliens-hozzáférés tiltott (fail-closed).

-- Forrásfüggetlen historikus profil (route + irány + szakasz + hét napja + 15 perces sáv).
-- Később BKK realtime / BKK historikus-APC / járműprofil is ide írhat (source oszlop).
-- v1-ben nincs ütemezett feltöltés.
CREATE TABLE IF NOT EXISTS public.vedett_route_traffic_profile_buckets (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                        TEXT NOT NULL,
  route_id                      TEXT NOT NULL,
  direction_id                  SMALLINT,
  segment_key                   TEXT,
  weekday                       SMALLINT NOT NULL,
  time_bucket                   SMALLINT NOT NULL,
  crowding_score                REAL,
  noise_score                   REAL,
  light_score                   REAL,
  vibration_score               REAL,
  temperature_discomfort_score  REAL,
  traffic_disruption_score      REAL,
  sample_count                  INTEGER NOT NULL DEFAULT 0,
  confidence                    REAL NOT NULL DEFAULT 0,
  period_start                  DATE,
  period_end                    DATE,
  computed_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vr_traffic_profile_source_chk CHECK (source IN ('community', 'bkk_realtime', 'bkk_historical', 'vehicle_profile')),
  CONSTRAINT vr_traffic_profile_direction_chk CHECK (direction_id IS NULL OR direction_id IN (0, 1)),
  CONSTRAINT vr_traffic_profile_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT vr_traffic_profile_time_bucket_chk CHECK (time_bucket BETWEEN 0 AND 95),
  CONSTRAINT vr_traffic_profile_scores_chk CHECK (
    (crowding_score IS NULL OR crowding_score BETWEEN 0 AND 1) AND
    (noise_score IS NULL OR noise_score BETWEEN 0 AND 1) AND
    (light_score IS NULL OR light_score BETWEEN 0 AND 1) AND
    (vibration_score IS NULL OR vibration_score BETWEEN 0 AND 1) AND
    (temperature_discomfort_score IS NULL OR temperature_discomfort_score BETWEEN 0 AND 1) AND
    (traffic_disruption_score IS NULL OR traffic_disruption_score BETWEEN 0 AND 1)
  ),
  CONSTRAINT vr_traffic_profile_confidence_chk CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT vr_traffic_profile_sample_count_chk CHECK (sample_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS vr_traffic_profile_bucket_key_idx
  ON public.vedett_route_traffic_profile_buckets (
    source, route_id, coalesce(direction_id, -1), coalesce(segment_key, ''), weekday, time_bucket,
    coalesce(period_start, DATE '1970-01-01')
  );

ALTER TABLE public.vedett_route_traffic_profile_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedett_route_traffic_profile_buckets FROM anon, authenticated;
-- Szándékosan NINCS policy (fail-closed); olvasás/írás csak szerveren, service_role-lal.
