-- ============================================================
-- VédettMunka jogi javítások (2026-08-30)
-- 1. employers: privacy_policy_url mező
-- 2. vm_consent_log: hozzájárulási napló
-- 3. vm_admin_audit_log: admin műveletek naplója
-- ============================================================

-- 1. Munkáltatói adatkezelési tájékoztató link
ALTER TABLE employers ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT;

-- 2. VédettMunka hozzájárulási napló
CREATE TABLE IF NOT EXISTS vm_consent_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id              UUID REFERENCES job_posts(id) ON DELETE SET NULL,
  employer_id         UUID REFERENCES employers(id) ON DELETE SET NULL,
  -- Típusok: vm_terms_acceptance | vm_privacy_notice_acceptance |
  --           job_application_data_forwarding | job_alert_subscription |
  --           marketing_newsletter_subscription | employer_terms_acceptance |
  --           employer_fair_selection_declaration
  consent_type        TEXT NOT NULL,
  document_version    TEXT,
  employer_privacy_url TEXT,
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash             TEXT,
  user_agent          TEXT,
  metadata            JSONB
);

-- RLS: csak service role írhat, senki sem olvashat (user saját maga sem)
ALTER TABLE vm_consent_log ENABLE ROW LEVEL SECURITY;

-- Admin (service role) korlátlan hozzáférés
CREATE POLICY "vm_consent_log: service role full access"
  ON vm_consent_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Admin audit napló
CREATE TABLE IF NOT EXISTS vm_admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Típusok: employer_approved | employer_rejected | employer_suspended |
  --           job_status_changed | job_edited_by_admin |
  --           job_report_status_changed | job_application_log_viewed
  action_type     TEXT NOT NULL,
  target_type     TEXT NOT NULL,  -- employer | job_post | job_report | job_application_log
  target_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB         -- pl. {"from_status":"submitted","to_status":"approved"}
);

ALTER TABLE vm_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Csak service role (admin kliens) írhat/olvashat
CREATE POLICY "vm_admin_audit_log: service role full access"
  ON vm_admin_audit_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index a hatékony lekérdezéshez
CREATE INDEX IF NOT EXISTS idx_vm_admin_audit_log_admin ON vm_admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_vm_admin_audit_log_created ON vm_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vm_consent_log_user ON vm_consent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_vm_consent_log_job ON vm_consent_log(job_id);
CREATE INDEX IF NOT EXISTS idx_vm_consent_log_type ON vm_consent_log(consent_type);
