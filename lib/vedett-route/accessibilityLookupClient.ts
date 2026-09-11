// VÉDETT ÚTVONAL — ACCESSIBILITY LOOKUP CLIENT (Task C3, 2026-09-11)
//
// Ez a modul VÁLTJA FEL a korábbi (Task C2) getAccessibilityIndex("bkk")
// hívást az orchestrator.ts-ben — de KIZÁRÓLAG az adat FORRÁSÁT (VPS
// server-to-server lookup a MOTIS-sal UGYANARRÓL a canonical GTFS zipről
// épült indexből, a local Next.js-oldali .vedett-cache/ helyett), a
// visszaadott ÉRTÉK ALAKJA (AccessibilityIndexLike | null) és a hívó
// oldali kezelés SZÁNDÉKOSAN TELJESEN VÁLTOZATLAN marad — az accessibility.ts
// klasszifikációs függvényeit (classifyItineraryStepFreeAccessibility és a
// belső classify* segédek) EZ A FÁJL NEM MÓDOSÍTJA, és nekik SEMMI okuk
// tudni arról, hogy az index most honnan érkezik (spec: "a C2 logikát ne
// írd újra", "ne hozz létre második, párhuzamos accessibility engine-t").
//
// FAIL-SAFE SZERZŐDÉS (spec 15. pont) — ez a függvény SOHA nem dob
// kivételt, és SOHA nem ad vissza "úgy néz ki, mint egy valódi index"
// adatot hiba esetén. Minden hibaeset (nincs konfigurálva, timeout, 401/
// 403/5xx, malformed JSON, dataset ismeretlen/nem elérhető, generation
// összefüggés hiánya) UGYANARRA az egyetlen null visszatérési értékre
// vezet — ami a meglévő accessibility.ts kódban PONTOSAN úgy viselkedik,
// mint a korábbi "nincs feltöltött BKK cache" eset: minden komponens
// UNKNOWN-ra esik vissza, a MOTIS saját NOT_ACCESSIBLE hard filter-e
// TOVÁBBRA IS működik (az egy teljesen független, korábbi réteg,
// orchestrator.ts-ben/motisClient.ts-ben, ide nem tartozik), és a
// journey legrosszabb esetben PARTIALLY_UNKNOWN lesz, SOHA nem
// KNOWN_ACCESSIBLE puszta lookup-hiba miatt.
//
// NORMALIZÁLÁS HELYE (spec 19. pont, tudatos döntés): a MOTIS kompozit
// azonosítók (pl. "bkkgtfs_056216") -> nyers GTFS id normalizálása ITT, a
// Next.js oldalon történik, a MEGLÉVŐ motisIdNormalization.ts modult
// újrahasznosítva — a sidecar SOHA nem lát/ismer MOTIS-formátumú
// azonosítót, KIZÁRÓLAG nyers GTFS id-kat kap és ad vissza. Ez az EGYETLEN
// hely a teljes rendszerben, ami a MOTIS kompozit-ID formátumot ismeri
// (ugyanaz, mint amit accessibility.ts már ma is használ).
//
// N+1 ELKERÜLÉSE (spec 14. pont): egy teljes keresés (searchVedettRoutes)
// az ÖSSZES candidate itinerary összes lábából egyetlen, batch-elt
// stopIds/tripIds/pathwayQueries listát épít, és EGYETLEN HTTP hívást
// indít a sidecar felé — sosem egyet itineraryenkánt/lábankánt.

import { getAccessibilitySidecarConfig } from "./config.ts";
import { normalizeMotisStopId, normalizeMotisTripId } from "./motisIdNormalization.ts";
import { vedettRouteLog } from "./logger.ts";
import type { AccessibilityIndexLike, StepFreeLegLike } from "./accessibility.ts";
import type { TransitProviderId } from "./types.ts";

// Provider -> sidecar dataset-kulcs regiszter (spec 19. pont: "a
// megoldás NE legyen BKK-hardkódolt" — új provider/dataset felvétele
// KIZÁRÓLAG ennek a táblának a bővítése, a lenti logika nem módosul,
// ugyanaz a minta, mint a motisIdNormalization.ts KNOWN_MOTIS_DATASET_TAGS
// regisztere). A kulcs SZÁNDÉKOSAN megegyezik a MOTIS dataset-taggel
// (pl. "bkkgtfs"), mert a VPS-en a buildIndex.ts CLI és a storageLayout.ts
// könyvtárszerkezet is ugyanezt a konvenciót követi.
const PROVIDER_TO_SIDECAR_DATASET: Partial<Record<TransitProviderId, string>> = {
  BKK: "bkkgtfs",
};

interface PathwayQueryPair {
  fromStopId: string;
  toStopId: string;
}

interface CollectedLookupNeeds {
  dataset: string;
  stopIds: string[];
  tripIds: string[];
  pathwayQueries: PathwayQueryPair[];
}

/**
 * Az ÖSSZES candidate itinerary nyers lábaiból összegyűjti a sidecar
 * lookuphoz szükséges, MÁR normalizált (nyers GTFS) azonosítókat.
 * Pontosan ugyanazt a "mely lábak/pár relevánsak" logikát követi, mint
 * accessibility.ts classifyItineraryStepFreeAccessibility()-je (nem-WALK
 * láb -> trip+from+to stop; KÉT transit láb közötti WALK láb -> pathway
 * pár; első/utolsó WALK láb kimarad) — SZÁNDÉKOSAN, hogy soha ne
 * kérdezzünk le többet/kevesebbet, mint amit a klasszifikáció tényleg
 * felhasznál.
 *
 * Visszaad `null`-t, ha az itineraryk semelyik lába sem normalizálható
 * egy ISMERT providerre (pl. teszt/ismeretlen dataset) — ilyenkor a
 * hívónak nincs mit lekérdeznie, a lookup elmarad, az index null marad.
 */
function collectLookupNeeds(itinerariesLegs: StepFreeLegLike[][]): CollectedLookupNeeds | null {
  const stopIds = new Set<string>();
  const tripIds = new Set<string>();
  const pathwayQueries: PathwayQueryPair[] = [];
  let dataset: string | null = null;

  for (const legs of itinerariesLegs) {
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (leg.mode !== "WALK") {
        const fromNorm = normalizeMotisStopId(leg.from?.stopId);
        const toNorm = normalizeMotisStopId(leg.to?.stopId);
        if (fromNorm.provider !== "UNKNOWN") {
          stopIds.add(fromNorm.gtfsId);
          dataset = dataset ?? PROVIDER_TO_SIDECAR_DATASET[fromNorm.provider] ?? null;
        }
        if (toNorm.provider !== "UNKNOWN") {
          stopIds.add(toNorm.gtfsId);
          dataset = dataset ?? PROVIDER_TO_SIDECAR_DATASET[toNorm.provider] ?? null;
        }
        if (leg.tripId) {
          const tripNorm = normalizeMotisTripId(leg.tripId);
          if (tripNorm.provider !== "UNKNOWN") {
            tripIds.add(tripNorm.gtfsId);
            dataset = dataset ?? PROVIDER_TO_SIDECAR_DATASET[tripNorm.provider] ?? null;
          }
        }
      } else {
        const prev = legs[i - 1];
        const next = legs[i + 1];
        const isTransfer = Boolean(prev && next && prev.mode !== "WALK" && next.mode !== "WALK");
        if (!isTransfer) continue;
        const fromNorm = normalizeMotisStopId(leg.from?.stopId);
        const toNorm = normalizeMotisStopId(leg.to?.stopId);
        if (fromNorm.provider === "UNKNOWN" || toNorm.provider === "UNKNOWN") continue;
        pathwayQueries.push({ fromStopId: fromNorm.gtfsId, toStopId: toNorm.gtfsId });
        dataset = dataset ?? PROVIDER_TO_SIDECAR_DATASET[fromNorm.provider] ?? null;
      }
    }
  }

  if (!dataset) return null;
  if (stopIds.size === 0 && tripIds.size === 0 && pathwayQueries.length === 0) return null;
  return { dataset, stopIds: Array.from(stopIds), tripIds: Array.from(tripIds), pathwayQueries };
}

interface SidecarLookupResponseBody {
  ok?: boolean;
  status?: "ok" | "unavailable";
  generation?: string | null;
  stops?: Record<string, { wheelchairBoarding?: number }>;
  trips?: Record<string, { wheelchairAccessible?: number }>;
  pathways?: { fromStopId: string; toStopId: string; pathwayMode: number; isBidirectional: boolean }[];
}

function isValidSidecarLookupResponse(body: unknown): body is SidecarLookupResponseBody {
  if (!body || typeof body !== "object") return false;
  const b = body as SidecarLookupResponseBody;
  if (b.status !== "ok" && b.status !== "unavailable") return false;
  if (b.status === "ok") {
    if (!b.stops || typeof b.stops !== "object") return false;
    if (!b.trips || typeof b.trips !== "object") return false;
    if (!Array.isArray(b.pathways)) return false;
  }
  return true;
}

/**
 * Egyetlen, batch-elt VPS accessibility-sidecar lookup hívás az ÖSSZES
 * candidate itinerary nyers lábai alapján. SOHA nem dob kivételt — minden
 * hibaágon `null`-t ad vissza (lásd modul-fejléc fail-safe szerződése).
 *
 * `stepFreeRequired === false` esetén ezt a függvényt a hívó (orchestrator.ts)
 * egyáltalán nem hívja meg — ez itt csak a "meghívva, de nincs mit
 * lekérdezni/nincs konfigurálva" ágakat kezeli.
 */
export async function lookupAccessibilityIndexForItineraries(
  itinerariesLegs: StepFreeLegLike[][]
): Promise<AccessibilityIndexLike | null> {
  const config = getAccessibilitySidecarConfig();
  if (!config) {
    vedettRouteLog("routing_error", "info", { reason: "accessibility_sidecar_not_configured" });
    return null;
  }

  const needs = collectLookupNeeds(itinerariesLegs);
  if (!needs) return null;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.authToken}`,
      },
      body: JSON.stringify({
        dataset: needs.dataset,
        stopIds: needs.stopIds,
        tripIds: needs.tripIds,
        pathwayQueries: needs.pathwayQueries,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      vedettRouteLog("routing_error", "warn", {
        reason: "accessibility_lookup_http_error",
        status: response.status,
      });
      return null;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      vedettRouteLog("routing_error", "warn", { reason: "accessibility_lookup_malformed_json" });
      return null;
    }

    if (!isValidSidecarLookupResponse(body)) {
      vedettRouteLog("routing_error", "warn", { reason: "accessibility_lookup_malformed_body" });
      return null;
    }

    if (body.status === "unavailable") {
      // A dataset ismert, de a sidecaron még nincs betöltve generation
      // (pl. az induló build még nem futott le) — NEM hiba, csak nincs
      // adat, pontosan úgy kezelendő, mint egy timeout (spec 15. pont).
      vedettRouteLog("routing_error", "info", { reason: "accessibility_lookup_dataset_unavailable" });
      return null;
    }

    return {
      stopsById: body.stops ?? {},
      tripsById: body.trips ?? {},
      pathways: body.pathways ?? [],
    };
  } catch (err) {
    // Timeout (AbortError) VAGY hálózati hiba — mindkettő ugyanarra a
    // biztonságos null-ra vezet.
    vedettRouteLog("routing_error", "warn", {
      reason: "accessibility_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
