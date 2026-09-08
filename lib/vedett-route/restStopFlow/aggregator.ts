// Sprint E.1 — discovery-orchestrátor: 3 provider (USER/VEDETT_SAROK/OSM)
// párhuzamos lekérdezése, hibatűrő összefésülés, egyszeri sugár-bővítés,
// dedupe, max-eredményszám korlát.
//
// ARCHITEKTÚRA (spec 2. pont): Browser -> Next.js API -> providerek ->
// normalizált RestPoint[] -> ranking -> UI. Ez a modul a "providerek ->
// normalizált RestPoint[]" lépés — a rangsorolást (ranking.ts) és a
// HTTP-választ a hívó (app/api/vedett-route/rest-stops/nearby/route.ts)
// végzi, EZ a modul nem tud a HTTP rétegről.
//
// PARTIAL FAILURE (spec 11. pont, szó szerint): egyetlen forrás hibája
// (pl. OSM timeout) SOSEM dönti romba a többi forrás eredményét. Minden
// providert egymástól függetlenül hívunk (Promise.all — mindegyik saját
// try/catch-csel véd, lásd providerek), és a végeredmény akkor is "ok",
// ha csak EGY forrás sikeres volt. A "sources" mezőben jelezzük,
// melyik forrás volt elérhető/nem elérhető — csak szerver-oldali
// diagnosztikának, a UI-nak nem kötelező nyers technikai néven mutatnia.
//
// SUGÁR-BŐVÍTÉS (spec 10. pont): első kör 800m. Ha a dedupe UTÁN nulla
// találat van, EGYETLEN alkalommal újra próbálkozunk 1500m-rel — SOSEM
// végtelen/ismételt bővítés.
//
// STAGING HOTFIX (2026-09-09, root cause audit): a sugár-bővítés
// EREDETILEG feltétel nélkül újrahívta MINDHÁROM providert, akkor is, ha
// egy provider (pl. OSM) az ELSŐ körben egy DETERMINISZTIKUS, nem-
// tranziens hibával bukott (pl. HTTP 406/429/400 — lásd a valós Vercel
// Preview incidenst: `errorCode: http_error, reason: overpass_http_406`).
// Mivel egy 406/429/malformed/parse hiba a keresési sugártól függetlenül
// szinte biztosan MEGISMÉTLŐDNE, ez egyetlen felhasználói művelet ("Pihenőre
// van szükségem") alatt akár 2 egymást követő, ugyanazon okból hibázó
// Overpass-hívást is generálhatott — ez a KRITIKUS elvárás ("406 után
// ugyanazon user action alatt ne küldj még egy Overpass requestet") ellen
// hatott. A javítás: a bővített (1500m) kör KIZÁRÓLAG azokat a
// providereket hívja újra, amelyek az ELSŐ körben VAGY sikeresek voltak
// (hogy a nagyobb sugár tényleg találhasson többet), VAGY egy explicit
// TRANZIENS hibaosztállyal buktak (`timeout`/`endpoint_unavailable`) — lásd
// isWorthRetryingOnExpansion() lent. Minden más hibaosztály (`http_error`,
// `rate_limited`, `query_error`, `malformed_response`, `parse_error`, és
// minden osztályozatlan/`unknown_error` eset) KIMARAD a bővített körből —
// a diagnosztikai `sources` bejegyzésük az ELSŐ kör állapotát őrzi meg
// (nem íródik felül egy "nem is futtattuk" default értékkel).
//
// MAX EREDMÉNYSZÁM (spec 10. pont, "~10-15"): itt korlátozzuk a
// dedupe-olt listát a hívó előtt, hogy a ranking.ts modul se kapjon
// indokolatlanul sok pontot, és a UI se kelljen kezeljen több száz POI-t.

import type { RestPoint } from "../../rest-points/types.ts";
import type { FindNearbyParams, RestPointProvider } from "./discovery/types.ts";
import { dedupeRestPoints } from "./dedupe.ts";
import { vedettRouteLog } from "../logger.ts";

// SZÁNDÉKOSAN dinamikus import (nem statikus top-level import) — a
// userProvider.ts és a vedettSarokProvider.ts transzitívan a projekt
// "@/lib/..." útvonal-aliasát használó Supabase modulokat importálja
// (lib/rest-points/queries.ts, lib/data.ts), amit KIZÁRÓLAG a Next.js
// build-rendszer tud feloldani — a node --test futtató nem. Statikus
// import esetén EGYETLEN teszt sem tudná betölteni ezt a modult saját,
// mock providerekkel sem (lásd sprint-e1-discovery.test.ts —
// discoverRestPoints()-t mindig explicit providers paraméterrel hívja,
// SOSEM a valós Supabase-t elérő alapértelmezett providereket). Éles
// hívóknál (route.ts) ez a dinamikus import csak egyszer, az ELSŐ
// híváskor fut le ténylegesen hálózat NÉLKÜL (pusztán modulbetöltés).
async function loadDefaultProviders(): Promise<RestPointProvider[]> {
  const [{ userRestPointProvider }, { vedettSarokRestPointProvider }, { osmRestPointProvider }] = await Promise.all([
    import("./discovery/userProvider.ts"),
    import("./discovery/vedettSarokProvider.ts"),
    import("./discovery/osmProvider.ts"),
  ]);
  return [userRestPointProvider, vedettSarokRestPointProvider, osmRestPointProvider];
}

export const INITIAL_SEARCH_RADIUS_METERS = 800;
export const EXPANDED_SEARCH_RADIUS_METERS = 1500;
export const MAX_REST_POINTS = 15;

export interface DiscoverRestPointsParams {
  latitude: number;
  longitude: number;
  userId: string;
  // Csak teszteléshez/jövőbeli providerbővítéshez injektálható — éles
  // hívók (route.ts) nem adják át, a DEFAULT_PROVIDERS-t használjuk.
  providers?: RestPointProvider[];
}

export interface DiscoverySourceStatus {
  ok: boolean;
  reason?: string;
  // Sprint E.1 hotfix (2026-09-08) — ZÁRT, gépileg összehasonlítható
  // hibaosztály-kód (jelenleg csak az OSM provider tölti ki, lásd
  // discovery/osmProvider.ts OsmProviderErrorCode típusa), admin/preview
  // debug célra (route.ts "sources" mezője). Koordinátát vagy nyers
  // query-t SOSEM tartalmaz.
  errorCode?: string;
}

export interface DiscoverRestPointsResult {
  points: RestPoint[];
  searchRadiusMeters: number;
  expandedSearch: boolean;
  // true, ha LEGALÁBB egy forrás nem volt elérhető (de legalább egy igen,
  // vagy a lista egyébként is üres a hiányzó forrás miatt) — a UI ennek
  // alapján mutathatja a "néhány hely most nem tölthető be" üzenetet.
  partial: boolean;
  sources: {
    user: DiscoverySourceStatus;
    vedettSarok: DiscoverySourceStatus;
    osm: DiscoverySourceStatus;
  };
}

// STAGING HOTFIX (2026-09-09) — lásd a fenti "SUGÁR-BŐVÍTÉS" fejléc-
// kiegészítést. Csak ez a két hibaosztály számít elég tranziensnek ahhoz,
// hogy egy MÁSODIK (bővített sugarú) Overpass/DB-hívást érdemes legyen
// kockáztatni ugyanazon felhasználói művelet alatt — minden más
// hibaosztályon (és minden osztályozatlan hibán) a fallback kör
// SZÁNDÉKOSAN kihagyja az adott providert (konzervatív alapállás: "egy
// user action lehetőleg ne generáljon request stormot").
const RADIUS_EXPANSION_RETRYABLE_ERROR_CODES = new Set<string>(["timeout", "endpoint_unavailable"]);

function isWorthRetryingOnExpansion(status: DiscoverySourceStatus): boolean {
  if (status.ok) return true;
  return status.errorCode !== undefined && RADIUS_EXPANSION_RETRYABLE_ERROR_CODES.has(status.errorCode);
}

async function runProviders(
  providers: RestPointProvider[],
  params: FindNearbyParams
): Promise<{ points: RestPoint[]; sources: DiscoverRestPointsResult["sources"] }> {
  const sources: DiscoverRestPointsResult["sources"] = {
    user: { ok: false },
    vedettSarok: { ok: false },
    osm: { ok: false },
  };
  const points: RestPoint[] = [];

  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        const result = await provider.findNearby(params);
        return { name: provider.name, result };
      } catch (err) {
        // Ez elméletileg nem fordulhat elő (minden provider maga fogja a
        // hibát, lásd userProvider.ts/vedettSarokProvider.ts/
        // osmProvider.ts), de védelmi hálóként itt is elkapjuk, hogy egy
        // véletlenül nem kezelt kivétel se dönthesse romba a többi
        // provider eredményét.
        return {
          name: provider.name,
          result: {
            status: "unavailable" as const,
            reason: err instanceof Error ? err.message : "unknown_error",
            errorCode: "unknown_error" as const,
          },
        };
      }
    })
  );

  for (const { name, result } of results) {
    if (result.status === "ok") {
      sources[name] = { ok: true };
      points.push(...result.points);
    } else {
      sources[name] = { ok: false, reason: result.reason, errorCode: result.errorCode };
      vedettRouteLog("provider_error", "warn", { provider: name, reason: result.reason, errorCode: result.errorCode });
    }
  }

  return { points, sources };
}

export async function discoverRestPoints(params: DiscoverRestPointsParams): Promise<DiscoverRestPointsResult> {
  const providers = params.providers ?? (await loadDefaultProviders());
  const baseParams = { latitude: params.latitude, longitude: params.longitude, userId: params.userId };

  const firstPass = await runProviders(providers, {
    ...baseParams,
    radiusMeters: INITIAL_SEARCH_RADIUS_METERS,
  });
  let dedupedPoints = dedupeRestPoints(firstPass.points);
  let searchRadiusMeters = INITIAL_SEARCH_RADIUS_METERS;
  let expandedSearch = false;
  let sources = firstPass.sources;

  // Egyszeri, dokumentált sugár-bővítés — csak akkor, ha az ELSŐ kör
  // (dedupe utáni) nulla eredményt adott (spec 10. pont). STAGING HOTFIX
  // (2026-09-09): csak azokat a providereket hívjuk újra, amelyek
  // "érdemesek" rá (lásd isWorthRetryingOnExpansion fent) — ha egyik
  // provider sem érdemes rá (pl. mindegyik determinisztikus hibával
  // bukott), a bővített kör TELJES EGÉSZÉBEN kimarad: nincs második
  // hálózati hívás, és expandedSearch=false marad (őszintén jelezve, hogy
  // ténylegesen NEM történt bővített keresés).
  if (dedupedPoints.length === 0) {
    const providersToRetry = providers.filter((provider) => isWorthRetryingOnExpansion(firstPass.sources[provider.name]));
    if (providersToRetry.length > 0) {
      const secondPass = await runProviders(providersToRetry, {
        ...baseParams,
        radiusMeters: EXPANDED_SEARCH_RADIUS_METERS,
      });
      dedupedPoints = dedupeRestPoints(secondPass.points);
      searchRadiusMeters = EXPANDED_SEARCH_RADIUS_METERS;
      expandedSearch = true;
      // Csak az ÚJRA futtatott providerek státuszát cseréljük a második
      // kör eredményére — a kihagyott providerek diagnosztikai adata
      // (reason/errorCode) az ELSŐ körből marad, NEM íródik felül egy
      // "nem is próbáltuk" default értékkel.
      const retriedNames = new Set(providersToRetry.map((provider) => provider.name));
      sources = {
        user: retriedNames.has("user") ? secondPass.sources.user : firstPass.sources.user,
        vedettSarok: retriedNames.has("vedettSarok") ? secondPass.sources.vedettSarok : firstPass.sources.vedettSarok,
        osm: retriedNames.has("osm") ? secondPass.sources.osm : firstPass.sources.osm,
      };
    }
  }

  const partial = !sources.user.ok || !sources.vedettSarok.ok || !sources.osm.ok;

  // SZÁNDÉKOSAN NEM vágjuk itt MAX_REST_POINTS-ra: a dedupe utáni sorrend
  // nem relevancia szerinti (lásd dedupe.ts — forrás-prioritás szerint
  // rendez, nem távolság/pontszám szerint). A max-eredményszám korlátot a
  // hívó (route.ts) alkalmazza a rankRestPoints() FUTTATÁSA UTÁN, hogy a
  // megjelenő 10-15 pont ténylegesen a legjobban rangsorolt legyen, ne
  // csak "az első N, amit véletlenül találtunk" (spec 10. pont szelleme).
  return { points: dedupedPoints, searchRadiusMeters, expandedSearch, partial, sources };
}
