// Megosztott státusz-lekérdezés — ugyanazt a logikát használja az admin API
// végpont (app/api/admin/vedett-utvonal/status/route.ts) és az admin oldal
// (app/admin/vedett-utvonal/page.tsx, szerver komponensként, saját maga
// felé indított fetch nélkül).
//
// Fázis 2: a BKK mellett a MÁV (vasút) és MÁV/Volán (busz) providerek
// státusza is innen jön, valós adatból (nincs hardcoded "Hamarosan" többé
// ezekre — lásd providers/staticFileProvider.ts).

import { getTransitProvider } from "./providers/registry.ts";
import { isVedettRouteFeatureEnabled, getMotisBaseUrl, VEDETT_ROUTE_ACCESS_LEVEL } from "./config.ts";
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
    configured: boolean;
    reachable: boolean | null; // null = nem lett tesztelve (nincs konfigurálva)
    status: "configured" | "not_configured";
    dataImportedAt: string | null;
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

  const motisBaseUrl = getMotisBaseUrl();
  const motisConfigured = Boolean(motisBaseUrl);

  let motisReachable: boolean | null = null;
  if (motisBaseUrl) {
    try {
      const res = await fetch(`${motisBaseUrl}/api/v1/geocode?text=Budapest&numResults=1`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      motisReachable = res.ok;
    } catch {
      motisReachable = false;
    }
  }

  return {
    featureFlag: { enabled: isVedettRouteFeatureEnabled(), accessLevel: VEDETT_ROUTE_ACCESS_LEVEL },
    providers: { BKK: bkk, MAV_RAIL: mavRail, MAV_BUS: mavBus },
    routingEngine: {
      provider: "MOTIS",
      configured: motisConfigured,
      reachable: motisReachable,
      status: motisConfigured ? "configured" : "not_configured",
      dataImportedAt: process.env.VEDETT_MOTIS_DATA_IMPORTED_AT ?? null,
    },
    sensoryEngine: { version: "v1", availableFactors: 6, totalFactors: 8 },
  };
}
