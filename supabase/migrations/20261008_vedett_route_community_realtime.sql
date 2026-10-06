-- Védett Útvonal: Realtime Community Intelligence — privacy-preserving dedup token.
-- Előfeltétel: 20261006_vedett_route_community_reports.sql, 20261007_vedett_route_community_intelligence.sql.
--
-- reporter_scope_token: HMAC-SHA256(secret, actor | 3 órás ablak | célpont)
-- első 16 hex karaktere (lásd lib/vedett-route/communityReports/reporterToken.ts).
--   - nyers user_id / IP SOHA nem kerül a táblába;
--   - ablakonként és célpontonként (trip / route+szakasz / route / cella) más,
--     így nem fűzi össze egy ember jelzéseit útvonallá vagy napokon át;
--   - KIZÁRÓLAG realtime deduplikációra; historikus aggregáció nem használja;
--   - a report lejárta után nullázható (purge függvény lent).
-- RLS változatlanul fail-closed; új policy / GRANT nincs.

ALTER TABLE public.vedett_route_community_reports
  ADD COLUMN IF NOT EXISTS reporter_scope_token TEXT;

ALTER TABLE public.vedett_route_community_reports
  DROP CONSTRAINT IF EXISTS vr_community_reports_reporter_token_chk;
ALTER TABLE public.vedett_route_community_reports
  ADD CONSTRAINT vr_community_reports_reporter_token_chk
  CHECK (reporter_scope_token IS NULL OR reporter_scope_token ~ '^[0-9a-f]{16}$');

-- Realtime lekérdezések: aktív reportok route szerint (a trip_id-t és geo_cell-t
-- a meglévő indexek fedik).
CREATE INDEX IF NOT EXISTS vr_community_reports_route_active_idx
  ON public.vedett_route_community_reports (route_id, expires_at DESC)
  WHERE route_id IS NOT NULL;

-- Lejárt reportok dedup tokenjének törlése. Idempotens; service_role futtatja
-- (pl. Supabase SQL editor / későbbi ütemezett job). Visszaadja a nullázott sorok számát.
CREATE OR REPLACE FUNCTION public.vedett_route_purge_expired_reporter_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.vedett_route_community_reports
     SET reporter_scope_token = NULL
   WHERE reporter_scope_token IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.vedett_route_purge_expired_reporter_tokens() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.vedett_route_community_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vedett_route_community_reports FROM anon, authenticated;
