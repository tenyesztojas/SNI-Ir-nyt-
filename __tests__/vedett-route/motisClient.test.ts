// Routing tesztek (31. pont "Routing" kategória — a MOTIS-hoz nem kötött
// rész: a hiányzó/nem elérhető routing engine kezelése + a hivatalos
// /api/v6/plan kérés-összeállítás).
//   node --test __tests__/vedett-route/motisClient.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

test("MOTIS_BASE_URL nélkül fetchMotisPlan routing_engine_unavailable-t ad vissza, sosem dob kivételt", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_engine_unavailable");
    assert.equal(result.message, "Az útvonaltervezés átmenetileg nem érhető el.");
  }
});

test("a hibaüzenet sosem tartalmaz kitalált/AI-generált útvonaladatot", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" });

  assert.equal("data" in result, false, "unavailable válasz nem tartalmazhat data mezőt");
});

test("csak dokumentált MOTIS /api/v6/plan paraméterek kerülnek a kérésbe (fetch URL ellenőrzés)", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  // @ts-expect-error — teszt-mock, csak az URL-t figyeljük, nem hívunk valódi hálózatot
  globalThis.fetch = async (url: string) => {
    capturedUrl = url;
    throw new Error("network disabled in test");
  };

  try {
    const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");
    await fetchMotisPlan({
      fromPlace: "bkkgtfs_CSF00954",
      toPlace: "bkkgtfs_CSF01291",
      numItineraries: 6,
      transitModes: ["BUS", "TRAM"],
    });

    assert.ok(capturedUrl, "a fetch-nek meg kellett hívódnia");
    assert.ok(capturedUrl!.startsWith("http://localhost:19999/api/v6/plan?"), "a v6/plan végpontot kell hívnia");
    const parsed = new URL(capturedUrl!);
    assert.equal(parsed.searchParams.get("fromPlace"), "bkkgtfs_CSF00954");
    assert.equal(parsed.searchParams.get("toPlace"), "bkkgtfs_CSF01291");
    assert.equal(parsed.searchParams.get("numItineraries"), "6");
    assert.deepEqual(parsed.searchParams.getAll("transitModes"), ["BUS", "TRAM"]);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — fetchMotisTrip()
// tesztek: GET /api/v6/trip, tripId változatlanul, kitalálás/konverzió
// NÉLKÜL (lásd motisTypes.ts MotisTripParams kommentje).

test("[1] fetchMotisTrip a TELJES, MOTIS-normalizált tripId-t küldi a /trip kérésben, változatlanul", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  // @ts-expect-error — teszt-mock, csak az URL-t figyeljük, nem hívunk valódi hálózatot
  globalThis.fetch = async (url: string) => {
    capturedUrl = url;
    throw new Error("network disabled in test");
  };

  try {
    const { fetchMotisTrip } = await import("../../lib/vedett-route/motisClient.ts");
    await fetchMotisTrip({ tripId: "20260923_08:43_bkkgtfs_C97566391" });

    assert.ok(capturedUrl, "a fetch-nek meg kellett hívódnia");
    assert.ok(capturedUrl!.startsWith("http://localhost:19999/api/v6/trip?"), "a v6/trip végpontot kell hívnia");
    const parsed = new URL(capturedUrl!);
    assert.equal(parsed.searchParams.get("tripId"), "20260923_08:43_bkkgtfs_C97566391");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("[2] fetchMotisTrip a rövid/nyers GTFS tripId-t is VÁLTOZATLANUL küldi tovább — nincs automatikus konverzió/kiegészítés-kitalálás", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async (url: string) => {
    capturedUrl = url;
    throw new Error("network disabled in test");
  };

  try {
    const { fetchMotisTrip } = await import("../../lib/vedett-route/motisClient.ts");
    // Ez a rövid forma a user élő VPS-tesztje szerint "invalid tripId tag"
    // hibát ad MOTIS oldalon — a kliens felelőssége, hogy a TELJES formát
    // adja át, a motisClient.ts-nek SOHA nem szabad "kitalálnia"/kiegészítenie.
    await fetchMotisTrip({ tripId: "bkkgtfs_C97566410" });

    const parsed = new URL(capturedUrl!);
    assert.equal(parsed.searchParams.get("tripId"), "bkkgtfs_C97566410", "a tripId byte-ra változatlanul kerül a kérésbe, nincs prefix/dátum hozzáadás");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("MOTIS_BASE_URL nélkül fetchMotisTrip routing_engine_unavailable-t ad vissza, sosem dob kivételt", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { fetchMotisTrip } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await fetchMotisTrip({ tripId: "20260923_08:43_bkkgtfs_C97566391" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_engine_unavailable");
  }
});

test("[7] fetchMotisTrip 404 válasz esetén reason: not_found-ot ad, sosem dob kivételt, sosem jelez cancelled-et", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });

  try {
    const { fetchMotisTrip } = await import("../../lib/vedett-route/motisClient.ts");
    const result = await fetchMotisTrip({ tripId: "UNKNOWN_TRIP" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});
