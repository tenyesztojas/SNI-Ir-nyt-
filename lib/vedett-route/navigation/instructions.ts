// NAVIGÁCIÓS UTASÍTÁS / ESEMÉNY MODELL (Navigation Instructions Sprint 1,
// 2026-09-16).
//
// Ez a modul a MEGLÉVŐ, multimodális Journey/Leg adatmodellből (lásd
// lib/vedett-route/types.ts: Journey, JourneyLeg) épít egy stabil,
// determinisztikus, UI-független navigációs utasítás-listát. Pure
// függvények, NINCS React/UI import, NINCS browser API (GPS, DOM, stb.).
//
// SZÁNDÉKOSAN NEM RÉSZE ennek a sprintnek:
//   - komplex turn-by-turn geometriai manőverdetektor (kanyar-számítás a
//     polyline-ból) — a Journey/Leg adatokból dolgozunk, nem a geometriából;
//   - kitalált/becsült adatmezők — ha egy JourneyLeg mező opcionális és
//     hiányzik, az adott RÉSZLETET (pl. "N megálló") egyszerűen elhagyjuk,
//     sosem becsüljük;
//   - leg-szintű progress/aktív-szakasz-detektálás heurisztikával — lásd
//     selectActiveInstruction() lentebbi kommentjét a pontos korlátozásról.

import type { Journey, JourneyLeg } from "@/lib/vedett-route/types";
import type { NavigationLegGeometryRange } from "@/lib/vedett-route/geometry";

export type NavigationInstructionKind =
  | "START"
  | "WALK"
  | "BOARD"
  | "RIDE"
  | "ALIGHT"
  | "TRANSFER"
  | "BIKE_PICKUP"
  | "BIKE_RIDE"
  | "BIKE_DROPOFF"
  | "ARRIVE";

export interface NavigationInstruction {
  id: string;
  kind: NavigationInstructionKind;
  title: string;
  detail?: string;
  legIndex: number;
  targetLat?: number;
  targetLon?: number;
}

// A buildNavigationInstructions() KIZÁRÓLAG a `legs` mezőt használja — a
// Journey egyéb mezői (totalDurationMinutes, departureTime, stb.) egyetlen
// instrukció szövegéhez sem szükségesek. A paramétert ezért a teljes
// Journey helyett a `legs`-re szűkített, strukturálisan kompatibilis
// típusra vettük fel: egy VALÓS Journey objektum közvetlenül átadható
// (structural typing), de a hívó (lásd VedettUtvonalSearchForm.tsx) ezt egy
// egyszerű `{ legs }` objektumként is hívhatja, ha csak a legs tömb áll
// rendelkezésre.
export type NavigationInstructionSource = Pick<Journey, "legs">;

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Csak akkor adjuk vissza a "N megálló" részletet, ha a MOTIS válasz
// TÉNYLEGESEN tartalmazott intermediateStops tömböt ÉS az legalább 1
// elemű — 0 hosszú tömb esetén (két szomszédos megálló) a "0 megálló"
// szöveg félrevezető lenne, inkább elhagyjuk (lásd a sprint specifikáció
// "inkább hagyd el, mint hogy becsüld" pontja).
function stopCountDetail(leg: JourneyLeg): string | undefined {
  const count = leg.intermediateStops?.length;
  if (!count || count < 1) return undefined;
  return `${count} megálló`;
}

function routeLabel(leg: JourneyLeg): string {
  return leg.routeShortName ?? leg.routeLongName ?? "járat";
}

// EGY leg -> 0-3 NavigationInstruction. `precededByTransit` jelzi, hogy a
// KÖZVETLENÜL megelőző, instrukciót adó leg is TRANSIT volt-e (WALK/RENTAL
// nélkül közéjük) — ez a KIZÁRÓLAG a leg-sorrendből (Journey.legs tömb
// indexei) levezetett, determinisztikus jel, amit a TRANSFER esemény
// előállítására használunk (lásd a modul fejlécét: nincs geometria-/
// időzítés-alapú találgatás, csak a meglévő mode-sorozat). `followedByTransit`
// ugyanez a KÖVETKEZŐ legre nézve — ha igaz, ennek a legnek az ALIGHT
// lépését elhagyjuk (a KÖVETKEZŐ leg TRANSFER instrukciója fedi ugyanazt a
// "szállj át" lépést, hogy egyszerre csak EGY fő teendő legyen, ne
// duplikálódjon "Szállj le" + "Szállj át").
function instructionsForLeg(leg: JourneyLeg, legIndex: number, precededByTransit: boolean, followedByTransit: boolean): NavigationInstruction[] {
  if (leg.mode === "WALK") {
    const title = isNonEmpty(leg.toName) ? `Gyalogolj: ${leg.toName}` : "Gyalogolj a következő pontig";
    return [
      {
        id: `walk-${legIndex}`,
        kind: "WALK",
        title,
        legIndex,
        targetLat: leg.toLat,
        targetLon: leg.toLon,
      },
    ];
  }

  if (leg.mode === "RENTAL") {
    // Kerékpár/Bubi-specifikus esemény KIZÁRÓLAG akkor, ha a leg mode-ja
    // maga RENTAL — a Journey/JourneyLeg típus dokumentált invariánsa
    // szerint (lib/vedett-route/types.ts JourneyLeg.mode kommentje) RENTAL
    // leg jelenleg KIZÁRÓLAG egy MOL Bubi-kontextusú keresésből származhat,
    // tehát ez a mode-jelzés önmagában megbízható forrás — nincs kitalálva.
    const pickupName = isNonEmpty(leg.fromName) ? leg.fromName : "az induló pontnál";
    const dropoffName = isNonEmpty(leg.toName) ? leg.toName : "a cél közelében";
    return [
      {
        id: `bike-pickup-${legIndex}`,
        kind: "BIKE_PICKUP",
        title: `Vedd ki a kerékpárt: ${pickupName}`,
        legIndex,
        targetLat: leg.fromLat,
        targetLon: leg.fromLon,
      },
      {
        id: `bike-ride-${legIndex}`,
        kind: "BIKE_RIDE",
        title: `Kerékpározz: ${dropoffName}`,
        legIndex,
        targetLat: leg.toLat,
        targetLon: leg.toLon,
      },
      {
        id: `bike-dropoff-${legIndex}`,
        kind: "BIKE_DROPOFF",
        title: `Tedd le a kerékpárt: ${dropoffName}`,
        legIndex,
        targetLat: leg.toLat,
        targetLon: leg.toLon,
      },
    ];
  }

  // TRANSIT
  const instructions: NavigationInstruction[] = [];
  const label = routeLabel(leg);

  if (precededByTransit) {
    instructions.push({
      id: `transfer-${legIndex}`,
      kind: "TRANSFER",
      title: "Szállj át a következő járatra",
      detail: `Következő járat: ${label}`,
      legIndex,
      targetLat: leg.fromLat,
      targetLon: leg.fromLon,
    });
  } else {
    instructions.push({
      id: `board-${legIndex}`,
      kind: "BOARD",
      title: `Szállj fel: ${label}`,
      detail: isNonEmpty(leg.fromName) ? leg.fromName : undefined,
      legIndex,
      targetLat: leg.fromLat,
      targetLon: leg.fromLon,
    });
  }

  instructions.push({
    id: `ride-${legIndex}`,
    kind: "RIDE",
    title: `Utazz a ${label} járattal`,
    detail: stopCountDetail(leg),
    legIndex,
    targetLat: leg.toLat,
    targetLon: leg.toLon,
  });

  if (!followedByTransit) {
    instructions.push({
      id: `alight-${legIndex}`,
      kind: "ALIGHT",
      title: isNonEmpty(leg.toName) ? `Szállj le: ${leg.toName}` : "Szállj le a következő megállónál",
      legIndex,
      targetLat: leg.toLat,
      targetLon: leg.toLon,
    });
  }

  return instructions;
}

// Journey/legs -> stabil, determinisztikus NavigationInstruction lista.
// Ugyanaz a legs tömb (tartalom szerint) MINDIG ugyanazt a listát adja —
// nincs Date.now()/Math.random()/browser API.
export function buildNavigationInstructions(journey: NavigationInstructionSource): NavigationInstruction[] {
  const legs = journey.legs ?? [];
  if (legs.length === 0) return [];

  const instructions: NavigationInstruction[] = [];

  const firstLeg = legs[0];
  instructions.push({
    id: "start",
    kind: "START",
    title: "Indulás",
    detail: isNonEmpty(firstLeg.fromName) ? firstLeg.fromName : undefined,
    legIndex: 0,
    targetLat: firstLeg.fromLat,
    targetLon: firstLeg.fromLon,
  });

  legs.forEach((leg, index) => {
    const precededByTransit = index > 0 && legs[index - 1].mode === "TRANSIT" && leg.mode === "TRANSIT";
    const followedByTransit = index < legs.length - 1 && legs[index + 1].mode === "TRANSIT" && leg.mode === "TRANSIT";
    instructions.push(...instructionsForLeg(leg, index, precededByTransit, followedByTransit));
  });

  const lastLeg = legs[legs.length - 1];
  instructions.push({
    id: "arrive",
    kind: "ARRIVE",
    title: "Megérkeztél",
    detail: isNonEmpty(lastLeg.toName) ? lastLeg.toName : undefined,
    legIndex: legs.length - 1,
    targetLat: lastLeg.toLat,
    targetLon: lastLeg.toLon,
  });

  return instructions;
}

export interface ActiveNavigationInstruction {
  current: NavigationInstruction | null;
  next: NavigationInstruction | null;
}

// ============================================================================
// NAVIGATION INSTRUCTIONS SPRINT 2 (2026-09-16) — matchedSegmentIndex ->
// legIndex -> instrukció.
//
// A Sprint 1 korlátozása (lásd korábbi verzió kommentje, alább megőrizve a
// git történetben) az volt, hogy lib/vedett-route/navigation/routeProgress.ts
// matchedSegmentIndex mezője egy ÖSSZEFŰZÖTT, összes leg-et egyetlen
// koordinátatömbbé lapító geometriára mutat, leg-határ-tudat nélkül. Ezt a
// hiányzó láncszemet a lib/vedett-route/geometry.ts
// journeyLegsToNavigationRoute() függvénye oldja fel: UGYANAZZAL a
// flatten/dedup logikával építi fel a koordinátatömböt, amit a
// routeProgress motor kap, ÉS emellett minden leghez egy
// NavigationLegGeometryRange-et ([startSegmentIndex, endSegmentIndex]) ad —
// tehát a matchedSegmentIndex innentől egyértelműen visszafejthető egy
// Journey leg indexére. Lásd ott a részletes dokumentációt a
// megosztott-határpont kezeléséről.
// ============================================================================

// Pure helper: matchedSegmentIndex + a leg-geometria tartományok -> az
// AKTUÁLISAN navigált Journey leg indexe, vagy null, ha nincs megbízható
// egyezés (nincs GPS-match, vagy a segment index semelyik leg tartományába
// nem esik — ez utóbbi KIZÁRÓLAG egy teljesen degenerált/0-hosszú leg
// esetén fordulhat elő, lásd journeyLegsToNavigationRoute() korlátozása).
export function resolveActiveLegIndex(
  matchedSegmentIndex: number | null,
  legRanges: readonly NavigationLegGeometryRange[]
): number | null {
  if (matchedSegmentIndex === null || !Number.isFinite(matchedSegmentIndex) || matchedSegmentIndex < 0) {
    return null;
  }
  for (const range of legRanges) {
    if (matchedSegmentIndex >= range.startSegmentIndex && matchedSegmentIndex <= range.endSegmentIndex) {
      return range.legIndex;
    }
  }
  return null;
}

// Pure helper: az aktuális leg-en BELÜLI, 0..1 közötti előrehaladás, TISZTÁN
// a szegmens-pozícióból (nincs idő-/sebesség-alapú becslés). Ha a leg
// tartománya degenerált (span <= 0 — lásd fent), 0-t ad vissza (konzervatív
// fallback: a leg ELSŐ saját instrukciója lesz az aktív, lásd
// selectActiveInstruction()).
export function resolveLegPhaseFraction(
  matchedSegmentIndex: number | null,
  range: NavigationLegGeometryRange | null | undefined
): number {
  if (matchedSegmentIndex === null || !range) return 0;
  const span = range.endSegmentIndex - range.startSegmentIndex + 1;
  if (span <= 0) return 0;
  const fraction = (matchedSegmentIndex - range.startSegmentIndex) / span;
  return Math.max(0, Math.min(1 - Number.EPSILON, fraction));
}

// Pure helper: "route-end állapot" — KIZÁRÓLAG akkor igaz, ha a
// matchedSegmentIndex a TELJES (összefűzött) route geometria UTOLSÓ
// szegmensén (vagy azon túl, védelemként) áll. Ez az EGYETLEN, geometria-
// alapú jelzés, ami az ARRIVE instrukciót aktívvá teheti — nincs idő-,
// sebesség- vagy távolság-küszöb, csak a tényleges geometriai végpont.
export function isAtRouteEnd(matchedSegmentIndex: number | null, totalCoordinateCount: number): boolean {
  if (matchedSegmentIndex === null || !Number.isFinite(matchedSegmentIndex)) return false;
  const lastSegmentIndex = totalCoordinateCount - 2;
  return lastSegmentIndex >= 0 && matchedSegmentIndex >= lastSegmentIndex;
}

export interface SelectActiveInstructionOptions {
  // Az AKTUÁLISAN navigált leg indexe — Sprint 2 óta ezt jellemzően
  // resolveActiveLegIndex() adja, matchedSegmentIndex + a leg-geometria
  // tartományok alapján. Ha hiányzik (null/undefined), a lista ELSŐ eleme
  // (START) marad az aktív — stabil, determinisztikus alapállapot arra az
  // esetre, amíg nincs még GPS-match (pl. navigáció indulásakor).
  legIndex?: number | null;
  // A legIndex-hez tartozó leg-en BELÜLI, 0..1 közötti fázis (lásd
  // resolveLegPhaseFraction()). Egy legnek 1-3 saját instrukciója lehet
  // (pl. WALK: 1; BOARD/RIDE/ALIGHT: 3) — ez a fraction egyenletesen
  // felosztja ezeket (pl. 3 instrukció esetén [0, 1/3) -> első, [1/3, 2/3)
  // -> második, [2/3, 1) -> harmadik). Hiányzó/undefined esetén a leg
  // ELSŐ saját instrukciója aktív (konzervatív fallback, lásd a modul
  // fejlécének "rövid leg" megjegyzését).
  legPhaseFraction?: number | null;
  // Igaz, ha isAtRouteEnd() szerint a matchedSegmentIndex a TELJES route
  // geometria utolsó szegmensén áll. Ez EGYETLEN kivétellel felülírja a
  // legIndex/legPhaseFraction alapú választást: az ARRIVE lesz az aktív
  // instrukció, FÜGGETLENÜL attól, melyik leghez tartozik geometriailag a
  // szegmens (az ARRIVE mindig a Journey egészének végét jelenti).
  atRouteEnd?: boolean;
}

// Pure helper: instructions + (opcionális) leg-index/fázis/route-end jelzés
// -> current/next pár.
//
// SORREND:
//   1. atRouteEnd -> ARRIVE (a Journey egészének vége, geometria-alapú,
//      lásd isAtRouteEnd());
//   2. megbízható legIndex + a leghez tartozó saját instrukció(k) közül a
//      legPhaseFraction alapján kiválasztott elem;
//   3. fallback: a lista ELSŐ eleme (START) — nincs még megbízható GPS-
//      alapú legIndex.
//
// A "next" MINDIG a teljes instrukció-listában a kiválasztott "current"
// UTÁN következő elem — ez garantálja, hogy current !== next, és hogy a
// "next" mindig a valóban rákövetkező teendő (pl. az utolsó leg ALIGHT-ja
// után a next természetesen ARRIVE).
export function selectActiveInstruction(
  instructions: readonly NavigationInstruction[],
  options: SelectActiveInstructionOptions = {}
): ActiveNavigationInstruction {
  if (instructions.length === 0) return { current: null, next: null };

  if (options.atRouteEnd) {
    const arriveIndex = instructions.findIndex((instruction) => instruction.kind === "ARRIVE");
    if (arriveIndex !== -1) {
      return { current: instructions[arriveIndex], next: instructions[arriveIndex + 1] ?? null };
    }
  }

  if (typeof options.legIndex === "number") {
    // Az adott leghez tartozó SAJÁT instrukciók, a START/ARRIVE
    // "pszeudo-elemek" nélkül (azok legIndex-e egybeeshet az első/utolsó
    // leg indexével, de NEM az adott leg fázisát jelentik).
    const legInstructions = instructions.filter(
      (instruction) => instruction.legIndex === options.legIndex && instruction.kind !== "START" && instruction.kind !== "ARRIVE"
    );
    if (legInstructions.length > 0) {
      const fraction = Math.max(0, Math.min(1 - Number.EPSILON, options.legPhaseFraction ?? 0));
      const phaseIndex = Math.min(legInstructions.length - 1, Math.floor(fraction * legInstructions.length));
      const current = legInstructions[phaseIndex];
      const currentGlobalIndex = instructions.indexOf(current);
      return { current, next: instructions[currentGlobalIndex + 1] ?? null };
    }
  }

  return { current: instructions[0], next: instructions[1] ?? null };
}
