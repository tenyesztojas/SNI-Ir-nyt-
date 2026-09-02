-- ============================================================
-- VédettMunka – Hivatalos piktogramrendszer migráció
-- 6 új attribútum + meglévő feliratok javítása
-- ============================================================

-- 1. Kategória enum bővítése (ha van CHECK constraint)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vm_job_attributes'
      AND column_name = 'category'
      AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TYPE vm_attribute_category ADD VALUE IF NOT EXISTS 'jelentkezes_mod';
  END IF;
END $$;

-- Ha a category szöveges oszlop (nem enum), a CHECK constraint-et frissítjük:
-- (Biztonságos: IF NOT EXISTS védi az ismételt futtatástól)

-- 2. Meglévő attribútumok terminológia-javítása
UPDATE vm_job_attributes SET
  title_hu    = 'Csendes környezet',
  icon_name   = 'csendes_kornyezet'
WHERE slug = 'quieter_env';

UPDATE vm_job_attributes SET
  title_hu    = 'Otthoni munkavégzés',
  icon_name   = 'otthoni_munkavegzes'
WHERE slug = 'home_office';

UPDATE vm_job_attributes SET
  title_hu    = 'Munkavégzés otthon és munkahelyen',
  icon_name   = 'munkavegzes_otthon_es_munkahelyen'
WHERE slug = 'hybrid';

UPDATE vm_job_attributes SET
  title_hu    = 'Írásban is megkapod a feladatot',
  icon_name   = 'irasos_feladatok'
WHERE slug = 'written_tasks';

-- 3. Meglévő attribútumok icon_name frissítése (ahol eltér a fájlnévtől)
UPDATE vm_job_attributes SET icon_name = 'akadalymentes_munkahely'        WHERE slug = 'accessible';
UPDATE vm_job_attributes SET icon_name = 'egyertelmu_feladatok'            WHERE slug = 'predictable_tasks';
UPDATE vm_job_attributes SET icon_name = 'fokozatos_betanitas'             WHERE slug = 'gradual_training';
UPDATE vm_job_attributes SET icon_name = 'kijelolt_segito'                 WHERE slug = 'assigned_mentor';
UPDATE vm_job_attributes SET icon_name = 'kis_csapat'                     WHERE slug = 'small_team';
UPDATE vm_job_attributes SET icon_name = 'kiszamithato_munkarend'          WHERE slug = 'predictable_schedule';
UPDATE vm_job_attributes SET icon_name = 'konnyu_megkozelites'             WHERE slug = 'public_transport';
UPDATE vm_job_attributes SET icon_name = 'munkaba_jaras_tamogatasa'        WHERE slug = 'commute_support';
UPDATE vm_job_attributes SET icon_name = 'onallo_munkavegzes'              WHERE slug = 'independent_work';
UPDATE vm_job_attributes SET icon_name = 'parkolas'                        WHERE slug = 'parking';
UPDATE vm_job_attributes SET icon_name = 'rendszeres_visszajelzes'         WHERE slug = 'regular_feedback';
UPDATE vm_job_attributes SET icon_name = 'reszmunkaido'                    WHERE slug = 'part_time';
UPDATE vm_job_attributes SET icon_name = 'rugalmas_munkaido'               WHERE slug = 'flexible_hours';
UPDATE vm_job_attributes SET icon_name = 'keves_beszelgetes'               WHERE slug = 'low_verbal';

-- 4. Új attribútumok beszúrása
INSERT INTO vm_job_attributes
  (slug, category, title_hu, easy_desc_hu, icon_name, attribute_type, level_options, display_order, is_active)
VALUES
  (
    'company_bus',
    'megkozelites',
    'Céges busz',
    'A munkáltató céges buszt biztosít a munkába járáshoz.',
    'ceges_busz',
    'boolean', '[]', 105, true
  ),
  (
    'uniform_provided',
    'munkakornyzet',
    'Munkaruha biztosított',
    'A munkáltató biztosítja a szükséges munkaruhát.',
    'munkaruha',
    'boolean', '[]', 145, true
  ),
  (
    'safety_equipment',
    'munkakornyzet',
    'Munkavédelmi eszközök biztosítottak',
    'A szükséges munkavédelmi eszközöket a munkáltató adja.',
    'munkavedelmi_eszkozok',
    'boolean', '[]', 146, true
  ),
  (
    'apply_cv',
    'jelentkezes_mod',
    'Jelentkezés önéletrajzzal',
    'Önéletrajz beküldésével lehet jelentkezni.',
    'jelentkezes_oneletrajzzal',
    'boolean', '[]', 200, true
  ),
  (
    'apply_phone',
    'jelentkezes_mod',
    'Telefonos jelentkezés',
    'Telefonon is lehet érdeklődni és jelentkezni.',
    'telefonos_jelentkezes',
    'boolean', '[]', 201, true
  ),
  (
    'apply_email',
    'jelentkezes_mod',
    'E-mailes jelentkezés',
    'E-mailben lehet jelentkezni az állásra.',
    'emailes_jelentkezes',
    'boolean', '[]', 202, true
  )
ON CONFLICT (slug) DO UPDATE SET
  title_hu      = EXCLUDED.title_hu,
  easy_desc_hu  = EXCLUDED.easy_desc_hu,
  icon_name     = EXCLUDED.icon_name,
  category      = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active     = EXCLUDED.is_active;
