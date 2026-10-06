// VÉDETT ÚTVONAL — COMMUNITY INTELLIGENCE DATA FOUNDATION (2026-10-06)
//   node --test __tests__/vedett-route/community-intelligence.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMUNITY_CONTEXT_PHASE_CONFIDENCE,
  buildCommunityReportEventContext,
  computeGeoCell,
  mapWalkToTransitPhase,
} from "../../lib/vedett-route/communityReports/eventContext.ts";
import { buildCommunityReportContext } from "../../lib/vedett-route/communityReports/context.ts";
import { communityReportSubmitSchema } from "../../lib/vedett-route/communityReports/schemas.ts";
import { buildCommunityReportInsertRow } from "../../lib/vedett-route/communityReports/submission.ts";
import { COMMUNITY_REPORT_BASE_CONFIDENCE, COMMUNITY_REPORT_SCHEMA_VERSION, COMMUNITY_REPORT_TYPES, getCommunityReportIntensity } from "../../lib/vedett-route/communityReports/config.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const stripComments = (src: string) => src.replace(/^\s*(\/\/|--).*$/gm, "");
const NOW = new Date("2026-10-06T15:40:00Z"); // 17:40 Budapest, kedd

const LEGS = [
  { mode: "WALK", fromLat: 47.1, fromLon: 19.1 },
  {
    mode: "TRANSIT", transitMode: "BUS", routeId: "bkkgtfs_0050", tripId: "20261006_17:30_bkkgtfs_C1",
    fromStopId: "bkkgtfs_F1", toStopId: "bkkgtfs_F2", headsign: "Örs vezér tere M+H",
    fromLat: 47.497912345, fromLon: 19.040234567, toLat: 47.5012, toLon: 19.0601,
  },
];

describe("esemény-kontextus (fázis, forrás, headsign, szakasz)", () => {
  test("walk→transit fázis leképezése; ismeretlen -> unknown", () => {
    assert.equal(mapWalkToTransitPhase("BOARDED", "WALK"), "onboard");
    assert.equal(mapWalkToTransitPhase("BOARDED_UNCERTAIN_GEOMETRY", "WALK"), "onboard_uncertain");
    assert.equal(mapWalkToTransitPhase("AT_BOARDING_AREA", "WALK"), "at_stop");
    assert.equal(mapWalkToTransitPhase("APPROACHING_BOARDING", "WALK"), "at_stop");
    assert.equal(mapWalkToTransitPhase("WALKING", "WALK"), "walking");
    assert.equal(mapWalkToTransitPhase("NOT_APPLICABLE", "TRANSIT"), "transit_leg");
    assert.equal(mapWalkToTransitPhase(undefined, undefined), "unknown");
  });
  test("felszállt utas (dugó) -> a következő TRANSIT láb tripje, erős köthetőség", () => {
    const event = buildCommunityReportEventContext(LEGS, 0, "BOARDED");
    assert.equal(event.phase, "onboard");
    assert.equal(event.contextSource, "next_leg");
    assert.equal(event.headsign, "Örs vezér tere M+H");
    assert.deepEqual(event.segment, { fromLat: 47.497912345, fromLon: 19.040234567, toLat: 47.5012, toLon: 19.0601 });
    assert.equal(buildCommunityReportContext(LEGS, 0).tripId, "20261006_17:30_bkkgtfs_C1");
    assert.ok(COMMUNITY_CONTEXT_PHASE_CONFIDENCE.onboard > COMMUNITY_CONTEXT_PHASE_CONFIDENCE.walking);
  });
  test("aktív TRANSIT láb -> active_leg; hiányzó adat -> null, semmit nem talál ki", () => {
    const event = buildCommunityReportEventContext([{ mode: "TRANSIT" }], 0, "NOT_APPLICABLE");
    assert.equal(event.contextSource, "active_leg");
    assert.equal(event.phase, "transit_leg");
    assert.equal(event.headsign, null);
    assert.equal(event.segment, null);
    const none = buildCommunityReportEventContext([{ mode: "WALK" }], 0, "WALKING");
    assert.equal(none.contextSource, "none");
    assert.equal(none.segment, null);
    assert.equal(buildCommunityReportEventContext(undefined, null).phase, "unknown");
  });
});

describe("insert sor (v2)", () => {
  test("dugó felszállt utastól: trip/szakasz/headsign/cella/köthetőség/időkulcsok", () => {
    const input = {
      reportType: "traffic_jam" as const,
      context: buildCommunityReportContext(LEGS, 0),
      event: buildCommunityReportEventContext(LEGS, 0, "BOARDED"),
    };
    assert.equal(communityReportSubmitSchema.safeParse(input).success, true);
    const row = buildCommunityReportInsertRow(communityReportSubmitSchema.parse(input), NOW);
    assert.equal(row.trip_id, "20261006_17:30_bkkgtfs_C1");
    assert.equal(row.route_id, "bkkgtfs_0050");
    assert.equal(row.segment_key, "bkkgtfs_F1>bkkgtfs_F2");
    assert.equal(row.vehicle_type, "bus");
    assert.equal(row.headsign, "Örs vezér tere M+H");
    assert.equal(row.context_phase, "onboard");
    assert.equal(row.context_confidence, 1);
    assert.equal(row.segment_from_lat, 47.49791);
    assert.equal(row.segment_from_lon, 19.04023);
    assert.equal(row.geo_cell, computeGeoCell(47.497912345, 19.040234567));
    assert.equal(row.intensity, null, "a UI nem ad intenzitást a dugóhoz");
    assert.equal(row.base_confidence, COMMUNITY_REPORT_BASE_CONFIDENCE);
    assert.equal(row.schema_version, COMMUNITY_REPORT_SCHEMA_VERSION);
    assert.equal(row.weekday, 2);
    assert.equal(row.time_bucket, 70); // 17:30–17:45
    assert.equal(new Date(row.expires_at).getTime() - NOW.getTime(), 30 * 60_000);
  });
  test("v1 kliens (event nélkül) továbbra is elfogadott; phase=unknown, alacsony köthetőség", () => {
    const row = buildCommunityReportInsertRow({ reportType: "crowded" }, NOW);
    assert.equal(row.context_phase, "unknown");
    assert.equal(row.context_source, "none");
    assert.equal(row.context_confidence, COMMUNITY_CONTEXT_PHASE_CONFIDENCE.unknown);
    assert.equal(row.geo_cell, null);
    assert.equal(row.intensity, 2);
  });
  test("intenzitás csak Zsúfolt / Nagyon zsúfolt esetén", () => {
    for (const t of COMMUNITY_REPORT_TYPES) {
      const expected = t === "crowded" ? 2 : t === "very_crowded" ? 3 : null;
      assert.equal(getCommunityReportIntensity(t), expected, t);
    }
  });
  test("érvénytelen esemény-payload elutasítva", () => {
    const bad = [
      { reportType: "noisy", event: { phase: "teleport", contextSource: "none" } },
      { reportType: "noisy", event: { phase: "onboard", contextSource: "none", headsign: "<script>alert(1)</script>" } },
      { reportType: "noisy", event: { phase: "onboard", contextSource: "none", headsign: "x".repeat(81) } },
      { reportType: "noisy", event: { phase: "onboard", contextSource: "none", segment: { fromLat: 120, fromLon: 19 } } },
      { reportType: "noisy", event: { phase: "onboard", contextSource: "none", userLat: 47.5 } },
      { reportType: "noisy", event: { phase: "onboard", contextSource: "none", segment: { fromLat: 47, fromLon: 19, userLat: 1 } } },
    ];
    for (const b of bad) assert.equal(communityReportSubmitSchema.safeParse(b).success, false, JSON.stringify(b));
  });
});

describe("migráció v2 (forrás-szint)", () => {
  const sql = stripComments(read("supabase/migrations/20261007_vedett_route_community_intelligence.sql"));
  test("új oszlopok + CHECK, nincs user-azonosító, nincs policy/GRANT", () => {
    for (const col of ["schema_version", "intensity", "base_confidence", "context_phase", "context_source", "context_confidence", "headsign", "segment_from_lat", "segment_to_lon", "geo_cell"]) {
      assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`), col);
    }
    assert.doesNotMatch(sql, /\buser_id\b|\bemail\b|\bdevice_id\b|\bsession_id\b|CREATE POLICY|\bGRANT\b/i);
    assert.match(sql, /REVOKE ALL ON public\.vedett_route_community_reports FROM anon, authenticated;/);
  });
  test("indexek: aktív típus, trip-köthető, tér/idő, szakasz-profil, BRIN", () => {
    for (const idx of ["vr_community_reports_type_active_idx", "vr_community_reports_trip_attributable_idx", "vr_community_reports_geo_time_idx", "vr_community_reports_segment_profile_idx", "vr_community_reports_created_brin_idx"]) {
      assert.match(sql, new RegExp(idx), idx);
    }
    assert.match(sql, /USING BRIN \(created_at\)/);
  });
  test("a migráció az alap migráció UTÁN rendeződik", () => {
    assert.ok("20261007_vedett_route_community_intelligence.sql" > "20261006_vedett_route_community_reports.sql");
  });
});
