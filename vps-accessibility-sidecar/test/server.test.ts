// VPS ACCESSIBILITY SIDECAR — server.ts integrációs tesztek (Task C3,
// spec 23. pont "LOOKUP API" kategória). A modult a saját, ephemeral
// portra bindelt HTTP szerver-instance-ként teszteljük (nem a CLI
// belépési ponton keresztül, hogy egy process-ben több teszt is
// futhasson izolált porton).
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

const AUTH_TOKEN = "test-secret-token";
let server: Server;
let baseUrl: string;
let dataDir: string;

// A globális `fetch`/`Response.json()` visszatérési típusa `Promise<any>`
// a lib.dom.d.ts-ben, DE ez a projekt "skipLibCheck" mellett "strict"
// módban fordul, és a `body.mező` hozzáférés `unknown`-on (nem `any`-on)
// hibázna, ha a `Response.json()` szigorúbb típusfelbontást kapna egy
// jövőbeli Node/lib verzióban — ezért itt EXPLICIT, a tényleges lookup/
// health válasz-alakot leíró típusokkal olvassuk ki a body-t, `any`
// NÉLKÜL.
interface HealthDatasetEntry {
  dataset: string;
  status: "ok" | "unavailable";
  provider?: string;
  generation?: string;
  builtAt?: string;
  stopCount?: number;
  tripCount?: number;
  pathwayCount?: number;
}

interface HealthResponseBody {
  ok: boolean;
  datasets: HealthDatasetEntry[];
}

interface LookupResponseBody {
  ok: boolean;
  status: "ok" | "unavailable";
  provider?: string | null;
  dataset?: string;
  generation?: string | null;
  builtAt?: string | null;
  stops: Record<string, unknown>;
  trips: Record<string, unknown>;
  pathways: { pathwayId: string; fromStopId: string; toStopId: string }[];
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function makeGtfsZip(dir: string): Promise<string> {
  const zip = new AdmZip();
  zip.addFile("stops.txt", Buffer.from("stop_id,parent_station,wheelchair_boarding\nS1,,1\nS2,,2\n", "utf-8"));
  zip.addFile("trips.txt", Buffer.from("trip_id,wheelchair_accessible\nT1,1\n", "utf-8"));
  zip.addFile(
    "pathways.txt",
    Buffer.from("pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\nPW1,S1,S2,2,1\n", "utf-8")
  );
  const zipPath = path.join(dir, "gtfs.zip");
  await writeFile(zipPath, zip.toBuffer());
  return zipPath;
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-server-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dataDir;
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = AUTH_TOKEN;
  process.env.ACCESSIBILITY_SIDECAR_DATASETS = "bkkgtfs";
  resetForTests();
  const zipPath = await makeGtfsZip(dataDir);
  await buildAndActivate("bkkgtfs", zipPath);
  await pollDatasetOnce("bkkgtfs");

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

test("GET /health: nem igényel auth-ot, és a betöltött dataset manifest mezőit adja, secret nélkül", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await readJson<HealthResponseBody>(res);
  assert.equal(body.ok, true);
  const bkk = body.datasets.find((d) => d.dataset === "bkkgtfs");
  assert.ok(bkk);
  assert.equal(bkk!.status, "ok");
  assert.equal(bkk!.provider, "BKK");
  assert.equal(bkk!.stopCount, 2);
  assert.equal(JSON.stringify(body).toLowerCase().includes("token"), false, "a health válasz SOSEM tartalmazhat secretet");
});

test("POST /lookup: auth fejléc nélkül 401-et ad", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset: "bkkgtfs", stopIds: ["S1"] }),
  });
  assert.equal(res.status, 401);
});

test("POST /lookup: rossz Bearer tokennel 401-et ad", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer nem-ez-a-jo-token" },
    body: JSON.stringify({ dataset: "bkkgtfs", stopIds: ["S1"] }),
  });
  assert.equal(res.status, 401);
});

test("POST /lookup: helyes tokennel a kért stopId/tripId/pathway metszetét adja, SOSEM a teljes indexet", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "bkkgtfs", stopIds: ["S1"], tripIds: ["T1"], pathwayQueries: [{ fromStopId: "S1", toStopId: "S2" }] }),
  });
  assert.equal(res.status, 200);
  const body = await readJson<LookupResponseBody>(res);
  assert.equal(body.status, "ok");
  assert.deepEqual(Object.keys(body.stops), ["S1"], "csak a kért S1 stop szerepelhet, S2 nem volt kérve stopIds-ben");
  assert.deepEqual(Object.keys(body.trips), ["T1"]);
  assert.equal(body.pathways.length, 1);
  assert.equal(body.pathways[0].pathwayId, "PW1");
});

test("POST /lookup: ismeretlen stopId-ra egyszerűen kihagyja a válaszból, nem hibázik", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "bkkgtfs", stopIds: ["NEM_LETEZO_STOP"] }),
  });
  assert.equal(res.status, 200);
  const body = await readJson<LookupResponseBody>(res);
  assert.deepEqual(body.stops, {});
});

test("POST /lookup: ismeretlen dataset 404-et ad (spec 19. pont: sosem crashel egy nem regisztrált dataset miatt)", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "mavgtfs", stopIds: ["S1"] }),
  });
  assert.equal(res.status, 404);
});

test("POST /lookup: malformed JSON body 400-at ad, nem 500-at", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: "{ nem: valid json",
  });
  assert.equal(res.status, 400);
});

test("POST /lookup: hiányzó dataset mező 400-at ad", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ stopIds: ["S1"] }),
  });
  assert.equal(res.status, 400);
});

test("POST /lookup: a válasz SOSEM tartalmazza a Bearer tokent/secretet", async () => {
  const res = await fetch(`${baseUrl}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ dataset: "bkkgtfs", stopIds: ["S1"] }),
  });
  const text = await res.text();
  assert.equal(text.includes(AUTH_TOKEN), false);
});
