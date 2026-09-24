// VPS ACCESSIBILITY SIDECAR — STATION NAME SEARCH REALISZTIKUS
// GTFS -> INDEX -> HTTP INTEGRÁCIÓS TESZT (2026-09-24).
//
// EZ A TESZT SZÁNDÉKOSAN NEM injektál semmilyen in-memory fixture-t a
// findStationsByName()/activeIndexStore.ts rétegbe — a lényege pontosan
// az, hogy a VALÓDI, lemezre író/olvasó láncot gyakorolja végig, azt a
// pontos réteget, amelynek a hiánya (a Next.js-oldali .vedett-cache/
// production hiánya) a production hibát okozta korábban:
//
//   1. Egy VALÓS, minimális GTFS zip felírása egy IDEIGLENES könyvtárba
//      (nem a repo-ban tárolt fixture, hanem futásidőben, AdmZip-pel
//      épített, ugyanúgy, mint buildIndex.test.ts/server.test.ts-ben).
//   2. A VALÓDI buildAndActivate() (buildIndex.ts) CLI-függvény hívása —
//      ez ténylegesen KIÍRJA a generations/<hash>/{manifest,accessibility-
//      index}.json fájlokat és ATOMIKUSAN felülírja az active-generation.txt
//      pointer fájlt egy DEDIKÁLT, teszt-scope-os ACCESSIBILITY_DATA_ROOT
//      alatt (SOHA nem a valós /srv/vedett-route/accessibility/ alatt).
//   3. A VALÓDI activeIndexStore.pollDatasetOnce() hívása — ez olvassa
//      vissza lemezről a pointer fájlt + a generation JSON-t, PONTOSAN
//      ugyanúgy, ahogy a production sidecar 10 másodperces poll-ciklusa
//      tenné.
//   4. Egy VALÓDI, ephemeral portra bindelt HTTP szerver-instance
//      (createAccessibilitySidecarServer()) indítása, és egy VALÓDI
//      `fetch()` HTTP hívás a /station-search végpontra.
//   5. Assert: a "Martonvásár" nevű, a valós MÁV GTFS-ben megfigyelt
//      koordinátájú (47.321389, 18.781667) test-fixture stop helyesen
//      visszaérkezik — ez a koordináta a valós MÁV GTFS stop_id=829
//      rekordból való (lásd a sprint jelentés "PRODUCTION DATA" pontja),
//      de itt KIZÁRÓLAG realisztikus teszt-bemenetként szerepel, NEM egy
//      hardkódolt "ha a név Martonvásár, akkor..." illesztési szabályként
//      (a findStationsByName() semmilyen helynevet nem ismer — lásd
//      stationSearch.ts fejléce).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import type { Server } from "node:http";
import { createAccessibilitySidecarServer } from "../dist/server.js";
import { buildAndActivate } from "../dist/buildIndex.js";
import { resetForTests, pollDatasetOnce } from "../dist/activeIndexStore.js";

const AUTH_TOKEN = "test-secret-token-integration";
const MARTONVASAR_STOP_ID = "829";
const MARTONVASAR_LAT = 47.321389;
const MARTONVASAR_LON = 18.781667;

let server: Server;
let baseUrl: string;
let dataDir: string;

interface StationSearchResponseBody {
  ok: boolean;
  status: "ok" | "unavailable";
  stops: { stopId: string; name?: string; lat: number; lon: number; dataset: string; parentStation?: string; locationType?: number }[];
}

async function makeRealisticMavGtfsZip(dir: string): Promise<string> {
  const zip = new AdmZip();
  // Minimális, de REALISZTIKUS MÁV-jellegű stops.txt — a "Martonvásár"
  // rekord a valós GTFS stop_id/koordináta párral, MÁS állomások
  // (torlódás/zaj-teszt) NÉLKÜLI, semleges szomszédos rekordokkal, hogy a
  // teszt bizonyítsa: a keresés a NÉV alapján, nem a fájl elhelyezkedése/
  // sorrendje alapján talál rá.
  const stopsCsv = [
    "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station",
    `${MARTONVASAR_STOP_ID},Martonvásár,${MARTONVASAR_LAT},${MARTONVASAR_LON},1,`,
    "830,Ráckeresztúr,47.3550,18.7530,1,",
    "831,Tordas,47.3350,18.7400,1,",
  ].join("\n");
  zip.addFile("stops.txt", Buffer.from(stopsCsv, "utf-8"));
  zip.addFile("trips.txt", Buffer.from("trip_id,wheelchair_accessible\n", "utf-8"));
  const zipPath = path.join(dir, "mav-gtfs-realistic.zip");
  await writeFile(zipPath, zip.toBuffer());
  return zipPath;
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-station-search-integration-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dataDir; // DEDIKÁLT teszt-scope, SOSEM a valós /srv/... gyökér
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = AUTH_TOKEN;
  process.env.ACCESSIBILITY_SIDECAR_DATASETS = "mavgtfs";
  resetForTests();

  // 1+2) VALÓS zip felírása + VALÓS buildAndActivate() hívás — ez a
  // lépés ténylegesen ír a lemezre (generation dir + atomikus pointer).
  const zipPath = await makeRealisticMavGtfsZip(dataDir);
  await buildAndActivate("mavgtfs", zipPath);

  // 3) VALÓS poll-reload — a pollDatasetOnce() itt UGYANAZT a
  // fájlrendszer-olvasási utat futtatja végig, mint a production sidecar
  // 10 másodperces időzítője (itt szinkronban hívva, nem várakozva rá,
  // hogy a teszt determinisztikus és gyors maradjon).
  await pollDatasetOnce("mavgtfs");

  // 4) VALÓS, ephemeral portra bindelt HTTP szerver.
  server = createAccessibilitySidecarServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dataDir, { recursive: true, force: true });
  resetForTests();
});

test("build -> active-generation pointer -> poll-reload -> HTTP /station-search: a VALÓDI fájlrendszer-láncon át visszaadja a Martonvásár candidate-et", async () => {
  const res = await fetch(`${baseUrl}/station-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "mavgtfs", query: "Martonvásár" }),
  });
  assert.equal(res.status, 200);
  const body = await (res.json() as Promise<StationSearchResponseBody>);
  assert.equal(body.status, "ok", "a mavgtfs datasetnek MÁR be kellett töltődnie a poll-reload lépés után");
  assert.equal(body.stops.length, 1);
  const candidate = body.stops[0];
  assert.equal(candidate.stopId, MARTONVASAR_STOP_ID);
  assert.equal(candidate.name, "Martonvásár");
  assert.equal(candidate.lat, MARTONVASAR_LAT);
  assert.equal(candidate.lon, MARTONVASAR_LON);
  assert.equal(candidate.dataset, "mavgtfs");
});

test("ékezet nélküli, kisbetűs kereséssel is megtalálja (accent/case-insensitive a valós láncon át)", async () => {
  const res = await fetch(`${baseUrl}/station-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "mavgtfs", query: "martonvasar" }),
  });
  assert.equal(res.status, 200);
  const body = await (res.json() as Promise<StationSearchResponseBody>);
  assert.equal(body.status, "ok");
  assert.equal(body.stops.length, 1);
  assert.equal(body.stops[0].stopId, MARTONVASAR_STOP_ID);
});

test("nem egyező névre üres listát ad (a valós indexen át, nem 500)", async () => {
  const res = await fetch(`${baseUrl}/station-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "mavgtfs", query: "Nemletezo Falu" }),
  });
  assert.equal(res.status, 200);
  const body = await (res.json() as Promise<StationSearchResponseBody>);
  assert.equal(body.status, "ok");
  assert.equal(body.stops.length, 0);
});
