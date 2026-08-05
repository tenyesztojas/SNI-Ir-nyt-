-- ============================================================
-- VédettSarok – Nyilvános Válasz + Üzenetküldő migráció
-- ÁSZF 7. pont + Adatkezelési Tájékoztató 2.4–2.5. és 3. pont
-- ============================================================

-- place_claims: Hely-tulajdonjog igazolása (ÁSZF 7.3. pont)
CREATE TABLE IF NOT EXISTS place_claims (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id            uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  claimant_user_id    uuid NOT NULL REFERENCES auth.users(id),
  verification_method text NOT NULL DEFAULT 'business_email',
  verification_data   text,           -- megadott céges e-mail cím
  verification_token  text,           -- UUID token a magic link-hez
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'verified', 'rejected')),
  reject_reason       text,
  created_at          timestamptz DEFAULT now(),
  verified_at         timestamptz
);

-- Egy user egy helyhez csak egy aktív (pending/verified) igénylést tarthat fenn
CREATE UNIQUE INDEX IF NOT EXISTS place_claims_active_unique
  ON place_claims(place_id, claimant_user_id)
  WHERE status IN ('pending', 'verified');

-- place_responses: Nyilvános Válasz (ÁSZF 7. pont)
-- KRITIKUS: a responder_user_id alapján soha nem szivárog ki reviewer PII
CREATE TABLE IF NOT EXISTS place_responses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id          uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  place_id           uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  responder_user_id  uuid NOT NULL REFERENCES auth.users(id),
  text               text NOT NULL CHECK (length(text) >= 5 AND length(text) <= 2000),
  status             text NOT NULL DEFAULT 'published'
                       CHECK (status IN ('published','removed_by_report','removed_by_admin','pending_review')),
  flagged_for_review boolean DEFAULT false,
  flag_reason        text,
  created_at         timestamptz DEFAULT now()
);

-- Egy review-hoz csak 1 aktív közzétett válasz
CREATE UNIQUE INDEX IF NOT EXISTS place_responses_one_active_per_review
  ON place_responses(review_id)
  WHERE status = 'published';

-- messages: Anonimizált üzenetküldő (ÁSZF 7.6. pont)
-- KRITIKUS: a Hely soha nem látja a reviewer e-mail/telefon adatát (csak user_id UUID)
CREATE TABLE IF NOT EXISTS messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id          uuid REFERENCES reviews(id) ON DELETE SET NULL,
  place_id           uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  sender_user_id     uuid NOT NULL REFERENCES auth.users(id),
  recipient_user_id  uuid NOT NULL REFERENCES auth.users(id),
  sender_role        text NOT NULL CHECK (sender_role IN ('place', 'reviewer')),
  text               text NOT NULL CHECK (length(text) >= 1 AND length(text) <= 1000),
  created_at         timestamptz DEFAULT now(),
  read_at            timestamptz
);

-- consent_log: GDPR 3.1. pont – eseti, elkülönített hozzájárulás rögzítése
CREATE TABLE IF NOT EXISTS consent_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  place_id     uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  review_id    uuid REFERENCES reviews(id) ON DELETE SET NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('anonymous_only', 'share_contact', 'block')),
  granted_at   timestamptz DEFAULT now(),
  revoked_at   timestamptz,
  UNIQUE (user_id, place_id, review_id)
);

-- reports tábla bővítése: válasz-bejelentés támogatása
ALTER TABLE reports ADD COLUMN IF NOT EXISTS response_id uuid
  REFERENCES place_responses(id) ON DELETE SET NULL;

-- ============================================================
-- RLS Policies
-- ============================================================

-- place_claims
ALTER TABLE place_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_claims_select_own_or_admin" ON place_claims
  FOR SELECT USING (claimant_user_id = auth.uid() OR is_admin());

CREATE POLICY "place_claims_insert_own" ON place_claims
  FOR INSERT WITH CHECK (claimant_user_id = auth.uid());

CREATE POLICY "place_claims_update_admin" ON place_claims
  FOR UPDATE USING (is_admin());

-- place_responses
ALTER TABLE place_responses ENABLE ROW LEVEL SECURITY;

-- Közzétett válaszok nyilvánosak; own + admin mindent lát
CREATE POLICY "place_responses_select" ON place_responses
  FOR SELECT USING (
    status = 'published'
    OR is_admin()
    OR responder_user_id = auth.uid()
  );

-- Csak igazolt tulajdonos írhat (verified claim szükséges)
CREATE POLICY "place_responses_insert_verified_owner" ON place_responses
  FOR INSERT WITH CHECK (
    responder_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM place_claims
      WHERE place_claims.place_id = place_responses.place_id
        AND place_claims.claimant_user_id = auth.uid()
        AND place_claims.status = 'verified'
    )
  );

-- Admin moderálás (eltávolítás)
CREATE POLICY "place_responses_update_admin" ON place_responses
  FOR UPDATE USING (is_admin());

-- messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Csak résztvevők és admin látják az üzeneteket
CREATE POLICY "messages_select_participants" ON messages
  FOR SELECT USING (
    sender_user_id = auth.uid()
    OR recipient_user_id = auth.uid()
    OR is_admin()
  );

-- Küldési szabályok:
-- 1. Reviewer bármikor küldhet visszajelzést
-- 2. Hely csak akkor küldhet, ha nincs 'block' consent + van verified claim
CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (
    sender_user_id = auth.uid()
    AND (
      sender_role = 'reviewer'
      OR (
        sender_role = 'place'
        AND EXISTS (
          SELECT 1 FROM place_claims
          WHERE place_claims.place_id = messages.place_id
            AND place_claims.claimant_user_id = auth.uid()
            AND place_claims.status = 'verified'
        )
        AND NOT EXISTS (
          SELECT 1 FROM consent_log
          WHERE consent_log.user_id = messages.recipient_user_id
            AND consent_log.place_id = messages.place_id
            AND consent_log.consent_type = 'block'
            AND consent_log.revoked_at IS NULL
        )
      )
    )
  );

-- Olvasottság jelzése
CREATE POLICY "messages_update_read" ON messages
  FOR UPDATE USING (recipient_user_id = auth.uid());

-- consent_log
ALTER TABLE consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_log_select" ON consent_log
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "consent_log_insert" ON consent_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "consent_log_update" ON consent_log
  FOR UPDATE USING (user_id = auth.uid());
