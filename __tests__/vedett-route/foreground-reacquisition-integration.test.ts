// SPRINT 8.1 (VÉDETT ÚTVONAL FOREGROUND REACQUISITION, 2026-09-18) —
// STRUKTURÁLIS (forráskód-szintű) regressziós tesztek a tesztlista I./J.
// pontjaihoz, plusz a hálózati költségvetés (14. pont) és a
// navigáció-aktív-gate (2. pont) ellenőrzéséhez. A projekt konvenciója
// szerint (lásd navigation-gps-loss-camera-safety.test.ts,
// single-shared-map-and-current-location.test.ts) NINCS jsdom/@testing-
// library — a valódi .tsx/.ts forrást olvassuk és a KONKRÉT forma-mintákat
// ellenőrizzük assert.match/assert.doesNotMatch-csal, nem DOM-ot renderelünk.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

const mapSrc = readSource("components/vedett-utvonal/VedettUtvonalMap.tsx");
const formSrc = readSource("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const realtimeHookSrc = readSource("lib/hooks/useTransitRealtimeRefresh.ts");

describe("Sprint 8.1 — teszt I: a manuális kamera-override-ot a foreground esemény nem törli", () => {
  test("VedettUtvonalMap.tsx-ben NINCS visibilitychange listener (a kamera-override logika ettől független marad)", () => {
    assert.doesNotMatch(mapSrc, /visibilitychange/);
  });

  test("userCameraOverrideRef KIZÁRÓLAG a followMode->true váltáskor törlődik, nem foreground eseményen", () => {
    // A meglévő, 2026-09-17-es METRO GPS LOSS + MAP CAMERA SAFETY SPRINT
    // szabálya: userCameraOverrideRef.current = false KIZÁRÓLAG a
    // `if (followMode) userCameraOverrideRef.current = false;` ágban
    // fordulhat elő — ez Sprint 8.1 alatt szó szerint változatlan maradt.
    assert.match(mapSrc, /if \(followMode\) userCameraOverrideRef\.current = false;/);
    const falseAssignments = mapSrc.match(/userCameraOverrideRef\.current = false/g) ?? [];
    assert.equal(falseAssignments.length, 1, "userCameraOverrideRef csak egyetlen helyen (followMode ágban) törlődhet");
  });

  test("VedettUtvonalSearchForm.tsx foreground-wiringja SOHA nem hívja setFollowMode(true)-t (csak a felhasználó explicit gesztusa teheti)", () => {
    // A `startForegroundRecovery`/`applyForegroundRecoveryPhaseUpdate` hívási
    // helyeket tartalmazó `visibilitychange` handler és a GPS-fix-gate
    // effektek forrás-szakaszában nem szerepelhet setFollowMode(true) hívás.
    const visibilityHandlerMatch = formSrc.match(
      /const handleVisibilityChange = \(\) => \{[\s\S]*?document\.addEventListener\("visibilitychange"/,
    );
    assert.ok(visibilityHandlerMatch, "a handleVisibilityChange függvénytörzsnek megtalálhatónak kell lennie");
    assert.doesNotMatch(visibilityHandlerMatch![0], /setFollowMode\(true\)/);
  });
});

describe("Sprint 8.1 — teszt J: a realtime-refresh a MEGLÉVŐ, pontos-identitású mechanizmuson keresztül indítható foreground-on", () => {
  test("useTransitRealtimeRefresh.ts saját visibilitychange listenere VÁLTOZATLAN — nincs második, párhuzamos realtime-refresh mechanizmus", () => {
    assert.match(realtimeHookSrc, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
    assert.match(realtimeHookSrc, /if \(document\.visibilityState === "visible"\) attempt\(true\)/);
  });

  test("a realtime-refresh KIZÁRÓLAG a meglévő /api/vedett-route/realtime-refresh végpontot hívja, pontos tripId/routeId identitással", () => {
    assert.match(realtimeHookSrc, /fetch\("\/api\/vedett-route\/realtime-refresh"/);
    // Nincs második, új végpont vagy globális BKK Alerts feed-hívás bevezetve.
    assert.doesNotMatch(realtimeHookSrc, /alerts/i);
  });

  test("VedettUtvonalSearchForm.tsx nem épít második, párhuzamos foreground-realtime-refresh hívást — a foreground-wiring csak a foregroundReacquisition fázist frissíti", () => {
    assert.doesNotMatch(formSrc, /fetch\("\/api\/vedett-route\/realtime-refresh"/);
  });
});

describe("Sprint 8.1 — hálózati költségvetés (14. pont): foreground esemény nem indíthat routing-burst-öt", () => {
  test("a visibilitychange handler nem hív routing (/plan) vagy nearby-transit végpontot", () => {
    const visibilityHandlerMatch = formSrc.match(
      /const handleVisibilityChange = \(\) => \{[\s\S]*?document\.addEventListener\("visibilitychange"/,
    );
    assert.ok(visibilityHandlerMatch, "a handleVisibilityChange függvénytörzsnek megtalálhatónak kell lennie");
    assert.doesNotMatch(visibilityHandlerMatch![0], /fetch\(/);
    assert.doesNotMatch(visibilityHandlerMatch![0], /\/plan/);
    assert.doesNotMatch(visibilityHandlerMatch![0], /nearby/i);
  });
});

describe("Sprint 8.1 — teszt A/B (2. pont): foreground-reacquisition csak aktív navigáció + van megjelenített journey esetén indul", () => {
  test("a visibilitychange handler explicit navigationModeRef/hasDisplayedJourneyRef guard-dal tér ki a startForegroundRecovery hívás elől", () => {
    assert.match(
      formSrc,
      /if \(!navigationModeRef\.current \|\| !hasDisplayedJourneyRef\.current\) return;\s*\n\s*foregroundRecoveryRef\.current = startForegroundRecovery/,
    );
  });
});

describe("COMMIT ELŐTTI CÉLZOTT KORREKCIÓ (2026-09-18) — explicit hidden->visible tranzit-bizonyítás", () => {
  test("a handler previousVisibilityStateRef-fel és isGenuineForegroundTransition()-nel bizonyítja a VALÓDI hidden->visible átmenetet, nem csak a jelenlegi állapotot nézi", () => {
    assert.match(formSrc, /const previousVisibilityStateRef = useRef<DocumentVisibilityState>/);
    const visibilityHandlerMatch = formSrc.match(
      /const handleVisibilityChange = \(\) => \{[\s\S]*?document\.addEventListener\("visibilitychange"/,
    );
    assert.ok(visibilityHandlerMatch, "a handleVisibilityChange függvénytörzsnek megtalálhatónak kell lennie");
    assert.match(visibilityHandlerMatch![0], /previousVisibilityStateRef\.current = currentVisibilityState/);
    assert.match(visibilityHandlerMatch![0], /if \(!isGenuineForegroundTransition\(previousVisibilityState, currentVisibilityState\)\) return;/);
    // A meztelen `document.visibilityState !== "visible"` early-return-t
    // (ami NEM bizonyított VALÓDI hidden->visible átmenetet) a korrekció
    // eltávolította — ez a régi, hiányos guard NEM szerepelhet többé.
    assert.doesNotMatch(visibilityHandlerMatch![0], /if \(document\.visibilityState !== "visible"\) return;/);
  });
});
