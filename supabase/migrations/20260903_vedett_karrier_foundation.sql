-- Védett Karrier – Sprint 1 Foundation Migration
-- Forrás: Technical Implementation Plan V1.1 FINAL + errata
-- Dátum: 2026-09-03
--
-- ADDITÍV MIGRÁCIÓ: nincs legacy tábla módosítás, nincs törlés.
-- RLS engedélyezve minden új táblán.
-- service_role policy minden táblán (INSERT/UPDATE/DELETE).
-- Trigger: validate_job_role_env_value_type, validate_career_profile_dimension_type
--
-- FONTOS: NE deployolj productionbe Sprint 1 GO/NO-GO jóváhagyás nélkül.
-- FONTOS: service_role key soha ne kerüljön kliensoldalra.

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vkmm_dimensions – 10 fődimenzió referencia tábla
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vkmm_dimensions (
  code          text        PRIMARY KEY,
  name_hu       text        NOT NULL,
  display_order smallint    NOT NULL CHECK (display_order >= 1),
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (display_order)
);

ALTER TABLE vkmm_dimensions ENABLE ROW LEVEL SECURITY;

-- Mindenki olvashatja a referencia táblát
CREATE POLICY "vkmm_dimensions: anon_read"
  ON vkmm_dimensions FOR SELECT
  USING (true);

-- Csak service_role írhat
CREATE POLICY "vkmm_dimensions: service_role_write"
  ON vkmm_dimensions FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vkmm_sub_dimensions – 51 aldimenzió referencia tábla
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vkmm_sub_dimensions (
  code                  text        PRIMARY KEY,
  dimension_code        text        NOT NULL REFERENCES vkmm_dimensions(code) ON DELETE RESTRICT,
  name_user_hu          text        NOT NULL,
  name_employer_hu      text        NOT NULL,
  display_order         smallint    NOT NULL CHECK (display_order >= 1),
  value_type            text        NOT NULL CHECK (value_type IN ('ordinal','categorical','boolean','frequency')),
  comparison_type       text        NOT NULL CHECK (comparison_type IN (
                          'HIGHER_IS_MORE_DEMANDING','RANGE_PREFERENCE',
                          'SET_MEMBERSHIP','BOOLEAN_PREFERENCE','FREQUENCY_RANGE')),
  -- ordinal metadata
  ordinal_min           smallint,
  ordinal_max           smallint,
  ordinal_labels_json   jsonb,       -- [{v:1,label:"..."}]
  -- categorical metadata
  categorical_options_json jsonb,    -- ["opt1","opt2"]
  categorical_labels_json  jsonb,    -- {"opt1":"Label"}
  -- frequency metadata
  frequency_options_json   jsonb,    -- ["none","rare","regular"]
  frequency_labels_json    jsonb,    -- {"none":"Nincs"}
  -- UX metadata
  user_question_hu      text        NOT NULL,
  employer_question_hu  text        NOT NULL,
  clarification_key     text,
  sensitive_risk        text        NOT NULL DEFAULT 'low'
                                    CHECK (sensitive_risk IN ('low','medium','high')),
  default_importance    text        NOT NULL DEFAULT 'medium'
                                    CHECK (default_importance IN ('low','medium','high','essential')),
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dimension_code, display_order),
  -- comparison_type ↔ value_type konzisztencia
  CONSTRAINT ck_comparison_value_type CHECK (
    (comparison_type IN ('HIGHER_IS_MORE_DEMANDING','RANGE_PREFERENCE') AND value_type = 'ordinal')  OR
    (comparison_type = 'SET_MEMBERSHIP'   AND value_type = 'categorical') OR
    (comparison_type = 'BOOLEAN_PREFERENCE' AND value_type = 'boolean')   OR
    (comparison_type = 'FREQUENCY_RANGE'  AND value_type = 'frequency')
  )
);

ALTER TABLE vkmm_sub_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vkmm_sub_dimensions: anon_read"
  ON vkmm_sub_dimensions FOR SELECT
  USING (true);

CREATE POLICY "vkmm_sub_dimensions: service_role_write"
  ON vkmm_sub_dimensions FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. vk_employer_workplaces – munkahely profil (employer ownership)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vk_employer_workplaces (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id       uuid        NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  name_hu           text        NOT NULL,
  description_hu    text,
  city              text,
  workplace_type    text,       -- pl. 'irodai', 'raktár', 'helyszíni'
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vk_employer_workplaces ENABLE ROW LEVEL SECURITY;

-- Munkáltató saját workplace-eit láthatja
CREATE POLICY "vk_employer_workplaces: employer_read_own"
  ON vk_employer_workplaces FOR SELECT
  USING (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = (SELECT auth.uid())
    )
  );

-- Munkáltató INSERT/UPDATE/DELETE saját workplace
CREATE POLICY "vk_employer_workplaces: employer_write_own"
  ON vk_employer_workplaces FOR ALL
  USING (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "vk_employer_workplaces: service_role_write"
  ON vk_employer_workplaces FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. vk_job_roles – munkakör (employer ownership)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vk_job_roles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id       uuid        NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  workplace_id      uuid        REFERENCES vk_employer_workplaces(id) ON DELETE SET NULL,
  title_hu          text        NOT NULL,
  description_hu    text,
  employment_type   text,       -- pl. 'full_time', 'part_time'
  status            text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','active','archived')),
  published_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vk_job_roles ENABLE ROW LEVEL SECURITY;

-- Publikus, aktív munkakörök olvashatók
CREATE POLICY "vk_job_roles: public_read_active"
  ON vk_job_roles FOR SELECT
  USING (status = 'active' AND (expires_at IS NULL OR expires_at > now()));

-- Munkáltató saját munkaköreit (draft is) láthatja
CREATE POLICY "vk_job_roles: employer_read_own"
  ON vk_job_roles FOR SELECT
  USING (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = (SELECT auth.uid())
    )
  );

-- Munkáltató írhat saját munkakörbe
CREATE POLICY "vk_job_roles: employer_write_own"
  ON vk_job_roles FOR ALL
  USING (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "vk_job_roles: service_role_write"
  ON vk_job_roles FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. job_role_env_values – typed munkakörnyezeti értékek
--    Pontosan egy typed oszlop nem-null soronként (CHECK constraint).
--    boolean_value = false IS VALID (IS NOT NULL ellenőrzés).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_role_env_values (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_role_id           uuid        NOT NULL REFERENCES vk_job_roles(id) ON DELETE CASCADE,
  sub_dimension_code    text        NOT NULL REFERENCES vkmm_sub_dimensions(code) ON DELETE RESTRICT,
  -- typed columns: exactly one non-null per row
  ordinal_value         smallint,
  categorical_value     text,
  boolean_value         boolean,    -- false IS a valid value!
  frequency_value       text,
  -- metadata
  data_source           text        NOT NULL DEFAULT 'SELF_REPORTED'
                                    CHECK (data_source IN ('CONFIRMED','SELF_REPORTED','MISSING')),
  employer_note         text,       -- nem-publikus: RLS tiltja munkavállalói olvasást
  public_context_note   text,
  last_reviewed_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- pontosan egy typed oszlop nem-null
  CONSTRAINT ck_exactly_one_value CHECK (
    (
      (ordinal_value    IS NOT NULL)::int +
      (categorical_value IS NOT NULL)::int +
      (boolean_value    IS NOT NULL)::int +
      (frequency_value  IS NOT NULL)::int
    ) = 1
  ),
  -- egy munkakörnek egy aldimenziónként csak egy értéke lehet
  UNIQUE (job_role_id, sub_dimension_code)
);

ALTER TABLE job_role_env_values ENABLE ROW LEVEL SECURITY;

-- Publikus: aktív munkakörök VKMM értékei olvashatók (employer_note kivételével → view-ban szűrt)
-- A sor szintű policy: csak aktív job_role értéke látszik
CREATE POLICY "job_role_env_values: public_read_active"
  ON job_role_env_values FOR SELECT
  USING (
    job_role_id IN (
      SELECT id FROM vk_job_roles
      WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Munkáltató saját értékeket olvashat (draft is)
CREATE POLICY "job_role_env_values: employer_read_own"
  ON job_role_env_values FOR SELECT
  USING (
    job_role_id IN (
      SELECT jr.id FROM vk_job_roles jr
      JOIN employers e ON e.id = jr.employer_id
      WHERE e.user_id = (SELECT auth.uid())
    )
  );

-- Munkáltató írhat saját értéket
CREATE POLICY "job_role_env_values: employer_write_own"
  ON job_role_env_values FOR ALL
  USING (
    job_role_id IN (
      SELECT jr.id FROM vk_job_roles jr
      JOIN employers e ON e.id = jr.employer_id
      WHERE e.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    job_role_id IN (
      SELECT jr.id FROM vk_job_roles jr
      JOIN employers e ON e.id = jr.employer_id
      WHERE e.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "job_role_env_values: service_role_write"
  ON job_role_env_values FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. career_profiles – felhasználói karrier profil
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS career_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          text,
  is_active             boolean     NOT NULL DEFAULT true,
  profile_version_hash  text,       -- SHA-256 a seed verziójára
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, is_active)       -- egy felhasználónak legfeljebb egy aktív profilja
                                    -- (részleges constraint; is_active = true egyedi)
);

-- Részleges UNIQUE: csak az aktív profilra
DROP INDEX IF EXISTS uidx_career_profiles_user_active;
CREATE UNIQUE INDEX uidx_career_profiles_user_active
  ON career_profiles (user_id)
  WHERE is_active = true;

ALTER TABLE career_profiles ENABLE ROW LEVEL SECURITY;

-- Felhasználó saját profilját láthatja
CREATE POLICY "career_profiles: user_read_own"
  ON career_profiles FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Felhasználó saját profilját szerkesztheti
CREATE POLICY "career_profiles: user_write_own"
  ON career_profiles FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "career_profiles: service_role_write"
  ON career_profiles FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. career_profile_dimensions – felhasználói aldimenzió preferenciák
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS career_profile_dimensions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  career_profile_id         uuid        NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  sub_dimension_code        text        NOT NULL REFERENCES vkmm_sub_dimensions(code) ON DELETE RESTRICT,
  importance_level          text        NOT NULL DEFAULT 'medium'
                                        CHECK (importance_level IN ('low','medium','high','essential')),
  is_unknown                boolean     NOT NULL DEFAULT false,
  user_note                 text,
  -- ordinal (HI: only max; RP: all 4)
  preferred_max_value       smallint,
  acceptable_max_value      smallint,
  preferred_min_value       smallint,
  acceptable_min_value      smallint,
  -- categorical / set
  preferred_categories_json jsonb,      -- ["opt1"]
  acceptable_categories_json jsonb,     -- ["opt1","opt2"]
  -- boolean
  preferred_boolean         boolean,    -- null = indifferent → ACCEPTABLE
  acceptable_boolean_json   jsonb,      -- [true,false]
  -- frequency
  preferred_min_frequency   text,
  preferred_max_frequency   text,
  acceptable_min_frequency  text,
  acceptable_max_frequency  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (career_profile_id, sub_dimension_code)
);

ALTER TABLE career_profile_dimensions ENABLE ROW LEVEL SECURITY;

-- Felhasználó saját karrierprofil dimenzióit láthatja
CREATE POLICY "career_profile_dimensions: user_read_own"
  ON career_profile_dimensions FOR SELECT
  USING (
    career_profile_id IN (
      SELECT id FROM career_profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- Felhasználó saját karrierprofil dimenzióit szerkesztheti
CREATE POLICY "career_profile_dimensions: user_write_own"
  ON career_profile_dimensions FOR ALL
  USING (
    career_profile_id IN (
      SELECT id FROM career_profiles WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    career_profile_id IN (
      SELECT id FROM career_profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "career_profile_dimensions: service_role_write"
  ON career_profile_dimensions FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. DB Validation Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- 8a. validate_job_role_env_value_type()
CREATE OR REPLACE FUNCTION validate_job_role_env_value_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_comparison_type text;
BEGIN
  -- Lekéri az aldimenzió comparison_type-ját
  SELECT comparison_type INTO v_comparison_type
  FROM vkmm_sub_dimensions
  WHERE code = NEW.sub_dimension_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_role_env_values: ismeretlen sub_dimension_code: %', NEW.sub_dimension_code;
  END IF;

  -- Pontosan egy typed oszlop ellenőrzése (a CHECK constraint is véd, de explicit hibát ad)
  CASE v_comparison_type
    WHEN 'HIGHER_IS_MORE_DEMANDING', 'RANGE_PREFERENCE' THEN
      IF NEW.ordinal_value IS NULL THEN
        RAISE EXCEPTION 'job_role_env_values: comparison_type=% esetén ordinal_value szükséges (sub_dim: %)',
          v_comparison_type, NEW.sub_dimension_code;
      END IF;
      -- tartomány ellenőrzés
      DECLARE
        v_min smallint; v_max smallint;
      BEGIN
        SELECT ordinal_min, ordinal_max INTO v_min, v_max
        FROM vkmm_sub_dimensions WHERE code = NEW.sub_dimension_code;
        IF NEW.ordinal_value < v_min OR NEW.ordinal_value > v_max THEN
          RAISE EXCEPTION 'job_role_env_values: ordinal_value % tartományon kívül [%,%] (sub_dim: %)',
            NEW.ordinal_value, v_min, v_max, NEW.sub_dimension_code;
        END IF;
      END;

    WHEN 'SET_MEMBERSHIP' THEN
      IF NEW.categorical_value IS NULL THEN
        RAISE EXCEPTION 'job_role_env_values: SET_MEMBERSHIP esetén categorical_value szükséges (sub_dim: %)',
          NEW.sub_dimension_code;
      END IF;
      -- értékkészlet ellenőrzés
      IF NOT EXISTS (
        SELECT 1 FROM vkmm_sub_dimensions
        WHERE code = NEW.sub_dimension_code
          AND categorical_options_json @> to_jsonb(NEW.categorical_value)
      ) THEN
        RAISE EXCEPTION 'job_role_env_values: categorical_value ''%'' nem szerepel az allowed listán (sub_dim: %)',
          NEW.categorical_value, NEW.sub_dimension_code;
      END IF;

    WHEN 'BOOLEAN_PREFERENCE' THEN
      -- boolean_value IS NOT NULL (false is érvényes!)
      IF NEW.boolean_value IS NULL THEN
        RAISE EXCEPTION 'job_role_env_values: BOOLEAN_PREFERENCE esetén boolean_value IS NOT NULL kötelező (sub_dim: %)',
          NEW.sub_dimension_code;
      END IF;

    WHEN 'FREQUENCY_RANGE' THEN
      IF NEW.frequency_value IS NULL THEN
        RAISE EXCEPTION 'job_role_env_values: FREQUENCY_RANGE esetén frequency_value szükséges (sub_dim: %)',
          NEW.sub_dimension_code;
      END IF;
      -- értékkészlet ellenőrzés
      IF NOT EXISTS (
        SELECT 1 FROM vkmm_sub_dimensions
        WHERE code = NEW.sub_dimension_code
          AND frequency_options_json @> to_jsonb(NEW.frequency_value)
      ) THEN
        RAISE EXCEPTION 'job_role_env_values: frequency_value ''%'' nem szerepel az allowed listán (sub_dim: %)',
          NEW.frequency_value, NEW.sub_dimension_code;
      END IF;

    ELSE
      RAISE EXCEPTION 'job_role_env_values: ismeretlen comparison_type: %', v_comparison_type;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_validate_job_role_env_value_type
  BEFORE INSERT OR UPDATE ON job_role_env_values
  FOR EACH ROW EXECUTE FUNCTION validate_job_role_env_value_type();

-- 8b. validate_career_profile_dimension_type()
CREATE OR REPLACE FUNCTION validate_career_profile_dimension_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_comparison_type text;
BEGIN
  SELECT comparison_type INTO v_comparison_type
  FROM vkmm_sub_dimensions
  WHERE code = NEW.sub_dimension_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'career_profile_dimensions: ismeretlen sub_dimension_code: %', NEW.sub_dimension_code;
  END IF;

  CASE v_comparison_type
    WHEN 'HIGHER_IS_MORE_DEMANDING' THEN
      -- HI: max-only – preferred_min, acceptable_min nem releváns
      IF NEW.preferred_min_value IS NOT NULL OR NEW.acceptable_min_value IS NOT NULL THEN
        RAISE EXCEPTION 'career_profile_dimensions: HI esetén preferred_min/acceptable_min nem adható meg (sub_dim: %)',
          NEW.sub_dimension_code;
      END IF;

    WHEN 'RANGE_PREFERENCE' THEN
      -- RP: mind a 4 mező szükséges (ha nem unknown)
      IF NOT NEW.is_unknown THEN
        IF NEW.preferred_max_value IS NULL OR NEW.acceptable_max_value IS NULL
          OR NEW.preferred_min_value IS NULL OR NEW.acceptable_min_value IS NULL THEN
          RAISE EXCEPTION 'career_profile_dimensions: RP esetén mind a 4 ordinal mező szükséges (sub_dim: %)',
            NEW.sub_dimension_code;
        END IF;
        -- preferred ⊆ acceptable
        IF NEW.preferred_min_value < NEW.acceptable_min_value
          OR NEW.preferred_max_value > NEW.acceptable_max_value THEN
          RAISE EXCEPTION 'career_profile_dimensions: RP: preferred tartomány nem ⊆ acceptable tartomány (sub_dim: %)',
            NEW.sub_dimension_code;
        END IF;
      END IF;

    WHEN 'SET_MEMBERSHIP' THEN
      IF NOT NEW.is_unknown THEN
        IF NEW.preferred_categories_json IS NULL OR NEW.acceptable_categories_json IS NULL THEN
          RAISE EXCEPTION 'career_profile_dimensions: SM esetén preferred/acceptable categories szükséges (sub_dim: %)',
            NEW.sub_dimension_code;
        END IF;
        -- preferred ⊆ acceptable
        IF NOT (NEW.acceptable_categories_json @> NEW.preferred_categories_json) THEN
          RAISE EXCEPTION 'career_profile_dimensions: SM: preferred_categories nem ⊆ acceptable_categories (sub_dim: %)',
            NEW.sub_dimension_code;
        END IF;
      END IF;

    WHEN 'BOOLEAN_PREFERENCE' THEN
      -- preferred_boolean = null → indifferent → ACCEPTABLE (valid)
      IF NOT NEW.is_unknown THEN
        IF NEW.acceptable_boolean_json IS NULL THEN
          RAISE EXCEPTION 'career_profile_dimensions: BP esetén acceptable_boolean_json szükséges (sub_dim: %)',
            NEW.sub_dimension_code;
        END IF;
        -- ha preferred_boolean != null, benne kell az acceptable listában
        IF NEW.preferred_boolean IS NOT NULL THEN
          IF NOT (NEW.acceptable_boolean_json @> to_jsonb(NEW.preferred_boolean)) THEN
            RAISE EXCEPTION 'career_profile_dimensions: BP: preferred_boolean nincs az acceptable listában (sub_dim: %)',
              NEW.sub_dimension_code;
          END IF;
        END IF;
      END IF;

    WHEN 'FREQUENCY_RANGE' THEN
      -- frequency: min/max párok ellenőrzése (Sprint 2+ részletezi az ordering-et)
      NULL; -- alapvalidáció CHECK constraint szintjén elegendő Sprint 1-ben

    ELSE
      RAISE EXCEPTION 'career_profile_dimensions: ismeretlen comparison_type: %', v_comparison_type;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_validate_career_profile_dimension_type
  BEFORE INSERT OR UPDATE ON career_profile_dimensions
  FOR EACH ROW EXECUTE FUNCTION validate_career_profile_dimension_type();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. updated_at automatikus frissítése
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vk_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_vkmm_dimensions_updated_at
  BEFORE UPDATE ON vkmm_dimensions
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

CREATE OR REPLACE TRIGGER trg_vkmm_sub_dimensions_updated_at
  BEFORE UPDATE ON vkmm_sub_dimensions
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

CREATE OR REPLACE TRIGGER trg_vk_employer_workplaces_updated_at
  BEFORE UPDATE ON vk_employer_workplaces
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

CREATE OR REPLACE TRIGGER trg_vk_job_roles_updated_at
  BEFORE UPDATE ON vk_job_roles
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

CREATE OR REPLACE TRIGGER trg_job_role_env_values_updated_at
  BEFORE UPDATE ON job_role_env_values
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

CREATE OR REPLACE TRIGGER trg_career_profiles_updated_at
  BEFORE UPDATE ON career_profiles
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

CREATE OR REPLACE TRIGGER trg_career_profile_dimensions_updated_at
  BEFORE UPDATE ON career_profile_dimensions
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Seed: vkmm_dimensions (10 fődimenzió)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO vkmm_dimensions (code, name_hu, display_order, is_active) VALUES
  ('env',         'Fizikai munkakörnyezet',       1,  true),
  ('comm',        'Kommunikáció',                 2,  true),
  ('social',      'Szociális munkakörnyezet',     3,  true),
  ('task_struct', 'Feladatstruktúra',             4,  true),
  ('task_dyn',    'Feladat-dinamika',             5,  true),
  ('time',        'Idő és munkaszervezés',        6,  true),
  ('autonomy',    'Autonómia',                    7,  true),
  ('support',     'Támogatás és visszajelzés',    8,  true),
  ('physical',    'Fizikai igénybevétel',         9,  true),
  ('location',    'Helyszín és munkavégzési mód', 10, true)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Seed: vkmm_sub_dimensions (51 aldimenzió)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO vkmm_sub_dimensions (
  code, dimension_code, name_user_hu, name_employer_hu, display_order,
  value_type, comparison_type,
  ordinal_min, ordinal_max, ordinal_labels_json,
  categorical_options_json, categorical_labels_json,
  frequency_options_json, frequency_labels_json,
  user_question_hu, employer_question_hu, clarification_key,
  sensitive_risk, default_importance, is_active
) VALUES

-- ── env ──────────────────────────────────────────────────────────────────────

('env_noise','env','Zajszint','Munkaterület zajszintje',1,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Jellemzően nagyon csendes"},{"v":2,"label":"Többnyire csendes, időnkénti háttérzaj"},{"v":3,"label":"Mérsékelt, rendszeres háttérzaj"},{"v":4,"label":"Gyakran zajos, időnként emelt hangerő szükséges"},{"v":5,"label":"Tartósan magas zajszint vagy intenzív hanghatás"}]',
 NULL,NULL,NULL,NULL,
 'Milyen zajszint mellett tudsz hosszabb ideig kényelmesen dolgozni?',
 'Milyen zajszint jellemző erre a munkaterületre a munkanap nagy részében?',
 'clarify.ask.quiet_space','low','medium',true),

('env_light','env','Megvilágítás','Munkaterület megvilágítása',2,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Tompított, kellemes fényszint"},{"v":2,"label":"Természetes vagy meleg mesterséges fény"},{"v":3,"label":"Közepes intenzitású irodai fény"},{"v":4,"label":"Erős, intenzív megvilágítás"},{"v":5,"label":"Nagyon erős, esetleg villódzó vagy egyenetlen fény"}]',
 NULL,NULL,NULL,NULL,
 'Milyen megvilágítás mellett érzed magad a legjobban munkavégzés közben?',
 'Milyen megvilágítás jellemző a munkaterületre?',
 'clarify.ask.lighting_adjustment','low','medium',true),

('env_visual_busyness','env','Vizuális mozgalmasság','Munkaterület vizuális mozgalmassága',3,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nyugodt, kevés vizuális inger"},{"v":2,"label":"Mérsékelten élénk"},{"v":3,"label":"Rendszeres mozgás a látótérben"},{"v":4,"label":"Élénk, sok mozgás"},{"v":5,"label":"Folyamatosan mozgalmas, sok vizuális inger"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire mozgalmas vizuális tér mellett tudsz könnyen koncentrálni?',
 'Mennyire mozgalmas, vizuálisan élénk a munkaterület?',
 NULL,'low','medium',true),

('env_crowding','env','Zsúfoltság','Népsűrűség a munkaterületen',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Kevés ember, tágas tér"},{"v":2,"label":"Mérsékelt népsűrűség"},{"v":3,"label":"Átlagos irodai forgalom"},{"v":4,"label":"Sűrűn lakott munkaterület"},{"v":5,"label":"Zsúfolt, szoros elrendezés"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire népes, forgalmas környezetben érzed magad jól munkavégzés közben?',
 'Mennyire zsúfolt a munkaterület a tipikus munkanapon?',
 NULL,'low','medium',true),

('env_temperature','env','Hőmérséklet','Munkaterület hőmérséklete',5,'categorical','SET_MEMBERSHIP',
 NULL,NULL,NULL,
 '["cold","comfortable","warm","variable"]',
 '{"cold":"Hűvös (kb. 18°C alatt)","comfortable":"Kényelmes (18–24°C)","warm":"Meleg (24°C felett)","variable":"Ingadozó (nagy különbségekkel)"}',
 NULL,NULL,
 'Milyen hőmérsékletű munkaterületen szívesebben dolgozol? (több is megjelölhető)',
 'Milyen hőmérséklet jellemzi a munkaterületet?',
 NULL,'low','medium',true),

('env_space_type','env','Munkaterület típusa','Munkaterület típusa',6,'categorical','SET_MEMBERSHIP',
 NULL,NULL,NULL,
 '["open_office","shared_room","private","outdoor","industrial","mixed"]',
 '{"open_office":"Nyitott irodai tér","shared_room":"Osztott, kisebb szoba","private":"Egyéni, elkülönített","outdoor":"Szabadtéri","industrial":"Ipari csarnok / raktár","mixed":"Váltakozó helyszín"}',
 NULL,NULL,
 'Milyen típusú munkaterületen szívesebben dolgozol? (több is megjelölhető)',
 'Milyen típusú munkaterületen végzi a munkát ez a munkakör?',
 'clarify.ask.quiet_corner_available','low','medium',true),

-- ── comm ─────────────────────────────────────────────────────────────────────

('comm_phone','comm','Telefonhasználat','Telefonos kommunikáció mértéke',1,'frequency','FREQUENCY_RANGE',
 NULL,NULL,NULL,NULL,NULL,
 '["none","rare","regular","central"]',
 '{"none":"Nincs telefonhasználat","rare":"Alkalmanként, hetente néhány hívás","regular":"Rendszeres, de nem meghatározó","central":"A munkakör nagy részét telefonon végzik"}',
 'Milyen mértékű telefonos kommunikáció passzol számodra?',
 'Milyen mértékű telefonos kommunikációt igényel ez a munkakör?',
 'clarify.ask.phone_alternative','low','medium',true),

('comm_verbal_direct','comm','Személyes szóbeli kommunikáció','Személyes szóbeli kommunikáció igénye',2,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Minimális személyes szóbeli kommunikáció"},{"v":2,"label":"Ritkán szükséges"},{"v":3,"label":"Rendszeres, mérsékelt mértékű"},{"v":4,"label":"Folyamatosan jelen van"},{"v":5,"label":"A munkavégzés elsősorban szóbeli interakción alapul"}]',
 NULL,NULL,NULL,NULL,
 'Mennyi személyes, szóbeli kommunikáció az ideális számodra munkavégzés közben?',
 'Milyen mértékű személyes szóbeli kommunikációt igényel ez a munkakör?',
 NULL,'low','medium',true),

('comm_written','comm','Írásos kommunikáció','Írásos kommunikáció aránya',3,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Minimális írásos kommunikáció"},{"v":2,"label":"Esetenkénti e-mail, üzenet"},{"v":3,"label":"Rendszeres írásos feladatok"},{"v":4,"label":"Döntően írásos"},{"v":5,"label":"Szinte kizárólag írásos kommunikáció"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire előnyös számodra, ha a kommunikáció döntően írásban zajlik?',
 'Milyen mértékben zajlik írásos kommunikáció ebben a munkakörben?',
 NULL,'low','medium',true),

('comm_meetings','comm','Értekezletek / meetingek','Kötelező értekezletek rendszeressége',4,'frequency','FREQUENCY_RANGE',
 NULL,NULL,NULL,NULL,NULL,
 '["none","monthly","weekly","daily","multiple_daily"]',
 '{"none":"Nincs rendszeres értekezlet","monthly":"Havi rendszerességű","weekly":"Heti rendszerességű","daily":"Napi rendszerességű","multiple_daily":"Naponta több alkalommal"}',
 'Milyen arányban illenek a munkanapodba az értekezletek?',
 'Milyen rendszerességgel vannak kötelező értekezletek ebben a munkakörben?',
 NULL,'low','medium',true),

('comm_customer','comm','Ügyfélkontaktus','Közvetlen ügyfélkontaktus mértéke',5,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nincs közvetlen ügyfélkontaktus"},{"v":2,"label":"Alkalmi érintkezés"},{"v":3,"label":"Rendszeres, de nem meghatározó"},{"v":4,"label":"Az ügyfélkontaktus a munkaidő nagy részét kitölti"},{"v":5,"label":"Folyamatos közvetlen ügyfélkapcsolat"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen dolgozol közvetlen ügyfelekkel, vásárlókkal, kliensekkel?',
 'Milyen mértékű közvetlen ügyfélkontaktust igényel ez a munkakör?',
 NULL,'low','medium',true),

('comm_unexpected','comm','Váratlan kommunikációs igény','Váratlan kommunikációs igények gyakorisága',6,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Ritkán fordul elő"},{"v":2,"label":"Alkalmilag"},{"v":3,"label":"Rendszeresen"},{"v":4,"label":"Naponta több alkalommal"},{"v":5,"label":"Folyamatosan"}]',
 NULL,NULL,NULL,NULL,
 'Hogyan érzed magad, ha váratlan kommunikációs igények érnek munkavégzés közben?',
 'Milyen rendszerességgel fordulnak elő váratlan, azonnali kommunikációs igények?',
 'clarify.ask.async_communication_possible','low','medium',true),

-- ── social ───────────────────────────────────────────────────────────────────

('social_team_size','social','Csapatméret','Közvetlen csapat mérete',1,'categorical','SET_MEMBERSHIP',
 NULL,NULL,NULL,
 '["solo","small","medium","large"]',
 '{"solo":"Egyéni munkavégzés (1 fő)","small":"Kiscsapat (2–5 fő)","medium":"Közepes csapat (6–15 fő)","large":"Nagy csapat (15+ fő)"}',
 NULL,NULL,
 'Milyen méretű csapatban szívesebben dolgozol? (több is megjelölhető)',
 'Hány fős közvetlen csapatban végzi a munkáját ez a munkakör?',
 NULL,'low','medium',true),

('social_collaboration','social','Együttműködés intenzitása','Csapatos együttműködés mértéke',2,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Szinte kizárólag önállóan"},{"v":2,"label":"Főleg önállóan, alkalmi együttműködéssel"},{"v":3,"label":"Önálló és csapatmunka vegyesen"},{"v":4,"label":"Főleg csapatmunka"},{"v":5,"label":"Szinte folyamatos csapatmunka"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen dolgozol másokkal szorosan együtt, szemben az önálló munkavégzéssel?',
 'Milyen mértékű csapatos együttműködést igényel ez a munkakör?',
 NULL,'low','medium',true),

('social_solo_work','social','Önálló munkavégzés aránya','Önálló munkavégzés aránya',3,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Szinte folyamatos csapatmunka"},{"v":2,"label":"Főleg csapatos, kevés önállósággal"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Főleg önálló munkavégzés"},{"v":5,"label":"Szinte kizárólag önálló"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen dolgozol önállóan, külső visszajelzés nélkül hosszabb időn át?',
 'Milyen arányban jellemző az önálló munkavégzés ebben a munkakörben?',
 NULL,'low','medium',true),

('social_public_contact','social','Nyilvánossággal való kontaktus','Nyilvánossággal való kontaktus',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nincs"},{"v":2,"label":"Alkalmi"},{"v":3,"label":"Rendszeres"},{"v":4,"label":"A munkaidő nagy részében"},{"v":5,"label":"Folyamatos"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen dolgozol ismeretlen emberekkel közvetlen kontaktusban?',
 'Milyen mértékű kontaktust igényel ez a munkakör a nyilvánossággal?',
 NULL,'low','medium',true),

('social_manager_contact','social','Közvetlen vezető kontaktusa','Közvetlen vezető kontaktus rendszeressége',5,'frequency','FREQUENCY_RANGE',
 NULL,NULL,NULL,NULL,NULL,
 '["minimal","weekly","daily","intensive"]',
 '{"minimal":"Ritkán, csak szükség esetén","weekly":"Heti rendszeresség","daily":"Naponta","intensive":"Szinte folyamatosan elérhető vagy jelen van"}',
 'Milyen mértékű közvetlen vezető-kontaktus illeszkedik hozzád legjobban?',
 'Milyen rendszerességgel van közvetlen kapcsolatban a munkavállaló a közvetlen vezetőjével?',
 NULL,'low','medium',true),

-- ── task_struct ───────────────────────────────────────────────────────────────

('task_instruction_clarity','task_struct','Instrukciók egyértelműsége','Feladatinstrukciók egyértelműsége',1,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Minden feladat egyértelmű instrukcióval érkezik"},{"v":2,"label":"Általában egyértelmű"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Gyakran pontosítás szükséges"},{"v":5,"label":"Ritkán egyértelmű, rendszeres értelmezés szükséges"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy a feladataid egyértelműen körülírva legyenek?',
 'Milyen mértékben érkeznek egyértelmű instrukciókkal a feladatok?',
 'clarify.ask.written_task_description','low','medium',true),

('task_written_instruction','task_struct','Írásos instrukció elérhetősége','Írásos dokumentáció elérhetősége',2,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Minden feladathoz írásos dokumentáció elérhető"},{"v":2,"label":"Általában elérhető"},{"v":3,"label":"Részben elérhető"},{"v":4,"label":"Ritkán elérhető"},{"v":5,"label":"Nem elérhető, szóban közölt instrukciók jellemzők"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire segíti a munkavégzésedet, ha a feladatok írásban is rendelkezésre állnak?',
 'Milyen mértékben érhetők el írásos dokumentációk a munkakörben?',
 'clarify.ask.digital_task_system','low','medium',true),

('task_repetition','task_struct','Feladatok ismétlődése','Feladatok ismétlődési aránya',3,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Naponta változó feladatok"},{"v":2,"label":"Főleg változatos, némi ismétlődéssel"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Főleg ismétlődő feladatok"},{"v":5,"label":"Erősen ismétlődő, rutinszerű"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire illeszkedik hozzád az ismétlődő, rutinszerű feladatok végzése?',
 'Milyen mértékben ismétlődők a feladatok napról napra?',
 NULL,'low','medium',true),

('task_complexity','task_struct','Feladatok összetettsége','Feladatok összetettségi szintje',4,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Egyszerű, egylépéses feladatok"},{"v":2,"label":"Néhány lépéses feladatok"},{"v":3,"label":"Mérsékelt összetettség"},{"v":4,"label":"Több lépéses, változatos feladatok"},{"v":5,"label":"Komplex, hosszú folyamatok, magas kognitív igény"}]',
 NULL,NULL,NULL,NULL,
 'Milyen összetettségű feladatok illeszkednek hozzád legjobban?',
 'Milyen mértékben összetett a munkakör feladatstruktúrája?',
 NULL,'low','medium',true),

('task_priority_clarity','task_struct','Prioritások egyértelműsége','Feladatok prioritásainak egyértelműsége',5,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"A prioritások mindig egyértelműek"},{"v":2,"label":"Általában egyértelműek"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Gyakran szükséges egyeztetni"},{"v":5,"label":"A prioritások ritkán egyértelműek"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy a feladataid sorrendje egyértelműen meghatározott legyen?',
 'Milyen mértékben egyértelműek a feladatok prioritásai?',
 'clarify.ask.priority_system','low','medium',true),

-- ── task_dyn ─────────────────────────────────────────────────────────────────

('task_switching','task_dyn','Feladatváltás','Feladatváltás rendszeressége',1,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Ritkán szükséges feladatot váltani"},{"v":2,"label":"Alkalmilag"},{"v":3,"label":"Rendszeresen"},{"v":4,"label":"Naponta többször"},{"v":5,"label":"Folyamatos feladatváltás"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire kényelmes számodra, ha munka közben rendszeresen váltanod kell más feladatra?',
 'Milyen rendszerességgel szükséges feladatot váltani ebben a munkakörben?',
 NULL,'low','medium',true),

('task_parallel','task_dyn','Párhuzamos feladatok','Párhuzamos feladatok száma',2,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Jellemzően egyetlen feladat egyszerre"},{"v":2,"label":"2–3 párhuzamos feladat"},{"v":3,"label":"Közepes párhuzamosság"},{"v":4,"label":"Sok párhuzamos feladat"},{"v":5,"label":"Folyamatosan több, egyidejűleg nyitott feladat"}]',
 NULL,NULL,NULL,NULL,
 'Hogyan érzed magad, ha egyszerre több különböző feladatot kell nyitva tartanod?',
 'Milyen mértékű párhuzamos feladatkezelést igényel ez a munkakör?',
 NULL,'low','medium',true),

('task_interruptions','task_dyn','Megszakítások','Megszakítások gyakorisága',3,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Ritka megszakítás, hosszú koncentrált időszakok lehetségesek"},{"v":2,"label":"Alkalmi megszakítás"},{"v":3,"label":"Rendszeres megszakítás"},{"v":4,"label":"Naponta többszöri megszakítás"},{"v":5,"label":"Folyamatos megszakítások, nehéz hosszan koncentrálni"}]',
 NULL,NULL,NULL,NULL,
 'Hogyan érzed magad, ha munkavégzés közben rendszeresen megszakítanak?',
 'Milyen rendszerességgel szakítják meg a munkavállalót munka közben?',
 'clarify.ask.focus_block_possible','low','medium',true),

('task_unexpected','task_dyn','Váratlan feladatok','Váratlan feladatok előfordulása',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Ritka"},{"v":2,"label":"Alkalmi"},{"v":3,"label":"Rendszeres"},{"v":4,"label":"Heti több alkalom"},{"v":5,"label":"Szinte naponta"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire érzed könnyűnek, ha váratlan, azonnali feladatok kerülnek a napirendedbe?',
 'Milyen rendszerességgel merülnek fel váratlan, előre nem tervezett feladatok?',
 NULL,'low','medium',true),

-- ── time ─────────────────────────────────────────────────────────────────────

('time_schedule_type','time','Munkarend típusa','Munkarend típusa',1,'categorical','SET_MEMBERSHIP',
 NULL,NULL,NULL,
 '["fixed","flex","shift","on_call","irregular"]',
 '{"fixed":"Rögzített munkarend","flex":"Rugalmas kezdési/záró idő","shift":"Műszakos","on_call":"Készenlét (on-call)","irregular":"Rendszertelen"}',
 NULL,NULL,
 'Milyen munkarendben szívesebben dolgozol? (több is megjelölhető)',
 'Milyen munkarendet alkalmaz ez a munkakör?',
 NULL,'low','medium',true),

('time_schedule_variability','time','Munkarend változékonysága','Munkarend változékonysága',2,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Rögzített, mindig azonos"},{"v":2,"label":"Alapvetően stabil, ritkán változik"},{"v":3,"label":"Rendszeres, de kezelhető változások"},{"v":4,"label":"Heti szinten is változhat"},{"v":5,"label":"Rendszeresen és váratlanul változik"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy a munkarendedre előre számíthass?',
 'Milyen mértékben változik a munkavállalók munkarendje rövid távon?',
 'clarify.ask.schedule_advance_notice','low','medium',true),

('time_deadline_pressure','time','Határidős nyomás','Határidős nyomás mértéke',3,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Ritka határidő, alacsony nyomás"},{"v":2,"label":"Alkalmi határidők"},{"v":3,"label":"Rendszeres, de kezelhető határidők"},{"v":4,"label":"Rendszeres, szoros határidők"},{"v":5,"label":"Folyamatos, erős határidős nyomás"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire viseled jól a szoros határidőkkel járó munkavégzést?',
 'Milyen mértékű határidős nyomás jellemző erre a munkakörre?',
 NULL,'low','medium',true),

('time_break_predictability','time','Szünetek kiszámíthatósága','Szünetek kiszámíthatósága',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Szünetek rögzített, tervezett időpontban"},{"v":2,"label":"Általában kiszámítható"},{"v":3,"label":"Részben kiszámítható"},{"v":4,"label":"Ritkán kiszámítható"},{"v":5,"label":"A szünetek rendszeresen csúsznak vagy kiszámíthatatlanok"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy a szüneteid kiszámítható időpontban legyenek?',
 'Milyen mértékben kiszámíthatók a szünetek időpontjai ebben a munkakörben?',
 'clarify.ask.break_scheduling','low','medium',true),

('time_overtime','time','Túlóra / rugalmasság elvárása','Túlóra / munkaidőn túli elvárás',5,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Soha"},{"v":2,"label":"Ritkán"},{"v":3,"label":"Alkalmanként elvárás"},{"v":4,"label":"Rendszeres"},{"v":5,"label":"Folyamatos elvárás"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire passzol számodra, ha időnként a munkaidőn túl is szükséges elérhetőnek lenned?',
 'Milyen rendszerességgel szükséges túlóra vagy munkaidőn túli elérhetőség?',
 NULL,'low','medium',true),

('time_shift_work','time','Műszakos munka','Műszakos munkavégzés',6,'boolean','BOOLEAN_PREFERENCE',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Szívesen dolgoznál-e műszakos rendszerben?',
 'Ez a munkakör műszakos munkavégzést igényel?',
 NULL,'low','medium',true),

-- ── autonomy ─────────────────────────────────────────────────────────────────

('autonomy_pace','autonomy','Saját munkatempa kontrollja','Munkavégzési tempó önállóságának szintje',1,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Kötött tempó, külső tényező szabja meg"},{"v":2,"label":"Részben kötött"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Főleg saját tempó"},{"v":5,"label":"Teljesen önállóan szabályozható"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy magad szabályozd a munkád tempóját?',
 'Milyen mértékben tudja a munkavállaló maga szabályozni a munkavégzési tempóját?',
 NULL,'low','medium',true),

('autonomy_task_order','autonomy','Feladatsorrend meghatározása','Feladatsorrend szabadsága',2,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Kötött sorrend"},{"v":2,"label":"Részben kötött"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Főleg szabad sorrend"},{"v":5,"label":"Teljesen szabad sorrend"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen határozod meg magad, milyen sorrendben végzed a feladataidat?',
 'Milyen mértékben határozhatja meg a munkavállaló a feladatok sorrendjét?',
 NULL,'low','medium',true),

('autonomy_decision','autonomy','Önálló döntések aránya','Önálló döntési lehetőség',3,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Szinte minden döntést a vezető hoz"},{"v":2,"label":"Kevés önálló döntés"},{"v":3,"label":"Mérsékelt önállóság"},{"v":4,"label":"Sok önálló döntés"},{"v":5,"label":"Teljesen önálló döntéshozatal"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen hozol önállóan döntéseket a munkában?',
 'Milyen mértékben hozhat önállóan döntéseket a munkavállaló?',
 NULL,'low','medium',true),

('autonomy_help_access','autonomy','Segítségkérés elérhetősége','Segítség elérhetősége',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Bármikor azonnal elérhető segítség"},{"v":2,"label":"Általában elérhető"},{"v":3,"label":"Esetenként elérhető"},{"v":4,"label":"Ritkán elérhető"},{"v":5,"label":"Nehezen vagy alig elérhető"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy kérdés esetén könnyen kérhess segítséget?',
 'Milyen mértékben elérhető segítség, ha a munkavállaló problémája merül fel?',
 'clarify.ask.contact_person_available','low','medium',true),

-- ── support ───────────────────────────────────────────────────────────────────

('support_contact_person','support','Kijelölt kapcsolattartó','Kijelölt kapcsolattartó személy',1,'boolean','BOOLEAN_PREFERENCE',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Fontos-e számodra, hogy legyen egy kijelölt személy, akihez kérdéssel fordulhatsz?',
 'Van-e kijelölt kapcsolattartó személy a munkavállaló számára?',
 NULL,'low','medium',true),

('support_mentor','support','Mentor elérhetősége','Mentor / bevezető kolléga elérhető',2,'boolean','BOOLEAN_PREFERENCE',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Segítségedre lenne-e egy tapasztaltabb kolléga, aki bevezet a munkába?',
 'Van-e elérhető mentor vagy tapasztalt kolléga az új munkavállaló segítségére?',
 NULL,'low','medium',true),

('support_feedback_freq','support','Visszajelzés rendszeressége','Visszajelzés rendszeressége',3,'frequency','FREQUENCY_RANGE',
 NULL,NULL,NULL,NULL,NULL,
 '["none","monthly","weekly","daily"]',
 '{"none":"Nincs rendszeres visszajelzés","monthly":"Havi rendszerességű","weekly":"Heti rendszerességű","daily":"Naponta"}',
 'Milyen rendszerességgel szeretnél visszajelzést kapni a munkádról?',
 'Milyen rendszerességgel ad visszajelzést a vezető a munkavállaló munkájáról?',
 NULL,'low','medium',true),

('support_onboarding_quality','support','Betanítás strukturáltsága','Betanítási folyamat minősége',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Teljes, strukturált betanítási folyamat"},{"v":2,"label":"Általában jól szervezett"},{"v":3,"label":"Részben strukturált"},{"v":4,"label":"Kevéssé szervezett"},{"v":5,"label":"Nincs formális betanítási rendszer"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy a munka kezdetén részletes betanításban vegyél részt?',
 'Mennyire strukturált a betanítási folyamat ennél a munkakörnél?',
 'clarify.ask.onboarding_plan_exists','low','medium',true),

('support_change_notice','support','Változások előzetes jelzése','Változások kommunikálása',5,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Változásokat mindig előre jelzik"},{"v":2,"label":"Általában előre jelzik"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Ritkán jelzik előre"},{"v":5,"label":"Változások rendszeresen váratlanul érkeznek"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire fontos számodra, hogy előre értesülj a változásokról?',
 'Milyen mértékben értesítik előre a munkavállalókat a változásokról?',
 'clarify.ask.change_communication_process','low','medium',true),

('support_visual_instruction','support','Vizuális instrukciók','Vizuális instrukciók elérhetősége',6,'boolean','BOOLEAN_PREFERENCE',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Segít-e a munkádban, ha a folyamatokat vizuálisan is bemutatják?',
 'Elérhetők-e vizuális instrukciók (képes útmutatók, folyamatábrák) a feladatokhoz?',
 NULL,'low','medium',true),

-- ── physical ─────────────────────────────────────────────────────────────────

('physical_posture','physical','Munkavégzési testhelyzet','Jellemző munkavégzési testhelyzet',1,'categorical','SET_MEMBERSHIP',
 NULL,NULL,NULL,
 '["seated","standing","mixed","mobile"]',
 '{"seated":"Ülő munkavégzés","standing":"Álló munkavégzés","mixed":"Ülő és álló vegyesen","mobile":"Folyamatosan mozgásban"}',
 NULL,NULL,
 'Milyen testhelyzetben dolgozol a legkényelmesebben? (több is megjelölhető)',
 'Milyen testhelyzet jellemző erre a munkakörre?',
 NULL,'low','medium',true),

('physical_lifting','physical','Fizikai erőkifejtés / emelés','Fizikai erőkifejtés / emelési igény',2,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nincs fizikai erőkifejtés"},{"v":2,"label":"Enyhe (legfeljebb könnyű tárgyak)"},{"v":3,"label":"Mérsékelt"},{"v":4,"label":"Rendszeres, néha nehezebb tárgyak"},{"v":5,"label":"Folyamatos, nehéz fizikai munka"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire viseled jól a rendszeres fizikai erőkifejtést a munkában?',
 'Milyen mértékű fizikai erőkifejtést igényel ez a munkakör?',
 NULL,'low','medium',true),

('physical_fine_motor','physical','Finommotorika','Finommotorika igénye',3,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nincs precíziós kézmozgás szükséges"},{"v":2,"label":"Enyhe"},{"v":3,"label":"Mérsékelt"},{"v":4,"label":"Rendszeres precizitás szükséges"},{"v":5,"label":"Folyamatos, nagy precizitást igénylő kézimunka"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen végzel precíziós, aprólékos kézimunkát?',
 'Milyen mértékű finommotorikát igényel ez a munkakör?',
 NULL,'low','medium',true),

('physical_repetitive_motion','physical','Ismétlődő mozgás','Ismétlődő mozgás aránya',4,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nincs"},{"v":2,"label":"Ritka"},{"v":3,"label":"Mérsékelt"},{"v":4,"label":"Rendszeres"},{"v":5,"label":"Folyamatos, erősen ismétlődő mozgássor"}]',
 NULL,NULL,NULL,NULL,
 'Hogyan viseled, ha munkavégzés közben hosszasan ismétlődő mozgássorokat kell végezni?',
 'Milyen mértékű ismétlődő mozgás jellemző erre a munkakörre?',
 NULL,'low','medium',true),

('physical_outdoor','physical','Szabadtéri munka','Szabadtéri munkavégzés aránya',5,'ordinal','RANGE_PREFERENCE',
 1,5,'[{"v":1,"label":"Teljes beltér"},{"v":2,"label":"Főleg beltér, alkalmi kültérrel"},{"v":3,"label":"Vegyes"},{"v":4,"label":"Főleg kültér"},{"v":5,"label":"Teljes kültér"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire szívesen végzed a munkád egy részét szabadtéren?',
 'Milyen arányban végzik a munkát szabadtéren?',
 NULL,'low','medium',true),

-- ── location ─────────────────────────────────────────────────────────────────

('location_type','location','Munkavégzés helye','Munkavégzés helye (típus)',1,'categorical','SET_MEMBERSHIP',
 NULL,NULL,NULL,
 '["office","remote","hybrid","on_site","field"]',
 '{"office":"Irodai (teljes jelenlét)","remote":"Teljes távmunka","hybrid":"Irodai + táv kombináció","on_site":"Helyszíni (pl. ügyfélnél)","field":"Terepen"}',
 NULL,NULL,
 'Hol szívesebben végzed a munkádat? (több is megjelölhető)',
 'Hol végzik a munkát ebben a munkakörben?',
 NULL,'low','medium',true),

('location_travel','location','Utazás / helyszínváltás','Utazás / helyszínváltás rendszeressége',2,'ordinal','HIGHER_IS_MORE_DEMANDING',
 1,5,'[{"v":1,"label":"Nincs utazás"},{"v":2,"label":"Ritka"},{"v":3,"label":"Heti szinten"},{"v":4,"label":"Napi szinten"},{"v":5,"label":"Folyamatos helyközi utazás"}]',
 NULL,NULL,NULL,NULL,
 'Mennyire vállalod szívesen a rendszeres utazást munka céljából?',
 'Milyen rendszerességgel szükséges utazni ebben a munkakörben?',
 NULL,'low','medium',true),

('location_open_office','location','Nyitott irodai tér','Nyitott irodai tér jellemzi a munkakörnyezetet',3,'boolean','BOOLEAN_PREFERENCE',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Szívesen dolgozol-e nyitott, közös irodai térben?',
 'Nyitott irodai tér jellemzi-e a munkakörnyezetet?',
 NULL,'low','medium',true),

('location_quiet_space','location','Csendesebb munkaterület','Csendesebb munkaterület elérhető',4,'boolean','BOOLEAN_PREFERENCE',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Fontos-e számodra, hogy munkavégzés közben elérhető legyen egy csendesebb sarok?',
 'Elérhető-e a munkavállaló számára csendesebb munkaterület, ha szükséges?',
 'clarify.ask.quiet_space_access','low','medium',true)

ON CONFLICT (code) DO NOTHING;
