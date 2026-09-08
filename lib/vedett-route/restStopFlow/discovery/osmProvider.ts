// Sprint E.1 — OSM/Overpass alapú RestPointProvider.
//
// KIZÁRÓLAG szerver oldalon fut (Next.js API route hívja, lásd
// app/api/vedett-route/rest-stops/nearby/route.ts) — a böngésző SOHA nem
// hívja közvetlenül az Overpass API-t (spec 2. és 12. pont). Ez a
// staging/preview validációhoz használt, publikus Overpass instance-ra
// mutató implementáció; production-ben a VEDETT_ROUTE_ENABLED flag marad
// false, és a végleges architektúra egy önhosztolt, a meglévő
// Magyarország OSM PBF-ből épített POI-indexre vált majd (spec 15. pont)
// — ezt a jövőbeli cserét éppen ez a RestPointProvider absztrakció teszi
// lehetővé anélkül, hogy az aggregátort vagy az API route-ot módosítani
// kellene.
//
// Adatvédelem (spec 15. pont): a szerver továbbítja a koordinátákat az
// Overpass felé (ez elkerülhetetlen egy "közelben" kereséshez), de a
// nyers lat/lon SOSEM kerül logolásba (lásd lent — minden vedettRouteLog
// hívás explicit kerüli a koordináták átadását).
//
// Hibatűrés (spec 11. pont, "PARTIAL FAILURE"): ez a provider SOSEM dob
// tovább nyers hibát — timeout, hálózati hiba, HTTP hibaválasz, vagy
// hibásan formázott (malformed) Overpass válasz esetén is egy típusos
// {status:"unavailable", reason} objektumot ad vissza, hogy egy OSM-oldali
// probléma NE dönthesse romba a USER/VEDETT_SAROK találatokat.

import type { FindNearbyParams, ProviderResult, RestPointProvider } from "./types.ts";
import type { RestPoint } from "../../../rest-points/types.ts";
import {
  OSM_CATEGORY_DEFS,
  matchOsmCategory,
  deriveOsmAttributes,
  deriveOsmPointName,
  type OsmElementTags,
} from "./osmTagMapping.ts";
import { vedettRouteLog } from "../../logger.ts";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// Explicit timeout (spec 12. pont) — az Overpass szerver-oldali
// "[timeout:N]" direktíváján felül a kliens oldali AbortController is
// garantálja, hogy sose várjunk a végtelenségig egy elakadt kérésre.
const REQUEST_TIMEOUT_MS = 8_000;
const OVERPASS_SERVER_TIMEOUT_SECONDS = 6;

// Legfeljebb 1 retry, indokolt esetben (spec 12. pont: "maximum 1 retry,
// ha indokolt" / "nincs végtelen retry") — csak hálózati/timeout hibán,
// HTTP 4xx-en NEM (az nem múlik el retry-ra).
const MAX_RETRIES = 1;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function buildOverpassQuery(latitude: number, longitude: number, radiusMeters: number): string {
  // Kategóriánként külön (node/way) szűrő, csak a spec 8 explicit
  // kategóriájára (spec 6. pont) — NEM veszünk fel boltot/éttermet/
  // kávézót/szolgáltatást.
  const around = `(around:${radiusMeters},${latitude},${longitude})`;
  const clauses = OSM_CATEGORY_DEFS.map(
    (def) => `node["${def.key}"="${def.value}"]${around};way["${def.key}"="${def.value}"]${around};`
  ).join("\n  ");
  return `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_SECONDS}];
(
  ${clauses}
);
out center tags;`;
}

async function fetchOverpassOnce(query: string): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`overpass_http_${response.status}`);
    }
    const json = (await response.json()) as unknown;
    if (!json || typeof json !== "object" || !Array.isArray((json as OverpassResponse).elements)) {
      throw new Error("overpass_malformed_response");
    }
    return json as OverpassResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOverpassWithRetry(query: string): Promise<OverpassResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchOverpassOnce(query);
    } catch (err) {
      lastError = err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const isMalformed = err instanceof Error && err.message === "overpass_malformed_response";
      // Malformed válaszon nincs retry (nem múlik el újrapróbálásra,
      // determinisztikusan ugyanaz jönne vissza); csak timeout/hálózati
      // hibán próbálunk újra, legfeljebb MAX_RETRIES alkalommal.
      if (isMalformed || attempt === MAX_RETRIES) break;
      if (!isTimeout && !(err instanceof TypeError)) break;
    }
  }
  throw lastError;
}

// Egy Overpass elem koordinátája — node esetén lat/lon közvetlenül, way
// esetén az "out center" miatt a center mezőben.
function elementCoords(element: OverpassElement): { lat: number; lon: number } | null {
  if (typeof element.lat === "number" && typeof element.lon === "number") {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.center && typeof element.center.lat === "number" && typeof element.center.lon === "number") {
    return { lat: element.center.lat, lon: element.center.lon };
  }
  return null;
}

function toRestPoint(element: OverpassElement): RestPoint | null {
  const tags: OsmElementTags = element.tags ?? {};
  const def = matchOsmCategory(tags);
  if (!def) return null;

  const coords = elementCoords(element);
  if (!coords) return null;

  const attrs = deriveOsmAttributes(def.category, tags);
  // access=private / access=no -> SOSEM ajánljuk (spec 7. pont).
  if (attrs.excludedPrivateAccess) return null;

  return {
    id: `osm:${element.type}/${element.id}`,
    createdBy: "osm",
    name: deriveOsmPointName(def, tags),
    latitude: coords.lat,
    longitude: coords.lon,
    source: "OSM",
    visibility: "PUBLIC",
    toilet: attrs.toilet,
    seating: attrs.seating,
    // SOSEM állítjuk OSM-ből — lásd osmTagMapping.ts fejléce ("UNKNOWN !=
    // FALSE", sosem következtetünk csendességre/szenzoros nyugalomra).
    quietSpace: null,
    indoors: attrs.indoors,
    outdoors: attrs.outdoors,
    purchaseRequired: attrs.purchaseRequired,
    // access=customers/permit esetén a jegyzetben egyértelműen jelöljük a
    // korlátozást, hogy a hívó/UI ne alapértelmezettként ajánlja (spec 7.
    // pont) — de nem zárjuk ki, csak felcímkézzük.
    notes: attrs.restrictedAccess ? "Korlátozott hozzáférés (pl. csak vásárlóknak)." : null,
    createdAt: "",
    updatedAt: "",
    category: def.category,
  };
}

export const osmRestPointProvider: RestPointProvider = {
  name: "osm",
  async findNearby(params: FindNearbyParams): Promise<ProviderResult> {
    const query = buildOverpassQuery(params.latitude, params.longitude, params.radiusMeters);
    try {
      const data = await fetchOverpassWithRetry(query);
      const points: RestPoint[] = [];
      for (const element of data.elements ?? []) {
        const point = toRestPoint(element);
        if (point) points.push(point);
      }
      return { status: "ok", points };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const reason = isTimeout
        ? "timeout"
        : err instanceof Error
          ? err.message
          : "unknown_error";
      // SOSEM logolunk koordinátát (lat/lon) — csak a hiba okát/típusát
      // (spec 12. pont, "Ne logolj koordinátát").
      vedettRouteLog(isTimeout ? "timeout" : "provider_error", "warn", {
        provider: "osm",
        reason,
      });
      return { status: "unavailable", reason };
    }
  },
};
