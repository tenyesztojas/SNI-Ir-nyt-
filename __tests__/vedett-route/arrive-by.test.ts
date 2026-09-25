// ARRIVE-BY TERVEZÉS (2026-09-24) — célzott, szűk kör tesztek a natív MOTIS
// arriveBy=true (backward search) integrációra. Lásd
// lib/vedett-route/orchestrator.ts searchVedettRoutes() és
// lib/vedett-route/types.ts JourneySearchRequest.timeMode kommentjei.
//
// SZÁNDÉKOSAN NEM egy teljes E2E/route.ts Next szerver teszt (ahhoz éles
// Next request/response harness kellene) — a route.ts-beli validáció/
// cache-kulcs/mód-átadás forráskód-alapú, statikus ellenőrzéssel fedett
// (lásd a fájl végén a "route.ts wiring" describe blokkot, ami a meglévő
// car-route-mvp.test.ts mintáját követi).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapMotisItineraryToJourney, searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import { journeySearchSchema } from "../../lib/vedett-route/schemas.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

const BASE_ITINERARY: MotisItinerary = {
  duration: 180,
  startTime: "2026-09-06T07:41:00Z",
  endTime: "2026-09-06T07:44:00Z",
  transfers: 0,
  legs: [
    {
      mode: "SUBWAY",
      from: { name: "Deák Ferenc tér", stopId: "bkkgtfs_CSF00954" },
      to: { name: "Blaha Lujza tér", stopId: "bkkgtfs_CSF01291" },
      duration: 180,
      startTime: "2026-09-06T07:41:00Z",
      endTime: "2026-09-06T07:44:00Z",
      routeShortName: "M2",
    },
  ],
};

function withMockedFetch(handler: (url: string) => unknown, fn: () => Promise<void>): Promise<void> {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) =>
    new Response(JSON.stringify(handler(url)), { status: 200, headers: { "content-type": "application/json" } });
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  });
}

describe("ARRIVE-BY — zod schema", () => {
  test("A) DEPART_AT regresszió: timeMode nélküli kérés változatlanul valid marad", () => {
    const parsed = journeySearchSchema.safeParse({
      from: "Deák Ferenc tér, Budapest",
      to: "Blaha Lujza tér, Budapest",
      departAt: new Date().toISOString(),
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.timeMode, undefined);
  });

  test("timeMode: 'ARRIVE_BY' és 'DEPART_AT' egyaránt elfogadott érték", () => {
    for (const timeMode of ["DEPART_AT", "ARRIVE_BY"] as const) {
      const parsed = journeySearchSchema.safeParse({
        from: "Deák Ferenc tér, Budapest",
        to: "Blaha Lujza tér, Budapest",
        departAt: new Date().toISOString(),
        timeMode,
      });
      assert.equal(parsed.success, true, `timeMode=${timeMode} legyen valid`);
    }
  });

  test("F) invalid input: ismeretlen timeMode érték elutasítva", () => {
    const parsed = journeySearchSchema.safeParse({
      from: "Deák Ferenc tér, Budapest",
      to: "Blaha Lujza tér, Budapest",
      departAt: new Date().toISOString(),
      timeMode: "SOMETHING_ELSE",
    });
    assert.equal(parsed.success, false);
  });
});

describe("ARRIVE-BY — orchestrator MOTIS request semantics", () => {
  test("A) DEPART_AT regresszió: timeMode hiányában a MOTIS kérés NEM kap arriveBy paramétert", async () => {
    const seenUrls: string[] = [];
    await withMockedFetch(
      (url) => {
        seenUrls.push(url);
        return { itineraries: [BASE_ITINERARY] };
      },
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: new Date().toISOString(),
        });
        assert.equal(result.ok, true);
        assert.ok(seenUrls.length > 0);
        for (const url of seenUrls) assert.ok(!url.includes("arriveBy"), `nem szabadna arriveBy paraméternek jelen lennie: ${url}`);
      }
    );
  });

  test("B) ARRIVE_BY request semantics: timeMode='ARRIVE_BY' esetén MINDEN MOTIS kérés arriveBy=true paramétert kap", async () => {
    const seenUrls: string[] = [];
    await withMockedFetch(
      (url) => {
        seenUrls.push(url);
        return { itineraries: [BASE_ITINERARY] };
      },
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: "2026-09-06T08:00:00Z",
          timeMode: "ARRIVE_BY",
        });
        assert.equal(result.ok, true);
        assert.ok(seenUrls.length >= 2, "legalább az alap + metrómentes kérésnek meg kell történnie");
        for (const url of seenUrls) {
          assert.ok(url.includes("arriveBy=true"), `arriveBy=true hiányzik: ${url}`);
          assert.ok(url.includes("time=2026-09-06T08%3A00%3A00Z") || url.includes("time=2026-09-06T08:00:00Z"), `time mező hiányzik/hibás: ${url}`);
        }
      }
    );
  });

  test("C) result arrival <= requested deadline: a határidőt túllépő itinerary kiszűrve, a megfelelő megmarad", async () => {
    const deadline = "2026-09-06T08:00:00Z";
    const onTimeItinerary: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T07:41:00Z",
      endTime: "2026-09-06T07:44:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T07:41:00Z", endTime: "2026-09-06T07:44:00Z" }],
    };
    const lateItinerary: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T08:10:00Z",
      endTime: "2026-09-06T08:15:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T08:10:00Z", endTime: "2026-09-06T08:15:00Z" }],
    };
    await withMockedFetch(
      () => ({ itineraries: [onTimeItinerary, lateItinerary] }),
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: deadline,
          timeMode: "ARRIVE_BY",
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          for (const r of result.journeys) {
            assert.ok(
              new Date(r.journey.arrivalTime).getTime() <= new Date(deadline).getTime(),
              `journey.arrivalTime (${r.journey.arrivalTime}) nem lépheti túl a határidőt (${deadline})`
            );
          }
        }
      }
    );
  });

  test("D) timezone/local datetime: +02:00 offsettel megadott határidő ugyanúgy szűr, mint az UTC megfelelője", async () => {
    // 2026-09-06T10:00:00+02:00 === 2026-09-06T08:00:00Z
    const deadlineLocal = "2026-09-06T10:00:00+02:00";
    const onTimeItinerary: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T07:41:00Z",
      endTime: "2026-09-06T07:44:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T07:41:00Z", endTime: "2026-09-06T07:44:00Z" }],
    };
    const lateItinerary: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T08:30:00Z",
      endTime: "2026-09-06T08:35:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T08:30:00Z", endTime: "2026-09-06T08:35:00Z" }],
    };
    await withMockedFetch(
      () => ({ itineraries: [onTimeItinerary, lateItinerary] }),
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: deadlineLocal,
          timeMode: "ARRIVE_BY",
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.journeys.length, 1);
          assert.equal(result.journeys[0].journey.arrivalTime, "2026-09-06T07:44:00Z");
        }
      }
    );
  });

  test("E) midnight boundary: pontban éjfélkor lévő határidő kizárja az éjfél UTÁNI érkezést, megtartja az előttit", async () => {
    const deadline = "2026-09-07T00:00:00Z";
    const beforeMidnight: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T23:55:00Z",
      endTime: "2026-09-06T23:59:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T23:55:00Z", endTime: "2026-09-06T23:59:00Z" }],
    };
    const afterMidnight: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T23:58:00Z",
      endTime: "2026-09-07T00:02:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T23:58:00Z", endTime: "2026-09-07T00:02:00Z" }],
    };
    await withMockedFetch(
      () => ({ itineraries: [beforeMidnight, afterMidnight] }),
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: deadline,
          timeMode: "ARRIVE_BY",
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.journeys.length, 1);
          assert.equal(result.journeys[0].journey.arrivalTime, "2026-09-06T23:59:00Z");
        }
      }
    );
  });

  test("minden itinerary a határidő fölé esik: no_route_found-t ad, nem talál ki útvonalat", async () => {
    const deadline = "2026-09-06T08:00:00Z";
    const lateItinerary: MotisItinerary = {
      ...BASE_ITINERARY,
      startTime: "2026-09-06T08:30:00Z",
      endTime: "2026-09-06T08:35:00Z",
      legs: [{ ...BASE_ITINERARY.legs[0], startTime: "2026-09-06T08:30:00Z", endTime: "2026-09-06T08:35:00Z" }],
    };
    await withMockedFetch(
      () => ({ itineraries: [lateItinerary] }),
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: deadline,
          timeMode: "ARRIVE_BY",
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "no_route_found");
      }
    );
  });

  test("H) ranking regresszió: DEPART_AT módban a meglévő két-stratégia dedup/rangsorolás változatlan (fastest label jelen van)", async () => {
    await withMockedFetch(
      (url) => {
        const isCalmer = url.includes("transitModes=BUS");
        return isCalmer
          ? {
              itineraries: [
                {
                  duration: 1200,
                  startTime: "2026-09-06T07:41:00Z",
                  endTime: "2026-09-06T08:01:00Z",
                  transfers: 0,
                  legs: [{ mode: "BUS", from: { name: "Deák Ferenc tér" }, to: { name: "Blaha Lujza tér" }, duration: 1200, routeShortName: "7" }],
                },
              ],
            }
          : { itineraries: [BASE_ITINERARY] };
      },
      async () => {
        const result = await searchVedettRoutes({
          from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
          to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
          departAt: new Date().toISOString(),
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.journeys.length, 2);
          assert.ok(result.journeys.some((r) => r.labels.includes("FASTEST")));
        }
      }
    );
  });
});

describe("ARRIVE-BY — G) kiválasztott arrive-by journey normál navigációs Journey marad", () => {
  test("a Journey típus nem kap külön arrive-by/timeMode mezőt (nincs külön navigációs state)", () => {
    const journey = mapMotisItineraryToJourney(BASE_ITINERARY);
    assert.equal((journey as Record<string, unknown>).timeMode, undefined);
    assert.equal((journey as Record<string, unknown>).arriveBy, undefined);
  });
});

describe("ARRIVE-BY — route.ts wiring (statikus forrás-ellenőrzés)", () => {
  const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
  const src = readFileSync(ROUTE_PATH, "utf8");

  test("timeMode a cache-kulcs része", () => {
    assert.match(src, /buildRouteCacheKey\(\{[\s\S]*timeMode/);
  });

  test("timeMode átadásra kerül a searchVedettRoutes() hívásnak", () => {
    assert.match(src, /searchVedettRoutes\(\s*\{[\s\S]*timeMode,/);
  });

  test("F) múltbeli időpont validáció mód-specifikus üzenettel, de UGYANAZZAL a numerikus feltétellel fut mindkét módra", () => {
    assert.match(src, /Az érkezési időpont nem lehet a múltban\./);
    assert.match(src, /Az indulási időpont nem lehet a múltban\./);
    assert.match(src, /new Date\(departAt\)\.getTime\(\) < Date\.now\(\) - 60_000/);
  });
});
