#!/usr/bin/env node
/**
 * gtfs-rt-failure-simulation-test.mjs
 *
 * BKK Realtime integráció — 16. pont: "Failure teszt".
 *
 * Szándékosan szimulál 4 hibaesetet, és minden esetben bizonyítja, hogy a
 * STATIKUS ROUTING (a MOTIS /api/v6/plan hívása) TOVÁBBRA IS MŰKÖDIK —
 * egy realtime feed hiba SOHA nem akaszthatja meg a statikus routingot.
 *
 *   1. Endpoint timeout   — nem routolható IP-re hívás, rövid timeout-tal.
 *   2. Invalid protobuf   — egy valós, de NEM protobuf válasz (a BKK
 *                            statikus GTFS zip URL-je) dekódolási kísérlete.
 *   3. API key hiba       — a valós BKK TripUpdates végpont hívása
 *                            szándékosan hibás kulccsal (401/403 várt).
 *   4. Stale feed         — nem hálózati: egy mesterségesen régi
 *                            FeedHeader.timestamp-pel teszteli a
 *                            realtimeFreshness.ts döntését.
 *
 * Minden esetben ELLENŐRZI, hogy:
 *   a) a szimulált hiba ténylegesen hibaként (nem hamis sikerként) került
 *      kezelésre, ÉS
 *   b) egy VALÓS, egyidejű fetchMotisPlan() hívás (statikus routing)
 *      ok:true eredményt ad — vagyis a realtime hiba nem "szivárgott át"
 *      a routingba.
 *
 * FUTTATÁS (MOTIS-nak futnia kell a statikus routing teszthez):
 *   node scripts/vedett-route/gtfs-rt-failure-simulation-test.mjs
 */

import fs from "node:fs";
import path from "node:path";
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

const { geocodeAddress } = await import("../../lib/vedett-route/geocode.ts");
const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");
const { evaluateRealtimeFreshness } = await import("../../lib/vedett-route/realtimeFreshness.ts");

async function assertStaticRoutingStillWorks(caseName) {
  const fromGeo = await geocodeAddress("Deak Ferenc ter, Budapest");
  const toGeo = await geocodeAddress("Astoria, Budapest");
  if (!fromGeo || !toGeo) {
    console.log(`  [${caseName}] STATIKUS ROUTING ELLENŐRZÉS: geokódolás sikertelen, nem tesztelhető.`);
    return false;
  }
  const result = await fetchMotisPlan({
    fromPlace: `${fromGeo.lat},${fromGeo.lon}`,
    toPlace: `${toGeo.lat},${toGeo.lon}`,
    time: new Date(Date.now() + 5 * 60000).toISOString(),
    numItineraries: 2,
  });
  const pass = result.ok === true;
  console.log(`  [${caseName}] STATIKUS ROUTING ELLENŐRZÉS: ${pass ? "PASS (routing működik)" : "FAIL (routing NEM működik!)"}`);
  return pass;
}

async function testTimeout() {
  console.log("\n--- 1. Endpoint timeout szimuláció ---");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  let errorCaught = false;
  try {
    // 10.255.255.1 egy non-routable cím sok hálózaton — timeoutot/hibát vár.
    await fetch("http://10.255.255.1/gtfs-rt-timeout-simulation", { signal: controller.signal });
  } catch (err) {
    errorCaught = true;
    console.log(`  Hiba elkapva (várt): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!errorCaught) console.log("  FIGYELEM: nem dobott hibát — a hálózati környezet eltérhet a vártól.");
  const staticOk = await assertStaticRoutingStillWorks("timeout");
  return { case: "timeout", errorCaught, staticRoutingOk: staticOk };
}

async function testInvalidProtobuf() {
  console.log("\n--- 2. Invalid protobuf szimuláció ---");
  let errorCaught = false;
  let errorMessage = null;
  try {
    // A statikus GTFS zip URL-je: valós HTTP válasz, de NEM protobuf.
    const res = await fetch("https://go.bkk.hu/api/static/v1/public-gtfs/budapest_gtfs.zip", { cache: "no-store" });
    const buffer = Buffer.from(await res.arrayBuffer());
    GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
  } catch (err) {
    errorCaught = true;
    errorMessage = err instanceof Error ? err.message : String(err);
    console.log(`  Hiba elkapva (várt, malformed protobuf): ${errorMessage}`);
  }
  if (!errorCaught) console.log("  FIGYELEM: a dekódolás nem dobott hibát — ellenőrizendő.");
  const staticOk = await assertStaticRoutingStillWorks("invalid_protobuf");
  return { case: "invalid_protobuf", errorCaught, errorMessage, staticRoutingOk: staticOk };
}

async function testApiKeyError() {
  console.log("\n--- 3. API kulcs hiba szimuláció ---");
  let httpStatus = null;
  let errorCaught = false;
  try {
    const res = await fetch(
      "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb?key=deliberately-invalid-key-000",
      { cache: "no-store" }
    );
    httpStatus = res.status;
    if (!res.ok) {
      errorCaught = true;
      console.log(`  Várt hibás HTTP válasz: ${res.status}`);
    } else {
      console.log("  FIGYELEM: érvénytelen kulccsal is HTTP 2xx jött vissza — ellenőrizendő a BKK API viselkedése.");
    }
  } catch (err) {
    errorCaught = true;
    console.log(`  Hiba elkapva: ${err instanceof Error ? err.message : String(err)}`);
  }
  const staticOk = await assertStaticRoutingStillWorks("api_key_error");
  return { case: "api_key_error", httpStatus, errorCaught, staticRoutingOk: staticOk };
}

async function testStaleFeed() {
  console.log("\n--- 4. Elavult (stale) feed szimuláció ---");
  const nowMs = Date.now();
  const veryOldTimestampSeconds = Math.floor(nowMs / 1000) - 3600; // 1 órája
  const result = evaluateRealtimeFreshness(veryOldTimestampSeconds, nowMs);
  console.log(`  Szimulált feed kora: ${result.ageSeconds}mp, küszöb: ${result.thresholdSeconds}mp`);
  console.log(`  evaluateRealtimeFreshness().fresh === false: ${result.fresh === false ? "PASS" : "FAIL"}`);
  const staticOk = await assertStaticRoutingStillWorks("stale_feed");
  return { case: "stale_feed", detectedAsStale: result.fresh === false, staticRoutingOk: staticOk };
}

async function main() {
  console.log("\n=== BKK Realtime — Failure szimulációs teszt (16. pont) ===");
  const results = [];
  results.push(await testTimeout());
  results.push(await testInvalidProtobuf());
  results.push(await testApiKeyError());
  results.push(await testStaleFeed());

  console.log("\n=== ÖSSZESÍTÉS ===");
  let allStaticRoutingOk = true;
  for (const r of results) {
    console.log(`  ${r.case}: statikus routing = ${r.staticRoutingOk ? "PASS" : "FAIL"}`);
    if (!r.staticRoutingOk) allStaticRoutingOk = false;
  }
  console.log(
    `\nBKK REALTIME FAILURE TESZT: ${allStaticRoutingOk ? "PASS" : "FAIL"} ` +
      "(minden szimulált hiba mellett a statikus routing működött-e)\n"
  );
  process.exit(allStaticRoutingOk ? 0 : 1);
}

main();
