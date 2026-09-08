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
          result: { status: "unavailable" as const, reason: err instanceof Error ? err.message : "unknown_error" },
        };
      }
    })
  );

  for (const { name, result } of results) {
    if (result.status === "ok") {
      sources[name] = { ok: true };
      points.push(...result.points);
    } else {
      sources[name] = { ok: false, reason: result.reason };
      vedettRouteLog("provider_error", "warn", { provider: name, reason: result.reason });
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
  // (dedupe utáni) nulla eredményt adott (spec 10. pont).
  if (dedupedPoints.length === 0) {
    const secondPass = await runProviders(providers, {
      ...baseParams,
      radiusMeters: EXPANDED_SEARCH_RADIUS_METERS,
    });
    dedupedPoints = dedupeRestPoints(secondPass.points);
    searchRadiusMeters = EXPANDED_SEARCH_RADIUS_METERS;
    expandedSearch = true;
    sources = secondPass.sources;
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
