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
// nyers lat/lon SOSEM kerül logolásba, és a teljes Overpass query szöveg
// SEM (az koordinátát tartalmaz) — lásd lent, minden vedettRouteLog hívás
// explicit csak az osztályozott errorCode-ot és a HTTP státuszkódot adja
// át, sosem a query-t vagy a nyers választ.
//
// Hibatűrés (spec 11. pont, "PARTIAL FAILURE"): ez a provider SOSEM dob
// tovább nyers hibát — timeout, hálózati hiba, HTTP hibaválasz, rate
// limit, Overpass query hiba, vagy hibásan formázott (malformed) válasz
// esetén is egy típusos {status:"unavailable", reason, errorCode}
// objektumot ad vissza, hogy egy OSM-oldali probléma NE dönthesse romba a
// USER/VEDETT_SAROK találatokat.
//
// STAGING DIAGNOSZTIKA (Sprint E.1 hotfix, 2026-09-08): korábban minden
// hibaosztály egyetlen, szabad szöveges "reason" mezőbe lett összemosva
// (pl. egy HTTP 4xx és egy hálózati timeout ugyanúgy nézett ki kívülről),
// emiatt egy staging jelentésből ("nincs OSM pihenőpont") nem lehetett
// találgatás nélkül megállapítani a tényleges root cause-t. Ez a fájl
// mostantól egy ZÁRT, gépileg összehasonlítható OsmProviderErrorCode
// halmazra osztályozza a hibát (lásd lent) — ez jelenik meg az admin/
// preview debug felületen (route.ts "sources" mezője).

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

// STAGING HOTFIX (2026-09-09) — root cause audit: a valódi Vercel Preview
// logban megerősített hiba `errorCode: http_error, reason:
// overpass_http_406, httpStatus: 406` volt. A kérés eddig NEM küldött
// semmilyen alkalmazás-azonosítót (sem User-Agent-et, sem Referer-t) —
// csak Content-Type-ot. Ez a két header KIZÁRÓLAG STATIKUS,
// alkalmazás-szintű azonosító — SOHA nem tartalmazhat GPS-koordinátát,
// userId-t, auth tokent, Supabase-adatot vagy secretet, és ez így is
// marad, mert konstans string, nem paraméterezett.
//
// A kontakt URL egy jelenlegi legjobb becslés — a projekt tulajdonosának
// kell véglegesítenie egy valós, élesben elérhető URL-re, ha ez eltérne.
const OVERPASS_APP_USER_AGENT = "VedettSarok-VedettUtvonal/1.0 (+https://vedettsarok.hu)";
const OVERPASS_APP_REFERER = "https://vedettsarok.hu/";

// Explicit timeout (spec 12. pont) — az Overpass szerver-oldali
// "[timeout:N]" direktíváján felül a kliens oldali AbortController is
// garantálja, hogy sose várjunk a végtelenségig egy elakadt kérésre.
const REQUEST_TIMEOUT_MS = 8_000;
const OVERPASS_SERVER_TIMEOUT_SECONDS = 6;

// Legfeljebb 1 retry, indokolt esetben (spec 12. pont: "maximum 1 retry,
// ha indokolt" / "nincs végtelen retry") — csak hálózati/timeout hibán,
// HTTP 4xx-en NEM (az nem múlik el retry-ra).
const MAX_RETRIES = 1;

// ZÁRT hibaosztály-halmaz — az admin/preview debug felület (route.ts
// "sources" mezője) ezt jeleníti meg gépileg összehasonlítható kódként,
// SOHA nem a nyers hibaüzenetet/query-t.
export type OsmProviderErrorCode =
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "malformed_response"
  | "query_error"
  | "endpoint_unavailable"
  | "parse_error"
  | "unknown_error";

// Típusos hiba, amely mindig pontosan egy OsmProviderErrorCode-hoz
// tartozik. A "message" mező is SOSEM tartalmazhat koordinátát vagy
// nyers Overpass query szöveget — csak rövid, ember-olvasható
// osztályozási leírást (pl. "overpass_http_503").
export class OverpassError extends Error {
  readonly code: OsmProviderErrorCode;
  readonly httpStatus?: number;

  constructor(code: OsmProviderErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "OverpassError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

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
  // Az Overpass néhány hibaesetben (pl. lekérdezési/futásidejű hiba) 200
  // OK-kal, de "remark" mezővel válaszol, elements nélkül. A remark
  // SZÖVEGÉT sosem logoljuk (akár koordinátát is tartalmazhat egy
  // visszaküldött query-részletben) — csak azt észleljük, hogy jelen
  // van, és query_error-ként osztályozzuk.
  remark?: string;
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
  let response: Response;
  try {
    // A body-t URLSearchParams-szal építjük (nem manuális
    // encodeURIComponent()-tel) — ez a hivatalosan dokumentált
    // application/x-www-form-urlencoded kódolás (szóköz "+"-ként, nem
    // "%20"-ként), az Overpass QL query SZEMANTIKÁJÁT nem érinti, csak a
    // kódolás módját. A Content-Type explicit charset=UTF-8-cal van
    // kiegészítve. A User-Agent/Referer KIZÁRÓLAG statikus, alkalmazás-
    // szintű azonosító (lásd fenti konstansok fejléce) — soha semmilyen
    // futásidejű/felhasználói adat nem kerül bele.
    response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": OVERPASS_APP_USER_AGENT,
        "Referer": OVERPASS_APP_REFERER,
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    // A fetch() maga dob, ha a kérés SOHA nem kapott HTTP választ —
    // vagy azért, mert a kliens oldali AbortController megszakította
    // (timeout), vagy mert az endpoint hálózati szinten elérhetetlen
    // (DNS/TCP/TLS hiba, connection refused, stb.).
    if (err instanceof Error && err.name === "AbortError") {
      throw new OverpassError("timeout", "overpass_timeout");
    }
    throw new OverpassError("endpoint_unavailable", "overpass_endpoint_unavailable");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new OverpassError("rate_limited", `overpass_http_${response.status}`, response.status);
    }
    if (response.status === 400) {
      // Overpass 400-at ad vissza szintaktikailag/szemantikailag hibás
      // QL query esetén — ez a mi query-építésünk hibája, nem a
      // szolgáltatás elérhetetlensége, ezért külön osztály.
      throw new OverpassError("query_error", `overpass_http_${response.status}`, response.status);
    }
    throw new OverpassError("http_error", `overpass_http_${response.status}`, response.status);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    // A válasz 2xx volt, de a body nem parse-olható JSON-ként.
    throw new OverpassError("parse_error", "overpass_parse_error");
  }

  if (json && typeof json === "object" && typeof (json as OverpassResponse).remark === "string" && !Array.isArray((json as OverpassResponse).elements)) {
    // 200 OK, de az Overpass "remark" mezőben jelzett hibát/figyelmeztetést
    // (pl. lekérdezési/futásidejű hiba) — a remark SZÖVEGÉT szándékosan
    // nem adjuk tovább semerre (lehet benne query-részlet/koordináta).
    throw new OverpassError("query_error", "overpass_remark_error");
  }

  if (!json || typeof json !== "object" || !Array.isArray((json as OverpassResponse).elements)) {
    throw new OverpassError("malformed_response", "overpass_malformed_response");
  }

  return json as OverpassResponse;
}

async function fetchOverpassWithRetry(query: string): Promise<OverpassResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchOverpassOnce(query);
    } catch (err) {
      lastError = err;
      // Csak a ténylegesen átmeneti, hálózati szintű hibaosztályokon
      // (timeout / endpoint_unavailable) próbálunk újra — rate limit,
      // HTTP 4xx, query hiba, malformed és parse hiba determinisztikusan
      // ugyanazt adná vissza újrapróbálásra, ezért azokon NINCS retry
      // (spec 12. pont: "nincs végtelen retry").
      const isRetryable = err instanceof OverpassError && (err.code === "timeout" || err.code === "endpoint_unavailable");
      if (!isRetryable || attempt === MAX_RETRIES) break;
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

// A vedettRouteLog "event" mezője a hibaosztály-családot jelöli
// (timeout/malformed_response külön eseményként már létezett; a többi
// osztályt "provider_error"-ként logoljuk, az errorCode mezőben pontos
// osztályozással — így a meglévő logger event-enumot nem kellett
// szükségtelenül bővíteni minden egyes új kóddal).
function logEventForCode(code: OsmProviderErrorCode): "timeout" | "malformed_response" | "provider_error" {
  if (code === "timeout") return "timeout";
  if (code === "malformed_response") return "malformed_response";
  return "provider_error";
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
      const classified =
        err instanceof OverpassError
          ? err
          : new OverpassError("unknown_error", err instanceof Error ? err.message : "unknown_error");

      // SOSEM logolunk koordinátát (lat/lon) és SOSEM logoljuk a teljes
      // Overpass query szöveget (az koordinátát tartalmaz) — csak a
      // zárt errorCode-ot, a rövid osztályozási üzenetet, és — ha van —
      // a HTTP státuszkódot (spec 12. pont).
      vedettRouteLog(logEventForCode(classified.code), "warn", {
        provider: "osm",
        errorCode: classified.code,
        reason: classified.message,
        ...(classified.httpStatus !== undefined ? { httpStatus: classified.httpStatus } : {}),
      });

      return { status: "unavailable", reason: classified.message, errorCode: classified.code };
    }
  },
};
