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
  public_transport:     "konnyu_megkozelites",
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
};

/* ─── Inline SVG fallback ────────────────────────────────────────── */
const FALLBACK_ICONS: Record<string, JSX.Element> = {
  fixed_location: (
    <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
      <circle cx="12" cy="10" r="3"/>
    </g>
  ),
  calmer_env: (
    <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M17 8C8 10 5.9 16.17 3.82 22"/>
      <path d="M9.5 9.5c1 2 2.5 3.5 5 4.5"/>
      <path d="M18.97 9.26a10 10 0 1 0-13.97 13.97"/>
    </g>
  ),
  computer_work: (
    <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </g>
  ),
  varied_tasks: (
    <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <circle cx="17.5" cy="17.5" r="3.5"/>
    </g>
  ),
  can_ask_questions: (
    <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </g>
  ),
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
