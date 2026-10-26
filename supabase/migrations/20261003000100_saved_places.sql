-- Védett Útvonal: mentett helyek (saved places) v1.
-- Private, user-owned, cross-platform (web / Android WebView / future iOS).
-- Stores resolved coordinates so selection never depends on re-geocoding.

CREATE TABLE IF NOT EXISTS public.saved_places (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  address      TEXT NOT NULL,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saved_places_display_name_len CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 60),
  CONSTRAINT saved_places_address_len CHECK (char_length(btrim(address)) BETWEEN 1 AND 300),
  CONSTRAINT saved_places_latitude_range CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT saved_places_longitude_range CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS saved_places_user_created_idx
  ON public.saved_places (user_id, created_at);

CREATE OR REPLACE FUNCTION public.saved_places_set_updated_at()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_places_set_updated_at ON public.saved_places;
CREATE TRIGGER saved_places_set_updated_at
  BEFORE UPDATE ON public.saved_places
  FOR EACH ROW EXECUTE FUNCTION public.saved_places_set_updated_at();

-- Server-side limit: max 20 saved places per user (race-safe via advisory lock).
CREATE OR REPLACE FUNCTION public.saved_places_enforce_limit()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('saved_places:' || NEW.user_id::text));
  IF (SELECT count(*) FROM public.saved_places WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION 'saved_places_limit_reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_places_enforce_limit ON public.saved_places;
CREATE TRIGGER saved_places_enforce_limit
  BEFORE INSERT ON public.saved_places
  FOR EACH ROW EXECUTE FUNCTION public.saved_places_enforce_limit();

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.saved_places FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_places TO authenticated;

DROP POLICY IF EXISTS saved_places_select_own ON public.saved_places;
CREATE POLICY saved_places_select_own ON public.saved_places
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS saved_places_insert_own ON public.saved_places;
CREATE POLICY saved_places_insert_own ON public.saved_places
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS saved_places_update_own ON public.saved_places;
CREATE POLICY saved_places_update_own ON public.saved_places
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS saved_places_delete_own ON public.saved_places;
CREATE POLICY saved_places_delete_own ON public.saved_places
  FOR DELETE TO authenticated USING (user_id = auth.uid());
