// Sprint E Preparation Gate — láthatósági szűrő (védelem a mélységben az
// RLS mellett) tesztek.
//   node --test __tests__/vedett-route/rest-stop-visibility.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { filterVisibleRestPoints, isRestPointVisibleToUser } from "../../lib/vedett-route/restStopFlow/visibility.ts";
import type { RestPoint } from "../../lib/rest-points/types.ts";

function makeRestPoint(overrides: Partial<RestPoint> = {}): RestPoint {
  return {
    id: "rp-1",
    createdBy: "owner-1",
    name: "Pad",
    latitude: 47.5,
    longitude: 19.05,
    source: "USER",
    visibility: "PRIVATE",
    toilet: null,
    seating: null,
    quietSpace: null,
    indoors: null,
    outdoors: null,
    purchaseRequired: null,
    notes: null,
    createdAt: "2026-09-07T09:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}

test("PRIVATE pont: a létrehozó látja", () => {
  const rp = makeRestPoint({ createdBy: "owner-1", visibility: "PRIVATE" });
  assert.equal(isRestPointVisibleToUser(rp, "owner-1"), true);
});

test("PRIVATE pont: MÁS felhasználó NEM látja", () => {
  const rp = makeRestPoint({ createdBy: "owner-1", visibility: "PRIVATE" });
  assert.equal(isRestPointVisibleToUser(rp, "someone-else"), false);
});

test("PRIVATE pont: bejelentkezés nélkül (null userId) NEM látható", () => {
  const rp = makeRestPoint({ createdBy: "owner-1", visibility: "PRIVATE" });
  assert.equal(isRestPointVisibleToUser(rp, null), false);
});

test("PUBLIC pont: bárki látja, még a nem létrehozó is", () => {
  const rp = makeRestPoint({ createdBy: "owner-1", visibility: "PUBLIC" });
  assert.equal(isRestPointVisibleToUser(rp, "someone-else"), true);
});

test("filterVisibleRestPoints: több pont közül csak a sajátot (PRIVATE) és a PUBLIC-okat adja vissza", () => {
  const mine = makeRestPoint({ id: "mine", createdBy: "user-1", visibility: "PRIVATE" });
  const others = makeRestPoint({ id: "others", createdBy: "user-2", visibility: "PRIVATE" });
  const publicOne = makeRestPoint({ id: "public", createdBy: "user-2", visibility: "PUBLIC" });
  const visible = filterVisibleRestPoints([mine, others, publicOne], "user-1");
  const visibleIds = visible.map((rp) => rp.id).sort();
  assert.deepEqual(visibleIds, ["mine", "public"]);
});
