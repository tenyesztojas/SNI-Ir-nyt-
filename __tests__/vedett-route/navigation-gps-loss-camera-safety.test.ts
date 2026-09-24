// METRO GPS LOSS + MAP CAMERA SAFETY SPRINT (2026-09-17) — regressziós
// tesztek. Ez a projekt a VedettUtvonalMap/VedettUtvonalSearchForm React
// komponensek viselkedését NEM jsdom/@testing-library-vel teszteli (nincs a
// devDependencies között) — a MEGLÉVŐ konvenciót követi (lásd
// single-shared-map-and-current-location.test.ts, rest-point-map-fitbounds.
// test.ts): a tényleges forráskódot olvassa be és strukturális
// garanciákat ellenőriz. A pure gpsFixGate.ts logikát VALÓDI, viselkedés-
// alapú unit tesztekkel fedi (classifyGpsQuality).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyGpsQuality } from "../../lib/vedett-route/navigation/gpsFixGate.ts";

const MAP_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalMap.tsx");
const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const mapSrc = readFileSync(MAP_PATH, "utf-8");
const formSrc = readFileSync(FORM_PATH, "utf-8");

// 1) GPS QUALITY STATE — pure, viselkedés-alapú tesztek ------------------
describe("1) classifyGpsQuality — GOOD/DEGRADED/LOST a MEGLÉVŐ freshness+usable párból", () => {
  test("usable=true -> GOOD, függetlenül a freshness mezőtől", () => {
    assert.equal(classifyGpsQuality({ usable: true, freshness: "FRESH" }), "GOOD");
  });

  test("usable=false, freshness=FRESH -> DEGRADED (pl. reacquisition alatti régi-de-friss fix)", () => {
    assert.equal(classifyGpsQuality({ usable: false, freshness: "FRESH" }), "DEGRADED");
  });

  test("usable=false, freshness=STALE -> LOST", () => {
    assert.equal(classifyGpsQuality({ usable: false, freshness: "STALE" }), "LOST");
  });

  test("usable=false, freshness=INVALID -> LOST", () => {
    assert.equal(classifyGpsQuality({ usable: false, freshness: "INVALID" }), "LOST");
  });
});

// 2/3) CAMERA FREEZE + STALE MARKER NEM VEZÉRLI A KAMERÁT ----------------
describe("2/3) GPS LOST esetén a térkép nem kap 'aktuálisként' bemutatott pozíciót", () => {
  test("VedettUtvonalSearchForm a <VedettUtvonalMap>-nek gpsFixUsable-gated pozíciót ad át (LOST/DEGRADED -> null)", () => {
    assert.match(formSrc, /currentPosition=\{gpsFixUsable \? currentPosition : null\}/);
  });

  test("a follow-effekt (easeTo) korai return-nel HOLD-ol, ha nincs szám lat/lon (null pozícióra nem mozdítja a kamerát)", () => {
    assert.match(mapSrc, /if \(typeof currentLat !== "number" \|\| typeof currentLon !== "number"\) return;[\s\S]{0,400}map\.easeTo/);
  });
});

// 4/5) MANUAL DRAG/ZOOM -> followMode=false (MEGLÉVŐ viselkedés, változatlan) --
describe("4/5) manuális gesztus (drag/zoom/rotate/pitch) továbbra is megszakítja a follow-ot", () => {
  test("dragstart/zoomstart/rotatestart/pitchstart mind a handlePossibleUserGesture-re vannak kötve", () => {
    for (const evt of ["dragstart", "zoomstart", "rotatestart", "pitchstart"]) {
      assert.match(mapSrc, new RegExp(`map\\.on\\("${evt}", handlePossibleUserGesture\\)`));
    }
  });

  test("valódi gesztus (originalEvent jelen van) hívja onUserGestureCancelFollowRef-et ÉS beállítja a userCameraOverrideRef-et", () => {
    assert.match(
      mapSrc,
      /if \(e\.originalEvent\) \{\s*userCameraOverrideRef\.current = true;\s*onUserGestureCancelFollowRef\.current\?\.\(\);/
    );
  });
});

// 6/7) followMode=false + legs/realtime frissítés -> NINCS automatikus fitBounds
describe("6/7) USER OWNS CAMERA — manuális override alatt legs/displayedJourney/realtime-frissítés nem indíthat fitBounds-ot", () => {
  test("a route-view fitBounds feltétele tartalmazza a userCameraOverrideRef ellenőrzést, a MEGLÉVŐ feltételek MELLETT", () => {
    assert.match(
      mapSrc,
      /if \(hasCoords && !restPointFocusMode && !followMode && !userCameraOverrideRef\.current\) \{\s*map\.fitBounds/
    );
  });

  test("a carRoute fitBounds feltétele is tartalmazza a userCameraOverrideRef ellenőrzést", () => {
    assert.match(
      mapSrc,
      /if \(carRouteGeometry && carRouteGeometry\.coordinates\.length > 0 && !followMode && !userCameraOverrideRef\.current\) \{/
    );
  });

  test("a pihenőpont-fókusz fitBounds effekt is explicit return-nel kilép userCameraOverrideRef alatt", () => {
    assert.match(mapSrc, /if \(followMode\) return;\s*\/\/[\s\S]{0,300}if \(userCameraOverrideRef\.current\) return;/);
  });

  test("a route-view effekt függőség-listája (legs/mapReady/restPointFocusMode/followMode) VÁLTOZATLAN — nincs új render-trigger, a ref-olvasás elég", () => {
    assert.match(mapSrc, /\}, \[legs, mapReady, restPointFocusMode, followMode\]\);/);
  });
});

// 8/9) GPS RECOVERY — followMode=false: nincs auto-recenter; followMode=true: normál follow folytatódik
describe("8/9) GPS recovery — a follow-effekt VÁLTOZATLANUL kizárólag followMode-tól függ, nem a userCameraOverrideRef-től", () => {
  test("a follow-effekt (easeTo) NEM hivatkozik userCameraOverrideRef-re — friss fix érkezésekor followMode=false esetén nem lehet automatikus recenter, followMode=true esetén a follow akadálytalanul folytatódik", () => {
    const followEffectMatch = mapSrc.match(
      /useEffect\(\(\) => \{\s*const map = mapRef\.current;\s*if \(!map \|\| !mapReady\) return;\s*if \(!followMode\) return;[\s\S]*?\}, \[followMode, mapReady, currentLat, currentLon, navigationZoom, currentPosition\?\.headingDegrees\]\);/
    );
    assert.ok(followEffectMatch, "a follow-effekt megtalálható a várt alakban");
    assert.ok(
      !followEffectMatch![0].includes("userCameraOverrideRef"),
      "a follow-effekt nem gate-elhető userCameraOverrideRef-fel — a felhasználó explicit 'Kövesd a helyzetem' (followMode=true) művelete önmagában elég a folytatáshoz"
    );
  });

  test("userCameraOverrideRef KIZÁRÓLAG a followMode:true váltásra törlődik — nincs időzítő/automatikus visszaállás", () => {
    assert.match(mapSrc, /useEffect\(\(\) => \{\s*if \(followMode\) userCameraOverrideRef\.current = false;\s*\}, \[followMode\]\);/);
    assert.ok(!/setTimeout[\s\S]{0,80}userCameraOverrideRef/.test(mapSrc), "nincs időzítő-alapú override-feloldás");
  });
});

// 10) INITIAL ROUTE PREVIEW NEM TÖRIK -------------------------------------
describe("10) initial route preview — a meglévő fitBounds viselkedés nem törik", () => {
  test("userCameraOverrideRef induló értéke false (az első, sosem navigált előnézet fitBounds-ol)", () => {
    assert.match(mapSrc, /const userCameraOverrideRef = useRef\(false\);/);
  });

  test("a route-view fitBounds MEGLÉVŐ három feltétele (hasCoords/!restPointFocusMode/!followMode) mind megmaradt, csak kiegészült", () => {
    assert.match(mapSrc, /hasCoords && !restPointFocusMode && !followMode && !userCameraOverrideRef\.current/);
  });
});

// 11/12) TRANSIT SAFETY INTEGRÁCIÓ — GPS LOST nem okozhat false OFF_ROUTE / geometry-only reroute-ot,
// és a 32fcc12 weak-transit-geometry safety logika nem gyengült.
describe("11) GPS LOST transit közben — a reroute-döntés bemenete VÁLTOZATLANUL gpsFixUsable-gated", () => {
  test("a rerouteGuard hívás hasCurrentPosition mezője továbbra is gpsFixUsable-t is ellenőrzi", () => {
    assert.match(formSrc, /hasCurrentPosition:\s*currentPosition !== null && gpsFixUsable/);
  });

  test("a routeProgress motor (useRouteNavigation) pozíció-bemenete gpsFixUsable-gated marad", () => {
    const idx = formSrc.indexOf("const routeProgress = useRouteNavigation(");
    assert.ok(idx > 0, "useRouteNavigation hívás megtalálható");
    const before = formSrc.slice(Math.max(0, idx - 400), idx);
    assert.match(before, /currentPosition && gpsFixUsable/);
  });
});

describe("12) 32fcc12 (weak transit geometry safety) regresszió nélkül", () => {
  test("a transitGeometryUncertain bekötés a reroute-guard hívásban megmaradt (2026-09-24 óta a bővített transitGeometryUncertainForReroute-on keresztül)", () => {
    // BOARDING-WINDOW TRANSIT GEOMETRY SAFETY FIX (2026-09-24) — a reroute
    // guard immár a bővített transitGeometryUncertainForReroute jelzőt kapja
    // meg transitGeometryUncertain néven (lásd 11/12. teszt lentebb a
    // navigation-transit-geometry-safety.test.ts-ben a teljes bekötésért).
    assert.match(formSrc, /transitGeometryUncertain:\s*transitGeometryUncertainForReroute/);
    // A bővítés NEM veszítette el a 32fcc12 safety védelmet: a
    // transitGeometryUncertainForReroute definíciója OR-ral tartalmazza a
    // MEGLÉVŐ activeLegTransitGeometryUncertain ágat.
    assert.match(
      formSrc,
      /const transitGeometryUncertainForReroute =\s*\n\s*activeLegTransitGeometryUncertain \|\| pendingBoardingNextTransitGeometryUncertain;/,
    );
  });

  test("a BOARDED_UNCERTAIN_GEOMETRY fázis és a TRANSIT_GEOMETRY_UNCERTAIN block reason továbbra is exportált", () => {
    const legTransitionSrc = readFileSync(
      join(import.meta.dirname, "..", "..", "lib", "vedett-route", "navigation", "legTransition.ts"),
      "utf-8"
    );
    const rerouteGuardSrc = readFileSync(
      join(import.meta.dirname, "..", "..", "lib", "vedett-route", "navigation", "rerouteGuard.ts"),
      "utf-8"
    );
    assert.match(legTransitionSrc, /"BOARDED_UNCERTAIN_GEOMETRY"/);
    assert.match(rerouteGuardSrc, /"TRANSIT_GEOMETRY_UNCERTAIN"/);
  });
});
