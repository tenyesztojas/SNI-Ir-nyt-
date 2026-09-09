export const PILOT_MODULES = [
  { key: "vedett-jelzes",   label: "Védett Jelzés"  },
  { key: "vedett-partner",  label: "Védett Partner" },
  { key: "vedettmunka",     label: "Védett Munka"    },
  // ZÁRT BÉTA HOZZÁFÉRÉS (2026-09-09) — a kulcs értéke szándékosan
  // megegyezik a lib/vedett-route/config.ts VEDETT_ROUTE_BETA_FEATURE_KEY
  // konstansával; NE módosítsd az egyiket a másik nélkül.
  { key: "vedett_route_beta", label: "Védett Útvonal" },
] as const;

export type PilotModule = (typeof PILOT_MODULES)[number]["key"];
