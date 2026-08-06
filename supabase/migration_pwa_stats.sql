-- PWA statisztika tábla
CREATE TABLE IF NOT EXISTS pwa_stats (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  text NOT NULL CHECK (event_type IN ('install', 'session')),
  platform    text CHECK (platform IN ('android', 'ios', 'other')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE pwa_stats ENABLE ROW LEVEL SECURITY;

-- Bárki beírhat (anonim is), csak admin olvashat
CREATE POLICY "pwa_insert_anon" ON pwa_stats
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "pwa_select_admin" ON pwa_stats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
