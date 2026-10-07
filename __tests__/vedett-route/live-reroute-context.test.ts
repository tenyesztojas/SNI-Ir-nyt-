// VÉDETT ÚTVONAL — JOURNEY MONITOR v1 / 3. lépés: Live Alternative keresési kontextus
//   node --test __tests__/vedett-route/live-reroute-context.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, JourneyLeg, PersonalizationWeights } from "../../lib/vedett-route/types.ts";
import {
  buildLiveAlternativeSearchPayload,
  buildLiveRerouteSearchContext,
  parseLiveRerouteSearchContext,
  resolveEffectiveLiveRerouteContext,
  resolveLiveRerouteOrigin,
  type LiveRerouteSearchContext,
} from "../../lib/vedett-route/navigation/liveRerouteContext.ts";
import { evaluateEtaLiveAlternative } from "../../lib/vedett-route/navigation/journeyMonitor.ts";

// in-memory localStorage (persistencia tesztekhez)
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
};
const persistence = await import("../../lib/vedett-route/navigation/navigationSessionPersistence.ts");

const T0 = Date.parse("2026-10-07T10:00:00Z");
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();
const at = (min: number) => T0 + min * 60_000;

function transit(tripId: string, dep: number, arr: number, extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "BUS",
    fromName: `${tripId}-from`,
    toName: `${tripId}-to`,
    toLat: 47.5 + dep / 1000,
    toLon: 19.0 + arr / 1000,
    tripId,
    routeId: `R-${tripId}`,
    departureTime: iso(dep),
    arrivalTime: iso(arr),
    scheduledDepartureTime: iso(dep),
    scheduledArrivalTime: iso(arr),
    durationMinutes: arr - dep,
    realtime: false,
    ...extra,
  } as JourneyLeg;
}
const walk = (min: number, extra: Partial<JourneyLeg> = {}): JourneyLeg =>
  ({ mode: "WALK", fromName: "x", toName: "y", toLat: 47.49, toLon: 19.01, durationMinutes: min, realtime: false, ...extra }) as JourneyLeg;
const journey = (legs: JourneyLeg[], extra: Partial<Journey> = {}): Journey =>
  ({ legs, totalDurationMinutes: 60, departureTime: iso(0), arrivalTime: iso(60), ...extra }) as unknown as Journey;
// 5' séta -> T1 (5..20) -> 3' átszállás -> T2 (26..40) -> 6' séta
const base = (extra: Partial<Journey> = {}) => journey([walk(5), transit("T1", 5, 20), walk(3), transit("T2", 26, 40), walk(6)], extra);

const W: PersonalizationWeights = { transfers: 2, modeSwitches: 0.5, underground: 0, walking: 1.5, duration: 1, waiting: 2, crowding: 2, noise: 0 };
const GPS = { latitude: 47.4979, longitude: 19.0402 };
const DEST = { lat: 47.51, lon: 19.06, name: "Cél" };
const ctx = (over: Partial<Parameters<typeof buildLiveRerouteSearchContext>[0]> = {}) =>
  buildLiveRerouteSearchContext({ weights: W, stepFreeRequired: false, molBubiEnabled: false, bikePropulsion: "ANY", timeMode: "DEPART_AT", ...over });
const effective = (over: { restored?: LiveRerouteSearchContext | null; snapshot?: LiveRerouteSearchContext | null; journey?: Journey } = {}) =>
  resolveEffectiveLiveRerouteContext({ restored: over.restored ?? null, snapshot: over.snapshot ?? null, journey: over.journey ?? base(), fallbackWeights: { transfers: 1, modeSwitches: 1, underground: 1, walking: 1, duration: 1, waiting: 1 } });
const gpsPayload = (context: LiveRerouteSearchContext, nowMs = at(0)) =>
  buildLiveAlternativeSearchPayload({
    origin: resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 0, boundaryPhase: "WALKING", currentPosition: GPS, nowMs }),
    destination: DEST,
    context,
  })!;

describe("A–D: routing-feltételek megőrzése", () => {
  test("A) stepFreeRequired=true megmarad — és más forrás false-a sem írja felül", () => {
    assert.equal(gpsPayload(effective({ snapshot: ctx({ stepFreeRequired: true }) })).stepFreeRequired, true);
    // restored=true, snapshot=false -> true
    assert.equal(effective({ restored: ctx({ stepFreeRequired: true }), snapshot: ctx() }).stepFreeRequired, true);
    // restored=false, snapshot=true -> true
    assert.equal(effective({ restored: ctx(), snapshot: ctx({ stepFreeRequired: true }) }).stepFreeRequired, true);
    // kontextus nélkül, de a journey stepFree keresésből jött (accessibilityStatus) -> true
    const j = base({ accessibilityStatus: "VERIFIED_STEP_FREE" } as unknown as Partial<Journey>);
    assert.equal(effective({ journey: j }).stepFreeRequired, true);
  });
  test("B) false marad false (nincs fabrikált szigorítás)", () => {
    const p = gpsPayload(effective({ snapshot: ctx() }));
    assert.equal(p.stepFreeRequired, false);
    assert.equal(p.molBubiEnabled, false);
    assert.equal(p.bikePropulsion, "ANY");
  });
  test("C) weights (szenzoros + közösségi) megmaradnak, a snapshotból — nem a fallbackből", () => {
    const p = gpsPayload(effective({ snapshot: ctx() }));
    assert.deepEqual(p.weights, W);
    // restored elsőbbséget kap
    const restoredW = { ...W, noise: 2 };
    assert.deepEqual(effective({ restored: ctx({ weights: restoredW }), snapshot: ctx() }).weights, restoredW);
    // semmi kontextus -> a kártya weights prop-ja (fallback)
    assert.equal(effective().weights.transfers, 1);
  });
  test("D) Bubi + propulsion megmarad; propulsion Bubi nélkül nem szivárog; RENTAL láb a journey-ben -> Bubi true", () => {
    const p = gpsPayload(effective({ snapshot: ctx({ molBubiEnabled: true, bikePropulsion: "ELECTRIC_ASSIST" }) }));
    assert.equal(p.molBubiEnabled, true);
    assert.equal(p.bikePropulsion, "ELECTRIC_ASSIST");
    assert.equal(ctx({ molBubiEnabled: false, bikePropulsion: "HUMAN" }).bikePropulsion, "ANY");
    assert.equal(effective({ restored: ctx({ molBubiEnabled: true, bikePropulsion: "HUMAN" }), snapshot: ctx() }).bikePropulsion, "HUMAN");
    const rental = journey([walk(2), { mode: "RENTAL", fromName: "a", toName: "b", durationMinutes: 8, realtime: false } as JourneyLeg]);
    assert.equal(effective({ journey: rental }).molBubiEnabled, true);
  });
});

describe("E–I: kiinduló pont és departAt", () => {
  test("E) WALKING + GPS -> GPS origin, departAt = most, nincs fromName", () => {
    const o = resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 0, boundaryPhase: "WALKING", currentPosition: GPS, nowMs: at(1) });
    assert.equal(o.kind, "GPS");
    const p = buildLiveAlternativeSearchPayload({ origin: o, destination: DEST, context: ctx() })!;
    assert.deepEqual(p.fromCoordinates, GPS);
    assert.equal(p.departAt, iso(1));
    assert.equal("fromName" in p, false);
    // várakozás a megállóban (AT_BOARDING_AREA, aktív láb = TRANSIT) -> még szabadon válthat -> GPS
    assert.equal(resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 1, boundaryPhase: "AT_BOARDING_AREA", currentPosition: GPS, nowMs: at(4) }).kind, "GPS");
  });
  test("F) BOARDED az aktív TRANSIT lábon -> origin = toLat/toLon, fromName = toName", () => {
    const j = base();
    const o = resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) });
    assert.equal(o.kind, "ALIGHTING");
    const p = buildLiveAlternativeSearchPayload({ origin: o, destination: DEST, context: ctx() })!;
    assert.deepEqual(p.fromCoordinates, { latitude: j.legs[1].toLat, longitude: j.legs[1].toLon });
    assert.equal(p.fromName, "T1-to");
    assert.notDeepEqual(p.fromCoordinates, GPS);
  });
  test("G) realtime érkezési idő -> departAt (nem 'most')", () => {
    const j = journey([walk(5), transit("T1", 5, 20, { realtime: true, arrivalTime: iso(24), scheduledArrivalTime: iso(20) }), walk(4)]);
    const o = resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 1, boundaryPhase: "BOARDED_UNCERTAIN_GEOMETRY", currentPosition: GPS, nowMs: at(10) });
    assert.equal(o.kind, "ALIGHTING");
    assert.equal(o.kind === "ALIGHTING" && o.timeBasis, "REALTIME_ARRIVAL");
    assert.equal(buildLiveAlternativeSearchPayload({ origin: o, destination: DEST, context: ctx() })!.departAt, iso(24));
  });
  test("H) realtime nélkül a menetrendi érkezés; arrivalTime hiányában scheduledArrivalTime", () => {
    const o1 = resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) });
    assert.equal(o1.kind === "ALIGHTING" && o1.timeBasis, "SCHEDULED_ARRIVAL");
    assert.equal(o1.kind === "ALIGHTING" && o1.departAtMs, at(20));
    const j = journey([walk(5), transit("T1", 5, 20, { arrivalTime: undefined, scheduledArrivalTime: iso(21) }), walk(4)]);
    const o2 = resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) });
    assert.equal(o2.kind === "ALIGHTING" && o2.departAtMs, at(21));
    // tűréshatáron belül múltbeli érkezés -> most (a szerver elutasítaná a múltbelit)
    const o3 = resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(21) });
    assert.equal(o3.kind === "ALIGHTING" && o3.departAtMs, at(21));
  });
  test("I) járművön megbízható koordináta/idő nélkül -> SKIP, SOHA nem GPS origin", () => {
    const noCoord = journey([walk(5), transit("T1", 5, 20, { toLat: undefined, toLon: undefined }), walk(4)]);
    const noTime = journey([walk(5), transit("T1", 5, 20, { arrivalTime: undefined, scheduledArrivalTime: undefined }), walk(4)]);
    const cases = [
      resolveLiveRerouteOrigin({ journey: noCoord, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) }),
      resolveLiveRerouteOrigin({ journey: noTime, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) }),
      // régen elmúlt érkezés (elavult adat) járművön
      resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(30) }),
      // fázis-bizonyíték nélküli TRANSIT aktív láb, adat nélkül
      resolveLiveRerouteOrigin({ journey: noCoord, activeLegIndex: 1, boundaryPhase: "NOT_APPLICABLE", currentPosition: GPS, nowMs: at(10) }),
      // BOARDED, de az aktív láb indexe nem TRANSIT
      resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 2, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) }),
    ];
    for (const o of cases) {
      assert.equal(o.kind, "SKIP");
      assert.equal(buildLiveAlternativeSearchPayload({ origin: o, destination: DEST, context: ctx() }), null);
    }
  });
});

describe("J–K: CANCELLED / MISSED_CONNECTION — a fázis dönt, nem a trigger", () => {
  test("J) T1-en ülve a KÖVETKEZŐ (T2) törölt / csatlakozás elveszett -> a jelenlegi láb leszállási pontja", () => {
    const j = journey([walk(5), transit("T1", 5, 20), walk(3), transit("T2", 26, 40, { cancelled: true }), walk(6)]);
    const o = resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(12) });
    assert.equal(o.kind, "ALIGHTING");
    assert.equal(o.kind === "ALIGHTING" && o.legIndex, 1);
    assert.equal(o.kind === "ALIGHTING" && o.name, "T1-to");
    // MISSED_CONNECTION: T1 realtime késik, T2-t lekési -> ugyanígy T1 leszállás, a realtime érkezéssel
    const late = journey([walk(5), transit("T1", 5, 20, { realtime: true, arrivalTime: iso(27) }), walk(3), transit("T2", 26, 40), walk(6)]);
    const o2 = resolveLiveRerouteOrigin({ journey: late, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(12) });
    assert.equal(o2.kind === "ALIGHTING" && o2.departAtMs, at(27));
  });
  test("K) még fel nem szállt, a felszállandó járat törölt -> NEM járművön ülőként kezelt (GPS)", () => {
    const j = journey([walk(5), transit("T1", 5, 20, { cancelled: true }), walk(6)]);
    for (const phase of ["WALKING", "APPROACHING_BOARDING", "AT_BOARDING_AREA", "NOT_APPLICABLE", null] as const) {
      const o = resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 1, boundaryPhase: phase, currentPosition: GPS, nowMs: at(4) });
      assert.equal(o.kind, "GPS", String(phase));
    }
    // GPS hiányában nincs keresés
    assert.equal(resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 0, boundaryPhase: "WALKING", currentPosition: null, nowMs: at(4) }).kind, "SKIP");
  });
});

describe("L: persistencia — visszafelé kompatibilis, fail-open", () => {
  test("L) régi (kontextus nélküli) session betölt; érvényes kontextus visszajön; hibás kontextus csak a mezőt dobja", () => {
    const now = Date.now();
    const old = persistence.serializeNavigationSession({ destination: { name: "Cél" }, displayedJourney: base(), nowMs: now });
    assert.equal("liveRerouteContext" in old, false);
    persistence.saveNavigationSession(old);
    const loadedOld = persistence.loadNavigationSession(now);
    assert.ok(loadedOld);
    assert.equal(loadedOld!.liveRerouteContext, undefined);
    assert.equal(effective({ restored: loadedOld!.liveRerouteContext ?? null }).stepFreeRequired, false);

    const c = ctx({ stepFreeRequired: true, molBubiEnabled: true, bikePropulsion: "HUMAN" });
    persistence.saveNavigationSession(persistence.serializeNavigationSession({ destination: { name: "Cél" }, displayedJourney: base(), nowMs: now, liveRerouteContext: c }));
    assert.deepEqual(persistence.loadNavigationSession(now)!.liveRerouteContext, c);

    store.set(persistence.NAVIGATION_SESSION_STORAGE_KEY, JSON.stringify({ ...old, liveRerouteContext: { stepFreeRequired: "yes" } }));
    const broken = persistence.loadNavigationSession(now);
    assert.ok(broken, "a session megmarad");
    assert.equal(broken!.liveRerouteContext, undefined);
    assert.equal(parseLiveRerouteSearchContext(null), null);
    assert.equal(parseLiveRerouteSearchContext({ stepFreeRequired: true, molBubiEnabled: false }), null);
    // a perzisztált kontextus nem tartalmaz pozíciót
    assert.deepEqual(Object.keys(c).sort(), ["bikePropulsion", "molBubiEnabled", "stepFreeRequired", "timeMode", "weights"]);
  });
});

describe("M–O: időmód, ETA, nincs automatikus csere", () => {
  test("M) eredeti ARRIVE_BY -> a Live Alternative keresés DEPART_AT, departAt = az origin ideje (nem a múltbeli határidő)", () => {
    const c = ctx({ timeMode: "ARRIVE_BY" });
    assert.equal(c.timeMode, "ARRIVE_BY");
    const p = gpsPayload(effective({ snapshot: c }), at(3));
    assert.equal(p.timeMode, "DEPART_AT");
    assert.equal(p.departAt, iso(3));
    const o = resolveLiveRerouteOrigin({ journey: base(), activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) });
    const p2 = buildLiveAlternativeSearchPayload({ origin: o, destination: DEST, context: c })!;
    assert.equal(p2.timeMode, "DEPART_AT");
    assert.equal(p2.departAt, iso(20));
  });
  test("N) ETA-összehasonlítás változatlan: GPS originnél nowMs = Date.now(); leszállási originnél a walk-only jelölt nem alulbecsült", () => {
    const current = base();
    const candidate = journey([walk(3), transit("C1", 8, 30), walk(2)]);
    const a = evaluateEtaLiveAlternative({ current, activeLegIndex: 0, candidate, nowMs: at(1), triggerType: "MANUAL_CHECK" });
    const b = evaluateEtaLiveAlternative({ current, activeLegIndex: 0, candidate, nowMs: at(1), triggerType: "MANUAL_CHECK" });
    assert.deepEqual(a, b);
    assert.equal(a.currentRemainingMinutes, 45); // T2 érkezés 40 + 6' séta = 46 - 1
    // T1-en ülve (leszállás 20-kor): csak gyalogos jelölt a leszállástól 30 perc -> 50 > 46, nem jobb
    const walkOnly = journey([walk(30)]);
    const o = resolveLiveRerouteOrigin({ journey: current, activeLegIndex: 1, boundaryPhase: "BOARDED", currentPosition: GPS, nowMs: at(10) });
    const nowForEta = o.kind === "ALIGHTING" ? Math.max(at(10), o.departAtMs) : at(10);
    const d = evaluateEtaLiveAlternative({ current, activeLegIndex: 1, candidate: walkOnly, nowMs: nowForEta, triggerType: "MANUAL_CHECK" });
    assert.equal(d.offer, false);
    assert.ok(d.rawTimeDifferenceMinutes === null || d.rawTimeDifferenceMinutes < 0);
  });
  test("O) a wiring nem cserél automatikusan útvonalat; a fetch body a helperből jön", () => {
    const src = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
    const start = src.indexOf("const maybeStartLiveAlternativeSearch = async");
    const end = src.indexOf("presentLiveAlternativeOffer(", start);
    const block = src.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /resolveLiveRerouteOrigin\(\{/);
    assert.match(block, /buildLiveAlternativeSearchPayload\(\{/);
    assert.match(block, /if \(!liveSearchPayload \|\| liveOrigin\.kind === "SKIP"\) return;/);
    assert.match(block, /body: JSON\.stringify\(liveSearchPayload\)/);
    assert.doesNotMatch(block, /setDisplayedJourney\(/);
    assert.doesNotMatch(block, /departAt: new Date\(\)\.toISOString\(\)/);
    // a keresés snapshotja a SIKERES normál keresésből jön
    assert.match(src, /setLiveRerouteContext\(data\.ok \? buildLiveRerouteSearchContext\(body\) : null\)/);
    assert.match(src, /liveRerouteContext=\{liveRerouteContext\}/);
  });
});
