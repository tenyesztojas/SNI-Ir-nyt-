-- ============================================================
-- VédettMunka 2.0 – Piktogram / attribútum rendszer
-- 2026-09-01
-- Táblák: vm_job_attributes, vm_job_attribute_values,
--         vm_work_profiles
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. vm_job_attributes – attribútum törzsadatok (adminok kezelik)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vm_job_attributes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        NOT NULL UNIQUE,
  category       text        NOT NULL,
  title_hu       text        NOT NULL,
  easy_desc_hu   text        NOT NULL DEFAULT '',
  icon_name      text        NOT NULL,             -- VmIcon slug
  attribute_type text        NOT NULL DEFAULT 'boolean'
                 CHECK (attribute_type IN ('boolean','level')),
  level_options  text[]      NOT NULL DEFAULT '{}', -- pl. ['low','medium','high','unknown']
  display_order  int         NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vm_job_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_job_attributes: publikus olvasás"
  ON vm_job_attributes FOR SELECT USING (is_active = true);

CREATE POLICY "vm_job_attributes: admin kezelés"
  ON vm_job_attributes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS vm_ja_category_idx ON vm_job_attributes (category, display_order);

-- ─────────────────────────────────────────────────────────────
-- 2. vm_job_attribute_values – álláshoz rendelt attribútumok
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vm_job_attribute_values (
  job_post_id    uuid   NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  attribute_slug text   NOT NULL REFERENCES vm_job_attributes(slug) ON DELETE CASCADE,
  value          text   NOT NULL DEFAULT 'true',  -- 'true' boolean esetén, level value egyébként
  PRIMARY KEY (job_post_id, attribute_slug)
);

ALTER TABLE vm_job_attribute_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_jav: publikus olvasás"
  ON vm_job_attribute_values FOR SELECT USING (true);

CREATE POLICY "vm_jav: employer saját munka"
  ON vm_job_attribute_values FOR ALL
  USING (
    job_post_id IN (
      SELECT jp.id FROM job_posts jp
      JOIN employers e ON jp.employer_id = e.id
      WHERE e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS vm_jav_job_idx ON vm_job_attribute_values (job_post_id);

-- ─────────────────────────────────────────────────────────────
-- 3. vm_work_profiles – felhasználói munka-preferencia profil
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vm_work_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  attribute_slugs text[]      NOT NULL DEFAULT '{}',  -- fontosnak jelölt attribútumok
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vm_work_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_wp: saját olvasás/írás"
  ON vm_work_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. SEED – attribútum törzsadatok
-- ─────────────────────────────────────────────────────────────

INSERT INTO vm_job_attributes (slug, category, title_hu, easy_desc_hu, icon_name, attribute_type, display_order) VALUES

-- A. KISZÁMÍTHATÓSÁG
('predictable_tasks',    'kiszamithatosag', 'Egyértelmű feladatok',          'Pontosan elmondják, mit kell csinálnod.',           'predictable_tasks',    'boolean', 10),
('predictable_schedule', 'kiszamithatosag', 'Kiszámítható munkarend',         'A munkaidődet előre ismered.',                      'predictable_schedule', 'boolean', 20),
('advance_notice',       'kiszamithatosag', 'Előre jelzik a változásokat',    'Ha valami változik, igyekeznek előre szólni.',       'advance_notice',       'boolean', 30),
('routine_tasks',        'kiszamithatosag', 'Kiszámítható feladatok',         'A napi feladatok általában hasonlóak.',              'routine_tasks',        'boolean', 40),

-- B. BETANÍTÁS ÉS SEGÍTSÉG
('gradual_training',   'betanitas', 'Fokozatos betanítás',              'A munkát lépésről lépésre mutatják meg.',                 'gradual_training',   'boolean', 10),
('assigned_mentor',    'betanitas', 'Kijelölt mentor / segítő',         'Lesz olyan ember, akitől segítséget kérhetsz.',           'assigned_mentor',    'boolean', 20),
('can_ask_questions',  'betanitas', 'Lehet kérdezni',                   'Ha valami nem világos, kérdezhetsz.',                     'can_ask_questions',  'boolean', 30),
('regular_feedback',   'betanitas', 'Rendszeres visszajelzés',          'Elmondják, mi megy jól és miben fejlődhetsz.',            'regular_feedback',   'boolean', 40),
('written_tasks',      'betanitas', 'Írásban is megkapható feladatok',  'A feladatokat írásban is megkaphatod.',                   'written_tasks',      'boolean', 50),

-- C. MUNKAKÖRNYEZET
('quieter_env',         'munkakornyzet', 'Csendesebb környezet',       'A munkahely általában nem hangos.',                        'quieter_env',        'boolean', 10),
('calmer_env',          'munkakornyzet', 'Nyugodtabb környezet',       'Kevés zavaró esemény történik körülötted.',               'calmer_env',         'boolean', 20),
('small_team',          'munkakornyzet', 'Kis csapat',                 'Általában kevés emberrel dolgozol együtt.',                'small_team',         'boolean', 30),
('large_team',          'munkakornyzet', 'Nagyobb csapat',             'Sok emberrel dolgozol egy helyen.',                        'large_team',         'boolean', 40),
('low_verbal',          'munkakornyzet', 'Kevés beszélgetés',          'A munkához kevés beszélgetés szükséges.',                  'low_verbal',         'boolean', 50),
('high_communication',  'munkakornyzet', 'Sok kommunikáció',           'A munka során sok emberrel kell beszélni.',                'high_communication', 'boolean', 60),
('low_customer',        'munkakornyzet', 'Kevés ügyfélkapcsolat',      'Ritkán kell ügyfelekkel beszélned.',                      'low_customer',       'boolean', 70),
('independent_work',    'munkakornyzet', 'Önálló munkavégzés',         'A betanítás után sok feladatot egyedül végezhetsz.',      'independent_work',   'boolean', 80),
('team_work',           'munkakornyzet', 'Csapatmunka',                'A feladatokat másokkal együtt végzitek.',                  'team_work',          'boolean', 90),

-- D. SZENZOROS KÖRNYEZET
('noise_low',    'szenzoros', 'Zajszint: alacsony',  'A munkahely általában csendes.',           'noise_low',    'boolean', 10),
('noise_medium', 'szenzoros', 'Zajszint: közepes',   'Közepes zajszint – nem hangos, de nem is csendes.', 'noise_medium', 'boolean', 20),
('noise_high',   'szenzoros', 'Zajszint: magas',     'A munkahely hangosabb.',                   'noise_high',   'boolean', 30),
('natural_light','szenzoros', 'Természetes fény',    'A munkaterületen természetes fény van.',   'natural_light','boolean', 40),
('calm_visual',  'szenzoros', 'Nyugodtabb vizuális környezet', 'Kevés villogó, forgó, zavaró elem.',  'calm_visual',  'boolean', 50),

-- E. MUNKA JELLEGE
('seated_work',    'munka_jellege', 'Ülőmunka',              'A feladatokat ülve végzed.',         'seated_work',    'boolean', 10),
('standing_work',  'munka_jellege', 'Állómunka',             'A feladatokat állva végzed.',        'standing_work',  'boolean', 20),
('computer_work',  'munka_jellege', 'Számítógépes munka',    'A munka nagy részét számítógépen végzed.', 'computer_work', 'boolean', 30),
('physical_work',  'munka_jellege', 'Fizikai munka',         'A munka fizikai erőkifejtéssel jár.','physical_work',  'boolean', 40),
('repetitive_tasks','munka_jellege','Ismétlődő feladatok',   'A napi feladatok nagyrészt ugyanolyanok.', 'repetitive_tasks','boolean',50),
('varied_tasks',   'munka_jellege', 'Változatos feladatok',  'Különböző feladatokat kell elvégezni.','varied_tasks',   'boolean', 60),

-- F. MUNKAIDŐ
('full_time',         'munkaidő', 'Teljes munkaidő',            'Napi 8 óra, heti 5 nap.',                    'full_time',         'boolean', 10),
('part_time',         'munkaidő', 'Részmunkaidő',               'Napi 4–6 óra, vagy heti kevesebb nap.',       'part_time',         'boolean', 20),
('flexible_hours',    'munkaidő', 'Rugalmas munkaidő',          'Megbeszélhető, mikor és hogyan dolgozol.',    'flexible_hours',    'boolean', 30),
('predictable_shift', 'munkaidő', 'Kiszámítható műszak',        'A beosztásodat előre megkapod.',              'predictable_shift', 'boolean', 40),
('no_weekend',        'munkaidő', 'Hétvégi munka nincs',        'Hétvégén nem kell dolgoznod.',                'no_weekend',        'boolean', 50),
('no_night',          'munkaidő', 'Éjszakai munka nincs',       'Éjszakai műszak nincs.',                      'no_night',          'boolean', 60),

-- G. MUNKAVÉGZÉS HELYE
('onsite',          'helyszin', 'Helyszíni munkavégzés',  'Minden nap egy meghatározott helyen dolgozol.',  'onsite',         'boolean', 10),
('home_office',     'helyszin', 'Home office',            'Otthonról is dolgozhatsz.',                      'home_office',    'boolean', 20),
('hybrid',          'helyszin', 'Hibrid munkavégzés',     'Részben otthonról, részben munkahelyen.',        'hybrid',         'boolean', 30),
('fixed_location',  'helyszin', 'Állandó munkahely',      'Minden nap ugyanoda jársz dolgozni.',            'fixed_location', 'boolean', 40),

-- H. MEGKÖZELÍTHETŐSÉG
('accessible',       'megkozelites', 'Akadálymentes helyszín',            'A munkahely akadálymentesen megközelíthető.',           'accessible',       'boolean', 10),
('public_transport', 'megkozelites', 'Tömegközlekedéssel elérhető',       'Busszal vagy metróval könnyen megközelíthető.',          'public_transport', 'boolean', 20),
('parking',          'megkozelites', 'Parkolási lehetőség',               'Autóval érkezhetsz, van parkoló.',                      'parking',          'boolean', 30),
('commute_support',  'megkozelites', 'Munkába járás támogatása',          'A munkáltató segít a bejárási költségekkel.',            'commute_support',  'boolean', 40),

-- I. SZÜNETEK
('regular_breaks',  'szunet', 'Rendszeres szünetek',      'Rendszeres szünet van a munkaidőben.',     'regular_breaks',  'boolean', 10),
('flexible_breaks', 'szunet', 'Szünet kérhető',           'Ha szükséges, kérhetsz szünetet.',         'flexible_breaks', 'boolean', 20),
('quiet_room',      'szunet', 'Nyugodtabb hely elérhető', 'Van hely, ahová rövid időre elvonulhatsz.','quiet_room',      'boolean', 30)

ON CONFLICT (slug) DO NOTHING;

-- Schema cache refresh
NOTIFY pgrst, 'reload schema';
