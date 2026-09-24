// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — DÁTUMOZOTT
// KORREKCIÓ. Ez a fájl korábban (Sprint 7.2) extractRealtimeUpdates()-t
// tesztelte, ami egy /plan válasz TÖBB, vegyes itinerary-jából próbált
// pontos tripId-egyezést találni. Élő VPS-audit bizonyította, hogy ez az
// architektúra egy már lefutott trip esetén szisztematikusan, csendben
// hibázik — a realtime-refresh MOSTANTÓL SOHA nem hív /plan-t, helyette
// tripId-nkénti GET /api/v6/trip hívásokból vágja ki a user saját
// boarding/alighting sub-leg-jét (lásd lib/vedett-route/realtimeRefresh/
// extractUpdates.ts fejléce). Ez a teszt-fájl EZÉRT extractSubLegRealtime
// Update()-et és extractRealtimeUpdatesFromTrips()-et teszteli — a korábbi
// tesztek NEM lettek szó nélkül törölve, az EGYEZŐ eseteket (exact
// identity, routeId-konfliktus, cancelled, no-op üres identitásra) ez a
// fájl VÁLTOZATLAN LOGIKÁVAL, csak az új bemeneti alakra (/trip válasz +
// sub-leg stopId-k) átültetve tartja meg.
//   node --test __tests__/vedett-route/realtime-refresh-extract.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRealtimeSubLegOutcome,
  extractRealtimeUpdatesFromTrips,
  extractSubLegRealtimeUpdate,
  type RealtimeRefreshIdentity,
} from "../../lib/vedett-route/realtimeRefresh/extractUpdates.ts";
import type { MotisItinerary, MotisLeg } from "../../lib/vedett-route/motisTypes.ts";

// A /trip válasz ALAKJA megegyezik egy /plan itinerary-jével: EGY leg,
// ami a TELJES fizikai trip origin-to-destination szakaszát írja le,
// intermediateStops-szal a köztes megállókhoz.
function tripResponse(overrides: Partial<MotisLeg> = {}): MotisItinerary {
  const leg: MotisLeg = {
    mode: "SUBWAY",
    tripId: "20260923_06:43_bkkgtfs_C97566391",
    routeId: "bkkgtfs_5200",
    routeShortName: "M2",
    from: { name: "Örs vezér tere", stopId: "bkkgtfs_STOP_ORS", departure: "2026-09-23T06:43:00Z", scheduledDeparture: "2026-09-23T06:43:00Z" },
    to: { name: "Déli pályaudvar", stopId: "bkkgtfs_STOP_DELI", arrival: "2026-09-23T07:01:00Z", scheduledArrival: "2026-09-23T06:58:00Z" },
    intermediateStops: [
      { name: "Kossuth Lajos tér", stopId: "bkkgtfs_STOP_KOSSUTH", departure: "2026-09-23T06:57:00Z", scheduledDeparture: "2026-09-23T06:54:00Z" },
    ],
    startTime: "2026-09-23T06:43:00Z",
    endTime: "2026-09-23T07:01:00Z",
    realTime: true,
    ...overrides,
  };
  return { duration: 1080, startTime: leg.startTime!, endTime: leg.endTime!, transfers: 0, legs: [leg] };
}

const KOSSUTH_TO_DELI: RealtimeRefreshIdentity = {
  tripId: "20260923_06:43_bkkgtfs_C97566391",
  routeId: "bkkgtfs_5200",
  fromStopId: "bkkgtfs_STOP_KOSSUTH",
  toStopId: "bkkgtfs_STOP_DELI",
};

test("[3] a Kossuth->Déli sub-leget helyesen vágja ki a teljes trip /trip válaszból, a saját megállói időivel", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.departureTime, "2026-09-23T06:57:00Z"); // Kossuth indulás, NEM a trip origin (06:43)
  assert.equal(update!.arrivalTime, "2026-09-23T07:01:00Z"); // Déli érkezés = trip destination (egyezik, mert Déli a trip vége is)
});

test("[4] a teljes trip origin startTime-ja (06:43) SOHA nem írja felül a sub-leg saját (Kossuth, 06:57) indulási idejét", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), KOSSUTH_TO_DELI);
  assert.notEqual(update!.departureTime, "2026-09-23T06:43:00Z");
  assert.equal(update!.scheduledDepartureTime, "2026-09-23T06:54:00Z"); // Kossuth SAJÁT scheduled, nem a trip origin 06:43
});

test("[5] egy intermediateStops-beli megálló (Kossuth) helyesen használható sub-leg boundary-ként (from oldalon)", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.departureTime, "2026-09-23T06:57:00Z");
});

test("[6] exact trip identity megőrződik — eltérő tripId esetén no-op, SOHA nem helyettesít másik tripet", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), { ...KOSSUTH_TO_DELI, tripId: "OTHER_TRIP" });
  assert.equal(update, null);
});

test("[6b] mindkét oldalon jelen lévő, DE eltérő routeId esetén no-op (konzervatív döntés, VÁLTOZATLAN Sprint 7.2 óta)", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), { ...KOSSUTH_TO_DELI, routeId: "bkkgtfs_OTHER_ROUTE" });
  assert.equal(update, null);
});

test("[7] hiányzó/ismeretlen trip (null /trip válasz) -> no-op", () => {
  const update = extractSubLegRealtimeUpdate(null, KOSSUTH_TO_DELI);
  assert.equal(update, null);
});

test("[8] nem egyező fromStopId a válasz megálló-sorozatában -> no-op, SOSEM közelít a legközelebbi stophoz", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), { ...KOSSUTH_TO_DELI, fromStopId: "bkkgtfs_STOP_UNKNOWN" });
  assert.equal(update, null);
});

test("[8b] nem egyező toStopId -> no-op", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), { ...KOSSUTH_TO_DELI, toStopId: "bkkgtfs_STOP_UNKNOWN" });
  assert.equal(update, null);
});

test("[8c] hiányzó fromStopId/toStopId a kérésben -> no-op (nincs biztonságos sub-leg-kivágás)", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), { tripId: KOSSUTH_TO_DELI.tripId });
  assert.equal(update, null);
});

test("[9] realtime=false (trip-szintű realTime hiányzik) esetén realtime:false, SOHA nem állít hamis realtime-ot", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse({ realTime: false }), KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.realtime, false);
});

test("[9b] trip-szintű realTime=true, DE a sub-leg saját határponti megállóján nincs tényleges idő -> realtime:false (nem terjeszti ki a trip-szintű jelzést)", () => {
  const trip = tripResponse();
  trip.legs[0].intermediateStops = [{ name: "Kossuth Lajos tér", stopId: "bkkgtfs_STOP_KOSSUTH" }]; // nincs departure mező
  trip.legs[0].to = { name: "Déli pályaudvar", stopId: "bkkgtfs_STOP_DELI" }; // nincs arrival mező
  const update = extractSubLegRealtimeUpdate(trip, KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.realtime, false);
});

// KÓD-REVIEW KÖVETKEZŐ KÖR (2026-09-23) — DÁTUMOZOTT PONTOSÍTÁS: a fenti
// [9b] teszt elvárása NEM változott — a review megerősítette, hogy ez
// HELYES viselkedés (biztonságos no-signal eset, nem "késés hiánya"), és
// EZZEL EGYÜTT hozzáadja a [A]/[B] eseteket, amik expliciten bizonyítják,
// hogy a realtime:true SOHA nincs késéshez kötve — egy PONTOSAN időben
// futó, realtime-nyomon-követett sub-leg is realtime:true kell maradjon.

test("[A] realTime=true + a tényleges határponti idő PONTOSAN megegyezik a menetrendivel -> realtime mégis true (nincs késéshez kötve)", () => {
  const onTimeTrip = tripResponse();
  // A saját határponti (Kossuth/Déli) megegyező tényleges/menetrendi idő
  // — pontosan időben futó, DE realtime-nyomon-követett trip.
  onTimeTrip.legs[0].intermediateStops = [
    { name: "Kossuth Lajos tér", stopId: "bkkgtfs_STOP_KOSSUTH", departure: "2026-09-23T06:57:00Z", scheduledDeparture: "2026-09-23T06:57:00Z" },
  ];
  onTimeTrip.legs[0].to = { name: "Déli pályaudvar", stopId: "bkkgtfs_STOP_DELI", arrival: "2026-09-23T07:01:00Z", scheduledArrival: "2026-09-23T07:01:00Z" };
  const update = extractSubLegRealtimeUpdate(onTimeTrip, KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.realtime, true, "pontosan időben futó realtime trip is realtime:true kell legyen");
  assert.equal(update!.delayMinutes, 0);
});

test("[B] realTime=true + a tényleges határponti idő ELTÉR a menetrendittől -> realtime továbbra is true (változatlan viselkedés)", () => {
  // A tripResponse() default fixture már egy 3 perces késést tartalmaz a
  // Kossuth/Déli határpontokon (departure/arrival != scheduled*).
  const update = extractSubLegRealtimeUpdate(tripResponse(), KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.realtime, true);
  assert.notEqual(update!.departureTime, update!.scheduledDepartureTime);
});

test("[C] hiányzó/nem biztonságosan meghatározható sub-leg indulás esetén a TELJES trip saját origin startTime-ja SOHA nem szivárog a válaszba", () => {
  const trip = tripResponse();
  // A Kossuth (from) bejegyzésen NINCS departure mező — a sub-leg saját
  // indulási ideje nem határozható meg biztonságosan.
  trip.legs[0].intermediateStops = [{ name: "Kossuth Lajos tér", stopId: "bkkgtfs_STOP_KOSSUTH" }];
  const update = extractSubLegRealtimeUpdate(trip, KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.departureTime, undefined, "hiányzó sub-leg indulás esetén a mező undefined marad, SOHA nem töltődik ki");
  assert.notEqual(update!.departureTime, trip.legs[0].startTime, "a TELJES trip Örs-i indulása (startTime) SOHA nem eshet a Kossuth sub-leg indulás helyére");
});

test("[D] hiányzó/nem biztonságosan meghatározható sub-leg érkezés esetén a TELJES trip saját destination endTime-ja SOHA nem szivárog a válaszba", () => {
  const trip = tripResponse();
  // A Déli (to) bejegyzésen NINCS arrival mező — a sub-leg saját érkezési
  // ideje nem határozható meg biztonságosan (a trip-szintű to VÉLETLENÜL
  // ugyanaz a megálló, mint a sub-leg saját toStopId-je — ez a "legrosszabb
  // eset", ahol a hibás fallback a legkönnyebben észrevétlen maradna).
  trip.legs[0].to = { name: "Déli pályaudvar", stopId: "bkkgtfs_STOP_DELI" };
  const update = extractSubLegRealtimeUpdate(trip, KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.arrivalTime, undefined, "hiányzó sub-leg érkezés esetén a mező undefined marad, SOHA nem töltődik ki");
  assert.notEqual(update!.arrivalTime, trip.legs[0].endTime, "a TELJES trip Déli érkezése (endTime) NEM eshet automatikusan egybe a sub-leg saját érkezésével egy hibás fallback miatt");
  // MEGJEGYZÉS: a delayMinutes ebben az esetben MÉGIS számítható (a
  // computeDelayMinutes() a leg.from.scheduledDeparture/leg.startTime
  // párra esik vissza, ami itt TOVÁBBRA IS a Kossuth SAJÁT, helyesen
  // kivágott indulási idejéből származik, NEM a teljes trip endTime-jából
  // — ez továbbra sem sérti a fenti invariánst, mert a synthetic leg
  // endTime-ja itt is undefined marad (nincs teljes-trip fallback), csak a
  // computeDelayMinutes() SAJáT, meglevő, érintélenül hagyott
  // startTime/from-ágát használja — ez a MEGLÉVŐ, bizonyított logika,
  // nem ennek a bugfixnek a része.
  assert.equal(update!.delayMinutes, 3);
});

test("[10] cancelled KIZÁRÓLAG a /trip válasz explicit cancelled:true mezőjéből, soha nem következtetve", () => {
  const cancelledTrip = tripResponse({ cancelled: true });
  const update = extractSubLegRealtimeUpdate(cancelledTrip, KOSSUTH_TO_DELI);
  assert.ok(update);
  assert.equal(update!.cancelled, true);
});

test("[10b] cancelled hiányában a mező undefined marad (soha nem explicit false)", () => {
  const update = extractSubLegRealtimeUpdate(tripResponse(), KOSSUTH_TO_DELI);
  assert.equal(update!.cancelled, undefined);
});

test("[11] extractRealtimeUpdatesFromTrips: több, különböző tripId-jű TRANSIT láb egymástól függetlenül frissül", () => {
  const secondTripLeg: MotisLeg = {
    mode: "RAIL",
    tripId: "20260923_07:10_mav_R123",
    from: { name: "Kelenföld", stopId: "mav_STOP_KF", departure: "2026-09-23T07:12:00Z" },
    to: { name: "Százhalombatta", stopId: "mav_STOP_SZHB", arrival: "2026-09-23T07:30:00Z" },
    startTime: "2026-09-23T07:10:00Z",
    endTime: "2026-09-23T07:31:00Z",
    realTime: true,
  };
  const secondTrip: MotisItinerary = { duration: 1260, startTime: "2026-09-23T07:10:00Z", endTime: "2026-09-23T07:31:00Z", transfers: 0, legs: [secondTripLeg] };

  const identities: RealtimeRefreshIdentity[] = [
    KOSSUTH_TO_DELI,
    { tripId: "20260923_07:10_mav_R123", fromStopId: "mav_STOP_KF", toStopId: "mav_STOP_SZHB" },
  ];
  const map = new Map([
    [KOSSUTH_TO_DELI.tripId, tripResponse()],
    ["20260923_07:10_mav_R123", secondTrip],
  ]);

  const updates = extractRealtimeUpdatesFromTrips(identities, map);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].tripId, KOSSUTH_TO_DELI.tripId);
  assert.equal(updates[1].tripId, "20260923_07:10_mav_R123");
  assert.equal(updates[1].departureTime, "2026-09-23T07:12:00Z");
});

test("[13] semmilyen bizonytalan feltétel esetén (hiányzó Map-bejegyzés) nem helyettesít másik tripet, csak no-op", () => {
  const identities: RealtimeRefreshIdentity[] = [KOSSUTH_TO_DELI];
  const emptyMap = new Map<string, MotisItinerary | null>();
  const updates = extractRealtimeUpdatesFromTrips(identities, emptyMap);
  assert.deepEqual(updates, []);
});

test("üres identitás-lista esetén üres frissítés-lista jön vissza, nincs hiba", () => {
  const updates = extractRealtimeUpdatesFromTrips([], new Map());
  assert.deepEqual(updates, []);
});

test("üres tripId-jű identitás bejegyzést kihagyja (nincs bizonytalan párosítás)", () => {
  const updates = extractRealtimeUpdatesFromTrips([{ tripId: "", fromStopId: "a", toStopId: "b" }], new Map([["", tripResponse()]]));
  assert.deepEqual(updates, []);
});

// REALTIME DIAGNOSTIC LOGGING (2026-09-24) — a PURE reason-classification
// helper (classifyRealtimeSubLegOutcome) célzott tesztje, a TÉNYLEGESEN
// létező no-op ágakra (nem console/logger-mockolás — lásd a modul fejlécét:
// a logging KIZÁRÓLAG erre a helperre épül, ugyanazt az update-et adja
// vissza, mint extractSubLegRealtimeUpdate, byte-ra megegyezően).
test("[reason] hiányzó /trip válasz (null) -> TRIP_NOT_FOUND, update: null", () => {
  const outcome = classifyRealtimeSubLegOutcome(null, KOSSUTH_TO_DELI);
  assert.deepEqual(outcome, { reason: "TRIP_NOT_FOUND", update: null });
});

test("[reason] hiányzó fromStopId/toStopId a kérésben -> STOP_RANGE_NOT_FOUND, update: null", () => {
  const outcome = classifyRealtimeSubLegOutcome(tripResponse(), { tripId: KOSSUTH_TO_DELI.tripId });
  assert.deepEqual(outcome, { reason: "STOP_RANGE_NOT_FOUND", update: null });
});

test("[reason] nem egyező fromStopId a válasz megálló-sorozatában -> STOP_RANGE_NOT_FOUND, update: null", () => {
  const outcome = classifyRealtimeSubLegOutcome(tripResponse(), { ...KOSSUTH_TO_DELI, fromStopId: "bkkgtfs_STOP_UNKNOWN" });
  assert.deepEqual(outcome, { reason: "STOP_RANGE_NOT_FOUND", update: null });
});

test("[reason] eltérő tripId (nincs illeszkedő leg a /trip válaszban) -> IDENTITY_MISMATCH, update: null", () => {
  const outcome = classifyRealtimeSubLegOutcome(tripResponse(), { ...KOSSUTH_TO_DELI, tripId: "OTHER_TRIP" });
  assert.deepEqual(outcome, { reason: "IDENTITY_MISMATCH", update: null });
});

test("[reason] mindkét oldalon jelen lévő, DE eltérő routeId -> IDENTITY_MISMATCH, update: null", () => {
  const outcome = classifyRealtimeSubLegOutcome(tripResponse(), { ...KOSSUTH_TO_DELI, routeId: "bkkgtfs_OTHER_ROUTE" });
  assert.deepEqual(outcome, { reason: "IDENTITY_MISMATCH", update: null });
});

test("[reason] megvan a trip + a sub-leg stopjai, DE nincs jelenthető határponti idő -> NO_REALTIME_DATA, update NEM null", () => {
  const trip = tripResponse();
  trip.legs[0].intermediateStops = [{ name: "Kossuth Lajos tér", stopId: "bkkgtfs_STOP_KOSSUTH" }]; // nincs departure mező
  trip.legs[0].to = { name: "Déli pályaudvar", stopId: "bkkgtfs_STOP_DELI" }; // nincs arrival mező
  const outcome = classifyRealtimeSubLegOutcome(trip, KOSSUTH_TO_DELI);
  assert.equal(outcome.reason, "NO_REALTIME_DATA");
  assert.ok(outcome.update);
  assert.equal(outcome.update!.realtime, false);
});

test("[reason] sikeres sub-leg kivágás, van jelenthető idő -> UPDATED, update NEM null", () => {
  const outcome = classifyRealtimeSubLegOutcome(tripResponse(), KOSSUTH_TO_DELI);
  assert.equal(outcome.reason, "UPDATED");
  assert.ok(outcome.update);
  assert.equal(outcome.update!.departureTime, "2026-09-23T06:57:00Z");
});

test("[reason] proven cancellation -> UPDATED, update.cancelled === true", () => {
  const outcome = classifyRealtimeSubLegOutcome(tripResponse({ cancelled: true }), KOSSUTH_TO_DELI);
  assert.equal(outcome.reason, "UPDATED");
  assert.equal(outcome.update?.cancelled, true);
});

test("[reason] classifyRealtimeSubLegOutcome().update MEGEGYEZIK extractSubLegRealtimeUpdate() visszatérésével minden ágon", () => {
  const cases: Array<[MotisItinerary | null, RealtimeRefreshIdentity]> = [
    [null, KOSSUTH_TO_DELI],
    [tripResponse(), { tripId: KOSSUTH_TO_DELI.tripId }],
    [tripResponse(), { ...KOSSUTH_TO_DELI, tripId: "OTHER_TRIP" }],
    [tripResponse(), { ...KOSSUTH_TO_DELI, fromStopId: "bkkgtfs_STOP_UNKNOWN" }],
    [tripResponse(), KOSSUTH_TO_DELI],
    [tripResponse({ cancelled: true }), KOSSUTH_TO_DELI],
  ];
  for (const [trip, identity] of cases) {
    assert.deepEqual(classifyRealtimeSubLegOutcome(trip, identity).update, extractSubLegRealtimeUpdate(trip, identity));
  }
});
