// VÉDETT ÚTVONAL — REALTIME COMMUNITY INTELLIGENCE ENGINE (2026-10-06)
//   node --test __tests__/vedett-route/community-realtime.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateRealtimeRoutingPenalty,
  computeCommunityRealtimeState,
  quantizePenalty,
  realtimeFreshness,
  resolveMatchLevel,
  type RealtimeReportRecord,
  type RealtimeStateQuery,
} from "../../lib/vedett-route/communityReports/realtimeEngine.ts";
import { NAVIGATION_WARNING_CONFIG, REALTIME_CONFIDENCE_CONFIG, REALTIME_ROUTING_PENALTY_CONFIG } from "../../lib/vedett-route/communityReports/realtimeConfig.ts";
import { selectNavigationCommunityWarning } from "../../lib/vedett-route/communityReports/navigationWarning.ts";
import { computeReporterScopeToken, reporterTokenScope } from "../../lib/vedett-route/communityReports/reporterToken.ts";
import { communityStateQuerySchema } from "../../lib/vedett-route/communityReports/realtimeSchemas.ts";
import { computeCommunityReportExpiresAt } from "../../lib/vedett-route/communityReports/ttl.ts";
import type { CommunityReportType } from "../../lib/vedett-route/communityReports/config.ts";
import { MemoryRateLimiter } from "../../lib/rate-limit/memory.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const stripComments = (src: string) => src.replace(/^\s*(\/\/|--).*$/gm, "");

const NOW = new Date("2026-10-06T16:00:00Z");
const TRIP = "20261006_17:40_bkkgtfs_C1";
const SEG = "bkkgtfs_F1>bkkgtfs_F2";
const Q: RealtimeStateQuery = { tripId: TRIP, routeId: "bkkgtfs_0050", segmentKey: SEG, geoCell: "g0.01:4749:1904", now: NOW };

let seq = 0;
function rec(type: CommunityReportType, minutesAgo: number, over: Partial<RealtimeReportRecord> = {}): RealtimeReportRecord {
  const created = new Date(NOW.getTime() - minutesAgo * 60_000);
  seq += 1;
  return {
    reportType: type,
    createdAt: created.toISOString(),
    expiresAt: computeCommunityReportExpiresAt(type, created).toISOString(),
    intensity: null,
    baseConfidence: 0.333,
    contextConfidence: 1,
    tripId: TRIP,
    routeId: "bkkgtfs_0050",
    segmentKey: SEG,
    geoCell: "g0.01:4749:1904",
    reporterToken: `tok${String(seq).padStart(13, "0")}`,
    ...over,
  };
}
const stateOf = (records: RealtimeReportRecord[], kind: string, q = Q) => computeCommunityRealtimeState(records, q).states.find((s) => s.kind === kind);

describe("freshness / TTL", () => {
  test("friss report teljes súlyú, lejárt 0", () => {
    assert.equal(realtimeFreshness(rec("traffic_jam", 0), NOW), 1);
    assert.equal(realtimeFreshness(rec("traffic_jam", 31), NOW), 0);
    assert.equal(stateOf([rec("traffic_jam", 31)], "traffic_jam"), undefined);
  });
  test("folyamatos, típusfüggő decay (megállt jármű gyorsabban avul, mint a dugó)", () => {
    const jam8 = realtimeFreshness(rec("traffic_jam", 8), NOW);
    assert.ok(Math.abs(jam8 - 0.5) < 1e-9);
    const jam4 = realtimeFreshness(rec("traffic_jam", 4), NOW);
    assert.ok(jam4 > jam8 && jam4 < 1);
    assert.ok(realtimeFreshness(rec("vehicle_stopped", 8), NOW) < jam8);
  });
});

describe("egyetlen report / kontextus-erősség", () => {
  test("egy onboard, trip+szakasz egyező dugó: van állapot, de nem 'biztos' és nincs figyelmeztetés/penalty", () => {
    const s = stateOf([rec("traffic_jam", 0)], "traffic_jam")!;
    assert.equal(s.matchLevel, "trip_segment");
    assert.equal(s.independentReportCount, 1);
    assert.ok(s.confidence > 0.3 && s.confidence <= REALTIME_CONFIDENCE_CONFIG.singleReporterMaxConfidence, String(s.confidence));
    assert.equal(s.routingPenalty, 0);
    assert.equal(selectNavigationCommunityWarning([s], null), null);
  });
  test("gyalogos (alacsony context_confidence) report sokkal gyengébb", () => {
    const strong = stateOf([rec("traffic_jam", 0)], "traffic_jam")!.confidence;
    const weak = stateOf([rec("traffic_jam", 0, { contextConfidence: 0.3 })], "traffic_jam")!.confidence;
    assert.ok(weak < strong / 2, `${weak} vs ${strong}`);
  });
  test("üres bemenet -> üres állapot, penalty 0", () => {
    const r = computeCommunityRealtimeState([], Q);
    assert.deepEqual(r.states, []);
    assert.equal(aggregateRealtimeRoutingPenalty(r.states), 0);
  });
});

describe("matching hierarchia", () => {
  test("trip+szakasz > trip > route+szakasz > route; area csak földrajzi lekérdezésnél", () => {
    assert.equal(resolveMatchLevel(rec("traffic_jam", 0), Q), "trip_segment");
    assert.equal(resolveMatchLevel(rec("traffic_jam", 0, { segmentKey: "x>y" }), Q), "trip");
    assert.equal(resolveMatchLevel(rec("traffic_jam", 0, { tripId: "other" }), Q), "route_segment");
    assert.equal(resolveMatchLevel(rec("traffic_jam", 0, { tripId: "other", segmentKey: "x>y" }), Q), "route");
    assert.equal(resolveMatchLevel(rec("traffic_jam", 0, { tripId: "other", routeId: "other" }), Q), null, "közeli, de más járat nem ugyanaz");
    const geoOnly = { ...Q, tripId: null, routeId: null, segmentKey: null };
    assert.equal(resolveMatchLevel(rec("traffic_jam", 0, { tripId: "other", routeId: "other" }), geoOnly), "area");
  });
  test("trip-only fallback gyengébb, mint a pontos trip+szakasz", () => {
    const exact = stateOf([rec("traffic_jam", 0), rec("traffic_jam", 0)], "traffic_jam")!;
    const tripOnly = stateOf([rec("traffic_jam", 0, { segmentKey: "x>y" }), rec("traffic_jam", 0, { segmentKey: "x>y" })], "traffic_jam")!;
    assert.equal(tripOnly.matchLevel, "trip");
    assert.ok(tripOnly.confidence < exact.confidence);
  });
  test("járműhöz kötött jelenség (zsúfoltság) MÁS tripről nem érvényes", () => {
    assert.equal(stateOf([rec("very_crowded", 0, { tripId: "other" }), rec("very_crowded", 0, { tripId: "other" })], "crowding"), undefined);
  });
  test("nem releváns közeli report (más vonal, ugyanaz a cella) a trip-lekérdezést nem befolyásolja", () => {
    const r = computeCommunityRealtimeState([rec("traffic_jam", 0, { tripId: "x", routeId: "y", segmentKey: "a>b" })], Q);
    assert.deepEqual(r.states, []);
  });
});

describe("corroboration / dedup", () => {
  test("több független friss report növeli a confidence-t, de korlátos", () => {
    const c = (n: number) => stateOf(Array.from({ length: n }, () => rec("traffic_jam", 1)), "traffic_jam")!.confidence;
    assert.ok(c(2) > c(1) && c(3) > c(2) && c(10) > c(3));
    assert.ok(c(50) <= REALTIME_CONFIDENCE_CONFIG.maxConfidence);
  });
  test("ugyanazon reporter (azonos token) 5 jelzése = 1 független megerősítés", () => {
    const same = Array.from({ length: 5 }, (_, i) => rec("traffic_jam", i, { reporterToken: "aaaaaaaaaaaaaaaa" }));
    const s = stateOf(same, "traffic_jam")!;
    assert.equal(s.independentReportCount, 1);
    assert.ok(s.confidence <= REALTIME_CONFIDENCE_CONFIG.singleReporterMaxConfidence);
    assert.equal(s.routingPenalty, 0);
  });
  test("legacy (token nélküli, v1) rekordok kompatibilisek: mindegyik külön csoport, hiányzó confidence-ek alapértékkel", () => {
    const legacy = [rec("crowded", 1, { reporterToken: null, contextConfidence: null, baseConfidence: null }), rec("very_crowded", 2, { reporterToken: null, contextConfidence: null, baseConfidence: null })];
    const s = stateOf(legacy, "crowding")!;
    assert.equal(s.independentReportCount, 2);
    assert.equal(s.intensity, 3);
    assert.ok(s.confidence < 0.3, "legacy, ismeretlen fázisú adat gyenge");
  });
  test("ellen-bizonyíték ('Nyugodt') csökkenti a zsúfoltság confidence-ét", () => {
    const base = [rec("very_crowded", 1), rec("very_crowded", 1)];
    const withQuiet = [...base, rec("quiet", 0), rec("quiet", 0)];
    assert.ok(stateOf(withQuiet, "crowding")!.confidence < stateOf(base, "crowding")!.confidence);
  });
  test("determinisztikus: ugyanaz az input -> ugyanaz az output", () => {
    const input = [rec("traffic_jam", 1), rec("traffic_jam", 3), rec("noisy", 2)];
    assert.deepEqual(computeCommunityRealtimeState(input, Q), computeCommunityRealtimeState(input, Q));
  });
  test("breakdown csak kérésre, és nem tartalmaz tokent", () => {
    const input = [rec("traffic_jam", 1), rec("traffic_jam", 2)];
    assert.equal(computeCommunityRealtimeState(input, Q).breakdown, undefined);
    const withBreakdown = computeCommunityRealtimeState(input, Q, { includeBreakdown: true });
    assert.ok(withBreakdown.breakdown && withBreakdown.breakdown.length === 1);
    assert.doesNotMatch(JSON.stringify(withBreakdown), /tok0|reporterToken/);
  });
});

describe("routing penalty", () => {
  test("korlátos (0..1), kvantált, típus-, confidence- és frissesség-függő", () => {
    const many = Array.from({ length: 30 }, () => rec("traffic_jam", 0, { intensity: 3 }));
    const jam = stateOf(many, "traffic_jam")!;
    assert.ok(jam.routingPenalty > 0 && jam.routingPenalty <= 1);
    const steps = jam.routingPenalty / REALTIME_ROUTING_PENALTY_CONFIG.quantizationStep;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, "lépcsőzött érték");
    const noisy = stateOf(Array.from({ length: 30 }, () => rec("noisy", 0)), "noisy")!;
    assert.ok(noisy.routingPenalty < jam.routingPenalty, "szenzoros < dugó routing-súly");
    const older = stateOf(Array.from({ length: 30 }, () => rec("traffic_jam", 15, { intensity: 3 })), "traffic_jam")!;
    assert.ok(older.routingPenalty <= jam.routingPenalty);
    assert.equal(quantizePenalty(5), 1);
    assert.equal(quantizePenalty(-1), 0);
    assert.equal(quantizePenalty(Number.NaN), 0);
  });
  test("küszöb alatt (kevés/gyenge adat) penalty = 0", () => {
    const weak = Array.from({ length: 3 }, () => rec("traffic_jam", 0, { contextConfidence: 0.2 }));
    assert.equal(stateOf(weak, "traffic_jam")!.routingPenalty, 0);
  });
});

describe("navigációs figyelmeztetés", () => {
  test("megerősített, magas confidence-ű dugó -> figyelmeztetés; hiszterézis: kis csökkenésnél marad", () => {
    const s = stateOf([rec("traffic_jam", 0), rec("traffic_jam", 0), rec("traffic_jam", 0)], "traffic_jam")!;
    assert.ok(s.confidence >= NAVIGATION_WARNING_CONFIG.showMinConfidence);
    const w = selectNavigationCommunityWarning([s], null)!;
    assert.equal(w.text, "Dugót jeleztek ezen a szakaszon.");
    const dipped = { ...s, confidence: (NAVIGATION_WARNING_CONFIG.showMinConfidence + NAVIGATION_WARNING_CONFIG.hideBelowConfidence) / 2 };
    assert.equal(selectNavigationCommunityWarning([dipped], null), null, "új megjelenítéshez nem elég");
    assert.equal(selectNavigationCommunityWarning([dipped], "traffic_jam")?.kind, "traffic_jam", "már látható marad");
    assert.equal(selectNavigationCommunityWarning([{ ...s, confidence: 0.1 }], "traffic_jam"), null);
  });
  test("route-szintű vagy area egyezésből nincs kategorikus figyelmeztetés", () => {
    const s = stateOf([rec("service_problem", 0, { tripId: "x", segmentKey: "a>b" }), rec("service_problem", 0, { tripId: "y", segmentKey: "a>b" })], "service_problem");
    if (s) assert.equal(selectNavigationCommunityWarning([{ ...s, confidence: 0.9 }], null), null);
  });
});

describe("privacy-preserving reporter token", () => {
  const secret = "s".repeat(32);
  test("rövid, hex, nem tartalmazza a nyers szereplőt; célpontonként és ablakonként eltér", () => {
    const t1 = computeReporterScopeToken("ip:1.2.3.4", { tripId: "t1" }, NOW, secret);
    assert.match(t1, /^[0-9a-f]{16}$/);
    assert.doesNotMatch(t1, /1\.2\.3\.4/);
    assert.equal(computeReporterScopeToken("ip:1.2.3.4", { tripId: "t1" }, new Date(NOW.getTime() + 60_000), secret), t1);
    assert.notEqual(computeReporterScopeToken("ip:1.2.3.4", { tripId: "t2" }, NOW, secret), t1);
    assert.notEqual(computeReporterScopeToken("ip:1.2.3.4", { tripId: "t1" }, new Date(NOW.getTime() + 4 * 3600_000), secret), t1);
    assert.notEqual(computeReporterScopeToken("ip:5.6.7.8", { tripId: "t1" }, NOW, secret), t1);
    assert.notEqual(computeReporterScopeToken("ip:1.2.3.4", { tripId: "t1" }, NOW, "x".repeat(32)), t1, "secret-rotáció");
    assert.equal(reporterTokenScope({ routeId: "r", segmentKey: "a>b" }), "route_seg:r|a>b");
    assert.equal(reporterTokenScope({}), "none");
  });
});

describe("API + migráció (forrás-szint)", () => {
  const api = stripComments(read("app/api/vedett-route/community-state/route.ts"));
  test("validáció: legalább egy kulcs, ismeretlen mező / koordináta / rossz cella elutasítva", () => {
    assert.equal(communityStateQuerySchema.safeParse({ tripId: TRIP }).success, true);
    assert.equal(communityStateQuerySchema.safeParse({ geoCell: "g0.01:4749:1904" }).success, true);
    for (const bad of [{}, { fromStopId: "a" }, { tripId: "<x>" }, { tripId: TRIP, lat: 47.5 }, { geoCell: "anything" }, null]) {
      assert.equal(communityStateQuerySchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
  test("guard első, rate limit, csak aggregált state megy ki (nincs token/breakdown/koordináta)", () => {
    assert.match(api, /export async function POST\(request: Request\) \{\s*\n\s*const auth = await requireVedettRoutePublicRead\(request\);\s*\n\s*if \(!auth\.ok\) return auth\.response;/);
    assert.match(api, /rateLimiter\.check\(`vedett-route:community-state:\$\{actor\}`/);
    assert.match(api, /status: 429/);
    assert.match(api, /computeCommunityRealtimeState\(records, query\)/);
    assert.doesNotMatch(api, /includeBreakdown|breakdown|reporter|Token|latitude|longitude|segment_from/);
  });
  test("a publikus state típus nem tartalmaz azonosítót / tokent / koordinátát", () => {
    const s = stateOf([rec("traffic_jam", 0), rec("traffic_jam", 0)], "traffic_jam")!;
    assert.deepEqual(Object.keys(s).sort(), [
      "confidence", "expiresAt", "freshestReportAgeSeconds", "independentReportCount", "intensity", "kind", "matchLevel", "routingPenalty", "score",
    ]);
  });
  test("rate limit: a state végpont limitje a meglévő limiterrel érvényesül", async () => {
    const limiter = new MemoryRateLimiter();
    const results = [];
    for (let i = 0; i < 13; i++) results.push((await limiter.check("vedett-route:community-state:ip:9.9.9.9", 12, 60_000)).allowed);
    assert.equal(results.filter(Boolean).length, 12);
  });
  test("report-beküldés tokent számol, de nyers szereplőt nem ír DB-be", () => {
    const submit = stripComments(read("app/api/vedett-route/community-reports/route.ts"));
    assert.match(submit, /row\.reporter_scope_token = computeReporterScopeToken\(/);
    assert.doesNotMatch(submit, /user_id|ip_address/);
  });
  test("migráció 20261008: additív token oszlop + formátum-CHECK + purge, nincs policy/GRANT", () => {
    const sql = stripComments(read("supabase/migrations/20261008_vedett_route_community_realtime.sql"));
    assert.match(sql, /ADD COLUMN IF NOT EXISTS reporter_scope_token TEXT/);
    assert.match(sql, /\^\[0-9a-f\]\{16\}\$/);
    assert.match(sql, /vedett_route_purge_expired_reporter_tokens/);
    assert.doesNotMatch(sql, /CREATE POLICY|\bGRANT\b|\buser_id\b|\bip\b/i);
    assert.ok("20261008_vedett_route_community_realtime.sql" > "20261007_vedett_route_community_intelligence.sql");
  });
  test("navigáció: a figyelmeztetés a felső gombsorban, csak navigációs módban", () => {
    const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(form, /\{navigationMode && communityRealtimeWarning && \(/);
    const hook = read("components/vedett-utvonal/useCommunityRealtimeWarning.ts");
    assert.doesNotMatch(hook, /latitude|longitude|geolocation|lat\b|lon\b/);
  });
});
