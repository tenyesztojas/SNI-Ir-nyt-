// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — a React-
// orchestrationt (VedettUtvonalSearchForm.tsx) a projekt MEGLÉVŐ
// konvenciója szerint forráskód-szintű, strukturális tesztekkel fedjük
// (nincs jsdom/@testing-library) — a pure döntési logikát (mikor kell
// kérdezni, milyen szöveggel) a transit-gps-loss-confirmation.test.ts MÁR
// valódi, viselkedés-alapú unit tesztekkel fedi.

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
    assert.match(
      src,
      /const transitGpsLossConfirmationVisible =\s*transitGpsLossConfirmation\.pending &&\s*\(automaticRerouteDecision\.shouldReroute \|\|\s*automaticRerouteDecision\.reason === "TRANSIT_GPS_LOSS_AWAITING_CONFIRMATION"\);/,
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

  test("a kérdés szövege transitGpsLossQuestionText()-ből jön (nem hardcode-olt duplikátum)", () => {
    assert.match(src, /\{transitGpsLossQuestionText\(transitGpsLossConfirmation\.transitMode\)\}/);
    assert.match(src, /A helyzeted egy ideig nem volt elérhető\./);
  });

  test("a kártya valódi <button type=\"button\"> Igen/Nem elemeket használ, nincs modal/autoFocus", () => {
    assert.match(src, /<button type="button" onClick=\{handleTransitGpsLossConfirm\}[^>]*>\s*Igen\s*<\/button>/);
    assert.match(src, /<button type="button" onClick=\{handleTransitGpsLossDecline\}[^>]*>\s*Nem\s*<\/button>/);
    assert.doesNotMatch(src, /autoFocus/);
  });
});

describe("4) IGEN — original journey preserved, no /plan", () => {
  test("handleTransitGpsLossConfirm NEM hív setDisplayedJourney-t és NEM indít fetch-et — kizárólag a pending/guard/OFF_ROUTE-evidence állapotot törli", () => {
    const startIdx = src.indexOf("const handleTransitGpsLossConfirm = () => {");
    const endIdx = src.indexOf("};", startIdx);
    assert.ok(startIdx > 0 && endIdx > startIdx, "handleTransitGpsLossConfirm megtalálható");
    const body = src.slice(startIdx, endIdx);
    assert.doesNotMatch(body, /setDisplayedJourney/);
    assert.doesNotMatch(body, /fetch\(/);
    assert.match(body, /resolveTransitGpsLossConfirmation\(\)/);
    assert.match(body, /setRouteProgressResetToken\(\(token\) => token \+ 1\)/);
  });
});

describe("5) NEM — reroute exactly once (a MEGLÉVŐ, egyetlen reroute-effekten keresztül, nincs második fetch-kódút)", () => {
  test("handleTransitGpsLossDecline KIZÁRÓLAG a pending jelzőt törli — a tényleges reroute-ot a MEGLÉVŐ automatikus reroute-effekt indítja a KÖVETKEZŐ rendernél", () => {
    const startIdx = src.indexOf("const handleTransitGpsLossDecline = () => {");
    const endIdx = src.indexOf("};", startIdx);
    assert.ok(startIdx > 0 && endIdx > startIdx, "handleTransitGpsLossDecline megtalálható");
    const body = src.slice(startIdx, endIdx);
    assert.doesNotMatch(body, /fetch\(/);
    assert.match(body, /resolveTransitGpsLossConfirmation\(\)/);
  });

  test("a reroute-effekt hívásában szerepel a transitGpsLossAwaitingConfirmation bemenet ÉS a pending a függőség-listában — 'Nem' válasz újra futtatja az effektet", () => {
    assert.match(src, /transitGpsLossAwaitingConfirmation:\s*transitGpsLossConfirmation\.pending,/);
    assert.match(src, /transitGpsLossConfirmation\.pending,\s*\]\);/);
  });

  test("csak EGYETLEN /api/vedett-route/rest-stops/resume hívási hely van a fájlban (nincs duplikált fetch-kódút a 'Nem' válaszhoz)", () => {
    const matches = src.match(/\/api\/vedett-route\/rest-stops\/resume/g) ?? [];
    assert.equal(matches.length, 1, "az automatikus reroute POST endpointjának EGYETLEN hivatkozása lehet a fájlban");
  });
});

describe("6) normál GPS recovery — nincs confirmation (csendes auto-clear, a MEGLÉVŐ jelzőkből)", () => {
  test("egy külön effekt hívja shouldAutoClearTransitGpsLossConfirmation-t a MEGLÉVŐ gpsFixUsable/gpsReacquiring/routeProgress.offRouteStatus jelzőkkel — nincs új GPS-állapotgép", () => {
    assert.match(
      src,
      /shouldAutoClearTransitGpsLossConfirmation\(\s*transitGpsLossConfirmation\.pending,\s*gpsFixUsable,\s*gpsReacquiring,\s*routeProgress\.offRouteStatus,\s*\)/,
    );
  });
});

describe("1/3) a LOST-detektálás a MEGLÉVŐ classifyGpsQuality-ből és a BOARDED/BOARDED_UNCERTAIN_GEOMETRY fázisból dolgozik", () => {
  test("registerTransitGpsLossIfNeeded mindkét GPS-tick effektben meghívódik (friss fix + 5 mp-es fallback-poll) — nincs duplikált logika", () => {
    const matches = src.match(/registerTransitGpsLossIfNeeded\(result\);/g) ?? [];
    assert.equal(matches.length, 2, "mindkét GPS-tick effektnek hívnia kell — a friss fixnek ÉS az 5 mp-es interval-pollnak is");
  });

  test("activeBoardedTransitModeRef KIZÁRÓLAG akkor kap transitMode-ot, ha a leg TRANSIT ÉS isBoardedPhase — WALK legen sosem", () => {
    assert.match(
      src,
      /activeBoardedTransitModeRef\.current =\s*activeLeg\?\.mode === "TRANSIT" && isBoardedPhase \? activeLeg\.transitMode \?\? null : null;/,
    );
  });
});
