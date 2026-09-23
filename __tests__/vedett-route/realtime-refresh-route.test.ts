// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — WIRING kategória,
// forrás-alapú vizsgálat (ugyanaz a technika, mint
// __tests__/vedett-route/rest-stop-security-regression.test.ts — a Next.js
// route handler "next/server"-t importál, ami plain node:test alatt nem
// oldható fel, ezért a VALÓS forrásfájl szövegét vizsgáljuk, nem futtatjuk
// a modult).
//
// Ez a fájl azt rögzíti forrás-szinten, hogy a realtime-refresh route
// handler TÉNYLEGESEN a GET /api/v6/trip alapú útra van bekötve, NEM a
// korábbi (Sprint 7.2) /api/v6/plan re-query-re — lásd az audit-riportot
// és a route.ts fejlécét a proven root cause-ról.
//   node --test __tests__/vedett-route/realtime-refresh-route.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

const ROUTE_FILE = "app/api/vedett-route/realtime-refresh/route.ts";

test("a route handler fetchMotisTrip()-et importál és hív, SOHA nem fetchMotisPlan()-t/buildRealtimeRefreshRequest()-et", () => {
  const src = read(ROUTE_FILE);
  assert.match(src, /import\s*\{\s*fetchMotisTrip\s*\}\s*from\s*"@\/lib\/vedett-route\/motisClient"/);
  assert.doesNotMatch(src, /fetchMotisPlan/, "a realtime-refresh route SOHA nem hívhat /plan-t");
  assert.doesNotMatch(src, /buildRealtimeRefreshRequest/, "a korábbi /plan-alapú request-builder nem használható itt");
});

test("[12] a tripId-nkénti deduplikálás (dedupeRealtimeRefreshTripIds) a fetch-loop ELŐTT fut — pollingonként egy tripId-t csak egyszer kérdez le", () => {
  const src = read(ROUTE_FILE);
  const dedupeIndex = src.indexOf("dedupeRealtimeRefreshTripIds(parsed.data.legs)");
  const fetchLoopIndex = src.indexOf("uniqueTripIds.map");
  assert.ok(dedupeIndex >= 0, "hívnia kell a dedupeRealtimeRefreshTripIds()-t");
  assert.ok(fetchLoopIndex > dedupeIndex, "a fetch-loopnak a deduplikált listán kell futnia, nem a nyers legs-listán");
});

test("egy nem-ok /trip eredmény csendes no-op-ra fut (null-t tárol a Map-ben), SOHA nem dob hibát", () => {
  const src = read(ROUTE_FILE);
  assert.match(src, /result\.ok\s*\?\s*result\.data\s*:\s*null/);
});

test("a végső válasz mindig ok:true — hálózati/routing hiba esetén sem szakad meg a navigáció (üres updates, nem HTTP hiba)", () => {
  const src = read(ROUTE_FILE);
  assert.match(src, /NextResponse\.json\(\{\s*ok:\s*true,\s*updates\s*\}\)/);
});

test("[14] a normál, tervezési célú /plan-t (orchestrator.ts) ez a route NEM importálja — a fagyasztott departAt-tal futó /plan hívások érintetlenek", () => {
  const src = read(ROUTE_FILE);
  assert.doesNotMatch(src, /from\s*"@\/lib\/vedett-route\/orchestrator"/, "a realtime-refresh route nem nyúlhat az orchestrator /plan-tervezési logikájához");
});
