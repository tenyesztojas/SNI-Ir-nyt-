-- ─────────────────────────────────────────────────────────────────────────────
-- Védett Karrier – Sprint 4 Migration
-- Munkáltatói Rendszer + Munkakör-Térkép + VKMM Employer Wizard
-- Dátum: 2026-09-03
--
-- NEM MÓDOSÍT legacy /vedettmunka táblákat.
-- NEM TÖRLI meglévő VK táblákat.
-- NEM ALKALMAZ production DB-n explicit jóváhagyás nélkül.
--
-- Csak ALTER TABLE – az alap táblák (vk_employer_workplaces, vk_job_roles,
-- job_role_env_values) a Sprint 1 foundation migrációban már léteznek.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vk_employer_workplaces – telephely bővítése
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vk_employer_workplaces
  ADD COLUMN IF NOT EXISTS address_line  text,
  ADD COLUMN IF NOT EXISTS district      text,
  ADD COLUMN IF NOT EXISTS country_code  text NOT NULL DEFAULT 'HU';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vk_job_roles – munkakör bővítése Sprint 4 mezőkkel
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vk_job_roles
  -- Sprint 3 job_families kapcsolat
  ADD COLUMN IF NOT EXISTS job_family_slug        text
    REFERENCES job_families(slug) ON DELETE SET NULL,
  -- opcionális iparág
  ADD COLUMN IF NOT EXISTS industry_slug          text
    REFERENCES industries(slug) ON DELETE SET NULL,
  -- tényszerű összefoglaló és feladatlista
  ADD COLUMN IF NOT EXISTS summary_hu             text,
  ADD COLUMN IF NOT EXISTS main_tasks_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- profil kitöltési státusz (0–100)
  ADD COLUMN IF NOT EXISTS profile_completion_pct smallint NOT NULL DEFAULT 0
    CONSTRAINT ck_completion_pct CHECK (profile_completion_pct BETWEEN 0 AND 100),
  -- determinisztikus profil hash (ugyanaz a szemantikai tartalom → ugyanaz a hash)
  ADD COLUMN IF NOT EXISTS profile_version_hash   text,
  -- wizard részbeni mentés: utoljára befejezett lépés
  ADD COLUMN IF NOT EXISTS last_saved_step        smallint NOT NULL DEFAULT 0
    CONSTRAINT ck_last_saved_step CHECK (last_saved_step BETWEEN 0 AND 7);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger – vk_employer_workplaces (ha nem volt még)
-- ─────────────────────────────────────────────────────────────────────────────
-- Triggerek a Sprint 1 foundation migrációban már léteznek.
-- Új mezők automatikusan benne lesznek az UPDATE-ben.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Publikus munkakör nézet (employer_note nélkül)
-- ─────────────────────────────────────────────────────────────────────────────
-- A job_role_env_values.employer_note soha nem public.
-- Ez RLS szinten már biztosítva, de egy nézetet is létrehozunk a kényelmi
-- publikus lekérdezésekhez – csak ACTIVE role esetén, employer_note kihagyva.

CREATE OR REPLACE VIEW vk_public_job_role_env_values AS
SELECT
  jrev.id,
  jrev.job_role_id,
  jrev.sub_dimension_code,
  jrev.ordinal_value,
  jrev.categorical_value,
  jrev.boolean_value,
  jrev.frequency_value,
  jrev.data_source,
  jrev.public_context_note,
  jrev.last_reviewed_at,
  jrev.created_at,
  jrev.updated_at
  -- employer_note szándékosan kimarad
FROM job_role_env_values jrev
JOIN vk_job_roles jr ON jr.id = jrev.job_role_id
WHERE jr.status = 'active'
  AND (jr.expires_at IS NULL OR jr.expires_at > now());

-- ─────────────────────────────────────────────────────────────────────────────
-- MEGJEGYZÉS: Sem ez a migráció, sem a Sprint 4 kód nem módosít
-- /vedettmunka business logic táblákat (employers, job_posts, job_applications_log,
-- vm_job_attributes, vm_work_profiles, vm_consent_log, vm_admin_audit_log stb.)
-- ─────────────────────────────────────────────────────────────────────────────
