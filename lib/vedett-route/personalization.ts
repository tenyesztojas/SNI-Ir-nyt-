// Személyre szabási súlyok — Sprint 2, 16. pont.
//
// FONTOS (kőkemény szabály): ezek a súlyok kizárólag PREFERENCIÁK, nem
// diagnózis-alapú előre gyártott profilok. Nincs "autista mód" / "ADHD mód"
// gomb — csak hat, tényezőnkénti csúszka, amit bárki tetszőlegesen állíthat,
// aszerint, hogy neki mi számít zavarónak. Az alapértelmezett minden
// tényezőnél egyenlő súlyt (1.0) ad.

import type { PersonalizationWeights, SensoryFactorKey } from "./types.ts";

export const DEFAULT_PERSONALIZATION_WEIGHTS: PersonalizationWeights = {
  transfers: 1,
  modeSwitches: 1,
  underground: 1,
  walking: 1,
  duration: 1,
  waiting: 1,
};

const WEIGHT_KEYS: (keyof PersonalizationWeights)[] = [
  "transfers",
  "modeSwitches",
  "underground",
  "walking",
  "duration",
  "waiting",
];

/** 0 és 2 közé szorítja minden súlyt (0 = ez a tényező ne számítson, 2 = kétszeres fontosságú). */
export function normalizePersonalizationWeights(input: Partial<PersonalizationWeights> | undefined): PersonalizationWeights {
  const out = { ...DEFAULT_PERSONALIZATION_WEIGHTS };
  if (!input) return out;
  for (const key of WEIGHT_KEYS) {
    const v = input[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = Math.min(2, Math.max(0, v));
    }
  }
  return out;
}

export function weightForFactor(weights: PersonalizationWeights, factor: SensoryFactorKey): number {
  switch (factor) {
    case "transfers":
      return weights.transfers;
    case "modeSwitches":
      return weights.modeSwitches;
    case "underground":
      return weights.underground;
    case "walking":
      return weights.walking;
    case "duration":
      return weights.duration;
    case "waiting":
      return weights.waiting;
    // A crowding és vehicleAccessibility tényezőknek jelenleg nincs valós
    // adatforrásuk — súlyuk irreleváns, mindig "unavailable" lesz.
    case "crowding":
    case "vehicleAccessibility":
      return 0;
    default:
      return 0;
  }
}
