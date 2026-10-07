// VÉDETT ÚTVONAL — STATION GUIDANCE MEGJELENÍTÉS (kliens, tiszta) (2026-10-07)
//
// Mikor MELYIK guidance látszik (egyszerre legfeljebb egy blokk), és
// milyen szöveggel. Csak kódokból épít szöveget; a nyelvezet a
// bizonyossághoz igazodik. Soha: kocsiszám, ajtó, "akadálymentes" állítás,
// nyers GTFS azonosító. Nincs analitika, nincs tárolás, nincs hálózat.

import type { JourneyLeg } from "../types.ts";
import type { LegStationGuidance, StationGuidanceConfidence } from "./guidanceTypes.ts";

const SAFE_LABEL = /^[A-Z][0-9]?$/;
const shown = (c: StationGuidanceConfidence | undefined) => c === "HIGH" || c === "MEDIUM";

/** A kijárat-guidance a leszállás utáni gyalogos láb első szakaszán releváns. */
export const EXIT_GUIDANCE_MAX_WALK_METERS = 250;

export type StationGuidanceDisplay = { kind: "BOARDING"; legIndex: number } | { kind: "EXIT"; legIndex: number };

export interface StationGuidanceDisplayInput {
  legs: readonly JourneyLeg[];
  activeLegIndex: number | null | undefined;
  walkToTransitPhase: string | null | undefined;
  alightingReady: boolean;
  activeWalkDistanceAlongMeters: number | null | undefined;
}

/**
 * Prioritás: BOARDING (felszállás előtt) > EXIT (leszálláshoz közeledve,
 * illetve leszállás után a gyalogos szakasz elején). Minden más: null.
 */
export function selectStationGuidanceDisplay(input: StationGuidanceDisplayInput): StationGuidanceDisplay | null {
  const { legs, activeLegIndex, walkToTransitPhase } = input;
  if (walkToTransitPhase === "APPROACHING_BOARDING" || walkToTransitPhase === "AT_BOARDING_AREA") {
    const start = Math.max(0, activeLegIndex ?? 0);
    const idx = legs.findIndex((leg, i) => i >= start && leg.mode === "TRANSIT");
    return idx >= 0 ? { kind: "BOARDING", legIndex: idx } : null;
  }
  if (typeof activeLegIndex !== "number" || activeLegIndex < 0) return null;
  const active = legs[activeLegIndex];
  if (!active) return null;
  if (active.mode === "TRANSIT") {
    return input.alightingReady ? { kind: "EXIT", legIndex: activeLegIndex } : null;
  }
  if (active.mode === "WALK" && legs[activeLegIndex - 1]?.mode === "TRANSIT") {
    const d = input.activeWalkDistanceAlongMeters;
    if (d === null || d === undefined || (Number.isFinite(d) && d < EXIT_GUIDANCE_MAX_WALK_METERS)) {
      return { kind: "EXIT", legIndex: activeLegIndex - 1 };
    }
  }
  return null;
}

export interface StationGuidanceText {
  title: string | null;
  detail: string | null;
  liftNote: string | null;
}

/** Aktív navigáció: kijárat / átszállás szöveg. Csak HIGH/MEDIUM; különben null. */
export function stationExitGuidanceText(guidance: LegStationGuidance | undefined | null): StationGuidanceText | null {
  if (!guidance || guidance.schemaVersion !== 1) return null;
  if (guidance.status === "TRANSFER_PATH" && guidance.transfer && shown(guidance.transfer.confidence)) {
    const t = guidance.transfer;
    const minutes = typeof t.traversalSeconds === "number" && t.traversalSeconds > 0 ? Math.max(1, Math.round(t.traversalSeconds / 60)) : null;
    return {
      title: "Átszállás az állomáson belül",
      detail: minutes !== null ? `A belső útvonal a BKK adatai szerint kb. ${minutes} perc.` : "Innen egyszerűbb lehet az átszállás.",
      liftNote: t.liftAvailable ? "Liftes kapcsolat is ismert az átszálláshoz." : null,
    };
  }
  if (guidance.status === "EXIT_SELECTED" && guidance.exit && shown(guidance.exit.confidence)) {
    const e = guidance.exit;
    const label = typeof e.label === "string" && SAFE_LABEL.test(e.label) ? e.label : null;
    const liftNote = e.reasonCodes.includes("LIFT_PATH_AVAILABLE") ? "Liftes kapcsolat is ismert ehhez a kijárathoz." : null;
    if (!label && !liftNote) return null;
    return {
      title: label ? `Az „${label}” kijárat lehet a kedvezőbb.` : null,
      detail: label
        ? e.reasonCodes.includes("BEST_EXIT_FOR_TRANSFER")
          ? "Innen egyszerűbb lehet az átszállás."
          : "Innen kevesebb gyaloglásra lehet szükség."
        : null,
      liftNote,
    };
  }
  return null;
}

/** Útvonal-előnézet: egy rövid sor a TRANSIT láb alatt, vagy null. */
export function stationPreviewText(guidance: LegStationGuidance | undefined | null): string | null {
  const t = stationExitGuidanceText(guidance);
  if (!t || !guidance) return null;
  const parts: string[] = [];
  if (guidance.status === "EXIT_SELECTED" && guidance.exit?.label && SAFE_LABEL.test(guidance.exit.label)) parts.push(`Ajánlott kijárat: ${guidance.exit.label}`);
  if (guidance.status === "TRANSFER_PATH" && typeof guidance.transfer?.traversalSeconds === "number" && guidance.transfer.traversalSeconds > 0) {
    parts.push(`Belső átszállás kb. ${Math.max(1, Math.round(guidance.transfer.traversalSeconds / 60))} perc`);
  }
  if (t.liftNote) parts.push("Liftes kapcsolat ismert");
  return parts.length > 0 ? parts.join(" · ") : null;
}
