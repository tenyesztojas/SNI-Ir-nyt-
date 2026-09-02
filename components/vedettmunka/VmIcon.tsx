// VédettMunka 2.0 – SVG ikon library
// Hivatalos VédettMunka piktogramok: /public/vedettmunka/icons/*.svg
// Ha nincs hivatalos SVG a slughoz, visszaesik az inline ikonra.

interface VmIconProps {
  name: string;
  size?: number;
  className?: string;
}

// ─── Slug → hivatalos SVG fájlnév ────────────────────────────────
// Csak azok a slugok szerepelnek itt, amelyekhez van feltöltött SVG.
const OFFICIAL_ICON_FILE: Record<string, string> = {
  accessible:          "akadalymentes_munkahely",
  company_bus:         "ceges_busz",
  quieter_env:         "csendes_kornyezet",
  predictable_tasks:   "egyertelmu_feladatok",
  apply_email:         "emailes_jelentkezes",
  gradual_training:    "fokozatos_betanitas",
  written_tasks:       "irasos_feladatok",
  apply_cv:            "jelentkezes_oneletrajzzal",
  low_verbal:          "keves_beszelgetes",
  assigned_mentor:     "kijelolt_segito",
  small_team:          "kis_csapat",
  predictable_schedule:"kiszamithato_munkarend",
  public_transport:    "konnyu_megkozelites",
  commute_support:     "munkaba_jaras_tamogatasa",
  uniform_provided:    "munkaruha",
  safety_equipment:    "munkavedelmi_eszkozok",
  hybrid:              "munkavegzes_otthon_es_munkahelyen",
  independent_work:    "onallo_munkavegzes",
  home_office:         "otthoni_munkavegzes",
  parking:             "parkolas",
  regular_feedback:    "rendszeres_visszajelzes",
  part_time:           "reszmunkaido",
  flexible_hours:      "rugalmas_munkaido",
  apply_phone:         "telefonos_jelentkezes",
};

// ─── Inline SVG fallback (slugokhoz, amelyekhez nincs hivatalos SVG) ─
const S = { strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

const ICONS: Record<string, JSX.Element> = {
  // ── Kiszámíthatóság ─────────────────────────────────────────
  advance_notice: (
    <g {...S}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      <path d="M12 2v2"/>
    </g>
  ),
  routine_tasks: (
    <g {...S}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83"/>
      <circle cx="12" cy="12" r="5"/>
      <path d="M9 12l2 2 4-4"/>
    </g>
  ),

  // ── Betanítás ───────────────────────────────────────────────
  can_ask_questions: (
    <g {...S}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </g>
  ),

  // ── Munkakörnyezet ──────────────────────────────────────────
  calmer_env: (
    <g {...S}>
      <path d="M17 8C8 10 5.9 16.17 3.82 22"/>
      <path d="M9.5 9.5c1 2 2.5 3.5 5 4.5"/>
      <path d="M18.97 9.26a10 10 0 1 0-13.97 13.97"/>
    </g>
  ),
  large_team: (
    <g {...S}>
      <circle cx="7" cy="8" r="2.5"/>
      <circle cx="12" cy="7" r="2.5"/>
      <circle cx="17" cy="8" r="2.5"/>
      <path d="M2 20v-.5A4.5 4.5 0 0 1 9.5 15"/>
      <path d="M7 20v-.5a5.5 5.5 0 0 1 10 0v.5"/>
      <path d="M14.5 15A4.5 4.5 0 0 1 22 19.5V20"/>
    </g>
  ),
  high_communication: (
    <g {...S}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 10h8M8 13h5"/>
      <circle cx="19" cy="6" r="4"/>
      <path d="M17 6h4M19 4v4"/>
    </g>
  ),
  low_customer: (
    <g {...S}>
      <circle cx="12" cy="8" r="4"/>
      <path d="M6 20v-2a6 6 0 0 1 6-6"/>
      <path d="M16 17l4-4m0 4l-4-4"/>
    </g>
  ),
  team_work: (
    <g {...S}>
      <circle cx="9" cy="8" r="3"/>
      <circle cx="15" cy="8" r="3"/>
      <path d="M3 20v-1a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v1"/>
    </g>
  ),

  // ── Szenzoros ───────────────────────────────────────────────
  noise_low: (
    <g {...S}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </g>
  ),
  noise_medium: (
    <g {...S}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </g>
  ),
  noise_high: (
    <g {...S}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M22.6 1.4a15 15 0 0 1 0 21.2"/>
    </g>
  ),
  natural_light: (
    <g {...S}>
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </g>
  ),
  calm_visual: (
    <g {...S}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 9v6M9 12h6" strokeWidth="1" opacity="0.4"/>
    </g>
  ),

  // ── Munka jellege ───────────────────────────────────────────
  seated_work: (
    <g {...S}>
      <path d="M6 20h12M8 20V10a4 4 0 0 1 4-4v0a4 4 0 0 1 4 4v10"/>
      <circle cx="12" cy="4" r="2"/>
      <path d="M5 15h14"/>
    </g>
  ),
  standing_work: (
    <g {...S}>
      <circle cx="12" cy="4" r="2"/>
      <path d="M12 6v8M9 10l3 4 3-4M9 22l3-4 3 4"/>
    </g>
  ),
  computer_work: (
    <g {...S}>
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </g>
  ),
  physical_work: (
    <g {...S}>
      <path d="M6.5 6.5L3 3M17.5 6.5L21 3M12 3v4"/>
      <path d="M4 12a8 8 0 0 1 16 0"/>
      <path d="M8 12a4 4 0 0 1 8 0"/>
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
    </g>
  ),
  repetitive_tasks: (
    <g {...S}>
      <path d="M17 1l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </g>
  ),
  varied_tasks: (
    <g {...S}>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <circle cx="17.5" cy="17.5" r="3.5"/>
    </g>
  ),

  // ── Munkaidő ────────────────────────────────────────────────
  full_time: (
    <g {...S}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 6v6l4 2"/>
    </g>
  ),
  flexible_hours_schedule: (
    <g {...S}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 6v6l3 3"/>
      <path d="M18.5 5.5l-2.5 2.5M5.5 5.5l2.5 2.5"/>
    </g>
  ),
  predictable_shift: (
    <g {...S}>
      <rect x="3" y="4" width="18" height="17" rx="2"/>
      <path d="M3 9h18M8 2v4M16 2v4"/>
      <circle cx="12" cy="15" r="3"/>
      <path d="M12 13v2l1 1"/>
    </g>
  ),
  no_weekend: (
    <g {...S}>
      <rect x="3" y="4" width="18" height="17" rx="2"/>
      <path d="M3 9h18M8 2v4M16 2v4"/>
      <path d="M9 14l6 6M15 14l-6 6"/>
    </g>
  ),
  no_night: (
    <g {...S}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      <line x1="4" y1="4" x2="20" y2="20" strokeWidth="1.75"/>
    </g>
  ),

  // ── Helyszín ────────────────────────────────────────────────
  onsite: (
    <g {...S}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </g>
  ),
  fixed_location: (
    <g {...S}>
      <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
      <circle cx="12" cy="10" r="3"/>
    </g>
  ),

  // ── Megközelíthetőség ───────────────────────────────────────
  commute_support_fallback: (
    <g {...S}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </g>
  ),

  // ── Szünetek ────────────────────────────────────────────────
  regular_breaks: (
    <g {...S}>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/>
      <line x1="10" y1="1" x2="10" y2="4"/>
      <line x1="14" y1="1" x2="14" y2="4"/>
    </g>
  ),
  flexible_breaks: (
    <g {...S}>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/>
      <path d="M20 1l-4 4M16 1l4 4" strokeWidth="1.25"/>
    </g>
  ),
  quiet_room: (
    <g {...S}>
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <path d="M9 3v18M15 9h-6"/>
      <line x1="15" y1="9" x2="9" y2="9"/>
      <line x1="15" y1="12" x2="12" y2="12"/>
      <line x1="15" y1="15" x2="13" y2="15"/>
    </g>
  ),
};

// ─── Alapértelmezett fallback ikon ────────────────────────────────
const FALLBACK: JSX.Element = (
  <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <path d="M8 8h8M8 12h6M8 16h4"/>
  </g>
);

export default function VmIcon({ name, size = 20, className = "" }: VmIconProps) {
  // Ha van hivatalos SVG, azt használjuk
  const officialFile = OFFICIAL_ICON_FILE[name];
  if (officialFile) {
    return (
      <img
        src={`/vedettmunka/icons/${officialFile}.svg`}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        className={className}
        style={{ display: "inline-block", flexShrink: 0 }}
      />
    );
  }

  // Fallback: inline SVG
  const icon = ICONS[name] ?? FALLBACK;
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
