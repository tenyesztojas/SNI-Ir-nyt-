// ============================================================
// VédettMunka 2.0 – Attribútum / piktogram rendszer
// Frontenden is elérhető kategória + felirat adatok
// A valódi adatok a vm_job_attributes DB táblából jönnek.
// ============================================================

export type AttributeCategory =
  | "kiszamithatosag"
  | "betanitas"
  | "munkakornyzet"
  | "szenzoros"
  | "munka_jellege"
  | "munkaidő"
  | "helyszin"
  | "megkozelites"
  | "szunet";

export interface VmAttribute {
  id: string;
  slug: string;
  category: AttributeCategory;
  title_hu: string;
  easy_desc_hu: string;
  icon_name: string;
  attribute_type: "boolean" | "level";
  level_options: string[];
  display_order: number;
  is_active: boolean;
}

export interface VmJobAttributeValue {
  job_post_id: string;
  attribute_slug: string;
  value: string; // "true" | level value
  // joined
  attribute?: VmAttribute;
}

export interface VmWorkProfile {
  id: string;
  user_id: string;
  attribute_slugs: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Kategória metaadatok ────────────────────────────────────
export const ATTRIBUTE_CATEGORIES: Record<
  AttributeCategory,
  { label: string; emoji: string; color: string }
> = {
  kiszamithatosag: { label: "Kiszámíthatóság",       emoji: "📅", color: "blue"   },
  betanitas:       { label: "Betanítás és segítség",  emoji: "🎓", color: "green"  },
  munkakornyzet:   { label: "Munkakörnyezet",         emoji: "🏢", color: "navy"   },
  szenzoros:       { label: "Szenzoros környezet",    emoji: "👂", color: "amber"  },
  munka_jellege:   { label: "Munka jellege",          emoji: "💼", color: "gray"   },
  "munkaidő":      { label: "Munkaidő",               emoji: "🕐", color: "purple" },
  helyszin:        { label: "Munkavégzés helye",      emoji: "📍", color: "teal"   },
  megkozelites:    { label: "Megközelíthetőség",      emoji: "🚌", color: "rose"   },
  szunet:          { label: "Szünetek",               emoji: "☕", color: "orange" },
};

// ─── Helyi slug → cím és leírás map (offline fallback) ────────
export const ATTRIBUTE_LABELS: Record<string, { title: string; desc: string }> = {
  predictable_tasks:    { title: "Egyértelmű feladatok",          desc: "Pontosan elmondják, mit kell csinálnod." },
  predictable_schedule: { title: "Kiszámítható munkarend",        desc: "A munkaidődet előre ismered." },
  advance_notice:       { title: "Előre jelzik a változásokat",   desc: "Ha valami változik, igyekeznek előre szólni." },
  routine_tasks:        { title: "Kiszámítható feladatok",         desc: "A napi feladatok általában hasonlóak." },
  gradual_training:     { title: "Fokozatos betanítás",           desc: "A munkát lépésről lépésre mutatják meg." },
  assigned_mentor:      { title: "Kijelölt mentor / segítő",      desc: "Lesz olyan ember, akitől segítséget kérhetsz." },
  can_ask_questions:    { title: "Lehet kérdezni",                desc: "Ha valami nem világos, kérdezhetsz." },
  regular_feedback:     { title: "Rendszeres visszajelzés",       desc: "Elmondják, mi megy jól és miben fejlődhetsz." },
  written_tasks:        { title: "Írásban is megkapható feladatok", desc: "A feladatokat írásban is megkaphatod." },
  quieter_env:          { title: "Csendesebb környezet",          desc: "A munkahely általában nem hangos." },
  calmer_env:           { title: "Nyugodtabb környezet",          desc: "Kevés zavaró esemény történik körülötted." },
  small_team:           { title: "Kis csapat",                    desc: "Általában kevés emberrel dolgozol együtt." },
  large_team:           { title: "Nagyobb csapat",                desc: "Sok emberrel dolgozol egy helyen." },
  low_verbal:           { title: "Kevés beszélgetés",             desc: "A munkához kevés beszélgetés szükséges." },
  high_communication:   { title: "Sok kommunikáció",              desc: "A munka során sok emberrel kell beszélni." },
  low_customer:         { title: "Kevés ügyfélkapcsolat",         desc: "Ritkán kell ügyfelekkel beszélned." },
  independent_work:     { title: "Önálló munkavégzés",            desc: "A betanítás után sok feladatot egyedül végezhetsz." },
  team_work:            { title: "Csapatmunka",                   desc: "A feladatokat másokkal együtt végzitek." },
  noise_low:            { title: "Zajszint: alacsony",            desc: "A munkahely általában csendes." },
  noise_medium:         { title: "Zajszint: közepes",             desc: "Közepes zajszint – nem hangos, de nem is csendes." },
  noise_high:           { title: "Zajszint: magas",               desc: "A munkahely hangosabb." },
  natural_light:        { title: "Természetes fény",              desc: "A munkaterületen természetes fény van." },
  calm_visual:          { title: "Nyugodtabb vizuális környezet", desc: "Kevés villogó, forgó, zavaró elem." },
  seated_work:          { title: "Ülőmunka",                      desc: "A feladatokat ülve végzed." },
  standing_work:        { title: "Állómunka",                     desc: "A feladatokat állva végzed." },
  computer_work:        { title: "Számítógépes munka",            desc: "A munka nagy részét számítógépen végzed." },
  physical_work:        { title: "Fizikai munka",                 desc: "A munka fizikai erőkifejtéssel jár." },
  repetitive_tasks:     { title: "Ismétlődő feladatok",           desc: "A napi feladatok nagyrészt ugyanolyanok." },
  varied_tasks:         { title: "Változatos feladatok",          desc: "Különböző feladatokat kell elvégezni." },
  full_time:            { title: "Teljes munkaidő",               desc: "Napi 8 óra, heti 5 nap." },
  part_time:            { title: "Részmunkaidő",                  desc: "Napi 4–6 óra, vagy heti kevesebb nap." },
  flexible_hours:       { title: "Rugalmas munkaidő",             desc: "Megbeszélhető, mikor és hogyan dolgozol." },
  predictable_shift:    { title: "Kiszámítható műszak",           desc: "A beosztásodat előre megkapod." },
  no_weekend:           { title: "Hétvégi munka nincs",           desc: "Hétvégén nem kell dolgoznod." },
  no_night:             { title: "Éjszakai munka nincs",          desc: "Éjszakai műszak nincs." },
  onsite:               { title: "Helyszíni munkavégzés",         desc: "Minden nap egy meghatározott helyen dolgozol." },
  home_office:          { title: "Home office",                   desc: "Otthonról is dolgozhatsz." },
  hybrid:               { title: "Hibrid munkavégzés",            desc: "Részben otthonról, részben munkahelyen." },
  fixed_location:       { title: "Állandó munkahely",             desc: "Minden nap ugyanoda jársz dolgozni." },
  accessible:           { title: "Akadálymentes helyszín",        desc: "A munkahely akadálymentesen megközelíthető." },
  public_transport:     { title: "Tömegközlekedéssel elérhető",   desc: "Busszal vagy metróval könnyen megközelíthető." },
  parking:              { title: "Parkolási lehetőség",           desc: "Autóval érkezhetsz, van parkoló." },
  commute_support:      { title: "Munkába járás támogatása",      desc: "A munkáltató segít a bejárási költségekkel." },
  regular_breaks:       { title: "Rendszeres szünetek",           desc: "Rendszeres szünet van a munkaidőben." },
  flexible_breaks:      { title: "Szünet kérhető",               desc: "Ha szükséges, kérhetsz szünetet." },
  quiet_room:           { title: "Nyugodtabb hely elérhető",      desc: "Van hely, ahová rövid időre elvonulhatsz." },
};

// ─── Wizard lépések attribútum szlugjai ─────────────────────
export const WIZARD_STEP_ATTRIBUTES: Record<string, string[]> = {
  munkakornyzet: [
    "quieter_env", "calmer_env", "small_team", "large_team",
    "low_verbal", "high_communication", "low_customer",
    "independent_work", "team_work",
    "noise_low", "noise_medium", "noise_high",
    "natural_light", "calm_visual",
  ],
  betanitas: [
    "gradual_training", "assigned_mentor", "can_ask_questions",
    "regular_feedback", "written_tasks",
  ],
  kiszamithatosag: [
    "predictable_tasks", "predictable_schedule",
    "advance_notice", "routine_tasks",
  ],
  munkaidő: [
    "full_time", "part_time", "flexible_hours",
    "predictable_shift", "no_weekend", "no_night",
  ],
  helyszin: ["onsite", "home_office", "hybrid", "fixed_location"],
  megkozelites: ["accessible", "public_transport", "parking", "commute_support"],
  szunet: ["regular_breaks", "flexible_breaks", "quiet_room"],
  munka_jellege: [
    "seated_work", "standing_work", "computer_work",
    "physical_work", "repetitive_tasks", "varied_tasks",
  ],
};

// ─── Matching: melyik slug-ot próbálunk levezetni a meglévő job_posts mezőkből
// Ez backward-compatibility a régi állásokhoz
export function deriveAttributesFromJobPost(job: {
  noise_level?: string | null;
  verbal_interaction_level?: string | null;
  mentor_available?: string | null;
  written_instructions_available?: string | null;
  part_time_available?: string | null;
  start_end_flexibility?: string | null;
  work_location_type?: string | null;
}): string[] {
  const slugs: string[] = [];
  if (job.noise_level === "csendes") slugs.push("noise_low", "quieter_env");
  if (job.noise_level === "beszelgetes" || job.noise_level === "gepek") slugs.push("noise_medium");
  if (job.noise_level === "sok_hang" || job.noise_level === "nagyon_hangos") slugs.push("noise_high");
  if (job.verbal_interaction_level === "nem" || job.verbal_interaction_level === "ritkan") slugs.push("low_verbal");
  if (job.verbal_interaction_level === "igen") slugs.push("high_communication");
  if (job.mentor_available === "van") slugs.push("assigned_mentor");
  if (job.written_instructions_available === "igen") slugs.push("written_tasks");
  if (job.part_time_available === "igen") slugs.push("part_time");
  if (job.start_end_flexibility === "rugalmas") slugs.push("flexible_hours");
  if (job.work_location_type === "otthonrol") slugs.push("home_office");
  if (job.work_location_type === "hibrid") slugs.push("hybrid");
  if (job.work_location_type === "munkahelyen") slugs.push("onsite");
  return [...new Set(slugs)];
}
