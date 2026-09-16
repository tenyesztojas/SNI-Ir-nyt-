// NAVIGATION — WALK TURN-BY-TURN PROGRESS (Sprint 5, 2026-09-16).
//
// Pure, determinisztikus híd a Sprint 4 walkManoeuvre.ts (geometriai
// manőverlista) ÉS a MEGLÉVŐ GPS/route-progress motor
// (lib/vedett-route/navigation/routeProgress.ts) között. NINCS React/UI
// import, NINCS browser API, NINCS state — csak a bemenetként átadott
// értékektől függ.
//
// INDEX-SZEMANTIKA (KRITIKUS, lásd walkManoeuvre.ts fejléce is):
//   - WalkManoeuvre.segmentIndex: PONT-index a leg SAJÁT legCoordinates
//     tömbjében.
//   - lib/vedett-route/geometry.ts NavigationLegGeometryRange.
//     startSegmentIndex/endSegmentIndex: ÉL-index a GLOBÁLIS, összefűzött
//     route-koordinátatömbben (routeProgress.matchedSegmentIndex UGYANEBBEN
//     a globális tér ben él).
// Ez a modul EZT a két indexteret SOHA nem keveri implicit +/-1-ekkel: a
// globális matchedSegmentIndex -> leg-lokális index konverziót
// resolveLegLocalMatchedSegmentIndex() végzi el, EGYETLEN, explicit,
// tesztelt helyen.
//
// TÁVOLSÁG A KÖVETKEZŐ MANŐVERIG: NEM légvonal, NEM
// legPhaseFraction*legDistance becslés. A már MEGLÉVŐ,
// backward-tolerance-szel védett routeProgress.progressDistanceMeters
// (lib/vedett-route/navigation/routeProgress.ts) a route TELJES hosszára
// vonatkozó, monoton (GPS-zajra védett) kumulatív távolság. Ebből
// resolveDistanceAlongLegMeters() az AKTÍV WALK leg saját, 0-tól induló
// kumulatív távolságát vezeti le egyetlen kivonással (a leg globális
// kezdő-csúcsáig tartó kumulatív távolság levonásával) — így a leg-lokális
// távolság IS örökli a meglévő GPS-zaj/visszalépés-védelmet, ÚJ state
// (ref/useState) bevezetése NÉLKÜL a komponensben. A kumulatív
// távolság-számítás a MEGLÉVŐ haversineMeters helpert használja — nincs
// második távolság-formula.

import { haversineMeters } from "./geometry.ts";
import type { NavigationCoordinate } from "./types.ts";
import type { WalkManoeuvre } from "./walkManoeuvre.ts";
import type { NavigationLegGeometryRange } from "@/lib/vedett-route/geometry";

// Ez alatt a hátralévő távolság alatt egy TURN manőver már "MOST" (NOW)
// állapotú — felette "APPROACH" (előrejelzés, "X m múlva..."). Konzervatív,
// provider-semleges kezdőérték, NEM BKK/MÁV/Volán-specifikus.
export const TURN_NOW_DISTANCE_METERS = 15;

export type WalkManoeuvrePhase = "APPROACH" | "NOW" | "PASSED";

// Pure helper: EGY manőver fázisa a leg-lokális kumulatív távolság alapján.
//
// KRITIKUS SZABÁLY (lásd sprint specifikáció 4. pontja): egy manőver SOHA
// nem PASSED csak azért, mert a hátralévő távolság kicsi — KIZÁRÓLAG akkor,
// ha a route progress TÉNYLEGESEN túljutott a manőver saját
// distanceFromStartMeters pontján (szigorú `>`, nem `>=`, hogy a manőver
// PONTJÁN állva még NOW maradjon, ne váljon idő előtt PASSED-dé).
export function resolveManoeuvrePhase(manoeuvre: WalkManoeuvre, distanceAlongLegMeters: number): WalkManoeuvrePhase {
  if (distanceAlongLegMeters > manoeuvre.distanceFromStartMeters) return "PASSED";
  const distanceToManoeuvre = manoeuvre.distanceFromStartMeters - distanceAlongLegMeters;
  return distanceToManoeuvre <= TURN_NOW_DISTANCE_METERS ? "NOW" : "APPROACH";
}

// Pure helper: GLOBÁLIS matchedSegmentIndex -> leg-lokális ÉL-index, az
// aktív leg NavigationLegGeometryRange-je alapján. Null, ha nincs
// megbízható matchedSegmentIndex, nincs legRange, vagy a matchedSegmentIndex
// nem esik a leg tartományába (lásd resolveActiveLegIndex() ugyanezen
// mintáját lib/vedett-route/navigation/instructions.ts-ben).
//
// FONTOS: ez egy ÉL-index (ugyanabban a térben, mint
// NavigationLegGeometryRange.startSegmentIndex/endSegmentIndex), NEM
// azonos automatikusan a WalkManoeuvre.segmentIndex PONT-indexével — lásd a
// modul fejlécének index-szemantika szakaszát. Ezt a függvényt jelenleg
// diagnosztikai/validációs célra tartjuk fenn (pl. jövőbeli
// instrumentáció); a tényleges PASSED/APPROACH/NOW döntés
// resolveDistanceAlongLegMeters() folytonos-távolság alapú eredményén
// alapul, ami NEM keveri a két indexteret.
export function resolveLegLocalMatchedSegmentIndex(
  matchedSegmentIndex: number | null,
  legRange: NavigationLegGeometryRange | null | undefined,
): number | null {
  if (matchedSegmentIndex === null || !Number.isFinite(matchedSegmentIndex) || matchedSegmentIndex < 0) return null;
  if (!legRange) return null;
  if (matchedSegmentIndex < legRange.startSegmentIndex || matchedSegmentIndex > legRange.endSegmentIndex) return null;
  return matchedSegmentIndex - legRange.startSegmentIndex;
}

// Pure helper: a GLOBÁLIS route-koordinátatömb 0. pontjától a `vertexIndex`.
// pontig tartó kumulatív (haversine, route menti) távolság méterben. A
// MEGLÉVŐ haversineMeters helpert használja — nincs második
// távolság-formula. `vertexIndex` a coordinates tömb határain kívülre esve
// levágásra kerül (safe fallback, sosem dob kivételt).
export function cumulativeDistanceToVertex(coordinates: readonly NavigationCoordinate[], vertexIndex: number): number {
  if (coordinates.length === 0) return 0;
  const limit = Math.max(0, Math.min(vertexIndex, coordinates.length - 1));
  let total = 0;
  for (let i = 1; i <= limit; i += 1) total += haversineMeters(coordinates[i - 1], coordinates[i]);
  return total;
}

// Pure helper: a routeProgress motor GLOBÁLIS, monoton (backward-tolerance
// által védett) progressDistanceMeters értékéből az AKTÍV WALK leg SAJÁT,
// 0-tól induló kumulatív távolsága. `legTotalDistanceMeters`-re kell
// levágni (a leg VÉGE után a globális progress már a KÖVETKEZŐ leget méri).
// Null, ha bármelyik bemenet hiányzik/invalid — a hívó ekkor a Sprint 2/3
// WALK fallbackra esik vissza.
export function resolveDistanceAlongLegMeters(
  progressDistanceMeters: number | null,
  globalCoordinates: readonly NavigationCoordinate[],
  legRange: NavigationLegGeometryRange | null | undefined,
  legTotalDistanceMeters: number,
): number | null {
  if (progressDistanceMeters === null || !Number.isFinite(progressDistanceMeters)) return null;
  if (!legRange) return null;
  const legStartDistanceMeters = cumulativeDistanceToVertex(globalCoordinates, legRange.startSegmentIndex);
  const raw = progressDistanceMeters - legStartDistanceMeters;
  return Math.max(0, Math.min(legTotalDistanceMeters, raw));
}

export interface WalkProgressResult {
  currentManoeuvre: WalkManoeuvre | null;
  nextManoeuvre: WalkManoeuvre | null;
  distanceToCurrentMeters: number | null;
  phase: WalkManoeuvrePhase | null;
}

// Pure fő függvény: manoeuvres (detectWalkManoeuvres() kimenete, START-tal
// az elején, ARRIVE-vel a végén) + a leg-lokális kumulatív távolság ->
// current/next manőver pár, PASSED állapotúak automatikus átugrásával.
//
// A START SOHA nem válik current-té (lásd sprint specifikáció 8. pontja:
// "A START ne ragassza be a navigációt") — ki van zárva a kiválasztásból.
// Ha MINDEN manőver (a START-on kívül) PASSED (a route-progress már az
// ARRIVE pontján túl van), az utolsó elem (ARRIVE) marad current — ez egy
// konzervatív, sosem null-t adó safe fallback, amíg a hívó (leg-váltás)
// más instrukcióra nem vált.
export function resolveWalkProgress(
  manoeuvres: readonly WalkManoeuvre[],
  distanceAlongLegMeters: number,
): WalkProgressResult {
  const actionable = manoeuvres.filter((m) => m.kind !== "START");
  if (actionable.length === 0) return { currentManoeuvre: null, nextManoeuvre: null, distanceToCurrentMeters: null, phase: null };

  let current: WalkManoeuvre | null = null;
  for (const manoeuvre of actionable) {
    if (resolveManoeuvrePhase(manoeuvre, distanceAlongLegMeters) !== "PASSED") {
      current = manoeuvre;
      break;
    }
  }
  if (!current) current = actionable[actionable.length - 1];

  const currentIndex = actionable.indexOf(current);
  const next = actionable[currentIndex + 1] ?? null;
  const phase = resolveManoeuvrePhase(current, distanceAlongLegMeters);
  const distanceToCurrentMeters = Math.max(0, current.distanceFromStartMeters - distanceAlongLegMeters);

  return { currentManoeuvre: current, nextManoeuvre: next, distanceToCurrentMeters, phase };
}

// ============================================================================
// TÁVOLSÁG-FORMÁZÁS (sprint specifikáció 7. pontja) — nyugodt, navigációs
// célú kerekítés, hogy a szöveg NE villogjon minden GPS-frissítésnél.
// ============================================================================

export function roundNavigationDistanceMeters(meters: number): number {
  const safe = Math.max(0, meters);
  if (safe < 50) return Math.round(safe / 5) * 5;
  if (safe < 200) return Math.round(safe / 10) * 10;
  return Math.round(safe / 50) * 50;
}

// ============================================================================
// WALK INSTRUCTION SZÖVEG (sprint specifikáció 6. pontja) — rövid, nyugodt
// magyar szöveg, streetName/utcanév NÉLKÜL (lásd walkManoeuvre.ts korlátait).
// ============================================================================

function turnDirectionLabel(kind: WalkManoeuvre["kind"]): "jobbra" | "balra" | null {
  if (kind === "TURN_RIGHT") return "jobbra";
  if (kind === "TURN_LEFT") return "balra";
  return null;
}

export function buildWalkInstructionText(
  manoeuvre: WalkManoeuvre,
  phase: WalkManoeuvrePhase,
  distanceToCurrentMeters: number,
): string {
  const direction = turnDirectionLabel(manoeuvre.kind);
  const roundedDistance = roundNavigationDistanceMeters(distanceToCurrentMeters);

  if (direction) {
    return phase === "NOW" ? `Fordulj ${direction}` : `${roundedDistance} m múlva fordulj ${direction}`;
  }

  // ARRIVE (vagy egy jövőbeli, ezen sprintben nem használt CONTINUE) —
  // nincs kanyar-irány, csak "haladj tovább" a leg hátralévő hosszára.
  return `Haladj tovább ${roundedDistance} métert`;
}
