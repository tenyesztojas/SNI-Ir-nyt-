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

import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
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
import { buildAccessibilityIndexFromGtfsZip, type AccessibilityIndex } from "../accessibilityIndex.ts";

// AKADÁLYMENTES / LÉPCSŐMENTES MVP — ACCESSIBILITY INDEX RUNTIME STORAGE
// DÖNTÉS (2026-09-11, Task C2, spec 4. pont)
//
// AUDIT: a jelenlegi architektúra a GTFS statikus feedet KÉTFÉLE helyen
// tartja: (1) a MOTIS routing motor a VPS-en, egy ETTŐL A NEXT.JS ALKALMAZÁSTÓL
// TELJESEN FÜGGETLEN, saját betöltési folyamaton keresztül (a route service
// mögött, lásd motisClient.ts fejléce — ez a repo NEM látja és NEM
// vezérli, hogyan/mikor tölti be a MOTIS a saját GTFS-ét); (2) ez a
// staticFileProvider.ts egy, az admin által feltöltött zip-et validál és
// tárol a Next.js app SAJÁT, helyi (`.vedett-cache/gtfs-static/<provider>/`)
// könyvtárában, KIZÁRÓLAG a Fázis 2 (MÁV/Volán) providerek számára —
// FONTOS: a BKK (a jelenlegi, egyetlen éles provider) esetén ez a
// feltöltési mechanizmus NINCS használatban productionben (a BKK saját,
// kulcsos GTFS-Realtime API-val rendelkezik, lásd providers/bkk.ts) — tehát
// jelenleg NINCS olyan, ebben a repóban élő, admin-feltöltött BKK GTFS zip,
// amiből ezt az indexet ma ténylegesen fel lehetne építeni productionben.
//
// DÖNTÉS: az accessibility index ÉPÍTÉSÉT és TÁROLÁSÁT UGYANIDE, a már
// meglévő providerenkénti cache-könyvtárba tesszük (`accessibility-index.json`
// a `gtfs.zip`/`meta.json` mellett) — ez a LEGKISEBB, a meglévő
// architektúrát követő módosítás, ami:
//   - Vercel runtime-on elérhető (ugyanaz a fájlrendszer-hozzáférés, amit a
//     meglévő getStaticDataStatus()/refreshStaticData() is használ — bár
//     FONTOS KORLÁT, lásd routeCache.ts hasonló megjegyzését: egy
//     szerverless/több-instance Vercel-környezetben a helyi fájlrendszer
//     NEM garantáltan perzisztens/megosztott a hívások között — ez a
//     KORLÁT MÁR MA IS fennáll a meglévő GTFS-cache mechanizmusra, ez a
//     kör nem vezet be új kockázatot, de nem is oldja fel a meglévőt);
//   - NEM parszol GTFS zip-et minden route requestnél — az index egyszer,
//     feltöltéskor (ingestUploadedGtfsZip) épül, utána a runtime csak a
//     kis JSON-t olvassa (lásd getAccessibilityIndex());
//   - ATOMIKUSAN cserélődik (temp fájlba írás + rename(), lásd lent) — egy
//     félbeszakadt írás SOHA nem hagy korrupt/részleges indexet olvasható
//     állapotban;
//   - a `generation` mező (a bemeneti zip TARTALMÁNAK SHA-256 hash-e,
//     lásd computeGtfsZipGeneration()) az INDEXET a BEMENETI ZIP-hez köti.
//
// NYITOTT, DOKUMENTÁLT BIZONYTALANSÁG (spec 21. pont — NE hamisíts
// szinkront): ez a `generation` KIZÁRÓLAG azt garantálja, hogy az index
// pontosan ehhez a Next.js app által tárolt zip-tartalomhoz tartozik — AZT
// NEM garantálja (és a jelenlegi repo/infrastruktúra alapján NEM
// dönthető el biztonságosan), hogy a MOTIS routing motor a VPS-en
// UGYANEZT a feed-generációt tölti-e be éppen. A MOTIS saját feed-frissítési
// folyamata ennek a Next.js alkalmazásnak NEM látható és NEM vezérelt
// felülete. Amíg ez a két rendszer (Next.js accessibility index vs. MOTIS
// routing feed) nem kap egy KÖZÖS, mindkét oldalról olvasható
// verzió-/generation-jelzőt (pl. egy megosztott feed-manifest fájl vagy
// egy közös adatbázis-tábla, amit MIND a MOTIS betöltő szkript, MIND ez az
// app frissít ugyanabból a forrás-zip-ből), az orchestrator.ts SOHA nem
// jelenít meg KNOWN_ACCESSIBLE eredményt PUSZTÁN azon az alapon, hogy "az
// index létezik" — a hard filter/klasszifikáció mindig a Journey-ben
// TÉNYLEGESEN szereplő MOTIS stopId/tripId ellenében fut, nem feltételezi
// előre, hogy a két feed egyezik.
function computeGtfsZipGeneration(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

function accessibilityIndexPath(providerDirName: string): string {
  return path.join(cacheDirFor(providerDirName), "accessibility-index.json");
}

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

export function cacheDirFor(providerDirName: string): string {
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

  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2) — "GTFS UPDATE
  // -> accessibility index rebuild -> atomic replacement" (spec 4. pont
  // preferált elve). Az index UGYANEBBŐL a már validált `buffer`-ből épül
  // (nem egy külön letöltésből/lekérdezésből), tehát BIZTOSAN ugyanahhoz a
  // feed-tartalomhoz tartozik, mint a most mentett gtfs.zip. Az írás
  // ATOMIKUS: egy egyedi nevű temp fájlba írunk, majd rename()-elünk a
  // végleges névre — a rename() ugyanazon a fájlrendszeren belül atomikus
  // (POSIX), így egy konkurens olvasó SOHA nem láthat részleges/korrupt
  // JSON-t. Az index-építés hibáját (pl. váratlanul hibás pathways.txt)
  // SOHA nem engedjük a feltöltés egészét elbuktatni — a GTFS zip maga már
  // validált és elmentve; egy accessibility-index hiba esetén a runtime
  // egyszerűen nem talál indexet (lásd getAccessibilityIndex() lent), ami
  // biztonságosan UNKNOWN-t eredményez MINDEN klasszifikációra, SOSEM
  // hibát vagy kitalált adatot.
  try {
    const generation = computeGtfsZipGeneration(buffer);
    const index = buildAccessibilityIndexFromGtfsZip(buffer, providerDirName as TransitProviderId, generation);
    const finalPath = accessibilityIndexPath(providerDirName);
    const tmpPath = path.join(dir, `accessibility-index.${randomUUID()}.tmp.json`);
    await writeFile(tmpPath, JSON.stringify(index));
    await rename(tmpPath, finalPath);
    vedettRouteLog("gtfs_static_refresh", "info", {
      provider: providerDirName,
      reason: "accessibility_index_rebuilt",
      generation,
      stopsCount: Object.keys(index.stopsById).length,
      tripsCount: Object.keys(index.tripsById).length,
      pathwaysCount: index.pathways.length,
    });
  } catch (err) {
    vedettRouteLog("malformed_response", "error", {
      provider: providerDirName,
      reason: "accessibility_index_build_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { provider: providerDirName as TransitProviderId, available: true, lastUpdated: uploadedAt, feedVersion: validation.feedInfo?.feedVersion ?? null, validation };
}

/**
 * A jelenleg tárolt accessibility index betöltése egy providerhez —
 * SOSEM dob hibát: hiányzó/korrupt/olvashatatlan index esetén `null`-t ad,
 * amit a hívó (orchestrator.ts) úgy kezel, mintha nem lenne semmilyen
 * accessibility adat (minden klasszifikáció UNKNOWN-ra esik vissza).
 */
export async function getAccessibilityIndex(providerDirName: string): Promise<AccessibilityIndex | null> {
  try {
    const raw = await readFile(accessibilityIndexPath(providerDirName), "utf-8");
    const parsed = JSON.parse(raw) as AccessibilityIndex;
    if (!parsed || typeof parsed !== "object" || !parsed.stopsById || !parsed.tripsById || !Array.isArray(parsed.pathways)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
