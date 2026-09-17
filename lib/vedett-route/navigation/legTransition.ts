// NAVIGATION — WALK→TRANSIT BOUNDARY RESOLVER (Sprint 7.1, 2026-09-16).
//
// ROOT CAUSE (lásd a sprint audit-riportját): a MEGLÉVŐ routeProgress.ts +
// instructions.ts resolveActiveLegIndex() KIZÁRÓLAG azt tudja megválaszolni,
// melyik szegmens van GPS-hez legközelebb a TELJES, összefűzött route-
// geometrián. Ez két, mobiltesztben megfigyelt hibát okoz:
//   (1) a WALK leg geometriai végpontja (MOTIS to-koordináta) nem
//       feltétlenül a fizikai bejárat, ezért a hátralévő táv a polyline
//       mentén számolva "felesleges" métereket mutathat, még ha a user
//       fizikailag a bejáratnál áll;
//   (2) a beszállás körül gyakran degradálódó/zajos GPS miatt a globális
//       legközelebbi-pont projekció a WALK szakaszon "ragadhat" azután is,
//       hogy a user tényleg felszállt — nincs második, független bizonyíték.
//
// EZ A MODUL NEM egy második navigation state machine — kizárólag a MÁR
// MEGLÉVŐ routeProgress/geometry primitíveket (haversineMeters,
// projectPointToRoute) használja, ÚJ bizonyítékforrás/becslés NÉLKÜL, és a
// MÁR kiszámolt geometriai activeLegIndex-et FINOMÍTJA, nem helyettesíti.
//
// TILOS mintázatok, amiket ez a modul EXPLICIT MÓDON NEM tesz (lásd sprint
// specifikáció "L" szekció):
//   - nincs globálisan megnövelt route-matching tolerance;
//   - nincs "departure time elmúlt -> felszállt" időalapú automatizmus;
//   - nincs provider-specifikus (BKK/MÁV) ág;
//   - nincs kitalált/becsült GPS-accuracy.
//
// A "felszállt" állapotot (BOARDED) KIZÁRÓLAG több, EGYIDEJŰLEG teljesülő,
// GPS-alapú bizonyíték adja, TÖBB egymást követő fix alatt (hiszterézis —
// ugyanaz az elv, mint routeProgress.ts offRouteConfirmFixes-e): (a) a GPS
// a KÖVETKEZŐ TRANSIT leg SAJÁT, lokális geometriájára jól illeszkedik
// (független projekció, NEM a globális matchedSegmentIndex), ÉS (b) a GPS a
// boarding ponthoz ésszerű közelségben van. Egyetlen zajos GPS-minta emiatt
// SOSEM válthat át (lásd sprint teszt-lista 5. pontja).
//
// SPRINT 7.1 BOARDED SAFETY REVIEW (2026-09-16, utókör) — AUDIT EREDMÉNY: a
// fenti két feltétel (proximity + geometry-fit) ÖNMAGÁBAN NEM bizonyítja a
// felszállást. Egy peronon/váróteremben ÁLLÓ, nem mozgó user is
// teljesítheti mindkettőt tetszőlegesen sok egymást követő fixen (a
// boarding pont ÉS a transit-vonal is a fizikai közelében van, HA a
// peron/váróterem a vonal mellett fekszik) — ez BIZONYÍTOTTAN false BOARDED
// transitiont okozott volna. JAVÍTÁS: a proximity+fit gate innentől
// KIZÁRÓLAG az AT_BOARDING_AREA besoroláshoz elég. A BOARDED váltáshoz EZEN
// FELÜL tényleges, mérhető ELŐREHALADÁS kell a TRANSIT leg SAJÁT
// geometriája MENTÉN — ugyanazt a projectPointToRoute().distanceAlongRouteMeters
// mezőt használva, amit a routeProgress.ts is (nincs új geometriai
// algoritmus), de egy KÜLÖN, ezen a modulon belüli küszöbbel
// (TRANSIT_PROGRESS_THRESHOLD_METERS), amit SOSEM keverünk a globális
// routeProgress.ts onRouteThresholdMeters/offRouteThresholdMeters
// értékeivel. Az előrehaladást a "fit-streak" (a mindkét feltételt
// egyidejűleg teljesítő, egymást követő fixek sorozata) ELSŐ és
// LEGUTÓBBI fixének distanceAlongRouteMeters-különbsége adja — ez
// TERMÉSZETESEN zajtűrő: egy helyben álló, jitterelő GPS a vonal mentén
// mindkét irányba ingadozik, a NETTÓ elmozdulás emiatt jitternél nem éri el
// a küszöböt, amíg a user valóban NEM mozog a jármű útvonala mentén. Az
// idő (departure time, realtime departure) továbbra sem bizonyíték —
// KIZÁRÓLAG a mért GPS-elmozdulás dönt.

import { haversineMeters, projectPointToRoute } from "./geometry.ts";
import { classifyTransitGeometryConfidence, isRailGuidedTransitMode } from "./transitGeometryConfidence.ts";
import type { NavigationCoordinate, NavigationPosition, OffRouteStatus } from "./types.ts";

/**
 * "Ésszerű közelség" a boarding ponthoz — SZÁNDÉKOSAN NEM 150 méter (lásd
 * a sprint tiltott-gyorsjavítások listája). Ez egy konzervatív, gyalogos
 * navigációhoz illő érték, ugyanabban a nagyságrendben, mint a
 * routeProgress.ts onRouteThresholdMeters (25 m) defaultja.
 */
export const BOARDING_PROXIMITY_METERS = 35;

/**
 * Hány egymást követő, EGYIDEJŰLEG megerősítő GPS-fix kell MINIMÁLISAN a
 * BOARDED váltáshoz — ÖNMAGÁBAN NEM elég (lásd TRANSIT_PROGRESS_THRESHOLD_METERS),
 * de egy 1-2 fixes, esetleg egyetlen GPS-glitch-ből álló sorozat ennél
 * kevesebb adatpontot adna a progress-számításhoz.
 */
export const BOARDING_CONFIRM_FIXES = 3;

/**
 * A BOARDED váltáshoz szükséges MINIMÁLIS, mért nettó előrehaladás a
 * KÖVETKEZŐ TRANSIT leg SAJÁT geometriája mentén (a fit-streak első és
 * legutóbbi fixének distanceAlongRouteMeters-különbsége). SZÁNDÉKOSAN
 * KÜLÖN érték a routeProgress.ts globális thresholdjaitól (onRouteThresholdMeters/
 * offRouteThresholdMeters/backwardToleranceMeters) — ez egy, a boarding-
 * határra szűkített, önálló zajtűrési küszöb, dokumentáltan a tipikus
 * konzumer-GPS jitter (kb. 5-10 m) fölött, hogy egy helyben álló user
 * jitterelő pozíciója SOSEM érje el véletlenül.
 */
export const TRANSIT_PROGRESS_THRESHOLD_METERS = 15;

export type WalkToTransitPhase =
  | "NOT_APPLICABLE" // az aktív leg (geometria szerint) nem WALK, vagy nincs elég adat
  | "WALKING" // normál WALK progress, nincs boarding a közelben
  | "APPROACHING_BOARDING" // közeledik a boarding ponthoz
  | "AT_BOARDING_AREA" // ésszerű közelségben a boarding ponthoz — ne kérjen több gyaloglást
  | "BOARDED" // több, konzisztens GPS-bizonyíték szerint már a TRANSIT szakaszon van
  // SAFETY SPRINT (2026-09-17) — sínhez/vezetett pályához kötött (RAIL/
  // REGIONAL_RAIL/SUBWAY/TRAM) legnél, HA a leg SAJÁT geometriája
  // bizonyítottan "weak" (lásd transitGeometryConfidence.ts, pl. a
  // VPS-proven S40 2-pontos eset), a szigorú BOARDED progress-mérés
  // strukturálisan nem tud pozitív döntést hozni, mert a GPS a
  // leegyszerűsített vonalra sosem fog jól illeszkedni. Ez az állapot NEM
  // állítja biztosra a felszállást és NEM talál ki jármű-azonosítót — csak
  // annyit jelez, hogy a "Szállj fel" instrukció innentől félrevezető
  // lenne, és hogy a geometria-eltérés itt NEM lehet auto-reroute alapja
  // (lásd rerouteGuard.ts transitGeometryUncertain bemenete).
  | "BOARDED_UNCERTAIN_GEOMETRY";

export interface WalkToTransitNextTransitLeg {
  legIndex: number;
  /** A boarding pont koordinátája (a TRANSIT leg from-koordinátája), HA elérhető. */
  boardingCoordinate: NavigationCoordinate | null;
  /** A TRANSIT leg SAJÁT, lokális geometriája (NEM a globális, összefűzött route). */
  legCoordinates: readonly NavigationCoordinate[] | null;
  /** A leg NORMALIZÁLT transitMode-ja (JourneyLeg.transitMode — lásd orchestrator.ts mapLeg()), HA TRANSIT. */
  transitMode?: string;
}

export interface WalkToTransitBoundaryInput {
  /** A MEGLÉVŐ, geometria-alapú (routeProgress + resolveActiveLegIndex) aktuális leg index. */
  geometryActiveLegIndex: number | null;
  geometryActiveLegMode: "WALK" | "TRANSIT" | "RENTAL" | null;
  /** A geometriailag aktív WALK leg UTÁN következő TRANSIT leg, HA van. */
  nextTransitLeg: WalkToTransitNextTransitLeg | null;
  /** Az aktuális GPS pozíció, opcionális accuracy-vel (GeolocationPosition.coords.accuracy). */
  position: (Pick<NavigationPosition, "latitude" | "longitude"> & { accuracyMeters?: number | null }) | null;
  /** A route-progress motor jelenlegi off-route állapota. */
  offRouteStatus: OffRouteStatus;
  /** Az előző tick eredménye — null-t adj át route/aktív-navigáció váltáskor (ugyanaz a reset-pont, mint routeProgress-nél). */
  previous: WalkToTransitBoundaryState | null;
}

export interface WalkToTransitBoundaryState {
  phase: WalkToTransitPhase;
  /** A VÉGSŐ, a kártya/instrukciók által használandó leg index (a geometriai érték FINOMÍTVA). */
  resolvedLegIndex: number | null;
  boardingDistanceMeters: number | null;
  /** Az aktuális "fit-streak" (proximity+geometry-fit egyidejűleg teljesül) hossza. */
  consecutiveTransitFitFixes: number;
  /** A fit-streak ELSŐ fixének distanceAlongRouteMeters-e a transit leg SAJÁT geometriáján — az előrehaladás mérésének viszonyítási pontja. */
  transitFitStreakStartProgressMeters: number | null;
  /** A LEGUTÓBBI fix nettó előrehaladása a streak kezdete óta (diagnosztikai/teszt célra is). */
  transitProgressMeters: number | null;
  /**
   * SAFETY SPRINT (2026-09-17) — hány egymást követő fixen áll fenn a
   * "gyenge, sínhez kötött geometria + a boarding ponttól távolodás"
   * bizonyíték (lásd BOARDED_UNCERTAIN_GEOMETRY). Kizárólag ennek az
   * állapotnak a hiszterézisét szolgálja; a szigorú, jó-geometriájú BOARDED
   * logikát NEM érinti.
   */
  departureEvidenceFixes: number;
}

export function createInitialWalkToTransitBoundaryState(): WalkToTransitBoundaryState {
  return {
    phase: "NOT_APPLICABLE",
    resolvedLegIndex: null,
    boardingDistanceMeters: null,
    consecutiveTransitFitFixes: 0,
    transitFitStreakStartProgressMeters: null,
    transitProgressMeters: null,
    departureEvidenceFixes: 0,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// GPS-bizonytalanság-tudatos, de SOSEM kitalált pontosságú küszöb: rossz
// (nagy) accuracy esetén a "boarding area" besorolás megengedőbb (a user
// tényleges pozíciója az accuracy-sugáron belül bárhol lehet), de a
// BOARDED váltáshoz szükséges TRANSIT-geometria-illeszkedés küszöbét ez NEM
// tágítja — az egy FÜGGETLEN, szigorú ellenőrzés (lásd lent). A tágítás
// felülről korlátos, hogy ne "oldódjon fel" teljesen egy extrém rossz fix
// esetén.
function boardingProximityFor(accuracyMeters: number | null | undefined): number {
  if (!isFiniteNumber(accuracyMeters) || accuracyMeters <= 0) return BOARDING_PROXIMITY_METERS;
  return BOARDING_PROXIMITY_METERS + Math.min(40, accuracyMeters);
}

// A TRANSIT-illeszkedés ellenőrzésének szigorú küszöbe — SZÁNDÉKOSAN nem
// accuracy-vel tágított: ez annak a bizonyítéka, hogy a GPS TÉNYLEGESEN a
// jármű útvonala mentén van, nem csak "valahol a boarding pont közelében".
const TRANSIT_FIT_THRESHOLD_METERS = 25;

export function resolveWalkToTransitBoundary(input: WalkToTransitBoundaryInput): WalkToTransitBoundaryState {
  const { geometryActiveLegIndex, geometryActiveLegMode, nextTransitLeg, position, previous } = input;

  // Ha a geometria már MAGA TRANSIT/RENTAL-t jelez, nincs mit finomítani —
  // ez a modul KIZÁRÓLAG a WALK→TRANSIT határt élesíti, nem nyúl a többi
  // esethez (Sprint 5 WALK turn-by-turn, Bubi logika érintetlen).
  if (geometryActiveLegMode !== "WALK") {
    return {
      phase: "NOT_APPLICABLE",
      resolvedLegIndex: geometryActiveLegIndex,
      boardingDistanceMeters: null,
      consecutiveTransitFitFixes: 0,
      transitFitStreakStartProgressMeters: null,
      transitProgressMeters: null,
      departureEvidenceFixes: 0,
    };
  }

  if (!nextTransitLeg || !position || !isFiniteNumber(position.latitude) || !isFiniteNumber(position.longitude)) {
    return {
      phase: "WALKING",
      resolvedLegIndex: geometryActiveLegIndex,
      boardingDistanceMeters: null,
      consecutiveTransitFitFixes: 0,
      transitFitStreakStartProgressMeters: null,
      transitProgressMeters: null,
      departureEvidenceFixes: 0,
    };
  }

  const gpsCoordinate: NavigationCoordinate = [position.longitude, position.latitude];
  const proximity = boardingProximityFor(position.accuracyMeters);

  const boardingDistanceMeters = nextTransitLeg.boardingCoordinate
    ? haversineMeters(gpsCoordinate, nextTransitLeg.boardingCoordinate)
    : null;

  // FÜGGETLEN projekció a KÖVETKEZŐ TRANSIT leg SAJÁT geometriájára — NEM a
  // globális matchedSegmentIndex, ami a probléma forrása volt (lásd modul
  // fejléce). Ez a második, egymástól független bizonyíték — ÉS emellett a
  // BOARDED SAFETY REVIEW óta a distanceAlongRouteMeters mezőt is felhasználjuk
  // a tényleges előrehaladás méréséhez (lásd lent).
  const transitProjection =
    nextTransitLeg.legCoordinates && nextTransitLeg.legCoordinates.length >= 2
      ? projectPointToRoute(gpsCoordinate, nextTransitLeg.legCoordinates)
      : null;
  const transitFitDistanceMeters = transitProjection?.distanceFromRouteMeters ?? null;
  const transitAlongMeters = transitProjection?.distanceAlongRouteMeters ?? null;

  const nearBoarding = boardingDistanceMeters !== null && boardingDistanceMeters <= proximity;
  const fitsTransitGeometry = transitFitDistanceMeters !== null && transitFitDistanceMeters <= TRANSIT_FIT_THRESHOLD_METERS;
  // AUDIT (BOARDED SAFETY REVIEW): ez a gate ÖNMAGÁBAN csak azt bizonyítja,
  // hogy a user a boarding pont ÉS a transit-vonal közelében VAN — nem azt,
  // hogy MOZOG rajta. Ezért innentől KIZÁRÓLAG az AT_BOARDING_AREA
  // besoroláshoz elég (lásd lent) — a BOARDED-hez emellett tényleges
  // előrehaladás is kell.
  const fitsBoth = nearBoarding && fitsTransitGeometry;

  // Hiszterézis + ELŐREHALADÁS-MÉRÉS: a streak addig tart, amíg a fitsBoth
  // gate egymást követő fixeken folyamatosan teljesül. A streak ELSŐ
  // fixének distanceAlongRouteMeters-e a viszonyítási pont — a NETTÓ
  // előrehaladást ehhez képest mérjük, SOSEM egyetlen fix-pár deltájából
  // (ami egy GPS-glitch esetén hamis lehetne). Egy helyben álló, jitterelő
  // GPS esetén ez a nettó érték a jitter nagyságrendjében marad, SOSEM éri
  // el TRANSIT_PROGRESS_THRESHOLD_METERS-t, amíg a user valóban nem mozog.
  const previousFixes = previous?.consecutiveTransitFitFixes ?? 0;
  const previousStreakStart = previous?.transitFitStreakStartProgressMeters ?? null;

  let consecutiveTransitFitFixes = 0;
  let transitFitStreakStartProgressMeters: number | null = null;
  let transitProgressMeters: number | null = null;

  if (fitsBoth && transitAlongMeters !== null) {
    consecutiveTransitFitFixes = previousFixes + 1;
    transitFitStreakStartProgressMeters = previousStreakStart !== null ? previousStreakStart : transitAlongMeters;
    transitProgressMeters = transitAlongMeters - transitFitStreakStartProgressMeters;
  }

  const hasSufficientFixes = consecutiveTransitFitFixes >= BOARDING_CONFIRM_FIXES;
  const hasSufficientProgress = transitProgressMeters !== null && transitProgressMeters >= TRANSIT_PROGRESS_THRESHOLD_METERS;

  if (hasSufficientFixes && hasSufficientProgress) {
    return {
      phase: "BOARDED",
      resolvedLegIndex: nextTransitLeg.legIndex,
      boardingDistanceMeters,
      consecutiveTransitFitFixes,
      transitFitStreakStartProgressMeters,
      transitProgressMeters,
      departureEvidenceFixes: previous?.departureEvidenceFixes ?? 0,
    };
  }

  // Boarded (VAGY a lenti, gyenge-geometriás BOARDED_UNCERTAIN_GEOMETRY)
  // állapotból nem "esünk vissza" WALK-ra egyetlen, a fenti feltételnek meg
  // nem felelő fix miatt, HA az előző tick már ilyen volt — a korábbi legre
  // visszaugrás elkerülése (sprint teszt-lista 14. pontja, és a SAFETY
  // SPRINT 5. tesztje: "gyenge sínes geometria nem ragadhat örökre Szállj
  // fel-en, DE miután kilépett belőle, ne is oszcilláljon vissza"). A
  // visszaváltás KIZÁRÓLAG akkor történhet meg, ha a MEGLÉVŐ routeProgress
  // maga (a globális geometria) egy MÁSIK, nem-WALK legre vált — az emiatt
  // hívja ezt a resolvert `geometryActiveLegMode !== "WALK"` ággal, ami
  // fentebb már lezárva van.
  if (previous?.phase === "BOARDED" || previous?.phase === "BOARDED_UNCERTAIN_GEOMETRY") {
    return {
      phase: previous.phase,
      resolvedLegIndex: nextTransitLeg.legIndex,
      boardingDistanceMeters,
      consecutiveTransitFitFixes: previousFixes,
      transitFitStreakStartProgressMeters: previousStreakStart,
      transitProgressMeters: previous?.transitProgressMeters ?? null,
      departureEvidenceFixes: previous?.departureEvidenceFixes ?? 0,
    };
  }

  // SAFETY SPRINT (2026-09-17) — WEAK/RAIL-GUIDED GEOMETRIA FALLBACK. A
  // fenti szigorú BOARDED feltétel (proximity+fit+mért progress a TRANSIT
  // leg SAJÁT geometriája mentén) VÁLTOZATLAN — ez az ág csak akkor fut,
  // ha az MÁR nem teljesült. VPS-proven S40 eset: sínhez kötött
  // (REGIONAL_RAIL) legnél a legCoordinates gyakorlatilag egy 2-pontos
  // egyenes (lásd transitGeometryConfidence.ts) — ezen a "vonalon" a GPS
  // strukturálisan sosem fog jól illeszkedni (fitsTransitGeometry hamis
  // maradhat, miközben a user ténylegesen a vonaton ül és halad), ezért a
  // szigorú progress-mérés itt sosem tud pozitív BOARDED döntést hozni. Mivel
  // a repo nem ad elegendő adatot egy BIZTONSÁGOS, pozitív BOARDED
  // állapotra ebben az esetben, egy ÚJ, bizonytalan átmeneti állapotot
  // (BOARDED_UNCERTAIN_GEOMETRY) vezetünk be — SOSEM állítjuk biztosra a
  // felszállást, és NEM találunk ki jármű-azonosítót. Az egyetlen
  // felhasznált bizonyíték: a user korábban a boarding pont ésszerű
  // közelségében volt (AT_BOARDING_AREA/APPROACHING_BOARDING vagy már ez az
  // állapot), ÉS azóta több egymást követő fixen TÉNYLEGESEN távolodik a
  // boarding ponttól — ez a legjobb elérhető, tisztán GPS-alapú jel arra,
  // hogy elindult a járművel, idő (menetrend/realtime) NÉLKÜL.
  const nextLegIsRailGuided = isRailGuidedTransitMode(nextTransitLeg.transitMode);
  const nextLegGeometryConfidence = classifyTransitGeometryConfidence(nextTransitLeg.legCoordinates);
  const weakRailGeometry = nextLegIsRailGuided && nextLegGeometryConfidence === "WEAK";

  // A KEZDŐ jel (első "távolodó" fix) KIZÁRÓLAG akkor számít, ha az előző
  // tick a boarding pont ésszerű közelségében volt (AT_BOARDING_AREA/
  // APPROACHING_BOARDING) — ez zárja ki, hogy egy sosem-boarding-közeli
  // WALK szakasz véletlenül evidence-t gyűjtsön. Miután a streak
  // elindult (previous.departureEvidenceFixes > 0), a TOVÁBBI távolodó
  // fixek AKKOR IS beleszámítanak, ha eközben a boardingDistanceMeters már
  // túlnőtt a 3x proximity küszöbön és a lenti ágak WALKING-ra váltanak —
  // különben egy gyorsan távolodó (valóban induló) vonat pár fixen belül
  // "kiesne" a számlálásból, mielőtt a 3 megerősítő fix összegyűlne.
  const wasNearBoardingBefore =
    previous?.phase === "AT_BOARDING_AREA" ||
    previous?.phase === "APPROACHING_BOARDING" ||
    (previous?.departureEvidenceFixes ?? 0) > 0;
  const previousBoardingDistanceMeters = previous?.boardingDistanceMeters ?? null;
  const movingAwayFromBoarding =
    boardingDistanceMeters !== null &&
    previousBoardingDistanceMeters !== null &&
    boardingDistanceMeters > previousBoardingDistanceMeters;

  const previousDepartureEvidenceFixes = previous?.departureEvidenceFixes ?? 0;
  const departureEvidenceFixes =
    weakRailGeometry && wasNearBoardingBefore && movingAwayFromBoarding ? previousDepartureEvidenceFixes + 1 : 0;

  if (weakRailGeometry && departureEvidenceFixes >= BOARDING_CONFIRM_FIXES) {
    return {
      phase: "BOARDED_UNCERTAIN_GEOMETRY",
      resolvedLegIndex: nextTransitLeg.legIndex,
      boardingDistanceMeters,
      consecutiveTransitFitFixes,
      transitFitStreakStartProgressMeters,
      transitProgressMeters,
      departureEvidenceFixes,
    };
  }

  // AT_BOARDING_AREA — ide elég a puszta proximity+geometry-fit (lásd az
  // audit-kommentet fent): ez a fázis SOSEM állítja, hogy a user felszállt,
  // csak azt, hogy a boarding pont közelében van — ez UX-ben biztonságos
  // (lásd sprint 7.1 Section C).
  if (nearBoarding) {
    return {
      phase: "AT_BOARDING_AREA",
      resolvedLegIndex: geometryActiveLegIndex,
      boardingDistanceMeters,
      consecutiveTransitFitFixes,
      transitFitStreakStartProgressMeters,
      transitProgressMeters,
      departureEvidenceFixes,
    };
  }

  if (boardingDistanceMeters !== null && boardingDistanceMeters <= proximity * 3) {
    return {
      phase: "APPROACHING_BOARDING",
      resolvedLegIndex: geometryActiveLegIndex,
      boardingDistanceMeters,
      consecutiveTransitFitFixes,
      transitFitStreakStartProgressMeters,
      transitProgressMeters,
      departureEvidenceFixes,
    };
  }

  return {
    phase: "WALKING",
    resolvedLegIndex: geometryActiveLegIndex,
    boardingDistanceMeters,
    consecutiveTransitFitFixes,
    transitFitStreakStartProgressMeters,
    transitProgressMeters,
    departureEvidenceFixes,
  };
}
