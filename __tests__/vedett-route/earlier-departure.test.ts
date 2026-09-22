// EARLIER TRANSIT DEPARTURE (2026-09-22) — a lib/vedett-route/navigation/
// earlierDeparture.ts pure modul célzott tesztje. node --test, valódi
// függvényhívással, a projekt meglévő mintáját követve (nincs jsdom/render).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EARLIER_DEPARTURE_MIN_LEAD_MINUTES,
  acceptEarlierDepartureOffer,
  candidateFingerprint,
  createInitialEarlierDepartureOfferState,
  declineEarlierDepartureOffer,
  resetEarlierDepartureOffer,
  resolveEarlierDepartureCandidate,
  shouldTriggerEarlierDepartureCheck,
  startEarlierDepartureCheck,
  validateEarlierDepartureCandidate,
} from "../../lib/vedett-route/navigation/earlierDeparture.ts";

const NOW = new Date("2026-09-22T16:36:00Z").getTime();
const iso = (offsetMinutesFromNow: number) => new Date(NOW + offsetMinutesFromNow * 60_000).toISOString();

describe("4) user early at boarding area -> check triggered", () => {
  test("AT_BOARDING_AREA + elegendő lead time -> trigger", () => {
    const result = shouldTriggerEarlierDepartureCheck({
      navigationActive: true,
      boardingPhase: "AT_BOARDING_AREA",
      plannedDepartureIso: iso(14), // 18:50 vs 18:36 -> 14 perc előretartás
      nowMs: NOW,
      alreadyHandledForThisDeparture: false,
    });
    assert.equal(result, true);
  });

  test("APPROACHING_BOARDING is elég, BOARDED/WALKING nem trigger", () => {
    assert.equal(
      shouldTriggerEarlierDepartureCheck({
        navigationActive: true,
        boardingPhase: "APPROACHING_BOARDING",
        plannedDepartureIso: iso(14),
        nowMs: NOW,
        alreadyHandledForThisDeparture: false,
      }),
      true,
    );
    assert.equal(
      shouldTriggerEarlierDepartureCheck({
        navigationActive: true,
        boardingPhase: "WALKING",
        plannedDepartureIso: iso(14),
        nowMs: NOW,
        alreadyHandledForThisDeparture: false,
      }),
      false,
    );
  });
});

describe("15) boarded user -> no alternative search", () => {
  test("BOARDED/BOARDED_UNCERTAIN_GEOMETRY/ARRIVED nem trigger", () => {
    for (const boardingPhase of ["BOARDED", "BOARDED_UNCERTAIN_GEOMETRY", "ARRIVED"] as const) {
      assert.equal(
        shouldTriggerEarlierDepartureCheck({
          navigationActive: true,
          boardingPhase,
          plannedDepartureIso: iso(14),
          nowMs: NOW,
          alreadyHandledForThisDeparture: false,
        }),
        false,
        boardingPhase,
      );
    }
  });
});

describe("16) WALK -> no alternative search", () => {
  test("NOT_APPLICABLE (pl. WALK-only leg) nem trigger", () => {
    assert.equal(
      shouldTriggerEarlierDepartureCheck({
        navigationActive: true,
        boardingPhase: "NOT_APPLICABLE",
        plannedDepartureIso: iso(14),
        nowMs: NOW,
        alreadyHandledForThisDeparture: false,
      }),
      false,
    );
  });
});

describe("nincs elegendő előretartás / nincs navigáció / már kezelve -> nem trigger", () => {
  test(`kevesebb, mint ${EARLIER_DEPARTURE_MIN_LEAD_MINUTES} perc előretartás -> nem trigger`, () => {
    assert.equal(
      shouldTriggerEarlierDepartureCheck({
        navigationActive: true,
        boardingPhase: "AT_BOARDING_AREA",
        plannedDepartureIso: iso(2),
        nowMs: NOW,
        alreadyHandledForThisDeparture: false,
      }),
      false,
    );
  });

  test("navigationActive=false -> nem trigger", () => {
    assert.equal(
      shouldTriggerEarlierDepartureCheck({
        navigationActive: false,
        boardingPhase: "AT_BOARDING_AREA",
        plannedDepartureIso: iso(14),
        nowMs: NOW,
        alreadyHandledForThisDeparture: false,
      }),
      false,
    );
  });

  test("alreadyHandledForThisDeparture=true -> nem trigger (nincs folyamatos poller/duplikált kérés)", () => {
    assert.equal(
      shouldTriggerEarlierDepartureCheck({
        navigationActive: true,
        boardingPhase: "AT_BOARDING_AREA",
        plannedDepartureIso: iso(14),
        nowMs: NOW,
        alreadyHandledForThisDeparture: true,
      }),
      false,
    );
  });
});

describe("5) earlier valid journey -> offer", () => {
  test("korábbi indulás, jövőbeli, tervezett előtt, érdemben korábbi érkezés -> valid", () => {
    const result = validateEarlierDepartureCandidate({
      candidateDepartureIso: iso(4), // 18:40
      candidateArrivalIso: iso(50),
      plannedDepartureIso: iso(14), // 18:50
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(result, { valid: true });
  });
});

describe("6) earlier departure that does not serve remaining journey -> reject", () => {
  test("nincs érdemi javulás a VÉGSŐ érkezésben (a candidate nem viszi el ugyanoda hasznosan) -> NO_MEANINGFUL_IMPROVEMENT", () => {
    const result = validateEarlierDepartureCandidate({
      candidateDepartureIso: iso(4),
      candidateArrivalIso: iso(64), // ugyanaz, mint az eredeti érkezés
      plannedDepartureIso: iso(14),
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(result, { valid: false, reason: "NO_MEANINGFUL_IMPROVEMENT" });
  });
});

describe("7) departure <= now -> reject", () => {
  test("candidateDepartureIso a jelenben/múltban -> DEPARTURE_NOT_IN_FUTURE", () => {
    const result = validateEarlierDepartureCandidate({
      candidateDepartureIso: iso(0),
      candidateArrivalIso: iso(50),
      plannedDepartureIso: iso(14),
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(result, { valid: false, reason: "DEPARTURE_NOT_IN_FUTURE" });
  });
});

describe("8) departure >= planned departure -> reject", () => {
  test("candidateDepartureIso a tervezettel egyenlő vagy későbbi -> DEPARTURE_NOT_EARLIER_THAN_PLANNED", () => {
    const equal = validateEarlierDepartureCandidate({
      candidateDepartureIso: iso(14),
      candidateArrivalIso: iso(50),
      plannedDepartureIso: iso(14),
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(equal, { valid: false, reason: "DEPARTURE_NOT_EARLIER_THAN_PLANNED" });

    const later = validateEarlierDepartureCandidate({
      candidateDepartureIso: iso(20),
      candidateArrivalIso: iso(50),
      plannedDepartureIso: iso(14),
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(later, { valid: false, reason: "DEPARTURE_NOT_EARLIER_THAN_PLANNED" });
  });
});

describe("9) no useful improvement -> reject", () => {
  test("az érkezés csak jelentéktelenül (a min. javulási küszöb alatt) korábbi -> NO_MEANINGFUL_IMPROVEMENT", () => {
    const result = validateEarlierDepartureCandidate({
      candidateDepartureIso: iso(4),
      candidateArrivalIso: iso(63.5), // 30 mp-cel korábban, a küszöb (1 perc) alatt
      plannedDepartureIso: iso(14),
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(result, { valid: false, reason: "NO_MEANINGFUL_IMPROVEMENT" });
  });

  test("hiányzó adat -> MISSING_DATA, sosem dob kivételt", () => {
    const result = validateEarlierDepartureCandidate({
      candidateDepartureIso: null,
      candidateArrivalIso: iso(50),
      plannedDepartureIso: iso(14),
      originalArrivalIso: iso(64),
      nowMs: NOW,
    });
    assert.deepEqual(result, { valid: false, reason: "MISSING_DATA" });
  });
});

describe("10) offer does NOT change journey / 11) accept -> journey changes / 12) decline -> original preserved", () => {
  test("resolveEarlierDepartureCandidate CSAK 'offered' állapotot ad, nem hív journey-cserét — a hívó felel az elfogadás utáni cseréért", () => {
    const state = startEarlierDepartureCheck(createInitialEarlierDepartureOfferState(), iso(14));
    const candidate = { departureIso: iso(4), arrivalIso: iso(50), routeLabel: "Z30 – Martonvásár felé" };
    const offered = resolveEarlierDepartureCandidate(state, candidate, { valid: true });
    assert.equal(offered.status, "offered");
    assert.deepEqual(offered.candidate, candidate);
  });

  test("accept -> 'accepted' állapot (a hívó ebből olvassa ki, hogy cserélje a displayedJourney-t)", () => {
    const state = resolveEarlierDepartureCandidate(
      startEarlierDepartureCheck(createInitialEarlierDepartureOfferState(), iso(14)),
      { departureIso: iso(4), arrivalIso: iso(50), routeLabel: "Z30 – Martonvásár felé" },
      { valid: true },
    );
    const accepted = acceptEarlierDepartureOffer(state);
    assert.equal(accepted.status, "accepted");
  });

  test("decline -> 'idle', a candidate törlődik, az eredeti journey érintetlen marad", () => {
    const state = resolveEarlierDepartureCandidate(
      startEarlierDepartureCheck(createInitialEarlierDepartureOfferState(), iso(14)),
      { departureIso: iso(4), arrivalIso: iso(50), routeLabel: "Z30 – Martonvásár felé" },
      { valid: true },
    );
    const declined = declineEarlierDepartureOffer(state);
    assert.equal(declined.status, "idle");
    assert.equal(declined.candidate, null);
  });
});

describe("13) declined alternative not immediately offered again", () => {
  test("egy elutasított candidate fingerprintje bekerül a declined listába, és resolveEarlierDepartureCandidate ugyanazt a fingerprintet 'idle'-re dönti, nem 'offered'-re", () => {
    const initial = resolveEarlierDepartureCandidate(
      startEarlierDepartureCheck(createInitialEarlierDepartureOfferState(), iso(14)),
      { departureIso: iso(4), arrivalIso: iso(50), routeLabel: "Z30 – Martonvásár felé" },
      { valid: true },
    );
    const afterDecline = declineEarlierDepartureOffer(initial);
    assert.deepEqual(afterDecline.declinedFingerprints, [candidateFingerprint(iso(4), "Z30 – Martonvásár felé")]);

    const reoffered = resolveEarlierDepartureCandidate(
      startEarlierDepartureCheck(afterDecline, iso(14)),
      { departureIso: iso(4), arrivalIso: iso(50), routeLabel: "Z30 – Martonvásár felé" },
      { valid: true },
    );
    assert.equal(reoffered.status, "idle", "ugyanazt az elutasított jelöltet nem ajánljuk fel újra");
  });
});

describe("14) stale response -> ignored", () => {
  test("invalid validáció (pl. a válasz időközben elavulttá vált) -> 'idle', nincs candidate", () => {
    const state = startEarlierDepartureCheck(createInitialEarlierDepartureOfferState(), iso(14));
    const resolved = resolveEarlierDepartureCandidate(state, null, { valid: false, reason: "MISSING_DATA" });
    assert.equal(resolved.status, "idle");
    assert.equal(resolved.candidate, null);
  });
});

describe("17) /plan failure -> original journey preserved", () => {
  test("null candidate (a hívó /plan hiba esetén null-t ad át) -> 'idle', nincs journey-csere-jelzés", () => {
    const state = startEarlierDepartureCheck(createInitialEarlierDepartureOfferState(), iso(14));
    const resolved = resolveEarlierDepartureCandidate(state, null, { valid: false, reason: "MISSING_DATA" });
    assert.equal(resolved.status, "idle");
  });
});

describe("resetEarlierDepartureOffer — új navigáció/route-váltás reset-pontja", () => {
  test("mindig a kezdeti, üres állapotot adja", () => {
    assert.deepEqual(resetEarlierDepartureOffer(), createInitialEarlierDepartureOfferState());
  });
});
