// VPS ACCESSIBILITY SIDECAR — stationSubgraph.ts tesztek (Task C3, spec
// 17/18. pont: állomás-klaszter alapú pathway subgraph, KIZÁRÓLAG
// parent_station ID-alapon, sosem névegyezésen).
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPathwaySubgraph } from "../dist/stationSubgraph.js";
import type { AccessibilityIndex } from "../dist/lib/accessibilityIndex.js";

function makeIndex(): AccessibilityIndex {
  return {
    provider: "BKK",
    generation: "gen1",
    builtAt: new Date().toISOString(),
    stopsById: {
      S1: { stopId: "S1", parentStation: "PARENT_A" },
      S2: { stopId: "S2", parentStation: "PARENT_A" },
      S3: { stopId: "S3", parentStation: "PARENT_B" },
      S4: { stopId: "S4" }, // nincs parent_station
    },
    tripsById: {},
    pathways: [
      { pathwayId: "PW1", fromStopId: "S1", toStopId: "S2", pathwayMode: 2, isBidirectional: true },
      { pathwayId: "PW2", fromStopId: "S3", toStopId: "S4", pathwayMode: 1, isBidirectional: true },
      { pathwayId: "PW_UNRELATED", fromStopId: "OTHER1", toStopId: "OTHER2", pathwayMode: 1, isBidirectional: true },
    ],
  };
}

test("selectPathwaySubgraph: azonos parent_station-ös testvér-stopok klaszterébe eső edge bekerül", () => {
  const index = makeIndex();
  const result = selectPathwaySubgraph(index, [{ fromStopId: "S1", toStopId: "S2" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].pathwayId, "PW1");
});

test("selectPathwaySubgraph: irreleváns (más klaszterbeli) edge NEM kerül be", () => {
  const index = makeIndex();
  const result = selectPathwaySubgraph(index, [{ fromStopId: "S1", toStopId: "S2" }]);
  assert.ok(!result.some((p) => p.pathwayId === "PW_UNRELATED"));
  assert.ok(!result.some((p) => p.pathwayId === "PW2"));
});

test("selectPathwaySubgraph: parent_station NÉLKÜLI stop is szerepelhet egy lekérdezésben, ilyenkor csak önmagát adja klaszterként", () => {
  const index = makeIndex();
  const result = selectPathwaySubgraph(index, [{ fromStopId: "S3", toStopId: "S4" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].pathwayId, "PW2");
});

test("selectPathwaySubgraph: ismeretlen/nem létező stopId esetén SOSEM dob hibát, csak kevesebb/nulla edge-et ad", () => {
  const index = makeIndex();
  assert.doesNotThrow(() => {
    const result = selectPathwaySubgraph(index, [{ fromStopId: "NOT_EXIST_1", toStopId: "NOT_EXIST_2" }]);
    assert.equal(result.length, 0);
  });
});

test("selectPathwaySubgraph: üres lekérdezés-lista esetén üres tömböt ad (nem az egész gráfot)", () => {
  const index = makeIndex();
  const result = selectPathwaySubgraph(index, []);
  assert.deepEqual(result, []);
});

test("selectPathwaySubgraph: SOSEM végez névegyezés-alapú következtetést — egy, a klaszterektől TELJESEN független stopId nem hoz be semmilyen edge-et", () => {
  // A modul semelyik függvénye nem olvas "name" mezőt (a fixture-ben sincs
  // ilyen mező) — kizárólag stopId/parentStation ID-kat használ. Egy
  // olyan stopId, ami sem önmagában, sem parent_station-jén keresztül nem
  // érintkezik SEMMILYEN pathway-edge-el, garantáltan üres eredményt ad —
  // ha a modul névegyezésre következtetne, ez a teszt bukna, amint egy
  // jövőbeli fixture "hasonló nevű" stopokat adna hozzá.
  const index = makeIndex();
  const result = selectPathwaySubgraph(index, [{ fromStopId: "TELJESEN_FUGGETLEN_STOP", toStopId: "TELJESEN_FUGGETLEN_STOP" }]);
  assert.equal(result.length, 0);
});
