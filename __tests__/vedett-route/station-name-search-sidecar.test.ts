// VÉDETT ÚTVONAL — VPS ACCESSIBILITY SIDECAR STATION SEARCH KLIENS +
// PRODUCTION-PATH INTEGRÁCIÓ (2026-09-24, "VPS sidecar állomás-keresés"
// sprint).
//
// EZ A TESZT FEDI LE A KORÁBBI ROOT CAUSE-T: a production Vercel
// deploymenten a .vedett-cache/gtfs-static/<provider>/accessibility-index.json
// SOHA nincs jelen (ephemeral/read-only fájlrendszer) -- az alábbi tesztek
// KIFEJEZETTEN ezt a helyzetet szimulálják (a `loadIndex` MINDIG null-t ad
// vissza, PONTOSAN mint production-ben), és bizonyítják, hogy a
// findGtfsStationCandidates()/resolveManualFieldOrStation() EZ ESETBEN IS
// helyes találatot ad, mert a VPS sidecar-kliens ágon át kapja az adatot --
// NEM a helyi cache-en át.
//
//   node --test __tests__/vedett-route/station-name-search-sidecar.test.ts

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  findGtfsStationCandidates,
  resolveManualFieldOrStation,
  resolveSidecarDatasetHints,
  normalizeStationQuery,
  type ManualFieldGeocodeResult,
  type SidecarStationSearchFn,
} from "../../lib/vedett-route/stationNameSearch.ts";
import {
  lookupStationCandidatesFromSidecar,
  type StationSearchSidecarCandidate,
} from "../../lib/vedett-route/accessibilityLookupClient.ts";
import type { AccessibilityIndex } from "../../lib/vedett-route/accessibilityIndex.ts";

// Production-t szimuláló loader: MINDIG null-t ad, ugyanúgy, ahogy
// getAccessibilityIndex() (staticFileProvider.ts) tenné Vercelen, amikor
// nincs feltöltött .vedett-cache -- lásd a modul fejlécét.
async function productionLikeNullLoader(): Promise<AccessibilityIndex | null> {
  return null;
}

const MARTONVASAR_SIDECAR_CANDIDATE: StationSearchSidecarCandidate = {
  stopId: "829",
  name: "Martonvásár",
  lat: 47.321389,
  lon: 18.781667,
  dataset: "mavgtfs",
};

describe("resolveSidecarDatasetHints — MEGLÉVŐ szinonima-felismerésre épülő, HATÁROLT dataset routing", () => {
  test("vasút-jellegű szinonima (vasútállomás/vonatállomás/pályaudvar/állomás) -> [mavgtfs]", () => {
    for (const word of ["vasútállomás", "vonatállomás", "pályaudvar", "állomás"]) {
      const hints = resolveSidecarDatasetHints(normalizeStationQuery(`Martonvásár ${word}`));
      assert.deepEqual(hints, ["mavgtfs"], `váratlan hint "${word}"-re`);
    }
  });

  test("busz-jellegű szinonima (buszállomás/buszpályaudvar) -> [volangtfs]", () => {
    for (const word of ["buszállomás", "buszpályaudvar"]) {
      const hints = resolveSidecarDatasetHints(normalizeStationQuery(`Népliget ${word}`));
      assert.deepEqual(hints, ["volangtfs"], `váratlan hint "${word}"-re`);
    }
  });

  test("metró/HÉV/megálló -> [bkkgtfs]", () => {
    for (const word of ["metró", "HÉV", "megálló", "megállóhely"]) {
      const hints = resolveSidecarDatasetHints(normalizeStationQuery(`Kossuth tér ${word}`));
      assert.deepEqual(hints, ["bkkgtfs"], `váratlan hint "${word}"-re`);
    }
  });

  test("nincs felismert szinonima -> a HATÁROLT (nem korlátlan), jelenleg 3 ismert dataset mindegyike", () => {
    const hints = resolveSidecarDatasetHints(normalizeStationQuery("Budapest-Kelenföld"));
    assert.deepEqual([...hints].sort(), ["bkkgtfs", "mavgtfs", "volangtfs"]);
  });

  test("SOSEM hardkódol varos-/helynevet a routing-döntésben (a fixture-nevek Martonvásár/Népliget/Kossuth tér csak a teszt saját bemenete, nem a routing logika része)", () => {
    // Ugyanaz a szinonima-szó, MÁS helynévvel, UGYANAZT a hintet adja.
    const a = resolveSidecarDatasetHints(normalizeStationQuery("Aárgyeleg vasútállomás"));
    const b = resolveSidecarDatasetHints(normalizeStationQuery("Zöttyvész vasútállomás"));
    assert.deepEqual(a, b);
    assert.deepEqual(a, ["mavgtfs"]);
  });
});

describe("lookupStationCandidatesFromSidecar — fail-safe HTTP kliens (mockolt fetch, VALÓS hálózat nélkül)", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ACCESSIBILITY_SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
    process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token-do-not-use-in-prod";
    process.env.ACCESSIBILITY_SIDECAR_TIMEOUT_MS = "2000";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test("konfiguráció hiányában (nincs ACCESSIBILITY_SIDECAR_URL/TOKEN) null-t ad, SOSEM dob, és SOSEM hív fetch-et", async () => {
    delete process.env.ACCESSIBILITY_SIDECAR_URL;
    delete process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("SOSEM kellene meghívódnia");
    }) as typeof fetch;
    const result = await lookupStationCandidatesFromSidecar("Martonvásár", "mavgtfs");
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });

  test("sikeres válasz esetén a stops tömböt adja vissza, a dokumentált mezőalakkal", async () => {
    let capturedUrl = "";
    let capturedBody: unknown = null;
    let capturedAuth = "";
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(JSON.stringify({ ok: true, status: "ok", stops: [MARTONVASAR_SIDECAR_CANDIDATE] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await lookupStationCandidatesFromSidecar("Martonvásár", "mavgtfs");
    assert.ok(result);
    assert.equal(result!.length, 1);
    assert.deepEqual(result![0], MARTONVASAR_SIDECAR_CANDIDATE);
    assert.match(capturedUrl, /\/station-search$/);
    assert.deepEqual(capturedBody, { dataset: "mavgtfs", query: "Martonvásár" });
    assert.equal(capturedAuth, "Bearer test-token-do-not-use-in-prod");
  });

  test('"unavailable" status (dataset ismert, de még nincs betöltve generation) -> null, NEM hiba', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, status: "unavailable" }), { status: 200, headers: { "Content-Type": "application/json" } })
    ) as typeof fetch;
    const result = await lookupStationCandidatesFromSidecar("Martonvásár", "mavgtfs");
    assert.equal(result, null);
  });

  test("HTTP hibastátusz (pl. 500) -> null, sosem dob kivételt", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const result = await lookupStationCandidatesFromSidecar("Martonvásár", "mavgtfs");
    assert.equal(result, null);
  });

  test("malformed JSON válasz -> null, sosem dob kivételt", async () => {
    globalThis.fetch = (async () => new Response("{ nem json", { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    const result = await lookupStationCandidatesFromSidecar("Martonvásár", "mavgtfs");
    assert.equal(result, null);
  });

  test("hálózati kivétel (pl. timeout/connection refused) -> null, sosem dob kivételt a hívóra", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await lookupStationCandidatesFromSidecar("Martonvásár", "mavgtfs");
    assert.equal(result, null);
  });

  test("üres query esetén null-t ad, fetch NÉLKÜL", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("SOSEM kellene meghívódnia");
    }) as typeof fetch;
    const result = await lookupStationCandidatesFromSidecar("   ", "mavgtfs");
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });
});

describe("findGtfsStationCandidates — PRODUCTION-PATH: helyi .vedett-cache HIÁNYA (null loader) mellett a sidecar-ág adja a valódi találatot", () => {
  test("a helyi loader MINDIG null (production-szimuláció), a sidecarSearch stub adja a Martonvásár candidate-et -> a végeredmény TARTALMAZZA", async () => {
    const sidecarStub: SidecarStationSearchFn = async (query, dataset) => {
      assert.equal(dataset, "mavgtfs");
      assert.match(query, /Martonvásár/);
      return [MARTONVASAR_SIDECAR_CANDIDATE];
    };
    const results = await findGtfsStationCandidates(
      "Martonvásár vasútállomás",
      productionLikeNullLoader,
      8,
      sidecarStub,
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "Martonvásár");
    assert.equal(results[0].lat, 47.321389);
    assert.equal(results[0].lon, 18.781667);
    assert.equal(results[0].source, "gtfs");
    assert.equal(results[0].provider, "MAV_RAIL");
    assert.equal(results[0].type, "transit_station");
  });

  test("a sidecar hibája/timeoutja (null-t ad) esetén a helyi loader eredménye (ha van) VÁLTOZATLANUL megmarad -- egyik forrás hibája sem állítja meg a másikat", async () => {
    const failingSidecarStub: SidecarStationSearchFn = async () => null;
    const localLoader = async (dirName: string): Promise<AccessibilityIndex | null> => {
      if (dirName !== "mav_rail") return null;
      return {
        provider: "MAV_RAIL",
        generation: "g1",
        builtAt: new Date().toISOString(),
        stopsById: { L1: { stopId: "L1", stopName: "Martonvásár", latitude: 47.2967, longitude: 18.7864 } },
        tripsById: {},
        pathways: [],
      };
    };
    const results = await findGtfsStationCandidates("Martonvásár vasútállomás", localLoader, 8, failingSidecarStub);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "L1");
  });

  test("TÖBB sidecar-candidate esetén NEM választ önkényesen egyet -- mindkettő bekerül az egyesített listába", async () => {
    // "Kelenföld"-nek NINCS felismert szinonima-szava -> resolveSidecarDatasetHints
    // a HATÁROLT, mindhárom ismert dataset-et lekérdezi (lásd a fenti
    // "resolveSidecarDatasetHints" leíró blokk) -- a stub ezért KIZÁRÓLAG a
    // "bkkgtfs" hívásra ad találatot, a többi (mavgtfs/volangtfs) hívásra
    // üreset, hogy a teszt a valódi (bounded, nem korlátlan) fan-out
    // viselkedést tükrözze, ne mesterségesen szorozza meg a találatokat.
    const multiStub: SidecarStationSearchFn = async (_query, dataset) => {
      if (dataset !== "bkkgtfs") return [];
      return [
        { stopId: "S1", name: "Kelenföld", lat: 47.4692, lon: 19.0392, dataset: "bkkgtfs" },
        { stopId: "S2", name: "Kelenföld alsó", lat: 47.47, lon: 19.04, dataset: "bkkgtfs" },
      ];
    };
    const results = await findGtfsStationCandidates("Kelenföld", productionLikeNullLoader, 8, multiStub);
    assert.equal(results.length, 2);
  });

  test("sidecar által visszaadott, a query-re nem illeszkedő nevet (védekező, elvileg sosem fordulhat elő) kiszűri, sosem dob", async () => {
    const noisyStub: SidecarStationSearchFn = async () => [
      { stopId: "IRRELEVANT", name: "Teljesen Más Hely", lat: 47.0, lon: 18.0, dataset: "bkkgtfs" },
    ];
    const results = await findGtfsStationCandidates("Martonvásár vasútállomás", productionLikeNullLoader, 8, noisyStub);
    assert.equal(results.length, 0);
  });
});

describe("E) MANUAL SUBMIT regresszió a VALÓDI production-hézagra (mockolt fetch, a resolveManualFieldOrStation VALÓDI, alapértelmezett sidecar-kliens ágán át): nincs .vedett-cache, nincs autocomplete-választás -> a sidecar adja a helyes koordinátát", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ACCESSIBILITY_SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
    process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token-do-not-use-in-prod";
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { dataset: string; query: string };
      if (body.dataset === "mavgtfs" && /martonv[aá]s[aá]r/i.test(body.query)) {
        return new Response(JSON.stringify({ ok: true, status: "ok", stops: [MARTONVASAR_SIDECAR_CANDIDATE] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, status: "ok", stops: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test('city="Martonvásár" + place="vasútállomás", loadIndex MINDIG null (production) -> resolveManualFieldOrStation EXACT találatot ad a VALÓDI (mockolt HTTP-n át hívott) sidecar-kliensen keresztül, geocodeFallback SOSEM hívódik', async () => {
    const neverCalledGeocode = async (query: string) => {
      throw new Error(`geocodeFallback SOSEM hívódhat itt (kapott query: "${query}") -- ez a korábbi production hiba pontos oka volna`);
    };
    const result = await resolveManualFieldOrStation("Martonvásár, vasútállomás", productionLikeNullLoader, neverCalledGeocode);
    assert.ok(result, "nem adhat null-t egy valódi sidecar-találatra");
    assert.equal((result as ManualFieldGeocodeResult).quality, "EXACT");
    assert.equal((result as ManualFieldGeocodeResult).name, "Martonvásár");
    assert.equal((result as ManualFieldGeocodeResult).lat, 47.321389);
    assert.equal((result as ManualFieldGeocodeResult).lon, 18.781667);
  });
});

describe("F) AUTOCOMPLETE regresszió, UGYANAZZAL a production-hézaggal: findGtfsStationCandidates a VALÓDI (mockolt HTTP-n át hívott) sidecar-kliens alapértelmezett ágán is helyes találatot ad", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ACCESSIBILITY_SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
    process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token-do-not-use-in-prod";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { dataset: string; query: string };
      if (body.dataset === "mavgtfs" && /martonv[aá]s[aá]r/i.test(body.query)) {
        return new Response(JSON.stringify({ ok: true, status: "ok", stops: [MARTONVASAR_SIDECAR_CANDIDATE] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, status: "ok", stops: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test('autocomplete-jellegű hívás (nincs sidecarSearch injektálva, tehát a VALÓDI kliens-ág fut) -- "Martonvásár vasútállomás" -> a mockolt HTTP-válaszból épített candidate a végeredményben', async () => {
    const results = await findGtfsStationCandidates("Martonvásár vasútállomás", productionLikeNullLoader);
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "Martonvásár");
    assert.equal(results[0].lat, 47.321389);
    assert.equal(results[0].lon, 18.781667);
    assert.equal(results[0].type, "transit_station");
    assert.equal(results[0].provider, "MAV_RAIL");
  });
});
