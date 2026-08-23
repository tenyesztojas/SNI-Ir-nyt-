// BKK Transit Provider — a TransitProvider interfész BKK OpenData megvalósítása.
//
// Dokumentált, hivatalos végpontok (opendata.bkk.hu / go.bkk.hu, "key"
// query paraméteres authentikáció):
//   statikus GTFS:     https://go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip
//   TripUpdates:       https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb
//   VehiclePositions:  https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/VehiclePositions.pb
//   ServiceAlerts:     https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/Alerts.pb
//
// NEM scrape-elünk semmit (BudapestGO-t sem) — kizárólag ezeket a
// dokumentált OpenData végpontokat használjuk, GTFS / GTFS-Realtime
// formátumban (protobuf, a hivatalos `gtfs-realtime-bindings` csomaggal
// dekódolva).
//
// A BKK_API_KEY-t KIZÁRÓLAG itt, szerver oldalon olvassuk process.env-ből.
// Sosem kerül vissza response body-ba, sosem logoljuk.

import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import path from "node:path";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type {
  ProviderConnectionStatus,
  ServiceAlert,
  StaticGtfsStatus,
  TransitProvider,
  TripUpdate,
  VehiclePosition,
} from "../types.ts";
import { isBkkApiKeyConfigured, VEDETT_ROUTE_CACHE } from "../config.ts";
import { vedettRouteLog } from "../logger.ts";

const BKK_STATIC_GTFS_URL = "https://go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip";
const BKK_GTFS_RT_BASE = "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full";

// A statikus GTFS cache-t a projekt gyökerén kívül, egy git-ignorált
// könyvtárban tároljuk (lásd .gitignore: "/.vedett-cache"), hogy sose
// kerülhessen véletlenül commitba egy több tíz MB-os bináris fájl.
const CACHE_DIR = path.join(process.cwd(), ".vedett-cache", "gtfs-static", "bkk");
const CACHE_ZIP_PATH = path.join(CACHE_DIR, "budapest_gtfs.zip");
const CACHE_META_PATH = path.join(CACHE_DIR, "meta.json");

function withKey(url: string): string {
  const key = process.env.BKK_API_KEY;
  return `${url}?key=${encodeURIComponent(key ?? "")}`;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGtfsRtFeed(feedName: "TripUpdates" | "VehiclePositions" | "Alerts") {
  if (!isBkkApiKeyConfigured()) {
    throw new Error("BKK_API_KEY nincs konfigurálva.");
  }
  const url = withKey(`${BKK_GTFS_RT_BASE}/${feedName}.pb`);
  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    vedettRouteLog("timeout", "error", { feed: feedName });
    throw new Error(`BKK ${feedName} feed timeout vagy hálózati hiba.`);
  }
  if (!res.ok) {
    vedettRouteLog("provider_error", "error", { feed: feedName, status: res.status });
    throw new Error(`BKK ${feedName} feed HTTP ${res.status}.`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  try {
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
  } catch (err) {
    vedettRouteLog("malformed_response", "error", { feed: feedName });
    throw new Error(`BKK ${feedName} feed nem dekódolható (malformed protobuf).`);
  }
}

export class BkkProvider implements TransitProvider {
  readonly id = "BKK" as const;

  async checkConnection(): Promise<ProviderConnectionStatus> {
    const configured = isBkkApiKeyConfigured();
    if (!configured) {
      return { provider: "BKK", configured: false, reachable: false, realtime: false, error: "BKK_API_KEY nincs beállítva." };
    }

    try {
      const feed = await fetchGtfsRtFeed("Alerts");
      vedettRouteLog("connection_test", "info", { provider: "BKK", ok: true });
      return { provider: "BKK", configured: true, reachable: true, realtime: Array.isArray(feed.entity) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ismeretlen hiba.";
      vedettRouteLog("connection_test", "error", { provider: "BKK", ok: false, message });
      return { provider: "BKK", configured: true, reachable: false, realtime: false, error: message };
    }
  }

  async getStaticDataStatus(): Promise<StaticGtfsStatus> {
    try {
      const meta = JSON.parse(await readFile(CACHE_META_PATH, "utf-8"));
      return { provider: "BKK", available: true, lastUpdated: meta.downloadedAt ?? null, feedVersion: meta.feedVersion ?? null };
    } catch {
      return { provider: "BKK", available: false, lastUpdated: null };
    }
  }

  async refreshStaticData(): Promise<StaticGtfsStatus> {
    if (!isBkkApiKeyConfigured()) {
      // A dokumentált statikus GTFS letöltés nem feltétlenül igényel kulcsot,
      // de a projekt konvenciója szerint minden BKK hívás a konfigurált
      // kulcson keresztül megy, hogy egységes legyen a rate-limit kezelés.
      vedettRouteLog("gtfs_static_refresh", "warn", { reason: "no_api_key" });
    }
    await mkdir(CACHE_DIR, { recursive: true });
    let res: Response;
    try {
      res = await fetchWithTimeout(BKK_STATIC_GTFS_URL, 30_000);
    } catch (err) {
      vedettRouteLog("gtfs_static_refresh", "error", { reason: "network_error" });
      throw new Error("A statikus GTFS letöltése sikertelen (hálózati hiba vagy timeout).");
    }
    if (!res.ok) {
      vedettRouteLog("gtfs_static_refresh", "error", { status: res.status });
      throw new Error(`A statikus GTFS letöltése sikertelen (HTTP ${res.status}).`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(CACHE_ZIP_PATH, buffer);
    const downloadedAt = new Date().toISOString();
    await writeFile(CACHE_META_PATH, JSON.stringify({ downloadedAt, sizeBytes: buffer.byteLength }, null, 2));
    vedettRouteLog("gtfs_static_refresh", "info", { sizeBytes: buffer.byteLength });
    return { provider: "BKK", available: true, lastUpdated: downloadedAt };
  }

  async getServiceAlerts(): Promise<ServiceAlert[]> {
    const feed = await fetchGtfsRtFeed("Alerts");
    return (feed.entity ?? [])
      .filter((e) => e.alert)
      .map((e) => {
        const alert = e.alert!;
        const header = alert.headerText?.translation?.[0]?.text ?? "Riasztás";
        const description = alert.descriptionText?.translation?.[0]?.text;
        return {
          id: e.id ?? header,
          header,
          description,
          severity:
            alert.severityLevel === 3 ? "severe" : alert.severityLevel === 2 ? "warning" : "info",
          affectedRouteIds: (alert.informedEntity ?? []).map((ie) => ie.routeId).filter((x): x is string => Boolean(x)),
          affectedStopIds: (alert.informedEntity ?? []).map((ie) => ie.stopId).filter((x): x is string => Boolean(x)),
          url: alert.url?.translation?.[0]?.text,
        } satisfies ServiceAlert;
      });
  }

  async getTripUpdates(): Promise<TripUpdate[]> {
    const feed = await fetchGtfsRtFeed("TripUpdates");
    return (feed.entity ?? [])
      .filter((e) => e.tripUpdate)
      .map((e) => {
        const tu = e.tripUpdate!;
        const firstStopUpdate = tu.stopTimeUpdate?.[0];
        const delaySeconds =
          firstStopUpdate?.arrival?.delay ?? firstStopUpdate?.departure?.delay ?? undefined;
        return {
          tripId: tu.trip?.tripId ?? e.id ?? "unknown",
          routeId: tu.trip?.routeId ?? undefined,
          delayMinutes: typeof delaySeconds === "number" ? Math.round(delaySeconds / 60) : undefined,
          cancelled: tu.trip?.scheduleRelationship === 3, // CANCELED
        } satisfies TripUpdate;
      });
  }

  async getVehiclePositions(): Promise<VehiclePosition[]> {
    const feed = await fetchGtfsRtFeed("VehiclePositions");
    return (feed.entity ?? [])
      .filter((e) => e.vehicle?.position)
      .map((e) => {
        const v = e.vehicle!;
        return {
          vehicleId: v.vehicle?.id ?? e.id ?? "unknown",
          tripId: v.trip?.tripId ?? undefined,
          routeId: v.trip?.routeId ?? undefined,
          latitude: v.position!.latitude!,
          longitude: v.position!.longitude!,
          bearing: v.position?.bearing ?? undefined,
          timestamp: v.timestamp ? new Date(Number(v.timestamp) * 1000).toISOString() : undefined,
        } satisfies VehiclePosition;
      });
  }
}
