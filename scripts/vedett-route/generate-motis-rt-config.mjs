#!/usr/bin/env node
/**
 * generate-motis-rt-config.mjs
 *
 * Runtime generator for motis-data/config.yml's GTFS-Realtime wiring.
 *
 * WHY THIS EXISTS (spec section 3):
 *   BKK expects the API key as a `key` query-string parameter, not as an
 *   HTTP header. MOTIS's `rt:` config entries only support a plain `url`
 *   (+ optional headers), so the key must be embedded directly into the
 *   URL string. That means the key MUST NEVER be committed to git.
 *   motis-data/ is already gitignored (see .gitignore), so writing the
 *   generated config there is git-safe by directory location. This
 *   script additionally never prints the raw key to the terminal.
 *
 * WHAT IT DOES:
 *   1. Loads BKK_API_KEY from .env.local (reusing the project's existing
 *      manual-parse pattern, same as scripts/vedett-route/route-matrix-test.mjs).
 *   2. Aborts with a clear, non-key-leaking Hungarian error if the key is
 *      missing or empty.
 *   3. Reads motis-data/config.yml with js-yaml.
 *   4. Sets timetable.update_interval = 15 (spec section 4: poll every 15s,
 *      never more often than every 5s).
 *   5. Builds the 3 official BKK GTFS-RT `rt:` entries (TripUpdates,
 *      VehiclePositions, Alerts) under timetable.datasets.bkkgtfs.rt,
 *      each as { url: "<official BKK URL>?key=<KEY>", protocol: "gtfsrt" }.
 *   6. Backs up the original config file (config.yml.bak, gitignored dir).
 *   7. Writes the updated config back to motis-data/config.yml.
 *   8. Prints a REDACTED confirmation (?key=*** everywhere) — never the
 *      raw key, never the full URL with the real key.
 *
 * USAGE:
 *   node scripts/vedett-route/generate-motis-rt-config.mjs
 *
 * After running this, restart MOTIS so it picks up the new config.
 */

import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

// ---------------------------------------------------------------------------
// .env.local loader — copied verbatim from the established project pattern
// (scripts/vedett-route/route-matrix-test.mjs) so behavior stays consistent.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Official BKK GTFS-Realtime endpoints (spec section 1). Do not change these
// without re-confirming against BKK's official OpenData documentation.
// ---------------------------------------------------------------------------
const BKK_GTFS_RT_ENDPOINTS = {
  TripUpdates: "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb",
  VehiclePositions: "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/VehiclePositions.pb",
  Alerts: "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/Alerts.pb",
};

// Spec section 4: poll every 15s. Never allow a config that would poll BKK
// more often than every 5s.
const REALTIME_UPDATE_INTERVAL_SECONDS = 15;
const MIN_ALLOWED_UPDATE_INTERVAL_SECONDS = 5;

const CONFIG_PATH = path.join(process.cwd(), "motis-data", "config.yml");
const BACKUP_PATH = path.join(process.cwd(), "motis-data", "config.yml.bak");

/** Never print a URL containing the raw key. Always redact before logging. */
function redactKey(url) {
  return url.replace(/([?&]key=)[^&]*/i, "$1***");
}

function fail(message) {
  console.error(`\n[generate-motis-rt-config] HIBA: ${message}\n`);
  process.exit(1);
}

function main() {
  const apiKey = process.env.BKK_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    fail(
      "A BKK_API_KEY környezeti változó nincs beállítva (.env.local). " +
        "A realtime konfiguráció generálása leáll. A statikus routing ettől " +
        "függetlenül működik tovább, ha a MOTIS a régi (rt: nélküli) " +
        "config.yml-lel fut."
    );
  }
  const key = apiKey.trim();

  if (!fs.existsSync(CONFIG_PATH)) {
    fail(`Nem található a motis-data/config.yml fájl (${CONFIG_PATH}).`);
  }

  const rawConfig = fs.readFileSync(CONFIG_PATH, "utf-8");
  let config;
  try {
    config = yaml.load(rawConfig);
  } catch (err) {
    fail(`A config.yml nem valid YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!config || typeof config !== "object") {
    fail("A config.yml tartalma üres vagy nem objektum.");
  }
  if (!config.timetable || typeof config.timetable !== "object") {
    fail("A config.yml-ben hiányzik a 'timetable' szekció.");
  }
  if (
    !config.timetable.datasets ||
    typeof config.timetable.datasets !== "object" ||
    !config.timetable.datasets.bkkgtfs
  ) {
    fail("A config.yml-ben hiányzik a 'timetable.datasets.bkkgtfs' szekció.");
  }

  // Backup the original before mutating.
  fs.writeFileSync(BACKUP_PATH, rawConfig, "utf-8");

  // Spec section 4: set polling interval to 15s (never below 5s).
  const desiredInterval = Math.max(
    REALTIME_UPDATE_INTERVAL_SECONDS,
    MIN_ALLOWED_UPDATE_INTERVAL_SECONDS
  );
  config.timetable.update_interval = desiredInterval;

  // Spec sections 1-2: build the rt: entries with the key embedded in the
  // URL (BKK expects it as a query param, not a header), protocol explicit.
  const rtEntries = Object.entries(BKK_GTFS_RT_ENDPOINTS).map(([feedName, baseUrl]) => ({
    url: `${baseUrl}?key=${encodeURIComponent(key)}`,
    protocol: "gtfsrt",
    __feedName: feedName, // stripped before write; kept only for redacted logging below
  }));

  const rtEntriesForLog = rtEntries.map((e) => ({
    feed: e.__feedName,
    url: redactKey(e.url),
    protocol: e.protocol,
  }));

  const rtEntriesForConfig = rtEntries.map(({ url, protocol }) => ({ url, protocol }));
  config.timetable.datasets.bkkgtfs.rt = rtEntriesForConfig;

  const updatedYaml = yaml.dump(config, { lineWidth: -1 });
  fs.writeFileSync(CONFIG_PATH, updatedYaml, "utf-8");

  console.log("\n[generate-motis-rt-config] KÉSZ.");
  console.log(`  Backup mentve: ${path.relative(process.cwd(), BACKUP_PATH)}`);
  console.log(`  Frissítve: ${path.relative(process.cwd(), CONFIG_PATH)}`);
  console.log(`  timetable.update_interval = ${desiredInterval} (mp)`);
  console.log("  Hozzáadott realtime feedek (kulcs redaktálva):");
  for (const entry of rtEntriesForLog) {
    console.log(`    - ${entry.feed}: ${entry.url} (protocol: ${entry.protocol})`);
  }
  console.log(
    "\n  A valódi API kulcs SOHA nem került kiírásra. A generált config.yml git-ignorált " +
      "(lásd .gitignore: /motis-data).\n" +
      "  Indítsd újra a MOTIS-t, hogy a config változás életbe lépjen.\n"
  );
}

main();
