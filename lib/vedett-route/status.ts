// Megosztott státusz-lekérdezés — ugyanazt a logikát használja az admin API
// végpont (app/api/admin/vedett-utvonal/status/route.ts) és az admin oldal
// (app/admin/vedett-utvonal/page.tsx, szerver komponensként, saját maga
// felé indított fetch nélkül).
//
// Fázis 2: a BKK mellett a MÁV (vasút) és MÁV/Volán (busz) providerek
// státusza is innen jön, valós adatból (nincs hardcoded "Hamarosan" többé
// ezekre — lásd providers/staticFileProvider.ts).

import { getTransitProvider } from "./providers/registry.ts";
import { isVedettRouteFeatureEnabled, getRouteServiceConfig, getLegacyDirectMotisBaseUrl, VEDETT_ROUTE_ACCESS_LEVEL } from "./config.ts";
import type { ProviderConnectionStatus, StaticGtfsStatus, TransitProviderId } from "./types.ts";

export interface ProviderStatusEntry {
  connection: ProviderConnectionStatus;
  staticData: StaticGtfsStatus;
}

export interface VedettRouteStatus {
  featureFlag: { enabled: boolean; accessLevel: string };
  providers: Record<TransitProviderId, ProviderStatusEntry>;
  routingEngine: {
    provider: "MOTIS";
    // "route_service" = az éles, VPS-en futó HTTPS route service-en
    // keresztül (production/staging útvonal). "legacy_direct" = fejlesztői
    // gépen, közvetlen MOTIS_BASE_URL (SOHA production-ben, lásd config.ts
    // getLegacyDirectMotisBaseUrl()). "unconfigured" = egyik sincs
    // beállítva, a routing fail closed módon nem elérhető.
    mode: "route_service" | "legacy_direct" | "unconfigured";
    configured: boolean;
    reachable: boolean | null; // null = nem lett tesztelve (nincs konfigurálva)
    status: "configured" | "not_configured";
    dataImportedAt: string | null;
    // A route service /api/v1/health válaszából — CSAK akkor van kitöltve,
    // ha mode === "route_service" ÉS a health hívás sikeres volt. Soha nem
    // tartalmaz secretet vagy MOTIS belső URL-t.
    realtimeIngest: boolean | null;
    gbfs: boolean | null;
  };
  sensoryEngine: { version: "v1"; availableFactors: number; totalFactors: number };
}

async function getProviderStatus(id: TransitProviderId): Promise<ProviderStatusEntry> {
  const provider = getTransitProvider(id);
  if (!provider) {
    return {
      connection: { provider: id, configured: false, reachable: false, realtime: false, error: "Provider nincs regisztrálva." },
      staticData: { provider: id, available: false, lastUpdated: null },
    };
  }
  const [connection, staticData] = await Promise.all([provider.checkConnection(), provider.getStaticDataStatus()]);
  return { connection, staticData };
}

export async function getVedettRouteStatus(): Promise<VedettRouteStatus> {
  const [bkk, mavRail, mavBus] = await Promise.all([
    getProviderStatus("BKK"),
    getProviderStatus("MAV_RAIL"),
    getProviderStatus("MAV_BUS"),
  ]);

  const routeService = getRouteServiceConfig();
  const legacyBaseUrl = getLegacyDirectMotisBaseUrl();

  let mode: "route_service" | "legacy_direct" | "unconfigured" = "unconfigured";
  let reachable: boolean | null = null;
  let realtimeIngest: boolean | null = null;
  let gbfs: boolean | null = null;

  if (routeService) {
    mode = "route_service";
    try {
      // A route service /api/v1/health végpontja — ugyanaz, amit a VPS-en
      // ténylegesen ellenőriztünk élesben ({"rt":true,"gbfs":false}). Auth
      // fejléccel hívjuk, mert a route service minden kérést authentikál.
      const res = await fetch(`${routeService.baseUrl}/api/v1/health`, {
        headers: { Authorization: `Bearer ${routeService.authToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      reachable = res.ok;
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { rt?: boolean; gbfs?: boolean } | null;
        realtimeIngest = typeof body?.rt === "boolean" ? body.rt : null;
        gbfs = typeof body?.gbfs === "boolean" ? body.gbfs : null;
      }
    } catch {
      reachable = false;
    }
  } else if (legacyBaseUrl) {
    mode = "legacy_direct";
    try {
      const res = await fetch(`${legacyBaseUrl}/api/v1/geocode?text=Budapest&numResults=1`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
  }

  const configured = mode !== "unconfigured";

  return {
    featureFlag: { enabled: isVedettRouteFeatureEnabled(), accessLevel: VEDETT_ROUTE_ACCESS_LEVEL },
    providers: { BKK: bkk, MAV_RAIL: mavRail, MAV_BUS: mavBus },
    routingEngine: {
      provider: "MOTIS",
      mode,
      configured,
      reachable,
      status: configured ? "configured" : "not_configured",
      dataImportedAt: process.env.VEDETT_MOTIS_DATA_IMPORTED_AT ?? null,
      realtimeIngest,
      gbfs,
    },
    sensoryEngine: { version: "v1", availableFactors: 6, totalFactors: 8 },
  };
}
