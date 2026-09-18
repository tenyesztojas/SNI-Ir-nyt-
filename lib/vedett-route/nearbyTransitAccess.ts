// VÉDETT ÚTVONAL — NEARBY TRANSIT ACCESS CANDIDATE BUILDER
// (Nearby Transit Access Backend sprint — integráció előtti candidate-builder,
// 2026-09-17)
//
// Ez a modul KOMBINÁLJA (először a teljes sprint-sorozatban) a két korábbi,
// önállóan tesztelt, egymástól független építőkockát:
//   - lookupNearbyStops()      (accessibilityLookupClient.ts) — közeli
//     megállók, Haversine, KIZÁRÓLAG candidate-discovery célú távolsággal.
//   - fetchMotisWalkingRoute() (motisClient.ts)                — a MOTIS
//     bizonyított POST /api/route (profile:"foot") gyalogos street-routing
//     hívása, valós hálózati távolsággal/idővel/geometriával.
// egyetlen "koordináta-origóból gyalogosan tényleg elérhető megálló, mennyi
// idő/méter/milyen valós geometria alatt" pipeline-ná.
//
// SZIGORÚAN IZOLÁLT (spec): ezt a modult ebben a sprintben SEHOL nem hívja
// az orchestrator.ts route-search flow-ja. Ez a modul NEM hívja
// fetchMotisPlan-t, NEM végez transit (stopId->stopId) tervezést, NEM épít
// Journey/JourneyLeg-et, NEM módosítja a rangsorolást (ranking.ts). Kizárólag
// a következő, szigorúan határolt lépéssorozat: koordináta-origó -> közeli
// megállók (discovery) -> valós gyalogos elérhetőségi candidate-ok.
//
// LEVEL DÖNTÉS (V1, tudatosan dokumentált, spec 4. pont): mind az origó,
// mind a megálló-cél szintje 0 (utcaszint) — a bizonyított POST /api/route
// E2E teszt is utcaszintű start/destination koordinátákkal futott. A GTFS
// location_type mezőből származó -1/-2 szint-becslés (aluljáró/metró-peron)
// EBBEN a sprintben EXPLICIT KI van zárva — az állomás beltéri/peron
// gyalogos elérése egy külön, jövőbeli probléma, amit ez a sprint TUDATOSAN
// nem old meg.
//
// KÉRÉS-KÖLTSÉGVETÉS (spec 5. pont): egy buildNearbyTransitAccessCandidates()
// futás PONTOSAN 1 lookupNearbyStops() hívást indít, és LEGFELJEBB
// `nearbyStopLimit` fetchMotisWalkingRoute() hívást (alapérték
// DEFAULT_NEARBY_STOP_LIMIT=3, felső korlát MAX_NEARBY_STOP_LIMIT=10 — a
// sidecar saját MAX_NEARBY_LIMIT-jével egyező, lásd
// vps-accessibility-sidecar/src/nearbyStops.ts). NINCS retry-fanout, NINCS
// rekurzív keresés, NINCS automatikus radius-bővítés. A gyalogos hívások
// egyszerű, korlátozott párhuzamossággal futnak (Promise.all — a limit már
// eleve kis, fix szám, nincs szükség általános worker poolra).
//
// FAIL-SAFE (spec 6. pont): egyetlen gyalogos candidate hibája (timeout,
// routing_error, invalid_input, stb.) vagy hasznavehetetlen geometriája
// SOSEM állítja meg/hibásítja a teljes buildert — az érintett candidate
// egyszerűen kimarad az eredményből, a többi candidate-ot nem érinti. A
// teljes nearby-lookup hibája (lookupNearbyStops() null-t ad) egy KÜLÖN,
// korábbi kódágon (a gyalogos hívások megkezdése ELŐTT) tér vissza — ez a
// modul SOHA nem dob felhasználó felé jutó kivételt, mindkét hibaeset a
// hívó számára funkcionálisan azonos, fail-safe {ok:true, candidates:[]}
// eredményre vezet.
//
// WALKABILITY SZŰRŐ (spec 7. pont): egy candidate KIZÁRÓLAG akkor kerül be
// az eredménybe, ha a gyalogos route sikeres volt, van használható
// geometriája (flattenStreetRouteGeometry() nem ad null-t), ÉS a
// walkingDistanceMeters/walkingDurationSeconds mindkettő finite. NINCS
// Haversine-alapú távolság/idő-helyettesítés, és NINCS termékszabály-szerű
// "max X perces gyaloglás" szűrés ebben a sprintben — a radius KIZÁRÓLAG a
// discovery bounding boxot határolja, a tényleges gyaloglási útvonal ennél
// hosszabb is lehet.
//
// SORREND (spec 8. pont): ez KIZÁRÓLAG access-candidate sorrend, NEM a
// végső journey-rangsorolás — elsődlegesen walkingDurationSeconds
// növekvő, majd walkingDistanceMeters növekvő, majd stopId lexikografikus.

import { lookupNearbyStops } from "./accessibilityLookupClient.ts";
import { fetchMotisWalkingRoute } from "./motisClient.ts";
import { flattenStreetRouteGeometry } from "./motisStreetRoute.ts";
import type { StreetRouteCoordinate } from "./motisStreetRoute.ts";
import { vedettRouteLog } from "./logger.ts";
import type { TransitProviderId } from "./types.ts";
import type { NearbyStopCandidate } from "./accessibilityLookupClient.ts";

/** Alapérték — LEGFELJEBB ennyi gyalogos MOTIS-hívás indul futásonként, ha a hívó nem ad meg mást. */
export const DEFAULT_NEARBY_STOP_LIMIT = 3;

// A sidecar saját MAX_NEARBY_LIMIT-jével EGYEZŐ felső korlát (lásd
// vps-accessibility-sidecar/src/nearbyStops.ts) — ez a modul SOSEM kérhet
// (és SOSEM indíthat gyalogos hívást) többre, mint amit a sidecar
// egyáltalán kiszolgálna.
export const MAX_NEARBY_STOP_LIMIT = 10;

export interface NearbyTransitAccessInput {
  provider: TransitProviderId;
  originLat: number;
  originLon: number;
  /** Nearby-stops discovery sugár (méter) — lásd accessibilityLookupClient.ts lookupNearbyStops(), a sidecar-oldali alapérték/max érvényes rá. */
  radiusMeters?: number;
  /** Legfeljebb ennyi gyalogos MOTIS-hívás — alapérték DEFAULT_NEARBY_STOP_LIMIT, felső korlát MAX_NEARBY_STOP_LIMIT. */
  nearbyStopLimit?: number;
}

export interface ReachableStopCandidate {
  stopId: string;
  parentStation?: string;
  stopName?: string;
  stopLat: number;
  stopLon: number;
  /** A nearby-stops discovery Haversine-távolsága (SOSEM tényleges gyaloglási távolság/idő). */
  discoveryDistanceMeters: number;
  /** A MOTIS POST /api/route valós hálózati gyaloglási távolsága (méter). */
  walkingDistanceMeters: number;
  /** A MOTIS POST /api/route valós gyaloglási ideje (másodperc). */
  walkingDurationSeconds: number;
  /** A valós MOTIS útvonal-geometria (flattenStreetRouteGeometry() kimenete) — SOHA nem kitalált/interpolált pont. */
  walkingGeometry: readonly StreetRouteCoordinate[];
  usesElevator: boolean;
}

export interface NearbyTransitAccessResult {
  ok: true;
  candidates: ReachableStopCandidate[];
}

function clampNearbyStopLimit(limit: number | undefined): number {
  const raw = limit ?? DEFAULT_NEARBY_STOP_LIMIT;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_NEARBY_STOP_LIMIT;
  return Math.min(Math.floor(raw), MAX_NEARBY_STOP_LIMIT);
}

/**
 * Egyetlen közeli megálló gyalogos elérhetőségének kiértékelése. SOSEM dob
 * kivételt — sikertelen/hasznavehetetlen esetben `null`-t ad, amit a hívó
 * (buildNearbyTransitAccessCandidates) egyszerűen kihagy az eredményből
 * (spec 6+7. pont).
 */
async function evaluateWalkingAccess(
  origin: { lat: number; lon: number },
  stop: NearbyStopCandidate
): Promise<ReachableStopCandidate | null> {
  // V1 döntés (spec 4. pont, lásd fájl-fejléc): mindkét oldal level=0.
  const start = { lat: origin.lat, lng: origin.lon, level: 0 };
  const destination = { lat: stop.lat, lng: stop.lon, level: 0 };

  const result = await fetchMotisWalkingRoute(start, destination);
  if (!result.ok) {
    vedettRouteLog("routing_error", "info", {
      reason: "nearby_transit_access_walking_route_failed",
      stopId: stop.stopId,
      walkingReason: result.reason,
    });
    return null;
  }

  const geometry = flattenStreetRouteGeometry(result.data);
  if (!geometry) {
    vedettRouteLog("malformed_response", "info", {
      reason: "nearby_transit_access_unusable_geometry",
      stopId: stop.stopId,
    });
    return null;
  }

  const { duration, distance, usesElevator } = result.data.metadata;
  if (!Number.isFinite(duration) || !Number.isFinite(distance)) return null;

  return {
    stopId: stop.stopId,
    parentStation: stop.parentStation,
    stopName: stop.name,
    stopLat: stop.lat,
    stopLon: stop.lon,
    discoveryDistanceMeters: stop.distanceMeters,
    walkingDistanceMeters: distance,
    walkingDurationSeconds: duration,
    walkingGeometry: geometry,
    usesElevator,
  };
}

/** Determinisztikus access-candidate sorrend (spec 8. pont) — NEM a végső journey-rangsorolás. */
function compareCandidates(a: ReachableStopCandidate, b: ReachableStopCandidate): number {
  if (a.walkingDurationSeconds !== b.walkingDurationSeconds) {
    return a.walkingDurationSeconds - b.walkingDurationSeconds;
  }
  if (a.walkingDistanceMeters !== b.walkingDistanceMeters) {
    return a.walkingDistanceMeters - b.walkingDistanceMeters;
  }
  return a.stopId < b.stopId ? -1 : a.stopId > b.stopId ? 1 : 0;
}

/**
 * A candidate-builder pipeline: koordináta-origó -> lookupNearbyStops() ->
 * legfeljebb `nearbyStopLimit` fetchMotisWalkingRoute() hívás -> gyalogosan
 * ténylegesen elérhető megálló-candidate-ok, walkingDurationSeconds szerint
 * növekvő sorrendben (majd walkingDistanceMeters, majd stopId).
 *
 * SOSEM dob kivételt. A nearby-lookup teljes hibája (lookupNearbyStops() ==
 * null) és az összes gyalogos hívás hibája is ugyanarra a
 * `{ok:true, candidates:[]}` eredményre vezet — nincs külön "hiba" ág, mert
 * a hívó számára ez funkcionálisan azonos: "jelenleg nincs ismert
 * gyalogosan elérhető megálló" (fail-safe, spec 6. pont). A két eset a
 * kódban ELKÜLÖNÍTETT ágon fut (a nearby-lookup hibája a gyalogos hívások
 * megkezdése ELŐTT, korábban tér vissza).
 */
export async function buildNearbyTransitAccessCandidates(
  input: NearbyTransitAccessInput
): Promise<NearbyTransitAccessResult> {
  const nearbyStopLimit = clampNearbyStopLimit(input.nearbyStopLimit);

  // PONTOSAN 1 nearby-stops lookup futásonként (spec 5. pont).
  const nearbyStops = await lookupNearbyStops(
    input.provider,
    input.originLat,
    input.originLon,
    input.radiusMeters,
    nearbyStopLimit
  );

  if (!nearbyStops || nearbyStops.length === 0) {
    // Külön, korábbi ág: a nearby-lookup teljes hibája/üres eredménye —
    // a gyalogos hívások meg sem kezdődnek.
    return { ok: true, candidates: [] };
  }

  // Fail-safe levágás: MÉG AKKOR IS legfeljebb `nearbyStopLimit` hosszúra
  // vágjuk a listát, ha a sidecar (hibásan/váratlanul) többet adna vissza —
  // ez a modul SOSEM indít ennél több gyalogos hívást.
  const boundedStops = nearbyStops.slice(0, nearbyStopLimit);

  const origin = { lat: input.originLat, lon: input.originLon };
  const settled = await Promise.all(boundedStops.map((stop) => evaluateWalkingAccess(origin, stop)));

  const candidates = settled.filter((c): c is ReachableStopCandidate => c !== null);
  candidates.sort(compareCandidates);

  return { ok: true, candidates };
}
