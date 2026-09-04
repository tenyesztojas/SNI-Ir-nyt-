-- Védett Karrier – Sprint 5: Compatibility Engine
-- Létrehozás: 2026-09-03
-- SOHA NE módosítsd korábbi migration fájlokat!
-- NE alkalmazd production DB-re explicit jóváhagyás nélkül!

-- ─────────────────────────────────────────────────────────────────────────────
-- vk_compatibility_results
--
-- User saját compatibility eredményét tárolja.
-- EMPLOYER NEM FÉR HOZZÁ – nincs employer RLS policy szándékosan!
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vk_compatibility_results (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  career_profile_id               uuid        NOT NULL,
  career_profile_version_hash     text        NOT NULL,
  job_role_id                     uuid        NOT NULL REFERENCES vk_job_roles(id) ON DELETE CASCADE,
  job_role_profile_version_hash   text        NOT NULL,
  compatibility_engine_version    text        NOT NULL DEFAULT '1.0.0',
  -- jsonb tömb: CompatibilityResult[] (sub_dimension_code, status, dataConfidence, explanationKey, employerValue)
  dimension_results               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  -- Egy user egy job role-hoz csak egy eredményt tart (upsert-tel frissül)
  UNIQUE (user_id, job_role_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS – felhasználói adatvédelem
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vk_compatibility_results ENABLE ROW LEVEL SECURITY;

-- User csak SAJÁT eredményét látja és módosítja
CREATE POLICY "vk_compat_user_own"
  ON vk_compatibility_results
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ⚠ EMPLOYER POLICY SZÁNDÉKOSAN HIÁNYZIK.
-- Az employer szerepkörű felhasználó NEM fér hozzá a compatibility_results táblához.
-- RLS backstop: employer auth.uid() ≠ más user user_id → minden sor kizárva.
-- Nincs public policy sem.

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_vk_compat_result_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER vk_compat_result_updated_at
  BEFORE UPDATE ON vk_compatibility_results
  FOR EACH ROW EXECUTE FUNCTION update_vk_compat_result_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Index: user + job_role gyors lookup (stale check, load)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vk_compat_results_user_role_idx
  ON vk_compatibility_results (user_id, job_role_id);
