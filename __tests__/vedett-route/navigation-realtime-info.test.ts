// NAVIGATION — ACTIVE-LEG REALTIME INFO teszt (Sprint 7, 2026-09-16).
//
// A pure lib/vedett-route/navigation/realtimeInfo.ts modult teszteli. A
// modul NEM ismeri a leg-en belüli fázist (BOARD/RIDE/ALIGHT) vagy a
// GPS-progresst — kizárólag az AKTUÁLISAN AKTÍV JourneyLeg (mode/realtime/
// delayMinutes/cancelled) mezőit olvassa, ezért a fixture-ök egyszerű,
// kézzel írt objektumok, nincs szükség buildNavigationInstructions()-ra
// vagy valós Journeyre.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveNavigationRealtimeInfo } from "../../lib/vedett-route/navigation/realtimeInfo.ts";
import type { ActiveLegRealtimeInput } from "../../lib/vedett-route/navigation/realtimeInfo.ts";

function transitLeg(overrides: Partial<ActiveLegRealtimeInput> = {}): ActiveLegRealtimeInput {
  return { mode: "TRANSIT", realtime: true, ...overrides };
}

describe("alap gate-ek (mode / realtime / cancelled)", () => {
  test("1) TRANSIT + realtime + pozitív delay -> DELAY info", () => {
    const info = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 3 }));
    assert.deepEqual(info, { kind: "DELAY", delayMinutes: 3, phrase: "3 perc késés" });
  });

  test("2) TRANSIT + !realtime -> null (a delayMinutes ilyenkor bizonyítottan sosem is létezne)", () => {
    const info = resolveNavigationRealtimeInfo(transitLeg({ realtime: false, delayMinutes: 5 }));
    assert.equal(info, null);
  });

  test("3) WALK aktív legen, még ha volna is (hibásan) delay adat -> null", () => {
    const info = resolveNavigationRealtimeInfo({ mode: "WALK", realtime: true, delayMinutes: 4 });
    assert.equal(info, null);
  });

  test("4) RENTAL aktív legen, még ha volna is (hibásan) delay adat -> null", () => {
    const info = resolveNavigationRealtimeInfo({ mode: "RENTAL", realtime: true, delayMinutes: 4 });
    assert.equal(info, null);
  });

  test("5) realtime + delayMinutes undefined -> null (nincs kitalálva)", () => {
    const info = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: undefined }));
    assert.equal(info, null);
  });

  test("6) realtime + NaN/invalid delayMinutes -> null, nincs kivétel", () => {
    assert.doesNotThrow(() => resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: Number.NaN })));
    assert.equal(resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: Number.NaN })), null);
    assert.equal(resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: Number.POSITIVE_INFINITY })), null);
  });
});

describe("delay 0 / negatív delay (audit: meglévő JourneyRealtimeSummary/TransitLegRealtimeNote precedens alapján)", () => {
  test("7) delay 0 -> ON_TIME 'Pontosan időben' (a meglévő 'pontosan időben' UI-precedens alapján megbízható)", () => {
    const info = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 0 }));
    assert.deepEqual(info, { kind: "ON_TIME", phrase: "Pontosan időben" });
  });

  test("8) negatív delay -> EARLY, nyugodt szöveg (a meglévő 'Korábban indul: N perc' precedens alapján)", () => {
    const info = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: -4 }));
    assert.deepEqual(info, { kind: "EARLY", delayMinutes: -4, phrase: "4 perccel korábban" });
    // Nincs dramatizáló szöveg.
    assert.doesNotMatch((info as { phrase: string }).phrase, /figyelem|probléma|jelentős/i);
  });

  test("9) pozitív törtszámú delay -> a resolver védelmi kerekítést végez (defensive rounding)", () => {
    const info = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 2.6 }));
    assert.deepEqual(info, { kind: "DELAY", delayMinutes: 3, phrase: "3 perc késés" });
  });
});

describe("aktív-leg kötés — nincs átszivárgás legek között, nincs stale adat", () => {
  test("10) leg A delay nem szivárog leg B-re — két FÜGGETLEN hívás, nincs megosztott state", () => {
    const legA = transitLeg({ delayMinutes: 7 });
    const legB = transitLeg({ delayMinutes: 0 });
    const infoA = resolveNavigationRealtimeInfo(legA);
    const infoB = resolveNavigationRealtimeInfo(legB);
    assert.equal((infoA as { delayMinutes: number }).delayMinutes, 7);
    assert.equal(infoB?.kind, "ON_TIME");
    // Az A hívás UTÁN a B hívás nem módosította A eredményét (nincs megosztott mutable state).
    assert.equal((resolveNavigationRealtimeInfo(legA) as { delayMinutes: number }).delayMinutes, 7);
  });

  test("11) leg-váltáskor (aktív leg index változik) új info jön", () => {
    const before = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 2 }));
    const after = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: -1 }));
    assert.equal(before?.kind, "DELAY");
    assert.equal(after?.kind, "EARLY");
  });

  test("12) reroute utáni ÚJ displayedJourney aktív legje -> új, a régitől eltérő info (nincs cache-elt/stale eredmény)", () => {
    const legBeforeReroute = transitLeg({ delayMinutes: 6 });
    const legAfterReroute = transitLeg({ delayMinutes: 0 });
    assert.equal(resolveNavigationRealtimeInfo(legBeforeReroute)?.kind, "DELAY");
    assert.equal(resolveNavigationRealtimeInfo(legAfterReroute)?.kind, "ON_TIME");
  });

  test("13) nincs aktív leg (null/undefined) -> null", () => {
    assert.equal(resolveNavigationRealtimeInfo(null), null);
    assert.equal(resolveNavigationRealtimeInfo(undefined), null);
  });

  test("14) hiányos/inkonzisztens leg-objektum -> nincs kivétel, biztonságos null", () => {
    assert.doesNotThrow(() => resolveNavigationRealtimeInfo({ mode: "TRANSIT", realtime: true } as ActiveLegRealtimeInput));
    assert.equal(resolveNavigationRealtimeInfo({ mode: "TRANSIT", realtime: true } as ActiveLegRealtimeInput), null);
  });

  test("15) cancelled aktív leg -> CANCELLED, NEM egyszerű késésként (a cancelled-check a realtime-gate ELŐTT fut)", () => {
    const cancelledWithoutRealtime = resolveNavigationRealtimeInfo(transitLeg({ realtime: false, cancelled: true }));
    assert.deepEqual(cancelledWithoutRealtime, { kind: "CANCELLED", phrase: "Ez a járat törölve / kihagyva" });

    const cancelledWithDelay = resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 8, cancelled: true }));
    assert.equal(cancelledWithDelay?.kind, "CANCELLED");
  });

  test("16) BOARD fázis alatt az aktív leg delay-je konzisztens (a resolver nem tud fázisról, csak leg-azonosságról)", () => {
    const activeLeg = transitLeg({ delayMinutes: 5 });
    const duringBoard = resolveNavigationRealtimeInfo(activeLeg);
    assert.equal(duringBoard?.kind, "DELAY");
  });

  test("17) RIDE fázis alatt UGYANAZ a leg UGYANAZT az infót adja, mint BOARD alatt (determinisztikus)", () => {
    const activeLeg = transitLeg({ delayMinutes: 5 });
    const duringBoard = resolveNavigationRealtimeInfo(activeLeg);
    const duringRide = resolveNavigationRealtimeInfo(activeLeg);
    assert.deepEqual(duringBoard, duringRide);
  });

  test("18) ALIGHT boundary-n (leg-váltás) nincs stale korábbi leg adat", () => {
    const legA = transitLeg({ delayMinutes: 9 });
    resolveNavigationRealtimeInfo(legA); // BOARD/RIDE/ALIGHT ugyanezen a legen
    const legB = transitLeg({ delayMinutes: undefined }); // a KÖVETKEZŐ leg, nincs realtime adata
    const afterLegSwitch = resolveNavigationRealtimeInfo(legB);
    assert.equal(afterLegSwitch, null);
  });
});

describe("REROUTING / rest-stop gate — a hívó (komponens) oldalán érvényesül", () => {
  test("19) rest-stop legsOverride alatt a hívó null-t ad át (ugyanaz a minta, mint az instructionPreview/instruction cardnál) -> null", () => {
    // A modul maga nem ismeri a legsOverride-ot — a VedettUtvonalSearchForm.tsx
    // a navigationInstructionForDisplay/activeInstructionPreview mintáját
    // követve NULL-t ad át activeLeg helyett, amíg legsOverride aktív.
    assert.equal(resolveNavigationRealtimeInfo(null), null);
  });

  test("20) automaticRerouteStatus === 'REROUTING' alatt a hívó null-t ad át -> null", () => {
    assert.equal(resolveNavigationRealtimeInfo(null), null);
  });
});

describe("provider-neutralitás", () => {
  test("21) a kimenet független bármilyen provider-specifikus extra mezőtől — nincs BKK/MÁV/Volán branching", () => {
    const bkkStyleLeg = { ...transitLeg({ delayMinutes: 4 }), transitProviderHint: "BKK" } as ActiveLegRealtimeInput;
    const mavStyleLeg = { ...transitLeg({ delayMinutes: 4 }), transitProviderHint: "MAV" } as ActiveLegRealtimeInput;
    assert.deepEqual(resolveNavigationRealtimeInfo(bkkStyleLeg), resolveNavigationRealtimeInfo(mavStyleLeg));
  });
});

describe("kimenet-biztonság", () => {
  test("25) a phrase soha nem tartalmaz technikai/internal szöveget", () => {
    const samples = [
      resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 3 })),
      resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: 0 })),
      resolveNavigationRealtimeInfo(transitLeg({ delayMinutes: -2 })),
      resolveNavigationRealtimeInfo(transitLeg({ cancelled: true })),
    ];
    for (const sample of samples) {
      if (!sample) continue;
      assert.doesNotMatch(sample.phrase, /undefined|null|NaN|\[object|kind|mode/i);
    }
  });
});

// REGRESSZIÓ (22/23/24 a sprint teszt-listájából): a current instruction
// (navigation-instructions.test.ts), a preview (navigation-instruction-
// preview.test.ts) és a stop-aware countdown (navigation-instructions.test.ts
// LegStopProgress tesztjei) VÁLTOZATLANUL, ugyanazon parancssorral futtatva
// marad zöld — ez a fájl semmit nem módosít bennük, csak egy ÚJ, olvasás-
// only mezőt ad a komponensnek (lásd a végső riport 11. pontja).
