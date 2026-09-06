import { test } from "node:test";
import assert from "node:assert/strict";
import { rankJourneys } from "../../lib/vedett-route/ranking.ts";
import { computeSensoryScore } from "../../lib/vedett-route/sensoryEngine.ts";
import { DEFAULT_PERSONALIZATION_WEIGHTS } from "../../lib/vedett-route/personalization.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

function baseJourney(overrides: Partial<Journey>): Journey {
  const j: Journey = {
    totalDurationMinutes: 30,
    departureTime: "2026-09-06T10:00:00Z",
    arrivalTime: "2026-09-06T10:30:00Z",
    walkingMinutes: 5,
    waitingMinutes: 2,
    transfers: 1,
    legs: [{ mode: "TRANSIT", transitMode: "BUS", fromName: "A", toName: "B", durationMinutes: 23, realtime: false }],
    alerts: [],
    realtimeAvailable: false,
    ...overrides,
  };
  j.sensory = computeSensoryScore(j, DEFAULT_PERSONALIZATION_WEIGHTS);
  return j;
}

test("a leggyorsabb kapja a FASTEST címkét, a legkevesebb átszállásos a FEWEST_TRANSFERS-t, a legalacsonyabb sensory score-ú a CALMEST-et", () => {
  const fast = baseJourney({ totalDurationMinutes: 15, transfers: 2 });
  const fewTransfers = baseJourney({ totalDurationMinutes: 40, transfers: 0 });
  const calm = baseJourney({
    totalDurationMinutes: 35,
    transfers: 1,
    legs: [{ mode: "TRANSIT", transitMode: "BUS", fromName: "A", toName: "B", durationMinutes: 28, realtime: false }],
  });

  const ranked = rankJourneys([fast, fewTransfers, calm]);

  const fastRanked = ranked.find((r) => r.journey === fast)!;
  const fewRanked = ranked.find((r) => r.journey === fewTransfers)!;

  assert.ok(fastRanked.labels.includes("FASTEST"));
  assert.ok(fewRanked.labels.includes("FEWEST_TRANSFERS"));
  // a calmest a három közül a legalacsonyabb sensory score-út kell hogy jelentse (nem feltétlenül 'calm' a kódnév miatt)
  const calmestLabelHolders = ranked.filter((r) => r.labels.includes("CALMEST"));
  assert.equal(calmestLabelHolders.length, 1);
});

test("minden rangsorolt útvonalhoz tartozik nem üres, determinisztikus magyarázat szöveg", () => {
  const a = baseJourney({ totalDurationMinutes: 20, transfers: 0 });
  const b = baseJourney({ totalDurationMinutes: 30, transfers: 2 });
  const ranked = rankJourneys([a, b]);
  for (const r of ranked) {
    assert.ok(r.explanation.length > 0);
  }
});

test("ugyanaz a bemenet mindig ugyanazt a rangsort és magyarázatot adja (determinizmus, nincs LLM-hívás)", () => {
  const a = baseJourney({ totalDurationMinutes: 20, transfers: 0 });
  const b = baseJourney({ totalDurationMinutes: 30, transfers: 2 });
  const first = rankJourneys([a, b]);
  const second = rankJourneys([a, b]);
  assert.deepEqual(
    first.map((r) => r.explanation),
    second.map((r) => r.explanation)
  );
});

test("üres bemenetre üres tömböt ad, nem dob kivételt", () => {
  assert.deepEqual(rankJourneys([]), []);
});

test("a megjelenítési sorrend mindig CALMEST -> FASTEST -> FEWEST_TRANSFERS -> LEAST_WALKING, még ha az input tömb más sorrendben érkezik is, és a címkétlen 'egyéb' alternatívák KIMARADNAK (max. 4 kártya)", () => {
  // Öt journey: négy KÜLÖNBÖZŐ, egymást nem átfedő tulajdonságot kap
  // (leggyorsabb / legkevesebb átszállás / legalacsonyabb sensory score /
  // legkevesebb gyaloglás), az ötödik pedig egyik kategóriában sem a
  // legjobb — ennek a felhasználó explicit kérése alapján NEM szabad
  // megjelennie a végeredményben.
  const fast = baseJourney({ totalDurationMinutes: 10, transfers: 3, walkingMinutes: 20 });
  const fewTransfers = baseJourney({ totalDurationMinutes: 45, transfers: 0, walkingMinutes: 20 });
  const calm = baseJourney({ totalDurationMinutes: 35, transfers: 2, walkingMinutes: 20 });
  calm.sensory = { ...calm.sensory!, score: 1 };
  const leastWalking = baseJourney({ totalDurationMinutes: 50, transfers: 2, walkingMinutes: 1 });
  leastWalking.sensory = { ...leastWalking.sensory!, score: 500 };
  const other = baseJourney({ totalDurationMinutes: 40, transfers: 1, walkingMinutes: 20 });
  other.sensory = { ...other.sensory!, score: 500 };
  fast.sensory = { ...fast.sensory!, score: 500 };
  fewTransfers.sensory = { ...fewTransfers.sensory!, score: 500 };

  // szándékosan "rossz" bemeneti sorrendben adjuk át
  const ranked = rankJourneys([fast, other, leastWalking, fewTransfers, calm]);

  assert.equal(ranked.length, 4, "a címkétlen 'other' journey-nek ki kell maradnia, így pontosan 4 kártya marad");
  assert.ok(ranked[0].labels.includes("CALMEST"), "az első kártyának CALMEST címkéjűnek kell lennie");
  assert.ok(ranked[1].labels.includes("FASTEST"), "a másodiknak FASTEST címkéjűnek kell lennie");
  assert.ok(ranked[2].labels.includes("FEWEST_TRANSFERS"), "a harmadiknak FEWEST_TRANSFERS címkéjűnek kell lennie");
  assert.ok(ranked[3].labels.includes("LEAST_WALKING"), "a negyediknek LEAST_WALKING címkéjűnek kell lennie");
  assert.ok(
    !ranked.some((r) => r.journey === other),
    "a címkétlen 'other' journey nem szerepelhet a végeredményben"
  );
});

test("ha ugyanaz az útvonal egyszerre több címkét is visel (pl. CALMEST és FASTEST), a sorrendben csak egyszer szerepel, a legmagasabb prioritású pozícióban; a semmilyen kategóriában sem legjobb alternatíva kimarad", () => {
  const best = baseJourney({ totalDurationMinutes: 15, transfers: 0 });
  const worse = baseJourney({ totalDurationMinutes: 45, transfers: 3 });

  const ranked = rankJourneys([worse, best]);

  // 'worse' semelyik kategóriában (leggyorsabb / legkevesebb átszállás /
  // legnyugodtabb / legkevesebb gyaloglás) sem a legjobb, ezért a felhasználó
  // "csak 4 (vagy kevesebb) kártya" kérése alapján ki kell maradnia.
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].journey, best);
  assert.ok(
    ranked[0].labels.includes("CALMEST") &&
      ranked[0].labels.includes("FASTEST") &&
      ranked[0].labels.includes("FEWEST_TRANSFERS") &&
      ranked[0].labels.includes("LEAST_WALKING")
  );
});
