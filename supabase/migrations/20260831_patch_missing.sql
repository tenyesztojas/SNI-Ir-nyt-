-- ============================================================
-- PATCH: Hiányzó oszlopok és táblák pótlása
-- Futtatás: Supabase SQL Editor – egyszerre az egészet
-- Minden utasítás idempotens (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. community_help_settings – hiányzó oszlop
-- ────────────────────────────────────────────────────────────
ALTER TABLE community_help_settings
  ADD COLUMN IF NOT EXISTS accepted_responsibility_notice_at TIMESTAMPTZ NULL;

-- ────────────────────────────────────────────────────────────
-- 2. community_user_reports – teljes tábla (ha még nem létezik)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_help_setting_id UUID NULL REFERENCES community_help_settings(id) ON DELETE SET NULL,
  related_thread_id UUID NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT NULL,
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

ALTER TABLE community_user_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_user_reports' AND policyname = 'user_reports_insert'
  ) THEN
    CREATE POLICY "user_reports_insert" ON community_user_reports
      FOR INSERT WITH CHECK (auth.uid() = reporter_user_id AND auth.uid() != reported_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_user_reports' AND policyname = 'user_reports_own_select'
  ) THEN
    CREATE POLICY "user_reports_own_select" ON community_user_reports
      FOR SELECT USING (auth.uid() = reporter_user_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. community_user_reports – moderációs oszlopok (20260830_community_help_moderation.sql)
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_community_user_reports_severity_status
  ON community_user_reports(severity, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_user_reports_retention
  ON community_user_reports(retention_until, anonymized_at)
  WHERE anonymized_at IS NULL;

-- Backfill retention_until meglévő rekordokhoz
UPDATE community_user_reports
  SET retention_until = created_at + INTERVAL '6 months'
  WHERE retention_until IS NULL;

UPDATE community_user_reports
  SET appeal_deadline_at = created_at + INTERVAL '6 months'
  WHERE appeal_deadline_at IS NULL
    AND status NOT IN ('pending', 'under_review');

-- ────────────────────────────────────────────────────────────
-- 4. community_report_audit_log
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_community_report_audit_log_report
  ON community_report_audit_log(report_id, created_at DESC);

ALTER TABLE community_report_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_report_audit_log' AND policyname = 'Admin only audit log'
  ) THEN
    CREATE POLICY "Admin only audit log" ON community_report_audit_log
      FOR ALL USING (false);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. community_report_appeals
-- ────────────────────────────────────────────────────────────
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

ALTER TABLE community_report_appeals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_report_appeals' AND policyname = 'User sees own appeals'
  ) THEN
    CREATE POLICY "User sees own appeals" ON community_report_appeals
      FOR SELECT USING (appellant_user_id = auth.uid());
    CREATE POLICY "User inserts own appeal" ON community_report_appeals
      FOR INSERT WITH CHECK (appellant_user_id = auth.uid());
    CREATE POLICY "Admin manages appeals" ON community_report_appeals
      FOR ALL USING (false);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. Védett Akadémia – mind a 16 tábla (20260831_academy.sql)
-- Mindegyik CREATE TABLE IF NOT EXISTS – biztonságosan futtatható
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_courses (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        text        NOT NULL UNIQUE,
  title                       text        NOT NULL,
  description                 text        NOT NULL DEFAULT '',
  estimated_duration_minutes  int         NOT NULL DEFAULT 60,
  certificate_validity_months int         NOT NULL DEFAULT 12,
  status                      text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','published','archived')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_courses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_courses' AND policyname='academy_courses: publikus olvasás ha published') THEN
    CREATE POLICY "academy_courses: publikus olvasás ha published" ON academy_courses FOR SELECT
      USING (status = 'published' OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
    CREATE POLICY "academy_courses: admin írás" ON academy_courses FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS academy_source_documents (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename           text        NOT NULL,
  storage_path       text        NOT NULL,
  mime_type          text        NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  file_size_bytes    bigint      NULL,
  checksum           text        NULL,
  uploaded_by        uuid        NOT NULL REFERENCES auth.users(id),
  uploaded_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_source_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_source_documents' AND policyname='academy_source_documents: admin kezelés') THEN
    CREATE POLICY "academy_source_documents: admin kezelés" ON academy_source_documents FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS academy_course_versions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            uuid        NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  version              text        NOT NULL,
  status               text        NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','published','archived')),
  requires_retraining  boolean     NOT NULL DEFAULT false,
  passing_score        int         NOT NULL DEFAULT 80,
  question_count       int         NOT NULL DEFAULT 25,
  max_attempts         int         NOT NULL DEFAULT 0,
  source_document_id   uuid        NULL REFERENCES academy_source_documents(id) ON DELETE SET NULL,
  published_at         timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, version)
);

ALTER TABLE academy_course_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_course_versions' AND policyname='academy_course_versions: publikus olvasás') THEN
    CREATE POLICY "academy_course_versions: publikus olvasás" ON academy_course_versions FOR SELECT
      USING (status = 'published' OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
    CREATE POLICY "academy_course_versions: admin írás" ON academy_course_versions FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_cv_course_idx ON academy_course_versions (course_id);

CREATE TABLE IF NOT EXISTS academy_modules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_version_id uuid        NOT NULL REFERENCES academy_course_versions(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  display_order     int         NOT NULL DEFAULT 0,
  is_required       boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_modules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_modules' AND policyname='academy_modules: olvasás') THEN
    CREATE POLICY "academy_modules: olvasás" ON academy_modules FOR SELECT USING (true);
    CREATE POLICY "academy_modules: admin írás" ON academy_modules FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_mod_cv_idx ON academy_modules (course_version_id, display_order);

CREATE TABLE IF NOT EXISTS academy_lessons (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     uuid        NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  display_order int         NOT NULL DEFAULT 0,
  is_required   boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_lessons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_lessons' AND policyname='academy_lessons: olvasás') THEN
    CREATE POLICY "academy_lessons: olvasás" ON academy_lessons FOR SELECT USING (true);
    CREATE POLICY "academy_lessons: admin írás" ON academy_lessons FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_les_mod_idx ON academy_lessons (module_id, display_order);

CREATE TABLE IF NOT EXISTS academy_content_blocks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid        NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  block_type    text        NOT NULL DEFAULT 'paragraph',
  content_json  jsonb       NOT NULL DEFAULT '{}',
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_content_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_content_blocks' AND policyname='academy_content_blocks: olvasás') THEN
    CREATE POLICY "academy_content_blocks: olvasás" ON academy_content_blocks FOR SELECT USING (true);
    CREATE POLICY "academy_content_blocks: admin írás" ON academy_content_blocks FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_cb_lesson_idx ON academy_content_blocks (lesson_id, display_order);

CREATE TABLE IF NOT EXISTS academy_question_bank (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_version_id    uuid        NOT NULL REFERENCES academy_course_versions(id) ON DELETE CASCADE,
  question_text        text        NOT NULL,
  question_type        text        NOT NULL DEFAULT 'single_choice'
                       CHECK (question_type IN ('single_choice','multiple_choice')),
  option_a             text        NOT NULL DEFAULT '',
  option_b             text        NOT NULL DEFAULT '',
  option_c             text        NOT NULL DEFAULT '',
  option_d             text        NOT NULL DEFAULT '',
  correct_answers      text[]      NOT NULL DEFAULT '{"a"}',
  explanation          text        NOT NULL DEFAULT '',
  category             text        NOT NULL DEFAULT '',
  is_critical          boolean     NOT NULL DEFAULT false,
  is_active            boolean     NOT NULL DEFAULT true,
  is_demo              boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_question_bank ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_question_bank' AND policyname='academy_question_bank: admin kezelés') THEN
    CREATE POLICY "academy_question_bank: admin kezelés" ON academy_question_bank FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_qb_cv_idx ON academy_question_bank (course_version_id, is_active);

CREATE TABLE IF NOT EXISTS academy_participants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name   text        NOT NULL,
  last_name    text        NOT NULL,
  email        text        NOT NULL,
  partner_id   uuid        NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  location     text        NOT NULL DEFAULT '',
  job_role     text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, partner_id)
);

ALTER TABLE academy_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_participants' AND policyname='academy_participants: partner saját') THEN
    CREATE POLICY "academy_participants: partner saját" ON academy_participants FOR SELECT
      USING (
        partner_id IN (SELECT id FROM provider_profiles WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
    CREATE POLICY "academy_participants: admin kezelés" ON academy_participants FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_part_partner_idx ON academy_participants (partner_id);
CREATE INDEX IF NOT EXISTS academy_part_email_idx   ON academy_participants (email);

CREATE TABLE IF NOT EXISTS academy_enrollments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id       uuid        NOT NULL REFERENCES academy_participants(id) ON DELETE CASCADE,
  course_version_id    uuid        NOT NULL REFERENCES academy_course_versions(id),
  partner_id           uuid        NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  status               text        NOT NULL DEFAULT 'invited'
                       CHECK (status IN (
                         'invited','opened','in_progress','course_completed',
                         'test_in_progress','test_failed','completed','expired','revoked'
                       )),
  progress_percent     int         NOT NULL DEFAULT 0,
  started_at           timestamptz NULL,
  completed_course_at  timestamptz NULL,
  completed_at         timestamptz NULL,
  last_activity_at     timestamptz NULL,
  reminder_sent_at     timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, course_version_id)
);

ALTER TABLE academy_enrollments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_enrollments' AND policyname='academy_enrollments: partner saját') THEN
    CREATE POLICY "academy_enrollments: partner saját" ON academy_enrollments FOR SELECT
      USING (
        partner_id IN (SELECT id FROM provider_profiles WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
    CREATE POLICY "academy_enrollments: admin kezelés" ON academy_enrollments FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_enr_participant_idx ON academy_enrollments (participant_id);
CREATE INDEX IF NOT EXISTS academy_enr_partner_idx     ON academy_enrollments (partner_id);
CREATE INDEX IF NOT EXISTS academy_enr_cv_idx          ON academy_enrollments (course_version_id);

CREATE TABLE IF NOT EXISTS academy_invitations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid        NOT NULL REFERENCES academy_participants(id) ON DELETE CASCADE,
  enrollment_id  uuid        NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  token_hash     text        NOT NULL UNIQUE,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  opened_at      timestamptz NULL,
  revoked_at     timestamptz NULL,
  expires_at     timestamptz NULL,
  resent_count   int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_invitations' AND policyname='academy_invitations: admin kezelés') THEN
    CREATE POLICY "academy_invitations: admin kezelés" ON academy_invitations FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_inv_token_idx ON academy_invitations (token_hash);
CREATE INDEX IF NOT EXISTS academy_inv_enr_idx   ON academy_invitations (enrollment_id);

CREATE TABLE IF NOT EXISTS academy_lesson_progress (
  enrollment_id uuid        NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  lesson_id     uuid        NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  completed     boolean     NOT NULL DEFAULT false,
  completed_at  timestamptz NULL,
  PRIMARY KEY (enrollment_id, lesson_id)
);

ALTER TABLE academy_lesson_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_lesson_progress' AND policyname='academy_lesson_progress: admin kezelés') THEN
    CREATE POLICY "academy_lesson_progress: admin kezelés" ON academy_lesson_progress FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_lp_enrollment_idx ON academy_lesson_progress (enrollment_id);

CREATE TABLE IF NOT EXISTS academy_test_attempts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid        NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  attempt_number int         NOT NULL DEFAULT 1,
  started_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz NULL,
  score          int         NULL,
  passed         boolean     NULL,
  failed_critical boolean    NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_test_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_test_attempts' AND policyname='academy_test_attempts: admin kezelés') THEN
    CREATE POLICY "academy_test_attempts: admin kezelés" ON academy_test_attempts FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_ta_enrollment_idx ON academy_test_attempts (enrollment_id);

CREATE TABLE IF NOT EXISTS academy_test_answers (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id          uuid    NOT NULL REFERENCES academy_test_attempts(id) ON DELETE CASCADE,
  question_id         uuid    NOT NULL REFERENCES academy_question_bank(id) ON DELETE CASCADE,
  selected_answers    text[]  NOT NULL DEFAULT '{}',
  is_correct          boolean NOT NULL DEFAULT false
);

ALTER TABLE academy_test_answers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_test_answers' AND policyname='academy_test_answers: admin kezelés') THEN
    CREATE POLICY "academy_test_answers: admin kezelés" ON academy_test_answers FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_ans_attempt_idx ON academy_test_answers (attempt_id);

CREATE TABLE IF NOT EXISTS academy_certificates (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code     text        NOT NULL UNIQUE,
  enrollment_id        uuid        NOT NULL UNIQUE REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  issued_at            timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NULL,
  pdf_storage_path     text        NULL,
  status               text        NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','expired','revoked')),
  test_score           int         NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_certificates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_certificates' AND policyname='academy_certificates: publikus ellenőrzés') THEN
    CREATE POLICY "academy_certificates: publikus ellenőrzés" ON academy_certificates FOR SELECT USING (true);
    CREATE POLICY "academy_certificates: admin kezelés" ON academy_certificates FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academy_cert_code_idx ON academy_certificates (certificate_code);
CREATE INDEX IF NOT EXISTS academy_cert_enr_idx  ON academy_certificates (enrollment_id);

CREATE TABLE IF NOT EXISTS academy_partner_settings (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id               uuid        NOT NULL UNIQUE REFERENCES provider_profiles(id) ON DELETE CASCADE,
  frontline_employee_count int         NOT NULL DEFAULT 0,
  annual_confirmed_at      timestamptz NULL,
  annual_confirmed_by      uuid        NULL REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_partner_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_partner_settings' AND policyname='academy_partner_settings: partner saját') THEN
    CREATE POLICY "academy_partner_settings: partner saját" ON academy_partner_settings FOR SELECT
      USING (
        partner_id IN (SELECT id FROM provider_profiles WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
    CREATE POLICY "academy_partner_settings: admin kezelés" ON academy_partner_settings FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS academy_learning_paths (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text    NOT NULL UNIQUE,
  title       text    NOT NULL,
  description text    NOT NULL DEFAULT '',
  sector      text    NOT NULL DEFAULT '',
  status      text    NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','published','archived')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_learning_paths ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_learning_paths' AND policyname='academy_learning_paths: olvasás') THEN
    CREATE POLICY "academy_learning_paths: olvasás" ON academy_learning_paths FOR SELECT USING (true);
    CREATE POLICY "academy_learning_paths: admin kezelés" ON academy_learning_paths FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS academy_learning_path_courses (
  learning_path_id  uuid  NOT NULL REFERENCES academy_learning_paths(id) ON DELETE CASCADE,
  course_id         uuid  NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  display_order     int   NOT NULL DEFAULT 0,
  is_required       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (learning_path_id, course_id)
);

ALTER TABLE academy_learning_path_courses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='academy_learning_path_courses' AND policyname='academy_lpc: olvasás') THEN
    CREATE POLICY "academy_lpc: olvasás" ON academy_learning_path_courses FOR SELECT USING (true);
    CREATE POLICY "academy_lpc: admin kezelés" ON academy_learning_path_courses FOR ALL
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. SEED: Demo kurzus (csak ha még nem létezik)
-- ────────────────────────────────────────────────────────────
INSERT INTO academy_courses (id, slug, title, description, estimated_duration_minutes, certificate_validity_months, status)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'alapkepzes',
  'Autizmus- és ADHD-tudatos ügyfélkezelési alapképzés',
  'TARTALOM VÉGLEGESÍTÉS ALATT – demo infrastruktúra teszteléshez.',
  75, 12, 'draft'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO academy_course_versions (id, course_id, version, status, passing_score, question_count)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'VP-CORE-1.0', 'draft', 80, 5
) ON CONFLICT (course_id, version) DO NOTHING;

INSERT INTO academy_modules (id, course_version_id, title, display_order)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '1. Bevezetés – DEMO', 0),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '2. Védett Jelzés – DEMO', 1),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '3. Kommunikáció – DEMO', 2)
ON CONFLICT DO NOTHING;

INSERT INTO academy_lessons (id, module_id, title, display_order)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Miért fontos az autizmus- és ADHD-tudatosság? – DEMO', 0),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Mi a Védett Jelzés? – DEMO', 0),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Hatékony kommunikáció – DEMO', 0)
ON CONFLICT DO NOTHING;

INSERT INTO academy_content_blocks (lesson_id, block_type, content_json, display_order)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'warning_callout',
   '{"title": "DEMO TARTALOM", "text": "Ez a lecke kizárólag a rendszer infrastruktúrájának tesztelésére szolgál."}', 0),
  ('d0000000-0000-0000-0000-000000000001', 'paragraph',
   '{"text": "A VédettSarok platformon a Védett Akadémia célja, hogy az autizmussal és ADHD-val érintett ügyfeleket fogadó munkatársak felkészülten tudják kiszolgálni őket."}', 1)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 8. Schema cache újratöltése
-- ────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
