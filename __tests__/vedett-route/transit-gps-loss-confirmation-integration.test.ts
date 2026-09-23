// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — a React-
// orchestrationt (VedettUtvonalSearchForm.tsx) a projekt MEGLÉVŐ
// konvenciója szerint forráskód-szintű, strukturális tesztekkel fedjük
// (nincs jsdom/@testing-library) — a pure döntési logikát (mikor kell
// kérdezni, milyen szöveggel) a transit-gps-loss-confirmation.test.ts MÁR
// valódi, viselkedés-alapú unit tesztekkel fedi.
//
// ONBOARD CONFIRMATION SPRINT (2026-09-23) — a 2026-09-21-es state-modell
// (pending/transitMode) helyét egy status/scope alapú modell vette át
// (lásd transitGpsLossConfirmation.ts), ÉS az audit (section I/G) által
// talált tripId-leakage rést egy ÚJ, a leg-tripId-változást figyelő
// effekt zárja be. Az alábbi teszteket EZÉRT frissítettük az ÚJ API-ra —
// nem törölve, hanem a MEGLÉVŐ struktúrát/szándékot megtartva, dátumozott
// indoklással minden ténylegesen megváltozott ponton.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const FORM_PATH = join(ROOT, "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const src = readFileSync(FORM_PATH, "utf-8");

describe("2) a megerősítő kérdés megjelenik, amikor egyébként automatikus reroute indulna", () => {
  test("transitGpsLossConfirmationVisible az EGYETLEN, render-szinten kiszámolt automaticRerouteDecision-ből származik — nincs második shouldStartAutomaticReroute hívás", () => {
    assert.match(
      src,
      /const automaticRerouteDecision = shouldStartAutomaticReroute\(rerouteGuardRef\.current, \{/,
    );
    // ONBOARD CONFIRMATION SPRINT (2026-09-23) — a `.pending` mező helyett
    // `.status === "PENDING"` — ugyanaz a "kizárólag PENDING-re látszik a
    // kártya" szemantika, csak a bővített status-modellre vetítve.
    assert.match(
      src,
      /const transitGpsLossConfirmationVisible =\s*transitGpsLossConfirmation\.status === "PENDING" &&\s*\(automaticRerouteDecision\.shouldReroute \|\|\s*automaticRerouteDecision\.reason === "TRANSIT_GPS_LOSS_AWAITING_CONFIRMATION"\);/,
    );
    const decisionCalls = src.match(/shouldStartAutomaticReroute\(rerouteGuardRef\.current/g) ?? [];
    assert.equal(decisionCalls.length, 1, "EGYETLEN shouldStartAutomaticReroute hívási hely lehet a fájlban");
  });

  test("a kártya JSX-ben transitGpsLossConfirmationVisible mögé van gate-elve, és a MEGLÉVŐ OFF_ROUTE bannert elnyomja (nincs két egymásnak ellentmondó üzenet egyszerre)", () => {
    assert.match(
      src,
      /\{navigationMode && routeProgress\.offRouteStatus === "OFF_ROUTE" && !transitGpsLossConfirmationVisible && !activeLegTransitGeometryUncertain && \(/,
    );
    assert.match(src, /\{navigationMode && transitGpsLossConfirmationVisible && \(/);
  });

  test("a kérdés szövege transitOnboardQuestionText()-ből jön (nem hardcode-olt duplikátum), és a másodlagos (headsign) sor opcionálisan jelenik meg", () => {
    // ONBOARD CONFIRMATION SPRINT (2026-09-23) — a kérdésszöveg-generátor
    // átnevezve transitGpsLossQuestionText(transitMode) -> transitOnboard
    // QuestionText(scope), és mostantól {primary, secondary} párt ad vissza
    // (lásd audit C/E pont — SUBWAY esetén opcionális "X felé" sor).
    assert.match(src, /\{transitOnboardQuestionText\(transitGpsLossConfirmation\.scope\)\.primary\}/);
    assert.match(src, /\{transitOnboardQuestionText\(transitGpsLossConfirmation\.scope\)\.secondary &&/);
    assert.match(src, /A helyzeted egy ideig nem volt elérhető\./);
  });

  test("a kártya valódi <button type=\"button\"> Igen/Nem elemeket használ, nincs modal/autoFocus", () => {
    assert.match(src, /<button type="button" onClick=\{handleTransitGpsLossConfirm\}[^>]*>\s*Igen\s*<\/button>/);
    assert.match(src, /<button type="button" onClick=\{handleTransitGpsLossDecline\}[^>]*>\s*Nem\s*<\/button>/);
    assert.doesNotMatch(src, /autoFocus/);
  });
});

describe("4) IGEN — original journey preserved, no /plan, scoped CONFIRMED_ONBOARD", () => {
  test("handleTransitGpsLossConfirm NEM hív setDisplayedJourney-t és NEM indít fetch-et — kizárólag a confirmation/guard/OFF_ROUTE-evidence állapotot állítja CONFIRMED_ONBOARD-ra", () => {
    const startIdx = src.indexOf("const handleTransitGpsLossConfirm = () => {");
    const endIdx = src.indexOf("};", startIdx);
    assert.ok(startIdx > 0 && endIdx > startIdx, "handleTransitGpsLossConfirm megtalálható");
    const body = src.slice(startIdx, endIdx);
    assert.doesNotMatch(body, /setDisplayedJourney/);
    assert.doesNotMatch(body, /fetch\(/);
    // ONBOARD CONFIRMATION SPRINT (2026-09-23) — a korábbi
    // resolveTransitGpsLossConfirmation() (ami NONE-ra reseteli) helyett
    // MOST confirmTransitOnboard(...), ami CONFIRMED_ONBOARD-dá teszi ÉS
    // MEGŐRZI a scope-ot (tripId) — ez a "nincs újra-kérdezés ugyanazon a
    // tripen" viselkedés alapja (lásd audit F pont).
    assert.match(body, /confirmTransitOnboard\(transitGpsLossConfirmationRef\.current\)/);
    assert.match(body, /setRouteProgressResetToken\(\(token\) => token \+ 1\)/);
  });
});

describe("5) NEM — reroute exactly once, csak egy friss (post-decline) GPS fix után", () => {
  test("handleTransitGpsLossDecline a válasz IDŐPONTJÁT rögzíti (declineTransitOnboard) — a tényleges reroute-ot a MEGLÉVŐ automatikus reroute-effekt indítja, DE csak friss GPS fix után", () => {
    const startIdx = src.indexOf("const handleTransitGpsLossDecline = () => {");
    const endIdx = src.indexOf("};", startIdx);
    assert.ok(startIdx > 0 && endIdx > startIdx, "handleTransitGpsLossDecline megtalálható");
    const body = src.slice(startIdx, endIdx);
    assert.doesNotMatch(body, /fetch\(/);
    // ONBOARD CONFIRMATION SPRINT (2026-09-23) — resolveTransitGpsLossConfirmation()
    // helyett declineTransitOnboard(Date.now()), ami rögzíti a NEM válasz
    // IDŐPONTJÁT (awaitingFreshGpsSinceMs) — lásd audit J/K pont, a
    // gpsFixGate.ts esemény-időpont-vs-fix-időpont mintájának újrahasznosítása.
    assert.match(body, /declineTransitOnboard\(Date\.now\(\)\)/);
  });

  test("a reroute-effekt hívásában szerepel a transitGpsLossAwaitingConfirmation ÉS az awaitingFreshGpsAfterDecline bemenet is, ÉS mindkettő a függőség-listában — 'Nem' válasz újra futtatja az effektet, de csak friss fix után engedi a reroute-ot", () => {
    // ONBOARD CONFIRMATION SPRINT (2026-09-23) — a bemenet forrása
    // `.pending` helyett `.status === "PENDING"` + explicit tripId-egyeztetés
    // (lásd a leakage-fix miatt), a függőség-listában pedig `.pending`
    // helyett `.status`/`.scope?.tripId`/`.awaitingFreshGpsSinceMs`.
    assert.match(
      src,
      /transitGpsLossAwaitingConfirmation:\s*transitGpsLossConfirmation\.status === "PENDING" &&\s*activeLeg\?\.mode === "TRANSIT" &&\s*activeLeg\.tripId === transitGpsLossConfirmation\.scope\?\.tripId,/,
    );
    assert.match(src, /awaitingFreshGpsAfterDecline: isAwaitingFreshGpsAfterDeclineValue,/);
    assert.match(
      src,
      /transitGpsLossConfirmation\.status,\s*transitGpsLossConfirmation\.scope\?\.tripId,\s*transitGpsLossConfirmation\.awaitingFreshGpsSinceMs,/,
    );
  });

  test("a 'Nem' válaszhoz nincs duplikált fetch-kódút — a resume endpointnak KIZÁRÓLAG a MEGLÉVŐ automatikus reroute-effekt és az ÚJ, tőle független korábbi-járat ellenőrzés hívási helye létezik", () => {
    // EARLIER TRANSIT DEPARTURE SPRINT (2026-09-22) — a handleTransitGpsLossDecline
    // (fent tesztelve) VÁLTOZATLANUL nem tartalmaz fetch-et; a resume-endpoint
    // MOST két hívási helyet enged (reroute-effekt + korábbi-járat check,
    // lásd navigation-auto-reroute-integration.test.ts és
    // navigation-transit-geometry-safety.test.ts frissített kommentjét) —
    // ez a teszt csak azt zárja ki, hogy a 'Nem' válasz EGY HARMADIK,
    // duplikált kódutat hozzon létre.
    const matches = src.match(/\/api\/vedett-route\/rest-stops\/resume/g) ?? [];
    assert.equal(matches.length, 2, "a resume endpointnak KIZÁRÓLAG a reroute-effekt és a korábbi-járat ellenőrzés hívási helye lehet a fájlban");
  });
});

describe("6) normál GPS recovery — nincs confirmation (csendes auto-clear, a MEGLÉVŐ jelzőkből)", () => {
  test("egy külön effekt hívja shouldAutoClearTransitGpsLossConfirmation-t a MEGLÉVŐ gpsFixUsable/gpsReacquiring/routeProgress.offRouteStatus jelzőkkel (status alapon) — nincs új GPS-állapotgép", () => {
    assert.match(
      src,
      /shouldAutoClearTransitGpsLossConfirmation\(\s*transitGpsLossConfirmation\.status,\s*gpsFixUsable,\s*gpsReacquiring,\s*routeProgress\.offRouteStatus,\s*\)/,
    );
  });
});

describe("1/3) a LOST-detektálás a MEGLÉVŐ classifyGpsQuality-ből és a BOARDED/BOARDED_UNCERTAIN_GEOMETRY fázisból dolgozik", () => {
  test("registerTransitGpsLossIfNeeded mindkét GPS-tick effektben meghívódik (friss fix + 5 mp-es fallback-poll) — nincs duplikált logika", () => {
    const matches = src.match(/registerTransitGpsLossIfNeeded\(result\);/g) ?? [];
    assert.equal(matches.length, 2, "mindkét GPS-tick effektnek hívnia kell — a friss fixnek ÉS az 5 mp-es interval-pollnak is");
  });

  test("activeBoardedTransitScopeRef KIZÁRÓLAG akkor kap scope-ot (tripId+transitMode+routeShortName+headsign), ha a leg TRANSIT ÉS isBoardedPhase ÉS van tripId — WALK legen sosem", () => {
    // ONBOARD CONFIRMATION SPRINT (2026-09-23) — activeBoardedTransitModeRef
    // (csak transitMode-ot tárolt) -> activeBoardedTransitScopeRef (a teljes
    // TransitOnboardScope-ot tárolja, tripId-vel EGYÜTT) — ez zárja be az
    // audit által talált leakage-rést (lásd G teszt a modul-szintű teszt-
    // fájlban): a markTransitGpsLoss innentől a KONKRÉT tripId-t kapja meg,
    // nem csak a módot.
    assert.match(
      src,
      /activeBoardedTransitScopeRef\.current =\s*activeLeg\?\.mode === "TRANSIT" && isBoardedPhase && activeLeg\.tripId\s*\?\s*\{\s*tripId: activeLeg\.tripId,\s*transitMode: activeLeg\.transitMode \?\? null,\s*routeShortName: activeLeg\.routeShortName \?\? null,\s*headsign: activeLeg\.headsign \?\? null,\s*\}\s*:\s*null;/,
    );
  });
});

describe("7) [H/I] leg-befejeződés / tripId-váltás érvényteleníti a scope-ot (leakage-fix, ONBOARD CONFIRMATION SPRINT, 2026-09-23)", () => {
  test("egy KÜLÖN effekt figyeli az aktív TRANSIT leg tripId-jét, és isTransitOnboardScopeStale esetén NONE-ra reseteli a confirmation-t — nincs duplikált leg-completion detektor", () => {
    assert.match(
      src,
      /if \(isTransitOnboardScopeStale\(transitGpsLossConfirmationRef\.current, activeTransitLegTripId\)\) \{/,
    );
    assert.match(src, /\}, \[activeLeg\?\.mode, activeLeg\?\.tripId\]\);/);
  });
});

describe("8) [I] navigációs session-váltás is érvényteleníti a confirmation-t (a MEGLÉVŐ bumpNavigationSession-t bővíti, nincs második session-fogalom)", () => {
  test("bumpNavigationSession KIZÁRÓLAG resolveTransitGpsLossConfirmation()-t hív (NONE-ra reset) — egy CONFIRMED_ONBOARD sem marad beragadva egy régi session után", () => {
    const startIdx = src.indexOf("const bumpNavigationSession = () => {");
    const endIdx = src.indexOf("};", startIdx);
    assert.ok(startIdx > 0 && endIdx > startIdx, "bumpNavigationSession megtalálható");
    const body = src.slice(startIdx, endIdx);
    assert.match(body, /transitGpsLossConfirmationRef\.current = resolveTransitGpsLossConfirmation\(\);/);
    assert.match(body, /rerouteSessionRef\.current \+= 1;/);
  });
});

describe("9) [M] a b84b532-es /api/v6/trip realtime-refresh identitás-építése VÁLTOZATLAN — a YES/NO handler nem nyúl hozzá", () => {
  test("a transitLegIdentities (tripId/fromStopId/toStopId) kizárólag displayedJourney.legs-ből épül, a handleTransitGpsLossConfirm/Decline egyike sem hivatkozik rá", () => {
    const identityStart = src.indexOf("const transitLegIdentities = displayedJourney.legs");
    assert.ok(identityStart > 0, "transitLegIdentities építése megtalálható");

    const confirmStart = src.indexOf("const handleTransitGpsLossConfirm = () => {");
    const confirmEnd = src.indexOf("};", confirmStart);
    const confirmBody = src.slice(confirmStart, confirmEnd);
    assert.doesNotMatch(confirmBody, /transitLegIdentities/);

    const declineStart = src.indexOf("const handleTransitGpsLossDecline = () => {");
    const declineEnd = src.indexOf("};", declineStart);
    const declineBody = src.slice(declineStart, declineEnd);
    assert.doesNotMatch(declineBody, /transitLegIdentities/);
  });
});
