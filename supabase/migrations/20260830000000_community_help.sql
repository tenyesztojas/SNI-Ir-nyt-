-- ============================================================
-- Közösségi segítség modul — SQL migráció
-- VédettSarok, 2026-08-30
-- ============================================================

-- ── 1. community_help_settings ───────────────────────────────
CREATE TABLE IF NOT EXISTS community_help_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Főkapcsoló
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Felelősségi nyilatkozat elfogadásának időbélyege
  accepted_responsibility_notice_at TIMESTAMPTZ NULL,

  -- Segítségkérés
  help_needed_enabled BOOLEAN NOT NULL DEFAULT false,
  help_needed_categories TEXT[] NOT NULL DEFAULT '{}',
  help_needed_description TEXT NULL,

  -- Segítségfelajánlás
  help_offered_enabled BOOLEAN NOT NULL DEFAULT false,
  help_offered_categories TEXT[] NOT NULL DEFAULT '{}',
  help_offered_description TEXT NULL,

  -- Láthatóság: connections_only | city_or_district | county
  visibility TEXT NOT NULL DEFAULT 'connections_only',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_help_settings_user_id_key UNIQUE (user_id),
  CONSTRAINT community_help_settings_visibility_check
    CHECK (visibility IN ('connections_only', 'city_or_district', 'county'))
);

-- Index
CREATE INDEX IF NOT EXISTS community_help_settings_user_id_idx
  ON community_help_settings (user_id);
CREATE INDEX IF NOT EXISTS community_help_settings_enabled_idx
  ON community_help_settings (enabled) WHERE enabled = true;

-- ── 2. RLS — community_help_settings ────────────────────────
ALTER TABLE community_help_settings ENABLE ROW LEVEL SECURITY;

-- Saját sor: olvasás + írás
CREATE POLICY "help_settings_own_select"
  ON community_help_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "help_settings_own_insert"
  ON community_help_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "help_settings_own_update"
  ON community_help_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Más tag csak láthatósági szabály szerint olvashat
-- (connections_only → csak kapcsolat esetén látható, a szűrést szerver oldalon végezzük)
CREATE POLICY "help_settings_community_select"
  ON community_help_settings FOR SELECT
  USING (
    enabled = true
    AND visibility IN ('city_or_district', 'county')
    AND auth.uid() IS NOT NULL
    AND auth.uid() != user_id
  );

-- ── 3. community_user_reports ────────────────────────────────
CREATE TABLE IF NOT EXISTS community_user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_help_setting_id UUID NULL REFERENCES community_help_settings(id) ON DELETE SET NULL,
  related_thread_id UUID NULL,

  reason TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Status: pending | under_review | resolved_no_action | resolved_warning_sent |
  --         resolved_help_disabled | resolved_profile_suspended | rejected
  status TEXT NOT NULL DEFAULT 'pending',

  admin_note TEXT NULL,
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Önmaga nem jelentheti
  CONSTRAINT community_user_reports_no_self_report
    CHECK (reporter_user_id != reported_user_id),

  CONSTRAINT community_user_reports_status_check
    CHECK (status IN (
      'pending', 'under_review',
      'resolved_no_action', 'resolved_warning_sent',
      'resolved_help_disabled', 'resolved_profile_suspended',
      'rejected'
    ))
);

CREATE INDEX IF NOT EXISTS community_user_reports_reporter_idx
  ON community_user_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS community_user_reports_reported_idx
  ON community_user_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS community_user_reports_status_idx
  ON community_user_reports (status);

-- ── 4. RLS — community_user_reports ─────────────────────────
ALTER TABLE community_user_reports ENABLE ROW LEVEL SECURITY;

-- Bejelentkezett tag beküldhet
CREATE POLICY "user_reports_insert"
  ON community_user_reports FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_user_id
    AND auth.uid() != reported_user_id
  );

-- Beküldő saját jelentéseit láthatja (csak a saját sorait)
CREATE POLICY "user_reports_own_select"
  ON community_user_reports FOR SELECT
  USING (auth.uid() = reporter_user_id);

-- Publikus hozzáférés nincs; admin service_role-lal kezeli

-- ── 5. Rate limiting view — 24 órán belüli jelentések ───────
-- A szerver oldal ellenőrzi: egy reporter max 3 jelentést küldhet
-- ugyanarra a reported_user_id-re 24 órán belül.
-- Ez a view az admin számára hasznos.
CREATE OR REPLACE VIEW community_report_rate_summary AS
SELECT
  reporter_user_id,
  reported_user_id,
  COUNT(*) AS report_count,
  MAX(created_at) AS last_report_at
FROM community_user_reports
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY reporter_user_id, reported_user_id;
