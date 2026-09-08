// Sprint E — pickBestItinerary tesztek. PURE, determinisztikus,
// nincs hálózati hívás, nincs véletlenszerűség.
//   node --test __tests__/vedett-route/rest-stop-pick-best-itinerary.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestItinerary } from "../../lib/vedett-route/restStopFlow/pickBestItinerary.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

function makeItinerary(overrides: Partial<MotisItinerary> = {}): MotisItinerary {
  return {
    duration: 600,
    startTime: "2026-09-08T09:00:00.000Z",
    endTime: "2026-09-08T09:10:00.000Z",
    transfers: 0,
    legs: [],
    ...overrides,
  };
}

test("üres lista esetén null-t ad", () => {
  assert.equal(pickBestItinerary([]), null);
});

test("egyetlen itinerary esetén azt adja vissza", () => {
  const only = makeItinerary();
  assert.equal(pickBestItinerary([only]), only);
});

test("a legrövidebb teljes utazási idejűt választja", () => {
  const slow = makeItinerary({ duration: 1200 });
  const fast = makeItinerary({ duration: 300 });
  assert.equal(pickBestItinerary([slow, fast]), fast);
});

test("egyenlő időtartam esetén a kevesebb átszállásút választja", () => {
  const moreTransfers = makeItinerary({ duration: 600, transfers: 2 });
  const fewerTransfers = makeItinerary({ duration: 600, transfers: 0 });
  assert.equal(pickBestItinerary([moreTransfers, fewerTransfers]), fewerTransfers);
});

test("egyenlő idő és átszállás esetén a korábbi indulásút választja (determinisztikus tie-break)", () => {
  const later = makeItinerary({ duration: 600, transfers: 1, startTime: "2026-09-08T09:30:00.000Z" });
  const earlier = makeItinerary({ duration: 600, transfers: 1, startTime: "2026-09-08T09:00:00.000Z" });
  assert.equal(pickBestItinerary([later, earlier]), earlier);
});

test("teljesen egyenlő itineraryk esetén is determinisztikus (nem véletlenszerű, mindig ugyanazt adja)", () => {
  const a = makeItinerary({ duration: 600, transfers: 1, startTime: "2026-09-08T09:00:00.000Z" });
  const b = makeItinerary({ duration: 600, transfers: 1, startTime: "2026-09-08T09:00:00.000Z" });
  const first = pickBestItinerary([a, b]);
  const second = pickBestItinerary([a, b]);
  assert.equal(first, second);
});
