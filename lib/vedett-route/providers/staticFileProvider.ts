// Statikus, admin-feltöltésen alapuló GTFS providerek (MÁV vasút, MÁV/Volán
// busz — Fázis 2). Ezek NEM rendelkeznek dokumentált, kulcsos OpenData API-val
// úgy, ahogy a BKK (lásd providers/bkk.ts) — a projekt tulajdonosa manuálisan
// szerzi be a GTFS zip-eket (pl. a MÁV/Volán nyilvános adatközzétételéből),
// és admin felületen tölti fel. Emiatt:
//
//   - nincs refreshStaticData() hálózati letöltés — helyette az admin tölt
//     fel egy zip-et (lásd app/api/admin/vedett-utvonal/gtfs-upload/route.ts,
//     ingestUploadedGtfsZip() ez a fájl);
//   - nincs GTFS-Realtime forrás — getServiceAlerts/getTripUpdates/
//     getVehiclePositions mindig üres tömböt ad, NEM kitalált adatot;
//   - checkConnection() itt azt jelenti: "van-e érvényes feltöltött statikus
//     GTFS", nem hálózati elérhetőséget.
//
// Amikor a MÁV/Volán később dokumentált, kulcsos GTFS-Realtime API-t
// biztosít, ez a provider lecserélhető/bővíthető anélkül, hogy a
// TransitProvider interfészt vagy a hívó kódot módosítani kellene.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import type {
  ProviderConnectionStatus,
  ServiceAlert,
  StaticGtfsStatus,
  TransitProvider,
  TransitProviderId,
  TripUpdate,
  VehiclePosition,
} from "../types.ts";
import { vedettRouteLog } from "../logger.ts";

// Egy GTFS static feed-nek ezeket a fájlokat KÖTELEZŐ tartalmaznia ahhoz,
// hogy a routing engine (majd) fel tudja dolgozni. (calendar_dates.txt,
// shapes.txt stb. opcionálisak, ezért nincsenek itt megkövetelve.)
const REQUIRED_GTFS_FILES = ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt"];

export interface GtfsUploadValidationResult {
  valid: boolean;
  missingFiles: string[];
  entryNames: string[];
  feedInfo?: { feedPublisherName?: string; feedStartDate?: string; feedEndDate?: string; feedVersion?: string };
}

function parseFeedInfo(csv: string): GtfsUploadValidationResult["feedInfo"] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return undefined;
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const values = lines[1].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
  const row: Record<string, string> = {};
  headers.forEach((h, i) => (row[h] = values[i] ?? ""));
  return {
    feedPublisherName: row.feed_publisher_name || undefined,
    feedStartDate: row.feed_start_date || undefined,
    feedEndDate: row.feed_end_date || undefined,
    feedVersion: row.feed_version || undefined,
  };
}

/**
 * Validálja egy feltöltött zip GTFS-struktúráját anélkül, hogy bármit
 * lemezre írna — a hívó (API route) dönt arról, hogy a validáció után
 * ténylegesen elmenti-e.
 */
export function validateGtfsZip(buffer: Buffer): GtfsUploadValidationResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return { valid: false, missingFiles: REQUIRED_GTFS_FILES, entryNames: [] };
  }

  const entryNames = zip.getEntries().map((e) => e.entryName);
  const missingFiles = REQUIRED_GTFS_FILES.filter((f) => !entryNames.includes(f));

  let feedInfo: GtfsUploadValidationResult["feedInfo"];
  const feedInfoEntry = zip.getEntry("feed_info.txt");
  if (feedInfoEntry) {
    try {
      feedInfo = parseFeedInfo(feedInfoEntry.getData().toString("utf-8"));
    } catch {
      // feed_info.txt opcionális GTFS fájl — hiánya/hibás formátuma nem
      // teszi érvénytelenné a feltöltést, csak a metaadat marad üres.
    }
  }

  return { valid: missingFiles.length === 0, missingFiles, entryNames, feedInfo };
}

function cacheDirFor(providerDirName: string): string {
  return path.join(process.cwd(), ".vedett-cache", "gtfs-static", providerDirName);
}

/**
 * Validált zip mentése a providerhez tartozó cache könyvtárba + meta.json.
 * Dobott hibát az API route 400-as válasszá alakítja.
 */
export async function ingestUploadedGtfsZip(
  providerDirName: string,
  buffer: Buffer
): Promise<StaticGtfsStatus & { validation: GtfsUploadValidationResult }> {
  const validation = validateGtfsZip(buffer);
  if (!validation.valid) {
    vedettRouteLog("malformed_response", "error", { provider: providerDirName, missingFiles: validation.missingFiles });
    throw new Error(
      `A feltöltött fájl nem tűnik érvényes GTFS statikus feednek — hiányzó fájlok: ${validation.missingFiles.join(", ")}.`
    );
  }

  const dir = cacheDirFor(providerDirName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "gtfs.zip"), buffer);
  const uploadedAt = new Date().toISOString();
  const meta = { uploadedAt, sizeBytes: buffer.byteLength, feedInfo: validation.feedInfo ?? null };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  vedettRouteLog("gtfs_static_refresh", "info", { provider: providerDirName, sizeBytes: buffer.byteLength, source: "admin_upload" });

  return { provider: providerDirName as TransitProviderId, available: true, lastUpdated: uploadedAt, feedVersion: validation.feedInfo?.feedVersion ?? null, validation };
}

export class StaticOnlyGtfsProvider implements TransitProvider {
  readonly id: TransitProviderId;
  private readonly providerDirName: string;
  private readonly displayName: string;

  constructor(id: TransitProviderId, providerDirName: string, displayName: string) {
    this.id = id;
    this.providerDirName = providerDirName;
    this.displayName = displayName;
  }

  async checkConnection(): Promise<ProviderConnectionStatus> {
    const status = await this.getStaticDataStatus();
    return {
      provider: this.id,
      configured: status.available,
      reachable: status.available,
      realtime: false,
      error: status.available
        ? undefined
        : `${this.displayName}: nincs feltöltött statikus GTFS (admin feltöltés szükséges).`,
    };
  }

  async getStaticDataStatus(): Promise<StaticGtfsStatus> {
    try {
      const meta = JSON.parse(await readFile(path.join(cacheDirFor(this.providerDirName), "meta.json"), "utf-8"));
      return {
        provider: this.id,
        available: true,
        lastUpdated: meta.uploadedAt ?? null,
        feedVersion: meta.feedInfo?.feedVersion ?? null,
      };
    } catch {
      return { provider: this.id, available: false, lastUpdated: null };
    }
  }

  async refreshStaticData(): Promise<StaticGtfsStatus> {
    throw new Error(
      `${this.displayName} esetén nincs automatikus, kulcsos GTFS letöltés — az admin tölti fel manuálisan a zip-et ` +
        `(POST /api/admin/vedett-utvonal/gtfs-upload). Lásd docs/vedett-route.md "Phase 2 – MÁV/Volán".`
    );
  }

  async getServiceAlerts(): Promise<ServiceAlert[]> {
    vedettRouteLog("provider_error", "info", { provider: this.id, reason: "no_realtime_source_documented" });
    return [];
  }

  async getTripUpdates(): Promise<TripUpdate[]> {
    return [];
  }

  async getVehiclePositions(): Promise<VehiclePosition[]> {
    return [];
  }
}
