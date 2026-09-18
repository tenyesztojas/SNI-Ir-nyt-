// VÉDETT ÚTVONAL — STOP-BASED TRANSIT CANDIDATE BUILDER
// (STOP-BASED TRANSIT CANDIDATE sprint, 2026-09-17)
//
// Ez a modul a candidate-builder sprint (nearbyTransitAccess.ts) FOLYTATÁSA:
// egy valós gyalogos elérhetőségi candidate-ből ("innen X másodperc/méter
// alatt gyalogosan elérhető ez a megálló") egy stop-alapú TRANSIT
// candidate-et épít, a MEGLÉVŐ fetchMotisPlan() (motisClient.ts) hívásával.
//
//   coordinate origin
//        ↓
//   buildNearbyTransitAccessCandidates()   (nearbyTransitAccess.ts, ÚJRAHASZNÁLVA)
//        ↓
//   valid walking access candidate
//        ↓
//   transitDepartureTime = originalDepartAt + walkingDurationSeconds
//        ↓
//   fetchMotisPlan({ fromPlace: candidate.stopId (MOTIS-formátumra komponálva),
//                     toPlace: az eredeti cél (MEGLÉVŐ "lat,lon" contract),
//                     time: transitDepartureTime })
//        ↓
//   stop-based transit candidate (access + nyers MOTIS itineraryk + transitDepartureTime)
//
// SZIGORÚAN IZOLÁLT (spec): ezt a modult ebben a sprintben SEHOL nem hívja
// az orchestrator.ts route-search flow-ja. NEM módosítja a rangsorolást
// (ranking.ts), NEM épít Journey/JourneyLeg-et (types.ts), NEM hoz létre új
// MOTIS HTTP klienst — a MEGLÉVŐ fetchMotisPlan()-t hívja, változatlan
// alapértelmezett viselkedéssel.
//
// KRITIKUS IDŐKEZELÉS (spec 3. pont, lásd computeTransitDepartureTime()
// lent): a transit-tervezés indulási ideje SOSEM az eredeti keresési
// időpont — mindig originalDepartAt + walkingDurationSeconds, KIZÁRÓLAG a
// gyalogos access route MOTIS metadata.duration mezőjéből, SOSEM
// Date.now()-ból, és SOSEM egy önkényes boarding-bufferrel megnövelve. Ez
// zárja ki a "teleportációt" a megállóhoz.
//
// STOP-ID -> MOTIS-FORMÁTUM (spec 4/10. pont, lásd composeMotisStopId()
// lent): a buildNearbyTransitAccessCandidates() candidate.stopId-je a
// SIDECAR saját, NYERS GTFS stop_id-je (lásd accessibilityIndex.ts/
// vps-accessibility-sidecar/src/nearbyStops.ts — a sidecar SOHA nem lát/ad
// vissza MOTIS-kompozit azonosítót), de a fetchMotisPlan() fromPlace
// paramétere a MOTIS saját, dataset-prefixelt kompozit alakját várja (lásd
// motisIdNormalization.ts fejléce, E2E bizonyítva: fromPlace="bkkgtfs_F00094").
// Ez a modul EZÉRT a MEGLÉVŐ, motisIdNormalization.ts-ben már bizonyított
// "<dataset-tag>_<nyers GTFS id>" mintát KOMPONÁLJA ÖSSZE (nem egy új,
// találgatott formátumot) — a dataset-tag forrása egy explicit,
// provider-kulcsolt regiszter (PROVIDER_TO_MOTIS_DATASET_TAG lent),
// UGYANAZZAL a "bkkgtfs" értékkel, mint amit motisIdNormalization.ts
// KNOWN_MOTIS_DATASET_TAGS-je és accessibilityLookupClient.ts
// PROVIDER_TO_SIDECAR_DATASET-je is használ — ez a repóban MÁR bevált,
// manuálisan szinkronban tartott regiszter-minta (nem BKK/Budapest
// hardcode: egy jövőbeli MÁV/Volán providerhez ez a regiszter egyetlen
// sorral bővül, a lenti logika nem módosul).

import { buildNearbyTransitAccessCandidates } from "./nearbyTransitAccess.ts";
import type { NearbyTransitAccessInput, ReachableStopCandidate } from "./nearbyTransitAccess.ts";
import { fetchMotisPlan } from "./motisClient.ts";
import { vedettRouteLog } from "./logger.ts";
import type { MotisItinerary } from "./motisTypes.ts";
import type { TransitProviderId } from "./types.ts";

// UGYANAZ az érték, mint motisIdNormalization.ts KNOWN_MOTIS_DATASET_TAGS
// ("bkkgtfs" -> "BKK") és accessibilityLookupClient.ts
// PROVIDER_TO_SIDECAR_DATASET — a három regiszter SZÁNDÉKOSAN NEM egyetlen,
// megosztott export, mert a három fájl (Next.js server, sidecar, ez a
// builder) egymástól független felelősség — de a KONKRÉT ÉRTÉK egyezését a
// motisIdNormalization.ts fejléce és az accessibilityLookupClient.ts
// PROVIDER_TO_SIDECAR_DATASET kommentje is dokumentálja, ugyanabban a
// "manuálisan szinkronban tartott regiszter" mintában, amit a sidecar
// accessibilityIndex.ts/gtfsCsv.ts szinkron-másolatai is követnek.
const PROVIDER_TO_MOTIS_DATASET_TAG: Partial<Record<TransitProviderId, string>> = {
  BKK: "bkkgtfs",
};

/**
 * A sidecar nyers GTFS stopId-jéből komponálja a MOTIS kompozit stopId
 * alakját ("<tag>_<gtfsId>"), a motisIdNormalization.ts-ben BIZONYÍTOTT
 * mintával. Ismeretlen provider (nincs regisztrálva) esetén `null` — a
 * hívó ezt fail-safe módon kizárja (spec 6. pont), SOHA nem talál ki
 * prefixet.
 */
export function composeMotisStopId(provider: TransitProviderId, gtfsStopId: string): string | null {
  const tag = PROVIDER_TO_MOTIS_DATASET_TAG[provider];
  if (!tag) return null;
  if (!gtfsStopId || gtfsStopId.trim().length === 0) return null;
  return `${tag}_${gtfsStopId}`;
}

/**
 * KRITIKUS IDŐKEZELÉS (spec 3. pont) — determinisztikus, tisztán
 * függvény-alapú helper: transitDepartureTime = originalDepartAt +
 * walkingDurationSeconds. SOHA nem használ Date.now()-t (az "originalMs"
 * és a "walkingDurationSeconds" mindketten explicit paraméterek), és SOHA
 * nem ad hozzá önkényes boarding buffert — a walking duration PONTOSAN az
 * access route MOTIS metadata.duration mezője (lásd
 * nearbyTransitAccess.ts ReachableStopCandidate.walkingDurationSeconds).
 *
 * `null`-t ad vissza (fail-safe), ha `originalDepartAtIso` nem parse-olható
 * érvényes dátummá, vagy `walkingDurationSeconds` nem finite/negatív —
 * SOHA nem dob kivételt.
 */
export function computeTransitDepartureTime(originalDepartAtIso: string, walkingDurationSeconds: number): string | null {
  if (!Number.isFinite(walkingDurationSeconds) || walkingDurationSeconds < 0) return null;
  const originalMs = new Date(originalDepartAtIso).getTime();
  if (!Number.isFinite(originalMs)) return null;
  return new Date(originalMs + walkingDurationSeconds * 1000).toISOString();
}

export interface NearbyTransitJourneyCandidatesInput {
  provider: TransitProviderId;
  originLat: number;
  originLon: number;
  /** Az eredeti keresési cél — DESTINATION CONTRACT (spec 9. pont): a MEGLÉVŐ, orchestrator.ts-ben is használt "lat,lon" toPlace-formátumot őrzi meg, nincs párhuzamos destination-alak. */
  destination: { lat: number; lon: number };
  /** Az eredeti keresési indulási időpont (ISO) — lásd computeTransitDepartureTime(). */
  originalDepartAt: string;
  radiusMeters?: number;
  nearbyStopLimit?: number;
  /**
   * TRANSIT-ONLY SZEMANTIKA (spec 11. pont) — opcionális, explicit builder-
   * szintű passthrough a MEGLÉVŐ MotisPlanParams.transitModes mezőhöz (lásd
   * motisTypes.ts). KIZÁRÓLAG akkor kerül a MOTIS kérésbe, ha a hívó
   * ténylegesen megadja — a fetchMotisPlan() globális alapértelmezett
   * viselkedése ettől a modultól FÜGGETLENÜL, változatlan marad. Nincs
   * beégetett BKK-specifikus módlista.
   */
  transitModes?: string[];
  /** Opcionális, explicit passthrough a MEGLÉVŐ MotisPlanParams.numItineraries mezőhöz — nincs beégetett alapérték, a MOTIS saját defaultja marad, ha hiányzik. */
  numItineraries?: number;
}

export interface StopBasedTransitCandidate {
  /** A teljes gyalogos access candidate — a walking geometria/távolság/idő/usesElevator SOHA nem vész el (spec 8. pont). */
  access: ReachableStopCandidate;
  /** originalDepartAt + access.walkingDurationSeconds — lásd computeTransitDepartureTime(). */
  transitDepartureTime: string;
  /**
   * A MEGLÉVŐ MOTIS válasz-contract szerinti NYERS itineraryk (data.itineraries
   * ÉS data.direct összefűzve, ugyanúgy, mint orchestrator.ts
   * searchVedettRoutes()-ja teszi) — spec 7. pont: NEM feltételezzük, hogy
   * numItineraries pontosan ennyi elemet jelent, és ebben a sprintben
   * SZÁNDÉKOSAN NEM alakítjuk Journey/JourneyLeg-gé (spec 8. pont) — ahhoz
   * production Journey-mapping bekötés kellene, amit ez a sprint explicit
   * kizár.
   */
  itineraries: MotisItinerary[];
}

export interface NearbyTransitJourneyCandidatesResult {
  ok: true;
  candidates: StopBasedTransitCandidate[];
}

function clampToAccessLimit<T>(items: T[], limit: number | undefined): T[] {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return items;
  return items.slice(0, Math.floor(limit));
}

/**
 * Egyetlen access candidate-hez tartozó transit-tervezési próba. SOHA nem
 * dob kivételt — sikertelen/hasznavehetetlen esetben `null`-t ad, amit a
 * hívó egyszerűen kihagy az eredményből (spec 6. pont, fail-safe
 * per-candidate).
 */
async function evaluateTransitCandidate(
  access: ReachableStopCandidate,
  provider: TransitProviderId,
  destination: { lat: number; lon: number },
  originalDepartAt: string,
  transitModes: string[] | undefined,
  numItineraries: number | undefined
): Promise<StopBasedTransitCandidate | null> {
  const transitDepartureTime = computeTransitDepartureTime(originalDepartAt, access.walkingDurationSeconds);
  if (transitDepartureTime === null) {
    vedettRouteLog("routing_error", "warn", {
      reason: "nearby_transit_journey_candidate_invalid_departure_time",
      stopId: access.stopId,
    });
    return null;
  }

  const fromPlace = composeMotisStopId(provider, access.stopId);
  if (fromPlace === null) {
    vedettRouteLog("routing_error", "info", {
      reason: "nearby_transit_journey_candidate_unknown_provider_dataset_tag",
      stopId: access.stopId,
    });
    return null;
  }

  // DESTINATION CONTRACT (spec 9. pont) — PONTOSAN a MEGLÉVŐ
  // orchestrator.ts toPlace-formátum ("lat,lon"), nincs párhuzamos alak.
  const toPlace = `${destination.lat},${destination.lon}`;

  const planResult = await fetchMotisPlan({
    fromPlace,
    toPlace,
    time: transitDepartureTime,
    ...(numItineraries !== undefined ? { numItineraries } : {}),
    ...(transitModes && transitModes.length > 0 ? { transitModes } : {}),
  });

  if (!planResult.ok) {
    vedettRouteLog("routing_error", "info", {
      reason: "nearby_transit_journey_candidate_plan_failed",
      stopId: access.stopId,
      planReason: planResult.reason,
    });
    return null;
  }

  // Spec 7. pont: NEM feltételezzük, hogy numItineraries pontosan ennyi
  // eredményt jelent — a MEGLÉVŐ contract szerint az `itineraries` ÉS a
  // `direct` mező EGYARÁNT tartalmazhat találatot (lásd orchestrator.ts
  // searchVedettRoutes() rawItineraries összeállítása), ugyanúgy itt is.
  const itineraries: MotisItinerary[] = [...(planResult.data.itineraries ?? []), ...(planResult.data.direct ?? [])];

  if (itineraries.length === 0) {
    // Nem hiba — ez a megálló egyszerűen nem adott transit-tervezési
    // találatot erre az indulási időpontra. Fail-safe: a candidate
    // egyszerűen kimarad, a többi stopot nem érinti.
    vedettRouteLog("routing_error", "info", {
      reason: "nearby_transit_journey_candidate_no_itineraries",
      stopId: access.stopId,
    });
    return null;
  }

  return { access, transitDepartureTime, itineraries };
}

/**
 * A stop-based transit candidate pipeline: coordinate origin ->
 * buildNearbyTransitAccessCandidates() -> (legfeljebb nearbyStopLimit)
 * fetchMotisPlan() hívás, minden VALID gyalogos access candidate-re, a
 * transitDepartureTime-mal korrigálva -> stop-based transit candidate-ok.
 *
 * REQUEST-KÖLTSÉGVETÉS (spec 5. pont): 1 nearby lookup + legfeljebb
 * nearbyStopLimit walking route request (mindkettő a
 * buildNearbyTransitAccessCandidates() MEGLÉVŐ korlátjai szerint) + LEGFELJEBB
 * 1 transit plan / VALID walking access candidate — tehát alapértelmezett
 * limit (3) esetén összesen legfeljebb 1+3+3 hívás. NINCS második nearby
 * lookup, NINCS retry-fanout, NINCS rekurzív tervezés, NINCS automatikus
 * radius-bővítés — a fetchMotisPlan() saját, MEGLÉVŐ transport-retry
 * viselkedése (egyetlen retry, KIZÁRÓLAG hálózati hibán, lásd
 * motisClient.ts fetchWithSingleRetryOnNetworkError()) VÁLTOZATLAN marad.
 *
 * SOSEM dob kivételt. Ha nincs valid gyalogos access candidate, EGYETLEN
 * transit plan kérés sem indul (spec 6. pont) — korábbi, elkülönített
 * kódágon `{ok:true, candidates:[]}`. Ha minden transit plan sikertelen,
 * ugyanez az eredmény — fail-safe, nincs külön "hiba" ág.
 */
export async function buildNearbyTransitJourneyCandidates(
  input: NearbyTransitJourneyCandidatesInput
): Promise<NearbyTransitJourneyCandidatesResult> {
  const accessInput: NearbyTransitAccessInput = {
    provider: input.provider,
    originLat: input.originLat,
    originLon: input.originLon,
    radiusMeters: input.radiusMeters,
    nearbyStopLimit: input.nearbyStopLimit,
  };

  // ÚJRAHASZNÁLVA — nincs második, párhuzamos nearby-discovery logika.
  const accessResult = await buildNearbyTransitAccessCandidates(accessInput);

  if (accessResult.candidates.length === 0) {
    // Külön, korábbi ág: nincs valid gyalogos access candidate — a transit
    // plan hívások meg sem kezdődnek (spec 6. pont).
    return { ok: true, candidates: [] };
  }

  // Fail-safe levágás: MÉG AKKOR IS legfeljebb `nearbyStopLimit` hosszúra
  // vágjuk (ha a candidate-builder — hibásan/váratlanul — többet adna
  // vissza), hogy ez a modul SOSEM indítson ennél több transit plan
  // hívást (spec 5. pont: "maximum 1 transit plan / VALID walking access
  // candidate").
  const boundedAccess = clampToAccessLimit(accessResult.candidates, input.nearbyStopLimit);

  const settled = await Promise.all(
    boundedAccess.map((access) =>
      evaluateTransitCandidate(access, input.provider, input.destination, input.originalDepartAt, input.transitModes, input.numItineraries)
    )
  );

  const candidates = settled.filter((c): c is StopBasedTransitCandidate => c !== null);

  return { ok: true, candidates };
}
