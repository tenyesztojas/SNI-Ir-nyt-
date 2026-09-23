// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — pure,
// viselkedés-alapú tesztek transitGpsLossConfirmation.ts-re (nincs React/
// jsdom-függés, valódi input/output ellenőrzés, a projekt "prefer pure
// behavior tests over source regex tests" konvenciója szerint).
//
// ONBOARD CONFIRMATION SPRINT (2026-09-23) — DÁTUMOZOTT KORREKCIÓ: a modul
// API-ja `pending: boolean` + `transitMode: string | null`-ból egy explicit
// NONE/PENDING/CONFIRMED_ONBOARD status + teljes, tripId-alapú
// TransitOnboardScope-ra bővült (audit-riport, "leakage gap" bezárása —
// lásd a modul fejlécét). A KORÁBBI tesztek NEM lettek szó nélkül törölve:
// minden EGYEZŐ eset (első-bizonyíték-marad-mérvadó, auto-clear szabályok,
// mód-specifikus szövegek) itt, az ÚJ API-ra átültetve, VÁLTOZATLAN
// LOGIKÁVAL tovább él, plusz az audit saját tesztlistájának (A-N)
// ide tartozó eseteivel bővítve.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  clearAwaitingFreshGpsIfSatisfied,
  confirmTransitOnboard,
  createInitialTransitGpsLossConfirmationState,
  declineTransitOnboard,
  isAwaitingFreshGpsAfterDecline,
  isTransitOnboardScopeStale,
  markTransitGpsLoss,
  resolveTransitGpsLossConfirmation,
  shouldAutoClearTransitGpsLossConfirmation,
  transitOnboardQuestionText,
  type TransitOnboardScope,
} from "../../lib/vedett-route/navigation/transitGpsLossConfirmation.ts";

function scope(overrides: Partial<TransitOnboardScope> = {}): TransitOnboardScope {
  return { tripId: "TRIP_A", transitMode: "RAIL", routeShortName: null, headsign: null, ...overrides };
}

describe("markTransitGpsLoss / resolveTransitGpsLossConfirmation", () => {
  test("kezdő állapotban NONE, nincs scope", () => {
    assert.deepEqual(createInitialTransitGpsLossConfirmationState(), {
      status: "NONE",
      scope: null,
      awaitingFreshGpsSinceMs: null,
    });
  });

  test("[A] egy LOST esemény önmagában (scope nélkül/null) SOHA nem jelöl PENDING-et", () => {
    const next = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), null);
    assert.equal(next.status, "NONE");
  });

  test("egy LOST esemény transit közben PENDING-et jelöl, a scope-pal", () => {
    const next = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1" }));
    assert.equal(next.status, "PENDING");
    assert.equal(next.scope?.tripId, "TRIP_1");
  });

  test("egy MÁR PENDING állapotot (ugyanaz a tripId) egy újabb LOST esemény NEM ír felül (első bizonyíték marad mérvadó)", () => {
    const first = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1", transitMode: "BUS" }));
    const second = markTransitGpsLoss(first, scope({ tripId: "TRIP_1", transitMode: "TRAM" }));
    assert.deepEqual(second, first);
    assert.equal(second.scope?.transitMode, "BUS");
  });

  test("[F] CONFIRMED_ONBOARD állapotot (ugyanaz a tripId) egy újabb LOST/OFF_ROUTE esemény NEM ír felül vissza PENDING-re — nincs újra-kérdezés", () => {
    const confirmed = confirmTransitOnboard(markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1" })));
    assert.equal(confirmed.status, "CONFIRMED_ONBOARD");
    const afterAnotherLoss = markTransitGpsLoss(confirmed, scope({ tripId: "TRIP_1" }));
    assert.deepEqual(afterAnotherLoss, confirmed);
  });

  test("[G] MÁSIK tripId-re érkező LOST esemény SOHA nem örökli egy korábbi trip PENDING/CONFIRMED_ONBOARD állapotát — leakage-fix regresszió", () => {
    const confirmedTripA = confirmTransitOnboard(markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_A", transitMode: "SUBWAY" })));
    assert.equal(confirmedTripA.status, "CONFIRMED_ONBOARD");

    // Ugyanaz a MÓD (SUBWAY), DE MÁSIK tripId (pl. átszállás után egy másik metróvonal) —
    // ez SOSEM maradhat CONFIRMED_ONBOARD-ként a régi trip alapján.
    const afterTripBLoss = markTransitGpsLoss(confirmedTripA, scope({ tripId: "TRIP_B", transitMode: "SUBWAY" }));
    assert.equal(afterTripBLoss.status, "PENDING");
    assert.equal(afterTripBLoss.scope?.tripId, "TRIP_B");
  });

  test("resolveTransitGpsLossConfirmation mindig a kezdő állapotra áll vissza — IGEN/NEM/egyéb elévülés egyaránt ezt hívja", () => {
    const pending = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1", transitMode: "SUBWAY" }));
    assert.deepEqual(resolveTransitGpsLossConfirmation(), createInitialTransitGpsLossConfirmationState());
    assert.notDeepEqual(pending, createInitialTransitGpsLossConfirmationState());
  });
});

describe("confirmTransitOnboard — [E] IGEN szemantika", () => {
  test("PENDING -> CONFIRMED_ONBOARD, a scope (tripId) MEGŐRZŐDIK", () => {
    const pending = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1", transitMode: "SUBWAY" }));
    const confirmed = confirmTransitOnboard(pending);
    assert.equal(confirmed.status, "CONFIRMED_ONBOARD");
    assert.deepEqual(confirmed.scope, pending.scope);
    assert.equal(confirmed.awaitingFreshGpsSinceMs, null);
  });

  test("scope nélkül (védekező eset) SOHA nem állít be CONFIRMED_ONBOARD-ot identitás nélkül — biztonságosan NONE-ra esik vissza", () => {
    const confirmed = confirmTransitOnboard(createInitialTransitGpsLossConfirmationState());
    assert.equal(confirmed.status, "NONE");
    assert.equal(confirmed.scope, null);
  });
});

describe("declineTransitOnboard — [J/K] NEM szemantika, friss-GPS-várakozás", () => {
  test("NEM töröl minden scope-ot (NONE), DE rögzíti a válasz időpontját", () => {
    const declined = declineTransitOnboard(5_000);
    assert.equal(declined.status, "NONE");
    assert.equal(declined.scope, null);
    assert.equal(declined.awaitingFreshGpsSinceMs, 5_000);
  });

  test("isAwaitingFreshGpsAfterDecline true amíg a várakozás aktív", () => {
    assert.equal(isAwaitingFreshGpsAfterDecline(declineTransitOnboard(1_000)), true);
    assert.equal(isAwaitingFreshGpsAfterDecline(createInitialTransitGpsLossConfirmationState()), false);
  });

  test("[J] a NEM válasz ELŐTTI (korábbi timestampű) fix NEM elégíti ki a várakozást", () => {
    const declined = declineTransitOnboard(10_000);
    const next = clearAwaitingFreshGpsIfSatisfied(declined, 9_999, true);
    assert.equal(next, declined);
    assert.equal(isAwaitingFreshGpsAfterDecline(next), true);
  });

  test("egy usable, DE STALE/INVALID (usable=false) fix sosem elégíti ki a várakozást, akkor sem, ha az időbélyeg friss", () => {
    const declined = declineTransitOnboard(10_000);
    const next = clearAwaitingFreshGpsIfSatisfied(declined, 20_000, false);
    assert.equal(next, declined);
  });

  test("[K] a NEM válasz UTÁNI (>=), usable fix kielégíti a várakozást — a reroute innentől a MEGLÉVŐ guard szerint folytatódhat", () => {
    const declined = declineTransitOnboard(10_000);
    const next = clearAwaitingFreshGpsIfSatisfied(declined, 10_000, true);
    assert.equal(next.awaitingFreshGpsSinceMs, null);
    assert.equal(isAwaitingFreshGpsAfterDecline(next), false);
  });

  test("nem-awaiting állapotban a clear no-op (nincs mit törölni)", () => {
    const initial = createInitialTransitGpsLossConfirmationState();
    assert.equal(clearAwaitingFreshGpsIfSatisfied(initial, 1, true), initial);
  });
});

describe("shouldAutoClearTransitGpsLossConfirmation — 'ha a GPS normálisan tér vissza, ne kérdezz semmit' (KIZÁRÓLAG PENDING-re vonatkozik)", () => {
  test("NONE státuszban sosem tisztít (nincs mit)", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("NONE", true, false, "ON_ROUTE"), false);
  });

  test("[B] PENDING, DE a GPS még nem usable (STALE/INVALID) — nem tisztít, várunk stabil fixre", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("PENDING", false, false, "ON_ROUTE"), false);
  });

  test("PENDING, DE még a reacquiring 'bemelegítési' ablakban vagyunk — nem tisztít", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("PENDING", true, true, "ON_ROUTE"), false);
  });

  test("PENDING, GPS stabil, DE MÉG megerősített OFF_ROUTE — nem tisztít (a kérdés releváns marad)", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("PENDING", true, false, "OFF_ROUTE"), false);
  });

  test("[B] PENDING, GPS stabil, ÉS nincs (már/még) megerősített OFF_ROUTE — csendben tisztít, nincs kérdés", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("PENDING", true, false, "ON_ROUTE"), true);
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("PENDING", true, false, "POSSIBLY_OFF_ROUTE"), true);
  });

  test("[F] CONFIRMED_ONBOARD státusz SOSEM tisztul automatikusan ezen az úton, még ha az OFF_ROUTE el is tűnik — kizárólag explicit reset/scope-invalidáció szüntetheti meg", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation("CONFIRMED_ONBOARD", true, false, "ON_ROUTE"), false);
  });
});

describe("isTransitOnboardScopeStale — [H] leg-befejeződés / tripId-váltás érvényteleníti a scope-ot", () => {
  test("NONE státusz sosem stale (nincs mit érvényteleníteni)", () => {
    assert.equal(isTransitOnboardScopeStale(createInitialTransitGpsLossConfirmationState(), "TRIP_1"), false);
  });

  test("PENDING/CONFIRMED_ONBOARD, UGYANAZ az aktív tripId -> nem stale", () => {
    const confirmed = confirmTransitOnboard(markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1" })));
    assert.equal(isTransitOnboardScopeStale(confirmed, "TRIP_1"), false);
  });

  test("[H] CONFIRMED_ONBOARD, DE az aktív leg MÁR egy MÁSIK tripId-re lépett (leg lezárult -> következő leg) -> stale", () => {
    const confirmed = confirmTransitOnboard(markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1" })));
    assert.equal(isTransitOnboardScopeStale(confirmed, "TRIP_2"), true);
  });

  test("CONFIRMED_ONBOARD, DE már nincs aktív TRANSIT leg (pl. WALK-ra lépett / navigáció véget ért) -> stale", () => {
    const confirmed = confirmTransitOnboard(markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), scope({ tripId: "TRIP_1" })));
    assert.equal(isTransitOnboardScopeStale(confirmed, null), true);
  });
});

describe("transitOnboardQuestionText — mód-specifikus magyar kérdés, SUBWAY route+headsign", () => {
  test("RAIL és REGIONAL_RAIL egyaránt a vonatos kérdést adja, másodlagos sor nélkül", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "RAIL" })), { primary: "Még mindig a vonaton vagy?", secondary: null });
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "REGIONAL_RAIL" })), { primary: "Még mindig a vonaton vagy?", secondary: null });
  });

  test("BUS -> busz, TRAM -> villamos", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "BUS" })), { primary: "Még mindig a buszon vagy?", secondary: null });
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "TRAM" })), { primary: "Még mindig a villamoson vagy?", secondary: null });
  });

  test("[új] TROLLEYBUS -> trolibusz, eddig hiányzott a módlistából", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "TROLLEYBUS" })), { primary: "Még mindig a trolibuszon vagy?", secondary: null });
  });

  test("SUBWAY routeShortName NÉLKÜL -> generikus metrós kérdés", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "SUBWAY" })), { primary: "Még mindig a metrón vagy?", secondary: null });
  });

  test("SUBWAY routeShortName-nel (M2) -> a pontos vonalszámot tartalmazó kérdés, pontosan a spec szerinti szöveggel", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "SUBWAY", routeShortName: "M2" })), {
      primary: "Még mindig az M2 metrón vagy?",
      secondary: null,
    });
  });

  test("SUBWAY routeShortName + headsign -> opcionális másodlagos sor ('X felé')", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "SUBWAY", routeShortName: "M2", headsign: "Déli pályaudvar" })), {
      primary: "Még mindig az M2 metrón vagy?",
      secondary: "Déli pályaudvar felé",
    });
  });

  test("nem-SUBWAY módnál a headsign SOSEM jelenik meg másodlagos sorként (a spec kizárólag SUBWAY-re kéri)", () => {
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "BUS", routeShortName: "7", headsign: "Kelenföld" })), {
      primary: "Még mindig a buszon vagy?",
      secondary: null,
    });
  });

  test("ismeretlen/hiányzó transitMode/scope esetén semleges alapértelmezés, sosem crash", () => {
    assert.deepEqual(transitOnboardQuestionText(null), { primary: "Még mindig a járművön vagy?", secondary: null });
    assert.deepEqual(transitOnboardQuestionText(scope({ transitMode: "FERRY" })), { primary: "Még mindig a járművön vagy?", secondary: null });
  });
});
