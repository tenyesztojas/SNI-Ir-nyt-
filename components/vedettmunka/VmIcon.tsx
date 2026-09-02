// VédettMunka ikon library
// Ugyanolyan emoji-stílusú ikonok, mint a VédettSarok kategóriáknál.

interface VmIconProps {
  name: string;
  size?: number;
  className?: string;
}

/* ─── Slug → emoji map ───────────────────────────────────────────── */
const EMOJI: Record<string, string> = {
  // Kiszámíthatóság
  predictable_tasks:    "📋",
  predictable_schedule: "📅",
  advance_notice:       "🔔",
  routine_tasks:        "🔄",

  // Betanítás
  gradual_training:     "📈",
  assigned_mentor:      "🧑‍🏫",
  can_ask_questions:    "💬",
  regular_feedback:     "🗣️",

  // Munkakörnyezet
  quieter_env:          "🔇",
  small_team:           "👥",
  large_team:           "👨‍👩‍👧‍👦",
  low_verbal:           "🤫",
  calmer_env:           "🌿",
  low_customer:         "🙅",
  high_communication:   "📢",
  natural_light:        "☀️",
  calm_visual:          "👁️",

  // Szenzoros
  noise_low:            "🔈",
  noise_medium:         "🔉",
  noise_high:           "🔊",

  // Munka jellege
  written_tasks:        "📝",
  independent_work:     "🧑‍💻",
  computer_work:        "💻",
  varied_tasks:         "🎯",
  seated_work:          "🪑",
  standing_work:        "🧍",
  physical_work:        "🔧",
  repetitive_tasks:     "⚙️",

  // Munkaidő
  flexible_hours:       "⏰",
  part_time:            "🕑",
  full_time:            "🕛",
  no_weekend:           "📵",
  no_night:             "🌙",
  predictable_shift:    "🗓️",
  flexible_hours_schedule: "🔀",

  // Helyszín
  home_office:          "🏠",
  hybrid:               "🏠🏢",
  fixed_location:       "📍",
  onsite:               "🏢",

  // Megközelíthetőség
  public_transport:     "🚌",
  parking:              "🅿️",
  commute_support:      "💰",
  company_bus:          "🚐",
  accessible:           "♿",

  // Szünetek
  regular_breaks:       "☕",
  flexible_breaks:      "🕐",
  quiet_room:           "🚪",

  // Felszerelés, juttatás
  uniform_provided:     "👕",
  safety_equipment:     "⛑️",
  team_work:            "🤝",

  // Jelentkezési mód
  apply_cv:             "📄",
  apply_phone:          "📞",
  apply_email:          "📧",
};

/* ─── Fallback SVG (ha nincs emoji a slughoz) ────────────────────── */
const FALLBACK: JSX.Element = (
  <g strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <path d="M8 8h8M8 12h6M8 16h4"/>
  </g>
);

export default function VmIcon({ name, size = 24, className = "" }: VmIconProps) {
  const emoji = EMOJI[name];

  if (emoji) {
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
          fontSize: Math.round(size * 0.82),
          lineHeight: 1,
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {emoji}
      </span>
    );
  }

  // Fallback inline SVG
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
      {FALLBACK}
    </svg>
  );
}
