// Megosztott státusz-lekérdezés — ugyanazt a logikát használja az admin API
// végpont (app/api/admin/vedett-utvonal/status/route.ts) és az admin oldal
// (app/admin/vedett-utvonal/page.tsx, szerver komponensként, saját maga
// felé indított fetch nélkül).

import { getTransitProvider } from "./providers/registry.ts";
import { isVedettRouteFeatureEnabled, getMotisBaseUrl, VEDETT_ROUTE_ACCESS_LEVEL } from "./config.ts";
import type { ProviderConnectionStatus, StaticGtfsStatus } from "./types.ts";

export interface VedettRouteStatus {
  featureFlag: { enabled: boolean; accessLevel: string };
  bkk: { api: ProviderConnectionStatus | { configured: boolean; reachable: boolean; realtime: boolean }; gtfsStatic: StaticGtfsStatus | { available: boolean; lastUpdated: null } };
  routingEngine: { provider: "MOTIS"; configured: boolean; status: "configured" | "not_configured" };
  upcoming: { mavRail: string; mavBus: string; sensoryEngine: string };
}

export async function getVedettRouteStatus(): Promise<VedettRouteStatus> {
  const bkk = getTransitProvider("BKK");
  const [connection, staticStatus] = await Promise.all([
    bkk ? bkk.checkConnection() : Promise.resolve({ configured: false, reachable: false, realtime: false }),
    bkk ? bkk.getStaticDataStatus() : Promise.resolve({ available: false, lastUpdated: null }),
  ]);

  const motisConfigured = Boolean(getMotisBaseUrl());

  return {
    featureFlag: { enabled: isVedettRouteFeatureEnabled(), accessLevel: VEDETT_ROUTE_ACCESS_LEVEL },
    bkk: { api: connection, gtfsStatic: staticStatus },
    routingEngine: { provider: "MOTIS", configured: motisConfigured, status: motisConfigured ? "configured" : "not_configured" },
    upcoming: { mavRail: "Hamarosan", mavBus: "Hamarosan", sensoryEngine: "Hamarosan" },
  };
}
