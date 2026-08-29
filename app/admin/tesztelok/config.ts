export const PILOT_MODULES = [
  { key: "vedett-jelzes",  label: "Védett Jelzés"  },
  { key: "vedett-partner", label: "Védett Partner" },
  { key: "vedettmunka",    label: "Védett Munka"    },
] as const;

export type PilotModule = (typeof PILOT_MODULES)[number]["key"];
