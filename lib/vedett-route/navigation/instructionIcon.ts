// NAVIGATION — INSTRUCTION ICON MODEL (2026-09-25).
//
// Pure, determinisztikus, UI-FÜGGETLEN modul: a MÁR MEGLÉVŐ, canonical
// navigációs mezőkből (NavigationInstruction.kind — lásd instructions.ts,
// WalkManoeuvre.kind — lásd walkManoeuvre.ts, JourneyLeg.transitMode —
// lásd types.ts) egy diszkrét NavigationIconType kulcsot vezet le. NINCS
// React/UI import, NINCS GPS-alapú következtetés, NINCS navigációs
// üzleti logika (nem dönt arról, MI az aktuális instrukció — csak azt
// mondja meg, a MÁR kiválasztott instrukcióhoz melyik ikon illik). A
// tényleges SVG-komponens-térkép a hívó oldalon (
// components/vedett-utvonal/VedettUtvonalSearchForm.tsx) él.
//
// KATEGÓRIÁK ÉS KORLÁTOZÁSOK (lásd a feladat specifikációja):
//   - WALK: straight/right/left/generic. U-TURN NEM TÁMOGATOTT — a MEGLÉVŐ
//     walkManoeuvre.ts WalkManoeuvreKind uniója ("START" | "CONTINUE" |
//     "TURN_LEFT" | "TURN_RIGHT" | "ARRIVE") NEM tartalmaz U-turn
//     megkülönböztetést, ezt a modul NEM találja ki — egy WALK manőver,
//     amit a hívó mégis "U_TURN"-ként adna át, a biztonságos "walk-generic"
//     fallbackra esik (lásd resolveWalkIconType() lent).
//   - TRANSIT: BUS/TRAM/SUBWAY/RAIL (+ a spec kérésére REGIONAL_RAIL is a
//     RAIL-lel egy vödörbe kerül, HA valaha előfordulna — jelenleg a MOTIS
//     válaszokban/kódban ez az érték NEM fordul elő, lásd
//     VedettUtvonalSearchForm.tsx TRANSIT_MODE_LABELS/TRANSIT_MODE_BADGE
//     táblái). Trolibusz (pl. "TROLLEYBUS")/HÉV KÜLÖN ikonja NEM TÁMOGATOTT
//     — a JourneyLeg.transitMode egy nyers MOTIS string (lásd types.ts
//     kommentje), amiben ezek az értékek NEM különülnek el megbízhatóan a
//     BUS/RAIL-től a jelenlegi adatmodellben — minden más transitMode
//     (COACH/FERRY/AIRPLANE/ODM/FLEX/ismeretlen/hiányzó) a generikus
//     "transit-generic" fallbackra esik, NINCS kitalálva köztük különbség.
//   - BIKE: a MOL Bubi BIKE_PICKUP/BIKE_RIDE/BIKE_DROPOFF instrukció-kind-ok
//     (lásd instructions.ts instructionsForLeg() RENTAL ága) MÁR megbízhatóan
//     megkülönböztetettek — nem "találjuk ki", a NavigationInstructionKind
//     enum már tartalmazza őket —, ezért egy közös "bike" ikon-kategóriát
//     kapnak.
//   - ACTION: boarding (BOARD) / alighting (ALIGHT) / transfer (TRANSFER) /
//     arrival (ARRIVE) — közvetlenül a NavigationInstructionKind mezőből.
//   - START, és minden más/ismeretlen bemenet -> "generic" biztonságos
//     fallback (semleges nyíl/pötty).

import type { NavigationInstructionKind } from "./instructions.ts";
import type { WalkManoeuvreKind } from "./walkManoeuvre.ts";

export type NavigationIconType =
  | "walk-straight"
  | "walk-left"
  | "walk-right"
  | "walk-generic"
  | "transit-bus"
  | "transit-tram"
  | "transit-subway"
  | "transit-rail"
  | "transit-generic"
  | "action-boarding"
  | "action-alighting"
  | "action-transfer"
  | "action-arrival"
  | "bike"
  | "generic";

// Transit módok, amiket a MEGLÉVŐ kódban (VedettUtvonalSearchForm.tsx
// TRANSIT_MODE_LABELS/TRANSIT_MODE_BADGE) is név szerint ismerünk, és
// amikhez a MOTIS válasz megbízhatóan, találgatás nélkül ad transitMode
// stringet. "REGIONAL_RAIL" a specifikáció kérésére a RAIL vödörbe esik —
// jelenleg egyetlen ismert MOTIS válaszban sem fordul elő, de HA valaha
// előfordulna, a RAIL-lel egyenértékű, sosem kitalált jelentésű.
const RAIL_LIKE_TRANSIT_MODES = new Set(["RAIL", "REGIONAL_RAIL"]);

/**
 * Pure helper: a MÁR MEGLÉVŐ JourneyLeg.transitMode nyers string mezőből
 * (lásd types.ts kommentje) a TRANSIT ikon-kategória. Hiányzó/ismeretlen/
 * meg nem különböztethető mód (pl. trolibusz, HÉV, COACH, FERRY,
 * AIRPLANE, ODM, FLEX) -> "transit-generic", SOSEM kitalálva.
 */
export function resolveTransitIconType(transitMode: string | null | undefined): NavigationIconType {
  if (transitMode === "BUS") return "transit-bus";
  if (transitMode === "TRAM") return "transit-tram";
  if (transitMode === "SUBWAY") return "transit-subway";
  if (transitMode && RAIL_LIKE_TRANSIT_MODES.has(transitMode)) return "transit-rail";
  return "transit-generic";
}

/**
 * Pure helper: a MÁR MEGLÉVŐ WalkManoeuvre.kind mezőből (lásd
 * walkManoeuvre.ts) a WALK ikon-kategória. "CONTINUE"/"START"/"ARRIVE"
 * (nincs kanyar) -> "walk-straight". Bármilyen NEM ismert érték (pl. egy
 * jövőbeli, itt még nem kezelt kind) -> a biztonságos "walk-generic"
 * fallback, SOSEM találgatva kanyarirányt.
 */
export function resolveWalkIconType(manoeuvreKind: WalkManoeuvreKind | null | undefined): NavigationIconType {
  if (manoeuvreKind === "TURN_LEFT") return "walk-left";
  if (manoeuvreKind === "TURN_RIGHT") return "walk-right";
  if (manoeuvreKind === "START" || manoeuvreKind === "CONTINUE" || manoeuvreKind === "ARRIVE") return "walk-straight";
  return "walk-generic";
}

export interface ResolveInstructionIconInput {
  // A MÁR kiválasztott (selectActiveInstructionWithStopProgress() által
  // visszaadott) canonical instrukció kind mezője — ugyanaz, ami a
  // vizuális kártyát és a TTS-t is vezérli (lásd a modul fejlécének
  // "single source of truth" elve).
  kind: NavigationInstructionKind;
  // CSAK "RIDE" kind esetén releváns: az aktív TRANSIT leg MÁR MEGLÉVŐ,
  // NORMALIZÁLT transitMode mezője (JourneyLeg.transitMode).
  transitMode?: string | null;
  // CSAK "WALK" kind esetén releváns: a MÁR MEGLÉVŐ, aktív WALK-manőver
  // kind mezője (walkManoeuvreProgress.ts resolveWalkProgress()
  // currentManoeuvre.kind), vagy null, ha nincs megbízható manőver-adat
  // (pl. rövid/hiányzó geometria) — ekkor a biztonságos "walk-generic"-re
  // esünk.
  walkManoeuvreKind?: WalkManoeuvreKind | null;
}

/**
 * Pure fő függvény: a canonical instrukció mezőiből -> NavigationIconType.
 * Determinisztikus, sosem dob kivételt, NEM módosítja a bemenetet, NEM
 * olvas semmilyen mezőt, amit a hívó nem adott át explicit módon (nincs
 * globális state/GPS-hozzáférés).
 */
export function resolveInstructionIcon(input: ResolveInstructionIconInput): NavigationIconType {
  switch (input.kind) {
    case "WALK":
      return resolveWalkIconType(input.walkManoeuvreKind ?? null);
    case "RIDE":
      return resolveTransitIconType(input.transitMode ?? null);
    case "BOARD":
      return "action-boarding";
    case "ALIGHT":
      return "action-alighting";
    case "TRANSFER":
      return "action-transfer";
    case "ARRIVE":
      return "action-arrival";
    case "BIKE_PICKUP":
    case "BIKE_RIDE":
    case "BIKE_DROPOFF":
      return "bike";
    case "START":
    default:
      return "generic";
  }
}
