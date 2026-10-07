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

// RECOMMENDED METRO EXITS v1 (2026-10-07) — "Ajánlott kijárat" szövegek.
// Csak tényeket mond (kijárat-címke, gyalogos folytatás, ha mért: idő/táv);
// SOHA nem állít szenzoros tulajdonságot (nyugodtabb, csendesebb stb.).
export interface RecommendedExitText {
  /** pl. "Ajánlott kijárat: G" */
  title: string;
  detail: string;
  /** Csak valódi gyalogos útvonal esetén, pl. "kb. 6 perc séta · 450 m". */
  meta: string | null;
  liftNote: string | null;
  label: string;
}

/** Megbízható (HIGH/MEDIUM, címkézett) ajánlott kijárat szövege, vagy null. */
export function recommendedExitText(guidance: LegStationGuidance | undefined | null): RecommendedExitText | null {
  if (!guidance || guidance.schemaVersion !== 1 || guidance.status !== "EXIT_SELECTED") return null;
  const e = guidance.exit;
  if (!e || !shown(e.confidence)) return null;
  const label = typeof e.label === "string" && SAFE_LABEL.test(e.label) ? e.label : null;
  if (!label) return null;
  const w = e.rankingBasis === "WALKING_ROUTE" ? e.walkingRoute : null;
  const meta =
    w && Number.isFinite(w.durationSeconds) && Number.isFinite(w.distanceMeters) && w.durationSeconds > 0 && w.distanceMeters > 0
      ? `kb. ${Math.max(1, Math.round(w.durationSeconds / 60))} perc séta · ${Math.round(w.distanceMeters)} m`
      : null;
  return {
    title: `Ajánlott kijárat: ${label}`,
    detail: e.reasonCodes.includes("BEST_EXIT_FOR_TRANSFER")
      ? "Ezen a kijáraton keresztül kedvezőbb a gyalogos átszállás."
      : "Ezen a kijáraton keresztül kedvezőbb a gyalogos folytatás a célodhoz.",
    meta,
    liftNote: e.reasonCodes.includes("LIFT_PATH_AVAILABLE") ? "Liftes kapcsolat is ismert ehhez a kijárathoz." : null,
    label,
  };
}

export interface StationExitGuidanceTextOptions {
  /** A leszállási megálló neve, ha a felhasználó még a járművön van (leszálláshoz közeledve). */
  approachingStopName?: string | null;
}

/** Magyar határozott névelő a betű kiejtése szerint (pl. az „A”, az „F”, a „G”). */
export function hungarianArticle(label: string): "a" | "az" {
  return /^[AEFILMNORSUX]/.test(label) ? "az" : "a";
}

const safeStopName = (name: string | null | undefined): string | null => {
  if (typeof name !== "string") return null;
  const t = name.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= 80 ? t : null;
};

/** Aktív navigáció: kijárat / átszállás szöveg. Csak HIGH/MEDIUM; különben null. */
export function stationExitGuidanceText(guidance: LegStationGuidance | undefined | null, options: StationExitGuidanceTextOptions = {}): StationGuidanceText | null {
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
  const recommended = recommendedExitText(guidance);
  if (recommended) {
    const stop = safeStopName(options.approachingStopName);
    return {
      title: `${stop ? `A következő megálló ${stop}. ` : ""}Leszállás után keresd ${hungarianArticle(recommended.label)} „${recommended.label}” kijárat jelzését.`,
      detail: recommended.meta ? `${recommended.detail} (${recommended.meta})` : recommended.detail,
      liftNote: recommended.liftNote,
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
