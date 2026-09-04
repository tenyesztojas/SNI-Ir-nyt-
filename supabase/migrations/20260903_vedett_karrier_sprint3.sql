-- ============================================================
-- Védett Karrier – Sprint 3: Képességtérkép + Karrieriránytű
-- 20260903_vedett_karrier_sprint3.sql
--
-- ADDITIVE ONLY. Korábbi migration NEM módosítva.
-- NE deployolj productionbe manuális review nélkül.
-- ============================================================

-- updated_at trigger (ha még nem létezne)
CREATE OR REPLACE FUNCTION vk_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- 1. INDUSTRIES  (reference table, public read)
-- ============================================================
CREATE TABLE IF NOT EXISTS industries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name_hu       text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industries_public_read" ON industries;
CREATE POLICY "industries_public_read"
  ON industries FOR SELECT
  USING (is_active = true);

-- ============================================================
-- 2. JOB_FAMILIES  (reference table, public read)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_families (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        text NOT NULL UNIQUE,
  name_hu                     text NOT NULL,
  description_hu              text NOT NULL,
  task_pattern_summary        text NOT NULL,
  typical_tasks_json          jsonb NOT NULL DEFAULT '[]',
  core_skills_json            jsonb NOT NULL DEFAULT '[]',   -- skill codes
  trainable_skills_json       jsonb NOT NULL DEFAULT '[]',   -- skill codes
  example_roles_json          jsonb NOT NULL DEFAULT '[]',
  entry_threshold_description text NOT NULL DEFAULT '',
  growth_paths_json           jsonb NOT NULL DEFAULT '[]',
  display_order               integer NOT NULL DEFAULT 0,
  is_active                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_families_public_read" ON job_families;
CREATE POLICY "job_families_public_read"
  ON job_families FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "job_families_service_write" ON job_families;
CREATE POLICY "job_families_service_write"
  ON job_families FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER vk_job_families_updated_at
  BEFORE UPDATE ON job_families
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

-- ============================================================
-- 3. SKILLS  (reference table, public read)
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name_hu       text NOT NULL,
  category      text NOT NULL CHECK (category IN ('digital','manual','cognitive','interpersonal','physical')),
  is_trainable  boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "skills_public_read" ON skills;
CREATE POLICY "skills_public_read"
  ON skills FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "skills_service_write" ON skills;
CREATE POLICY "skills_service_write"
  ON skills FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 4. JOB_FAMILY_SKILLS  (reference table, public read)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_family_skills (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_family_id  uuid NOT NULL REFERENCES job_families(id) ON DELETE CASCADE,
  skill_id       uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  relevance      text NOT NULL CHECK (relevance IN ('core','preferred','trainable')),
  UNIQUE (job_family_id, skill_id)
);

ALTER TABLE job_family_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_family_skills_public_read" ON job_family_skills;
CREATE POLICY "job_family_skills_public_read"
  ON job_family_skills FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "job_family_skills_service_write" ON job_family_skills;
CREATE POLICY "job_family_skills_service_write"
  ON job_family_skills FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. JOB_FAMILY_ENV_PROFILE  (reference table, public read)
-- Tipikus munkakörnyezeti mintázat – NEM konkrét munkahely adat.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_family_env_profile (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_family_id    uuid NOT NULL UNIQUE REFERENCES job_families(id) ON DELETE CASCADE,
  -- Sparse VKMM-like profile: sub_dimension_code → typical value descriptor
  -- Stored as jsonb array of {sub_dimension_code, typical_ordinal, typical_category}
  profile_entries  jsonb NOT NULL DEFAULT '[]',
  notes_hu         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_family_env_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_family_env_profile_public_read" ON job_family_env_profile;
CREATE POLICY "job_family_env_profile_public_read"
  ON job_family_env_profile FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "job_family_env_profile_service_write" ON job_family_env_profile;
CREATE POLICY "job_family_env_profile_service_write"
  ON job_family_env_profile FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER vk_job_family_env_profile_updated_at
  BEFORE UPDATE ON job_family_env_profile
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

-- ============================================================
-- 6. USER_SKILLS  (user-only, RLS strict)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_skills (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id         uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  proficiency      text NOT NULL CHECK (proficiency IN ('learning','basic','intermediate','advanced')),
  is_confident     boolean NOT NULL DEFAULT false,
  enjoys_it        boolean NOT NULL DEFAULT false,
  experience_years numeric(4,1),         -- optional
  acquisition_note text,                  -- privát, nem employer-visible
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id)
);

ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

-- Csak saját adat
DROP POLICY IF EXISTS "user_skills_own_read" ON user_skills;
CREATE POLICY "user_skills_own_read"
  ON user_skills FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_skills_own_write" ON user_skills;
CREATE POLICY "user_skills_own_write"
  ON user_skills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_skills_own_update" ON user_skills;
CREATE POLICY "user_skills_own_update"
  ON user_skills FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_skills_own_delete" ON user_skills;
CREATE POLICY "user_skills_own_delete"
  ON user_skills FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_skills_service_write" ON user_skills;
CREATE POLICY "user_skills_service_write"
  ON user_skills FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER vk_user_skills_updated_at
  BEFORE UPDATE ON user_skills
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

-- ============================================================
-- 7. CAREER_INTERESTS  (user-only, RLS strict)
-- Az érdeklődés NEM alkalmassági adat.
-- Employer NEM láthatja.
-- ============================================================
CREATE TABLE IF NOT EXISTS career_interests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_family_id    uuid NOT NULL REFERENCES job_families(id) ON DELETE CASCADE,
  interest_level   text NOT NULL CHECK (interest_level IN ('curious','interested','strong')),
  has_experience   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_family_id)
);

ALTER TABLE career_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_interests_own_read" ON career_interests;
CREATE POLICY "career_interests_own_read"
  ON career_interests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_interests_own_write" ON career_interests;
CREATE POLICY "career_interests_own_write"
  ON career_interests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_interests_own_update" ON career_interests;
CREATE POLICY "career_interests_own_update"
  ON career_interests FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_interests_own_delete" ON career_interests;
CREATE POLICY "career_interests_own_delete"
  ON career_interests FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_interests_service_write" ON career_interests;
CREATE POLICY "career_interests_service_write"
  ON career_interests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER vk_career_interests_updated_at
  BEFORE UPDATE ON career_interests
  FOR EACH ROW EXECUTE FUNCTION vk_set_updated_at();

-- ============================================================
-- SEED: Industries
-- ============================================================
INSERT INTO industries (slug, name_hu, display_order) VALUES
  ('logisztika',        'Logisztika és raktározás',        1),
  ('kereskedelem',      'Kereskedelem és kiskereskedelem',  2),
  ('egeszseggugyi',     'Egészségügy és szociális ellátás', 3),
  ('kozigazgatas',      'Közigazgatás és irodai szektor',   4),
  ('info-tech',         'Informatika és technológia',       5),
  ('penzugy',           'Pénzügy és könyvelés',             6),
  ('oktatás',           'Oktatás és képzés',                7),
  ('vendeglatas',       'Vendéglátás és turizmus',          8),
  ('mezogazdasag',      'Mezőgazdaság és élelmiszeripar',   9),
  ('gyartas',           'Gyártás és összeszerelés',        10),
  ('epiteszet-epitoip', 'Építészet és építőipar',          11),
  ('media-kreativ',     'Média és kreatív iparágak',       12),
  ('nonprofit',         'Nonprofit és civil szektor',      13),
  ('kornyezet-zold',    'Környezetvédelem és zöld szektor',14),
  ('altalanos',         'Általános és vegyes szektor',     15)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: Job Families (25 db, task-pattern alapú)
-- ============================================================
INSERT INTO job_families (slug, name_hu, description_hu, task_pattern_summary,
  typical_tasks_json, core_skills_json, trainable_skills_json,
  example_roles_json, entry_threshold_description, growth_paths_json, display_order)
VALUES

('admin-strukturalt',
 'Strukturált adminisztratív munka',
 'Irodai és adminisztratív feladatok rendszeres, szabályozott keretek között: iratok kezelése, adatnyilvántartás, egyszerű ügyintézés.',
 'Strukturált, ismétlődő irodai feladatok pontossággal és szabálykövetéssel.',
 '["Iratok befogadása és rendezése","Nyilvántartások vezetése","Egyszerű levelek és e-mailek kezelése","Adatok rögzítése rendszerekbe","Formulák és sablonok kitöltése"]',
 '["attention-to-detail","rule-following","word-processing","file-management","data-entry"]',
 '["spreadsheet-basic","database-entry","email-communication","digital-form-filling"]',
 '["Adminisztrátor","Irodai asszisztens","Nyilvántartó","Ügykezelő"]',
 'Alapszintű számítógép-ismeret, precizitás, türelem az ismétlődő feladatokhoz.',
 '["Szenior adminisztrátor","Irodavezető-helyettes","Titkárnő/titkár","Irodai koordinátor"]',
 1),

('adatbevitel-adatkezeles',
 'Adatkezelés és adatbevitel',
 'Adatok rendszeres bevitele, ellenőrzése és karbantartása digitális rendszerekbe. Pontosság és koncentráció elsődleges.',
 'Digitális adatbevitel és ellenőrzés előre meghatározott formátumok szerint.',
 '["Adatok bevitele táblázatokba és rendszerekbe","Meglévő adatok ellenőrzése és hibajavítás","Adatok kategorizálása és rendszerezése","Adatexport és importálás","Jelentések összeállítása meglévő adatokból"]',
 '["data-entry","attention-to-detail","concentration-sustained","error-detection","rule-following"]',
 '["spreadsheet-basic","spreadsheet-advanced","database-entry","reporting-basic"]',
 '["Adatrögzítő","Adatkezelő","Adatfeldolgozó asszisztens","Adattisztító specialista"]',
 'Türelem, precizitás, alapszintű számítógép-ismeret.',
 '["Adatelemző asszisztens","Adatbázis-adminisztrátor","Szenior adatrögzítő"]',
 2),

('dokumentacio-nyilvantartas',
 'Dokumentáció és nyilvántartás',
 'Papíralapú és digitális dokumentumok rendszerezése, archiválása, visszakereshetővé tétele.',
 'Dokumentumok rendszerezett kezelése, archiválása és visszakeresése.',
 '["Papíralapú iratok digitalizálása","Iktatás és archiválás","Dokumentumok nyomon követése","Iratrendezés és katalogizálás","Dokumentumtárak karbantartása"]',
 '["physical-filing","document-scanning","information-organizing","attention-to-detail","rule-following"]',
 '["file-management","database-entry","word-processing","categorization"]',
 '["Iratkezelő","Levéltáros asszisztens","Dokumentációs specialista","Iktatós"]',
 'Rendszerszeretet, pontosság, papíralapú és digitális iratok kezelési ismerete.',
 '["Dokumentációs vezető","Levéltáros","Iratkezelési szakértő"]',
 3),

('digitalis-hattermunka',
 'Digitális háttérfeladatok',
 'Webes, digitális adminisztrációs és online kezelési feladatok, amelyek nem igényelnek közvetlen ügyfélkapcsolatot.',
 'Online rendszerek kezelése, digitális adminisztráció és háttér-adatfeldolgozás.',
 '["Webes tartalom feltöltése és frissítése","Online formulárok és rendszerek kezelése","E-mail postaládák kezelése","Digitális fájlok rendezése és archiválása","Online katalógusok karbantartása"]',
 '["file-management","internet-search","content-uploading","email-communication","digital-form-filling"]',
 '["basic-graphic-editing","social-media-basic","data-entry","word-processing"]',
 '["Webadminisztrátor","Digitális asszisztens","Online tartalomkezelő","Backoffice munkatárs"]',
 'Internetes jártasság, önálló digitális munkavégzés.',
 '["Digitális koordinátor","Webmaster asszisztens","Tartalommenedzser"]',
 4),

('minoseg-ellenorzes',
 'Minőségellenőrzési feladatok',
 'Termékek, dokumentumok vagy folyamatok rendszeres ellenőrzése előre meghatározott szabványok szerint.',
 'Vizuális és adatvezérelt ellenőrzés minőségbiztosítási céllal.',
 '["Termékek vizuális ellenőrzése","Hibás darabok elkülönítése","Ellenőrzőlisták kitöltése","Méretek és paraméterek mérése","Ellenőrzési eredmények rögzítése"]',
 '["quality-visual-check","attention-to-detail","error-detection","pattern-recognition","rule-following"]',
 '["basic-math","reporting-basic","concentration-sustained","machine-operation-basic"]',
 '["Minőségellenőr","QC technikus","Ellenőrző munkatárs","Termékellenőr"]',
 'Precizitás, türelem, szabálykövetés.',
 '["Szenior QC technikus","Minőségbiztosítási koordinátor","Folyamatellenőr"]',
 5),

('keszlet-logisztika',
 'Logisztikai és készletkezelési feladatok',
 'Áru mozgatása, tárolása, leltározása és nyilvántartása raktárban vagy logisztikai környezetben.',
 'Fizikai árumozgatás és nyilvántartás raktári vagy logisztikai környezetben.',
 '["Áruk fogadása és ellenőrzése","Készletek leltározása","Áruk tárolásának szervezése","Csomagok összeállítása","Szállítólevelek kezelése"]',
 '["inventory-counting","warehouse-tasks","attention-to-detail","physical-filing","rule-following"]',
 '["lifting-light","material-handling","label-marking","data-entry","reporting-basic"]',
 '["Raktáros","Logisztikai asszisztens","Készletkezelő","Áruforgalmi munkatárs"]',
 'Fizikai terhelhetőség, pontosság, csapatmunka.',
 '["Raktárvezető-helyettes","Logisztikai koordinátor","Szállítmányozási ügyintéző"]',
 6),

('technikai-karbantartas',
 'Technikai háttérmunka és karbantartás',
 'Berendezések, gépek és eszközök alapszintű karbantartása, üzemeltetése, hibajelzése.',
 'Műszaki eszközök kezelése, ellenőrzése és alapszintű karbantartása.',
 '["Gépek és eszközök üzemeltetése","Rendszeres karbantartási ellenőrzések","Meghibásodások jelzése","Egyszerű javítások elvégzése","Karbantartási naplók vezetése"]',
 '["equipment-basic-maintenance","machine-operation-basic","attention-to-detail","rule-following","error-detection"]',
 '["basic-math","note-taking","reporting-basic","lifting-light"]',
 '["Karbantartó technikus","Gépkezelő","Műszaki asszisztens","Üzemeltetési munkatárs"]',
 'Műszaki érzék, precizitás, biztonságtudatosság.',
 '["Szenior technikus","Karbantartási koordinátor","Műszaki vezető"]',
 7),

('kutatas-informaciofeldolgozas',
 'Kutatási és információfeldolgozó feladatok',
 'Adatok, szövegek és információk összegyűjtése, feldolgozása és strukturálása.',
 'Információk keresése, rendszerezése és összegzése.',
 '["Adatkeresés internetes forrásokból","Információk összehasonlítása és rendszerezése","Összefoglalók és kivonatok készítése","Adatforrások azonosítása","Kutatási eredmények rögzítése"]',
 '["internet-search","research-basic","information-organizing","reading-comprehension","note-taking"]',
 '["word-processing","spreadsheet-basic","categorization","reporting-basic"]',
 '["Kutatási asszisztens","Adatgyűjtő","Piackutató segéd","Tartalomkutató"]',
 'Olvasási igény, rendszerszeretet, kritikus gondolkodás alapjai.',
 '["Szenior kutatási asszisztens","Elemző asszisztens","Piackutató"]',
 8),

('kreativ-digitalis',
 'Kreatív digitális feladatok',
 'Vizuális, szöveges vagy multimédiás digitális tartalmak létrehozása és szerkesztése.',
 'Digitális tartalom szerkesztése és létrehozása kreatív eszközökkel.',
 '["Képek szerkesztése egyszerű eszközökkel","Szöveges tartalmak formázása","Sablonok szerkesztése","Közösségi médiára való tartalom előkészítése","Prezentációk összeállítása"]',
 '["basic-graphic-editing","word-processing","content-uploading","social-media-basic","attention-to-detail"]',
 '["internet-search","file-management","email-communication","simple-coding"]',
 '["Kreatív asszisztens","Tartalomszerkesztő","Grafikai asszisztens","Social media asszisztens"]',
 'Digitális eszközök iránti nyitottság, esztétikai érzék alapjai.',
 '["Grafikus asszisztens","Tartalommenedzser","Digitális marketinges"]',
 9),

('kezzel-preciz',
 'Kézzel végzett precíz és összeállítási feladatok',
 'Kézügyességet és finommotorikát igénylő feladatok, például összeszerelés, válogatás, ellenőrzés.',
 'Precíz kézi munka, összeszerelés és finommotorikus feladatok.',
 '["Alkatrészek összeszerelése","Precíz válogatás és csoportosítás","Vizuális hibakeresés","Apró tárgyak kezelése","Minta szerinti munkavégzés"]',
 '["precise-assembly","fine-motor-skills","quality-visual-check","attention-to-detail","concentration-sustained"]',
 '["repetitive-motion","pattern-recognition","label-marking","handcraft"]',
 '["Összeszerelő","Precíziós munkás","Ellenőr","Kézi válogató"]',
 'Kézügyesség, türelem, precizitás.',
 '["Szenior összeszerelő","Minőségellenőr","Gyártási koordinátor"]',
 10),

('novenyek-kornyezet',
 'Növényekkel és környezettel kapcsolatos feladatok',
 'Növények gondozása, kertészeti munkák, zöldterület-kezelés.',
 'Növényápolás, kertészeti és zöldterületi feladatok.',
 '["Növények öntözése és gondozása","Kertészeti munkák végzése","Zöldterületek karbantartása","Komposztálás és hulladékkezelés","Növényi betegségek azonosítása (alap)"]',
 '["plant-care","outdoor-tolerance","physical-filing","attention-to-detail","rule-following"]',
 '["lifting-light","walking-extended","material-handling","note-taking"]',
 '["Kertész segéd","Parkgondozó","Zöldterület-kezelő","Virágárus asszisztens"]',
 'Természet iránti érdeklődés, fizikai állóképesség.',
 '["Szenior kertész","Kertészeti koordinátor","Parkvezető"]',
 11),

('elelmiszer-elokeszites',
 'Élelmiszer-előkészítési és feldolgozási feladatok',
 'Élelmiszerek előkészítése, feldolgozása, csomagolása és alapszintű elkészítése.',
 'Élelmiszer-kezelés, előkészítés és csomagolás higiéniai szabályok szerint.',
 '["Zöldségek és gyümölcsök előkészítése","Élelmiszerek csomagolása","Higiéniai szabályok betartása","Ételek mérése és adagolása","Készletek kezelése"]',
 '["food-preparation-simple","cleaning-hygiene","attention-to-detail","rule-following","quality-visual-check"]',
 '["lifting-light","repetitive-motion","basic-math","inventory-counting"]',
 '["Konyhai segéd","Élelmiszer-csomagoló","Feldolgozóüzemi munkás","Pék segéd"]',
 'Higiénia iránti igényesség, fizikai állóképesség, szabálykövetés.',
 '["Szakács","Élelmiszertechnológus asszisztens","Termelési koordinátor"]',
 12),

('gondoskodas-tamogatas',
 'Gondoskodó és támogató feladatok',
 'Emberek praktikus segítése mindennapi tevékenységekben – nem terápiás, hanem praktikus feladattámogatás.',
 'Praktikus segítségnyújtás embereknek hétköznapi feladatok elvégzésében.',
 '["Mozgásban való segítség","Étkezési segítség","Alapvető kísérés és felügyelet","Higiéniai segítségnyújtás","Szükségletek figyelése és jelzése"]',
 '["service-orientation","feedback-accepting","instruction-following","standing-work","sensory-vigilance"]',
 '["basic-customer-communication","colleague-coordination","written-communication","note-taking"]',
 '["Gondozói asszisztens","Szociális segítő","Bentlakásos segítő","Kísérő munkatárs"]',
 'Empátia, türelem, fizikai állóképesség, szabálykövetés.',
 '["Személyi asszisztens","Szociális gondozó","Lakóotthoni munkatárs"]',
 13),

('tisztasag-rendezettség',
 'Tisztasági és rendezettségi feladatok',
 'Épületek, területek és berendezések takarítása és rendben tartása.',
 'Rendszeres takarítás és higiéniai feladatok meghatározott protokollok szerint.',
 '["Irodák és közterületek takarítása","Higiéniai pontok feltöltése","Szükséges tisztítószerek kezelése","Karbantartási igények jelzése","Rendszeres ellenőrzőlisták kitöltése"]',
 '["cleaning-hygiene","rule-following","attention-to-detail","standing-work","physical-filing"]',
 '["walking-extended","repetitive-motion","inventory-counting","note-taking"]',
 '["Takarító","Épületgondnok segéd","Higiéniai munkatárs","Ferőtlenítő"]',
 'Fizikai állóképesség, szabálykövetés, megbízhatóság.',
 '["Takarítási vezető","Facility coordinator","Épületgondnok"]',
 14),

('szallitas-fuvarozas',
 'Szállítási és futárfeladatok',
 'Csomagok, iratok és áruk szállítása meghatározott útvonalakon és szabályok szerint.',
 'Meghatározott útvonalakon végzett csomagszállítás és kézbesítés.',
 '["Csomagok átvétele és kézbesítése","Kézbesítési dokumentumok kezelése","Útvonalak követése","Ügyfél-aláírás gyűjtése","Szállítmányok nyomon követése"]',
 '["delivery-local","walking-extended","rule-following","attention-to-detail","service-orientation"]',
 '["basic-customer-communication","note-taking","digital-form-filling","inventory-counting"]',
 '["Futár","Belső kézbesítő","Csomagszállító","Logisztikai munkatárs"]',
 'Megbízhatóság, tájékozódási képesség, fizikai állóképesség.',
 '["Futár koordinátor","Logisztikai diszpécser","Szállítási vezető"]',
 15),

('ugyfel-informacios',
 'Ügyfél-tájékoztató és információs feladatok',
 'Ügyfelek fogadása, tájékoztatása és alapvető kérdések megválaszolása.',
 'Alapszintű ügyfélkiszolgálás és tájékoztatás személyesen vagy telefonon.',
 '["Ügyfelek fogadása és irányítása","Alapvető kérdések megválaszolása","Időpontok és kapcsolódó adatok rögzítése","Várakozók kezelése","Információk továbbítása kollégáknak"]',
 '["basic-customer-communication","service-orientation","instruction-following","attention-to-detail","rule-following"]',
 '["phone-basic","written-communication","data-entry","digital-form-filling","email-communication"]',
 '["Recepciós","Ügyfélszolgálatos","Tájékoztatós munkatárs","Információs pont munkatársa"]',
 'Türelem, kommunikációs alapok, szabálykövetés.',
 '["Szenior ügyfélszolgálatos","Recepciós vezető","Ügyfélkapcsolati koordinátor"]',
 16),

('keszpenz-penzugyi-admin',
 'Pénztári és pénzügyi adminisztrációs feladatok',
 'Pénztárkezelés, számlázás és alapszintű pénzügyi nyilvántartás.',
 'Pénzügyi tranzakciók rögzítése és alapszintű pénztárkezelés.',
 '["Pénztárkezelés és váltópénz kezelése","Számlák kiállítása és rögzítése","Bevételek és kiadások naplózása","Banki utalások előkészítése","Pénzügyi dokumentumok archiválása"]',
 '["basic-math","attention-to-detail","rule-following","data-entry","error-detection"]',
 '["spreadsheet-basic","word-processing","reporting-basic","digital-form-filling"]',
 '["Pénztáros","Számlázó asszisztens","Könyvelői segéd","Pénzügyi adminisztrátor"]',
 'Precizitás, megbízhatóság, alapszintű matematikaismeret.',
 '["Könyvelő asszisztens","Pénzügyi koordinátor","Szenior pénztáros"]',
 17),

('szoveges-tartalom',
 'Szöveges tartalom szerkesztési és feldolgozási feladatok',
 'Szövegek írása, szerkesztése, formázása, fordítása vagy átdolgozása.',
 'Szöveges tartalmak kezelése, szerkesztése és formázása.',
 '["Szövegek szerkesztése és korrektúrázása","Sablonok kitöltése és testreszabása","Összefoglalók készítése","Szövegek formázása és strukturálása","Egyszerű fordítás vagy átírás"]',
 '["reading-comprehension","word-processing","attention-to-detail","written-communication","note-taking"]',
 '["internet-search","email-communication","categorization","basic-graphic-editing"]',
 '["Szövegszerkesztő","Korrektúraolvasó","Tartalomíró asszisztens","Szerkesztői asszisztens"]',
 'Szövegértés, precizitás, írás iránti érdeklődés.',
 '["Szenior szerkesztő","Tartalommenedzser","Kiadványszerkesztő"]',
 18),

('vizualis-designtamogatas',
 'Vizuális és design-támogatási feladatok',
 'Vizuális anyagok, grafikák és prezentációk összeállítása és szerkesztése.',
 'Vizuális tartalmak szerkesztése és design-sablonok alkalmazása.',
 '["Sablonok alapján grafikák szerkesztése","Képek vágása és átméretezése","Prezentációk összeállítása","Logók és vizuális elemek kezelése","Design-anyagok exportálása különböző formátumokba"]',
 '["basic-graphic-editing","attention-to-detail","file-management","content-uploading","word-processing"]',
 '["social-media-basic","internet-search","simple-coding","email-communication"]',
 '["Grafikai asszisztens","Prezentáció-készítő","Design asszisztens","Vizuális koordinátor"]',
 'Esztétikai érzék, digitális eszköz-ismeret, precizitás.',
 '["Szenior grafikus","Art director asszisztens","Vizuális kommunikációs specialista"]',
 19),

('oktatasi-tamogatas',
 'Oktatási és képzéstámogatási feladatok',
 'Oktatói, képzői vagy tanulástámogatói szerepben végzett adminisztratív és logisztikai feladatok.',
 'Képzési folyamatok adminisztratív és logisztikai támogatása.',
 '["Oktatási anyagok sokszorosítása és rendezése","Jelenléti ívek kezelése","Tanulói adatok rögzítése","Egyszerű feladatok javítása sablon alapján","Oktatási eszközök előkészítése"]',
 '["information-organizing","rule-following","attention-to-detail","note-taking","physical-filing"]',
 '["word-processing","data-entry","feedback-accepting","colleague-coordination","categorization"]',
 '["Iskolai adminisztrátor","Képzési asszisztens","Oktatástámogató munkatárs","Tantermi asszisztens"]',
 'Rendszerszeretet, türelem, pontosság.',
 '["Oktató asszisztens","Képzési koordinátor","Iskolatitkár"]',
 20),

('megfigyeles-monitorozas',
 'Megfigyelési és monitorozási feladatok',
 'Folyamatok, területek vagy rendszerek rendszeres megfigyelése és az eltérések jelzése.',
 'Rendszeres megfigyelés és eltérések azonosítása meghatározott paraméterek alapján.',
 '["Kamerás vagy helyszíni megfigyelés","Rendszeres ellenőrző körök","Anomáliák és eltérések jelzése","Megfigyelési naplók vezetése","Biztonsági protokollok követése"]',
 '["sensory-vigilance","concentration-sustained","attention-to-detail","rule-following","pattern-recognition"]',
 '["note-taking","reporting-basic","standing-work","walking-extended","error-detection"]',
 '["Biztonsági őr","Monitor operátor","Üzemi megfigyelő","Folyamatfelügyelő"]',
 'Éberség, szabálykövetés, megbízhatóság.',
 '["Szenior biztonsági tiszt","Felügyeleti koordinátor","Biztonsági vezető"]',
 21),

('kezi-csomagolas-valogatás',
 'Kézi csomagolási és válogatási feladatok',
 'Termékek kézi csomagolása, válogatása és előkészítése szállításra vagy értékesítésre.',
 'Ismétlődő kézi csomagolási és válogatási feladatok.',
 '["Termékek csomagolása csomagolóanyagokba","Méret vagy típus szerint válogatás","Csomagok lezárása és felcímkézése","Minőségi eltérések kiszűrése","Dobozok összerakása és pakolása"]',
 '["packaging","repetitive-motion","quality-visual-check","label-marking","attention-to-detail"]',
 '["lifting-light","inventory-counting","fine-motor-skills","standing-work","material-handling"]',
 '["Csomagoló munkatárs","Válogató","Kézi összekészítő","Raktári segédmunkás"]',
 'Fizikai állóképesség, pontosság, ismétlődő munkához való tolerancia.',
 '["Csoportvezető csomagoló","Raktárkoordinátor","Termelési munkatárs"]',
 22),

('terep-kulteri-munka',
 'Terepi és kültéri feladatok',
 'Épületen kívüli, terepi munkavégzés, például mérések, felmérések, karbantartás.',
 'Kültéri helyszíneken végzett rendszeres munkafeladatok.',
 '["Helyszíni mérések és felmérések","Kültéri karbantartási feladatok","Eszközök szállítása és kezelése kültéren","Terepbejárás és dokumentálás","Környezeti adatok rögzítése"]',
 '["outdoor-tolerance","walking-extended","attention-to-detail","note-taking","sensory-vigilance"]',
 '["lifting-light","material-handling","basic-math","reporting-basic","rule-following"]',
 '["Helyszíni felmérő","Kültéri karbantartó","Terepi adatgyűjtő","Épületfelügyelő"]',
 'Fizikai állóképesség, kültéri munkához való tolerancia.',
 '["Terepi koordinátor","Helyszíni vezető","Felügyelő mérnök asszisztens"]',
 23),

('digitalis-ugyintezes',
 'Digitális ügyintézési és e-ügyintézési feladatok',
 'Online platformokon keresztüli ügyintézés, kérvények, formanyomtatványok kezelése.',
 'Online ügyintézési feladatok digitális rendszerekben.',
 '["Online kérelmek és formanyomtatványok kitöltése","E-ügyintézési platformok kezelése","Digitális dokumentumok aláírása és benyújtása","Hatósági rendszerek egyszerű kezelése","Online fizetések és tranzakciók kezelése"]',
 '["digital-form-filling","internet-search","rule-following","attention-to-detail","data-entry"]',
 '["email-communication","document-scanning","word-processing","database-entry","file-management"]',
 '["E-ügyintéző asszisztens","Hatósági ügyintéző","Online ügyfélszolgálatos","Digitális ügyintézési munkatárs"]',
 'Internetes alapismeret, türelem, pontosság.',
 '["Szenior ügyintéző","Hatósági koordinátor","E-gov specialista"]',
 24),

('szociometriai-kozossegi',
 'Közösségi és szociális részvételi támogatás',
 'Közösségi rendezvények, programok és csoportos tevékenységek logisztikai és adminisztratív támogatása.',
 'Közösségi programok és csoportos tevékenységek szervezési és logisztikai támogatása.',
 '["Rendezvények logisztikai előkészítése","Résztvevők regisztrálása","Programok anyagainak összeállítása","Helyszín rendezése és lerendezése","Alapvető koordináció a csapaton belül"]',
 '["colleague-coordination","service-orientation","instruction-following","information-organizing","rule-following"]',
 '["basic-customer-communication","written-communication","note-taking","physical-filing","data-entry"]',
 '["Rendezvény-asszisztens","Közösségi koordinátor","Programszervező segéd","Nonprofit munkatárs"]',
 'Csapatmunka, alapvető kommunikáció, szervezési hajlam.',
 '["Rendezvényszervező","Közösségi vezető","Nonprofit koordinátor"]',
 25)

ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: Skills (60 db, 5 kategória)
-- ============================================================
INSERT INTO skills (code, name_hu, category, is_trainable, display_order) VALUES
-- DIGITAL (15)
('data-entry',              'Adatbevitel',                                           'digital',       true,  1),
('spreadsheet-basic',       'Táblázatkezelés (alap)',                                'digital',       true,  2),
('spreadsheet-advanced',    'Táblázatkezelés (haladó)',                              'digital',       true,  3),
('word-processing',         'Szövegszerkesztés',                                     'digital',       true,  4),
('email-communication',     'E-mailes kommunikáció',                                 'digital',       true,  5),
('file-management',         'Fájlkezelés és mappaszervezés',                         'digital',       true,  6),
('internet-search',         'Internetes keresés és tájékozódás',                     'digital',       true,  7),
('data-checking',           'Adatellenőrzés és pontosság',                           'digital',       true,  8),
('basic-graphic-editing',   'Egyszerű grafikai szerkesztés',                         'digital',       true,  9),
('social-media-basic',      'Közösségi média alapkezelés',                           'digital',       true, 10),
('document-scanning',       'Dokumentumszkennelés és archiválás',                    'digital',       true, 11),
('database-entry',          'Adatbázis-kezelés (adatbevitel)',                       'digital',       true, 12),
('simple-coding',           'Egyszerű kódolás és sablon szerkesztés',               'digital',       true, 13),
('digital-form-filling',    'Digitális űrlapok kitöltése',                           'digital',       true, 14),
('content-uploading',       'Tartalom feltöltése webes felületen',                   'digital',       true, 15),
-- MANUAL (15)
('precise-assembly',        'Precíz összeszerelés',                                  'manual',        true, 16),
('quality-visual-check',    'Vizuális minőségellenőrzés',                            'manual',        true, 17),
('packaging',               'Csomagolás és válogatás',                               'manual',        true, 18),
('inventory-counting',      'Készletszámlálás és leltározás',                        'manual',        true, 19),
('physical-filing',         'Papíralapú iratok rendezése',                           'manual',        true, 20),
('equipment-basic-maintenance', 'Alapszintű eszközkezelés és karbantartás',          'manual',        true, 21),
('plant-care',              'Növényápolás',                                          'manual',        true, 22),
('food-preparation-simple', 'Egyszerű ételkészítés és előkészítés',                 'manual',        true, 23),
('cleaning-hygiene',        'Takarítás és higiéniai feladatok',                      'manual',        true, 24),
('delivery-local',          'Helyi kézbesítés és futárfeladatok',                    'manual',        true, 25),
('warehouse-tasks',         'Raktári alapfeladatok',                                 'manual',        true, 26),
('machine-operation-basic', 'Alapszintű gépkezelés',                                'manual',        true, 27),
('label-marking',           'Címkézés és megjelölés',                                'manual',        true, 28),
('material-handling',       'Anyagkezelés és szállítás kézzel',                      'manual',        true, 29),
('handcraft',               'Kézügyességet igénylő feladatok',                       'manual',        true, 30),
-- COGNITIVE (15)
('attention-to-detail',     'Részletekre való odafigyelés',                          'cognitive',     false, 31),
('rule-following',          'Szabályok és protokollok követése',                     'cognitive',     false, 32),
('error-detection',         'Hibafeltárás és ellenőrzés',                            'cognitive',     true,  33),
('information-organizing',  'Információk rendszerezése',                             'cognitive',     true,  34),
('note-taking',             'Feljegyzéskészítés és dokumentálás',                    'cognitive',     true,  35),
('basic-math',              'Alapszintű számolás és mérés',                          'cognitive',     false, 36),
('reading-comprehension',   'Szövegértés és olvasás',                                'cognitive',     false, 37),
('pattern-recognition',     'Minták és eltérések felismerése',                       'cognitive',     true,  38),
('task-prioritization',     'Feladatok prioritizálása',                              'cognitive',     true,  39),
('research-basic',          'Alapszintű kutatás és információkeresés',               'cognitive',     true,  40),
('categorization',          'Kategorizálás és csoportosítás',                        'cognitive',     true,  41),
('process-following',       'Folyamatok és lépéssorok követése',                     'cognitive',     false, 42),
('concentration-sustained', 'Tartós koncentráció',                                   'cognitive',     false, 43),
('decision-simple',         'Egyszerű döntéshozatal előre meghatározott szabályok alapján', 'cognitive', true, 44),
('reporting-basic',         'Alapszintű adatjelentés és összegzés',                  'cognitive',     true,  45),
-- INTERPERSONAL (8)
('basic-customer-communication', 'Alapvető ügyfélkommunikáció',                      'interpersonal', false, 46),
('team-collaboration',      'Csapatmunkában való részvétel',                         'interpersonal', false, 47),
('instruction-following',   'Utasítások megértése és követése',                      'interpersonal', false, 48),
('feedback-accepting',      'Visszajelzések befogadása',                             'interpersonal', false, 49),
('colleague-coordination',  'Kollégákkal való egyszerű koordináció',                 'interpersonal', true,  50),
('written-communication',   'Írásbeli kommunikáció',                                 'interpersonal', true,  51),
('phone-basic',             'Alapszintű telefonos kommunikáció',                     'interpersonal', true,  52),
('service-orientation',     'Segítőkészség és szolgálatnyújtás',                     'interpersonal', false, 53),
-- PHYSICAL (7)
('standing-work',           'Állva végzett tartós munka',                            'physical',      false, 54),
('walking-extended',        'Hosszabb gyaloglás és mozgás',                          'physical',      false, 55),
('lifting-light',           'Könnyű tárgyak emelése',                                'physical',      false, 56),
('fine-motor-skills',       'Kézügyesség és finommotorika',                          'physical',      false, 57),
('outdoor-tolerance',       'Kültéri körülmények tűrése',                            'physical',      false, 58),
('repetitive-motion',       'Ismétlődő mozdulatok végrehajtása',                     'physical',      false, 59),
('sensory-vigilance',       'Érzékszervi éberség (látás, hallás)',                   'physical',      false, 60)
ON CONFLICT (code) DO NOTHING;
