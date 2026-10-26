-- Közösségi segítség moderáció: bővített adatmodell
-- Hatályos: 2026-08-30

-- community_user_reports tábla bővítése moderációs mezőkkel
ALTER TABLE community_user_reports
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS entity_id UUID NULL,
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS appeal_deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS decision_notified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ NULL;

ALTER TABLE community_user_reports
  DROP CONSTRAINT IF EXISTS community_user_reports_entity_type_check,
  DROP CONSTRAINT IF EXISTS community_user_reports_severity_check;

ALTER TABLE community_user_reports
  ADD CONSTRAINT community_user_reports_entity_type_check
    CHECK (entity_type IN ('user', 'help_request', 'help_offer', 'comment', 'message')),
  ADD CONSTRAINT community_user_reports_severity_check
    CHECK (severity IN ('critical', 'high', 'normal'));

-- Moderációs audit napló (kötelező indoklással)
CREATE TABLE IF NOT EXISTS community_report_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES community_user_reports(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  previous_status TEXT NULL,
  new_status TEXT NULL,
  previous_severity TEXT NULL,
  new_severity TEXT NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fellebbezési tábla (6 hónapos határidő)
CREATE TABLE IF NOT EXISTS community_report_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES community_user_reports(id) ON DELETE CASCADE,
  appellant_user_id UUID NOT NULL REFERENCES auth.users(id),
  appeal_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_response TEXT NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_report_appeals_status_check
    CHECK (status IN ('pending', 'under_review', 'upheld', 'rejected'))
);

-- Teljesítmény indexek
CREATE INDEX IF NOT EXISTS idx_community_user_reports_severity_status
  ON community_user_reports(severity, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_user_reports_retention
  ON community_user_reports(retention_until, anonymized_at)
  WHERE anonymized_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_community_report_audit_log_report
  ON community_report_audit_log(report_id, created_at DESC);

-- RLS
ALTER TABLE community_report_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_report_appeals ENABLE ROW LEVEL SECURITY;

-- Audit log: csak admin olvashat/írhat (service_role-on keresztül)
CREATE POLICY "Admin only audit log" ON community_report_audit_log
  FOR ALL USING (false);

-- Appeals: a bejelentett user saját fellebbezéseit látja
CREATE POLICY "User sees own appeals" ON community_report_appeals
  FOR SELECT USING (appellant_user_id = auth.uid());
CREATE POLICY "User inserts own appeal" ON community_report_appeals
  FOR INSERT WITH CHECK (appellant_user_id = auth.uid());
CREATE POLICY "Admin manages appeals" ON community_report_appeals
  FOR ALL USING (false);

-- retentionUntil backfill meglévő rekordokhoz (minimum 6 hónap)
UPDATE community_user_reports
  SET retention_until = created_at + INTERVAL '6 months'
  WHERE retention_until IS NULL;

-- appealDeadlineAt backfill (6 hónap a létrehozástól, lezárt eseteken)
UPDATE community_user_reports
  SET appeal_deadline_at = created_at + INTERVAL '6 months'
  WHERE appeal_deadline_at IS NULL
    AND status NOT IN ('pending', 'under_review');
