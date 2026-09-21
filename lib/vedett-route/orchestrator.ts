// Védett Route Orchestrator — Sprint 2, 13-14. pont.
//
// Több, valós, dokumentált MOTIS API paraméterekkel futtatott lekérdezési
// STRATÉGIÁT indít (nem egyet), hogy változatos, valódi alternatívákat
// kapjunk (pl. metró nélküli útvonal), majd:
//  1) a nyers MOTIS itinerary-ket Journey[]-vé alakítja (Route Normalizer),
//  2) fingerprint alapján dedupolja az átfedő találatokat,
//  3) Sensory Engine V1-gyel pontszámot ad mindegyiknek,
//  4) rangsorolja őket (CALMEST / FASTEST / FEWEST_TRANSFERS),
//  5) determinisztikus (nem LLM-alapú) magyarázatot generál mindegyikhez.
//
// Csak hivatalos, ellenőrzött MOTIS /api/v6/plan paramétereket használ —
// lásd motisTypes.ts és a hivatalos openapi.yaml.

import { fetchMotisPlan } from "./motisClient.ts";
import { computeSensoryScore } from "./sensoryEngine.ts";
import { deduplicateJourneys, computeJourneyFingerprint } from "./fingerprint.ts";
import { rankJourneys } from "./ranking.ts";
import { normalizePersonalizationWeights } from "./personalization.ts";
import { vedettRouteLog, vedettRouteNearbyDebugLog } from "./logger.ts";
import { getTransitProvider } from "./providers/registry.ts";
import { lookupAccessibilityIndexForItineraries } from "./accessibilityLookupClient.ts";
import {
  classifyItineraryStepFreeAccessibility,
  isEligibleForStepFreeResults,
  type AccessibilityIndexLike,
  type StepFreeLegLike,
} from "./accessibility.ts";
import { encodePolyline } from "./geometry.ts";
// NEARBY TRANSIT ACCESS SPRINT (2026-09-18) — a MÁR MEGLÉVŐ, önállóan
// tesztelt stop-based candidate builder ÚJRAHASZNÁLÁSA (lásd
// nearbyTransitJourneyCandidates.ts fejléce). Ez az EGYETLEN integrációs
// pont ebben a sprintben — nincs második, párhuzamos nearby-transit
// rendszer, nincs új MOTIS kliens.
import { buildNearbyTransitJourneyCandidates } from "./nearbyTransitJourneyCandidates.ts";
import type { StopBasedTransitCandidate } from "./nearbyTransitJourneyCandidates.ts";
import type { MotisItinerary, MotisLeg } from "./motisTypes.ts";
import type {
  Journey,
  JourneyLeg,
  JourneySearchRequest,
  OrchestratedSearchResult,
  PersonalizationWeights,
  ServiceAlert,
} from "./types.ts";

function minutesBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms > 0 ? ms / 60000 : 0;
}

// BKK Realtime integráció: a MOTIS egyetlen /api/v6/plan válaszán belül,
// realtime feed betöltése esetén, a from/to place-eken egyszerre szerepel
// a menetrend szerinti (scheduledDeparture/scheduledArrival) ÉS a
// ténylegesen használt (startTime/endTime, realtime-korrigált, ha van
// eltérés) időpont. A MOTIS API-nak NINCS külön "realtime be/ki" kapcsolója
// — ezért a statikus vs. realtime összehasonlítás ebből a két mezőpárból,
// EGY válaszon belül számolható, nem két külön (be/kikapcsolt) lekérdezésből.
//
// delayMinutes csak akkor kerül kiszámításra, ha:
//  - a MOTIS jelezte, hogy ez a láb realtime-korrigált (leg.realTime === true), ÉS
//  - ténylegesen volt scheduled* ÉS tényleges (startTime/endTime) időpont is,
// különben undefined marad — SOHA nem becslés vagy 0 alapérték.
// Sprint 7.2 — exportálva, hogy a realtime-refresh extraction (lib/vedett-route/
// realtimeRefresh/extractUpdates.ts) UGYANEZT a bizonyított logikát használja
// a frissen lekért MOTIS legekre, ne duplikálja máshol.
export function computeDelayMinutes(leg: MotisLeg): number | undefined {
  if (!leg.realTime) return undefined;
  const scheduled = leg.to?.scheduledArrival ?? leg.from?.scheduledDeparture;
  const actual = leg.endTime ?? leg.startTime;
  if (!scheduled || !actual) return undefined;
  const scheduledMs = new Date(scheduled).getTime();
  const actualMs = new Date(actual).getTime();
  if (Number.isNaN(scheduledMs) || Number.isNaN(actualMs)) return undefined;
  return Math.round((actualMs - scheduledMs) / 60000);
}

// MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING (2026-09-13) —
// KORÁBBI KÖR KORREKCIÓJA: a Round 8 még azt a globális szabályt
// dokumentálta, hogy "minden RENTAL leg = mol-bubi". A felhasználó explicit
// javította ezt: RENTAL ≠ automatikusan MOL Bubi — egy jövőbeli fázisban
// más rental providerek is megjelenhetnek MOTIS RENTAL módban, és a domain
// normalizer NEM hardcode-olhatja ezt az invariánst globálisan. A "mol-bubi"
// címke MOSTANTÓL KIZÁRÓLAG akkor kerül egy RENTAL legre, ha az adott leg
// egy TÉNYLEGESEN Bubi-enabled (request.molBubiEnabled === true) keresésből
// származik — lásd mapLeg() "molBubiRequestActive" paramétere és
// searchVedettRoutes() hívása lent. Ez a Phase 1 kérés-builder (lásd
// BUBI_MOTIS_PARAMS lent) MINDIG a "mol-bubi" GBFS providert küldi a
// MOTIS-nak, SOHA mást — tehát Bubi-enabled kontextusban egy RENTAL leg
// providere BIZTOSAN ez, DE ez a kontextusfüggés, NEM egy globális
// "RENTAL === mol-bubi" szabály.
export const BUBI_RENTAL_PROVIDER = "mol-bubi" as const;

function mapLeg(leg: MotisLeg, molBubiRequestActive: boolean): JourneyLeg {
  const isWalk = leg.mode === "WALK";
  const isRental = leg.mode === "RENTAL";
  const mode: JourneyLeg["mode"] = isWalk ? "WALK" : isRental ? "RENTAL" : "TRANSIT";
  const durationMinutes = leg.duration !== undefined ? leg.duration / 60 : minutesBetween(leg.startTime, leg.endTime);
  return {
    mode,
    transitMode: mode === "TRANSIT" ? leg.mode : undefined,
    // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING — lásd
    // BUBI_RENTAL_PROVIDER fenti kommentje: rentalProvider KIZÁRÓLAG akkor
    // "mol-bubi", ha EZ a leg egy Bubi-enabled kérésből származik (context),
    // SOHA nem "bármely RENTAL leg automatikusan mol-bubi". Egy nem-Bubi
    // kontextusból jövő (Phase 1-ben elméleti, jelenleg elő sem forduló)
    // RENTAL leg esetén ez a mező undefined marad — a UI ekkor NEM írja ki
    // a "MOL Bubi" feliratot. rentalPropulsionType KIZÁRÓLAG akkor kerül
    // kitöltésre, ha a nyers MOTIS leg ténylegesen tartalmazta a
    // (jelenleg spekulatív, lásd motisTypes.ts) mezőt — soha nem becslés.
    rentalProvider: isRental && molBubiRequestActive ? BUBI_RENTAL_PROVIDER : undefined,
    rentalPropulsionType: isRental
      ? leg.rentalVehiclePropulsionType === "HUMAN" || leg.rentalVehiclePropulsionType === "ELECTRIC_ASSIST"
        ? leg.rentalVehiclePropulsionType
        : undefined
      : undefined,
    routeShortName: leg.routeShortName,
    routeLongName: leg.routeLongName,
    fromName: leg.from?.name ?? "Ismeretlen hely",
    toName: leg.to?.name ?? "Ismeretlen hely",
    departureTime: leg.startTime,
    arrivalTime: leg.endTime,
    scheduledDepartureTime: leg.from?.scheduledDeparture,
    scheduledArrivalTime: leg.to?.scheduledArrival,
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    distanceMeters: leg.distance !== undefined ? Math.round(leg.distance) : undefined,
    realtime: Boolean(leg.realTime),
    delayMinutes: computeDelayMinutes(leg),
    cancelled: leg.cancelled === true ? true : undefined,
    fromLat: leg.from?.lat,
    fromLon: leg.from?.lon,
    toLat: leg.to?.lat,
    toLon: leg.to?.lon,
    geometryEncoded: leg.legGeometry?.points,
    geometryPrecision: leg.legGeometry?.precision,
    intermediateStops: leg.intermediateStops?.map((s) => ({ name: s.name ?? "Megálló", lat: s.lat, lon: s.lon })),
    routeColor: leg.routeColor,
    // TRANSIT NAVIGATION HOTFIX (2026-09-21, spec 3. pont) — a raw MOTIS
    // leg.headsign mező VÁLTOZATLANUL továbbadva (lásd types.ts JourneyLeg
    // kommentje) — nincs normalizálás/kitalálás.
    headsign: leg.headsign,
    // Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — a raw MOTIS leg stabil
    // identitás-mezői, MINIMÁLISAN megőrizve (lásd types.ts JourneyLeg
    // kommentje). Csak akkor kerülnek kitöltésre, ha a MOTIS válasz
    // ténylegesen tartalmazta — soha nem generált/becsült érték.
    tripId: leg.tripId,
    routeId: leg.routeId,
    fromStopId: leg.from?.stopId,
    toStopId: leg.to?.stopId,
  };
}

export function mapMotisItineraryToJourney(
  itinerary: MotisItinerary,
  displayNames?: { from: string; to: string },
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING (2026-09-13)
  // — lásd mapLeg() fenti kommentje: ez a "context" mondja meg, hogy EZ a
  // konkrét itinerary egy Bubi-enabled kérésből származik-e, tehát egy
  // esetleges RENTAL leg kaphat-e "mol-bubi" címkét. Alapértéke false —
  // meglévő hívók (pl. a régi orchestrator.test.ts fixture-ök), amik nem
  // adják át, byte-ra a korábbi viselkedést kapják.
  molBubiRequestActive: boolean = false
): Journey {
  const legs = (itinerary.legs ?? []).map((leg) => mapLeg(leg, molBubiRequestActive));

  // A MOTIS a nyers koordinátaként megadott indulási/érkezési pontokat
  // gyakran "START"/"END" (vagy hasonló, nem felhasználóbarát) néven adja
  // vissza, mivel azok nem névvel rendelkező megállók. A ténylegesen
  // beírt/geokódolt hely nevét használjuk helyette az első és utolsó lábon
  // — ez a felhasználó saját keresési kifejezéséből (geokódolt címéből)
  // származik, nem kitalált adat.
  if (displayNames && legs.length > 0) {
    legs[0] = { ...legs[0], fromName: displayNames.from };
    legs[legs.length - 1] = { ...legs[legs.length - 1], toName: displayNames.to };
  }
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13, safety
  // invariant "E" audit) — ez a szűrő SZÁNDÉKOSAN kizárólag "WALK" módra
  // szűr, tehát egy RENTAL (MOL Bubi) láb SOHA nem számít bele a gyaloglási
  // időbe/távolságba (helyesen, hiszen az biciklizés, nem gyaloglás) — de
  // NEM is vész el: a teljes totalDurationMinutes (lásd lent, az
  // itinerary.duration-ból) MINDEN lábat (WALK+TRANSIT+RENTAL) tartalmaz,
  // csak a Sensory Engine "walking" faktorába nem kerül bele. Ez a
  // meglévő, TRANSIT-legekre vonatkozó viselkedéssel analóg — a TRANSIT
  // lábak sem "gyaloglás", de a teljes időbe beleszámítanak.
  const walkingMinutes = legs.filter((l) => l.mode === "WALK").reduce((sum, l) => sum + l.durationMinutes, 0);
  const totalDurationMinutes = Math.round((itinerary.duration / 60) * 10) / 10;
  const legsDurationSum = legs.reduce((sum, l) => sum + l.durationMinutes, 0);
  const waitingMinutes = Math.max(0, Math.round((totalDurationMinutes - legsDurationSum) * 10) / 10);

  const walkLegs = legs.filter((l) => l.mode === "WALK");
  const allWalkLegsHaveDistance = walkLegs.length > 0 && walkLegs.every((l) => l.distanceMeters !== undefined);
  const walkingDistanceMeters = allWalkLegsHaveDistance
    ? walkLegs.reduce((sum, l) => sum + (l.distanceMeters ?? 0), 0)
    : undefined;

  const journey: Journey = {
    totalDurationMinutes,
    departureTime: itinerary.startTime,
    arrivalTime: itinerary.endTime,
    // VPS → Staging Integration Gate: csak akkor kerül be, ha a MOTIS
    // válasz ténylegesen tartalmazta — soha nem másoljuk át startTime/
    // endTime-ot, ha a mező hiányzik (lásd motisTypes.ts MotisItinerary).
    scheduledDepartureTime: itinerary.scheduledStartTime,
    scheduledArrivalTime: itinerary.scheduledEndTime,
    realTime: itinerary.realTime,
    cancelled: itinerary.cancelled === true ? true : undefined,
    walkingMinutes: Math.round(walkingMinutes * 10) / 10,
    waitingMinutes,
    transfers: itinerary.transfers,
    legs,
    alerts: [], // Sprint 2: az élő riasztás<->itinerary összepárosítás még nincs bekötve (lásd GO_LIVE riport, ismert korlát)
    realtimeAvailable: legs.some((l) => l.realtime),
    walkingDistanceMeters,
  };
  journey.fingerprint = computeJourneyFingerprint(journey);
  return journey;
}

// NEARBY TRANSIT ACCESS SPRINT (2026-09-18) — GENERIKUS "WALK ACCESS a
// közeli megállóhoz" Journey-normalizáló. NEM Déli/M2/Budapest-specifikus:
// KIZÁRÓLAG a MÁR MEGLÉVŐ ReachableStopCandidate (nearbyTransitAccess.ts,
// valós MOTIS POST /api/route gyaloglás) és a MÁR MEGLÉVŐ StopBasedTransitCandidate
// (nearbyTransitJourneyCandidates.ts, valós MOTIS /api/v6/plan a megállótól
// a célig) mezőit használja.
//
// KOHERENCIA (spec 6. pont): a végső Journey ELSŐ lába a VALÓS
// CURRENT POSITION -> STOP gyaloglás (valós geometria/idő/távolság, SOSEM
// teleportálva a megállóhoz) — a MOTIS transit-tervezés maga a megállótól
// indult, de a felhasználó felé megjelenő Journey a TELJES, koherens
// utat mutatja: WALK ACCESS + TRANSIT LEGS (+ LAST MILE, ha az itinerary
// saját maga is tartalmaz záró gyalogos lábat).
function buildNearbyAccessWalkLeg(
  access: StopBasedTransitCandidate["access"],
  origin: { lat: number; lon: number },
  originName: string
): JourneyLeg {
  const walkingMinutes = Math.round((access.walkingDurationSeconds / 60) * 10) / 10;
  return {
    mode: "WALK",
    fromName: originName,
    toName: access.stopName ?? "Megálló",
    durationMinutes: walkingMinutes,
    distanceMeters: Math.round(access.walkingDistanceMeters),
    realtime: false,
    fromLat: origin.lat,
    fromLon: origin.lon,
    toLat: access.stopLat,
    toLon: access.stopLon,
    // A geometria a MOTIS POST /api/route VALÓS válaszából származik (lásd
    // motisStreetRoute.ts flattenStreetRouteGeometry()) — encodePolyline()
    // a MEGLÉVŐ decodePolyline() pontos inverze, NEM új geometria-forrás.
    geometryEncoded: encodePolyline(access.walkingGeometry),
    geometryPrecision: 6,
  };
}

/**
 * Egy StopBasedTransitCandidate -> Journey[] (egy elem/nyers itinerary,
 * ugyanaz a "nem feltételezzük, hogy 1 candidate = 1 Journey" elv, mint a
 * normál rawItineraries.map(mapMotisItineraryToJourney) ágban). A WALK
 * access leg mindig a lista ELSŐ lába — a transit itinerary saját legjei
 * (a MEGLÉVŐ mapMotisItineraryToJourney()-vel normalizálva) követik.
 *
 * `originalDepartAt`-ot használjuk a Journey megjelenített indulási
 * idejéhez (amikor a user TÉNYLEGESEN elindul a jelenlegi helyéről) —
 * SOSEM az itinerary saját startTime-ját, ami a MEGÁLLÓTÓL indul (lásd
 * computeTransitDepartureTime() a nearbyTransitJourneyCandidates.ts-ben:
 * transitDepartureTime = originalDepartAt + walkingDurationSeconds, tehát
 * originalDepartAt = transitDepartureTime - walkingDurationSeconds, de itt
 * egyszerűbb/pontosabb egyenesen a hívótól kapott eredeti értéket használni).
 */
function mapNearbyTransitCandidateToJourneys(
  candidate: StopBasedTransitCandidate,
  origin: { lat: number; lon: number },
  originName: string,
  destinationName: string,
  originalDepartAt: string,
  molBubiRequestActive: boolean
): Journey[] {
  const walkLeg = buildNearbyAccessWalkLeg(candidate.access, origin, originName);

  return candidate.itineraries.map((itinerary) => {
    // A stop-based itinerary a MEGÁLLÓTÓL indul — a displayNames.from ITT a
    // megálló neve (a MOTIS saját stop-neve marad az első transit-lábon,
    // hacsak a hívó explicit másképp nem geokódolta), a displayNames.to
    // VÁLTOZATLANUL a felhasználó eredeti célja.
    const transitJourney = mapMotisItineraryToJourney(itinerary, { from: candidate.access.stopName ?? "Megálló", to: destinationName }, molBubiRequestActive);
    const legs: JourneyLeg[] = [walkLeg, ...transitJourney.legs];
    const walkingMinutes = Math.round((transitJourney.walkingMinutes + walkLeg.durationMinutes) * 10) / 10;
    const totalDurationMinutes = Math.round((transitJourney.totalDurationMinutes + walkLeg.durationMinutes) * 10) / 10;
    const walkingDistanceMeters =
      transitJourney.walkingDistanceMeters !== undefined && walkLeg.distanceMeters !== undefined
        ? transitJourney.walkingDistanceMeters + walkLeg.distanceMeters
        : undefined;

    const journey: Journey = {
      ...transitJourney,
      departureTime: originalDepartAt,
      totalDurationMinutes,
      walkingMinutes,
      walkingDistanceMeters,
      legs,
    };
    journey.fingerprint = computeJourneyFingerprint(journey);
    return journey;
  });
}

// NEARBY TRANSIT ACCESS SPRINT (2026-09-18) — a teljes nearby-expansion
// KIZÁRÓLAG enhancement (spec 12. pont): SOHA nem dob kivételt, SOHA nem
// hiúsíthatja meg a normál keresést. A buildNearbyTransitJourneyCandidates()
// maga is fail-safe (lásd ott), de ez a try/catch egy MÁSODIK, defenzív
// réteg (pl. váratlan programozási hiba a mapper-ben) — a hívó
// (searchVedettRoutes) ezt a Promise.all() RÉSZEKÉNT futtatja a két normál
// MOTIS hívással PÁRHUZAMOSAN, tehát egyetlen extra hálózati kör-idő sem
// adódik hozzá a válaszidőhöz.
async function fetchNearbyTransitAccessJourneys(
  request: JourneySearchRequest,
  displayNames: { from: string; to: string }
): Promise<Journey[]> {
  try {
    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: request.from.lat,
      originLon: request.from.lon,
      destination: { lat: request.to.lat, lon: request.to.lon },
      originalDepartAt: request.departAt,
      // KÉRÉS-KÖLTSÉGVETÉS (spec 11. pont): a MEGLÉVŐ, bounded alapértékek
      // (nearbyTransitAccess.ts DEFAULT_NEARBY_STOP_LIMIT=3) megtartva —
      // nincs itt felülírt, nagyobb limit. numItineraries kis, explicit
      // felső korlát, hogy egy nearby-stop transit-terve se legyen
      // szükségtelenül nagy MOTIS válasz.
      numItineraries: 3,
    });
    const molBubiRequestActive = Boolean(request.molBubiEnabled);
    const origin = { lat: request.from.lat, lon: request.from.lon };
    const journeys = result.candidates.flatMap((candidate) =>
      mapNearbyTransitCandidateToJourneys(candidate, origin, displayNames.from, displayNames.to, request.departAt, molBubiRequestActive)
    );
    // IDEIGLENES DIAGNOSZTIKA (lásd logger.ts vedettRouteNearbyDebugLog) —
    // "ranking input yes/no": ez a lista PONTOSAN az, amit searchVedettRoutes()
    // a `journeysWithNearby` tömbön keresztül továbbad a dedup/sensory/ranking
    // pipeline-nak.
    for (const journey of journeys) {
      const transitLeg = journey.legs.find((leg) => leg.mode === "TRANSIT");
      vedettRouteNearbyDebugLog("ranking_input", {
        fromStopId: transitLeg?.fromStopId,
        routeShortName: transitLeg?.routeShortName,
        totalDurationMinutes: journey.totalDurationMinutes,
        transfers: journey.transfers,
        walkingMinutes: journey.walkingMinutes,
      });
    }
    return journeys;
  } catch {
    vedettRouteLog("routing_error", "info", { reason: "nearby_transit_access_expansion_failed" });
    return [];
  }
}

export interface OrchestratorErrorResult {
  ok: false;
  reason:
    | "routing_engine_unavailable"
    | "no_route_found"
    | "invalid_request"
    | "routing_error"
    | "timeout"
    // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2, spec 16. pont)
    // — KÜLÖN, a generikus "no_route_found"-tól megkülönböztetett ok:
    // a MOTIS WHEELCHAIR-módú lekérdezés adott vissza itinerary(ka)t, DE
    // az alkalmazásoldali kőkemény szűrő (lásd lent) MINDET kizárta, mert
    // egyik sem volt bizonyítottan nem-KNOWN_NOT_ACCESSIBLE. Ez tudatosan
    // KÜLÖNBÖZIK attól az esettől, amikor a MOTIS eleve 0 itineraryt adott
    // (az a normál "no_route_found" ág marad, lásd lent).
    | "no_step_free_route_found";
  message: string;
}

// MOTIS LAST-MILE OFFSET FALLBACK (2026-09-11, "VÉDETT ÚTVONAL – MOTIS
// LAST-MILE OFFSET FALLBACK HOTFIX") — a felhasználó saját, éles VPS MOTIS
// (v2.11.2) ellen futtatott diagnosztikája bizonyította, hogy ugyanarra a
// koordinátapárra: alapértelmezett kérés/radius=250/radius=1000 mind 0
// itineraryt ad, radius=1500 viszont 6-ot (radius=2000 pedig még többet,
// de EBBEN a körben SZÁNDÉKOSAN nem használjuk — lásd lent, nincs 2000 m-es
// automatikus eszkaláció). A geokódolás, a MAP_PICKED koordináta-lánc és a
// lat/lon sorrend egy KORÁBBI, külön auditban (lásd git history) már
// bizonyítottan hibátlan — ez a hiba a MOTIS last-mile (gyalogos
// megálló-hozzáférési) keresési sugarában van.
//
// EZ A KONSTANS a MOTIS utolsó-méteres (last-mile) gyalogos hozzáférési
// keresési sugara (méterben) az EGYETLEN engedélyezett fallback-kísérlethez.
// Szándékosan NINCS ennél nagyobb (pl. 2000 m) automatikus eszkalációs
// lépcső ebben a körben.
export const LAST_MILE_FALLBACK_RADIUS_METERS = 1500;

// AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2, spec 6/7/11. pont)
// — a fenti last-mile fallback és a stepFreeRequired preferencia VISZONYA.
//
// Task C idején (lásd git history) ez a szakasz még azt dokumentálta, hogy
// SEMMILYEN pedestrianProfile/wheelchair paraméter nincs bizonyítva — AZÓTA
// (Task C2) a felhasználó saját, éles VPS MOTIS v2.11.2 ellen futtatott
// runtime tesztje BIZONYÍTOTTA, hogy a pinned instance elfogadja és
// ténylegesen eltérően viselkedik a `pedestrianProfile=WHEELCHAIR`,
// `useRoutedTransfers=true`, `timetableView=false` paraméter-hármas
// mellett (lásd motisTypes.ts MotisPlanParams és a feature riport "MOTIS
// v2.11.2 runtime" szakasza). Ezért MOSTANTÓL:
//
//   - request.stepFreeRequired === true esetén MINDHÁROM MOTIS kérés
//     (a két normál "alap"/"metrómentes" stratégia ÉS az EGYETLEN
//     lehetséges last-mile fallback hívás) MEGKAPJA ugyanezt a
//     paraméter-hármast — lásd STEP_FREE_MOTIS_PARAMS lent.
//   - request.stepFreeRequired === false/hiányzó esetén EGYIK kérés SEM
//     kapja meg — a normál keresés MOTIS felé küldött kérése BYTE-RA
//     változatlan marad (spec 3. pont).
//   - A last-mile fallback SOHA nem eshet vissza "csendben" FOOT profilra
//     pusztán azért, mert fallback történik — a STEP_FREE_MOTIS_PARAMS
//     szétterítése MINDHÁROM hívásra ugyanabból az egyetlen forrásból
//     (request.stepFreeRequired) történik, tehát a fallback mindig
//     ugyanazt a profilt kapja, mint a két normál kérés.
//
// A tényleges akadálymentesség-bizonyítás (a MOTIS wheelchairAccessible
// mezője NEM megbízható önmagában, lásd motisTypes.ts MotisWheelchairAccessible
// kommentje) TOVÁBBRA IS az EREDMÉNY GTFS-keresztellenőrzéssel kombinált,
// alkalmazásoldali hard filterén keresztül történik (lásd lent
// searchVedettRoutes() és accessibility.ts classifyItineraryStepFreeAccessibility()) —
// a MOTIS saját WHEELCHAIR profilja csak EGY bemenet, sosem az egyetlen
// bizonyíték.
const STEP_FREE_MOTIS_PARAMS = {
  pedestrianProfile: "WHEELCHAIR" as const,
  useRoutedTransfers: true,
  timetableView: false,
};

// MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — UGYANAZ a
// "kizárólag feltételes spread" mintázat, mint a fenti STEP_FREE_MOTIS_PARAMS.
// KIZÁRÓLAG akkor kerül a MOTIS kérésbe, amikor request.molBubiEnabled ===
// true (lásd searchVedettRoutes() lent) — false/hiányzó esetén EGYIK
// preTransit* paraméter SEM jelenik meg, a kérés BYTE-RA változatlan marad.
//
// Phase 1 KIZÁRÓLAG a "pre-transit" (indulási oldali, WALK→RENTAL→WALK→
// transit) utat engedélyezi — ez az, amit a felhasználó saját VPS staging
// diagnosztikája ténylegesen bizonyított (health check rt=true/gbfs=true,
// station inventory, direct+intermodal RENTAL routing). A directModes=RENTAL
// (tisztán bicikli-útvonal) és postTransitModes=RENTAL (célállomás oldali
// rental) SZÁNDÉKOSAN NINCS bekötve ebben a körben — egy későbbi fázis
// feladata, ha a felhasználó ezt is kéri.
//
// A "provider" mező MINDIG KIZÁRÓLAG "mol-bubi" — ez a Phase 1 legfontosabb
// biztonsági invariánsa (safety invariant "C": "ON módban a provider MINDIG
// kizárólag mol-bubi, SOHA más rental provider nem szivároghat be"), ezért
// ez egy hardcode-olt konstans tömb, SOHA nem a felhasználói bemenetből
// összeállított érték.
//
// A propulsion-szűrő "ANY" esetén SZÁNDÉKOSAN HIÁNYZIK (nincs
// preTransitRentalPropulsionTypes paraméter egyáltalán) — ez a
// konzervatívabb, kevésbé feltételező értelmezés a felhasználó saját
// specifikációjának két megengedett opciója közül ("ANY: ne küldj
// propulsion filtert VAGY a jelenlegi MOTIS-konvenciónak megfelelően
// mindkettőt") — egy hiányzó szűrő biztosan sosem zár ki jogosan
// visszaadható járművet egy esetlegesen eltérő MOTIS-konvenció miatt.
export function buildBubiMotisParams(
  bikePropulsion: JourneySearchRequest["bikePropulsion"]
): Pick<
  Parameters<typeof fetchMotisPlan>[0],
  "preTransitModes" | "preTransitRentalProviders" | "preTransitRentalFormFactors" | "preTransitRentalPropulsionTypes"
> {
  const propulsionTypes: string[] | undefined =
    bikePropulsion === "HUMAN" ? ["HUMAN"] : bikePropulsion === "ELECTRIC_ASSIST" ? ["ELECTRIC_ASSIST"] : undefined;
  return {
    preTransitModes: ["RENTAL"],
    preTransitRentalProviders: [BUBI_RENTAL_PROVIDER],
    preTransitRentalFormFactors: ["BICYCLE"],
    ...(propulsionTypes ? { preTransitRentalPropulsionTypes: propulsionTypes } : {}),
  };
}

// AKADÁLYMENTES / LÉPCSŐMENTES MVP — PRODUCTION DATA PLANE (2026-09-11,
// Task C3): a fenti Task C2 megjegyzés (amely a getAccessibilityIndex("bkk")
// local-cache-alapú, productionben nem működő útját dokumentálta) MOSTANTÓL
// ELAVULT — az accessibility index forrása a VPS-en futó, a MOTIS által is
// használt UGYANAZON canonical BKK GTFS zipből épült sidecar (lásd
// accessibilityLookupClient.ts fejléce és vps-accessibility-sidecar/). Az
// alábbi searchVedettRoutes() a lookupot MOST a rawItineraries VÉGLEGESSÉ
// válása UTÁN (a last-mile fallback eldöntése után) indítja, mert a
// batch-elt lookuphoz a TÉNYLEGESEN visszakapott MOTIS legs-ekre van
// szükség — ezzel is elkerülve egy felesleges, elvetett hívást abban az
// (ritka) esetben, ha a last-mile fallback más itinerary-halmazt hoz.

// LAST-MILE OFFSET FALLBACK VÉGSŐ SZŰKÍTÉS (2026-09-11, "VÉGSŐ SZŰKÍTÉS"
// kör) — a valódi worktree audit alapján a puszta "0 itinerary" ÖNMAGÁBAN
// TÚL TÁG trigger volt: legitim, valós okokból is lehet 0 itinerary (nincs
// járat az adott időpontban, nincs menetrendi kapcsolat, stb.), és ezeket
// az eseteket NEM szabad automatikusan 1500 m-es last-mile keresésre
// váltani. A bizonyítottan helyes, szűkebb feltétel: a MOTIS válasz
// debugOutput mezőjében EXPLICIT, numerikus 0 szerepeljen a
// n_start_offsets VAGY n_dest_offsets mezőn — ez az egyetlen jel, ami
// ténylegesen az utolsó-méteres (gyalogos megálló-hozzáférési) candidate
// hiányára utal, nem pedig egy legitim "nincs útvonal" eredményre.
//
// FONTOS: undefined debugOutput (vagy undefined n_start_offsets/
// n_dest_offsets — pl. mert a route service proxy nem engedi át a mezőt,
// lásd motisTypes.ts MotisDebugOutput kommentje) NEM egyenlő 0-val — ilyen
// esetben a fallback NEM indulhat automatikusan. Kizárólag a szigorúan
// `=== 0` numerikus érték számít triggernek.
function hasExplicitZeroEndpointOffset(result: Awaited<ReturnType<typeof fetchMotisPlan>>): boolean {
  if (!result.ok) return false;
  const debugOutput = result.data.debugOutput;
  if (!debugOutput) return false;
  return debugOutput.n_start_offsets === 0 || debugOutput.n_dest_offsets === 0;
}

// A fallback CSAK akkor engedélyezett, ha MINDKÉT elsődleges (normál)
// stratégia kérése ("alap" és "metrómentes") strukturálisan SIKERESEN
// visszatért a MOTIS-tól (result.ok === true) — vagyis a routing motor
// ténylegesen elérhető volt, hitelesítve/időtúllépés nélkül válaszolt, és a
// válasz valid JSON volt. Ha BÁRMELYIK kérés timeout/auth hiba/hibás válasz/
// routing_engine_unavailable miatt bukott (ok === false), ez a függvény
// mindig false-t ad — így a fallback SOHA nem indulhat el ezeken az
// eseteken (lásd a hotfix specifikáció explicit tiltólistája).
//
// A második, EGYÜTTES feltétel: 0 együttes itinerary/direct találat ÉS
// legalább az egyik sikeres válasz debugOutput mezőjében explicit 0
// n_start_offsets/n_dest_offsets (lásd hasExplicitZeroEndpointOffset()
// fenti kommentje) — puszta 0 itinerary, debugOutput/endpoint-offset
// bizonyíték nélkül, NEM elég.
export function shouldAttemptLastMileFallback(
  defaultResult: Awaited<ReturnType<typeof fetchMotisPlan>>,
  calmerResult: Awaited<ReturnType<typeof fetchMotisPlan>>,
  combinedItineraryCount: number
): boolean {
  if (!defaultResult.ok || !calmerResult.ok) return false;
  if (combinedItineraryCount !== 0) return false;
  return hasExplicitZeroEndpointOffset(defaultResult) || hasExplicitZeroEndpointOffset(calmerResult);
}

export async function searchVedettRoutes(
  request: JourneySearchRequest,
  weightsInput?: Partial<PersonalizationWeights>
): Promise<OrchestratedSearchResult | OrchestratorErrorResult> {
  const weights = normalizePersonalizationWeights(weightsInput);
  const fromPlace = `${request.from.lat},${request.from.lon}`;
  const toPlace = `${request.to.lat},${request.to.lon}`;

  // Két valós, dokumentált paraméterekkel futtatott stratégia — nem egy
  // "próbáljuk kitalálni a legjobbat" hívás, hanem két, ténylegesen eltérő
  // MOTIS lekérdezés, hogy a metrómentes alternatíva is valódi legyen (nem
  // utólag kiszámolt becslés).
  // A BKK Alerts.pb realtime feed lekérése a routing hívásokkal PÁRHUZAMOSAN,
  // de attól teljesen függetlenül: egy realtime feed-hiba SOHA nem akaszthatja
  // meg vagy hiúsíthatja meg a statikus routingot (lásd 4. és 16. pont). Ezért
  // itt sosem dobunk hibát tovább — sikertelenség esetén üres tömb.
  const stepFreeMotisParams = request.stepFreeRequired ? STEP_FREE_MOTIS_PARAMS : undefined;
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — lásd
  // buildBubiMotisParams() fejléc-kommentje. request.molBubiEnabled
  // false/hiányzó esetén ez undefined, tehát a lenti 3 fetchMotisPlan()
  // hívás EGYIKE sem kap egyetlen preTransit* paramétert sem — a normál
  // (Bubi nélküli) kérés BYTE-RA változatlan marad.
  const bubiMotisParams = request.molBubiEnabled ? buildBubiMotisParams(request.bikePropulsion) : undefined;

  // A geokódolt hely (Nominatim) "name" mezője a TELJES cím (pl. "Széll
  // Kálmán tér, Margit-negyed, Országút, II. kerület, Budapest, ..."), a
  // MOTIS viszont a valódi megálló RÖVID nevét adja (pl. "Széll Kálmán
  // tér"). A rövidítés a geokódolt cím ELSŐ (legspecifikusabb) tagját
  // használja — ez nem kitalált adat, hanem a Nominatim válaszának első
  // vesszővel elválasztott szegmense. Előbbre hozva (a Promise.all elé),
  // hogy a nearby-transit expansion is ugyanezt a MEGLÉVŐ logikát
  // használja a WALK access leg megjelenített nevéhez.
  const shortPlaceName = (fullName: string): string => fullName.split(",")[0]?.trim() || fullName;
  const displayNames = {
    from: shortPlaceName(request.from.name),
    to: shortPlaceName(request.to.name),
  };

  const [defaultResult, calmerResult, serviceAlerts, nearbyJourneys] = await Promise.all([
    fetchMotisPlan({ fromPlace, toPlace, time: request.departAt, numItineraries: 6, ...stepFreeMotisParams, ...bubiMotisParams }),
    fetchMotisPlan({
      fromPlace,
      toPlace,
      time: request.departAt,
      numItineraries: 4,
      transitModes: ["BUS", "TRAM", "RAIL", "COACH"],
      ...stepFreeMotisParams,
      ...bubiMotisParams,
    }),
    fetchServiceAlertsSafely(),
    // NEARBY TRANSIT ACCESS SPRINT (2026-09-18) — a normál MOTIS hívásokkal
    // PÁRHUZAMOSAN, hogy ne adjon extra válaszidőt. A step-free (lépcsőmentes)
    // keresés EBBEN a sprintben SZÁNDÉKOSAN kimarad: az akadálymentesség-
    // klasszifikáció a NYERS MOTIS legs-eket igényli (StepFreeLegLike), amit
    // egy nearby WALK-access-szel bővített candidate nem tud megbízhatóan
    // adni — a normál step-free viselkedés emiatt BYTE-RA változatlan marad.
    request.stepFreeRequired ? Promise.resolve<Journey[]>([]) : fetchNearbyTransitAccessJourneys(request, displayNames),
  ]);

  if (!defaultResult.ok && !calmerResult.ok) {
    return { ok: false, reason: defaultResult.reason, message: defaultResult.message };
  }

  let rawItineraries: MotisItinerary[] = [
    ...(defaultResult.ok ? defaultResult.data.itineraries ?? [] : []),
    ...(defaultResult.ok ? defaultResult.data.direct ?? [] : []),
    ...(calmerResult.ok ? calmerResult.data.itineraries ?? [] : []),
  ];

  // MOTIS LAST-MILE OFFSET FALLBACK — lásd shouldAttemptLastMileFallback()
  // fejléc-kommentje a pontos, biztonságos trigger-feltételekért. Legfeljebb
  // EGY további MOTIS kérés indulhat itt (nincs retry-hurok, nincs 2000 m-es
  // eszkaláció) — a `radius` paraméter KIZÁRÓLAG ebben az egyetlen hívásban
  // jelenik meg, a fenti két normál kérésben soha.
  let expandedAccessSearch = false;
  if (shouldAttemptLastMileFallback(defaultResult, calmerResult, rawItineraries.length)) {
    // Csak diagnosztikai célra: melyik válaszból (alap vagy metrómentes)
    // származott az explicit 0 n_start_offsets/n_dest_offsets, ami a
    // fallbacket ténylegesen kiváltotta (lásd shouldAttemptLastMileFallback()
    // fenti kommentje a pontos feltételről).
    const defaultDebug = defaultResult.ok ? defaultResult.data.debugOutput : undefined;
    const calmerDebug = calmerResult.ok ? calmerResult.data.debugOutput : undefined;
    vedettRouteLog("routing_error", "info", {
      reason: "last_mile_fallback_triggered",
      nDestOffsetsDefault: defaultDebug?.n_dest_offsets,
      nStartOffsetsDefault: defaultDebug?.n_start_offsets,
      nDestOffsetsCalmer: calmerDebug?.n_dest_offsets,
      nStartOffsetsCalmer: calmerDebug?.n_start_offsets,
    });

    const fallbackResult = await fetchMotisPlan({
      fromPlace,
      toPlace,
      time: request.departAt,
      numItineraries: 6,
      radius: LAST_MILE_FALLBACK_RADIUS_METERS,
      // Lásd a fenti "STEP_FREE_MOTIS_PARAMS" fejléc-komment — a fallback
      // SOHA nem eshet vissza csendben FOOT profilra: pontosan ugyanazt a
      // stepFreeMotisParams-ot kapja, mint a két normál kérés fentebb.
      // Ugyanez az elv a Bubi paraméterekre is: a fallback SOHA nem eshet
      // vissza csendben "Bubi nélküli" keresésre, ha a felhasználó
      // molBubiEnabled=true-t kért (lásd buildBubiMotisParams() fenti
      // kommentje).
      ...stepFreeMotisParams,
      ...bubiMotisParams,
    });

    if (fallbackResult.ok) {
      const fallbackItineraries: MotisItinerary[] = [
        ...(fallbackResult.data.itineraries ?? []),
        ...(fallbackResult.data.direct ?? []),
      ];
      if (fallbackItineraries.length > 0) {
        rawItineraries = fallbackItineraries;
        expandedAccessSearch = true;
        vedettRouteLog("routing_error", "info", { reason: "last_mile_fallback_succeeded" });
      } else {
        vedettRouteLog("routing_error", "info", { reason: "last_mile_fallback_empty" });
      }
    } else {
      vedettRouteLog("routing_error", "info", { reason: "last_mile_fallback_failed" });
    }
  }

  if (rawItineraries.length === 0) {
    vedettRouteLog("routing_error", "info", { reason: "no_itineraries_returned" });
    return { ok: false, reason: "no_route_found", message: "Nem található útvonal a megadott helyek és időpont között." };
  }

  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1.1 HARDENING — a
  // molBubiRequestActive context EBBŐL a keresésből (request.molBubiEnabled)
  // származik, SOHA nem a visszakapott legekből találgatva.
  const molBubiRequestActive = Boolean(request.molBubiEnabled);
  const journeys = rawItineraries.map((it) => mapMotisItineraryToJourney(it, displayNames, molBubiRequestActive));

  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2) — a lentebbi
  // klasszifikáció a NYERS MOTIS legs-eket igényli (stopId/tripId/
  // wheelchairAccessible — lásd StepFreeLegLike), amit a mapMotisItineraryToJourney()
  // már NEM őriz meg a JourneyLeg-ekben. A fingerprint (ami a dedup UTÁN is
  // stabil marad, lásd fingerprint.ts) a kapocs a deduped Journey és az őt
  // létrehozó nyers MotisItinerary között — az ELSŐ előfordulást tároljuk,
  // ugyanazzal a "első nyer" szabállyal, mint amit deduplicateJourneys()
  // maga is követ, tehát a két lista MINDIG konzisztens marad egymással.
  const rawItineraryByFingerprint = new Map<string, MotisItinerary>();
  journeys.forEach((journey, idx) => {
    if (journey.fingerprint && !rawItineraryByFingerprint.has(journey.fingerprint)) {
      rawItineraryByFingerprint.set(journey.fingerprint, rawItineraries[idx]);
    }
  });

  // NEARBY TRANSIT ACCESS SPRINT (2026-09-18) — a nearby-generált Journey-k
  // a rawItineraries-alapú `journeys`-tömb UTÁN kerülnek hozzáadva, ÍGY a
  // fenti rawItineraryByFingerprint index-alapú párosítás (idx -> rawItineraries[idx])
  // NEM sérül. A dedup, a sensory scoring és a ranking innentől UGYANAZT a
  // MEGLÉVŐ pipeline-t futtatja mindkét forrásra — nincs mesterséges
  // előny/hátrány a nearby candidate-oknak (spec 7/8/9. pont).
  const journeysWithNearby = nearbyJourneys.length > 0 ? [...journeys, ...nearbyJourneys] : journeys;

  let deduped = deduplicateJourneys(journeysWithNearby);

  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C, spec 5/6/10.
  // pont) — EZ A BLOKK KIZÁRÓLAG akkor fut, ha a felhasználó explicit
  // kérte (request.stepFreeRequired === true). Ha false/hiányzó, a `deduped`
  // tömb módosítás nélkül halad tovább a Sensory Engine/ranking felé — a
  // normál keresés viselkedése BYTE-RA változatlan (spec 3. pont: "Ha
  // false: a jelenlegi routing működés SEMMILYEN módon ne változzon.").
  //
  // Az akadálymentességi minősítés/szűrés SZÁNDÉKOSAN a Sensory Engine
  // ELŐTT fut (spec 10. pont: "Accessibility filter/minősítés előbb
  // történjen, majd az elfogadható candidate-eket rangsorolhatja a
  // meglévő Sensory Engine.") — ez egy KÜLÖN dimenzió, SOHA nem kerül be a
  // SensoryScore számításába (a sensoryEngine.ts "vehicleAccessibility"
  // faktora ettől függetlenül, változatlanul mindig "unavailable" marad).
  if (request.stepFreeRequired) {
    // A NYERS MOTIS legs-eket egyszer alakítjuk StepFreeLegLike[]-lá,
    // dedupelt journey-nkánt — ugyanez a lista szolgál (1) a lenti EGYETLEN,
    // batch-elt VPS accessibility-sidecar lookup bemeneteként, ÉS (2) a
    // klasszifikáció bemeneteként, hogy a két lépés garantáltan ugyanazokat
    // a lábakat lássa (spec 14. pont: "egyetlen/néhány batch-elt kérés,
    // sosem N+1").
    const rawLegsByJourney: StepFreeLegLike[][] = deduped.map((journey) => {
      const rawItinerary = journey.fingerprint ? rawItineraryByFingerprint.get(journey.fingerprint) : undefined;
      return (rawItinerary?.legs ?? []).map((leg: MotisLeg) => ({
        mode: leg.mode,
        tripId: leg.tripId,
        wheelchairAccessible: leg.wheelchairAccessible,
        from: { stopId: leg.from?.stopId },
        to: { stopId: leg.to?.stopId },
      }));
    });

    // AKADÁLYMENTES / LÉPCSŐMENTES MVP — PRODUCTION DATA PLANE (Task C3):
    // a lookup ITT, a végleges (last-mile fallback utáni) rawItineraries
    // alapján, EGYETLEN batch-elt hívással történik — lásd
    // accessibilityLookupClient.ts fejléce a fail-safe szerződésért (SOHA
    // nem dob hibát, hiba/timeout/nincs-konfigurálva esetén egyaránt
    // `null`-t ad, amit a classifyItineraryStepFreeAccessibility() PONTOSAN
    // úgy kezel, mint a korábbi Task C2 "nincs feltöltött cache" esetet —
    // ld. AccessibilityIndexLike lent). AccessibilityIndexLike egy
    // minimális, strukturális alak (lásd accessibility.ts) — a sidecar
    // válaszából épített index strukturálisan kompatibilis vele, nincs
    // szükség külön adapter/mapping rétegre.
    const index: AccessibilityIndexLike | null = await lookupAccessibilityIndexForItineraries(rawLegsByJourney);
    let anyVehicleConflict = false;

    const withAccessibility = deduped.map((journey, idx) => {
      const rawLegs = rawLegsByJourney[idx];
      const classification = classifyItineraryStepFreeAccessibility(rawLegs, index);
      if (classification.hasVehicleConflict) anyVehicleConflict = true;
      return { ...journey, accessibilityStatus: classification.resultStatus };
    });

    // KNOWN_NOT_ACCESSIBLE SOHA nem ajánlható fel akadálymentes opcióként
    // (spec 5/6. pont) — kiesik a lépcsőmentes eredményhalmazból.
    // KNOWN_ACCESSIBLE és PARTIALLY_UNKNOWN (UNKNOWN elemet tartalmazó,
    // de nem BIZONYÍTOTTAN nem-elérhető) útvonal egyaránt megjelenhet —
    // a PARTIALLY_UNKNOWN külön figyelmeztetést kap a UI-ban (spec 6. pont
    // felhasználói nyelve, lásd types.ts Journey.accessibilityStatus).
    const eligible = withAccessibility.filter((journey) => isEligibleForStepFreeResults(journey.accessibilityStatus!));

    // hasVehicleConflict (MOTIS és GTFS trips.txt egymásnak ellentmondó
    // jelzése, spec 9. pont) KIZÁRÓLAG szerver-oldali diagnosztikai
    // logolásra — SOHA nem kerül a felhasználó felé, és SOHA nem
    // tartalmaz belső MOTIS/GTFS azonosítót (lásd vedettRouteLog()
    // redaktálását is).
    vedettRouteLog("routing_error", "info", {
      reason: "step_free_accessibility_filter_applied",
      candidateCount: withAccessibility.length,
      eligibleCount: eligible.length,
      excludedKnownNotAccessibleCount: withAccessibility.length - eligible.length,
      hadAccessibilityIndex: index !== null,
      hasAnyVehicleSignalConflict: anyVehicleConflict,
    });

    if (eligible.length === 0) {
      // Minden candidate KNOWN_NOT_ACCESSIBLE volt (a WHEELCHAIR-módú MOTIS
      // válasz ADOTT itineraryt/itineraryket, de a kőkemény alkalmazásoldali
      // szűrő mindegyiket kizárta, spec 16. pont) — ez KÜLÖNBÖZIK attól az
      // esettől, amikor a MOTIS eleve 0 itineraryt adott (az a fenti,
      // korábbi "no_route_found" ág, ami ERRE A PONTRA egyáltalán el sem
      // jut). Ezért egy ÚJ, distinkt reason-t adunk vissza a pontos, a
      // spec által előírt üzenettel.
      vedettRouteLog("routing_error", "info", { reason: "no_step_free_itineraries" });
      return {
        ok: false,
        reason: "no_step_free_route_found",
        message: "Nem találtunk olyan útvonalat, amely a rendelkezésre álló adatok alapján megfelel a lépcsőmentes feltételeknek.",
      };
    }

    deduped = eligible;
  }

  const withSensory = deduped.map((journey) => ({ ...journey, sensory: computeSensoryScore(journey, weights) }));
  const ranked = rankJourneys(withSensory);

  // IDEIGLENES DIAGNOSZTIKA (lásd logger.ts vedettRouteNearbyDebugLog) —
  // "ranking output yes/no" ÉS "API response-ban volt yes/no" (a `ranked`
  // PONTOSAN az, amit a végleges `journeys: ranked` API response mezőbe
  // teszünk lentebb) — a nearbyJourneys-ből (fentebb) származó
  // fromStopId-ket keressük vissza a ranked listában, azonosítva, hogy a
  // rangsorolás/label-szűrés MEGTARTOTTA-e a nearby-generált candidate-et.
  if (nearbyJourneys.length > 0) {
    const nearbyFromStopIds = new Set(
      nearbyJourneys.map((j) => j.legs.find((leg) => leg.mode === "TRANSIT")?.fromStopId).filter((id): id is string => Boolean(id))
    );
    for (const nearbyId of nearbyFromStopIds) {
      const inRanked = ranked.some((r) => r.journey.legs.find((leg) => leg.mode === "TRANSIT")?.fromStopId === nearbyId);
      vedettRouteNearbyDebugLog("ranking_output", {
        fromStopId: nearbyId,
        rankingOutput: inRanked,
        apiResponse: inRanked,
        labels: inRanked ? ranked.find((r) => r.journey.legs.find((leg) => leg.mode === "TRANSIT")?.fromStopId === nearbyId)?.labels : undefined,
      });
    }
  }

  const confidences = withSensory.map((j) => j.sensory?.confidence ?? 0);
  const sensoryConfidenceAvg =
    confidences.length > 0 ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100 : 0;

  const missingFactorsUnion = Array.from(new Set(withSensory.flatMap((j) => j.sensory?.missingFactors ?? [])));

  return {
    ok: true,
    journeys: ranked,
    dataCoverage: {
      provider: "BKK",
      sensoryConfidenceAvg,
      missingFactorsUnion,
      motisImportedAt: process.env.VEDETT_MOTIS_DATA_IMPORTED_AT ?? null,
    },
    serviceAlerts,
    // MOTIS LAST-MILE OFFSET FALLBACK — CSAK akkor true/jelen, ha a fenti
    // rawItineraries ténylegesen a radius=1500 fallback keresésből
    // származik (lásd feljebb) — normál találatnál mindkét mező hiányzik
    // (undefined), SOHA nem false/üres string.
    ...(expandedAccessSearch
      ? {
          expandedAccessSearch: true as const,
          accessWarning: "Ehhez az útvonalhoz hosszabb gyalogos megközelítésre lehet szükség.",
        }
      : {}),
  };
}

// Lásd OrchestratedSearchResult.serviceAlerts dokumentációja (types.ts): a BKK
// riasztásokat SOHA nem hagyjuk elakasztani a statikus routingot. Bármilyen
// hiba (hálózat, kulcs, protobuf) esetén üres tömböt adunk vissza, és a hibát
// csak logoljuk (kulcs nélkül, lásd logger.ts redaktálása).
async function fetchServiceAlertsSafely(): Promise<ServiceAlert[]> {
  try {
    const provider = getTransitProvider("BKK");
    if (!provider) return [];
    return await provider.getServiceAlerts();
  } catch (err) {
    vedettRouteLog("routing_error", "warn", {
      reason: "service_alerts_fetch_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
