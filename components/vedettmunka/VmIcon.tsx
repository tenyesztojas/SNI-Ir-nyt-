// VédettMunka 2.0 – SVG ikon library
// Egységes stílus: 24×24 viewBox, stroke-based, stroke-width 1.75, lekerekített végek
// Minden ikon "slug" alapján renderel.

interface VmIconProps {
  name: string;
  size?: number;
  className?: string;
}

const S = { strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

const ICONS: Record<string, JSX.Element> = {
  // ── Kiszámíthatóság ─────────────────────────────────────────
  predictable_tasks: (
    <g {...S}>
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M8 8h8M8 12h6M8 16h4"/>
      <path d="M15 12l1.5 1.5L19 10" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),
  predictable_schedule: (
    <g {...S}>
      <rect x="3" y="4" width="18" height="17" rx="2"/>
      <path d="M3 9h18M8 2v4M16 2v4"/>
      <path d="M7 14h2v2H7z" fill="currentColor" stroke="none"/>
      <path d="M11 14h2v2h-2z" fill="currentColor" stroke="none"/>
    </g>
  ),
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
  gradual_training: (
    <g {...S}>
      <path d="M4 20h3v-4H4zM9 20h3v-8H9zM14 20h3V8h-3zM19 20h1V4h-1"/>
      <path d="M2 20h20"/>
    </g>
  ),
  assigned_mentor: (
    <g {...S}>
      <circle cx="9" cy="7" r="3"/>
      <path d="M3 20v-1a6 6 0 0 1 12 0v1"/>
      <path d="M17 11l2 2 4-4"/>
    </g>
  ),
  can_ask_questions: (
    <g {...S}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </g>
  ),
  regular_feedback: (
    <g {...S}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </g>
  ),
  written_tasks: (
    <g {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </g>
  ),

  // ── Munkakörnyezet ──────────────────────────────────────────
  quieter_env: (
    <g {...S}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/>
      <line x1="17" y1="9" x2="23" y2="15"/>
    </g>
  ),
  calmer_env: (
    <g {...S}>
      <path d="M17 8C8 10 5.9 16.17 3.82 22"/>
      <path d="M9.5 9.5c1 2 2.5 3.5 5 4.5"/>
      <path d="M18.97 9.26a10 10 0 1 0-13.97 13.97"/>
    </g>
  ),
  small_team: (
    <g {...S}>
      <circle cx="9" cy="8" r="3"/>
      <circle cx="16" cy="8" r="2"/>
      <path d="M3 20v-1a6 6 0 0 1 12 0v1"/>
      <path d="M16 15c2.21 0 4 1.79 4 4v1"/>
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
  low_verbal: (
    <g {...S}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <line x1="9" y1="10" x2="15" y2="10"/>
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
  independent_work: (
    <g {...S}>
      <circle cx="12" cy="8" r="4"/>
      <path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
      <path d="M12 15v3"/>
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
  part_time: (
    <g {...S}>
      <path d="M12 21a9 9 0 0 1 0-18"/>
      <path d="M12 3a9 9 0 0 1 9 9"/>
      <path d="M12 6v6l3 3"/>
      <line x1="12" y1="3" x2="12" y2="12" opacity="0.3"/>
    </g>
  ),
  flexible_hours: (
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
  home_office: (
    <g {...S}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <rect x="8" y="13" width="8" height="5" rx="1"/>
      <path d="M10 13v-2h4v2"/>
    </g>
  ),
  hybrid: (
    <g {...S}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <path d="M12 22V12"/>
      <path d="M8 12h8"/>
    </g>
  ),
  fixed_location: (
    <g {...S}>
      <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
      <circle cx="12" cy="10" r="3"/>
    </g>
  ),

  // ── Megközelíthetőség ───────────────────────────────────────
  accessible: (
    <g {...S}>
      <circle cx="16" cy="4" r="1"/>
      <path d="M10 9l6-1 2 5-5 3v5"/>
      <path d="M10 9L7 15h6"/>
      <path d="M8 19a4 4 0 1 0 8 0"/>
    </g>
  ),
  public_transport: (
    <g {...S}>
      <path d="M8 6v6M16 6v6"/>
      <path d="M3 6h18v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6z"/>
      <path d="M5 18l-1 3M19 18l1 3"/>
      <path d="M3 10h18"/>
    </g>
  ),
  parking: (
    <g {...S}>
      <rect x="3" y="3" width="18" height="18" rx="4"/>
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>
    </g>
  ),
  commute_support: (
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

export default function VmIcon({ name, size = 20, className = "" }: VmIconProps) {
  const icon = ICONS[name] ?? ICONS["predictable_tasks"];
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
