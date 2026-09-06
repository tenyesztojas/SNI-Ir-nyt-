#!/usr/bin/env node
/**
 * gtfs-rt-feed-test.mjs
 *
 * BKK Realtime integráció — 5. pont: "Első teszt — feed kapcsolat".
 *
 * Valós HTTP hívással leellenőrzi mindhárom hivatalos BKK GTFS-RT feedet
 * (TripUpdates, VehiclePositions, Alerts):
 *   - HTTP válasz (státusz kód)
 *   - protobuf dekódolás sikeres-e
 *   - FeedHeader.timestamp (és ebből az adat kora másodpercben)
 *   - entity szám (feed.entity.length)
 *
 * SOHA nem írja ki a teljes feed tartalmát, és SOHA nem írja ki a valódi
 * API kulcsot (mindig ?key=*** redaktálva jelenik meg, ha egyáltalán URL-t
 * logol hiba esetén).
 *
 * Kimenet: PASS/FAIL feedenként + egy összesítő "BKK GTFS-RT FEED TESZT:
 * PASS / FAIL" sor a script legvégén, ami a dokumentációba másolható.
 *
 * FUTTATÁS (a felhasználó saját gépén, ahol van hálózati elérés a BKK-hoz):
 *   node scripts/vedett-route/gtfs-rt-feed-test.mjs
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

const BKK_GTFS_RT_BASE = "https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full";
const FEEDS = ["TripUpdates", "VehiclePositions", "Alerts"];

function redactKey(url) {
  return url.replace(/([?&]key=)[^&]*/i, "$1***");
}

async function testFeed(feedName) {
  const apiKey = process.env.BKK_API_KEY;
  const rawUrl = `${BKK_GTFS_RT_BASE}/${feedName}.pb?key=${encodeURIComponent(apiKey ?? "")}`;
  const result = {
    feed: feedName,
    httpStatus: null,
    httpOk: false,
    protobufParsed: false,
    headerTimestamp: null,
    headerAgeSeconds: null,
    entityCount: null,
    error: null,
    pass: false,
  };

  if (!apiKey || apiKey.trim().length === 0) {
    result.error = "BKK_API_KEY nincs beállítva (.env.local).";
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(rawUrl, { signal: controller.signal, cache: "no-store" });
  } catch (err) {
    result.error = `Hálózati hiba / timeout: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  } finally {
    clearTimeout(timer);
  }

  result.httpStatus = res.status;
  result.httpOk = res.ok;
  if (!res.ok) {
    result.error = `HTTP ${res.status} — URL: ${redactKey(rawUrl)}`;
    return result;
  }

  let buffer;
  try {
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    result.error = `A válasz törzse nem olvasható: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  let feedMessage;
  try {
    feedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
  } catch (err) {
    result.error = `Protobuf dekódolási hiba (malformed feed): ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }
  result.protobufParsed = true;

  const headerTs = feedMessage.header?.timestamp;
  if (headerTs) {
    const tsNum = typeof headerTs === "object" && "toNumber" in headerTs ? headerTs.toNumber() : Number(headerTs);
    result.headerTimestamp = new Date(tsNum * 1000).toISOString();
    result.headerAgeSeconds = Math.round(Date.now() / 1000 - tsNum);
  } else {
    result.error = "A feed nem tartalmaz FeedHeader.timestamp mezőt.";
  }

  result.entityCount = feedMessage.entity?.length ?? 0;

  result.pass = result.httpOk && result.protobufParsed && result.headerTimestamp !== null;
  return result;
}

async function main() {
  console.log("\n=== BKK GTFS-Realtime feed kapcsolat teszt ===\n");
  const results = [];
  for (const feed of FEEDS) {
    const r = await testFeed(feed);
    results.push(r);
    console.log(`--- ${feed} ---`);
    console.log(`  HTTP státusz:      ${r.httpStatus ?? "N/A"}`);
    console.log(`  Protobuf dekódolt: ${r.protobufParsed}`);
    console.log(`  FeedHeader idő:    ${r.headerTimestamp ?? "N/A"}`);
    console.log(`  Adat kora (mp):    ${r.headerAgeSeconds ?? "N/A"}`);
    console.log(`  Entity szám:       ${r.entityCount ?? "N/A"}`);
    if (r.error) console.log(`  Hiba:              ${r.error}`);
    console.log(`  EREDMÉNY:          ${r.pass ? "PASS" : "FAIL"}\n`);
  }

  const allPass = results.every((r) => r.pass);
  console.log("=== ÖSSZESÍTÉS ===");
  for (const r of results) {
    console.log(`  ${r.feed}: ${r.pass ? "PASS" : "FAIL"}`);
  }
  console.log(`\nBKK GTFS-RT FEED TESZT: ${allPass ? "PASS" : "FAIL"}\n`);
  process.exit(allPass ? 0 : 1);
}

main();
