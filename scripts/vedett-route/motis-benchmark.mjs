// Teljesítmény-benchmark a helyben futó MOTIS ellen — Sprint 2, 24. pont
// (≥50 lekérdezés, p50/p95/p99 válaszidő, csúcs RAM-használat).
//
// Futtatás (a te Windows géped PowerShell-jéből, a MOTIS konténer futása
// közben):
//   node scripts/vedett-route/motis-benchmark.mjs
//
// A csúcs RAM-hoz a "docker stats motis-vedett --no-stream" parancsot hívja
// meg periodikusan a futás alatt (valós mérés, nem becslés) — ehhez a
// konténer nevének "motis-vedett"-nek kell lennie (ahogy a telepítés során
// elneveztük).

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.MOTIS_BASE_URL || "http://localhost:8080";
const CONTAINER_NAME = process.env.MOTIS_CONTAINER_NAME || "motis-vedett";
const N_QUERIES = 60;

// Néhány valós budapesti hely, amelyek között körkörösen váltogatunk, hogy
// ne mindig ugyanaz a (cache-elhető) lekérdezés fusson.
const PLACES = [
  "Deak Ferenc ter",
  "Blaha Lujza ter",
  "Kelenfold vasutallomas",
  "Ors vezer tere",
  "Nyugati palyaudvar",
  "Keleti palyaudvar",
  "Moszkva ter",
  "Astoria",
  "Ferenciek tere",
  "Szell Kalman ter",
];

async function geocodeAll() {
  const map = new Map();
  for (const name of PLACES) {
    const res = await fetch(`${BASE}/api/v1/geocode?${new URLSearchParams({ text: name, numResults: "1" })}`);
    if (!res.ok) continue;
    const arr = await res.json();
    if (arr[0]) map.set(name, arr[0]);
  }
  return map;
}

function sampleDockerMemMb() {
  try {
    const out = execSync(`docker stats ${CONTAINER_NAME} --no-stream --format "{{.MemUsage}}"`, { encoding: "utf-8" });
    // Formátum pl.: "512.3MiB / 5.8GiB"
    const match = out.match(/([\d.]+)\s*(MiB|GiB)/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return match[2] === "GiB" ? value * 1024 : value;
  } catch {
    return null;
  }
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

const geo = await geocodeAll();
const names = [...geo.keys()];
if (names.length < 2) {
  console.error("Nem sikerült elég helyet geokódolni a benchmarkhoz — ellenőrizd, hogy fut-e a MOTIS.");
  process.exit(1);
}

const latencies = [];
let memSamples = [];
let errors = 0;

for (let i = 0; i < N_QUERIES; i++) {
  const from = geo.get(names[i % names.length]);
  const to = geo.get(names[(i + 3) % names.length]);
  if (!from || !to || from === to) continue;

  const started = Date.now();
  try {
    const res = await fetch(
      `${BASE}/api/v6/plan?${new URLSearchParams({
        fromPlace: from.id ?? `${from.lat},${from.lon}`,
        toPlace: to.id ?? `${to.lat},${to.lon}`,
      })}`
    );
    const ms = Date.now() - started;
    latencies.push(ms);
    if (!res.ok) errors++;
    else await res.json();
  } catch {
    errors++;
  }

  if (i % 10 === 0) {
    const mem = sampleDockerMemMb();
    if (mem !== null) memSamples.push(mem);
  }
}

const mem = sampleDockerMemMb();
if (mem !== null) memSamples.push(mem);

const sorted = [...latencies].sort((a, b) => a - b);
const report = {
  timestamp: new Date().toISOString(),
  totalQueries: latencies.length,
  errors,
  latencyMs: {
    min: sorted[0] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? null,
  },
  memoryMb: {
    samples: memSamples,
    peak: memSamples.length > 0 ? Math.max(...memSamples) : null,
    note:
      memSamples.length === 0
        ? "Nem sikerült docker stats-ot olvasni — fut-e a 'motis-vedett' nevű konténer, és elérhető-e a docker parancs ebből a terminálból?"
        : undefined,
  },
};

const outDir = path.join(process.cwd(), "motis-data", "reports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "benchmark-result.json"), JSON.stringify(report, null, 2), "utf-8");

console.log(JSON.stringify(report, null, 2));
console.log(`\nJSON mentve: ${path.join(outDir, "benchmark-result.json")}`);
