// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 (2026-10-06)
//   node --test __tests__/vedett-route/community-reports.test.ts
// Tiszta logika: valódi futtatás. Route handler + migráció: forrás-szintű
// vizsgálat (a "next/server" plain node:test alatt nem oldható fel — ugyanaz a
// technika, mint a realtime-refresh-route.test.ts-ben).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMUNITY_REPORT_DEFINITIONS,
  COMMUNITY_REPORT_TYPES,
  COMMUNITY_REPORT_UI_GROUPS,
  isCommunityReportType,
} from "../../lib/vedett-route/communityReports/config.ts";
import { computeCommunityReportExpiresAt, getCommunityReportTtlMinutes, isCommunityReportActive } from "../../lib/vedett-route/communityReports/ttl.ts";
import { buildCommunityReportContext, computeCommunityReportTimeKeys, normalizeVehicleType } from "../../lib/vedett-route/communityReports/context.ts";
import { communityReportSubmitSchema } from "../../lib/vedett-route/communityReports/schemas.ts";
import { buildCommunityReportInsertRow, buildCommunityReportRateLimitKeys, communityReportActorKey } from "../../lib/vedett-route/communityReports/submission.ts";
import { communityReportToObservation, matchesObservationQuery, type TrafficObservation } from "../../lib/vedett-route/communityReports/observation.ts";
import { aggregateTrafficObservations, freshnessWeight } from "../../lib/vedett-route/communityReports/aggregation.ts";
import { buildTrafficProfileBuckets } from "../../lib/vedett-route/communityReports/historical.ts";
import { computeCrowdingSensoryPenalty } from "../../lib/vedett-route/communityReports/routingPenalty.ts";
import type { CommunityReportType } from "../../lib/vedett-route/communityReports/config.ts";
import { MemoryRateLimiter } from "../../lib/rate-limit/memory.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const stripComments = (src: string) => src.replace(/^\s*(\/\/|--).*$/gm, "");
const NOW = new Date("2026-10-06T08:00:00Z"); // 10:00 Budapest, kedd

const CTX = { routeId: "bkkgtfs_3060", tripId: "20261006_09:50_bkkgtfs_C1", vehicleId: null, directionId: null, fromStopId: "bkkgtfs_F1", toStopId: "bkkgtfs_F2", vehicleType: "tram" as const };

function obs(type: CommunityReportType, minutesAgo: number, context = CTX): TrafficObservation {
  const createdAt = new Date(NOW.getTime() - minutesAgo * 60_000);
  return communityReportToObservation({
    reportType: type,
    createdAt: createdAt.toISOString(),
    expiresAt: computeCommunityReportExpiresAt(type, createdAt).toISOString(),
    context,
  });
}

describe("report type validation", () => {
  test("minden kötelező típus létezik, mindegyiknek van definíciója és UI-helye", () => {
    for (const t of ["crowded", "very_crowded", "quiet", "noisy", "bright_light", "vibration", "too_hot", "traffic_jam", "vehicle_stopped", "service_problem"]) {
      assert.ok(isCommunityReportType(t), t);
      assert.ok(COMMUNITY_REPORT_DEFINITIONS[t as CommunityReportType]);
    }
    const inUi = COMMUNITY_REPORT_UI_GROUPS.flatMap((g) => g.types).sort();
    assert.deepEqual(inUi, [...COMMUNITY_REPORT_TYPES].sort());
    assert.equal(isCommunityReportType("arson"), false);
    assert.equal(isCommunityReportType(undefined), false);
  });
  test("ismeretlen típus -> séma elutasítja", () => {
    assert.equal(communityReportSubmitSchema.safeParse({ reportType: "nope" }).success, false);
  });
});

describe("TTL / active vs expired", () => {
  test("TTL-ek a konfigurációból", () => {
    assert.equal(getCommunityReportTtlMinutes("crowded"), 30);
    assert.equal(getCommunityReportTtlMinutes("very_crowded"), 30);
    assert.equal(getCommunityReportTtlMinutes("traffic_jam"), 30);
    assert.equal(getCommunityReportTtlMinutes("service_problem"), 30);
    assert.ok(getCommunityReportTtlMinutes("vehicle_stopped") >= 10 && getCommunityReportTtlMinutes("vehicle_stopped") <= 15);
    assert.ok(getCommunityReportTtlMinutes("quiet") >= 20 && getCommunityReportTtlMinutes("quiet") <= 30);
    assert.equal(computeCommunityReportExpiresAt("noisy", NOW).toISOString(), "2026-10-06T08:30:00.000Z");
  });
  test("aktív a lejárat előtt, lejárt a lejáratkor és utána, érvénytelen dátum -> nem aktív", () => {
    const expiresAt = computeCommunityReportExpiresAt("vehicle_stopped", NOW);
    assert.equal(isCommunityReportActive({ expiresAt }, new Date(expiresAt.getTime() - 1)), true);
    assert.equal(isCommunityReportActive({ expiresAt }, expiresAt), false);
    assert.equal(isCommunityReportActive({ expiresAt: "garbage" }, NOW), false);
  });
});

describe("aggregation", () => {
  test("üres -> unknown, confidence 0, sample 0", () => {
    const a = aggregateTrafficObservations([], { now: NOW });
    assert.equal(a.crowding, "unknown");
    assert.equal(a.sensory, "unknown");
    assert.equal(a.confidence, 0);
    assert.equal(a.sampleCount, 0);
  });
  test("csak lejárt reportok -> unknown (de nem törlődnek, csak kiszűrődnek)", () => {
    const a = aggregateTrafficObservations([obs("very_crowded", 45), obs("noisy", 40)], { now: NOW });
    assert.equal(a.crowding, "unknown");
    assert.equal(a.sampleCount, 0);
  });
  test("egyetlen report: van szint, de NEM magas confidence", () => {
    const a = aggregateTrafficObservations([obs("very_crowded", 0)], { now: NOW });
    assert.equal(a.crowding, "very_high");
    assert.ok(a.confidence > 0 && a.confidence < 0.4, String(a.confidence));
  });
  test("több egybehangzó friss report növeli a confidence-t", () => {
    const one = aggregateTrafficObservations([obs("crowded", 1)], { now: NOW }).confidence;
    const three = aggregateTrafficObservations([obs("crowded", 1), obs("crowded", 2), obs("very_crowded", 3)], { now: NOW }).confidence;
    const six = aggregateTrafficObservations([0, 1, 2, 3, 4, 5].map((m) => obs("very_crowded", m)), { now: NOW }).confidence;
    assert.ok(three > one && six > three, `${one} ${three} ${six}`);
    assert.ok(six <= 0.95);
  });
  test("ellentmondó reportok csökkentik a confidence-t", () => {
    const agree = aggregateTrafficObservations([obs("very_crowded", 1), obs("very_crowded", 1)], { now: NOW }).dimensions.crowding.confidence;
    const conflict = aggregateTrafficObservations([obs("very_crowded", 1), obs("quiet", 1)], { now: NOW }).dimensions.crowding.confidence;
    assert.ok(conflict < agree / 2, `${conflict} vs ${agree}`);
  });
  test("frissességi súlyozás: a frissebb report többet ér", () => {
    assert.ok(freshnessWeight(new Date(NOW.getTime() - 60_000).toISOString(), NOW) > freshnessWeight(new Date(NOW.getTime() - 20 * 60_000).toISOString(), NOW));
    assert.equal(freshnessWeight(new Date(NOW.getTime() - 10 * 60_000).toISOString(), NOW), 0.5);
    // friss "nyugodt" + régi "nagyon zsúfolt" -> a pontszám a nyugodt felé húz
    const a = aggregateTrafficObservations([obs("quiet", 0), obs("very_crowded", 20)], { now: NOW });
    assert.ok((a.dimensions.crowding.score ?? 1) < 0.5, String(a.dimensions.crowding.score));
  });
  test("szenzoros szint és dimenziók; determinisztikus", () => {
    const input = [obs("noisy", 1), obs("noisy", 2), obs("bright_light", 3)];
    const a = aggregateTrafficObservations(input, { now: NOW });
    assert.equal(a.sensory, "high");
    assert.equal(a.dimensions.noise.sampleCount, 2);
    assert.equal(a.dimensions.light.sampleCount, 1);
    assert.equal(a.dimensions.crowding.score, null);
    assert.deepEqual(aggregateTrafficObservations(input, { now: NOW }), a);
  });
  test("route + szakasz + időablak szűrés", () => {
    const query = { routeId: CTX.routeId, directionId: null, fromStopId: CTX.fromStopId, toStopId: CTX.toStopId, windowMinutes: 30, now: NOW };
    assert.equal(matchesObservationQuery(obs("crowded", 5), query), true);
    assert.equal(matchesObservationQuery(obs("crowded", 5, { ...CTX, routeId: "other" }), query), false);
    assert.equal(matchesObservationQuery(obs("crowded", 5, { ...CTX, toStopId: "x" }), query), false);
    assert.equal(matchesObservationQuery(obs("crowded", 40), query), false);
  });
});

describe("historikus profil + routing penalty interfész", () => {
  test("bucket kulcs: source + route + szakasz + hét napja + 15 perces sáv, user/trip azonosító nélkül", () => {
    const buckets = buildTrafficProfileBuckets([obs("crowded", 1), obs("very_crowded", 2), obs("noisy", 50)]);
    assert.ok(buckets.length >= 1);
    for (const b of buckets) {
      assert.equal(b.source, "community");
      assert.equal(b.routeId, CTX.routeId);
      assert.equal(b.weekday, 2);
      assert.ok(b.timeBucket >= 0 && b.timeBucket <= 95);
      assert.ok(!("tripId" in b) && !("userId" in b) && !("vehicleId" in b));
    }
  });
  test("kevés/bizonytalan adat -> nincs penalty; erős adat -> korlátos penalty", () => {
    assert.equal(computeCrowdingSensoryPenalty(aggregateTrafficObservations([obs("very_crowded", 0)], { now: NOW })).penaltyMinutes, 0);
    const strong = aggregateTrafficObservations([0, 0, 1, 1, 2, 2, 3, 3].map((m) => obs("very_crowded", m)), { now: NOW });
    const p = computeCrowdingSensoryPenalty(strong);
    assert.ok(p.penaltyMinutes > 0 && p.penaltyMinutes <= 3, JSON.stringify(p));
  });
});

describe("payload validation + nullable transit context", () => {
  test("csak típus (kontextus nélkül) elfogadott; minden kontextus-mező lehet null", () => {
    assert.equal(communityReportSubmitSchema.safeParse({ reportType: "crowded" }).success, true);
    assert.equal(communityReportSubmitSchema.safeParse({ reportType: "crowded", context: null }).success, true);
    const allNull = { routeId: null, tripId: null, vehicleId: null, directionId: null, fromStopId: null, toStopId: null, vehicleType: null };
    assert.equal(communityReportSubmitSchema.safeParse({ reportType: "noisy", context: allNull }).success, true);
    assert.equal(communityReportSubmitSchema.safeParse({ reportType: "noisy", context: CTX }).success, true);
  });
  test("érvénytelen payload elutasítva: koordináta, szabad szöveg, extra mező, rossz id, rossz irány", () => {
    const bad = [
      null,
      {},
      { reportType: "crowded", latitude: 47.5, longitude: 19.04 },
      { reportType: "crowded", comment: "szabad szöveg" },
      { reportType: "crowded", userId: "u1" },
      { reportType: "crowded", context: { routeId: "<script>" } },
      { reportType: "crowded", context: { routeId: "x".repeat(201) } },
      { reportType: "crowded", context: { directionId: 2 } },
      { reportType: "crowded", context: { lat: 47.5 } },
      { reportType: "crowded", context: { vehicleType: "spaceship" } },
      { reportType: "crowded", createdAt: "2020-01-01T00:00:00Z" },
      { reportType: "crowded", expiresAt: "2099-01-01T00:00:00Z" },
    ];
    for (const b of bad) assert.equal(communityReportSubmitSchema.safeParse(b).success, false, JSON.stringify(b));
  });
  test("insert sor: szerver számolja az időt/TTL-t/source-t; nincs user-azonosító", () => {
    const row = buildCommunityReportInsertRow({ reportType: "vehicle_stopped" }, NOW);
    assert.equal(row.source, "community");
    assert.equal(row.report_category, "transport");
    assert.equal(row.route_id, null);
    assert.equal(row.segment_key, null);
    assert.equal(row.created_at, NOW.toISOString());
    assert.equal(new Date(row.expires_at).getTime() - NOW.getTime(), 15 * 60_000);
    assert.equal(row.service_date, "2026-10-06");
    assert.equal(row.time_bucket, 40); // 10:00 Budapest
    assert.equal(row.weekday, 2);
    assert.deepEqual(Object.keys(row).sort(), [
      "created_at", "direction_id", "expires_at", "from_stop_id", "report_category", "report_type", "route_id",
      "segment_key", "service_date", "source", "time_bucket", "to_stop_id", "trip_id", "vehicle_id", "vehicle_type", "weekday",
    ]);
  });
  test("service day: 03:00 előtt az előző nap; 15 perces sáv helyes", () => {
    const keys = computeCommunityReportTimeKeys(new Date("2026-10-06T23:20:00Z")); // 01:20 Budapest, szerda
    assert.equal(keys.serviceDate, "2026-10-06");
    assert.equal(keys.timeBucket, 5);
    assert.equal(keys.weekday, 3);
  });
  test("kontextus a Journey-ből: aktív TRANSIT láb, gyaloglásnál a következő, hiányzó mezők null", () => {
    const legs = [
      { mode: "WALK" },
      { mode: "TRANSIT", transitMode: "TRAM", routeId: "r1", tripId: "t1", fromStopId: "s1", toStopId: "s2" },
      { mode: "TRANSIT", transitMode: "BUS" },
    ];
    assert.deepEqual(buildCommunityReportContext(legs, 0), { routeId: "r1", tripId: "t1", vehicleId: null, directionId: null, fromStopId: "s1", toStopId: "s2", vehicleType: "tram" });
    const second = buildCommunityReportContext(legs, 2);
    assert.equal(second.tripId, null);
    assert.equal(second.vehicleType, "bus");
    assert.equal(buildCommunityReportContext([], 0).routeId, null);
    assert.equal(buildCommunityReportContext(undefined, null).tripId, null);
    assert.equal(normalizeVehicleType(undefined), null);
    assert.equal(normalizeVehicleType("SUBWAY"), "subway");
  });
});

describe("rate limiting / abuse protection", () => {
  test("anonim (IP) és bejelentkezett (user) szereplő külön kulcsot kap; a duplikátum kulcs típus+trip szerinti", () => {
    assert.equal(communityReportActorKey(null, "1.2.3.4"), "ip:1.2.3.4");
    assert.equal(communityReportActorKey("uuid-1", "1.2.3.4"), "u:uuid-1");
    const k = buildCommunityReportRateLimitKeys("ip:1.2.3.4", { reportType: "crowded", context: { tripId: "t1" } });
    assert.match(k.duplicate.key, /crowded:t1$/);
    assert.equal(k.duplicate.limit, 1);
  });
  test("burst limit és duplikátum-szűrés a meglévő MemoryRateLimiterrel", async () => {
    const limiter = new MemoryRateLimiter();
    const k = buildCommunityReportRateLimitKeys("ip:9.9.9.9", { reportType: "noisy", context: { tripId: "t9" } });
    const results = [];
    for (let i = 0; i < k.burst.limit + 1; i++) results.push((await limiter.check(k.burst.key, k.burst.limit, k.burst.windowMs)).allowed);
    assert.deepEqual(results, [...Array(k.burst.limit).fill(true), false]);
    assert.equal((await limiter.check(k.duplicate.key, 1, k.duplicate.windowMs)).allowed, true);
    assert.equal((await limiter.check(k.duplicate.key, 1, k.duplicate.windowMs)).allowed, false);
  });
});

describe("API route + migráció: anonim/authenticated beküldés biztonsága (forrás-szint)", () => {
  const route = stripComments(read("app/api/vedett-route/community-reports/route.ts"));
  const sql = stripComments(read("supabase/migrations/20261006_vedett_route_community_reports.sql"));
  test("a route a publikus guardot hívja először (anonim + bejelentkezett is), és csak POST-ot exportál", () => {
    assert.match(route, /export async function POST\(request: Request\) \{\s*\n\s*const auth = await requireVedettRoutePublicRead\(request\);\s*\n\s*if \(!auth\.ok\) return auth\.response;/);
    assert.doesNotMatch(route, /export async function (GET|PATCH|PUT|DELETE)/);
  });
  test("validáció, rate limit (burst+sustained+duplikátum) az insert ELŐTT; nincs userId a sorban", () => {
    const parse = route.indexOf("communityReportSubmitSchema.safeParse");
    const limit = route.indexOf("rateLimiter.check(limit.key");
    const dup = route.indexOf("keys.duplicate.key");
    const insert = route.indexOf("insertCommunityReport(");
    assert.ok(parse > 0 && limit > parse && dup > limit && insert > dup);
    assert.match(route, /status: 400/);
    assert.match(route, /status: 429/);
    assert.match(route, /buildCommunityReportInsertRow\(parsed\.data, new Date\(\)\)/);
    assert.doesNotMatch(route, /user_id/);
    // auth.userId KIZÁRÓLAG a rate-limit szereplő-kulcsába kerül, a DB-sorba nem.
    assert.equal((route.match(/auth\.userId/g) ?? []).length, 1);
    assert.match(route, /communityReportActorKey\(auth\.userId, getVedettRouteClientIp\(request\)\)/);
  });
  test("migráció: RLS bekapcsolva, anon/authenticated jogok visszavonva, NINCS policy, NINCS user_id", () => {
    assert.match(sql, /ALTER TABLE public\.vedett_route_community_reports ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON public\.vedett_route_community_reports FROM anon, authenticated;/);
    assert.match(sql, /ALTER TABLE public\.vedett_route_traffic_profile_buckets ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON public\.vedett_route_traffic_profile_buckets FROM anon, authenticated;/);
    assert.doesNotMatch(sql, /CREATE POLICY/i);
    assert.doesNotMatch(sql, /\buser_id\b|\bemail\b|latitude|longitude|\bGRANT\b/i);
  });
  test("migráció típus-CHECK egyezik a TS konfigurációval", () => {
    for (const t of COMMUNITY_REPORT_TYPES) assert.match(sql, new RegExp(`'${t}'`));
  });
  test("UI: Jelzés gomb csak navigációs módban, és nem küld koordinátát/GA4 eseményt", () => {
    const ui = read("components/vedett-utvonal/CommunityReportButton.tsx");
    assert.match(ui, /Jelzés/);
    assert.match(ui, /Köszönjük a jelzést!/);
    assert.doesNotMatch(ui, /latitude|longitude|geolocation|trackVedettRouteEvent|gtag/);
    const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(form, /\{navigationMode && <CommunityReportButton context=\{buildCommunityReportContext\(displayedJourney\.legs, activeLegIndex\)\} open=\{communityReportOpen\} onOpenChange=\{setCommunityReportOpen\} \/>\}/);
  });
});
