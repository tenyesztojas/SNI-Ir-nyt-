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
// Relatív import + explicit .ts kiterjesztés — KÖVETI a szomszédos
// routeProgress.ts meglévő mintáját (lásd ott: `from "./geometry.ts"`),
// mert ez egy ÉRTÉK-import (nem `import type`), amit a node --test
// --experimental-strip-types közvetlenül futtat, tehát a "@/..." Next.js
// alias itt NEM oldódna fel — a type-only importok (lásd fent) ettől
// eltérően "@/..."-t használhatnak, mert azokat a strip-types teljesen
// eltávolítja futásidőben.
import { projectPointToRoute } from "./geometry.ts";
import type { NavigationCoordinate } from "./types.ts";

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
  // Onboard RIDE display (Sprint: headsign UI) — a route's short/long name
  // and its headsign (JourneyLeg.headsign, the vehicle's own destination
  // sign), carried from the SAME leg data routeLabel() already reads at
  // build time. Never invented, never geocoded — undefined when the
  // underlying JourneyLeg field is missing, exactly like routeLabel().
  routeName?: string;
  headsign?: string;
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
  const base = leg.routeShortName ?? leg.routeLongName ?? "járat";
  // TRANSIT NAVIGATION HOTFIX (2026-09-21, spec 3. pont) — ha a MOTIS
  // válasz adott headsignt (jármű célállomás-kijelzője, lásd types.ts
  // JourneyLeg.headsign kommentje), a járatszám mellé fűzzük ("S40 –
  // Dombóvár felé"), MINDEN transit módra generikusan (BUS/TRAM/SUBWAY/
  // RAIL/REGIONAL_RAIL) — nincs mód-specifikus ág. Hiányzó/üres headsign
  // esetén VÁLTOZATLANUL csak a route name/number marad (biztonságos
  // fallback, sosem kitalálva).
  return isNonEmpty(leg.headsign) ? `${base} – ${leg.headsign} felé` : base;
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
    routeName: isNonEmpty(leg.routeShortName) ? leg.routeShortName : (isNonEmpty(leg.routeLongName) ? leg.routeLongName : undefined),
    headsign: isNonEmpty(leg.headsign) ? leg.headsign : undefined,
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

// ============================================================================
// NAVIGATION INSTRUCTIONS SPRINT 3 (2026-09-16) — megállópozíció-alapú
// progress ("Utazz még N megállót" / "A következő megállónál szállj le"),
// a Sprint 2 geometriai harmadolás (BOARD/RIDE/ALIGHT fázis-fraction)
// FALLBACKJÁVAL, ha nincs elég megbízható stop-koordináta.
//
// SEMMILYEN adatmodell-bővítés nincs — kizárólag a MÁR MEGLÉVŐ
// JourneyLeg.intermediateStops ({ name, lat?, lon? }) mezőt használjuk, ÉS
// a MÁR MEGLÉVŐ projectPointToRoute() nearest-point matematikát (lásd
// lib/vedett-route/navigation/geometry.ts) — NEM új geometriai algoritmus.
// ============================================================================

// A megálló-projekció MEGBÍZHATATLAN, ha a legközelebbi pont a SAJÁT leg
// geometriájától ennél távolabb van. Konzervatív, provider-semleges
// (NEM BKK/MÁV/Volán-specifikus) küszöb, ugyanabban a nagyságrendben, mint
// a routeProgress.ts meglévő offRouteThresholdMeters default-ja (50 m) —
// dokumentált, tesztelt, NEM kalibrált egyetlen konkrét MOTIS válaszra.
export const STOP_PROJECTION_MAX_DISTANCE_METERS = 50;

export interface NavigationStopProgress {
  name: string;
  legIndex: number;
  lat: number;
  lon: number;
  // A megálló pozíciója a leg SAJÁT (lokális) koordinátalistáján —
  // NEM a globális, több lábból összefűzött route-on (lásd
  // lib/vedett-route/geometry.ts NavigationLegGeometryRange.legCoordinates
  // fejléce). 0-alapú: a leg saját i. és i+1. koordinátája közötti szakaszra
  // mutat.
  segmentIndex: number;
  distanceFromRouteMeters: number;
}

// Pure helper: EGY köztes megálló vetítése a leg SAJÁT geometriájára —
// SOSEM a teljes, összefűzött Journey-geometriára (egy adott utca/vonal
// máshol is előfordulhat a Journeyben, egy globális nearest-point emiatt
// rossz leget találhatna). Null, ha a megállónak nincs érvényes lat/lon-ja,
// a leg geometriája használhatatlan (<2 pont), vagy a projekció távolsága
// meghaladja STOP_PROJECTION_MAX_DISTANCE_METERS-t.
export function projectStopToLegGeometry(
  stop: { name: string; lat?: number; lon?: number },
  legIndex: number,
  legCoordinates: readonly NavigationCoordinate[]
): NavigationStopProgress | null {
  if (stop.lat === undefined || stop.lon === undefined || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) {
    return null;
  }
  if (legCoordinates.length < 2) return null;

  const projection = projectPointToRoute([stop.lon, stop.lat], legCoordinates);
  if (!projection) return null;
  if (projection.distanceFromRouteMeters > STOP_PROJECTION_MAX_DISTANCE_METERS) return null;

  return {
    name: stop.name,
    legIndex,
    lat: stop.lat,
    lon: stop.lon,
    segmentIndex: projection.segmentIndex,
    distanceFromRouteMeters: projection.distanceFromRouteMeters,
  };
}

export interface LegStopProgressResult {
  // A MEGBÍZHATÓAN vetített köztes megállók, EREDETI (utazási) sorrendben —
  // a sorrendet SOHA nem a geometria alapján rendezzük át (lásd modul
  // fejlécének 3. pontja); a geometria csak azt mondja meg, HOL van egy
  // megálló, nem azt, MELYIK sorrendben következnek.
  stops: NavigationStopProgress[];
  // Igaz, ha MINDEN köztes megálló megbízhatóan vetíthető volt ÉS a
  // vetített segmentIndex-sorozat monoton (nem csökkenő) az eredeti
  // sorrendben. Ha hamis, a `stops` mindig üres — a hívó a Sprint 2
  // geometry-phase fallbackra esik vissza (lásd
  // selectActiveInstructionWithStopProgress()).
  reliable: boolean;
}

// Pure helper: egy leg ÖSSZES köztes megállójának vetítése a leg SAJÁT
// geometriájára, EGYETLEN "megbízható" jelzővel a teljes legre. Szándékosan
// "mind vagy semmi": ha csak EGY megálló koordinátája is hiányzik/túl messze
// van, vagy a sorrend nem monoton, a TELJES leg stop-progressét
// megbízhatatlannak tekintjük — soha nem próbálunk részleges/kitalált
// "még N megálló" számot mutatni hiányos adatból.
export function buildLegStopProgress(
  intermediateStops: readonly { name: string; lat?: number; lon?: number }[] | undefined,
  legIndex: number,
  legCoordinates: readonly NavigationCoordinate[]
): LegStopProgressResult {
  const rawStops = intermediateStops ?? [];
  if (rawStops.length === 0) return { stops: [], reliable: false };

  const projected: NavigationStopProgress[] = [];
  for (const stop of rawStops) {
    const projection = projectStopToLegGeometry(stop, legIndex, legCoordinates);
    if (!projection) return { stops: [], reliable: false };
    projected.push(projection);
  }

  // Monotonitás-ellenőrzés (lásd modul fejlécének 3. pontja): az eredeti
  // sorrendnek szigorúan nem csökkenő segmentIndex-sorozatot kell adnia a
  // geometrián. Ha SÚLYOSAN nem monoton (bármely stop a sorban VISSZAFELÉ
  // esik az előzőhöz képest), a stop-progress adatot NEM tekintjük
  // megbízhatónak — SOSEM próbáljuk "megjavítani" átrendezéssel.
  for (let i = 1; i < projected.length; i += 1) {
    if (projected[i].segmentIndex < projected[i - 1].segmentIndex) {
      return { stops: [], reliable: false };
    }
  }

  return { stops: projected, reliable: true };
}

export interface RemainingStopsResult {
  // A LESZÁLLÁSIG hátralévő megállók száma, A LESZÁLLÓ MEGÁLLÓT IS
  // beleértve (az intermediateStops NEM tartalmazza a leszállóhelyet, csak
  // a from/to KÖZÖTTI köztes megállókat — lásd a modul fejlécének
  // szemantika-kommentje). Pl. 3 köztes megálló + 1 leszállóhely = induláskor
  // 4.
  remainingStopCount: number;
  // Igaz, ha az UTOLSÓ köztes megállót is egyértelműen elhagytuk — ekkor a
  // remainingStopCount mindig 1 lenne, de UI-ban SOSEM "Még 1 megálló"-t
  // jelenítünk meg, hanem "A következő megállónál szállj le"-t (lásd
  // selectActiveInstructionWithStopProgress()).
  atFinalStop: boolean;
}

// Pure helper: matchedSegmentIndex (GLOBÁLIS, a routeProgress motorból) +
// az aktív leg geometria-tartománya + a leg megbízhatóan vetített köztes
// megállói -> hátralévő megállók száma. Null, ha bármelyik bemenet
// invalid/hiányzó, VAGY ha a globális<->lokális segmentIndex-átszámítás
// belső ellentmondást mutat (lásd lent) — ez utóbbi egy ritka, de explicit
// védelem egy leg SAJÁT geometriáján belüli duplikált pont ellen, ami
// elcsúsztatná a globális/lokális szegmensszám-megfelelést.
export function resolveRemainingStops(
  matchedSegmentIndex: number | null,
  legRange: NavigationLegGeometryRange | null | undefined,
  legStops: readonly NavigationStopProgress[]
): RemainingStopsResult | null {
  if (matchedSegmentIndex === null || !Number.isFinite(matchedSegmentIndex) || matchedSegmentIndex < 0) return null;
  if (!legRange || legStops.length === 0) return null;
  if (matchedSegmentIndex < legRange.startSegmentIndex || matchedSegmentIndex > legRange.endSegmentIndex) return null;

  const legSegmentSpan = legRange.endSegmentIndex - legRange.startSegmentIndex + 1;
  // Belső konzisztencia-védelem: minden vetített megálló LOKÁLIS
  // segmentIndex-ének a leg saját tartományán belül kell lennie. Ha nem
  // (a leg globális range-je és a leg saját dekódolt geometriája
  // eltérő szegmensszámot ad — pl. egy leg saját polyline-ján belüli
  // ritka, duplikált-pont eset), az átszámítás NEM megbízható.
  if (legStops.some((stop) => stop.segmentIndex < 0 || stop.segmentIndex >= legSegmentSpan)) return null;

  const localMatchedSegmentIndex = matchedSegmentIndex - legRange.startSegmentIndex;

  // Egy megállót akkor tekintünk "elhagyottnak", ha a route progress
  // EGYÉRTELMŰEN, SZIGORÚAN túljutott a stop szegmensén — a HATÁRON
  // (localMatchedSegmentIndex === stop.segmentIndex) még NEM elhagyott.
  // Ez a stabil, determinisztikus küszöb védi ki a GPS-jitter okozta
  // oda-vissza váltakozást (3 -> 2 -> 3 -> 2), mert egyetlen szegmensen
  // belüli mozgás sosem változtatja meg az "elhagyott" állapotot.
  let passedCount = 0;
  for (const stop of legStops) {
    if (localMatchedSegmentIndex > stop.segmentIndex) passedCount += 1;
  }

  const remainingIntermediate = legStops.length - passedCount;
  return {
    remainingStopCount: remainingIntermediate + 1,
    atFinalStop: remainingIntermediate === 0,
  };
}

// Pure helper: a hátralévő-megálló eredmény -> megjelenítendő UI-szöveg.
// Rövid, konkrét, egyszerre EGY fő teendő (autizmusbarát UX, lásd a
// modul UI-oldali fejléceit VedettUtvonalSearchForm.tsx-ben) — SOHA nem
// "Még 1 megálló", helyette a konkrétabb "A következő megállónál szállj le".
// Pure helper: onboard RIDE display prefix, from the SAME route name /
// headsign already carried on the RIDE instruction (see instructionsForLeg())
// — never a new data source, never guessed. Undefined when neither piece of
// real data is available, so callers fall back to the plain stop-progress
// text unchanged (no regression when there is nothing to show).
function ridePrefix(routeName: string | undefined, headsign: string | undefined): string | undefined {
  if (routeName && headsign) return `${routeName} · ${headsign} felé`;
  if (routeName) return routeName;
  if (headsign) return `${headsign} felé`;
  return undefined;
}

export function resolveStopProgressDisplay(remaining: RemainingStopsResult): { title: string } {
  if (remaining.atFinalStop) {
    return { title: "A következő megállónál szállj le" };
  }
  return { title: `Utazz még ${remaining.remainingStopCount} megállót` };
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

// Pure helper (Sprint 3): selectActiveInstruction() + opcionális,
// megbízhatóan kiszámolt RemainingStopsResult -> current/next pár, ahol a
// RIDE instrukció szövege megállópozíció-alapú, HA a hívó megbízható
// hátralévő-megálló adatot ad át.
//
// SZÁNDÉKOSAN nem érinti a BOARD/TRANSFER/ALIGHT/ARRIVE/WALK/BIKE_*
// kimeneteket — lásd a sprint specifikáció 7/9. pontja: a BOARD a leg
// elején marad, a valódi "Szállj le: X" továbbra is KIZÁRÓLAG a meglévő
// (Sprint 2) fázis-/route-end logika szerint válik currenttá. Ha
// `remainingStops` hiányzik (a hívó nem tudott megbízható stop-progresst
// építeni — lásd buildLegStopProgress()/resolveRemainingStops()), ez a
// függvény BYTE-RA a Sprint 2 selectActiveInstruction() kimenetét adja
// vissza (fallback).
export function selectActiveInstructionWithStopProgress(
  instructions: readonly NavigationInstruction[],
  options: SelectActiveInstructionOptions & { remainingStops?: RemainingStopsResult | null; onboard?: boolean; nextStopName?: string; nearAlighting?: boolean; requireAlightingConfirmation?: boolean; alightingConfirmed?: boolean } = {}
): ActiveNavigationInstruction {
  let base = selectActiveInstruction(instructions, options);
  if (options.alightingConfirmed) {
    const arrive = instructions.find(i => i.kind === "ARRIVE");
    if (arrive) return { current: arrive, next: null };
  }
  // In a transit session, proximity is an invitation to confirm alighting.
  if (options.requireAlightingConfirmation && !options.onboard) {
    base = selectActiveInstruction(instructions, { ...options, atRouteEnd: false });
    if (base.current?.kind === "ALIGHT") {
      const ride = instructions.find(i => i.kind === "RIDE" && i.legIndex === options.legIndex);
      if (ride) base = { current: { ...ride, detail: undefined }, next: base.current };
    }
  }
  // Once boarded, geometry thirds cannot prove alighting or final arrival.
  // The boundary resolver remains responsible for advancing to the next leg.
  const finalDestinationReached = !options.requireAlightingConfirmation && options.atRouteEnd && options.nearAlighting &&
    !instructions.some(i => i.legIndex > (options.legIndex ?? -1));
  if (!finalDestinationReached && (options.onboard || (options.remainingStops && (options.legPhaseFraction ?? 0) >= 1 / 3))) {
    const rideIndex = instructions.findIndex(i => i.legIndex === options.legIndex && i.kind === "RIDE");
    if (rideIndex >= 0) base = { current: { ...instructions[rideIndex], detail: undefined }, next: instructions[rideIndex + 1] ?? null };
  }
  if (!base.current || base.current.kind !== "RIDE" || !options.remainingStops) {
    return base;
  }

  const display = resolveStopProgressDisplay(options.remainingStops);
  const stopText = options.nearAlighting ? "A leszállóhely közelében vagy. Készülj a leszállásra" : display.title;
  // Onboard RIDE title still leads with the concrete instruction (stop count
  // / alighting warning) — the route+headsign, when known, is prefixed in
  // front of it so BOTH stay visible ("S40 · Székesfehérvár felé · Utazz
  // még 2 megállót"), instead of the route label disappearing once onboard.
  const prefix = ridePrefix(base.current.routeName, base.current.headsign);
  return {
    current: {
      ...base.current,
      title: prefix ? `${prefix} · ${stopText}` : stopText,
      detail: options.nextStopName ? `Következő megálló: ${options.nextStopName}` : undefined,
    },
    next: base.next,
  };
}
