-- ============================================================
-- Védett Akadémia – e-learning modul
-- 2026-08-31
-- Táblák: courses, course_versions, modules, lessons,
--   content_blocks, source_documents, question_bank,
--   participants, invitations, enrollments, lesson_progress,
--   test_attempts, test_answers, certificates,
--   partner_settings, learning_paths, learning_path_courses
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. academy_courses – kurzustörzs
-- ─────────────────────────────────────────────────────────────
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

CREATE POLICY "academy_courses: publikus olvasás ha published"
  ON academy_courses FOR SELECT
  USING (status = 'published' OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "academy_courses: admin írás"
  ON academy_courses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────
-- 2. academy_course_versions – verziók
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_course_versions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            uuid        NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  version              text        NOT NULL,  -- pl. "VP-CORE-1.0"
  status               text        NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','published','archived')),
  requires_retraining  boolean     NOT NULL DEFAULT false,
  passing_score        int         NOT NULL DEFAULT 80,  -- százalék
  question_count       int         NOT NULL DEFAULT 25,
  max_attempts         int         NOT NULL DEFAULT 0,   -- 0 = korlátlan
  source_document_id   uuid        NULL,
  published_at         timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, version)
);

ALTER TABLE academy_course_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_course_versions: publikus olvasás"
  ON academy_course_versions FOR SELECT
  USING (status = 'published' OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "academy_course_versions: admin írás"
  ON academy_course_versions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_cv_course_idx ON academy_course_versions (course_id);

-- ─────────────────────────────────────────────────────────────
-- 3. academy_source_documents – feltöltött Word fájlok
-- ─────────────────────────────────────────────────────────────
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

CREATE POLICY "academy_source_documents: admin kezelés"
  ON academy_source_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- FK a course_versions-re utólag (circular reference elkerülése)
ALTER TABLE academy_course_versions
  ADD CONSTRAINT fk_acv_source_doc
  FOREIGN KEY (source_document_id)
  REFERENCES academy_source_documents(id)
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. academy_modules – modulok
-- ─────────────────────────────────────────────────────────────
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

CREATE POLICY "academy_modules: olvasás"
  ON academy_modules FOR SELECT USING (true);

CREATE POLICY "academy_modules: admin írás"
  ON academy_modules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_mod_cv_idx ON academy_modules (course_version_id, display_order);

-- ─────────────────────────────────────────────────────────────
-- 5. academy_lessons – leckék
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_lessons (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     uuid        NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  display_order int         NOT NULL DEFAULT 0,
  is_required   boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_lessons: olvasás"
  ON academy_lessons FOR SELECT USING (true);

CREATE POLICY "academy_lessons: admin írás"
  ON academy_lessons FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_les_mod_idx ON academy_lessons (module_id, display_order);

-- ─────────────────────────────────────────────────────────────
-- 6. academy_content_blocks – tartalomblokkok
-- ─────────────────────────────────────────────────────────────
-- type: paragraph | heading | image | video | bullet_list |
--       numbered_list | table | quote | info_callout |
--       warning_callout | success_callout | scenario | divider
CREATE TABLE IF NOT EXISTS academy_content_blocks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid        NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  block_type    text        NOT NULL DEFAULT 'paragraph',
  content_json  jsonb       NOT NULL DEFAULT '{}',
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_content_blocks: olvasás"
  ON academy_content_blocks FOR SELECT USING (true);

CREATE POLICY "academy_content_blocks: admin írás"
  ON academy_content_blocks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_cb_lesson_idx ON academy_content_blocks (lesson_id, display_order);

-- ─────────────────────────────────────────────────────────────
-- 7. academy_question_bank – kérdésbank
-- ─────────────────────────────────────────────────────────────
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
  correct_answers      text[]      NOT NULL DEFAULT '{"a"}',  -- ['a'], ['a','c'], stb.
  explanation          text        NOT NULL DEFAULT '',
  category             text        NOT NULL DEFAULT '',
  is_critical          boolean     NOT NULL DEFAULT false,
  is_active            boolean     NOT NULL DEFAULT true,
  is_demo              boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_question_bank: admin kezelés"
  ON academy_question_bank FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_qb_cv_idx ON academy_question_bank (course_version_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- 8. academy_participants – meghívott munkatársak (nem auth.users!)
-- ─────────────────────────────────────────────────────────────
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

-- Partner saját munkatársait látja (provider_profiles.user_id == auth.uid())
CREATE POLICY "academy_participants: partner saját"
  ON academy_participants FOR SELECT
  USING (
    partner_id IN (
      SELECT id FROM provider_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "academy_participants: admin kezelés"
  ON academy_participants FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_part_partner_idx ON academy_participants (partner_id);
CREATE INDEX IF NOT EXISTS academy_part_email_idx   ON academy_participants (email);

-- ─────────────────────────────────────────────────────────────
-- 9. academy_enrollments – beiratkozások
-- ─────────────────────────────────────────────────────────────
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
  reminder_sent_at     timestamptz NULL,  -- utolsó emlékeztető e-mail időpontja (cron)
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, course_version_id)
);

ALTER TABLE academy_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_enrollments: partner saját"
  ON academy_enrollments FOR SELECT
  USING (
    partner_id IN (
      SELECT id FROM provider_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "academy_enrollments: admin kezelés"
  ON academy_enrollments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_enr_participant_idx ON academy_enrollments (participant_id);
CREATE INDEX IF NOT EXISTS academy_enr_partner_idx     ON academy_enrollments (partner_id);
CREATE INDEX IF NOT EXISTS academy_enr_cv_idx          ON academy_enrollments (course_version_id);

-- ─────────────────────────────────────────────────────────────
-- 10. academy_invitations – meghívások (magic link tokenek)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_invitations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid        NOT NULL REFERENCES academy_participants(id) ON DELETE CASCADE,
  enrollment_id  uuid        NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  token_hash     text        NOT NULL UNIQUE,  -- sha256(raw_token) – raw token soha nem tárolódik
  sent_at        timestamptz NOT NULL DEFAULT now(),
  opened_at      timestamptz NULL,
  revoked_at     timestamptz NULL,
  expires_at     timestamptz NULL,
  resent_count   int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_invitations ENABLE ROW LEVEL SECURITY;

-- Nincs publikus hozzáférés – minden service_role-on keresztül megy
CREATE POLICY "academy_invitations: admin kezelés"
  ON academy_invitations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_inv_token_idx ON academy_invitations (token_hash);
CREATE INDEX IF NOT EXISTS academy_inv_enr_idx   ON academy_invitations (enrollment_id);

-- ─────────────────────────────────────────────────────────────
-- 11. academy_lesson_progress – lecke-haladás
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_lesson_progress (
  enrollment_id uuid        NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  lesson_id     uuid        NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  completed     boolean     NOT NULL DEFAULT false,
  completed_at  timestamptz NULL,
  PRIMARY KEY (enrollment_id, lesson_id)
);

ALTER TABLE academy_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_lesson_progress: admin kezelés"
  ON academy_lesson_progress FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_lp_enrollment_idx ON academy_lesson_progress (enrollment_id);

-- ─────────────────────────────────────────────────────────────
-- 12. academy_test_attempts – tesztpróbálkozások
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_test_attempts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid        NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  attempt_number int         NOT NULL DEFAULT 1,
  started_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz NULL,
  score          int         NULL,   -- százalék 0-100
  passed         boolean     NULL,
  failed_critical boolean    NULL,   -- kritikus kérdés hibás volt-e
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academy_test_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_test_attempts: admin kezelés"
  ON academy_test_attempts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_ta_enrollment_idx ON academy_test_attempts (enrollment_id);

-- ─────────────────────────────────────────────────────────────
-- 13. academy_test_answers – tesztválaszok
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_test_answers (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id          uuid    NOT NULL REFERENCES academy_test_attempts(id) ON DELETE CASCADE,
  question_id         uuid    NOT NULL REFERENCES academy_question_bank(id) ON DELETE CASCADE,
  selected_answers    text[]  NOT NULL DEFAULT '{}',
  is_correct          boolean NOT NULL DEFAULT false
);

ALTER TABLE academy_test_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_test_answers: admin kezelés"
  ON academy_test_answers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_ans_attempt_idx ON academy_test_answers (attempt_id);

-- ─────────────────────────────────────────────────────────────
-- 14. academy_certificates – igazolások
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_certificates (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code     text        NOT NULL UNIQUE,  -- pl. VA-2026-A7F4K92
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

-- Publikus ellenőrzés certificate_code alapján
CREATE POLICY "academy_certificates: publikus ellenőrzés"
  ON academy_certificates FOR SELECT
  USING (true);

CREATE POLICY "academy_certificates: admin kezelés"
  ON academy_certificates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS academy_cert_code_idx    ON academy_certificates (certificate_code);
CREATE INDEX IF NOT EXISTS academy_cert_enr_idx     ON academy_certificates (enrollment_id);

-- ─────────────────────────────────────────────────────────────
-- 15. academy_partner_settings – partner-szintű beállítások
-- ─────────────────────────────────────────────────────────────
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

CREATE POLICY "academy_partner_settings: partner saját"
  ON academy_partner_settings FOR SELECT
  USING (
    partner_id IN (
      SELECT id FROM provider_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "academy_partner_settings: admin kezelés"
  ON academy_partner_settings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────
-- 16. academy_learning_paths – tanulási utak (jövőbeli bővítés)
-- ─────────────────────────────────────────────────────────────
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

CREATE POLICY "academy_learning_paths: olvasás"
  ON academy_learning_paths FOR SELECT USING (true);

CREATE POLICY "academy_learning_paths: admin kezelés"
  ON academy_learning_paths FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE TABLE IF NOT EXISTS academy_learning_path_courses (
  learning_path_id  uuid  NOT NULL REFERENCES academy_learning_paths(id)  ON DELETE CASCADE,
  course_id         uuid  NOT NULL REFERENCES academy_courses(id)          ON DELETE CASCADE,
  display_order     int   NOT NULL DEFAULT 0,
  is_required       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (learning_path_id, course_id)
);

ALTER TABLE academy_learning_path_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_lpc: olvasás"
  ON academy_learning_path_courses FOR SELECT USING (true);

CREATE POLICY "academy_lpc: admin kezelés"
  ON academy_learning_path_courses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────
-- SEED: Demo kurzus (DRAFT, DEMO CONTENT)
-- ─────────────────────────────────────────────────────────────

-- Demo kurzus
INSERT INTO academy_courses (id, slug, title, description, estimated_duration_minutes, certificate_validity_months, status)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'alapkepzes',
  'Autizmus- és ADHD-tudatos ügyfélkezelési alapképzés',
  'TARTALOM VÉGLEGESÍTÉS ALATT – demo infrastruktúra teszteléshez. A végleges tananyag .docx importon keresztül kerül be.',
  75,
  12,
  'draft'
) ON CONFLICT (slug) DO NOTHING;

-- Demo kurzusverzió
INSERT INTO academy_course_versions (id, course_id, version, status, passing_score, question_count)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'VP-CORE-1.0',
  'draft',
  80,
  5
) ON CONFLICT (course_id, version) DO NOTHING;

-- Demo modul
INSERT INTO academy_modules (id, course_version_id, title, display_order)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  '1. Bevezetés – DEMO',
  0
),
(
  'c0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  '2. Védett Jelzés – DEMO',
  1
),
(
  'c0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000001',
  '3. Kommunikáció – DEMO',
  2
)
ON CONFLICT DO NOTHING;

-- Demo leckék
INSERT INTO academy_lessons (id, module_id, title, display_order)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Miért fontos az autizmus- és ADHD-tudatosság? – DEMO', 0),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Mi a Védett Jelzés? – DEMO', 0),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Hatékony kommunikáció – DEMO', 0)
ON CONFLICT DO NOTHING;

-- Demo tartalomblokkok
INSERT INTO academy_content_blocks (lesson_id, block_type, content_json, display_order)
VALUES
(
  'd0000000-0000-0000-0000-000000000001',
  'warning_callout',
  '{"title": "DEMO TARTALOM", "text": "Ez a lecke kizárólag a rendszer infrastruktúrájának tesztelésére szolgál. REPLACE BEFORE PRODUCTION."}',
  0
),
(
  'd0000000-0000-0000-0000-000000000001',
  'paragraph',
  '{"text": "A VédettSarok platformon a Védett Akadémia célja, hogy az autizmussal és ADHD-val érintett ügyfeleket fogadó munkatársak felkészülten, megértően és hatékonyan tudják őket kiszolgálni. Ez a képzés az alapvető ismereteket nyújtja."}',
  1
),
(
  'd0000000-0000-0000-0000-000000000001',
  'info_callout',
  '{"title": "Becsült idő", "text": "Ez a lecke kb. 5 percet vesz igénybe. DEMO CONTENT."}',
  2
),
(
  'd0000000-0000-0000-0000-000000000002',
  'warning_callout',
  '{"title": "DEMO TARTALOM", "text": "Ez a lecke kizárólag a rendszer infrastruktúrájának tesztelésére szolgál. REPLACE BEFORE PRODUCTION."}',
  0
),
(
  'd0000000-0000-0000-0000-000000000002',
  'paragraph',
  '{"text": "A Védett Jelzés egy vizuális azonosító, amelyet az autizmussal vagy ADHD-val érintett személy visel, jelezve, hogy különleges figyelmet igényelhet. DEMO – a végleges tartalom importálásra kerül."}',
  1
),
(
  'd0000000-0000-0000-0000-000000000002',
  'scenario',
  '{"title": "Példahelyzet – DEMO", "situation": "Egy vendég Védett Jelzést visel és zavartan néz a menükártyára.", "do_text": "Kérdezd meg nyugodtan: Miben segíthetek?", "dont_text": "Ne kérdezd meg diagnózisát. Ne hívj figyelmet rá hangosan."}',
  2
),
(
  'd0000000-0000-0000-0000-000000000003',
  'warning_callout',
  '{"title": "DEMO TARTALOM", "text": "Ez a lecke kizárólag a rendszer infrastruktúrájának tesztelésére szolgál. REPLACE BEFORE PRODUCTION."}',
  0
),
(
  'd0000000-0000-0000-0000-000000000003',
  'bullet_list',
  '{"items": ["Rövid, egyértelmű mondatokban kommunikálj.", "Kerüld az ironikus vagy metaforás kifejezéseket.", "Ha nem értik, fogalmazd át, ne ismételd hangosabban.", "Adj elegendő időt a válaszra. DEMO."]}',
  1
)
ON CONFLICT DO NOTHING;

-- Demo tesztkérdések (DEMO TEST QUESTIONS – adminból törölhető/cserélhető)
INSERT INTO academy_question_bank (course_version_id, question_text, option_a, option_b, option_c, option_d, correct_answers, explanation, category, is_demo)
VALUES
(
  'b0000000-0000-0000-0000-000000000001',
  '[DEMO] Mit jelent a Védett Jelzés?',
  'Egy vizuális azonosító autizmussal vagy ADHD-val érintett személyeknek',
  'Egy biztonsági matrica az épületen',
  'Egy parkolási engedély',
  'Egy munkáltatói tanúsítvány',
  ARRAY['a'],
  'A Védett Jelzés egy vizuális azonosító, amellyel a viselője jelzi, hogy különleges figyelmet igényelhet.',
  'Védett Jelzés',
  true
),
(
  'b0000000-0000-0000-0000-000000000001',
  '[DEMO] Mit NE tegyél, ha autizmussal érintett ügyfelet szolgálsz ki?',
  'Rövid, egyértelmű mondatokban kommunikálj',
  'Adj elegendő időt a válaszra',
  'Kérdezd meg a diagnózisát nyilvánosan',
  'Legyen türelmes és segítőkész',
  ARRAY['c'],
  'Soha ne kérdezz rá nyilvánosan valaki diagnózisára. Ez személyes adat és megsértheti a vendég méltóságát.',
  'Kommunikáció',
  true
),
(
  'b0000000-0000-0000-0000-000000000001',
  '[DEMO] Mi a teendő, ha egy vendég túlterhelődési jeleket mutat?',
  'Hangosan figyelmeztesd a többi vendéget',
  'Kínálj csendes helyet vagy segítséget, ha lehetséges',
  'Haladéktalanul hívj orvost',
  'Hagyd egyedül és ne foglalkozz vele',
  ARRAY['b'],
  'Ha valaki túlterhelődési jeleket mutat, nyugodt hanggal ajánlj segítséget és ha lehet, keress számára csendesebb helyet.',
  'Túlterhelődés',
  true
),
(
  'b0000000-0000-0000-0000-000000000001',
  '[DEMO] Melyik kommunikációs módszer a leghatékonyabb autizmussal érintett személyeknél?',
  'Metaforák és szleng kifejezések',
  'Gyors, sok információt egyszerre tartalmazó utasítások',
  'Rövid, egyértelmű, konkrét mondatok',
  'Suttogás és szemkontakt kerülése',
  ARRAY['c'],
  'Az egyértelmű, rövid, konkrét kommunikáció a leghatékonyabb. Kerüld az összetett, kétértelmű mondatokat.',
  'Kommunikáció',
  true
),
(
  'b0000000-0000-0000-0000-000000000001',
  '[DEMO] A Védett Akadémia képzés mire jogosítja fel a résztvevőt?',
  'Autizmus szakértői tanúsítványra',
  'ADHD terápiás jogosultságra',
  'A konkrét képzés elvégzésének igazolására',
  'Orvosi konzultáció végzésére',
  ARRAY['c'],
  'Az igazolás kizárólag a konkrét képzés elvégzését igazolja, nem minősít szakértőnek.',
  'Általános',
  true
)
ON CONFLICT DO NOTHING;
