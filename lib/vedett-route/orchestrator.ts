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
import type { MotisItinerary, MotisLeg } from "./motisTypes.ts";
import type { Journey, JourneyLeg, JourneySearchRequest, OrchestratedSearchResult, PersonalizationWeights } from "./types.ts";

function minutesBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms > 0 ? ms / 60000 : 0;
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
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    distanceMeters: leg.distance !== undefined ? Math.round(leg.distance) : undefined,
    realtime: Boolean(leg.realTime),
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
  const [defaultResult, calmerResult] = await Promise.all([
    fetchMotisPlan({ fromPlace, toPlace, time: request.departAt, numItineraries: 6 }),
    fetchMotisPlan({ fromPlace, toPlace, time: request.departAt, numItineraries: 4, transitModes: ["BUS", "TRAM", "RAIL", "COACH"] }),
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
  };
}
