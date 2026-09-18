import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REROUTE_COOLDOWN_MS,
  createInitialRerouteGuardState,
  markRerouteFinished,
  markRerouteStarted,
  resetRerouteGuard,
  shouldStartAutomaticReroute,
} from "../../lib/vedett-route/navigation/rerouteGuard.ts";

const READY = {
  navigationActive: true,
  offRouteStatus: "OFF_ROUTE" as const,
  hasCurrentPosition: true,
  hasDestination: true,
  nowMs: 100_000,
};

describe("automatic reroute guard", () => {
  test("csak megerősített OFF_ROUTE állapot indíthat automatikus újratervezést", () => {
    const state = createInitialRerouteGuardState();
    assert.equal(shouldStartAutomaticReroute(state, { ...READY, offRouteStatus: "ON_ROUTE" }).shouldReroute, false);
    assert.equal(shouldStartAutomaticReroute(state, { ...READY, offRouteStatus: "POSSIBLY_OFF_ROUTE" }).shouldReroute, false);
    assert.deepEqual(shouldStartAutomaticReroute(state, READY), { shouldReroute: true, reason: null });
  });

  test("navigáció, aktuális GPS és eredeti cél nélkül nem indul kérés", () => {
    const state = createInitialRerouteGuardState();
    assert.equal(shouldStartAutomaticReroute(state, { ...READY, navigationActive: false }).reason, "NAVIGATION_INACTIVE");
    assert.equal(shouldStartAutomaticReroute(state, { ...READY, hasCurrentPosition: false }).reason, "POSITION_MISSING");
    assert.equal(shouldStartAutomaticReroute(state, { ...READY, hasDestination: false }).reason, "DESTINATION_MISSING");
  });

  test("egy folyamatban lévő újratervezés alatt nem indul párhuzamos második kérés", () => {
    const started = markRerouteStarted(createInitialRerouteGuardState(), READY.nowMs);
    assert.equal(shouldStartAutomaticReroute(started, { ...READY, nowMs: READY.nowMs + 5_000 }).reason, "REQUEST_IN_FLIGHT");
  });

  test("befejezett kérés után cooldown védi a MOTIS-t reroute-storm ellen", () => {
    const started = markRerouteStarted(createInitialRerouteGuardState(), READY.nowMs);
    const finished = markRerouteFinished(started);
    assert.equal(
      shouldStartAutomaticReroute(finished, { ...READY, nowMs: READY.nowMs + DEFAULT_REROUTE_COOLDOWN_MS - 1 }).reason,
      "COOLDOWN_ACTIVE",
    );
    assert.equal(
      shouldStartAutomaticReroute(finished, { ...READY, nowMs: READY.nowMs + DEFAULT_REROUTE_COOLDOWN_MS }).shouldReroute,
      true,
    );
  });

  test("a cooldown felülírható, negatív érték pedig biztonságosan nullára szorul", () => {
    const finished = markRerouteFinished(markRerouteStarted(createInitialRerouteGuardState(), READY.nowMs));
    assert.equal(shouldStartAutomaticReroute(finished, { ...READY, nowMs: READY.nowMs + 999, cooldownMs: 1_000 }).shouldReroute, false);
    assert.equal(shouldStartAutomaticReroute(finished, { ...READY, nowMs: READY.nowMs, cooldownMs: -1 }).shouldReroute, true);
  });

  test("új navigációs sessionben reset után az előző cooldown nem marad beragadva", () => {
    const old = markRerouteFinished(markRerouteStarted(createInitialRerouteGuardState(), READY.nowMs));
    assert.equal(shouldStartAutomaticReroute(old, { ...READY, nowMs: READY.nowMs + 1_000 }).shouldReroute, false);
    assert.deepEqual(resetRerouteGuard(), createInitialRerouteGuardState());
    assert.equal(shouldStartAutomaticReroute(resetRerouteGuard(), { ...READY, nowMs: READY.nowMs + 1_000 }).shouldReroute, true);
  });

  // TRANSIT STATE CONTINUITY + GPS REACQUISITION SPRINT (2026-09-18) — teszt-
  // lista 3/4/10. pont: egy LOST periódus utáni, még nem stabil GPS-fix
  // (gpsReacquiring) SOSEM lehet automatikus reroute alapja, még
  // megerősített OFF_ROUTE mellett sem — FÜGGETLEN blokk, ugyanaz az elv,
  // mint transitGeometryUncertain-nél.
  test("gpsReacquiring=true blokkolja az automatikus reroute-ot, még megerősített OFF_ROUTE esetén is", () => {
    const state = createInitialRerouteGuardState();
    assert.equal(shouldStartAutomaticReroute(state, { ...READY, gpsReacquiring: true }).reason, "GPS_REACQUIRING");
  });

  test("gpsReacquiring=false (vagy hiányzó) esetén a globális OFF_ROUTE/reroute-viselkedés VÁLTOZATLAN", () => {
    const state = createInitialRerouteGuardState();
    assert.deepEqual(shouldStartAutomaticReroute(state, { ...READY, gpsReacquiring: false }), { shouldReroute: true, reason: null });
    assert.deepEqual(shouldStartAutomaticReroute(state, READY), { shouldReroute: true, reason: null });
  });

  // SPRINT 8.1 (FOREGROUND REACQUISITION, 2026-09-18) — tesztlista D. pont:
  // amíg a hívó saját foregroundReacquisition.ts állapota szerint egy
  // hidden->visible utáni recovery-ciklus folyamatban van, az automatikus
  // reroute FÜGGETLENÜL blokkolva van, még megerősített OFF_ROUTE esetén is
  // — ugyanaz az elv, mint transitGeometryUncertain/gpsReacquiring-nél.
  test("foregroundRecoveryActive=true blokkolja az automatikus reroute-ot, még megerősített OFF_ROUTE esetén is", () => {
    const state = createInitialRerouteGuardState();
    assert.equal(
      shouldStartAutomaticReroute(state, { ...READY, foregroundRecoveryActive: true }).reason,
      "FOREGROUND_REACQUISITION",
    );
  });

  test("foregroundRecoveryActive=false (vagy hiányzó) esetén a globális OFF_ROUTE/reroute-viselkedés VÁLTOZATLAN", () => {
    const state = createInitialRerouteGuardState();
    assert.deepEqual(
      shouldStartAutomaticReroute(state, { ...READY, foregroundRecoveryActive: false }),
      { shouldReroute: true, reason: null },
    );
    assert.deepEqual(shouldStartAutomaticReroute(state, READY), { shouldReroute: true, reason: null });
  });

  // SPRINT 8.1 — tesztlista K. pont: gyenge transit-geometria ÉS foreground-
  // bizonytalanság EGYSZERRE fennállása esetén sem hamis OFF_ROUTE, sem
  // auto-reroute nem indulhat — a precedencia-sorrend szerint a
  // TRANSIT_GEOMETRY_UNCERTAIN reason ér előbb (lásd shouldStartAutomaticReroute
  // precedencia: ...transitGeometryUncertain -> gpsReacquiring ->
  // foregroundRecoveryActive...), de MINDKÉT feltétel önmagában is blokkolna.
  test("transitGeometryUncertain + foregroundRecoveryActive együtt is blokkolja az automatikus reroute-ot", () => {
    const state = createInitialRerouteGuardState();
    const decision = shouldStartAutomaticReroute(state, {
      ...READY,
      transitGeometryUncertain: true,
      foregroundRecoveryActive: true,
    });
    assert.equal(decision.shouldReroute, false);
    assert.equal(decision.reason, "TRANSIT_GEOMETRY_UNCERTAIN");

    // Ha a geometria bizonytalansága önmagában megszűnne, a foreground-
    // recovery FÜGGETLEN blokkja továbbra is tartja a tiltást.
    const decisionForegroundOnly = shouldStartAutomaticReroute(state, {
      ...READY,
      transitGeometryUncertain: false,
      foregroundRecoveryActive: true,
    });
    assert.equal(decisionForegroundOnly.shouldReroute, false);
    assert.equal(decisionForegroundOnly.reason, "FOREGROUND_REACQUISITION");
  });
});
