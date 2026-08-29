-- ============================================================
-- Médiamegjelenések tábla
-- 2026-08-28
-- ============================================================

CREATE TABLE IF NOT EXISTS media_appearances (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  url          text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('youtube', 'article')),
  published_at date,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_appearances ENABLE ROW LEVEL SECURITY;

-- Mindenki olvashatja (publikus megjelenítés a Rólunk oldalon)
CREATE POLICY "media: publikus olvasás"
  ON media_appearances FOR SELECT
  USING (true);

-- Csak admin módosíthat
CREATE POLICY "media: admin kezelés"
  ON media_appearances FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS media_appearances_sort_idx ON media_appearances (sort_order, created_at);
