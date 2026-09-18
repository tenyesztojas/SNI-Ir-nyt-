// VÉDETT ÚTVONAL — SPRINT 8.4B (LIVE ALTERNATIVE RUNTIME INTEGRATION,
// 2026-09-18). Forrás-contract tesztek a VedettUtvonalSearchForm.tsx
// RankedJourneyCard bekötésére — nincs jsdom/React-render a repóban, ezért
// (ugyanaz a projekt-konvenció, mint a korábbi navigation-mode.test.ts-nél)
// PONTOS handler-testeket extraháló regexekkel bizonyítjuk a kötelező
// invariánsokat, NEM ad-hoc string-keresésekkel.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "components",
  "vedett-utvonal",
  "VedettUtvonalSearchForm.tsx"
);
const source = readFileSync(SOURCE_PATH, "utf-8");

function extractBetween(startMarker: string, endMarker: string): string {
  const startIdx = source.indexOf(startMarker);
  assert.notEqual(startIdx, -1, `startMarker nem található: ${startMarker}`);
  const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
  assert.notEqual(endIdx, -1, `endMarker nem található: ${endMarker}`);
  return source.slice(startIdx, endIdx);
}

const maybeStartBody = extractBetween(
  "const maybeStartLiveAlternativeSearch = async",
  "const handleLiveAlternativeDecline = ()"
);
const declineBody = extractBetween(
  "const handleLiveAlternativeDecline = ()",
  "const handleLiveAlternativeAccept = ()"
);
const acceptBody = extractBetween(
  "const handleLiveAlternativeAccept = ()",
  "useTransitRealtimeRefresh({"
);
const onUpdatesBody = extractBetween("onUpdates: (updates) => {", "  });");

describe("Live Alternative runtime — network invariánsok (17. pont)", () => {
  test("1) a keresés a MEGLÉVŐ multi-candidate planning endpointot hívja, NEM a /rest-stops/resume-ot", () => {
    assert.match(maybeStartBody, /fetch\("\/api\/admin\/vedett-utvonal\/search"/);
    assert.doesNotMatch(maybeStartBody, /rest-stops\/resume/);
  });

  test("2) a böngésző SOHA nem hív közvetlenül MOTIS-t (nincs motis/localhost-szerű URL a hívásban)", () => {
    assert.doesNotMatch(maybeStartBody, /motis/i);
  });

  test("3) nincs ÚJ setInterval/poller bevezetve a Live Alternative bekötéshez", () => {
    assert.doesNotMatch(maybeStartBody, /setInterval/);
    assert.doesNotMatch(onUpdatesBody, /setInterval/);
  });

  test("4) a guard MINDEN kötelező bemenetet megkap (navigationActive, offRoute, GPS, recovery, destination)", () => {
    for (const field of [
      "navigationActive: navigationMode",
      'offRouteConfirmed: routeProgress.offRouteStatus === "OFF_ROUTE"',
      "gpsReliable: currentPosition !== null && gpsFixUsable && !gpsReacquiring",
      "foregroundRecoveryActive: isForegroundRecoveryActive(foregroundRecoveryPhase)",
      "restoreRecoveryActive: isForegroundRecoveryActive(restoreRecoveryPhase)",
      "hasDestination: originalDestination !== null",
    ]) {
      assert.ok(maybeStartBody.includes(field), `hiányzó guard bemenet: ${field}`);
    }
  });

  test("5) sikertelen guard-döntés esetén a függvény korán visszatér, NINCS fetch", () => {
    assert.match(maybeStartBody, /if \(!decision\.shouldSearch \|\| !currentPosition \|\| !originalDestination\) return;/);
  });
});

describe("Live Alternative runtime — SIGNIFICANT_REALTIME_DEGRADATION trigger (5. pont)", () => {
  test("6) a degradation-kiértékelés a MEGLÉVŐ realtime-refresh onUpdates callbackben történik, ÚJ poller nélkül", () => {
    assert.match(onUpdatesBody, /evaluateRealtimeDegradation\(buildRealtimeDegradationSamples\(displayedJourney, updates\)\)/);
  });

  test("7) a search KIZÁRÓLAG jelentős romlás esetén indul (degradation.degraded gate)", () => {
    assert.match(onUpdatesBody, /if \(degradation\.degraded && degradation\.worstLegTripId\) \{/);
  });

  test("8) az esemény-identitás stabil (tripId-hez kötött) — ugyanaz a romlás nem generál minden ciklusban új eventId-t", () => {
    assert.match(onUpdatesBody, /eventId: `degradation:\$\{degradation\.worstLegTripId\}`/);
  });

  test("9) a merge (mergeRealtimeUpdates) VÁLTOZATLAN marad — a degradation-check NEM helyettesíti azt", () => {
    assert.match(onUpdatesBody, /setDisplayedJourney\(\(prev\) => mergeRealtimeUpdates\(prev, updates\)\)/);
  });
});

describe("Live Alternative runtime — displayedJourney csere KIZÁRÓLAG az explicit accept handlerben (10/12. pont)", () => {
  test("10) a candidate journey KIZÁRÓLAG handleLiveAlternativeAccept-ben kerül displayedJourney-be", () => {
    assert.match(acceptBody, /setDisplayedJourney\(accepted\.acceptedJourney\)/);
  });

  test("11) 'Megnézem'/preview megnyitás NEM cserél journey-t (maybeStart/preview-toggle nem hív setDisplayedJourney-t)", () => {
    assert.doesNotMatch(maybeStartBody, /setDisplayedJourney\(/);
  });

  test("12) decline handler NEM cserél journey-t és NEM indít network requestet", () => {
    assert.doesNotMatch(declineBody, /setDisplayedJourney\(/);
    assert.doesNotMatch(declineBody, /fetch\(/);
  });

  test("13) accept handler stale-session esetén NEM cseréli a journey-t (generation check setDisplayedJourney ELŐTT)", () => {
    const staleCheckIdx = acceptBody.indexOf("liveAlternativeOffer.sessionGeneration !== rerouteSessionRef.current");
    const replaceIdx = acceptBody.indexOf("setDisplayedJourney(accepted.acceptedJourney)");
    assert.notEqual(staleCheckIdx, -1);
    assert.notEqual(replaceIdx, -1);
    assert.ok(staleCheckIdx < replaceIdx, "a stale-session ellenőrzésnek a journey-csere ELŐTT kell futnia");
  });

  test("14) accept handler bumpolja a navigation sessiont, de NEM indít új navigationMode-ot/geo-t", () => {
    assert.match(acceptBody, /bumpNavigationSession\(\);/);
    assert.doesNotMatch(acceptBody, /setNavigationMode\(true\)/);
    assert.doesNotMatch(acceptBody, /startNavigation\(\)/);
    assert.doesNotMatch(acceptBody, /geo\.startWatching\(\)/);
  });

  test("15) elfogadás CSAK OFFERED állapotból lehetséges (a pure acceptLiveAlternativeOffer() hívásán keresztül, nincs duplikált state-check)", () => {
    assert.match(acceptBody, /const accepted = acceptLiveAlternativeOffer\(liveAlternativeOffer\);/);
    assert.match(acceptBody, /if \(!accepted\) return;/);
  });
});

describe("Live Alternative runtime — UI accessibility (16. pont)", () => {
  test("16) valódi <button type=\"button\"> elemek, nincs autoFocus/modal", () => {
    const uiBlockStart = source.indexOf("LIVE ALTERNATIVE — SPRINT 8.4B (2026-09-18). KIZÁRÓLAG OFFERED");
    assert.notEqual(uiBlockStart, -1);
    const uiBlock = source.slice(uiBlockStart, uiBlockStart + 4000);
    assert.match(uiBlock, /<button\s+type="button"/);
    assert.doesNotMatch(uiBlock, /autoFocus/);
    assert.doesNotMatch(uiBlock, /role="dialog"/);
  });
});
