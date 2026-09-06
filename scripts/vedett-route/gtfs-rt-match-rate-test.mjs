#!/usr/bin/env node
/**
 * gtfs-rt-match-rate-test.mjs
 *
 * BKK Realtime integráció — 6. pont (KRITIKUS): "Statikus <-> Realtime
 * párosítás". Nem elég, hogy a protobuf letöltődik — bizonyítani kell,
 * hogy a BKK TripUpdates feedben szereplő trip_id-k ténylegesen szerepelnek
 * a MOTIS-ba importált statikus BKK GTFS-ben (motis-data/gtfs/bkk_gtfs.zip
 * — EZ a fájl van ténylegesen importálva a MOTIS-ba, nem a
 * .vedett-cache-beli admin-letöltés, ami külön útvonalon frissülhet).
 *
 * Méri:
 *   - TripUpdates entity szám
 *   - Matched trips (a feedben szereplő trip_id megvan a static trips.txt-ben)
 *   - Unmatched trips (nincs meg)
 *   - Match ratio (matched / total)
 *
 * Ha a match ratio alacsony, néhány gyors diagnosztikai jelzést ad:
 *   - Régi statikus GTFS (import dátuma, VEDETT_MOTIS_DATA_IMPORTED_AT)
 *   - trip_id formátum-eltérés (pl. dataset-prefix a MOTIS-ban, mint
 *     "bkkgtfs_<trip_id>", ami NEM egyezne a nyers BKK trip_id-vel)
 *   - Service date probléma (a feed "ma" trip-jeit adja, a static viszont
 *     minden napra tartalmazza — ez nem okozhat trip_id eltérést, csak
 *     akkor releváns, ha a trip_id maga tartalmaz naptári infót)
 *
 * FUTTATÁS:
 *   node scripts/vedett-route/gtfs-rt-match-rate-test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const STATIC_GTFS_PATH = path.join(process.cwd(), "motis-data", "gtfs", "bkk_gtfs.zip");
const BKK_GTFS_RT_BASE = "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full";

function parseTripIdsFromTripsTxt(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return new Set();
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const tripIdIdx = header.indexOf("trip_id");
  if (tripIdIdx === -1) {
    throw new Error("A trips.txt nem tartalmaz 'trip_id' oszlopot.");
  }
  const ids = new Set();
  for (let i = 1; i < lines.length; i++) {
    // Egyszerű, idézőjel-tudatos CSV-split (a BKK trips.txt nem tartalmaz
    // beágyazott vesszőt idézőjelen belül a trip_id mezőben, de a biztonság
    // kedvéért egy minimális parsert használunk).
    const cols = lines[i].split(",");
    const raw = cols[tripIdIdx];
    if (raw !== undefined) {
      ids.add(raw.trim().replace(/^"|"$/g, ""));
    }
  }
  return ids;
}

async function main() {
  console.log("\n=== BKK Statikus <-> Realtime trip_id párosítási arány teszt ===\n");

  if (!fs.existsSync(STATIC_GTFS_PATH)) {
    console.error(`HIBA: nem található a statikus GTFS: ${STATIC_GTFS_PATH}`);
    console.error("A MOTIS-ba importált GTFS zip nélkül a match rate nem számolható.");
    process.exit(1);
  }
  const staticStat = fs.statSync(STATIC_GTFS_PATH);
  const staticAgeHours = Math.round((Date.now() - staticStat.mtimeMs) / 3600000);
  console.log(`Statikus GTFS fájl: ${STATIC_GTFS_PATH}`);
  console.log(`  Módosítva: ${staticStat.mtime.toISOString()} (${staticAgeHours} órája)`);

  let tripIds;
  try {
    const zip = new AdmZip(STATIC_GTFS_PATH);
    const entry = zip.getEntry("trips.txt");
    if (!entry) throw new Error("A zip nem tartalmaz trips.txt fájlt.");
    const csvText = entry.getData().toString("utf-8");
    tripIds = parseTripIdsFromTripsTxt(csvText);
  } catch (err) {
    console.error(`HIBA a statikus GTFS trips.txt beolvasásakor: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log(`  Egyedi trip_id-k száma a static GTFS-ben: ${tripIds.size}`);

  const apiKey = process.env.BKK_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("\nHIBA: BKK_API_KEY nincs beállítva (.env.local). A TripUpdates feed nem kérhető le.");
    process.exit(1);
  }

  const url = `${BKK_GTFS_RT_BASE}/TripUpdates.pb?key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    res = await fetch(url, { signal: controller.signal, cache: "no-store" }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.error(`\nHIBA: TripUpdates feed nem elérhető: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`\nHIBA: TripUpdates feed HTTP ${res.status}`);
    process.exit(1);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const feedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

  const rtTripIds = [];
  for (const entity of feedMessage.entity ?? []) {
    const tripId = entity.tripUpdate?.trip?.tripId;
    if (tripId) rtTripIds.push(tripId);
  }
  const uniqueRtTripIds = Array.from(new Set(rtTripIds));

  console.log(`\nTripUpdates entity szám (összes):     ${feedMessage.entity?.length ?? 0}`);
  console.log(`TripUpdates egyedi trip_id-k száma:    ${uniqueRtTripIds.length}`);

  const matched = uniqueRtTripIds.filter((id) => tripIds.has(id));
  const unmatched = uniqueRtTripIds.filter((id) => !tripIds.has(id));
  const ratio = uniqueRtTripIds.length > 0 ? matched.length / uniqueRtTripIds.length : 0;

  console.log(`\nMatched trips:   ${matched.length}`);
  console.log(`Unmatched trips: ${unmatched.length}`);
  console.log(`Match ratio:     ${(ratio * 100).toFixed(1)}%`);

  if (unmatched.length > 0) {
    console.log(`\nPélda unmatched trip_id-k (max 5): ${unmatched.slice(0, 5).join(", ")}`);
  }
  if (matched.length > 0) {
    console.log(`Példa matched trip_id-k (max 5):   ${matched.slice(0, 5).join(", ")}`);
  }

  if (ratio < 0.5) {
    console.log("\n--- DIAGNOSZTIKAI JAVASLATOK (alacsony match ratio) ---");
    console.log(`  - A statikus GTFS ${staticAgeHours} órája lett módosítva — ha ez sokkal régebbi,`);
    console.log("    mint a BKK jelenlegi GTFS kiadása, az elavult statikus adat lehet az ok.");
    console.log("  - Ellenőrizd, hogy a MOTIS a trip_id-t dataset-prefixel importálja-e");
    console.log("    (pl. 'bkkgtfs_<trip_id>') — ez a match rate számolást NEM érinti (itt");
    console.log("    a nyers static trips.txt-t és a nyers RT trip_id-t hasonlítjuk össze),");
    console.log("    de a MOTIS realtime_routing_test.mjs eredményét igen, ha ott is előjön.");
    console.log("  - Lehetséges BKK GTFS-RT kiterjesztés-kompatibilitási eltérés (pl. a BKK");
    console.log("    trip_id-i service date-del kiegészítve jönnek a realtime feedben).");
  }

  console.log(`\nBKK STATIC/RT MATCH RATE TESZT: ${ratio >= 0.5 ? "PASS" : "FAIL"} (küszöb: 50%)\n`);
  process.exit(ratio >= 0.5 ? 0 : 1);
}

main();
