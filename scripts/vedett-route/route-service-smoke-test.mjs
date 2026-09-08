#!/usr/bin/env node
// route-service-smoke-test.mjs
//
// Sprint E Preparation Gate (2026-09-07) — 9. pont: staging smoke-test a
// VPS-en futó, HTTPS-en publikált MOTIS "route service" ellen (lásd
// docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md).
//
// EZ A SCRIPT NEM FUT AUTOMATIKUSAN a build vagy a "npm test" részeként —
// éles hálózati hívásokat indít egy ténylegesen elérhető route service
// ellen, ezért csak a felhasználó saját gépéről, kézzel futtatandó, amikor
// a route.vedettsarok.hu DNS/HTTPS/reverse proxy már fel van állítva
// (lásd VPS_STAGING_INTEGRATION_GATE.md "H) VPS oldali teendők").
//
// KIZÁRÓLAG env változókból olvas — SOHA nem hardcode-olt secret:
//   ROUTE_SERVICE_URL         (kötelező, pl. https://route.vedettsarok.hu)
//   ROUTE_SERVICE_AUTH_TOKEN  (kötelező)
//
// FUTTATÁS:
//   ROUTE_SERVICE_URL=https://route.vedettsarok.hu \
//   ROUTE_SERVICE_AUTH_TOKEN=<a te tokened> \
//   node scripts/vedett-route/route-service-smoke-test.mjs
//
// A script kimenete SOHA nem tartalmazza a token értékét — sem sikeres,
// sem sikertelen eset esetén. Csak PASS/FAIL sorokat és a hiba jellegét
// (HTTP státusz, "timeout", "malformed") írja ki, semmilyen nyers
// válasz-body-t vagy header-t.

const BASE_URL = process.env.ROUTE_SERVICE_URL;
const AUTH_TOKEN = process.env.ROUTE_SERVICE_AUTH_TOKEN;
const TIMEOUT_MS = Number(process.env.ROUTE_SERVICE_SMOKE_TEST_TIMEOUT_MS ?? 8000);

// Egy nyilvánvalóan ÉRVÉNYTELEN token — SOSEM a valós token módosítása
// vagy részlete, hogy a "hibás tokennel FAIL" eset se szivárogtathasson
// semmit a valós secretről.
const INVALID_TOKEN = "smoke-test-invalid-token-000000000000";

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

async function fetchWithTimeout(url, headers, timeoutMs) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    return { kind: "response", res };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return { kind: isTimeout ? "timeout" : "network_error", message: err instanceof Error ? err.message : String(err) };
  }
}

async function testHealthWithoutToken() {
  const outcome = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, {}, TIMEOUT_MS);
  if (outcome.kind !== "response") {
    record("health token nélkül -> FAIL (elvárt)", false, `hálózati hiba, nem HTTP válasz: ${outcome.kind}`);
    return;
  }
  // Token nélkül a route service-nek 401/403-at KELL adnia — ha 200-at ad,
  // az egy KRITIKUS biztonsági hiba (a proxy nem ellenőrzi az auth-ot).
  const pass = outcome.res.status === 401 || outcome.res.status === 403;
  record("health token nélkül -> FAIL (elvárt, azaz a route service elutasítja)", pass, `HTTP ${outcome.res.status}`);
}

async function testHealthWithWrongToken() {
  const outcome = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, { Authorization: `Bearer ${INVALID_TOKEN}` }, TIMEOUT_MS);
  if (outcome.kind !== "response") {
    record("health hibás tokennel -> FAIL (elvárt)", false, `hálózati hiba, nem HTTP válasz: ${outcome.kind}`);
    return;
  }
  const pass = outcome.res.status === 401 || outcome.res.status === 403;
  record("health hibás tokennel -> FAIL (elvárt, azaz elutasítás)", pass, `HTTP ${outcome.res.status}`);
}

async function testHealthWithValidToken() {
  const outcome = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, { Authorization: `Bearer ${AUTH_TOKEN}` }, TIMEOUT_MS);
  if (outcome.kind !== "response") {
    record("health helyes tokennel -> PASS", false, `hálózati hiba: ${outcome.kind}`);
    return;
  }
  if (!outcome.res.ok) {
    record("health helyes tokennel -> PASS", false, `HTTP ${outcome.res.status}`);
    return;
  }
  let malformed = false;
  let body = null;
  try {
    body = await outcome.res.json();
  } catch {
    malformed = true;
  }
  if (malformed) {
    record("health helyes tokennel -> PASS", false, "a válasz nem valid JSON (malformed)");
    return;
  }
  const hasExpectedShape = body && typeof body === "object" && ("rt" in body || "gbfs" in body);
  record("health helyes tokennel -> PASS", hasExpectedShape, hasExpectedShape ? "rt/gbfs mező jelen van" : "váratlan válaszforma");
}

async function testPlanWithValidToken() {
  // Egy determinisztikus, kicsi lekérdezés — nem valós felhasználói adat,
  // csak a hivatalos /api/v6/plan végpont elérhetőségének ellenőrzése.
  const params = new URLSearchParams({
    fromPlace: "47.4979,19.0402",
    toPlace: "47.4925,19.0513",
    numItineraries: "1",
  });
  const outcome = await fetchWithTimeout(`${BASE_URL}/api/v6/plan?${params.toString()}`, { Authorization: `Bearer ${AUTH_TOKEN}` }, TIMEOUT_MS);
  if (outcome.kind !== "response") {
    record("plan helyes tokennel -> PASS", false, `hálózati hiba: ${outcome.kind}`);
    return;
  }
  if (!outcome.res.ok) {
    record("plan helyes tokennel -> PASS", false, `HTTP ${outcome.res.status}`);
    return;
  }
  try {
    const data = await outcome.res.json();
    const hasItineraries = data && typeof data === "object" && (Array.isArray(data.itineraries) || Array.isArray(data.direct));
    record("plan helyes tokennel -> PASS", Boolean(hasItineraries), hasItineraries ? "itineraries/direct tömb jelen van" : "váratlan válaszforma");
  } catch {
    record("plan helyes tokennel -> PASS", false, "a válasz nem valid JSON (malformed)");
  }
}

async function testTimeoutHandling() {
  // Szándékosan rendkívül rövid timeout-tal hívjuk meg — ha a route
  // service ennyi idő alatt nem válaszol, a scriptnek TimeoutError-t kell
  // kapnia, NEM lefagynia vagy kivételt dobva leállnia.
  const outcome = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, { Authorization: `Bearer ${AUTH_TOKEN}` }, 1);
  // Vagy timeout történt (ez az elvárt, extrém rövid timeout mellett), vagy
  // a hívás ennyire gyors volt, hogy mégis válaszolt — mindkettő elfogadható
  // kimenet, a lényeg: NEM dobott kezeletlen kivételt (a script idáig
  // eljutott).
  record("timeout kezelése (rendkívül rövid timeout-tal sem fagy le/dob kivételt)", true, outcome.kind);
}

async function main() {
  console.log("\n=== Route Service Staging Smoke Test (Sprint E Preparation Gate) ===\n");

  if (!BASE_URL) {
    console.error("HIÁNYZIK: ROUTE_SERVICE_URL env változó. Futtatás:\n  ROUTE_SERVICE_URL=... ROUTE_SERVICE_AUTH_TOKEN=... node scripts/vedett-route/route-service-smoke-test.mjs");
    process.exit(2);
  }
  if (!AUTH_TOKEN) {
    console.error("HIÁNYZIK: ROUTE_SERVICE_AUTH_TOKEN env változó.");
    process.exit(2);
  }

  await testHealthWithoutToken();
  await testHealthWithWrongToken();
  await testHealthWithValidToken();
  await testPlanWithValidToken();
  await testTimeoutHandling();

  const allPass = results.every((r) => r.pass);
  console.log(`\n=== ÖSSZESÍTÉS: ${results.filter((r) => r.pass).length}/${results.length} PASS ===`);
  console.log(`\nROUTE SERVICE STAGING SMOKE TEST: ${allPass ? "PASS" : "FAIL"}\n`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  // Bármilyen váratlan hiba esetén is csak az üzenetet írjuk ki — SOHA
  // nem a teljes env-et vagy a hívás fejléceit.
  console.error(`VÁRATLAN HIBA: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
