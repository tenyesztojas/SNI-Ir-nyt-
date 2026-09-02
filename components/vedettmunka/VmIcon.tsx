// VédettMunka ikon library
// Hivatalos meseillusztrációs SVG ikonok: /public/vedettmunka/icons/*.svg
// Landscape arányú képek (≈220×177) – span konténerben, objectFit: contain.
// Ismeretlen slugnál inline SVG fallback.

interface VmIconProps {
  name: string;
  size?: number;
  className?: string;
}

/* ─── Slug → SVG fájlnév ─────────────────────────────────────────── */
const OFFICIAL: Record<string, string> = {
  // ── Eredeti 24 illusztrációs ikon ───────────────────────────────
  accessible:           "akadalymentes_munkahely",
  company_bus:          "ceges_busz",
  quieter_env:          "csendes_kornyezet",
  predictable_tasks:    "egyertelmu_feladatok",
  apply_email:          "emailes_jelentkezes",
  gradual_training:     "fokozatos_betanitas",
  written_tasks:        "irasos_feladatok",
  apply_cv:             "jelentkezes_oneletrajzzal",
  low_verbal:           "keves_beszelgetes",
  assigned_mentor:      "kijelolt_segito",
  small_team:           "kis_csapat",
  predictable_schedule: "kiszamithato_munkarend",
  public_transport:     "tomegkozlekedessel_elerheto",
  commute_support:      "munkaba_jaras_tamogatasa",
  uniform_provided:     "munkaruha",
  safety_equipment:     "munkavedelmi_eszkozok",
  hybrid:               "munkavegzes_otthon_es_munkahelyen",
  independent_work:     "onallo_munkavegzes",
  home_office:          "otthoni_munkavegzes",
  parking:              "parkolas",
  regular_feedback:     "rendszeres_visszajelzes",
  part_time:            "reszmunkaido",
  flexible_hours:       "rugalmas_munkaido",
  apply_phone:          "telefonos_jelentkezes",

  // ── Új illusztrációs ikonok ──────────────────────────────────────
  // Kiszámíthatóság
  advance_notice:       "elore_jelzik_a_valtozasokat",
  routine_tasks:        "kiszamithato_feladatok",
  // Betanítás
  can_ask_questions:    "lehet_kerdezni",
  // Helyszín
  onsite:               "munkahelyen",
  fixed_location:       "allando_munkahely",
  // Szünetek
  regular_breaks:       "rendszeres_szunetek",
  flexible_breaks:      "szunet_kerheto",
  quiet_room:           "nyugodtabb_hely_elerheto",
  // Munka jellege
  seated_work:          "ulomunka",
  standing_work:        "allomunka",
  computer_work:        "szamitogepes_munka",
  physical_work:        "fizikai_munka",
  repetitive_tasks:     "ismetlodo_feladatok",
  varied_tasks:         "valtozatos_feladatok",
  // Munkaidő
  full_time:            "teljes_munkaido",
  predictable_shift:    "kiszamithato_muszak",
  no_weekend:           "hetvegi_munka_nincs",
  no_night:             "ejszakai_munka_nincs",
  // Munkakörnyezet
  calmer_env:           "nyugodtabb_kornyezet",
  large_team:           "nagyobb_csapat",
  high_communication:   "sok_kommunikacio",
  low_customer:         "keves_ugyfelkapcsolat",
  team_work:            "csapatmunka",
  // Szenzoros
  noise_low:            "zajszint_alacsony",
  noise_medium:         "zajszint_kozepes",
  noise_high:           "zajszint_magas",
  natural_light:        "termeszetes_feny",
  calm_visual:          "nyugodtabb_vizualis_kornyezet",
};

/* ─── Inline SVG fallback (csak slugokhoz, amelyeknek még nincs rajzolt ikonjuk) ── */
const FALLBACK_ICONS: Record<string, JSX.Element> = {
  regular_feedback: (
    <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 10h8M8 13h5"/>
    </g>
  ),
};

const DEFAULT_FALLBACK: JSX.Element = (
  <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <path d="M8 8h8M8 12h6M8 16h4"/>
  </g>
);

export default function VmIcon({ name, size = 24, className = "" }: VmIconProps) {
  const file = OFFICIAL[name];

  if (file) {
    // Landscape SVG-k: span konténer tartja a négyzetet, img arányosan kitölti
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          flexShrink: 0,
        }}
      >
        <img
          src={`/vedettmunka/icons/${file}.svg`}
          alt=""
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </span>
    );
  }

  // Inline SVG fallback
  const icon = FALLBACK_ICONS[name] ?? DEFAULT_FALLBACK;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {icon}
    </svg>
  );
}
