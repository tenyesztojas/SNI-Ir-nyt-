// NAVIGATION — LIVE NAVIGATION STATE SYNCHRONIZATION SPRINT (2026-09-22).
//
// Célzott regresszió-tesztek a mobiltesztben megfigyelt 6 hibára (lásd a
// sprint-jegyzetet). A pure lib/vedett-route/** modulokat közvetlen
// függvényhívással teszteli (node --test), a React/UI-kötött vezetéket
// (VedettUtvonalSearchForm.tsx/VedettUtvonalMap.tsx) forráskód-kontraktus
// regex-ekkel, ugyanazt a mintát követve, mint pl.
// map-rendering-fix.test.ts / navigation-leg-transition.test.ts.
//
//   node --test --experimental-strip-types __tests__/vedett-route/navigation-sync-sprint-2026-09-22.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveWalkToTransitBoundary,
  type WalkToTransitBoundaryInput,
  type WalkToTransitBoundaryState,
} from "../../lib/vedett-route/navigation/legTransition.ts";
import {
  buildNavigationInstructions,
  buildLegStopProgress,
  resolveRemainingStops,
  selectActiveInstructionWithStopProgress,
} from "../../lib/vedett-route/navigation/instructions.ts";
import { journeyLegsToNavigationRoute, encodePolyline } from "../../lib/vedett-route/geometry.ts";
import { mergeRealtimeUpdates } from "../../lib/vedett-route/realtimeRefresh/mergeRealtimeUpdates.ts";
import { resolveNavigationTransferTiming } from "../../lib/vedett-route/navigation/transferTiming.ts";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";

const searchFormPath = join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const searchFormSrc = readFileSync(searchFormPath, "utf8");
const mapFilePath = join(process.cwd(), "components/vedett-utvonal/VedettUtvonalMap.tsx");
const mapSrc = readFileSync(mapFilePath, "utf8");

// ---------------------------------------------------------------------------
// Közös fixture: Kossuth Lajos tér (WALK) -> M2 (Batthyány tér -> Kossuth
// Lajos tér -> Széll Kálmán tér -> Déli pályaudvar, 2 köztes megálló) ->
// (nincs további leg). A koordináták valós arányban vannak (kb. 111 m /
// 0.001 fok), a lényeg a sorrend és a monotonitás.
// ---------------------------------------------------------------------------
function buildM2Journey(): Journey {
  const walkLeg: JourneyLeg = {
    mode: "WALK",
    fromName: "Jelenlegi helyzetem",
    toName: "Batthyány tér M",
    fromLat: 47.5010,
    fromLon: 19.0390,
    toLat: 47.5010,
    toLon: 19.0400,
    realtime: false,
  } as JourneyLeg;

  const transitLeg: JourneyLeg = {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    tripId: "m2_trip_1",
    routeId: "m2",
    routeShortName: "M2",
    fromName: "Batthyány tér M",
    toName: "Déli pályaudvar M",
    fromLat: 47.5010,
    fromLon: 19.0400,
    toLat: 47.4990,
    toLon: 19.0130,
    departureTime: "2026-09-22T14:03:00+02:00",
    scheduledDepartureTime: "2026-09-22T14:03:00+02:00",
    arrivalTime: "2026-09-22T14:08:00+02:00",
    scheduledArrivalTime: "2026-09-22T14:08:00+02:00",
    realtime: true,
    delayMinutes: 0,
    // Explicit, TÖBB-PONTOS geometria (encodePolyline() a MEGLÉVŐ,
    // decodePolyline()-nal szimmetrikus helperből — lásd geometry.ts) —
    // SZÁNDÉKOSAN nem a puszta 2-pontos from->to fallback, mert egy
    // 2-pontos ("WEAK") geometrián a Kossuth/Széll megállók UGYANARRA az
    // egyetlen szegmensre projektálódnának, ami elfedné a resolveRemainingStops()
    // szegmens-alapú "elhagyva/nem elhagyva" megkülönböztetését. Ez a
    // geometria a valós Batthyány -> Kossuth -> (köztes pont) -> Széll ->
    // Déli sorrendet követi.
    geometryEncoded: encodePolyline([
      [19.0400, 47.5010], // Batthyány tér (from)
      [19.0310, 47.500333], // Kossuth Lajos tér
      [19.0265, 47.5], // köztes geometriai pont (nem megálló)
      [19.0220, 47.499667], // Széll Kálmán tér
      [19.0130, 47.4990], // Déli pályaudvar (to)
    ]),
    intermediateStops: [
      { name: "Kossuth Lajos tér M", lat: 47.500333, lon: 19.031 },
      { name: "Széll Kálmán tér M", lat: 47.499667, lon: 19.022 },
    ],
  } as JourneyLeg;

  return {
    legs: [walkLeg, transitLeg],
    totalDurationMinutes: 15,
    departureTime: "2026-09-22T13:55:00+02:00",
    arrivalTime: "2026-09-22T14:08:00+02:00",
  } as Journey;
}

// ---------------------------------------------------------------------------
// (A) Egy BOARDED/BOARDED_UNCERTAIN_GEOMETRY legen a BOARD ("Szállj fel")
// instrukció NEM jelenhet meg újra — a RIDE instrukció aktív, legIndex a
// TRANSIT legre mutat.
// ---------------------------------------------------------------------------
describe("(A) BOARDED leg nem mutatja újra a BOARD (Szállj fel) instrukciót", () => {
  test("boundary resolver BOARDED állapota után az aktív instrukció RIDE, nem BOARD", () => {
    const journey = buildM2Journey();
    const instructions = buildNavigationInstructions({ legs: journey.legs });
    const boardInstruction = instructions.find((i) => i.kind === "BOARD" && i.legIndex === 1);
    const rideInstruction = instructions.find((i) => i.kind === "RIDE" && i.legIndex === 1);
    assert.ok(boardInstruction, "van BOARD instrukció a listában (a leírás/UI-hoz)");
    assert.ok(rideInstruction, "van RIDE instrukció a listában");

    // A caller (VedettUtvonalSearchForm.tsx) BOARDED/BOARDED_UNCERTAIN_
    // GEOMETRY fázisban legalább 0.5 fraction-t ad át (lásd "Math.max(0.5, ...)"),
    // ami garantáltan a RIDE sub-instrukciót választja ki egy 3-részes
    // (BOARD/RIDE/ALIGHT) leg-en.
    const active = selectActiveInstructionWithStopProgress(instructions, {
      legIndex: 1,
      legPhaseFraction: 0.5,
      atRouteEnd: false,
      remainingStops: null,
    });
    assert.equal(active.current?.kind, "RIDE");
    assert.notEqual(active.current?.kind, "BOARD");
  });
});

// ---------------------------------------------------------------------------
// (B) Hátralévő megállók száma a TÉNYLEGES progress alapján csökken
// (Kossuth -> Batthyány -> Széll -> Déli, 2 -> 1 eset), ÉS befagyott
// (matchedSegmentIndex nem halad, mert a GPS a felszállás óta elveszett)
// esetben a hívó NEM mutat hamisan-pontos, stale számot.
// ---------------------------------------------------------------------------
describe("(B) Hátralévő megállók száma progress-alapú, és GPS-kiesés alatt nem hamisan-pontos", () => {
  const journey = buildM2Journey();
  const nav = journeyLegsToNavigationRoute(journey.legs as unknown as Parameters<typeof journeyLegsToNavigationRoute>[0]);
  const transitRange = nav.legRanges.find((r) => r.legIndex === 1)!;
  const stopProgress = buildLegStopProgress(journey.legs[1].intermediateStops, transitRange.legIndex, transitRange.legCoordinates);

  test("a stop-progress megbízhatóan épül fel a 2 köztes megállóból", () => {
    assert.equal(stopProgress.reliable, true);
    assert.equal(stopProgress.stops.length, 2);
  });

  test("Kossuth Lajos tér elhagyasa utan 'Utazz meg 2 megallot' (Szell + Deli van hatra), Szell Kalman ter elhagyasa utan 'Utazz meg 1 megallot' (csak Deli, a mobilteszt 4. hibajanak pontos forgatokonyve: 2 -> 1)", () => {
    // A modul dokumentalt szemantikaja (lasd instructions.ts fejleceben):
    // remainingStopCount = a MEG NEM elhagyott kozetes megallok szama + 1
    // (a leszallohely). "Elhagyottnak" egy megallo KIZAROLAG akkor szamit,
    // ha a matchedSegmentIndex SZIGORUAN tuljutott a segmentIndex-en.
    const kossuthStopSegment = stopProgress.stops[0].segmentIndex;
    const szellStopSegment = stopProgress.stops[1].segmentIndex;

    // Meg Kossuth ELOTT/HATARAN: egyik kozetes megallo sem elhagyott.
    const beforeKossuth = resolveRemainingStops(
      transitRange.startSegmentIndex + kossuthStopSegment,
      transitRange,
      stopProgress.stops
    );
    assert.ok(beforeKossuth);
    assert.equal(beforeKossuth!.remainingStopCount, 3); // Kossuth + Szell + Deli

    // Kossuth UTAN, Szell ELOTT: Kossuth elhagyva, Szell meg nem -- EZ a
    // mobilteszten megfigyelt "Utazz meg 2 megallot" pillanata.
    const afterKossuthBeforeSzell = resolveRemainingStops(
      transitRange.startSegmentIndex + Math.min(kossuthStopSegment + 1, szellStopSegment),
      transitRange,
      stopProgress.stops
    );
    assert.ok(afterKossuthBeforeSzell);
    assert.equal(afterKossuthBeforeSzell!.remainingStopCount, 2);

    // Szell UTAN: MINDKET kozetes megallo elhagyva -> csak Deli van hatra --
    // a helyes szam 1 (a hiba az volt, hogy a UI ekkor is meg "2"-t
    // mutatott, mert a matchedSegmentIndex a GPS-kiesess miatt befagyott a
    // Kossuth utani pozicion -- lasd a lenti "GPS-kiesess" tesztet).
    const afterSzell = resolveRemainingStops(
      transitRange.startSegmentIndex + szellStopSegment + 1,
      transitRange,
      stopProgress.stops
    );
    assert.ok(afterSzell);
    assert.equal(afterSzell!.remainingStopCount, 1);
    assert.equal(afterSzell!.atFinalStop, true);
  });


  test("VedettUtvonalSearchForm.tsx: BOARDED fázisban, ha nincs élő GPS-pozíció, a hátralévő-megálló szám elnyomódik (nincs hamisan-pontos, befagyott szám)", () => {
    assert.match(
      searchFormSrc,
      /activeLegStopProgress\.reliable[^\n]*&&\s*!\(isBoardedPhase\s*&&\s*boundaryPosition\s*===\s*null\)/,
      "az activeRemainingStops derivációnak explicit el kell nyomnia a számot BOARDED + null boundaryPosition esetén"
    );
  });

  test("EGYETLEN megosztott helper számolja a hátralévő megállókat — a komponens nem duplikálja a logikát", () => {
    // Csak a TÉNYLEGES (nem komment-szövegben szereplő) hívásokat számoljuk
    // — egy komment "resolveRemainingStops() bármely okból..." szövege is
    // tartalmazza a "resolveRemainingStops(" karaktersorozatot.
    const actualCallSites = searchFormSrc
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => /resolveTransitProgress\(/.test(line));
    assert.equal(actualCallSites.length, 1, "resolveTransitProgress()-t a komponens pontosan egyszer hívja (nem duplikálja a logikát)");
    assert.doesNotMatch(
      searchFormSrc,
      /remainingStopCount\s*[:=]/,
      "a komponens nem épít saját, párhuzamos 'remainingStopCount' mezőt"
    );
  });
});

// ---------------------------------------------------------------------------
// (C) GPS-kiesés a boarding pont közelében (AT_BOARDING_AREA/APPROACHING_
// BOARDING), MIELŐTT a 3-fixes BOARDED-megerősítés lezajlana — a state NEM
// esik vissza zeroed WALKING-ra, és később, ha a GPS visszatér, a
// bizonyítékgyűjtés onnan folytatódik. Elhúzódó (extended) kiesés esetén is
// megmarad.
// ---------------------------------------------------------------------------
describe("(C) GPS-kiesés a boarding-megerősítés előtt nem szakítja meg a bizonyítékgyűjtést", () => {
  const TRANSIT_LEG_COORDINATES: [number, number][] = [
    [0, 0],
    [0, -0.01],
    [0, -0.02],
  ];

  function baseInput(overrides: Partial<WalkToTransitBoundaryInput> = {}): WalkToTransitBoundaryInput {
    return {
      geometryActiveLegIndex: 0,
      geometryActiveLegMode: "WALK",
      nextTransitLeg: {
        legIndex: 1,
        boardingCoordinate: [0, 0],
        legCoordinates: TRANSIT_LEG_COORDINATES,
      },
      position: { latitude: 0.0002, longitude: 0 },
      offRouteStatus: "ON_ROUTE",
      previous: null,
      ...overrides,
    };
  }

  test("rövid GPS-kiesés: AT_BOARDING_AREA megmarad, majd a GPS visszatérésekor BOARDED-ig eljut", () => {
    const atBoardingArea = resolveWalkToTransitBoundary(baseInput());
    assert.equal(atBoardingArea.phase, "AT_BOARDING_AREA");

    const duringLoss = resolveWalkToTransitBoundary(baseInput({ position: null, previous: atBoardingArea }));
    assert.equal(duringLoss.phase, "AT_BOARDING_AREA");
    assert.deepEqual(duringLoss, atBoardingArea);

    let state: WalkToTransitBoundaryState = duringLoss;
    for (const lat of [-0.00005, -0.00015, -0.00025]) {
      state = resolveWalkToTransitBoundary(baseInput({ position: { latitude: lat, longitude: 0 }, previous: state }));
    }
    assert.equal(state.phase, "BOARDED");
  });

  test("elhúzódó (több tick) GPS-kiesés is megőrzi az AT_BOARDING_AREA állapotot — nem 'strandel' zeroed WALKING-on", () => {
    let state: WalkToTransitBoundaryState = resolveWalkToTransitBoundary(baseInput());
    assert.equal(state.phase, "AT_BOARDING_AREA");
    for (let i = 0; i < 10; i += 1) {
      state = resolveWalkToTransitBoundary(baseInput({ position: null, previous: state }));
    }
    assert.equal(state.phase, "AT_BOARDING_AREA");
    assert.equal(state.resolvedLegIndex, 0);
  });
});

// ---------------------------------------------------------------------------
// (D) Realtime frissítés (stabil tripId/routeId) eléri az aktív
// instrukciót/ETA-t — a mergeRealtimeUpdates() a MEGLÉVŐ Journey-be vezeti
// be a friss departureTime-ot, és a transferTiming resolver ezt a FRISSÍTETT
// mezőt olvassa.
// ---------------------------------------------------------------------------
describe("(D) Realtime frissítés eléri az aktív instrukció/ETA láncot ugyanazon tripId/routeId mellett", () => {
  test("egy 13:52-es tényleges indulást jelző realtime update felülírja a stale 14:03-as tervezett indulást", () => {
    const journey = buildM2Journey();
    const updates = [
      {
        tripId: "m2_trip_1",
        routeId: "m2",
        departureTime: "2026-09-22T13:52:00+02:00",
        scheduledDepartureTime: "2026-09-22T14:03:00+02:00",
        arrivalTime: "2026-09-22T13:57:00+02:00",
        scheduledArrivalTime: "2026-09-22T14:08:00+02:00",
        realtime: true,
        delayMinutes: -11,
      },
    ];
    const merged = mergeRealtimeUpdates(journey, updates);
    assert.equal(merged.legs[1].departureTime, "2026-09-22T13:52:00+02:00");

    // A WALK leg (index 0) ELŐTT áll a boundary — a transferTiming
    // "nextDeparture"-je pontosan ezt a FRISSÍTETT időt mutatja, nem a
    // Journey eredeti, tervezési-időpontbeli 14:03-at.
    const timing = resolveNavigationTransferTiming(merged.legs, 0);
    assert.ok(timing.nextDeparture);
    assert.equal(timing.nextDeparture!.timeIso, "2026-09-22T13:52:00+02:00");
    assert.equal(timing.nextDeparture!.isRealtime, true);
  });

  test("eltérő tripId-jű update NEM módosítja a leget (stabil identitás-védelem)", () => {
    const journey = buildM2Journey();
    const updates = [
      {
        tripId: "m2_trip_OTHER",
        routeId: "m2",
        departureTime: "2026-09-22T13:00:00+02:00",
        realtime: true,
      },
    ];
    const merged = mergeRealtimeUpdates(journey, updates);
    assert.equal(merged.legs[1].departureTime, journey.legs[1].departureTime);
  });

  test("VedettUtvonalSearchForm.tsx: a realtime-refresh hook onUpdates callback-je a MEGLÉVŐ mergeRealtimeUpdates()-en keresztül a displayedJourney-be kerül", () => {
    assert.match(
      searchFormSrc,
      /setDisplayedJourney\(\s*\(prev\)\s*=>\s*mergeRealtimeUpdates\(prev,\s*updates\)\s*\)/,
      "a realtime updates-nek a MEGLÉVŐ mergeRealtimeUpdates()-en keresztül kell a displayedJourney-be kerülnie"
    );
  });
});

// ---------------------------------------------------------------------------
// (E) WALK leg geometria/instrukció nem vész el, és nem csúszik át idő előtt
// a következő TRANSIT legre a leg-átmenet alatt.
// ---------------------------------------------------------------------------
describe("(E) WALK leg geometria/instrukció nem vész el a leg-átmenet alatt", () => {
  test("amíg a boundary resolver WALKING/APPROACHING_BOARDING/AT_BOARDING_AREA-t jelez, a resolvedLegIndex a WALK legen marad (nem ugrik a TRANSIT-ra idő előtt)", () => {
    const journey = buildM2Journey();
    const nav = journeyLegsToNavigationRoute(journey.legs as unknown as Parameters<typeof journeyLegsToNavigationRoute>[0]);
    const walkRange = nav.legRanges.find((r) => r.legIndex === 0)!;
    assert.ok(walkRange.legCoordinates.length >= 2, "a WALK leg-nek van saját, legalább 2-pontos geometriája");

    const input: WalkToTransitBoundaryInput = {
      geometryActiveLegIndex: 0,
      geometryActiveLegMode: "WALK",
      nextTransitLeg: {
        legIndex: 1,
        boardingCoordinate: [journey.legs[1].fromLon as number, journey.legs[1].fromLat as number],
        legCoordinates: null,
      },
      position: { latitude: 47.51, longitude: 19.02 }, // ~1.5 km-re a boarding ponttól
      offRouteStatus: "ON_ROUTE",
      previous: null,
    };
    const result = resolveWalkToTransitBoundary(input);
    assert.equal(result.phase, "WALKING");
    assert.equal(result.resolvedLegIndex, 0, "a WALK leg marad aktív, amíg nincs boarding-bizonyíték");
  });

  test("a geometria csak akkor 'lép át' a következő legre, ha a globális geometria maga is TRANSIT-ot jelez — a resolver ekkor NOT_APPLICABLE-t ad, nem törli a WALK-adatokat", () => {
    const input: WalkToTransitBoundaryInput = {
      geometryActiveLegIndex: 1,
      geometryActiveLegMode: "TRANSIT",
      nextTransitLeg: null,
      position: { latitude: 47.5, longitude: 19.04 },
      offRouteStatus: "ON_ROUTE",
      previous: null,
    };
    const result = resolveWalkToTransitBoundary(input);
    assert.equal(result.phase, "NOT_APPLICABLE");
    assert.equal(result.resolvedLegIndex, 1);
  });
});

// ---------------------------------------------------------------------------
// (F) App-váltás után visszatérve a térkép canvas korrekt resize/repaint
// hívást kap, ÚJ map-instance/refitBounds/replan NÉLKÜL.
// ---------------------------------------------------------------------------
describe("(F) Fekete térkép app-váltás után — foreground resize/repaint, nincs új map-instance", () => {
  test("VedettUtvonalMap.tsx: visibilitychange-en, VALÓDI hidden->visible átmenetkor map.resize() + map.triggerRepaint() fut", () => {
    assert.match(mapSrc, /import\s*\{\s*isGenuineForegroundTransition\s*\}\s*from\s*"@\/lib\/vedett-route\/navigation\/foregroundReacquisition"/);
    assert.match(mapSrc, /document\.addEventListener\("visibilitychange",\s*handleMapVisibilityChange\)/);
    assert.match(mapSrc, /isGenuineForegroundTransition\(previousState,\s*nextState\)/);
    assert.match(mapSrc, /map\.resize\(\);\s*\n\s*map\.triggerRepaint\(\);/);
  });

  test("a fix NEM hoz létre új maplibregl.Map instance-t a visibilitychange kezelőben (csak az inicializáló effektben van 'new maplibregl.Map')", () => {
    const newMapCalls = mapSrc.match(/new maplibregl\.Map\(/g) ?? [];
    assert.equal(newMapCalls.length, 1, "pontosan egy helyen (az inicializáló effektben) jön létre map-instance");
  });

  test("a fix NEM hív fitBounds-ot a visibilitychange kezelőn belül", () => {
    const handlerMatch = mapSrc.match(/const handleMapVisibilityChange = \(\) => \{[\s\S]*?\n    \};/);
    assert.ok(handlerMatch, "megtalálható a handleMapVisibilityChange függvénytörzs");
    assert.doesNotMatch(handlerMatch![0], /fitBounds/);
  });

  test("a visibilitychange listener leiratkozik a cleanup-ban (nincs listener-szivárgás)", () => {
    assert.match(mapSrc, /document\.removeEventListener\("visibilitychange",\s*handleMapVisibilityChange\)/);
  });
});
