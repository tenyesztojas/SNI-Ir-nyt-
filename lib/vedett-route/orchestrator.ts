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
import { vedettRouteLog } from "./logger.ts";
import { getTransitProvider } from "./providers/registry.ts";
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
function computeDelayMinutes(leg: MotisLeg): number | undefined {
  if (!leg.realTime) return undefined;
  const scheduled = leg.to?.scheduledArrival ?? leg.from?.scheduledDeparture;
  const actual = leg.endTime ?? leg.startTime;
  if (!scheduled || !actual) return undefined;
  const scheduledMs = new Date(scheduled).getTime();
  const actualMs = new Date(actual).getTime();
  if (Number.isNaN(scheduledMs) || Number.isNaN(actualMs)) return undefined;
  return Math.round((actualMs - scheduledMs) / 60000);
}

function mapLeg(leg: MotisLeg): JourneyLeg {
  const isWalk = leg.mode === "WALK";
  const durationMinutes = leg.duration !== undefined ? leg.duration / 60 : minutesBetween(leg.startTime, leg.endTime);
  return {
    mode: isWalk ? "WALK" : "TRANSIT",
    transitMode: isWalk ? undefined : leg.mode,
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
  };
}

export function mapMotisItineraryToJourney(
  itinerary: MotisItinerary,
  displayNames?: { from: string; to: string }
): Journey {
  const legs = (itinerary.legs ?? []).map(mapLeg);

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

export interface OrchestratorErrorResult {
  ok: false;
  reason: "routing_engine_unavailable" | "no_route_found" | "invalid_request" | "routing_error" | "timeout";
  message: string;
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
  const [defaultResult, calmerResult, serviceAlerts] = await Promise.all([
    fetchMotisPlan({ fromPlace, toPlace, time: request.departAt, numItineraries: 6 }),
    fetchMotisPlan({ fromPlace, toPlace, time: request.departAt, numItineraries: 4, transitModes: ["BUS", "TRAM", "RAIL", "COACH"] }),
    fetchServiceAlertsSafely(),
  ]);

  if (!defaultResult.ok && !calmerResult.ok) {
    return { ok: false, reason: defaultResult.reason, message: defaultResult.message };
  }

  const rawItineraries: MotisItinerary[] = [
    ...(defaultResult.ok ? defaultResult.data.itineraries ?? [] : []),
    ...(defaultResult.ok ? defaultResult.data.direct ?? [] : []),
    ...(calmerResult.ok ? calmerResult.data.itineraries ?? [] : []),
  ];

  if (rawItineraries.length === 0) {
    vedettRouteLog("routing_error", "info", { reason: "no_itineraries_returned" });
    return { ok: false, reason: "no_route_found", message: "Nem található útvonal a megadott helyek és időpont között." };
  }

  // A geokódolt hely (Nominatim) "name" mezője a TELJES cím (pl. "Széll
  // Kálmán tér, Margit-negyed, Országút, II. kerület, Budapest, ..."), a
  // MOTIS viszont a valódi megálló RÖVID nevét adja (pl. "Széll Kálmán
  // tér"). Ha a teljes hosszú címet írnánk az első láb kiindulópontjára, az
  // vizuálisan megtévesztő: úgy tűnik, mintha "X → X" séta lenne, holott
  // valójában egy valós, néhány száz méteres séta a megadott koordinátától
  // a legközelebbi megállóig — csak épp mindkettő ugyanazt a köznyelvi
  // helynevet viseli. A rövidítés a geokódolt cím ELSŐ (legspecifikusabb)
  // tagját használja — ez nem kitalált adat, hanem a Nominatim válaszának
  // első vesszővel elválasztott szegmense.
  const shortPlaceName = (fullName: string): string => fullName.split(",")[0]?.trim() || fullName;
  const displayNames = {
    from: shortPlaceName(request.from.name),
    to: shortPlaceName(request.to.name),
  };
  const journeys = rawItineraries.map((it) => mapMotisItineraryToJourney(it, displayNames));
  const deduped = deduplicateJourneys(journeys);

  const withSensory = deduped.map((journey) => ({ ...journey, sensory: computeSensoryScore(journey, weights) }));
  const ranked = rankJourneys(withSensory);

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
