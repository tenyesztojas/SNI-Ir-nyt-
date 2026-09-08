// Sprint E.1 — Real Rest Point Discovery tesztek.
//   node --test __tests__/vedett-route/sprint-e1-discovery.test.ts
//
// Lefedi: OSM tag -> attribútum leképezés (UNKNOWN != FALSE, kategória-
// szűkítés, access szabályok), determinisztikus dedupe (VEDETT_SAROK >
// OSM prioritás, USER sosem vonódik össze mással, konzervatív név/
// távolság egyezés), aggregator (partial failure, radius-fallback,
// max eredményszám NEM vágja a nyers listát csak a rangsorolt kimenetet),
// és a kategória-címkék/gyorsszűrők (spec 9. pont, csak valós mezőkön).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OSM_CATEGORY_DEFS,
  matchOsmCategory,
  deriveOsmAttributes,
  deriveOsmPointName,
  type OsmElementTags,
} from "../../lib/vedett-route/restStopFlow/discovery/osmTagMapping.ts";
import { dedupeRestPoints } from "../../lib/vedett-route/restStopFlow/dedupe.ts";
import {
  discoverRestPoints,
  INITIAL_SEARCH_RADIUS_METERS,
  EXPANDED_SEARCH_RADIUS_METERS,
} from "../../lib/vedett-route/restStopFlow/aggregator.ts";
import type { RestPointProvider, ProviderResult } from "../../lib/vedett-route/restStopFlow/discovery/types.ts";
import {
  categoryLabelFor,
  applyRestPointQuickFilter,
  REST_POINT_QUICK_FILTERS,
} from "../../lib/vedett-route/restStopFlow/categoryLabels.ts";
import type { RestPoint } from "../../lib/rest-points/types.ts";

function makeRestPoint(overrides: Partial<RestPoint> = {}): RestPoint {
  return {
    id: "rp-1",
    createdBy: "user-1",
    name: "Teszt pont",
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
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

// --- osmTagMapping.ts ---

test("OSM_CATEGORY_DEFS pontosan a spec 8 kategóriáját tartalmazza", () => {
  const categories = OSM_CATEGORY_DEFS.map((d) => d.category).sort();
  assert.deepEqual(categories, ["BENCH", "COMMUNITY", "GARDEN", "LIBRARY", "PARK", "PICNIC", "SHELTER", "TOILET"].sort());
});

test("matchOsmCategory: amenity=bench -> BENCH", () => {
  const def = matchOsmCategory({ amenity: "bench" });
  assert.equal(def?.category, "BENCH");
});

test("matchOsmCategory: shop=bakery (kizárt kategória) -> null", () => {
  assert.equal(matchOsmCategory({ shop: "bakery" }), null);
});

test("matchOsmCategory: amenity=restaurant (kizárt) -> null", () => {
  assert.equal(matchOsmCategory({ amenity: "restaurant" }), null);
});

test("deriveOsmAttributes: amenity=bench -> seating=true, toilet marad null (UNKNOWN != FALSE)", () => {
  const attrs = deriveOsmAttributes("BENCH", { amenity: "bench" });
  assert.equal(attrs.seating, true);
  assert.equal(attrs.toilet, null, "hiányzó toilets tag esetén a toilet mező NEM lehet false");
});

test("deriveOsmAttributes: amenity=toilets -> toilet=true", () => {
  const attrs = deriveOsmAttributes("TOILET", { amenity: "toilets" });
  assert.equal(attrs.toilet, true);
});

test("deriveOsmAttributes: toilets=yes tag bármely kategórián -> toilet=true", () => {
  const attrs = deriveOsmAttributes("SHELTER", { amenity: "shelter", toilets: "yes" });
  assert.equal(attrs.toilet, true);
});

test("deriveOsmAttributes: PARK kategória NEM állítja quietSpace-t (soha nem következtetünk csendességre OSM-ből)", () => {
  const attrs = deriveOsmAttributes("PARK", { leisure: "park" });
  assert.equal("quietSpace" in attrs, false, "az OsmDerivedAttributes típus szándékosan nem is tartalmaz quietSpace mezőt");
});

test("deriveOsmAttributes: LIBRARY kategória indoors=true, de nincs semmilyen csendesség-attribútum", () => {
  const attrs = deriveOsmAttributes("LIBRARY", { amenity: "library" });
  assert.equal(attrs.indoors, true);
});

test("deriveOsmAttributes: access=private -> excludedPrivateAccess=true", () => {
  const attrs = deriveOsmAttributes("BENCH", { amenity: "bench", access: "private" });
  assert.equal(attrs.excludedPrivateAccess, true);
});

test("deriveOsmAttributes: access=no -> excludedPrivateAccess=true", () => {
  const attrs = deriveOsmAttributes("BENCH", { amenity: "bench", access: "no" });
  assert.equal(attrs.excludedPrivateAccess, true);
});

test("deriveOsmAttributes: access=customers -> restrictedAccess=true, DE NEM excludedPrivateAccess", () => {
  const attrs = deriveOsmAttributes("TOILET", { amenity: "toilets", access: "customers" });
  assert.equal(attrs.restrictedAccess, true);
  assert.equal(attrs.excludedPrivateAccess, false);
});

test("deriveOsmAttributes: fee=yes -> purchaseRequired=true, fee hiányában null", () => {
  const withFee = deriveOsmAttributes("PICNIC", { leisure: "picnic_table", fee: "yes" });
  assert.equal(withFee.purchaseRequired, true);
  const withoutFee = deriveOsmAttributes("PICNIC", { leisure: "picnic_table" });
  assert.equal(withoutFee.purchaseRequired, null);
});

test("deriveOsmPointName: valós name tag esetén azt használja, egyébként a generikus kategórianevet", () => {
  const def = OSM_CATEGORY_DEFS.find((d) => d.category === "PARK")!;
  assert.equal(deriveOsmPointName(def, { name: "Margitsziget" }), "Margitsziget");
  assert.equal(deriveOsmPointName(def, {}), "Park");
});

test("deriveOsmAttributes: teljesen üres tags esetén minden ismeretlen mező null marad (nincs hallgatólagos false)", () => {
  const attrs = deriveOsmAttributes("GARDEN", {} as OsmElementTags);
  assert.equal(attrs.toilet, null);
  assert.equal(attrs.purchaseRequired, null);
});

// --- dedupe.ts ---

test("dedupeRestPoints: azonos hely (közeli koordináta + egyező név) VEDETT_SAROK és OSM között -> csak a VEDETT_SAROK marad", () => {
  const points = [
    makeRestPoint({ id: "osm:node/1", source: "OSM", visibility: "PUBLIC", name: "Városliget", latitude: 47.516, longitude: 19.077 }),
    makeRestPoint({ id: "vedett-sarok:1", source: "VEDETT_SAROK", visibility: "PUBLIC", name: "Városliget", latitude: 47.5161, longitude: 19.0771 }),
  ];
  const deduped = dedupeRestPoints(points);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].source, "VEDETT_SAROK");
});

test("dedupeRestPoints: távoli (>30m), eltérő nevű pontok NEM vonódnak össze, még ha ugyanaz a forrás-pár is", () => {
  const points = [
    makeRestPoint({ id: "osm:node/1", source: "OSM", visibility: "PUBLIC", name: "Pad A", latitude: 47.5, longitude: 19.05 }),
    makeRestPoint({ id: "osm:node/2", source: "OSM", visibility: "PUBLIC", name: "Pad B", latitude: 47.51, longitude: 19.06 }),
  ];
  const deduped = dedupeRestPoints(points);
  assert.equal(deduped.length, 2, "két külön pad ugyanabban a parkban SOHA nem vonódik automatikusan össze");
});

test("dedupeRestPoints: USER pont sosem vonódik össze semmivel, még pontos koordináta-egyezés esetén sem", () => {
  const points = [
    makeRestPoint({ id: "user:1", source: "USER", visibility: "PRIVATE", name: "Padom", latitude: 47.5, longitude: 19.05 }),
    makeRestPoint({ id: "osm:node/1", source: "OSM", visibility: "PUBLIC", name: "Padom", latitude: 47.5, longitude: 19.05 }),
  ];
  const deduped = dedupeRestPoints(points);
  assert.equal(deduped.length, 2, "USER pont mindig privát, saját — sosem olvad össze más forrás találatával");
});

test("dedupeRestPoints: közeli koordináta, DE teljesen eltérő név -> NEM vonódik össze (konzervatív heurisztika)", () => {
  const points = [
    makeRestPoint({ id: "osm:node/1", source: "OSM", visibility: "PUBLIC", name: "Nyilvános mosdó", latitude: 47.5, longitude: 19.05 }),
    makeRestPoint({ id: "vedett-sarok:1", source: "VEDETT_SAROK", visibility: "PUBLIC", name: "Kávézó Kert", latitude: 47.50001, longitude: 19.05001 }),
  ];
  const deduped = dedupeRestPoints(points);
  assert.equal(deduped.length, 2);
});

test("dedupeRestPoints: üres bemenetre üres tömböt ad, nem dob kivételt", () => {
  assert.deepEqual(dedupeRestPoints([]), []);
});

// --- aggregator.ts ---

function makeProvider(name: RestPointProvider["name"], result: ProviderResult): RestPointProvider {
  return { name, findNearby: async () => result };
}

test("discoverRestPoints: mindhárom forrás sikeres -> partial=false, nincs radius-bővítés", async () => {
  const providers: RestPointProvider[] = [
    makeProvider("user", { status: "ok", points: [makeRestPoint({ id: "u1", source: "USER" })] }),
    makeProvider("vedettSarok", { status: "ok", points: [] }),
    makeProvider("osm", { status: "ok", points: [] }),
  ];
  const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });
  assert.equal(result.partial, false);
  assert.equal(result.expandedSearch, false);
  assert.equal(result.searchRadiusMeters, INITIAL_SEARCH_RADIUS_METERS);
  assert.equal(result.points.length, 1);
  assert.equal(result.sources.user.ok, true);
});

test("discoverRestPoints: PARTIAL FAILURE — egy forrás (OSM) hibázik, DE a többi eredménye megmarad, a végeredmény nem 'romlik el'", async () => {
  const providers: RestPointProvider[] = [
    makeProvider("user", { status: "ok", points: [makeRestPoint({ id: "u1", source: "USER" })] }),
    makeProvider("vedettSarok", { status: "ok", points: [] }),
    makeProvider("osm", { status: "unavailable", reason: "timeout" }),
  ];
  const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });
  assert.equal(result.partial, true);
  assert.equal(result.points.length, 1, "az OSM hibája ellenére a USER találat megmarad");
  assert.equal(result.sources.osm.ok, false);
  assert.equal(result.sources.osm.reason, "timeout");
});

test("discoverRestPoints: nulla első-körös találat -> EGYSZERI 1500m-es bővítés, expandedSearch=true", async () => {
  let callCount = 0;
  const radiiSeen: number[] = [];
  const providers: RestPointProvider[] = [
    {
      name: "user",
      findNearby: async (params) => {
        callCount++;
        radiiSeen.push(params.radiusMeters);
        // Csak a bővített (1500m) körben ad találatot.
        if (params.radiusMeters === EXPANDED_SEARCH_RADIUS_METERS) {
          return { status: "ok", points: [makeRestPoint({ id: "u1", source: "USER" })] };
        }
        return { status: "ok", points: [] };
      },
    },
    makeProvider("vedettSarok", { status: "ok", points: [] }),
    makeProvider("osm", { status: "ok", points: [] }),
  ];
  const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });
  assert.equal(result.expandedSearch, true);
  assert.equal(result.searchRadiusMeters, EXPANDED_SEARCH_RADIUS_METERS);
  assert.equal(result.points.length, 1);
  assert.equal(callCount, 2, "a providert pontosan kétszer hívjuk (800m, majd 1500m) — SOSEM végtelen bővítés");
  assert.deepEqual(radiiSeen, [INITIAL_SEARCH_RADIUS_METERS, EXPANDED_SEARCH_RADIUS_METERS]);
});

test("discoverRestPoints: nulla találat MÉG a bővített körben is -> expandedSearch=true, points=[]", async () => {
  const providers: RestPointProvider[] = [
    makeProvider("user", { status: "ok", points: [] }),
    makeProvider("vedettSarok", { status: "ok", points: [] }),
    makeProvider("osm", { status: "ok", points: [] }),
  ];
  const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });
  assert.equal(result.expandedSearch, true);
  assert.equal(result.points.length, 0);
  assert.equal(result.partial, false, "mind a három forrás sikeresen válaszolt, csak nem volt találat");
});

test("discoverRestPoints: egyetlen provider dobása (nem kezelt kivétel) sem 500-al a teljes felfedezést — védelmi háló", async () => {
  const providers: RestPointProvider[] = [
    { name: "user", findNearby: async () => { throw new Error("váratlan hiba"); } },
    makeProvider("vedettSarok", { status: "ok", points: [makeRestPoint({ id: "vs1", source: "VEDETT_SAROK", visibility: "PUBLIC" })] }),
    makeProvider("osm", { status: "ok", points: [] }),
  ];
  const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });
  assert.equal(result.partial, true);
  assert.equal(result.points.length, 1);
});

test("discoverRestPoints: a visszaadott points NINCS levágva MAX_REST_POINTS-ra (a vágás a hívó, route.ts felelőssége a rangsorolás UTÁN)", async () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    makeRestPoint({ id: `osm:node/${i}`, source: "OSM", visibility: "PUBLIC", name: `Pad ${i}`, latitude: 47.5 + i * 0.001, longitude: 19.05 })
  );
  const providers: RestPointProvider[] = [
    makeProvider("user", { status: "ok", points: [] }),
    makeProvider("vedettSarok", { status: "ok", points: [] }),
    makeProvider("osm", { status: "ok", points: many }),
  ];
  const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });
  assert.equal(result.points.length, 20);
});

// --- categoryLabels.ts ---

test("categoryLabelFor: explicit category mező elsőbbséget élvez", () => {
  const rp = makeRestPoint({ source: "OSM", visibility: "PUBLIC", category: "TOILET" });
  assert.equal(categoryLabelFor(rp).category, "TOILET");
});

test("categoryLabelFor: category hiányában a forrás alapján esik vissza (USER/VEDETT_SAROK), sosem fabrikál kategóriát", () => {
  const userPoint = makeRestPoint({ source: "USER" });
  assert.equal(categoryLabelFor(userPoint).category, "USER");
  const vedettPoint = makeRestPoint({ source: "VEDETT_SAROK", visibility: "PUBLIC" });
  assert.equal(categoryLabelFor(vedettPoint).category, "VEDETT_SAROK");
});

test("REST_POINT_QUICK_FILTERS: pontosan az 5 spec szerinti szűrő, csak valós mezőkön", () => {
  assert.equal(REST_POINT_QUICK_FILTERS.length, 5);
  assert.deepEqual(REST_POINT_QUICK_FILTERS.map((f) => f.key), ["ALL", "SEATING", "TOILET", "GREEN", "INDOOR"]);
});

test("applyRestPointQuickFilter('SEATING'): csak a ténylegesen seating=true pontokat adja vissza, null NEM számít találatnak", () => {
  const points = [
    makeRestPoint({ id: "1", seating: true }),
    makeRestPoint({ id: "2", seating: false }),
    makeRestPoint({ id: "3", seating: null }),
  ];
  const filtered = applyRestPointQuickFilter(points, "SEATING");
  assert.deepEqual(filtered.map((p) => p.id), ["1"]);
});

test("applyRestPointQuickFilter('ALL'): nem szűr, az eredeti listát adja vissza", () => {
  const points = [makeRestPoint({ id: "1" }), makeRestPoint({ id: "2" })];
  assert.deepEqual(applyRestPointQuickFilter(points, "ALL"), points);
});
