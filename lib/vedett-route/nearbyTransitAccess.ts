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
// KÉRÉS-KÖLTSÉGVETÉS (spec 5. pont, MÓDOSÍTVA a 2026-09-18 production
// regresszió javításával — lásd DISCOVERY VS. PROCESSING LIMIT lent):
// egy buildNearbyTransitAccessCandidates() futás PONTOSAN 1
// lookupNearbyStops() hívást indít, és LEGFELJEBB `nearbyStopLimit`
// fetchMotisWalkingRoute() hívást (alapérték DEFAULT_NEARBY_STOP_LIMIT=6,
// felső korlát MAX_NEARBY_STOP_LIMIT=10 — a sidecar saját
// MAX_NEARBY_LIMIT-jével egyező, lásd
// vps-accessibility-sidecar/src/nearbyStops.ts). NINCS retry-fanout, NINCS
// rekurzív keresés, NINCS automatikus radius-bővítés. A gyalogos hívások
// egyszerű, korlátozott párhuzamossággal futnak (Promise.all — a limit már
// eleve kis, fix szám, nincs szükség általános worker poolra).
//
// DISCOVERY VS. PROCESSING LIMIT (2026-09-18 production regresszió,
// javítás): a KORÁBBI kód a sidecar /nearby-stops kérés `limit` mezőjét
// ÉS a tényleges gyalogos/MOTIS-feldolgozási korlátot UGYANARRA a
// `nearbyStopLimit` értékre állította. Ez egy valós production esetben
// (lat=47.5015, lon=19.0197) bizonyítottan hibás: a sidecar nearest-first
// válasza ELSŐ 3 eleme mind felszíni (bus) megálló volt, egy valódi,
// releváns rapid-transit csomópont (több platformmal reprezentált stop-
// klaszter) pedig csak a 6. helyen szerepelt — a régi kód limit=3-mal
// kérte a sidecart, tehát az a candidate a sidecar válaszból SOHA nem is
// jutott ki, a helyi `nearbyStops.slice(0, nearbyStopLimit)` levágás már
// nem tudta "megmenteni". A javítás ÁLTALÁNOS (nem megálló/város-
// specifikus): a sidecar-DISCOVERY kérés limitje (DEFAULT esetben
// DEFAULT_NEARBY_DISCOVERY_LIMIT=MAX_NEARBY_STOP_LIMIT=10, tehát a
// sidecar saját, már létező felső korlátja) FÜGGETLEN a tényleges
// gyalogos/MOTIS-feldolgozási limittől (DEFAULT_NEARBY_STOP_LIMIT=6) —
// nagyobb pool kerül lekérve, de a TÉNYLEGES hálózati (walking+transit-
// plan) hívások száma szigorúan bounded marad, lásd resolveDiscoveryLimit()
// lent. Ha a hívó EXPLICIT nearbyStopLimit-et ad meg, a discovery limit
// VÁLTOZATLANUL azzal egyezik (visszafelé kompatibilis a korábbi,
// explicit-override viselkedéssel) — a decoupling KIZÁRÓLAG a DEFAULT
// (nincs explicit override) útra vonatkozik.
//
// NÉV-ALAPÚ DEDUP (spec-bővítés, ugyanaz a javítás): a sidecar nearest-
// first válasza a valós feedben UGYANAZT a fizikai helyet (pl. egy
// többplatformos csomópontot) TÖBBSZÖR is visszaadhatja külön stopId-vel
// (minden platform saját GTFS stop_id-je) — ha ezt dedup nélkül vinnénk
// tovább a feldolgozásba, a kis `nearbyStopLimit` "hely"-ek helyett
// redundáns PLATFORM-duplikátumokkal telne meg. A dedup KIZÁRÓLAG a
// (opcionális) `name` mezőre épül — üres/hiányzó name esetén a stopId
// marad az egyedi kulcs (nincs viselkedésváltozás olyan feedeknél, ahol a
// sidecar nem ad name-et) — NEM parent_station-alapú (azt a sidecar saját,
// már létező, változatlan dedupja kezeli/kezelheti), és NEM tartalmaz
// semmilyen konkrét, bekódolt megállónevet.
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

/**
 * Alapérték — LEGFELJEBB ennyi gyalogos MOTIS-hívás (és ennyi feldolgozott
 * access candidate) indul futásonként, ha a hívó nem ad meg mást.
 *
 * 3 -> 6 (2026-09-18, production regresszió javítás): egy valós
 * production esetben (lásd DISCOVERY VS. PROCESSING LIMIT a fájl
 * fejlécében) egy releváns rapid-transit csomópont a nearest-first
 * sorrendben csak a 6. helyen szerepelt, 5 db, hozzá közelebbi felszíni
 * megálló mögött. A régi (3) érték ezt a kis, de valós esetet
 * szisztematikusan kizárta volna a feldolgozásból MÉG akkor is, ha a
 * discovery limit már nagyobb (lásd DEFAULT_NEARBY_DISCOVERY_LIMIT). A 6
 * ÁLTALÁNOS, nem egy konkrét megállóhoz/városhoz kötött szám — egyszerűen
 * a legkisebb, dokumentált, valós bizonyítékkal alátámasztott érték, ami
 * ezt a KONKRÉT, bizonyított esetet már helyesen kezeli, továbbra is
 * szigorúan kis/bounded (nem 10-20).
 */
export const DEFAULT_NEARBY_STOP_LIMIT = 6;

// A sidecar saját MAX_NEARBY_LIMIT-jével EGYEZŐ felső korlát (lásd
// vps-accessibility-sidecar/src/nearbyStops.ts) — ez a modul SOSEM kérhet
// (és SOSEM indíthat gyalogos hívást) többre, mint amit a sidecar
// egyáltalán kiszolgálna.
export const MAX_NEARBY_STOP_LIMIT = 10;

/**
 * A sidecar /nearby-stops kérés DEFAULT discovery limitje (amikor a hívó
 * NEM ad meg explicit nearbyStopLimit-et) — SZÁNDÉKOSAN nagyobb, mint a
 * tényleges feldolgozási limit (DEFAULT_NEARBY_STOP_LIMIT), lásd
 * DISCOVERY VS. PROCESSING LIMIT a fájl fejlécében. Egyezik a sidecar
 * saját, már létező, változatlan MAX_NEARBY_STOP_LIMIT/MAX_NEARBY_LIMIT
 * felső korlátjával — NEM egy új, önkényes szám.
 */
export const DEFAULT_NEARBY_DISCOVERY_LIMIT = MAX_NEARBY_STOP_LIMIT;

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
 * A sidecar /nearby-stops kérésben küldött discovery limit. Ha a hívó
 * EXPLICIT nearbyStopLimit-et adott meg, a discovery limit VÁLTOZATLANUL
 * azzal egyezik (visszafelé kompatibilis — ugyanaz az érték megy a
 * sidecarnak és szabja meg a feldolgozási korlátot is, mint korábban).
 * KIZÁRÓLAG a DEFAULT (nincs explicit override) esetben nagyobb a
 * discovery pool, mint a feldolgozási limit — lásd DISCOVERY VS.
 * PROCESSING LIMIT a fájl fejlécében.
 */
function resolveDiscoveryLimit(explicitNearbyStopLimit: number | undefined, processingLimit: number): number {
  if (explicitNearbyStopLimit !== undefined) return processingLimit;
  return DEFAULT_NEARBY_DISCOVERY_LIMIT;
}

/**
 * Név-alapú dedup a discovery-poolon, a walking/MOTIS-feldolgozás ELŐTT
 * (lásd NÉV-ALAPÚ DEDUP a fájl fejlécében). A bemenet MÁR nearest-first
 * sorrendű (a sidecar garantálja ezt), ezért egy adott (nem üres) `name`
 * ELSŐ előfordulása mindig a legközelebbi — a dedup ezért egyszerű
 * "első nyer" logikával helyes, nincs szükség külön min-keresésre. Üres/
 * hiányzó `name` esetén a stopId marad az egyedi kulcs (SOSEM összevonva
 * más stoppal) — ez SOHA nem dob el egy candidate-et, csak a redundáns
 * ÖSSZEVONÁST végzi el, a sorrend (nearest-first) megmarad.
 */
function dedupeByName(stops: readonly NearbyStopCandidate[]): NearbyStopCandidate[] {
  const seenKeys = new Set<string>();
  const result: NearbyStopCandidate[] = [];
  for (const stop of stops) {
    const key = stop.name && stop.name.trim().length > 0 ? `name:${stop.name.trim()}` : `stopId:${stop.stopId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    result.push(stop);
  }
  return result;
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
  const discoveryLimit = resolveDiscoveryLimit(input.nearbyStopLimit, nearbyStopLimit);

  // PONTOSAN 1 nearby-stops lookup futásonként (spec 5. pont) — a
  // discoveryLimit lehet nagyobb, mint nearbyStopLimit (lásd DISCOVERY VS.
  // PROCESSING LIMIT a fájl fejlécében), de MÉG EZ IS szigorúan a sidecar
  // saját MAX_NEARBY_STOP_LIMIT/MAX_NEARBY_LIMIT felső korlátján belül van.
  const nearbyStops = await lookupNearbyStops(
    input.provider,
    input.originLat,
    input.originLon,
    input.radiusMeters,
    discoveryLimit
  );

  if (!nearbyStops || nearbyStops.length === 0) {
    // Külön, korábbi ág: a nearby-lookup teljes hibája/üres eredménye —
    // a gyalogos hívások meg sem kezdődnek.
    return { ok: true, candidates: [] };
  }

  // Név-alapú dedup a NAGYOBB discovery poolon (lásd NÉV-ALAPÚ DEDUP a fájl
  // fejlécében), MIELŐTT a tényleges (kis, bounded) feldolgozási limitre
  // vágnánk — ez biztosítja, hogy ugyanannak a fizikai helynek redundáns
  // platform-duplikátumai ne foglalják el a kis feldolgozási kvóta helyét.
  const dedupedStops = dedupeByName(nearbyStops);

  // Fail-safe levágás: MÉG AKKOR IS legfeljebb `nearbyStopLimit` hosszúra
  // vágjuk a (deduped) listát, ha a sidecar (hibásan/váratlanul) többet
  // adna vissza — ez a modul SOSEM indít ennél több gyalogos hívást.
  const boundedStops = dedupedStops.slice(0, nearbyStopLimit);

  const origin = { lat: input.originLat, lon: input.originLon };
  const settled = await Promise.all(boundedStops.map((stop) => evaluateWalkingAccess(origin, stop)));

  const candidates = settled.filter((c): c is ReachableStopCandidate => c !== null);
  candidates.sort(compareCandidates);

  return { ok: true, candidates };
}
