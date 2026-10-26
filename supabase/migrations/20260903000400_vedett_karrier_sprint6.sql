-- ============================================================
-- Védett Karrier – Sprint 6 Migration
-- Job Opportunity + Preferencialap (Work Preference Document)
--
-- KRITIKUS szabályok:
-- • RLS workaroundként NEM kapcsoljuk ki
-- • service_role key soha nem kerül kliensre
-- • Employer NEM fér hozzá work_preference_documents-hoz
-- • User profiladat NEM kerül munkáltatóhoz explicit user action nélkül
-- • Nincs AI matching, alkalmassági pontszám, automatikus jelöltértékelés
-- • NE módosíts korábbi migration fájlt
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vk_opportunities
--    Egy aktív munkakörre feladott, időhöz kötött lehetőség.
--    A user KÜLSŐLEG lép kapcsolatba a munkáltatóval (nincs belső ATS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vk_opportunities (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id                 uuid NOT NULL
    REFERENCES employers(id) ON DELETE CASCADE,
  job_role_id                 uuid NOT NULL
    REFERENCES vk_job_roles(id) ON DELETE CASCADE,

  -- Status lifecycle: draft → active → closed
  status                      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),

  -- Opcionális override: ha eltér a munkakör nevétől
  title_override_hu           text,
  description_hu              text NOT NULL,
  requirements_hu             text,

  -- Külső kapcsolatfelvétel módja (NO internal ATS)
  application_method          text NOT NULL
    CHECK (application_method IN ('EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS')),
  application_url             text,
  application_email           text,
  application_instructions_hu text,

  -- Opcionális kapcsolattartó (NEM jelöltértékelési cél, csak kapcsolatfelvétel)
  contact_person_name         text,
  contact_person_title        text,

  -- Érvényességi idő
  valid_from                  date,
  valid_until                 date,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Index: aktív lehetőségek hatékony listázásához
CREATE INDEX IF NOT EXISTS idx_vk_opportunities_status
  ON vk_opportunities(status);

CREATE INDEX IF NOT EXISTS idx_vk_opportunities_job_role
  ON vk_opportunities(job_role_id);

CREATE INDEX IF NOT EXISTS idx_vk_opportunities_employer
  ON vk_opportunities(employer_id);

-- Auto updated_at trigger
CREATE OR REPLACE FUNCTION update_vk_opportunities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vk_opportunities_updated_at
  BEFORE UPDATE ON vk_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_vk_opportunities_updated_at();

-- RLS
ALTER TABLE vk_opportunities ENABLE ROW LEVEL SECURITY;

-- Publikus (anon + auth): csak aktív lehetőségek láthatók
CREATE POLICY "vk_opp_public_select_active"
  ON vk_opportunities FOR SELECT
  USING (status = 'active');

-- Employer: saját lehetőségei (draft + active + closed)
-- Ownership: employer_id egyezés
CREATE POLICY "vk_opp_employer_own_select"
  ON vk_opportunities FOR SELECT
  USING (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "vk_opp_employer_own_insert"
  ON vk_opportunities FOR INSERT
  WITH CHECK (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "vk_opp_employer_own_update"
  ON vk_opportunities FOR UPDATE
  USING (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    employer_id IN (
      SELECT id FROM employers WHERE user_id = auth.uid()
    )
  );

-- User NEM írhat, NEM törölhet opportunity-t
-- Employer NEM törölhet (close = státuszváltás, nem törlés)
-- → DELETE policy SZÁNDÉKOSAN HIÁNYZIK

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. work_preference_documents (Preferencialap)
--    User által kézzel összeállított, determinisztikus szöveges dokumentum.
--    Privát alapértelmezés. User explicit megosztásával shareable.
--    NEM CV, NEM önéletrajz, NEM AI által generált.
--    Employer: NEM fér hozzá (nincs employer policy).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_preference_documents (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  career_profile_id           uuid NOT NULL
    REFERENCES career_profiles(id) ON DELETE CASCADE,

  -- Felhasználó által adott cím
  title_hu                    text NOT NULL DEFAULT 'Munkapreferencia-lapom',

  -- Kiválasztott aldimenzió kódok (user dönt, mely dimenziók szerepeljenek)
  selected_dimension_codes    jsonb NOT NULL DEFAULT '[]',

  -- Determinisztikus szöveges tartalom (NEM AI)
  generated_text_hu           text NOT NULL DEFAULT '',

  -- Megosztás: user explicit dönt (alapértelmezett: privát)
  is_shared                   boolean NOT NULL DEFAULT false,
  share_token                 uuid UNIQUE DEFAULT NULL,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_pref_docs_user
  ON work_preference_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_work_pref_docs_share_token
  ON work_preference_documents(share_token)
  WHERE share_token IS NOT NULL;

-- Auto updated_at trigger
CREATE OR REPLACE FUNCTION update_work_pref_docs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_pref_docs_updated_at
  BEFORE UPDATE ON work_preference_documents
  FOR EACH ROW EXECUTE FUNCTION update_work_pref_docs_updated_at();

-- RLS
ALTER TABLE work_preference_documents ENABLE ROW LEVEL SECURITY;

-- User: csak saját dokumentumait éri el (ALL)
CREATE POLICY "work_pref_doc_user_own"
  ON work_preference_documents FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Megosztott dokumentum: share_token alapján anon is olvashatja
-- FONTOS: csak is_shared=true ÉS share_token NOT NULL esetén
CREATE POLICY "work_pref_doc_shared_read"
  ON work_preference_documents FOR SELECT
  USING (is_shared = true AND share_token IS NOT NULL);

-- Employer policy SZÁNDÉKOSAN HIÁNYZIK:
--   Employer NEM fér hozzá a Preferencialaphoz.
--   A user explicit megosztási döntésétől független.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Employer opportunity action for vk_job_roles
--    Lehetőség hozzáadásához szükséges, hogy a munkakör active legyen.
--    Ez app-logika szinten érvényesítve (RLS backstop nem szükséges).
-- ─────────────────────────────────────────────────────────────────────────────
-- (Nincs schema változás a vk_job_roles táblán – csak app szint.)
