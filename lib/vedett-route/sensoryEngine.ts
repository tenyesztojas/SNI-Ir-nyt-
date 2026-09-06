// Sensory Engine V1 — Sprint 2, 15. pont.
//
// KŐKEMÉNY SZABÁLY: egy tényező, aminek nincs valós adatforrása, SOHA nem
// kap 0 (="nincs terhelés") értéket. Kimarad a súlyozott átlagból (számláló
// ÉS nevező is), és a "missingFactors" tömbben jelenik meg, csökkentve a
// "confidence" mutatót. Jelenleg két tényezőnek nincs valós adatforrása:
// - crowding (jármű-szintű valós idejű foglaltság — sem BKK, sem a GTFS
//   statikus/RT feedek nem biztosítanak ilyet ma)
// - vehicleAccessibility (jármű-szintű, pl. légkondicionálás/rezgésszint
//   adat — nincs ilyen dokumentált BKK/GTFS mező)
//
// A score 0-100 skálán a SZENZOROS TERHELÉST fejezi ki (magasabb = nagyobb
// terhelés, NEM "jobb út") — ezt a UI invertálva jeleníti meg "nyugalom"
// címkeként.

import type { Journey, PersonalizationWeights, SensoryFactorKey, SensoryFactorResult, SensoryScore } from "./types.ts";
import { weightForFactor } from "./personalization.ts";

// Ez a "base" súly KIZÁRÓLAG a confidence (adatlefedettség) számításához
// használt, a felhasználói preferenciától FÜGGETLEN fontosság-becslés —
// nem azonos a personalization.ts-ben lévő, felhasználó által állítható
// súlyokkal.
const CONFIDENCE_BASE_WEIGHT: Record<SensoryFactorKey, number> = {
  transfers: 1,
  modeSwitches: 0.5,
  underground: 0.75,
  walking: 0.75,
  duration: 0.5,
  waiting: 0.75,
  crowding: 1,
  vehicleAccessibility: 0.5,
};

function clamp100(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function countModeSwitches(journey: Journey): number {
  const transitModes = journey.legs
    .filter((leg) => leg.mode === "TRANSIT")
    .map((leg) => leg.transitMode ?? "TRANSIT");
  let switches = 0;
  for (let i = 1; i < transitModes.length; i++) {
    if (transitModes[i] !== transitModes[i - 1]) switches++;
  }
  return switches;
}

function undergroundFraction(journey: Journey): number {
  const transitLegs = journey.legs.filter((leg) => leg.mode === "TRANSIT");
  if (transitLegs.length === 0) return 0;
  const underground = transitLegs.filter((leg) => leg.transitMode === "SUBWAY").length;
  return underground / transitLegs.length;
}

function computeAvailableFactors(journey: Journey): Omit<SensoryFactorResult, "weight">[] {
  const transfers = journey.transfers;
  const modeSwitches = countModeSwitches(journey);
  const undergroundFrac = undergroundFraction(journey);
  const walkingMin = journey.walkingMinutes;
  const durationMin = journey.totalDurationMinutes;
  const waitingMin = journey.waitingMinutes;

  return [
    { key: "transfers", available: true, rawValue: transfers, normalizedLoad: clamp100(transfers * 33) },
    { key: "modeSwitches", available: true, rawValue: modeSwitches, normalizedLoad: clamp100(modeSwitches * 40) },
    { key: "underground", available: true, rawValue: undergroundFrac, normalizedLoad: clamp100(undergroundFrac * 100) },
    { key: "walking", available: true, rawValue: walkingMin, normalizedLoad: clamp100(walkingMin * 5) },
    { key: "duration", available: true, rawValue: durationMin, normalizedLoad: clamp100((durationMin / 90) * 100) },
    { key: "waiting", available: true, rawValue: waitingMin, normalizedLoad: clamp100(waitingMin * 4) },
    {
      key: "crowding",
      available: false,
      reasonUnavailable: "Nincs valós idejű jármű-foglaltsági adatforrás (BKK GTFS-RT ezt jelenleg nem biztosítja).",
    },
    {
      key: "vehicleAccessibility",
      available: false,
      reasonUnavailable: "Nincs jármű-szintű akadálymentességi/érzékszervi-terhelési adat a jelenlegi GTFS forrásokban.",
    },
  ];
}

export function computeSensoryScore(journey: Journey, weights: PersonalizationWeights): SensoryScore {
  const rawFactors = computeAvailableFactors(journey);
  const factors: SensoryFactorResult[] = rawFactors.map((f) => ({ ...f, weight: weightForFactor(weights, f.key) }));

  const availableFactors = factors.filter((f) => f.available).map((f) => f.key);
  const missingFactors = factors.filter((f) => !f.available).map((f) => f.key);

  let weightedSum = 0;
  let weightTotal = 0;
  for (const f of factors) {
    if (!f.available || f.normalizedLoad === undefined || f.weight <= 0) continue;
    weightedSum += f.normalizedLoad * f.weight;
    weightTotal += f.weight;
  }
  const score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : 0;

  const confidenceNumerator = availableFactors.reduce((sum, k) => sum + CONFIDENCE_BASE_WEIGHT[k], 0);
  const confidenceDenominator = (Object.keys(CONFIDENCE_BASE_WEIGHT) as SensoryFactorKey[]).reduce(
    (sum, k) => sum + CONFIDENCE_BASE_WEIGHT[k],
    0
  );
  const confidence = Math.round((confidenceNumerator / confidenceDenominator) * 100) / 100;

  return { score, confidence, availableFactors, missingFactors, factors };
}
