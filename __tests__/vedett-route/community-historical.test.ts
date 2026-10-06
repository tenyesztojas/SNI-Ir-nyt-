// VÉDETT ÚTVONAL — HISTORICAL SENSORY LOAD ENGINE (2026-10-06)
//   node --test __tests__/vedett-route/community-historical.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDailyLoadPartials,
  buildLoadProfiles,
  historicalDecayWeight,
  type DailyLoadPartial,
  type HistoricalReportRow,
  type LoadProfile,
} from "../../lib/vedett-route/communityReports/historicalAggregation.ts";
import {
  combineCommunityLoad,
  evaluateCommunityLoad,
  getExpectedCommunityLoad,
  type HistoricalExpectation,
} from "../../lib/vedett-route/communityReports/expectedLoadEngine.ts";
import { addDays, planAggregationDays, runCommunityLoadAggregation, type CommunityLoadStore } from "../../lib/vedett-route/communityReports/historicalJob.ts";
import { AGGREGATION_JOB, EXPECTED_LOAD_API, HISTORICAL_CONFIDENCE, LOAD_COMBINER_CONFIG } from "../../lib/vedett-route/communityReports/historicalConfig.ts";
import { expectedLoadRequestSchema, resolveDepartureTime, toPublicLoadEvaluation } from "../../lib/vedett-route/communityReports/loadSchemas.ts";
import { isAuthorizedCronRequest } from "../../lib/vedett-route/communityReports/cronAuth.ts";
import { computeCommunityReportExpiresAt } from "../../lib/vedett-route/communityReports/ttl.ts";
import type { RealtimeReportRecord } from "../../lib/vedett-route/communityReports/realtimeEngine.ts";
import type { CommunityReportType } from "../../lib/vedett-route/communityReports/config.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const stripComments = (src: string) => src.replace(/^\s*(\/\/|--).*$/gm, "");

const ROUTE = "bkkgtfs_0050";
const SEG = "bkkgtfs_F1>bkkgtfs_F2";
const AS_OF = "2026-10-06"; // kedd
const TUESDAYS = ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"];
// 08:00 Budapest (CEST) = 06:00Z -> sáv 32
const AT_TUE_0800 = new Date("2026-10-06T06:05:00Z");
const BUCKET = 32;

let seq = 0;
function raw(type: CommunityReportType, serviceDate: string, over: Partial<HistoricalReportRow> = {}): HistoricalReportRow {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    reportType: type,
    createdAt: `${serviceDate}T06:0${seq % 10}:00Z`,
    serviceDate,
    weekday: 2,
    timeBucket: BUCKET,
    intensity: null,
    contextConfidence: 1,
    routeId: ROUTE,
    segmentKey: SEG,
    reporterToken: `t${String(seq).padStart(15, "0")}`,
    ...over,
  };
}
const profilesFrom = (rows: HistoricalReportRow[], asOf = AS_OF) => buildLoadProfiles(buildDailyLoadPartials(rows), asOf);
const ctx = (at = AT_TUE_0800) => ({ routeId: ROUTE, segmentKey: SEG, tripId: "trip1", at });
const expect = (profiles: LoadProfile[], kind: "crowding" | "traffic_jam" | "noisy", at = AT_TUE_0800) => getExpectedCommunityLoad(profiles, ctx(at), kind);

/** 4 különböző keddről egy-egy "Nagyon zsúfolt" + "Zsúfolt" jelzés -> használható profil. */
function solidCrowdingRows(type: CommunityReportType = "very_crowded"): HistoricalReportRow[] {
  return TUESDAYS.slice(1).flatMap((d) => [raw(type, d), raw(type, d)]);
}

describe("minta-elégségesség", () => {
  test("nincs historikus adat -> insufficient, expectedScore null (NEM 0)", () => {
    const h = expect([], "crowding");
    assert.equal(h.status, "insufficient");
    assert.equal(h.expectedScore, null);
    assert.equal(h.confidence, 0);
    assert.equal(h.fallbackLevel, null);
  });
  test("egyetlen report -> insufficient", () => {
    const h = expect(profilesFrom([raw("very_crowded", "2026-10-06")]), "crowding");
    assert.equal(h.status, "insufficient");
    assert.equal(h.expectedScore, null);
  });
  test("minimum alatt (2 minta, 2 nap) insufficient; felette usable/strong", () => {
    const below = expect(profilesFrom([raw("very_crowded", "2026-09-29"), raw("very_crowded", "2026-10-06")]), "crowding");
    assert.equal(below.status, "insufficient");
    const above = expect(profilesFrom(solidCrowdingRows()), "crowding");
    assert.ok(above.status === "usable" || above.status === "strong", above.status);
    assert.equal(above.fallbackLevel, "exact");
    assert.ok(above.expectedScore! > 0.9);
    assert.ok(above.confidence <= HISTORICAL_CONFIDENCE.maxConfidence);
  });
  test("egy nap sok jelzése (egyszeri esemény) nem heti mintázat", () => {
    const oneDay = Array.from({ length: 12 }, () => raw("very_crowded", "2026-10-06"));
    assert.equal(expect(profilesFrom(oneDay), "crowding").status, "insufficient");
  });
});

describe("értékek, ellenbizonyíték, decay", () => {
  test("különböző intenzitások: Zsúfolt + Nagyon zsúfolt átlaga a kettő között", () => {
    const rows = TUESDAYS.slice(1).flatMap((d) => [raw("crowded", d), raw("very_crowded", d)]);
    const h = expect(profilesFrom(rows), "crowding");
    assert.ok(h.expectedScore! > 0.7 && h.expectedScore! < 1, String(h.expectedScore));
  });
  test("'Nyugodt' csökkenti a zsúfoltságot, de a dugót nem érinti", () => {
    const base = solidCrowdingRows();
    const quiet = TUESDAYS.slice(1).flatMap((d) => [raw("quiet", d), raw("quiet", d)]);
    const withQuiet = profilesFrom([...base, ...quiet]);
    assert.ok(expect(withQuiet, "crowding").expectedScore! < expect(profilesFrom(base), "crowding").expectedScore!);
    const jams = TUESDAYS.slice(1).flatMap((d) => [raw("traffic_jam", d), raw("traffic_jam", d)]);
    assert.deepEqual(expect(profilesFrom([...jams, ...quiet]), "traffic_jam"), expect(profilesFrom(jams), "traffic_jam"));
  });
  test("'várhatóan nyugodt' (sok Nyugodt jelzés) != 'nincs adat'", () => {
    const quiet = TUESDAYS.slice(1).flatMap((d) => [raw("quiet", d), raw("quiet", d)]);
    const h = expect(profilesFrom(quiet), "crowding");
    assert.notEqual(h.status, "insufficient");
    assert.equal(h.expectedScore, 0);
  });
  test("lassú historikus decay: 28 nap = 0.5, ablakon túl 0; a régi adat kevesebbet ér", () => {
    assert.equal(historicalDecayWeight(0), 1);
    assert.equal(historicalDecayWeight(28), 0.5);
    assert.ok(historicalDecayWeight(7) > 0.8);
    assert.ok(historicalDecayWeight(90) < 0.15);
    assert.equal(historicalDecayWeight(200), 0);
    const oldQuiet = ["2026-06-02", "2026-06-09", "2026-06-16", "2026-06-23"].flatMap((d) => [raw("quiet", d), raw("quiet", d)]);
    const recentCrowded = solidCrowdingRows();
    const h = expect(profilesFrom([...oldQuiet, ...recentCrowded]), "crowding");
    assert.ok(h.expectedScore! > 0.8, `friss adat dominál: ${h.expectedScore}`);
  });
});

describe("deduplikáció", () => {
  test("ugyanaz a token ugyanarra a kulcsra 5x -> 1 minta", () => {
    const rows = Array.from({ length: 5 }, () => raw("very_crowded", "2026-10-06", { reporterToken: "aaaaaaaaaaaaaaaa" }));
    const seg = buildDailyLoadPartials(rows).find((p) => p.scopeType === "route_segment" && p.kind === "crowding")!;
    assert.equal(seg.sampleCount, 1);
  });
  test("legacy (token nélküli) sorok külön mintak, de fél súllyal", () => {
    const legacy = buildDailyLoadPartials([raw("very_crowded", "2026-10-06", { reporterToken: null }), raw("very_crowded", "2026-10-06", { reporterToken: null })])
      .find((p) => p.scopeType === "route_segment")!;
    assert.equal(legacy.sampleCount, 2);
    assert.equal(legacy.legacySampleCount, 2);
    assert.equal(legacy.strength, 1); // 2 * 0.5
  });
  test("a napi aggregátum és a profil nem tartalmaz tokent / report-id-t", () => {
    const partials = buildDailyLoadPartials(solidCrowdingRows());
    const json = JSON.stringify([partials, buildLoadProfiles(partials, AS_OF)]);
    assert.doesNotMatch(json, /reporterToken|"t0000|00000000-0000|"id"/);
  });
  test("route nélküli report nem kerül historikus kulcsba", () => {
    assert.deepEqual(buildDailyLoadPartials([raw("very_crowded", "2026-10-06", { routeId: null })]), []);
  });
});

describe("időbeli fallback", () => {
  test("pontos sáv elérhető -> exact", () => {
    assert.equal(expect(profilesFrom(solidCrowdingRows()), "crowding").fallbackLevel, "exact");
  });
  test("csak szomszédos sávban van adat -> adjacent_time, kisebb confidence", () => {
    const adjacent = solidCrowdingRows().map((r) => ({ ...r, timeBucket: BUCKET + 1 }));
    const exact = expect(profilesFrom(solidCrowdingRows()), "crowding");
    const h = expect(profilesFrom(adjacent), "crowding");
    assert.equal(h.fallbackLevel, "adjacent_time");
    assert.ok(h.confidence < exact.confidence);
  });
  test("csak más hétköznapon van adat -> day_type (hétköznapon belül)", () => {
    const wednesdays = ["2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"].flatMap((d) => [raw("very_crowded", d, { weekday: 3 }), raw("very_crowded", d, { weekday: 3 })]);
    const h = expect(profilesFrom(wednesdays), "crowding");
    assert.equal(h.fallbackLevel, "day_type");
  });
  test("hétvége nem keveredik a hétköznappal (szombati lekérdezés, csak hétköznapi adat)", () => {
    const saturday = new Date("2026-10-10T06:05:00Z");
    const h = expect(profilesFrom(solidCrowdingRows()), "crowding", saturday);
    assert.equal(h.status, "insufficient");
    assert.equal(h.expectedScore, null);
  });
  test("±1 sávnál szélesebbre nem tágít (esti adat nem ad reggeli predikciót)", () => {
    const evening = solidCrowdingRows().map((r) => ({ ...r, timeBucket: 72 }));
    assert.equal(expect(profilesFrom(evening), "crowding").status, "insufficient");
  });
  test("dugónál nincs vonal-szintű fallback (helyhez kötött)", () => {
    const otherSegmentJams = TUESDAYS.slice(1).flatMap((d) => [raw("traffic_jam", d, { segmentKey: "x>y" }), raw("traffic_jam", d, { segmentKey: "x>y" })]);
    assert.equal(expect(profilesFrom(otherSegmentJams), "traffic_jam").status, "insufficient");
    const otherSegmentCrowd = solidCrowdingRows().map((r) => ({ ...r, segmentKey: "x>y" }));
    assert.equal(expect(profilesFrom(otherSegmentCrowd), "crowding").fallbackLevel, "route_adjacent_time");
  });
});

function rtRecord(type: CommunityReportType, minutesAgo: number, now: Date, token: string): RealtimeReportRecord {
  const created = new Date(now.getTime() - minutesAgo * 60_000);
  return { reportType: type, createdAt: created.toISOString(), expiresAt: computeCommunityReportExpiresAt(type, created).toISOString(), intensity: null, baseConfidence: 0.333, contextConfidence: 1, tripId: "trip1", routeId: ROUTE, segmentKey: SEG, geoCell: null, reporterToken: token };
}

describe("realtime + historikus kombináció, jövőbeli út", () => {
  const profiles = profilesFrom(solidCrowdingRows());
  test("jelenlegi út: több friss 'Nyugodt' csökkenti a historikusan zsúfolt becslést", () => {
    const now = AT_TUE_0800;
    const quiet = [rtRecord("quiet", 1, now, "q000000000000001"), rtRecord("quiet", 2, now, "q000000000000002"), rtRecord("quiet", 1, now, "q000000000000003")];
    const { evaluation } = evaluateCommunityLoad({ context: ctx(now), profiles, realtimeRecords: quiet, now });
    const k = evaluation.kinds.find((x) => x.kind === "crowding")!;
    assert.equal(evaluation.realtimeApplicable, true);
    assert.equal(k.combined.realtimeApplied, true);
    assert.ok(k.combined.score! < k.historical.expectedScore!);
  });
  test("historikusan közepes + több friss 'Nagyon zsúfolt' -> nő", () => {
    const medium = profilesFrom(TUESDAYS.slice(1).flatMap((d) => [raw("crowded", d), raw("quiet", d), raw("crowded", d)]));
    const now = AT_TUE_0800;
    const rt = [rtRecord("very_crowded", 1, now, "v000000000000001"), rtRecord("very_crowded", 1, now, "v000000000000002"), rtRecord("very_crowded", 2, now, "v000000000000003")];
    const k = evaluateCommunityLoad({ context: ctx(now), profiles: medium, realtimeRecords: rt, now }).evaluation.kinds.find((x) => x.kind === "crowding")!;
    assert.ok(k.combined.score! > k.historical.expectedScore!);
  });
  test("gyenge realtime nem írja felül a baseline-t", () => {
    const h = expect(profiles, "crowding");
    const c = combineCommunityLoad(h, { score: 0, confidence: LOAD_COMBINER_CONFIG.minRealtimeConfidence - 0.01 }, null);
    assert.equal(c.score, h.expectedScore);
    assert.equal(c.realtimeApplied, false);
  });
  test("elégtelen historikus + nincs realtime -> combined null (nem 0)", () => {
    const empty: HistoricalExpectation = { kind: "crowding", source: "historical", status: "insufficient", expectedScore: null, confidence: 0, sampleStrength: 0, sampleCount: 0, distinctDays: 0, fallbackLevel: null };
    assert.deepEqual(combineCommunityLoad(empty, null, null), { score: null, confidence: 0, realtimeApplied: false });
  });
  test("jövőbeli út (holnap 07:45): helyes nap/sáv, realtime nem használható", () => {
    const now = AT_TUE_0800;
    const tomorrow = new Date("2026-10-07T05:45:00Z"); // szerda 07:45 Budapest
    const rt = [rtRecord("very_crowded", 1, now, "v100000000000001"), rtRecord("very_crowded", 1, now, "v100000000000002")];
    const { evaluation } = evaluateCommunityLoad({ context: ctx(tomorrow), profiles, realtimeRecords: rt, now });
    assert.equal(evaluation.weekday, 3);
    assert.equal(evaluation.timeBucket, 31);
    assert.equal(evaluation.dayType, "workday");
    assert.equal(evaluation.realtimeApplicable, false);
    for (const k of evaluation.kinds) assert.equal(k.realtime, null);
  });
  test("korlátos, kvantált penaltyk; elégtelen adat esetén historicalDataQuality=insufficient", () => {
    const now = AT_TUE_0800;
    const rt = Array.from({ length: 20 }, (_, i) => rtRecord("very_crowded", 0, now, `w${String(i).padStart(15, "0")}`));
    const { evaluation } = evaluateCommunityLoad({ context: ctx(now), profiles, realtimeRecords: rt, now });
    for (const v of [evaluation.routing.historicalPenalty, evaluation.routing.realtimePenalty, evaluation.routing.combinedPenalty]) {
      assert.ok(v >= 0 && v <= 1);
      assert.ok(Math.abs(v / 0.05 - Math.round(v / 0.05)) < 1e-6);
    }
    assert.ok(evaluation.routing.combinedPenalty > 0);
    const none = evaluateCommunityLoad({ context: ctx(now), profiles: [], realtimeRecords: [], now }).evaluation;
    assert.equal(none.routing.historicalDataQuality, "insufficient");
    assert.equal(none.routing.combinedPenalty, 0);
  });
  test("breakdown csak kérésre (melyik szint, fallback, confidence-ek)", () => {
    const r = evaluateCommunityLoad({ context: ctx(), profiles, realtimeRecords: [], now: AT_TUE_0800 }, { includeBreakdown: true });
    const b = r.breakdown!.find((x) => x.kind === "crowding")!;
    assert.equal(b.chosenLevel, "exact");
    assert.ok(b.levels.length >= 1);
    assert.equal(evaluateCommunityLoad({ context: ctx(), profiles, realtimeRecords: [], now: AT_TUE_0800 }).breakdown, undefined);
  });
});

/** In-memory tároló a job teszteléséhez (ugyanaz a szemantika, mint a Supabase tárolóé). */
function memoryStore(rawRows: HistoricalReportRow[], opts: { failPurge?: boolean } = {}) {
  const daily = new Map<string, DailyLoadPartial & { updatedAt: string }>();
  const profiles = new Map<string, LoadProfile & { updatedAt: string }>();
  const days = new Map<string, string>();
  const purgeCalls: string[] = [];
  const store: CommunityLoadStore = {
    async listBuiltDays(dates) { return new Set(dates.filter((d) => days.has(d))); },
    async fetchRawReportsForDay(d) { return rawRows.filter((r) => r.serviceDate === d).map((r) => ({ ...r })); },
    async replaceDailyPartials(d, partials, at) {
      for (const p of partials) daily.set(`${p.scopeType}|${p.routeId}|${p.segmentKey}|${p.serviceDate}|${p.timeBucket}|${p.kind}`, { ...p, updatedAt: at });
      for (const [k, v] of daily) if (v.serviceDate === d && v.updatedAt < at) daily.delete(k);
    },
    async markDayBuilt(d, _r, _p, at) { days.set(d, at); },
    async fetchDailyPartialsSince(from) { return [...daily.values()].filter((p) => p.serviceDate >= from).map(({ updatedAt: _u, ...p }) => p); },
    async replaceProfiles(list, at) {
      for (const p of list) profiles.set(`${p.scopeType}|${p.routeId}|${p.segmentKey}|${p.weekday}|${p.timeBucket}|${p.kind}`, { ...p, updatedAt: at });
      for (const [k, v] of profiles) if (v.updatedAt < at) profiles.delete(k);
    },
    async purgeTokensBefore(d) {
      purgeCalls.push(d);
      if (opts.failPurge) throw new Error("x");
      let n = 0;
      for (const r of rawRows) if (r.reporterToken && r.serviceDate < d && days.has(r.serviceDate)) { r.reporterToken = null; n++; }
      return n;
    },
  };
  return { store, daily, profiles, days, purgeCalls };
}
const strip = (m: Map<string, { updatedAt: string }>) => [...m.entries()].map(([k, v]) => [k, { ...v, updatedAt: undefined }]).sort();

describe("aggregációs job", () => {
  const NOW = new Date("2026-10-07T02:20:00Z"); // szerda 04:20 Budapest -> mai szolgáltatási nap 10-07
  test("napi terv: utolsó 3 lezárt nap + felzárkóztatás; mai (nem lezárt) nap nem", () => {
    const plan = planAggregationDays("2026-10-07", new Set(), {});
    assert.ok(!("error" in plan));
    if (!("error" in plan)) {
      assert.ok(plan.days.includes("2026-10-06") && plan.days.includes("2026-10-04"));
      assert.ok(!plan.days.includes("2026-10-07"));
      assert.ok(plan.days.length <= AGGREGATION_JOB.maxDaysPerRun);
    }
    const built = new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-10-07", -(i + 1))));
    const p2 = planAggregationDays("2026-10-07", built, {});
    if (!("error" in p2)) assert.deepEqual(p2.days, ["2026-10-04", "2026-10-05", "2026-10-06"]);
  });
  test("backfill validáció", () => {
    assert.deepEqual(planAggregationDays("2026-10-07", new Set(), { from: "2026-10-01", to: "2026-10-07" }), { error: "RANGE_NOT_COMPLETE" });
    assert.deepEqual(planAggregationDays("2026-10-07", new Set(), { from: "2026-01-01", to: "2026-09-01" }), { error: "RANGE_TOO_LONG" });
    assert.deepEqual(planAggregationDays("2026-10-07", new Set(), { from: "x", to: "2026-09-01" }), { error: "INVALID_RANGE" });
  });
  test("idempotencia: kétszeri futás ugyanazt az állapotot adja (nincs duplázás)", async () => {
    const rows = [...solidCrowdingRows(), raw("very_crowded", "2026-10-06", { reporterToken: "bbbbbbbbbbbbbbbb" }), raw("very_crowded", "2026-10-06", { reporterToken: "bbbbbbbbbbbbbbbb" })];
    const m = memoryStore(rows);
    const first = await runCommunityLoadAggregation(m.store, { now: NOW });
    assert.ok("ok" in first && first.ok);
    const dailyAfterFirst = strip(m.daily);
    const profilesAfterFirst = strip(m.profiles);
    const second = await runCommunityLoadAggregation(m.store, { now: new Date(NOW.getTime() + 60_000) });
    assert.ok("ok" in second && second.ok);
    assert.deepEqual(strip(m.daily), dailyAfterFirst);
    assert.deepEqual(strip(m.profiles), profilesAfterFirst);
  });
  test("token purge lifecycle: csak aggregált, újraépítési ablakon kívüli napok; aggregálás előtt nem", async () => {
    const rows = [raw("crowded", "2026-09-29"), raw("crowded", "2026-10-06")];
    const m = memoryStore(rows);
    const s = await runCommunityLoadAggregation(m.store, { now: NOW });
    assert.ok("tokensPurged" in s);
    assert.deepEqual(m.purgeCalls, ["2026-10-04"]);
    assert.equal(rows[0].reporterToken, null, "09-29: aggregálva és ablakon kívül -> nullázva");
    assert.notEqual(rows[1].reporterToken, null, "10-06: még újraépülhet -> token marad");
  });
  test("purge-hiba nem rontja el a kész aggregátumot, de diagnosztizálható", async () => {
    const m = memoryStore(solidCrowdingRows(), { failPurge: true });
    const s = await runCommunityLoadAggregation(m.store, { now: NOW });
    assert.ok("purgeFailed" in s && s.purgeFailed === true && s.ok === false);
    assert.ok(m.profiles.size > 0 && m.daily.size > 0);
  });
});

describe("API, cron auth, privacy, migráció", () => {
  test("cron auth fail-closed", () => {
    const secret = "s".repeat(32);
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, secret), true);
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}x`, secret), false);
    assert.equal(isAuthorizedCronRequest(null, secret), false);
    assert.equal(isAuthorizedCronRequest("Bearer undefined", undefined), false);
    assert.equal(isAuthorizedCronRequest("Bearer short", "short"), false);
  });
  test("batch limit és validáció", () => {
    const one = { routeId: ROUTE, fromStopId: "a", toStopId: "b" };
    assert.equal(expectedLoadRequestSchema.safeParse({ contexts: [one] }).success, true);
    assert.equal(expectedLoadRequestSchema.safeParse({ contexts: Array(EXPECTED_LOAD_API.maxContexts).fill(one) }).success, true);
    assert.equal(expectedLoadRequestSchema.safeParse({ contexts: Array(EXPECTED_LOAD_API.maxContexts + 1).fill(one) }).success, false);
    for (const bad of [{ contexts: [] }, { contexts: [{ ...one, lat: 47 }] }, { contexts: [{ tripId: "x" }] }, { contexts: [{ routeId: "<x>" }] }, { contexts: [{ ...one, departureTime: "holnap" }] }]) {
      assert.equal(expectedLoadRequestSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
    const now = new Date("2026-10-06T10:00:00Z");
    assert.equal(resolveDepartureTime(null, now), now);
    assert.equal(resolveDepartureTime("2026-11-30T10:00:00Z", now), null, "túl messzi jövő");
    assert.ok(resolveDepartureTime("2026-10-07T05:45:00+02:00", now));
  });
  test("publikus kimenet: nincs token, nyers report, breakdown, mintaszám", () => {
    const profiles = profilesFrom(solidCrowdingRows());
    const pub = toPublicLoadEvaluation(evaluateCommunityLoad({ context: ctx(), profiles, realtimeRecords: [], now: AT_TUE_0800 }).evaluation);
    const json = JSON.stringify(pub);
    assert.doesNotMatch(json, /reporterToken|sampleCount|distinctDays|levels|breakdown|segmentKey|routeId|tripId/);
    assert.match(json, /"historicalPenalty"/);
    const api = stripComments(read("app/api/vedett-route/community-load/route.ts"));
    assert.match(api, /export async function POST\(request: Request\) \{\s*\n\s*const auth = await requireVedettRoutePublicRead\(request\);\s*\n\s*if \(!auth\.ok\) return auth\.response;/);
    assert.match(api, /toPublicLoadEvaluation\(/);
    assert.match(api, /status: 429/);
    assert.doesNotMatch(api, /includeBreakdown|reporter/);
    assert.match(api, /evaluateCommunityLoadContexts\(contexts, now\)/);
    const batch = stripComments(read("lib/vedett-route/communityReports/communityLoadBatch.ts"));
    assert.equal((batch.match(/fetchLoadProfilesForLookup\(/g) ?? []).length, 1, "egyetlen profil-lekérdezés (nincs N+1)");
    assert.equal((batch.match(/fetchRealtimeCandidateReportsBatch\(/g) ?? []).length, 1);
  });
  test("cron route: fail-closed auth, csak engedélyezett exportok; vercel.json ütemezés", () => {
    const cron = stripComments(read("app/api/cron/vedett-route-community-load/route.ts"));
    assert.match(cron, /isAuthorizedCronRequest\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/);
    for (const m of cron.matchAll(/^export (?:const|async function|function) (\w+)/gm)) assert.ok(["GET", "dynamic", "runtime", "maxDuration"].includes(m[1]), m[1]);
    const vercel = JSON.parse(read("vercel.json"));
    assert.ok(vercel.crons.some((c: { path: string }) => c.path === "/api/cron/vedett-route-community-load"));
  });
  test("migráció 20261009: táblák, kulcsok, indexek, RLS fail-closed, nincs azonosító", () => {
    const sql = stripComments(read("supabase/migrations/20261009_vedett_route_community_load_profiles.sql"));
    for (const t of ["vedett_route_community_load_daily", "vedett_route_community_load_profiles", "vedett_route_community_load_days"]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
      assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`));
    }
    for (const idx of ["vr_load_daily_key_idx", "vr_load_profiles_key_idx", "vr_load_profiles_lookup_idx", "vr_community_reports_service_date_idx"]) assert.match(sql, new RegExp(idx));
    assert.match(sql, /vedett_route_purge_reporter_tokens_before/);
    assert.doesNotMatch(sql, /CREATE POLICY|\bGRANT\b|\buser_id\b|reporter_scope_token\s+TEXT|\btrip_id\b|\bip\b|latitude|session/i);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/i);
    assert.ok("20261009_vedett_route_community_load_profiles.sql" > "20261008_vedett_route_community_realtime.sql");
  });
});
