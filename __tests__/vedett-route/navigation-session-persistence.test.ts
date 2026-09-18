// VÉDETT ÚTVONAL — SPRINT 8.2 (NAVIGATION SESSION PERSISTENCE, 2026-09-18).
//
// A pure lib/vedett-route/navigation/navigationSessionPersistence.ts modult
// teszteli (serialize/validate/save/load/clear/TTL/schema), plusz a
// rerouteGuard.ts-be bevezetett restoreRecoveryActive blokkoló feltétel
// kompozícióját a MEGLÉVŐ foregroundReacquisition.ts fázis-modullal, hogy a
// "restore + nincs stabil fresh GPS => auto-reroute BLOCKED, majd stabil
// fresh GPS után feloldható" viselkedést a VALÓS pipeline-elemekkel
// bizonyítsa, ne csak elszigetelt fixture-ökkel.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NAVIGATION_SESSION_SCHEMA_VERSION,
  NAVIGATION_SESSION_TTL_MS,
  NAVIGATION_SESSION_STORAGE_KEY,
  serializeNavigationSession,
  isValidPersistedNavigationSession,
  sanitizeRestoredJourney,
  deriveDestinationFromJourney,
  saveNavigationSession,
  loadNavigationSession,
  clearNavigationSession,
} from "../../lib/vedett-route/navigation/navigationSessionPersistence.ts";
import {
  createInitialForegroundRecoveryState,
  startForegroundRecovery,
  updateForegroundRecoveryPhase,
  isForegroundRecoveryActive,
} from "../../lib/vedett-route/navigation/foregroundReacquisition.ts";
import { createInitialRerouteGuardState, shouldStartAutomaticReroute } from "../../lib/vedett-route/navigation/rerouteGuard.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

// --- in-memory localStorage polyfill (a node:test környezetben nincs DOM) ---
function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}
(globalThis as unknown as { window: { localStorage: ReturnType<typeof createMemoryStorage> } }).window = {
  localStorage: createMemoryStorage(),
};

function makeJourney(overrides: Partial<Journey> = {}): Journey {
  return {
    totalDurationMinutes: 30,
    departureTime: "2026-09-18T10:00:00Z",
    arrivalTime: "2026-09-18T10:30:00Z",
    walkingMinutes: 5,
    waitingMinutes: 2,
    transfers: 1,
    realtimeAvailable: true,
    fingerprint: "journey-abc",
    alerts: [],
    legs: [
      { mode: "WALK", fromName: "Otthon", toName: "Déli vasútút", durationMinutes: 5 },
      {
        mode: "TRANSIT",
        fromName: "Déli vasútút",
        toName: "Kossuth Lajos tér",
        durationMinutes: 20,
        realtime: true,
        delayMinutes: 3,
        cancelled: false,
        tripId: "trip-1",
        routeId: "route-M2",
        fromStopId: "stop-deli",
        toStopId: "stop-kossuth",
        toLat: 47.5074,
        toLon: 19.0459,
      },
    ],
    ...overrides,
  } as Journey;
}

describe("navigationSessionPersistence — serialize/validate (pure)", () => {
  test("1) valid active session serialize + isValidPersistedNavigationSession elfogadja", () => {
    const journey = makeJourney();
    const nowMs = 1_000_000;
    const session = serializeNavigationSession({
      destination: deriveDestinationFromJourney(journey),
      displayedJourney: journey,
      nowMs,
    });
    assert.equal(session.schemaVersion, NAVIGATION_SESSION_SCHEMA_VERSION);
    assert.equal(session.navigationActive, true);
    assert.equal(isValidPersistedNavigationSession(session, nowMs + 1_000), true);
  });

  test("2) lejárt (TTL-en túli) session elutasítva", () => {
    const journey = makeJourney();
    const session = serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs: 0 });
    assert.equal(isValidPersistedNavigationSession(session, NAVIGATION_SESSION_TTL_MS + 1), false);
    assert.equal(isValidPersistedNavigationSession(session, NAVIGATION_SESSION_TTL_MS - 1), true);
  });

  test("3) rossz schemaVersion elutasítva", () => {
    const journey = makeJourney();
    const session = serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs: 0 });
    const corrupted = { ...session, schemaVersion: 2 };
    assert.equal(isValidPersistedNavigationSession(corrupted, 0), false);
  });

  test("5) navigationActive !== true esetén elutasítva", () => {
    const journey = makeJourney();
    const session = serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs: 0 });
    const corrupted = { ...session, navigationActive: false };
    assert.equal(isValidPersistedNavigationSession(corrupted, 0), false);
  });

  test("6) hiányzó/érvénytelen kötelező journey-struktúra elutasítva", () => {
    const journey = makeJourney();
    const session = serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs: 0 });
    assert.equal(isValidPersistedNavigationSession({ ...session, displayedJourney: { legs: [] } }, 0), false);
    assert.equal(isValidPersistedNavigationSession({ ...session, displayedJourney: null }, 0), false);
    assert.equal(isValidPersistedNavigationSession({ ...session, destination: { latitude: "not-a-number" } }, 0), false);
    assert.equal(isValidPersistedNavigationSession({ ...session, savedAt: "not-a-number" }, 0), false);
  });

  test("8) sanitizeRestoredJourney: realtime/delay/cancelled mezők konzervatív alapállapotra állnak, az identitás (tripId/routeId/fromStopId/toStopId/fromName/toName) VÁLTOZATLAN", () => {
    const journey = makeJourney();
    const sanitized = sanitizeRestoredJourney(journey);
    assert.equal(sanitized.realTime, false);
    assert.equal(sanitized.cancelled, false);
    assert.equal(sanitized.realtimeAvailable, false);
    assert.equal(sanitized.legs[1].realtime, false);
    assert.equal(sanitized.legs[1].delayMinutes, undefined);
    assert.equal(sanitized.legs[1].cancelled, false);
    // Identitás — a realtime-refresh pontos párosításához SZÜKSÉGES mezők — érintetlen.
    assert.equal(sanitized.legs[1].tripId, "trip-1");
    assert.equal(sanitized.legs[1].routeId, "route-M2");
    assert.equal(sanitized.legs[1].fromStopId, "stop-deli");
    assert.equal(sanitized.legs[1].toStopId, "stop-kossuth");
    assert.equal(sanitized.legs[1].fromName, "Déli vasútút");
    assert.equal(sanitized.legs[1].toName, "Kossuth Lajos tér");
    assert.equal(sanitized.fingerprint, journey.fingerprint);
  });

  test("12) sanitizeRestoredJourney SOHA nem hoz létre új leget/journey-t — a legek száma és sorrendje byte-ra megegyezik", () => {
    const journey = makeJourney();
    const sanitized = sanitizeRestoredJourney(journey);
    assert.equal(sanitized.legs.length, journey.legs.length);
    assert.deepEqual(sanitized.legs.map((l) => l.fromName), journey.legs.map((l) => l.fromName));
    assert.deepEqual(sanitized.legs.map((l) => l.toName), journey.legs.map((l) => l.toName));
  });
});

describe("navigationSessionPersistence — save/load/clear (in-memory localStorage polyfill)", () => {
  beforeEach(() => {
    clearNavigationSession();
  });

  test("1) save majd load ugyanazt az érvényes sessiont adja vissza", () => {
    const journey = makeJourney();
    const nowMs = 5_000_000;
    const session = serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs });
    saveNavigationSession(session);
    const loaded = loadNavigationSession(nowMs + 1_000);
    assert.deepEqual(loaded, session);
  });

  test("4) corrupt JSON esetén load() null-t ad és NEM crashel", () => {
    (globalThis as unknown as { window: { localStorage: ReturnType<typeof createMemoryStorage> } }).window.localStorage.setItem(
      NAVIGATION_SESSION_STORAGE_KEY,
      "{not valid json",
    );
    assert.doesNotThrow(() => {
      const loaded = loadNavigationSession(Date.now());
      assert.equal(loaded, null);
    });
  });

  test("7) clearNavigationSession() után load() null-t ad", () => {
    const journey = makeJourney();
    const nowMs = 5_000_000;
    saveNavigationSession(serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs }));
    clearNavigationSession();
    assert.equal(loadNavigationSession(nowMs + 1), null);
  });

  test("2b) lejárt persisted session load()-kor null-t ad ÉS törli magát (a storage-ban nem marad benne)", () => {
    const journey = makeJourney();
    const nowMs = 0;
    saveNavigationSession(serializeNavigationSession({ destination: deriveDestinationFromJourney(journey), displayedJourney: journey, nowMs }));
    const farFuture = nowMs + NAVIGATION_SESSION_TTL_MS + 1;
    assert.equal(loadNavigationSession(farFuture), null);
    // A hibás/lejárt bejegyzést a fail-closed szabály szerint töröltük — egy
    // közvetlen getItem is null-t ad.
    assert.equal(
      (globalThis as unknown as { window: { localStorage: ReturnType<typeof createMemoryStorage> } }).window.localStorage.getItem(
        NAVIGATION_SESSION_STORAGE_KEY,
      ),
      null,
    );
  });
});

describe("SPRINT 8.2 — restoreRecoveryActive a MEGLÉVŐ rerouteGuard.ts-ben + foregroundReacquisition.ts fázis-modullal (teszt 9/10)", () => {
  const READY = {
    navigationActive: true,
    offRouteStatus: "OFF_ROUTE" as const,
    hasCurrentPosition: true,
    hasDestination: true,
    nowMs: 100_000,
  };

  test("9) restore után, amíg a restore-recovery WAITING_FOR_FRESH_GPS/REACQUIRING fázisban van, az automatikus reroute BLOKKOLT (RESTORE_RECOVERY_ACTIVE)", () => {
    let recovery = createInitialForegroundRecoveryState();
    recovery = startForegroundRecovery(recovery); // restore -> WAITING_FOR_FRESH_GPS
    const guardState = createInitialRerouteGuardState();
    const decision = shouldStartAutomaticReroute(guardState, {
      ...READY,
      restoreRecoveryActive: isForegroundRecoveryActive(recovery.phase),
    });
    assert.equal(decision.shouldReroute, false);
    assert.equal(decision.reason, "RESTORE_RECOVERY_ACTIVE");
  });

  test("10) stabil, friss GPS (a MEGLÉVŐ gpsFixGate-hiszterézist tükröző updateForegroundRecoveryPhase szerint STABLE) után a restore-recovery blokk feloldódik", () => {
    let recovery = createInitialForegroundRecoveryState();
    recovery = startForegroundRecovery(recovery);
    recovery = updateForegroundRecoveryPhase(recovery, { usable: true, reacquiring: true }); // REACQUIRING
    recovery = updateForegroundRecoveryPhase(recovery, { usable: true, reacquiring: false }); // STABLE (elég GOOD fix után)
    assert.equal(recovery.phase, "STABLE");

    const guardState = createInitialRerouteGuardState();
    const decision = shouldStartAutomaticReroute(guardState, {
      ...READY,
      restoreRecoveryActive: isForegroundRecoveryActive(recovery.phase),
    });
    assert.deepEqual(decision, { shouldReroute: true, reason: null });
  });
});

describe("SPRINT 8.2 — kötelező regressziós tesztek 11/12 (source-contract, ahol a pure teszt nem elég)", () => {
  const formSrc = readFileSync("components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "utf8");

  test("11) explicit navigáció-leállítás (stopNavigation és az isOpen-cleanup effekt) törli a persisted sessiont", () => {
    const stopNavigationMatch = formSrc.match(/const stopNavigation = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(stopNavigationMatch, "a stopNavigation függvénytörzsnek megtalálhatónak kell lennie");
    assert.match(stopNavigationMatch![0], /clearNavigationSession\(\);/);

    const cleanupEffectMatch = formSrc.match(/if \(!isOpen && navigationMode\) \{[\s\S]*?\n {4}\}/);
    assert.ok(cleanupEffectMatch, "az isOpen-cleanup effekt törzsének megtalálhatónak kell lennie");
    assert.match(cleanupEffectMatch![0], /clearNavigationSession\(\);/);
  });

  test("12) a restore-effekt + restorePersistedNavigation() SOHA nem hív routing (/plan) vagy más journey-létrehozó hívást — kizárólag a persisted displayedJourney-t (sanitizálva) állítja vissza", () => {
    // COMMIT ELŐTTI KORREKCIÓ (2026-09-18) — a mount-effekt maga már csak
    // validál és a restorePersistedNavigation() explicit helperre bízza a
    // tényleges restore-t (lásd navigation-mode.test.ts) — a kontraktus
    // (nincs /plan, nincs fetch, a displayedJourney-t sanitizálva állítja
    // vissza) ezért mindkét blokkra vonatkozik.
    const mountEffectMatch = formSrc.match(
      /const persisted = loadNavigationSession\(Date\.now\(\)\);[\s\S]*?restorePersistedNavigation\(persisted\);/,
    );
    const restoreHelperMatch = formSrc.match(
      /const restorePersistedNavigation = \(persisted: PersistedNavigationSession\) => \{[\s\S]*?\n {2}\};/,
    );
    assert.ok(mountEffectMatch, "a restore mount-effekt törzsének megtalálhatónak kell lennie");
    assert.ok(restoreHelperMatch, "a restorePersistedNavigation() törzsének megtalálhatónak kell lennie");
    const combined = mountEffectMatch![0] + restoreHelperMatch![0];
    assert.doesNotMatch(combined, /fetch\(/);
    assert.doesNotMatch(combined, /\/plan/);
    assert.match(restoreHelperMatch![0], /setDisplayedJourney\(sanitizeRestoredJourney\(persisted\.displayedJourney\)\)/);
  });
});
