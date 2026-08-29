-- ============================================================
-- VédettMunka — álláskereső modul
-- 2026-08-29
-- Táblák: employers, job_posts, job_applications_log,
--         job_alerts, job_reports
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. employers — munkáltatói partnerek
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employers (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  company_name             text        NOT NULL,
  tax_number               text,
  address                  text        NOT NULL,
  website                  text,
  contact_name             text        NOT NULL,
  contact_email            text        NOT NULL,
  contact_phone            text,
  description              text        NOT NULL DEFAULT '',
  job_types_description    text        NOT NULL DEFAULT '',
  open_to_neurodivergent   boolean     NOT NULL DEFAULT true,
  open_to_disabled         boolean     NOT NULL DEFAULT true,
  open_to_parents          boolean     NOT NULL DEFAULT true,
  accepts_vm_terms         boolean     NOT NULL DEFAULT false,
  accepts_no_diagnosis_req boolean     NOT NULL DEFAULT false,
  status                   text        NOT NULL DEFAULT 'pending_review'
                           CHECK (status IN ('pending_review','approved','rejected','suspended')),
  admin_note               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employers: saját olvasás"
  ON employers FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "employers: saját létrehozás"
  ON employers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "employers: saját frissítés"
  ON employers FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "employers: admin kezelés"
  ON employers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS employers_user_idx   ON employers (user_id);
CREATE INDEX IF NOT EXISTS employers_status_idx ON employers (status);


-- ─────────────────────────────────────────────────────────────
-- 2. job_posts — álláshirdetések
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_posts (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id                     uuid        REFERENCES employers(id) ON DELETE CASCADE NOT NULL,

  -- Alapadatok
  title                           text        NOT NULL,
  city                            text        NOT NULL,
  county                          text        NOT NULL DEFAULT '',
  workplace_address               text,
  work_type                       text        NOT NULL CHECK (work_type IN ('szellemi','fizikai')),
  job_category                    text        NOT NULL DEFAULT '',
  work_location_type              text        NOT NULL DEFAULT 'munkahelyen'
                                  CHECK (work_location_type IN ('munkahelyen','otthonrol','hibrid')),

  -- Munkaidő
  daily_hours                     text        NOT NULL DEFAULT '',
  working_days                    text        NOT NULL DEFAULT '',
  working_hours_from              text,
  working_hours_to                text,
  break_description               text,
  schedule_type                   text        NOT NULL DEFAULT 'allando'
                                  CHECK (schedule_type IN ('allando','valtozo','muszakos','elore_tervezheto')),

  -- Fizetés, feladatok, elvárások
  salary_range                    text        NOT NULL DEFAULT '',
  tasks_description               text        NOT NULL DEFAULT '',
  requirements_description        text        NOT NULL DEFAULT '',
  application_deadline            date,
  expected_start_date             text,
  training_description            text,
  mentor_available                text        NOT NULL DEFAULT 'meg_egyeztetes_alatt'
                                  CHECK (mentor_available IN ('van','nincs','meg_egyeztetes_alatt')),
  interview_process               text,
  contact_name                    text,
  contact_email                   text,
  application_email               text        NOT NULL,
  required_documents              text,
  notes                           text,

  -- Kötelező VédettMunka mező
  support_description             text        NOT NULL DEFAULT '',

  -- VédettMunka specifikus kérdések
  phone_required_level            text        CHECK (phone_required_level IN ('nem','ritkan','naponta_nehanykor','igen_gyakran')),
  verbal_interaction_level        text        CHECK (verbal_interaction_level IN ('nem','ritkan','igen')),
  interaction_with                text[]      NOT NULL DEFAULT '{}',
  noise_level                     text        CHECK (noise_level IN ('csendes','beszelgetes','gepek','sok_hang','nagyon_hangos')),
  written_instructions_available  text        CHECK (written_instructions_available IN ('igen','reszben','nem')),
  break_flexibility               text        CHECK (break_flexibility IN ('rugalmasak','reszben','elore_meghat','nem_rugalmasak')),
  start_end_flexibility           text        CHECK (start_end_flexibility IN ('rugalmas','reszben','nem_rugalmas')),
  part_time_available             text        CHECK (part_time_available IN ('igen','nem','egyeztetes')),
  open_to_parents                 boolean     NOT NULL DEFAULT true,
  open_to_neurodivergent          boolean     NOT NULL DEFAULT true,
  open_to_disabled                boolean     NOT NULL DEFAULT true,

  -- Státusz és időbélyegek
  status                          text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN (
                                    'draft','submitted','under_review','needs_revision',
                                    'approved','published','rejected','expired','archived'
                                  )),
  admin_note                      text,
  published_at                    timestamptz,
  expires_at                      timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_posts ENABLE ROW LEVEL SECURITY;

-- Publikus olvasás — csak publikált hirdetések
CREATE POLICY "job_posts: publikus olvasás"
  ON job_posts FOR SELECT
  USING (status = 'published');

-- Munkáltató látja a sajátját
CREATE POLICY "job_posts: munkáltató saját"
  ON job_posts FOR SELECT
  USING (
    employer_id IN (SELECT id FROM employers WHERE employers.user_id = auth.uid())
  );

CREATE POLICY "job_posts: munkáltató létrehozás"
  ON job_posts FOR INSERT
  WITH CHECK (
    employer_id IN (
      SELECT id FROM employers WHERE employers.user_id = auth.uid() AND employers.status = 'approved'
    )
  );

CREATE POLICY "job_posts: munkáltató frissítés"
  ON job_posts FOR UPDATE
  USING (
    employer_id IN (SELECT id FROM employers WHERE employers.user_id = auth.uid())
    AND status IN ('draft','needs_revision')
  );

CREATE POLICY "job_posts: admin kezelés"
  ON job_posts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS job_posts_employer_idx  ON job_posts (employer_id);
CREATE INDEX IF NOT EXISTS job_posts_status_idx    ON job_posts (status);
CREATE INDEX IF NOT EXISTS job_posts_city_idx      ON job_posts (city);
CREATE INDEX IF NOT EXISTS job_posts_work_type_idx ON job_posts (work_type);
CREATE INDEX IF NOT EXISTS job_posts_published_idx ON job_posts (published_at DESC) WHERE status = 'published';


-- ─────────────────────────────────────────────────────────────
-- 3. job_applications_log — jelentkezési napló (CV nélkül)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_applications_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid        REFERENCES job_posts(id) ON DELETE SET NULL,
  employer_id     uuid        REFERENCES employers(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  applicant_name  text        NOT NULL,
  applicant_email text        NOT NULL,
  cv_filename     text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivery_status text        NOT NULL DEFAULT 'pending'
                  CHECK (delivery_status IN ('pending','sent','failed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_applications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_applications_log: saját INSERT"
  ON job_applications_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "job_applications_log: saját olvasás"
  ON job_applications_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "job_applications_log: admin"
  ON job_applications_log FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS job_app_log_user_idx ON job_applications_log (user_id);
CREATE INDEX IF NOT EXISTS job_app_log_job_idx  ON job_applications_log (job_id);


-- ─────────────────────────────────────────────────────────────
-- 4. job_alerts — állásértesítő beállítások
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_alerts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  enabled               boolean     NOT NULL DEFAULT true,
  categories            text[]      NOT NULL DEFAULT '{}',
  work_type             text        CHECK (work_type IN ('szellemi','fizikai','mindketto')),
  city                  text,
  county                text,
  home_office           boolean     NOT NULL DEFAULT false,
  hybrid                boolean     NOT NULL DEFAULT false,
  part_time             boolean     NOT NULL DEFAULT false,
  flexible_schedule     boolean     NOT NULL DEFAULT false,
  open_to_neurodivergent boolean    NOT NULL DEFAULT false,
  open_to_disabled      boolean     NOT NULL DEFAULT false,
  open_to_parents       boolean     NOT NULL DEFAULT false,
  salary_min            integer,
  frequency             text        NOT NULL DEFAULT 'heti'
                        CHECK (frequency IN ('azonnali','heti')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_alerts: saját CRUD"
  ON job_alerts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "job_alerts: admin olvasás"
  ON job_alerts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS job_alerts_user_idx ON job_alerts (user_id);


-- ─────────────────────────────────────────────────────────────
-- 5. job_reports — hirdetés jelentések
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id           uuid        REFERENCES job_posts(id) ON DELETE CASCADE NOT NULL,
  reason           text        NOT NULL,
  description      text,
  status           text        NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','reviewed','resolved','dismissed')),
  admin_note       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

ALTER TABLE job_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_reports: saját INSERT"
  ON job_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "job_reports: saját olvasás"
  ON job_reports FOR SELECT USING (auth.uid() = reporter_user_id);

CREATE POLICY "job_reports: admin kezelés"
  ON job_reports FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS job_reports_job_idx    ON job_reports (job_id);
CREATE INDEX IF NOT EXISTS job_reports_status_idx ON job_reports (status);
