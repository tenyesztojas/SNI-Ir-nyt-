// NAVIGATION — WALK "HALADJ TOVÁBB 0 MÉTERT" + MEGLÉVŐ REROUTE FLOW
// production hiba, 2. kör (2026-10-01).
//
// Az 1. körben az isZeroDistanceWalkInstruction() (walkManoeuvreProgress.ts)
// megakadályozta, hogy egy <= 0 méteres, kanyar-irány nélküli WALK-manőver
// szövege ("Haladj tovább 0 métert") képernyőre/TTS-be kerüljön. Ez a teszt
// azt bizonyítja END-TO-END, a VALÓDI (nem újraimplementált) production
// függvényeket összekötve, hogy:
//
//   1) a 0 méteres szöveg SOHA nem jelenik meg/hangzik el, akkor sem, ha a
//      felhasználó TÉNYLEGESEN jelentősen letért az útvonalról (pl. autóval
//      messze elment, túlhaladva a WALK leg célpontján);
//   2) EZZEL A PÁRHUZAMOSAN, a MEGLÉVŐ, ettől a szövegtől TELJESEN FÜGGETLEN
//      off-route/reroute mechanizmus (routeProgress.ts updateRouteProgress
//      -> rerouteGuard.ts shouldStartAutomaticReroute) a SAJÁT, konzervatív
//      (3 egymást követő "far" fix) megerősítési küszöbe után MEGINDÍTJA az
//      újratervezést — anélkül, hogy bármilyen ÚJ, második reroute-rendszert
//      bevezettünk volna, vagy a 0 méteres szöveg-szűrést a reroute-döntésbe
//      vezettük volna be (a kettő a MEGLÉVŐ, közös `routeProgress`
//      state-en keresztül már eddig is összekapcsolódott — lásd
//      VedettUtvonalSearchForm.tsx: ugyanaz a `routeProgress` adja a
//      WALK-progress leg-lokális távolságát (resolveDistanceAlongLegMeters)
//      ÉS a reroute-guard `offRouteStatus` bemenetét is);
//   3) normál, legitim megérkezéskor (a felhasználó valóban a cél közelében
//      van) NEM indul felesleges reroute;
//   4) szórt/zajos (hol közel, hol távol) GPS-fixek, amelyek SOHA nem
//      egymást követő 3 "far" fixet adnak, NEM erősítik meg az OFF_ROUTE
//      állapotot, tehát NEM indítanak agresszív/felesleges reroute-ot.
//
// GYÖKÉROK, amit ez a kör feltárt (lásd a végső riportot is): a WALK-leg
// lokális távolsága (routeProgress.progressDistanceMeters-ből levezetve) EGY
// FIX alapján azonnal a leg végére ugorhat (nincs megerősítési küszöbe),
// míg az offRouteStatus "OFF_ROUTE"-ra váltása SZÁNDÉKOSAN 3 egymást követő
// "far" fixet követel (anti-jitter védelem, lásd a hibajegy 7. pontját: "GPS-
// zaj NE okozzon agresszív újratervezést"). Ez a két MEGLÉVŐ mechanizmus a
// kezdetektől UGYANABBÓL a `routeProgress` state-ből él — nincs hiányzó
// bekötés, nincs második rendszer; az egyetlen valódi hiba az volt, hogy a
// WALK-progress szöveg ezt a (helyes, szándékos) 2-3 fixes megerősítési
// ablakot egy értelmetlen "0 méter" szöveggel töltötte ki. Ezt az 1. kör már
// javította (isZeroDistanceWalkInstruction) — ez a teszt bizonyítja, hogy a
// reroute ettől függetlenül, a MEGLÉVŐ mechanizmuson keresztül, helyesen
// aktiválódik.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createInitialRouteProgress, updateRouteProgress } from "../../lib/vedett-route/navigation/routeProgress.ts";
import { detectWalkManoeuvres } from "../../lib/vedett-route/navigation/walkManoeuvre.ts";
import {
  isZeroDistanceWalkInstruction,
  resolveDistanceAlongLegMeters,
  resolveWalkProgress,
} from "../../lib/vedett-route/navigation/walkManoeuvreProgress.ts";
import { createInitialRerouteGuardState, shouldStartAutomaticReroute } from "../../lib/vedett-route/navigation/rerouteGuard.ts";
import type { NavigationCoordinate, NavigationPosition, RouteProgressState } from "../../lib/vedett-route/navigation/types.ts";

const EARTH_RADIUS_M = 6_371_008.8;

// UGYANAZ az exact spherical "destination point" helper, mint
// navigation-walk-progress.test.ts-ben — determinisztikus, haversine-
// konzisztens koordináták.
function destinationPoint([lon, lat]: readonly [number, number], bearingDeg: number, distanceMeters: number): [number, number] {
  const δ = distanceMeters / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

const ORIGIN: [number, number] = [19.0, 47.0];
// Egyenes, 200 m-es WALK route, északi irányba (bearing 0).
const DESTINATION = destinationPoint(ORIGIN, 0, 200);
const ROUTE: NavigationCoordinate[] = [ORIGIN, DESTINATION];
const ROUTE_LENGTH_METERS = 200;
const LEG_RANGE = { legIndex: 0, startSegmentIndex: 0, endSegmentIndex: 0, legCoordinates: ROUTE };

function position(coord: readonly [number, number], timestampMs: number): NavigationPosition {
  return { longitude: coord[0], latitude: coord[1], timestampMs };
}

// Pure helper, amely az ÉGÉSZ pipeline-t egyetlen GPS-fixre lefuttatja —
// ugyanazokat a production függvényeket hívja, amiket
// VedettUtvonalSearchForm.tsx is (routeProgress -> walk-leg-lokális
// távolság -> walk-progress -> isZeroDistanceWalkInstruction).
function stepFix(previous: RouteProgressState | null, coord: readonly [number, number], timestampMs: number) {
  const routeProgress = updateRouteProgress(ROUTE, position(coord, timestampMs), previous, {});
  const distanceAlongLegMeters = resolveDistanceAlongLegMeters(routeProgress.progressDistanceMeters, ROUTE, LEG_RANGE, ROUTE_LENGTH_METERS);
  const manoeuvres = detectWalkManoeuvres(ROUTE);
  const walkProgress = distanceAlongLegMeters !== null ? resolveWalkProgress(manoeuvres, distanceAlongLegMeters) : null;
  const zeroDistanceSuppressed =
    walkProgress?.currentManoeuvre && walkProgress.distanceToCurrentMeters !== null
      ? isZeroDistanceWalkInstruction(walkProgress.currentManoeuvre, walkProgress.distanceToCurrentMeters)
      : false;
  return { routeProgress, walkProgress, zeroDistanceSuppressed };
}

describe("1/2) jelentős valódi off-route eltérés — SOHA nincs '0 méter' szöveg, ÉS a MEGLÉVŐ reroute flow aktiválódik", () => {
  test("a felhasználó messze túlhalad a WALK cél ponton (pl. autóval) — a leg-lokális progress azonnal a végére ugrik", () => {
    // ~500 m-rel a cél MÖGÉ, UGYANAZON az irányon — a route 2 pontú
    // polyline-jára a legközelebbi pont garantáltan a célpont (t=1
    // clamp), tehát distanceAlongRouteMeters azonnal a route teljes
    // hosszára ugrik, a distanceFromRouteMeters pedig ~500 m (jelentős,
    // valódi letérés, nem GPS-zaj).
    const farBeyond = destinationPoint(DESTINATION, 0, 500);

    let previous: RouteProgressState | null = null;
    const guard = createInitialRerouteGuardState();

    // FIX 1 — az ELSŐ far fixen a WALK-progress MÁR a leg végére ugrik
    // (nincs megerősítési küszöbe), de az offRouteStatus MÉG csak
    // POSSIBLY_OFF_ROUTE (a rerouteGuard konzervatív, 3 egymást követő far
    // fixet követel) — a reroute MÉG NEM indul, DE a 0 méteres szöveg
    // MÁR az első fixtől védett.
    const fix1 = stepFix(previous, farBeyond, 1_000);
    previous = fix1.routeProgress;
    assert.equal(fix1.routeProgress.offRouteStatus, "POSSIBLY_OFF_ROUTE");
    assert.equal(fix1.walkProgress?.currentManoeuvre?.kind, "ARRIVE");
    // Lebegőpontos pontosság (gömbi haversine-projekció) miatt ez nem
    // pontosan 0, hanem elhanyagolhatóan kicsi (<< 1 mm) — a lényeg, hogy
    // a route VÉGÉRE clampel, nem egy valódi, érdemi hátralévő távolságra.
    assert.ok((fix1.walkProgress?.distanceToCurrentMeters ?? Infinity) < 1e-6, "a leg-lokális progress már az első far fixen a route végére clampel");
    assert.equal(fix1.zeroDistanceSuppressed, true, "a '0 méteres' instrukció MÁR az 1. fixen elnyomva — sosem jelenik meg");
    const decision1 = shouldStartAutomaticReroute(guard, {
      navigationActive: true,
      offRouteStatus: fix1.routeProgress.offRouteStatus,
      hasCurrentPosition: true,
      hasDestination: true,
      nowMs: 1_000,
    });
    assert.equal(decision1.shouldReroute, false);
    assert.equal(decision1.reason, "NOT_CONFIRMED_OFF_ROUTE");

    // FIX 2 — ugyanott maradva (még nincs megerősítve).
    const fix2 = stepFix(previous, farBeyond, 2_000);
    previous = fix2.routeProgress;
    assert.equal(fix2.routeProgress.offRouteStatus, "POSSIBLY_OFF_ROUTE");
    assert.equal(fix2.zeroDistanceSuppressed, true);
    const decision2 = shouldStartAutomaticReroute(guard, {
      navigationActive: true,
      offRouteStatus: fix2.routeProgress.offRouteStatus,
      hasCurrentPosition: true,
      hasDestination: true,
      nowMs: 2_000,
    });
    assert.equal(decision2.shouldReroute, false);

    // FIX 3 — a 3. egymást követő far fixen a MEGLÉVŐ rerouteGuard
    // megerősíti az OFF_ROUTE állapotot, ÉS (ugyanabból a megerősítésből,
    // minden plusz bekötés NÉLKÜL) a reroute-döntés true-ra vált. A 0
    // méteres szöveg EZALATT is változatlanul elnyomva marad.
    const fix3 = stepFix(previous, farBeyond, 3_000);
    assert.equal(fix3.routeProgress.offRouteStatus, "OFF_ROUTE");
    assert.equal(fix3.zeroDistanceSuppressed, true, "a reroute megindulásáig/alatt is védett a szöveg");
    const decision3 = shouldStartAutomaticReroute(guard, {
      navigationActive: true,
      offRouteStatus: fix3.routeProgress.offRouteStatus,
      hasCurrentPosition: true,
      hasDestination: true,
      nowMs: 3_000,
    });
    assert.equal(decision3.shouldReroute, true, "a MEGLÉVŐ reroute flow a saját megerősítési küszöbén át automatikusan aktiválódik");
    assert.equal(decision3.reason, null);
  });
});

describe("3) normál megérkezés — NEM indul felesleges reroute", () => {
  test("a felhasználó valóban a WALK cél pontjára érkezik — ON_ROUTE marad, nincs reroute, a 0 méteres szöveg itt is elnyomva", () => {
    const fix = stepFix(null, DESTINATION, 1_000);
    assert.equal(fix.routeProgress.offRouteStatus, "ON_ROUTE");
    assert.equal(fix.walkProgress?.currentManoeuvre?.kind, "ARRIVE");
    assert.equal(fix.zeroDistanceSuppressed, true, "legitim megérkezéskor sem szabad '0 méter' szöveget mutatni/felolvasni");

    const decision = shouldStartAutomaticReroute(createInitialRerouteGuardState(), {
      navigationActive: true,
      offRouteStatus: fix.routeProgress.offRouteStatus,
      hasCurrentPosition: true,
      hasDestination: true,
      nowMs: 1_000,
    });
    assert.equal(decision.shouldReroute, false);
    assert.equal(decision.reason, "NOT_CONFIRMED_OFF_ROUTE");
  });
});

describe("4) GPS-zaj/gyenge pontosság — NEM okoz agresszív újratervezést", () => {
  test("szórt (hol közel, hol távol) fixek, amelyek sosem adnak 3 egymást követő 'far' fixet — az OFF_ROUTE SOSEM erősödik meg", () => {
    const farBeyond = destinationPoint(DESTINATION, 0, 500);
    const nearMid = destinationPoint(ORIGIN, 0, 100); // a route közepén, ON_ROUTE

    let previous: RouteProgressState | null = null;
    const guard = createInitialRerouteGuardState();
    const sequence: Array<readonly [number, number]> = [farBeyond, nearMid, farBeyond, nearMid, farBeyond];

    sequence.forEach((coord, index) => {
      const nowMs = (index + 1) * 1_000;
      const fix = stepFix(previous, coord, nowMs);
      previous = fix.routeProgress;
      assert.notEqual(fix.routeProgress.offRouteStatus, "OFF_ROUTE", `fix #${index + 1}-en nem szabad megerősített OFF_ROUTE-nak lennie (zajos szekvencia)`);
      const decision = shouldStartAutomaticReroute(guard, {
        navigationActive: true,
        offRouteStatus: fix.routeProgress.offRouteStatus,
        hasCurrentPosition: true,
        hasDestination: true,
        nowMs,
      });
      assert.equal(decision.shouldReroute, false, `fix #${index + 1}-en nem szabad reroute-ot indítani (zajos szekvencia)`);
    });
  });
});
