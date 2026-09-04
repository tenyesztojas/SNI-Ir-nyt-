/**
 * Védett Karrier – VKMM Seed Data
 * Forrás: V2.2.1 FINAL termékkoncepció + Technical Implementation Plan V1.1 FINAL
 * 10 fődimenzió, 51 aldimenzió
 *
 * CLEAN-ROOM: ez NEM a legacy VédettMunka mezőlistájából ered.
 * FONTOS: csak validateVkmmSeed() PASS után kerülhet DB-be.
 */

import type { VkmmDimension, VkmmSubDimension, VkmmSeedData } from '../types/index'

export const VKMM_DIMENSIONS: VkmmDimension[] = [
  { code: 'env',        name_hu: 'Fizikai munkakörnyezet',        display_order: 1,  is_active: true },
  { code: 'comm',       name_hu: 'Kommunikáció',                  display_order: 2,  is_active: true },
  { code: 'social',     name_hu: 'Szociális munkakörnyezet',      display_order: 3,  is_active: true },
  { code: 'task_struct',name_hu: 'Feladatstruktúra',              display_order: 4,  is_active: true },
  { code: 'task_dyn',   name_hu: 'Feladat-dinamika',              display_order: 5,  is_active: true },
  { code: 'time',       name_hu: 'Idő és munkaszervezés',         display_order: 6,  is_active: true },
  { code: 'autonomy',   name_hu: 'Autonómia',                     display_order: 7,  is_active: true },
  { code: 'support',    name_hu: 'Támogatás és visszajelzés',     display_order: 8,  is_active: true },
  { code: 'physical',   name_hu: 'Fizikai igénybevétel',          display_order: 9,  is_active: true },
  { code: 'location',   name_hu: 'Helyszín és munkavégzési mód',  display_order: 10, is_active: true },
]

export const VKMM_SUB_DIMENSIONS: VkmmSubDimension[] = [

  // ── env (6) ──────────────────────────────────────────────────────────────

  {
    code: 'env_noise', dimension_code: 'env', display_order: 1,
    name_user_hu: 'Zajszint',
    name_employer_hu: 'Munkaterület zajszintje',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Jellemzően nagyon csendes' },
      { v: 2, label: 'Többnyire csendes, időnkénti háttérzaj' },
      { v: 3, label: 'Mérsékelt, rendszeres háttérzaj' },
      { v: 4, label: 'Gyakran zajos, időnként emelt hangerő szükséges' },
      { v: 5, label: 'Tartósan magas zajszint vagy intenzív hanghatás' },
    ],
    user_question_hu: 'Milyen zajszint mellett tudsz hosszabb ideig kényelmesen dolgozni?',
    employer_question_hu: 'Milyen zajszint jellemző erre a munkaterületre a munkanap nagy részében?',
    clarification_key: 'clarify.ask.quiet_space',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'env_light', dimension_code: 'env', display_order: 2,
    name_user_hu: 'Megvilágítás',
    name_employer_hu: 'Munkaterület megvilágítása',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Tompított, kellemes fényszint' },
      { v: 2, label: 'Természetes vagy meleg mesterséges fény' },
      { v: 3, label: 'Közepes intenzitású irodai fény' },
      { v: 4, label: 'Erős, intenzív megvilágítás' },
      { v: 5, label: 'Nagyon erős, esetleg villódzó vagy egyenetlen fény' },
    ],
    user_question_hu: 'Milyen megvilágítás mellett érzed magad a legjobban munkavégzés közben?',
    employer_question_hu: 'Milyen megvilágítás jellemző a munkaterületre?',
    clarification_key: 'clarify.ask.lighting_adjustment',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'env_visual_busyness', dimension_code: 'env', display_order: 3,
    name_user_hu: 'Vizuális mozgalmasság',
    name_employer_hu: 'Munkaterület vizuális mozgalmassága',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nyugodt, kevés vizuális inger' },
      { v: 2, label: 'Mérsékelten élénk' },
      { v: 3, label: 'Rendszeres mozgás a látótérben' },
      { v: 4, label: 'Élénk, sok mozgás' },
      { v: 5, label: 'Folyamatosan mozgalmas, sok vizuális inger' },
    ],
    user_question_hu: 'Mennyire mozgalmas vizuális tér mellett tudsz könnyen koncentrálni?',
    employer_question_hu: 'Mennyire mozgalmas, vizuálisan élénk a munkaterület?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'env_crowding', dimension_code: 'env', display_order: 4,
    name_user_hu: 'Zsúfoltság',
    name_employer_hu: 'Népsűrűség a munkaterületen',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Kevés ember, tágas tér' },
      { v: 2, label: 'Mérsékelt népsűrűség' },
      { v: 3, label: 'Átlagos irodai forgalom' },
      { v: 4, label: 'Sűrűn lakott munkaterület' },
      { v: 5, label: 'Zsúfolt, szoros elrendezés' },
    ],
    user_question_hu: 'Mennyire népes, forgalmas környezetben érzed magad jól munkavégzés közben?',
    employer_question_hu: 'Mennyire zsúfolt a munkaterület a tipikus munkanapon?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'env_temperature', dimension_code: 'env', display_order: 5,
    name_user_hu: 'Hőmérséklet',
    name_employer_hu: 'Munkaterület hőmérséklete',
    value_type: 'categorical', comparison_type: 'SET_MEMBERSHIP',
    categorical_options: ['cold','comfortable','warm','variable'],
    categorical_labels: {
      cold: 'Hűvös (kb. 18°C alatt)',
      comfortable: 'Kényelmes (18–24°C)',
      warm: 'Meleg (24°C felett)',
      variable: 'Ingadozó (nagy különbségekkel)',
    },
    user_question_hu: 'Milyen hőmérsékletű munkaterületen szívesebben dolgozol? (több is megjelölhető)',
    employer_question_hu: 'Milyen hőmérséklet jellemzi a munkaterületet?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'env_space_type', dimension_code: 'env', display_order: 6,
    name_user_hu: 'Munkaterület típusa',
    name_employer_hu: 'Munkaterület típusa',
    value_type: 'categorical', comparison_type: 'SET_MEMBERSHIP',
    categorical_options: ['open_office','shared_room','private','outdoor','industrial','mixed'],
    categorical_labels: {
      open_office: 'Nyitott irodai tér',
      shared_room: 'Osztott, kisebb szoba',
      private: 'Egyéni, elkülönített',
      outdoor: 'Szabadtéri',
      industrial: 'Ipari csarnok / raktár',
      mixed: 'Váltakozó helyszín',
    },
    user_question_hu: 'Milyen típusú munkaterületen szívesebben dolgozol? (több is megjelölhető)',
    employer_question_hu: 'Milyen típusú munkaterületen végzi a munkát ez a munkakör?',
    clarification_key: 'clarify.ask.quiet_corner_available',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── comm (6) ─────────────────────────────────────────────────────────────

  {
    code: 'comm_phone', dimension_code: 'comm', display_order: 1,
    name_user_hu: 'Telefonhasználat',
    name_employer_hu: 'Telefonos kommunikáció mértéke',
    value_type: 'frequency', comparison_type: 'FREQUENCY_RANGE',
    frequency_options: ['none','rare','regular','central'],
    frequency_labels: {
      none: 'Nincs telefonhasználat',
      rare: 'Alkalmanként, hetente néhány hívás',
      regular: 'Rendszeres, de nem meghatározó',
      central: 'A munkakör nagy részét telefonon végzik',
    },
    user_question_hu: 'Milyen mértékű telefonos kommunikáció passzol számodra?',
    employer_question_hu: 'Milyen mértékű telefonos kommunikációt igényel ez a munkakör?',
    clarification_key: 'clarify.ask.phone_alternative',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'comm_verbal_direct', dimension_code: 'comm', display_order: 2,
    name_user_hu: 'Személyes szóbeli kommunikáció',
    name_employer_hu: 'Személyes szóbeli kommunikáció igénye',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Minimális személyes szóbeli kommunikáció' },
      { v: 2, label: 'Ritkán szükséges' },
      { v: 3, label: 'Rendszeres, mérsékelt mértékű' },
      { v: 4, label: 'Folyamatosan jelen van' },
      { v: 5, label: 'A munkavégzés elsősorban szóbeli interakción alapul' },
    ],
    user_question_hu: 'Mennyi személyes, szóbeli kommunikáció az ideális számodra munkavégzés közben?',
    employer_question_hu: 'Milyen mértékű személyes szóbeli kommunikációt igényel ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'comm_written', dimension_code: 'comm', display_order: 3,
    name_user_hu: 'Írásos kommunikáció',
    name_employer_hu: 'Írásos kommunikáció aránya',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Minimális írásos kommunikáció' },
      { v: 2, label: 'Esetenkénti e-mail, üzenet' },
      { v: 3, label: 'Rendszeres írásos feladatok' },
      { v: 4, label: 'Döntően írásos' },
      { v: 5, label: 'Szinte kizárólag írásos kommunikáció' },
    ],
    user_question_hu: 'Mennyire előnyös számodra, ha a kommunikáció döntően írásban zajlik?',
    employer_question_hu: 'Milyen mértékben zajlik írásos kommunikáció ebben a munkakörben?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'comm_meetings', dimension_code: 'comm', display_order: 4,
    name_user_hu: 'Értekezletek / meetingek',
    name_employer_hu: 'Kötelező értekezletek rendszeressége',
    value_type: 'frequency', comparison_type: 'FREQUENCY_RANGE',
    frequency_options: ['none','monthly','weekly','daily','multiple_daily'],
    frequency_labels: {
      none: 'Nincs rendszeres értekezlet',
      monthly: 'Havi rendszerességű',
      weekly: 'Heti rendszerességű',
      daily: 'Napi rendszerességű',
      multiple_daily: 'Naponta több alkalommal',
    },
    user_question_hu: 'Milyen arányban illenek a munkanapodba az értekezletek?',
    employer_question_hu: 'Milyen rendszerességgel vannak kötelező értekezletek ebben a munkakörben?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'comm_customer', dimension_code: 'comm', display_order: 5,
    name_user_hu: 'Ügyfélkontaktus',
    name_employer_hu: 'Közvetlen ügyfélkontaktus mértéke',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nincs közvetlen ügyfélkontaktus' },
      { v: 2, label: 'Alkalmi érintkezés' },
      { v: 3, label: 'Rendszeres, de nem meghatározó' },
      { v: 4, label: 'Az ügyfélkontaktus a munkaidő nagy részét kitölti' },
      { v: 5, label: 'Folyamatos közvetlen ügyfélkapcsolat' },
    ],
    user_question_hu: 'Mennyire szívesen dolgozol közvetlen ügyfelekkel, vásárlókkal, kliensekkel?',
    employer_question_hu: 'Milyen mértékű közvetlen ügyfélkontaktust igényel ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'comm_unexpected', dimension_code: 'comm', display_order: 6,
    name_user_hu: 'Váratlan kommunikációs igény',
    name_employer_hu: 'Váratlan kommunikációs igények gyakorisága',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Ritkán fordul elő' },
      { v: 2, label: 'Alkalmilag' },
      { v: 3, label: 'Rendszeresen' },
      { v: 4, label: 'Naponta több alkalommal' },
      { v: 5, label: 'Folyamatosan' },
    ],
    user_question_hu: 'Hogyan érzed magad, ha váratlan kommunikációs igények érnek munkavégzés közben?',
    employer_question_hu: 'Milyen rendszerességgel fordulnak elő váratlan, azonnali kommunikációs igények?',
    clarification_key: 'clarify.ask.async_communication_possible',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── social (5) ───────────────────────────────────────────────────────────

  {
    code: 'social_team_size', dimension_code: 'social', display_order: 1,
    name_user_hu: 'Csapatméret',
    name_employer_hu: 'Közvetlen csapat mérete',
    value_type: 'categorical', comparison_type: 'SET_MEMBERSHIP',
    categorical_options: ['solo','small','medium','large'],
    categorical_labels: {
      solo: 'Egyéni munkavégzés (1 fő)',
      small: 'Kiscsapat (2–5 fő)',
      medium: 'Közepes csapat (6–15 fő)',
      large: 'Nagy csapat (15+ fő)',
    },
    user_question_hu: 'Milyen méretű csapatban szívesebben dolgozol? (több is megjelölhető)',
    employer_question_hu: 'Hány fős közvetlen csapatban végzi a munkáját ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'social_collaboration', dimension_code: 'social', display_order: 2,
    name_user_hu: 'Együttműködés intenzitása',
    name_employer_hu: 'Csapatos együttműködés mértéke',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Szinte kizárólag önállóan' },
      { v: 2, label: 'Főleg önállóan, alkalmi együttműködéssel' },
      { v: 3, label: 'Önálló és csapatmunka vegyesen' },
      { v: 4, label: 'Főleg csapatmunka' },
      { v: 5, label: 'Szinte folyamatos csapatmunka' },
    ],
    user_question_hu: 'Mennyire szívesen dolgozol másokkal szorosan együtt, szemben az önálló munkavégzéssel?',
    employer_question_hu: 'Milyen mértékű csapatos együttműködést igényel ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'social_solo_work', dimension_code: 'social', display_order: 3,
    name_user_hu: 'Önálló munkavégzés aránya',
    name_employer_hu: 'Önálló munkavégzés aránya',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Szinte folyamatos csapatmunka' },
      { v: 2, label: 'Főleg csapatos, kevés önállósággal' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Főleg önálló munkavégzés' },
      { v: 5, label: 'Szinte kizárólag önálló' },
    ],
    user_question_hu: 'Mennyire szívesen dolgozol önállóan, külső visszajelzés nélkül hosszabb időn át?',
    employer_question_hu: 'Milyen arányban jellemző az önálló munkavégzés ebben a munkakörben?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'social_public_contact', dimension_code: 'social', display_order: 4,
    name_user_hu: 'Nyilvánossággal való kontaktus',
    name_employer_hu: 'Nyilvánossággal való kontaktus',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nincs' },
      { v: 2, label: 'Alkalmi' },
      { v: 3, label: 'Rendszeres' },
      { v: 4, label: 'A munkaidő nagy részében' },
      { v: 5, label: 'Folyamatos' },
    ],
    user_question_hu: 'Mennyire szívesen dolgozol ismeretlen emberekkel közvetlen kontaktusban?',
    employer_question_hu: 'Milyen mértékű kontaktust igényel ez a munkakör a nyilvánossággal?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'social_manager_contact', dimension_code: 'social', display_order: 5,
    name_user_hu: 'Közvetlen vezető kontaktusa',
    name_employer_hu: 'Közvetlen vezető kontaktus rendszeressége',
    value_type: 'frequency', comparison_type: 'FREQUENCY_RANGE',
    frequency_options: ['minimal','weekly','daily','intensive'],
    frequency_labels: {
      minimal: 'Ritkán, csak szükség esetén',
      weekly: 'Heti rendszeresség',
      daily: 'Naponta',
      intensive: 'Szinte folyamatosan elérhető vagy jelen van',
    },
    user_question_hu: 'Milyen mértékű közvetlen vezető-kontaktus illeszkedik hozzád legjobban?',
    employer_question_hu: 'Milyen rendszerességgel van közvetlen kapcsolatban a munkavállaló a közvetlen vezetőjével?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── task_struct (5) ──────────────────────────────────────────────────────

  {
    code: 'task_instruction_clarity', dimension_code: 'task_struct', display_order: 1,
    name_user_hu: 'Instrukciók egyértelműsége',
    name_employer_hu: 'Feladatinstrukciók egyértelműsége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Minden feladat egyértelmű instrukcióval érkezik' },
      { v: 2, label: 'Általában egyértelmű' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Gyakran pontosítás szükséges' },
      { v: 5, label: 'Ritkán egyértelmű, rendszeres értelmezés szükséges' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy a feladataid egyértelműen körülírva legyenek?',
    employer_question_hu: 'Milyen mértékben érkeznek egyértelmű instrukciókkal a feladatok?',
    clarification_key: 'clarify.ask.written_task_description',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_written_instruction', dimension_code: 'task_struct', display_order: 2,
    name_user_hu: 'Írásos instrukció elérhetősége',
    name_employer_hu: 'Írásos dokumentáció elérhetősége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Minden feladathoz írásos dokumentáció elérhető' },
      { v: 2, label: 'Általában elérhető' },
      { v: 3, label: 'Részben elérhető' },
      { v: 4, label: 'Ritkán elérhető' },
      { v: 5, label: 'Nem elérhető, szóban közölt instrukciók jellemzők' },
    ],
    user_question_hu: 'Mennyire segíti a munkavégzésedet, ha a feladatok írásban is rendelkezésre állnak?',
    employer_question_hu: 'Milyen mértékben érhetők el írásos dokumentációk a munkakörben?',
    clarification_key: 'clarify.ask.digital_task_system',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_repetition', dimension_code: 'task_struct', display_order: 3,
    name_user_hu: 'Feladatok ismétlődése',
    name_employer_hu: 'Feladatok ismétlődési aránya',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Naponta változó feladatok' },
      { v: 2, label: 'Főleg változatos, némi ismétlődéssel' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Főleg ismétlődő feladatok' },
      { v: 5, label: 'Erősen ismétlődő, rutinszerű' },
    ],
    user_question_hu: 'Mennyire illeszkedik hozzád az ismétlődő, rutinszerű feladatok végzése?',
    employer_question_hu: 'Milyen mértékben ismétlődők a feladatok napról napra?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_complexity', dimension_code: 'task_struct', display_order: 4,
    name_user_hu: 'Feladatok összetettsége',
    name_employer_hu: 'Feladatok összetettségi szintje',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Egyszerű, egylépéses feladatok' },
      { v: 2, label: 'Néhány lépéses feladatok' },
      { v: 3, label: 'Mérsékelt összetettség' },
      { v: 4, label: 'Több lépéses, változatos feladatok' },
      { v: 5, label: 'Komplex, hosszú folyamatok, magas kognitív igény' },
    ],
    user_question_hu: 'Milyen összetettségű feladatok illeszkednek hozzád legjobban?',
    employer_question_hu: 'Milyen mértékben összetett a munkakör feladatstruktúrája?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_priority_clarity', dimension_code: 'task_struct', display_order: 5,
    name_user_hu: 'Prioritások egyértelműsége',
    name_employer_hu: 'Feladatok prioritásainak egyértelműsége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'A prioritások mindig egyértelműek' },
      { v: 2, label: 'Általában egyértelműek' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Gyakran szükséges egyeztetni' },
      { v: 5, label: 'A prioritások ritkán egyértelműek' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy a feladataid sorrendje egyértelműen meghatározott legyen?',
    employer_question_hu: 'Milyen mértékben egyértelműek a feladatok prioritásai?',
    clarification_key: 'clarify.ask.priority_system',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── task_dyn (4) ─────────────────────────────────────────────────────────

  {
    code: 'task_switching', dimension_code: 'task_dyn', display_order: 1,
    name_user_hu: 'Feladatváltás',
    name_employer_hu: 'Feladatváltás rendszeressége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Ritkán szükséges feladatot váltani' },
      { v: 2, label: 'Alkalmilag' },
      { v: 3, label: 'Rendszeresen' },
      { v: 4, label: 'Naponta többször' },
      { v: 5, label: 'Folyamatos feladatváltás' },
    ],
    user_question_hu: 'Mennyire kényelmes számodra, ha munka közben rendszeresen váltanod kell más feladatra?',
    employer_question_hu: 'Milyen rendszerességgel szükséges feladatot váltani ebben a munkakörben?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_parallel', dimension_code: 'task_dyn', display_order: 2,
    name_user_hu: 'Párhuzamos feladatok',
    name_employer_hu: 'Párhuzamos feladatok száma',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Jellemzően egyetlen feladat egyszerre' },
      { v: 2, label: '2–3 párhuzamos feladat' },
      { v: 3, label: 'Közepes párhuzamosság' },
      { v: 4, label: 'Sok párhuzamos feladat' },
      { v: 5, label: 'Folyamatosan több, egyidejűleg nyitott feladat' },
    ],
    user_question_hu: 'Hogyan érzed magad, ha egyszerre több különböző feladatot kell nyitva tartanod?',
    employer_question_hu: 'Milyen mértékű párhuzamos feladatkezelést igényel ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_interruptions', dimension_code: 'task_dyn', display_order: 3,
    name_user_hu: 'Megszakítások',
    name_employer_hu: 'Megszakítások gyakorisága',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Ritka megszakítás, hosszú koncentrált időszakok lehetségesek' },
      { v: 2, label: 'Alkalmi megszakítás' },
      { v: 3, label: 'Rendszeres megszakítás' },
      { v: 4, label: 'Naponta többszöri megszakítás' },
      { v: 5, label: 'Folyamatos megszakítások, nehéz hosszan koncentrálni' },
    ],
    user_question_hu: 'Hogyan érzed magad, ha munkavégzés közben rendszeresen megszakítanak?',
    employer_question_hu: 'Milyen rendszerességgel szakítják meg a munkavállalót munka közben?',
    clarification_key: 'clarify.ask.focus_block_possible',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'task_unexpected', dimension_code: 'task_dyn', display_order: 4,
    name_user_hu: 'Váratlan feladatok',
    name_employer_hu: 'Váratlan feladatok előfordulása',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Ritka' },
      { v: 2, label: 'Alkalmi' },
      { v: 3, label: 'Rendszeres' },
      { v: 4, label: 'Heti több alkalom' },
      { v: 5, label: 'Szinte naponta' },
    ],
    user_question_hu: 'Mennyire érzed könnyűnek, ha váratlan, azonnali feladatok kerülnek a napirendedbe?',
    employer_question_hu: 'Milyen rendszerességgel merülnek fel váratlan, előre nem tervezett feladatok?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── time (6) ─────────────────────────────────────────────────────────────

  {
    code: 'time_schedule_type', dimension_code: 'time', display_order: 1,
    name_user_hu: 'Munkarend típusa',
    name_employer_hu: 'Munkarend típusa',
    value_type: 'categorical', comparison_type: 'SET_MEMBERSHIP',
    categorical_options: ['fixed','flex','shift','on_call','irregular'],
    categorical_labels: {
      fixed: 'Rögzített munkarend',
      flex: 'Rugalmas kezdési/záró idő',
      shift: 'Műszakos',
      on_call: 'Készenlét (on-call)',
      irregular: 'Rendszertelen',
    },
    user_question_hu: 'Milyen munkarendben szívesebben dolgozol? (több is megjelölhető)',
    employer_question_hu: 'Milyen munkarendet alkalmaz ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'time_schedule_variability', dimension_code: 'time', display_order: 2,
    name_user_hu: 'Munkarend változékonysága',
    name_employer_hu: 'Munkarend változékonysága',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Rögzített, mindig azonos' },
      { v: 2, label: 'Alapvetően stabil, ritkán változik' },
      { v: 3, label: 'Rendszeres, de kezelhető változások' },
      { v: 4, label: 'Heti szinten is változhat' },
      { v: 5, label: 'Rendszeresen és váratlanul változik' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy a munkarendedre előre számíthass?',
    employer_question_hu: 'Milyen mértékben változik a munkavállalók munkarendje rövid távon?',
    clarification_key: 'clarify.ask.schedule_advance_notice',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'time_deadline_pressure', dimension_code: 'time', display_order: 3,
    name_user_hu: 'Határidős nyomás',
    name_employer_hu: 'Határidős nyomás mértéke',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Ritka határidő, alacsony nyomás' },
      { v: 2, label: 'Alkalmi határidők' },
      { v: 3, label: 'Rendszeres, de kezelhető határidők' },
      { v: 4, label: 'Rendszeres, szoros határidők' },
      { v: 5, label: 'Folyamatos, erős határidős nyomás' },
    ],
    user_question_hu: 'Mennyire viseled jól a szoros határidőkkel járó munkavégzést?',
    employer_question_hu: 'Milyen mértékű határidős nyomás jellemző erre a munkakörre?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'time_break_predictability', dimension_code: 'time', display_order: 4,
    name_user_hu: 'Szünetek kiszámíthatósága',
    name_employer_hu: 'Szünetek kiszámíthatósága',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Szünetek rögzített, tervezett időpontban' },
      { v: 2, label: 'Általában kiszámítható' },
      { v: 3, label: 'Részben kiszámítható' },
      { v: 4, label: 'Ritkán kiszámítható' },
      { v: 5, label: 'A szünetek rendszeresen csúsznak vagy kiszámíthatatlanok' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy a szüneteid kiszámítható időpontban legyenek?',
    employer_question_hu: 'Milyen mértékben kiszámíthatók a szünetek időpontjai ebben a munkakörben?',
    clarification_key: 'clarify.ask.break_scheduling',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'time_overtime', dimension_code: 'time', display_order: 5,
    name_user_hu: 'Túlóra / rugalmasság elvárása',
    name_employer_hu: 'Túlóra / munkaidőn túli elvárás',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Soha' },
      { v: 2, label: 'Ritkán' },
      { v: 3, label: 'Alkalmanként elvárás' },
      { v: 4, label: 'Rendszeres' },
      { v: 5, label: 'Folyamatos elvárás' },
    ],
    user_question_hu: 'Mennyire passzol számodra, ha időnként a munkaidőn túl is szükséges elérhetőnek lenned?',
    employer_question_hu: 'Milyen rendszerességgel szükséges túlóra vagy munkaidőn túli elérhetőség?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'time_shift_work', dimension_code: 'time', display_order: 6,
    name_user_hu: 'Műszakos munka',
    name_employer_hu: 'Műszakos munkavégzés',
    value_type: 'boolean', comparison_type: 'BOOLEAN_PREFERENCE',
    user_question_hu: 'Szívesen dolgoznál-e műszakos rendszerben?',
    employer_question_hu: 'Ez a munkakör műszakos munkavégzést igényel?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── autonomy (4) ─────────────────────────────────────────────────────────

  {
    code: 'autonomy_pace', dimension_code: 'autonomy', display_order: 1,
    name_user_hu: 'Saját munkatempa kontrollja',
    name_employer_hu: 'Munkavégzési tempó önállóságának szintje',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Kötött tempó, külső tényező szabja meg' },
      { v: 2, label: 'Részben kötött' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Főleg saját tempó' },
      { v: 5, label: 'Teljesen önállóan szabályozható' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy magad szabályozd a munkád tempóját?',
    employer_question_hu: 'Milyen mértékben tudja a munkavállaló maga szabályozni a munkavégzési tempóját?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'autonomy_task_order', dimension_code: 'autonomy', display_order: 2,
    name_user_hu: 'Feladatsorrend meghatározása',
    name_employer_hu: 'Feladatsorrend szabadsága',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Kötött sorrend' },
      { v: 2, label: 'Részben kötött' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Főleg szabad sorrend' },
      { v: 5, label: 'Teljesen szabad sorrend' },
    ],
    user_question_hu: 'Mennyire szívesen határozod meg magad, milyen sorrendben végzed a feladataidat?',
    employer_question_hu: 'Milyen mértékben határozhatja meg a munkavállaló a feladatok sorrendjét?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'autonomy_decision', dimension_code: 'autonomy', display_order: 3,
    name_user_hu: 'Önálló döntések aránya',
    name_employer_hu: 'Önálló döntési lehetőség',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Szinte minden döntést a vezető hoz' },
      { v: 2, label: 'Kevés önálló döntés' },
      { v: 3, label: 'Mérsékelt önállóság' },
      { v: 4, label: 'Sok önálló döntés' },
      { v: 5, label: 'Teljesen önálló döntéshozatal' },
    ],
    user_question_hu: 'Mennyire szívesen hozol önállóan döntéseket a munkában?',
    employer_question_hu: 'Milyen mértékben hozhat önállóan döntéseket a munkavállaló?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'autonomy_help_access', dimension_code: 'autonomy', display_order: 4,
    name_user_hu: 'Segítségkérés elérhetősége',
    name_employer_hu: 'Segítség elérhetősége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Bármikor azonnal elérhető segítség' },
      { v: 2, label: 'Általában elérhető' },
      { v: 3, label: 'Esetenként elérhető' },
      { v: 4, label: 'Ritkán elérhető' },
      { v: 5, label: 'Nehezen vagy alig elérhető' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy kérdés esetén könnyen kérhess segítséget?',
    employer_question_hu: 'Milyen mértékben elérhető segítség, ha a munkavállaló problémája merül fel?',
    clarification_key: 'clarify.ask.contact_person_available',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── support (6) ──────────────────────────────────────────────────────────

  {
    code: 'support_contact_person', dimension_code: 'support', display_order: 1,
    name_user_hu: 'Kijelölt kapcsolattartó',
    name_employer_hu: 'Kijelölt kapcsolattartó személy',
    value_type: 'boolean', comparison_type: 'BOOLEAN_PREFERENCE',
    user_question_hu: 'Fontos-e számodra, hogy legyen egy kijelölt személy, akihez kérdéssel fordulhatsz?',
    employer_question_hu: 'Van-e kijelölt kapcsolattartó személy a munkavállaló számára?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'support_mentor', dimension_code: 'support', display_order: 2,
    name_user_hu: 'Mentor elérhetősége',
    name_employer_hu: 'Mentor / bevezető kolléga elérhető',
    value_type: 'boolean', comparison_type: 'BOOLEAN_PREFERENCE',
    user_question_hu: 'Segítségedre lenne-e egy tapasztaltabb kolléga, aki bevezet a munkába?',
    employer_question_hu: 'Van-e elérhető mentor vagy tapasztalt kolléga az új munkavállaló segítségére?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'support_feedback_freq', dimension_code: 'support', display_order: 3,
    name_user_hu: 'Visszajelzés rendszeressége',
    name_employer_hu: 'Visszajelzés rendszeressége',
    value_type: 'frequency', comparison_type: 'FREQUENCY_RANGE',
    frequency_options: ['none','monthly','weekly','daily'],
    frequency_labels: {
      none: 'Nincs rendszeres visszajelzés',
      monthly: 'Havi rendszerességű',
      weekly: 'Heti rendszerességű',
      daily: 'Naponta',
    },
    user_question_hu: 'Milyen rendszerességgel szeretnél visszajelzést kapni a munkádról?',
    employer_question_hu: 'Milyen rendszerességgel ad visszajelzést a vezető a munkavállaló munkájáról?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'support_onboarding_quality', dimension_code: 'support', display_order: 4,
    name_user_hu: 'Betanítás strukturáltsága',
    name_employer_hu: 'Betanítási folyamat minősége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Teljes, strukturált betanítási folyamat' },
      { v: 2, label: 'Általában jól szervezett' },
      { v: 3, label: 'Részben strukturált' },
      { v: 4, label: 'Kevéssé szervezett' },
      { v: 5, label: 'Nincs formális betanítási rendszer' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy a munka kezdetén részletes betanításban vegyél részt?',
    employer_question_hu: 'Mennyire strukturált a betanítási folyamat ennél a munkakörnél?',
    clarification_key: 'clarify.ask.onboarding_plan_exists',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'support_change_notice', dimension_code: 'support', display_order: 5,
    name_user_hu: 'Változások előzetes jelzése',
    name_employer_hu: 'Változások kommunikálása',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Változásokat mindig előre jelzik' },
      { v: 2, label: 'Általában előre jelzik' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Ritkán jelzik előre' },
      { v: 5, label: 'Változások rendszeresen váratlanul érkeznek' },
    ],
    user_question_hu: 'Mennyire fontos számodra, hogy előre értesülj a változásokról?',
    employer_question_hu: 'Milyen mértékben értesítik előre a munkavállalókat a változásokról?',
    clarification_key: 'clarify.ask.change_communication_process',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'support_visual_instruction', dimension_code: 'support', display_order: 6,
    name_user_hu: 'Vizuális instrukciók',
    name_employer_hu: 'Vizuális instrukciók elérhetősége',
    value_type: 'boolean', comparison_type: 'BOOLEAN_PREFERENCE',
    user_question_hu: 'Segít-e a munkádban, ha a folyamatokat vizuálisan is bemutatják?',
    employer_question_hu: 'Elérhetők-e vizuális instrukciók (képes útmutatók, folyamatábrák) a feladatokhoz?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── physical (5) ─────────────────────────────────────────────────────────

  {
    code: 'physical_posture', dimension_code: 'physical', display_order: 1,
    name_user_hu: 'Munkavégzési testhelyzet',
    name_employer_hu: 'Jellemző munkavégzési testhelyzet',
    value_type: 'categorical', comparison_type: 'SET_MEMBERSHIP',
    categorical_options: ['seated','standing','mixed','mobile'],
    categorical_labels: {
      seated: 'Ülő munkavégzés',
      standing: 'Álló munkavégzés',
      mixed: 'Ülő és álló vegyesen',
      mobile: 'Folyamatosan mozgásban',
    },
    user_question_hu: 'Milyen testhelyzetben dolgozol a legkényelmesebben? (több is megjelölhető)',
    employer_question_hu: 'Milyen testhelyzet jellemző erre a munkakörre?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'physical_lifting', dimension_code: 'physical', display_order: 2,
    name_user_hu: 'Fizikai erőkifejtés / emelés',
    name_employer_hu: 'Fizikai erőkifejtés / emelési igény',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nincs fizikai erőkifejtés' },
      { v: 2, label: 'Enyhe (legfeljebb könnyű tárgyak)' },
      { v: 3, label: 'Mérsékelt' },
      { v: 4, label: 'Rendszeres, néha nehezebb tárgyak' },
      { v: 5, label: 'Folyamatos, nehéz fizikai munka' },
    ],
    user_question_hu: 'Mennyire viseled jól a rendszeres fizikai erőkifejtést a munkában?',
    employer_question_hu: 'Milyen mértékű fizikai erőkifejtést igényel ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'physical_fine_motor', dimension_code: 'physical', display_order: 3,
    name_user_hu: 'Finommotorika',
    name_employer_hu: 'Finommotorika igénye',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nincs precíziós kézmozgás szükséges' },
      { v: 2, label: 'Enyhe' },
      { v: 3, label: 'Mérsékelt' },
      { v: 4, label: 'Rendszeres precizitás szükséges' },
      { v: 5, label: 'Folyamatos, nagy precizitást igénylő kézimunka' },
    ],
    user_question_hu: 'Mennyire szívesen végzel precíziós, aprólékos kézimunkát?',
    employer_question_hu: 'Milyen mértékű finommotorikát igényel ez a munkakör?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'physical_repetitive_motion', dimension_code: 'physical', display_order: 4,
    name_user_hu: 'Ismétlődő mozgás',
    name_employer_hu: 'Ismétlődő mozgás aránya',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nincs' },
      { v: 2, label: 'Ritka' },
      { v: 3, label: 'Mérsékelt' },
      { v: 4, label: 'Rendszeres' },
      { v: 5, label: 'Folyamatos, erősen ismétlődő mozgássor' },
    ],
    user_question_hu: 'Hogyan viseled, ha munkavégzés közben hosszasan ismétlődő mozgássorokat kell végezni?',
    employer_question_hu: 'Milyen mértékű ismétlődő mozgás jellemző erre a munkakörre?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'physical_outdoor', dimension_code: 'physical', display_order: 5,
    name_user_hu: 'Szabadtéri munka',
    name_employer_hu: 'Szabadtéri munkavégzés aránya',
    value_type: 'ordinal', comparison_type: 'RANGE_PREFERENCE',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Teljes beltér' },
      { v: 2, label: 'Főleg beltér, alkalmi kültérrel' },
      { v: 3, label: 'Vegyes' },
      { v: 4, label: 'Főleg kültér' },
      { v: 5, label: 'Teljes kültér' },
    ],
    user_question_hu: 'Mennyire szívesen végzed a munkád egy részét szabadtéren?',
    employer_question_hu: 'Milyen arányban végzik a munkát szabadtéren?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  // ── location (4) ─────────────────────────────────────────────────────────

  {
    code: 'location_type', dimension_code: 'location', display_order: 1,
    name_user_hu: 'Munkavégzés helye',
    name_employer_hu: 'Munkavégzés helye (típus)',
    value_type: 'categorical', comparison_type: 'SET_MEMBERSHIP',
    categorical_options: ['office','remote','hybrid','on_site','field'],
    categorical_labels: {
      office: 'Irodai (teljes jelenlét)',
      remote: 'Teljes távmunka',
      hybrid: 'Irodai + táv kombináció',
      on_site: 'Helyszíni (pl. ügyfélnél)',
      field: 'Terepen',
    },
    user_question_hu: 'Hol szívesebben végzed a munkádat? (több is megjelölhető)',
    employer_question_hu: 'Hol végzik a munkát ebben a munkakörben?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'location_travel', dimension_code: 'location', display_order: 2,
    name_user_hu: 'Utazás / helyszínváltás',
    name_employer_hu: 'Utazás / helyszínváltás rendszeressége',
    value_type: 'ordinal', comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    ordinal_min: 1, ordinal_max: 5,
    ordinal_labels: [
      { v: 1, label: 'Nincs utazás' },
      { v: 2, label: 'Ritka' },
      { v: 3, label: 'Heti szinten' },
      { v: 4, label: 'Napi szinten' },
      { v: 5, label: 'Folyamatos helyközi utazás' },
    ],
    user_question_hu: 'Mennyire vállalod szívesen a rendszeres utazást munka céljából?',
    employer_question_hu: 'Milyen rendszerességgel szükséges utazni ebben a munkakörben?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'location_open_office', dimension_code: 'location', display_order: 3,
    name_user_hu: 'Nyitott irodai tér',
    name_employer_hu: 'Nyitott irodai tér jellemzi a munkakörnyezetet',
    value_type: 'boolean', comparison_type: 'BOOLEAN_PREFERENCE',
    user_question_hu: 'Szívesen dolgozol-e nyitott, közös irodai térben?',
    employer_question_hu: 'Nyitott irodai tér jellemzi-e a munkakörnyezetet?',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

  {
    code: 'location_quiet_space', dimension_code: 'location', display_order: 4,
    name_user_hu: 'Csendesebb munkaterület',
    name_employer_hu: 'Csendesebb munkaterület elérhető',
    value_type: 'boolean', comparison_type: 'BOOLEAN_PREFERENCE',
    user_question_hu: 'Fontos-e számodra, hogy munkavégzés közben elérhető legyen egy csendesebb sarok?',
    employer_question_hu: 'Elérhető-e a munkavállaló számára csendesebb munkaterület, ha szükséges?',
    clarification_key: 'clarify.ask.quiet_space_access',
    sensitive_risk: 'low', default_importance: 'medium', is_active: true,
  },

] // END: 51 sub-dimensions

export const VKMM_SEED: VkmmSeedData = {
  dimensions: VKMM_DIMENSIONS,
  subDimensions: VKMM_SUB_DIMENSIONS,
  schemaVersion: '2.2.1',
}
