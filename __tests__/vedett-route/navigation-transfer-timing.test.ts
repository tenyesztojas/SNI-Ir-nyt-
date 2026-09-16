// NAVIGATION — SPRINT 7.1, CURRENT/NEXT TRANSIT TRANSFER TIMING teszt.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveNavigationTransferTiming } from "../../lib/vedett-route/navigation/transferTiming.ts";
import type { TransferTimingLegLike } from "../../lib/vedett-route/navigation/transferTiming.ts";

function walk(overrides: Partial<TransferTimingLegLike> = {}): TransferTimingLegLike {
  return { mode: "WALK", realtime: false, ...overrides };
}
function transit(overrides: Partial<TransferTimingLegLike> = {}): TransferTimingLegLike {
  return { mode: "TRANSIT", realtime: false, ...overrides };
}

describe("18/19/20) current transit arrival", () => {
  test("realtime arrival -> isRealtime true, a tényleges arrivalTime-ot adja", () => {
    const legs = [transit({ arrivalTime: "2026-09-16T15:31:00Z", scheduledArrivalTime: "2026-09-16T15:29:00Z", realtime: true })];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.deepEqual(result.currentArrival, { timeIso: "2026-09-16T15:31:00Z", isRealtime: true });
  });

  test("scheduled-only arrival (nincs realtime) -> isRealtime FALSE, még ha megjelenik is az idő", () => {
    const legs = [transit({ scheduledArrivalTime: "2026-09-16T15:29:00Z", realtime: false })];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.deepEqual(result.currentArrival, { timeIso: "2026-09-16T15:29:00Z", isRealtime: false });
  });

  test("WALK aktív leg esetén currentArrival null (nincs 'jármű', amin utazna)", () => {
    const legs = [walk(), transit({ arrivalTime: "2026-09-16T15:31:00Z", realtime: true })];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.equal(result.currentArrival, null);
  });
});

describe("21/22/23) next transit departure", () => {
  test("realtime departure a WALK átszállás UTÁN -> a köztes WALK leg átugorva", () => {
    const legs = [
      transit({ arrivalTime: "2026-09-16T15:31:00Z", realtime: true }),
      walk({ toName: "Metró bejárat" } as Partial<TransferTimingLegLike>),
      transit({ departureTime: "2026-09-16T15:34:00Z", scheduledDepartureTime: "2026-09-16T15:33:00Z", realtime: true, routeShortName: "M2" }),
    ];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.deepEqual(result.nextDeparture, { timeIso: "2026-09-16T15:34:00Z", isRealtime: true, routeLabel: "M2", cancelled: false });
  });

  test("scheduled-only departure -> isRealtime false", () => {
    const legs = [transit({}), walk(), transit({ scheduledDepartureTime: "2026-09-16T15:33:00Z", realtime: false, routeLongName: "2-es villamos" })];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.deepEqual(result.nextDeparture, { timeIso: "2026-09-16T15:33:00Z", isRealtime: false, routeLabel: "2-es villamos", cancelled: false });
  });
});

describe("24/25) missing time / next transit lookup", () => {
  test("nincs semmilyen next TRANSIT leg -> nextDeparture null", () => {
    const legs = [transit({ arrivalTime: "2026-09-16T15:31:00Z", realtime: true }), walk()];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.equal(result.nextDeparture, null);
  });

  test("van next TRANSIT leg, de nincs semmilyen idő-adata -> nextDeparture null (nincs kitalálva)", () => {
    const legs = [transit({}), transit({ routeShortName: "3" })];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.equal(result.nextDeparture, null);
  });

  test("aktív leg nélkül (null index) -> mindkettő null", () => {
    const legs = [transit({ arrivalTime: "2026-09-16T15:31:00Z", realtime: true })];
    assert.deepEqual(resolveNavigationTransferTiming(legs, null), { currentArrival: null, nextDeparture: null });
  });
});

describe("26) WALK köztes leg kezelés — több egymást követő TRANSIT szakasz közötti egyetlen WALK", () => {
  test("a resolver a KÖVETKEZŐ (legközelebbi) TRANSIT leget találja meg, nem egy távolabbit", () => {
    const legs = [
      transit({}),
      walk(),
      transit({ departureTime: "2026-09-16T15:34:00Z", realtime: true, routeShortName: "M2" }),
      walk(),
      transit({ departureTime: "2026-09-16T16:00:00Z", realtime: true, routeShortName: "M4" }),
    ];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.equal(result.nextDeparture?.routeLabel, "M2");
  });
});

describe("27) ne alkalmazzon duplán delayMinutes-t", () => {
  test("a resolver kizárólag a meglévő arrivalTime/departureTime mezőt adja tovább, semmilyen aritmetikát nem végez", () => {
    const legs = [transit({ arrivalTime: "2026-09-16T15:31:00Z", realtime: true, delayMinutes: 5 } as Partial<TransferTimingLegLike> as TransferTimingLegLike)];
    const result = resolveNavigationTransferTiming(legs, 0);
    // A delayMinutes mező JELENLÉTE nem módosítja a kimeneti időt.
    assert.equal(result.currentArrival?.timeIso, "2026-09-16T15:31:00Z");
  });
});

describe("28) cancelled next leg safe behavior", () => {
  test("cancelled next TRANSIT leg -> timeIso null, de cancelled:true és routeLabel megmarad", () => {
    const legs = [transit({}), transit({ departureTime: "2026-09-16T15:34:00Z", cancelled: true, routeShortName: "M2" })];
    const result = resolveNavigationTransferTiming(legs, 0);
    assert.deepEqual(result.nextDeparture, { timeIso: null, isRealtime: false, routeLabel: "M2", cancelled: true });
  });
});

describe("kimenet-biztonság", () => {
  test("üres legs tömb, invalid index -> nincs kivétel", () => {
    assert.doesNotThrow(() => resolveNavigationTransferTiming([], 0));
    assert.doesNotThrow(() => resolveNavigationTransferTiming([transit({})], 99));
    assert.doesNotThrow(() => resolveNavigationTransferTiming([transit({})], -1));
  });
});
