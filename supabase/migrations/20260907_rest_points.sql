-- ============================================================
-- Védett Útvonal — Pihenőpontok (rest_points)
-- Map/GPS/Rest Points sprint, 2026-09-07
-- ============================================================
--
-- SZÁNDÉKOSAN KÜLÖN adatmodell a meglévő "places" (VédettSarok helyek/
-- szolgáltatók/partnerek) tábláktól — egy felhasználó által gyorsan
-- felvett pihenőpont (pl. "ez a pad csendes és van itt WC") SOHA nem
-- kerül automatikusan a places táblába vagy bármilyen partneri/
-- szolgáltatói adatbázisba. Lásd docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md
-- "O) VédettSarok integrációs terv" szakasza a jövőbeli, NEM duplikáló
-- összekapcsolási tervért.
--
-- Ebben a sprintben KIZÁRÓLAG a "USER" forrás aktív, minden USER
-- pihenőpont alapból PRIVATE (csak a létrehozó látja). A "VEDETT_SAROK" és
-- "OSM" forrás típusok elő vannak készítve a sémában, de nincs hozzájuk
-- tömeges adatimport vagy automatikus feltöltés ebben a sprintben.

CREATE TABLE IF NOT EXISTS rest_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  -- Honnan származik a pont — ebben a sprintben csak 'USER' aktív ténylegesen,
  -- a másik kettő a jövőbeli, NEM-duplikáló integrációkhoz van előkészítve.
  source TEXT NOT NULL DEFAULT 'USER'
    CHECK (source IN ('USER', 'VEDETT_SAROK', 'OSM')),

  -- Csak akkor töltött, ha source = 'VEDETT_SAROK' vagy 'OSM' — egy KÜLSŐ
  -- rekordra mutató referencia, SOHA nem egy másolt adat. Ebben a sprintben
  -- mindig NULL, mert csak USER forrás aktív.
  external_ref_table TEXT NULL,
  external_ref_id TEXT NULL,

  -- Láthatóság — ebben a sprintben minden USER pont PRIVATE, és a CHECK
  -- kényszer egyelőre csak ezt engedi USER forrásra (lásd lent).
  visibility TEXT NOT NULL DEFAULT 'PRIVATE'
    CHECK (visibility IN ('PRIVATE', 'CONNECTIONS', 'PUBLIC')),

  -- Szenzoros/gyakorlati jellemzők — mind opcionális, a felhasználó csak
  -- azt tölti ki, amit tud/akar.
  toilet BOOLEAN NULL,
  seating BOOLEAN NULL,
  quiet_space BOOLEAN NULL,
  indoors BOOLEAN NULL,
  outdoors BOOLEAN NULL,
  purchase_required BOOLEAN NULL,
  notes TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rest_points_latitude_range CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT rest_points_longitude_range CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT rest_points_name_not_blank CHECK (char_length(trim(name)) > 0),
  -- Ebben a sprintben KIZÁRÓLAG USER forrású pont hozható létre — a másik
  -- két forrás típus a sémában létezik, de beszúrás szintjén még nincs
  -- hozzá bekötött folyamat (lásd fenti fejléc).
  CONSTRAINT rest_points_user_source_only CHECK (source = 'USER'),
  -- Ebben a sprintben minden pont PRIVATE — a CONNECTIONS/PUBLIC érték a
  -- séma szintjén létezik a jövőnek, de éles beszúrás csak PRIVATE-tal
  -- történhet, amíg a közösségi ajánlás funkció el nem készül.
  CONSTRAINT rest_points_private_only CHECK (visibility = 'PRIVATE')
);

CREATE INDEX IF NOT EXISTS rest_points_created_by_idx ON rest_points (created_by);
CREATE INDEX IF NOT EXISTS rest_points_source_idx ON rest_points (source);

CREATE OR REPLACE FUNCTION rest_points_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rest_points_updated_at_trigger ON rest_points;
CREATE TRIGGER rest_points_updated_at_trigger
  BEFORE UPDATE ON rest_points
  FOR EACH ROW
  EXECUTE FUNCTION rest_points_set_updated_at();

-- ── Row Level Security ──────────────────────────────────────
-- SZABÁLY (Map/GPS/Rest Points sprint spec, N. pont): PRIVATE USER
-- pihenőpontot KIZÁRÓLAG a létrehozója láthatja/módosíthatja/törölheti.
-- Cross-user hozzáférés minden művelethez explicit tiltva.

ALTER TABLE rest_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rest_points_own_select"
  ON rest_points FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "rest_points_own_insert"
  ON rest_points FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "rest_points_own_update"
  ON rest_points FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "rest_points_own_delete"
  ON rest_points FOR DELETE
  USING (created_by = auth.uid());

-- Nincs semmilyen "más felhasználó is láthatja" SELECT policy ebben a
-- sprintben — mivel minden pont PRIVATE, és nincs közösségi ajánlási
-- funkció, szándékosan nem adunk hozzá ilyet. Amikor a CONNECTIONS/PUBLIC
-- visibility élessé válik (külön sprint), egy új policy fogja kezelni,
-- ahogy a community_help_settings mintája is mutatja
-- (lásd 20260830_community_help.sql).
