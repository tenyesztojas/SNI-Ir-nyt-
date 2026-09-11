// VPS ACCESSIBILITY SIDECAR — buildIndex.ts tesztek (Task C3, spec 23. pont
// "INDEX BUILDER" kategória).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { buildAndActivate } from "../dist/buildIndex.js";

let zipFixtureCounter = 0;

async function makeGtfsZip(dir: string, opts?: { stopsExtra?: string; withPathways?: boolean }): Promise<string> {
  const zip = new AdmZip();
  const stops = [
    "stop_id,parent_station,wheelchair_boarding",
    "S1,PARENT1,1",
    "S2,PARENT1,2",
    opts?.stopsExtra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  zip.addFile("stops.txt", Buffer.from(stops, "utf-8"));
  zip.addFile("trips.txt", Buffer.from("trip_id,wheelchair_accessible\nT1,1\n", "utf-8"));
  if (opts?.withPathways !== false) {
    zip.addFile(
      "pathways.txt",
      Buffer.from("pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\nPW1,S1,S2,2,1\n", "utf-8")
    );
  }
  // Minden fixture EGYEDI fájlnevet kap (nem csak egyedi tartalmat) —
  // különben egy ugyanabban a tesztkönyvtárban készült második zip
  // felülírná az elsőt a fájlrendszeren, MIELŐTT a hívó azt tényleg
  // beolvasná (lásd a korábbi, ezzel javított hibás teszt-eset).
  const zipPath = path.join(dir, `gtfs-${++zipFixtureCounter}.zip`);
  await writeFile(zipPath, zip.toBuffer());
  return zipPath;
}

test("buildAndActivate: sikeres build után a manifest a helyes provider/dataset/generation mezőket adja", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dir;
  const zipPath = await makeGtfsZip(dir);
  const manifest = await buildAndActivate("bkkgtfs", zipPath);
  assert.equal(manifest.provider, "BKK");
  assert.equal(manifest.dataset, "bkkgtfs");
  assert.equal(manifest.stopCount, 2);
  assert.equal(manifest.tripCount, 1);
  assert.equal(manifest.pathwayCount, 1);
  assert.equal(typeof manifest.generation, "string");
  assert.ok(manifest.generation.length === 16, "a generation 16 hex karakter (sha256 slice(0,16))");
  await rm(dir, { recursive: true, force: true });
});

test("buildAndActivate: ugyanaz a zip kétszer futtatva ugyanazt a generationt adja (idempotens, nem épít feleslegesen újra)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dir;
  const zipPath = await makeGtfsZip(dir);
  const first = await buildAndActivate("bkkgtfs", zipPath);
  const second = await buildAndActivate("bkkgtfs", zipPath);
  assert.equal(first.generation, second.generation);
  await rm(dir, { recursive: true, force: true });
});

test("buildAndActivate: eltérő tartalmú zip eltérő generationt kap, és az active-generation.txt az újra vált", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dir;
  const zipPath1 = await makeGtfsZip(dir, { stopsExtra: "" });
  const zipPath2 = await makeGtfsZip(dir, { stopsExtra: "S3,PARENT1,1" });
  const first = await buildAndActivate("bkkgtfs", zipPath1);
  const second = await buildAndActivate("bkkgtfs", zipPath2);
  assert.notEqual(first.generation, second.generation);
  const pointer = await readFile(path.join(dir, "bkkgtfs", "active-generation.txt"), "utf-8");
  assert.equal(pointer, second.generation);
  await rm(dir, { recursive: true, force: true });
});

test("buildAndActivate: SOHA nem törli a korábbi, jó generation könyvtárát egy újabb build után", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dir;
  const zipPath1 = await makeGtfsZip(dir, { stopsExtra: "" });
  const first = await buildAndActivate("bkkgtfs", zipPath1);
  const zipPath2 = await makeGtfsZip(dir, { stopsExtra: "S4,PARENT1,1" });
  await buildAndActivate("bkkgtfs", zipPath2);
  const oldManifestPath = path.join(dir, "bkkgtfs", "generations", first.generation, "manifest.json");
  const stillThere = await readFile(oldManifestPath, "utf-8").then(() => true, () => false);
  assert.equal(stillThere, true, "a korábbi generation könyvtárát nem szabadott törölni");
  await rm(dir, { recursive: true, force: true });
});

test("buildAndActivate: sikertelen build (hiányzó zip fájl) nem hoz létre/aktivál semmit, és nem dob a hívón kívülre nem kezelt hibát", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dir;
  await assert.rejects(() => buildAndActivate("bkkgtfs", path.join(dir, "nincs-ilyen.zip")));
  const pointerExists = await readFile(path.join(dir, "bkkgtfs", "active-generation.txt"), "utf-8").then(
    () => true,
    () => false
  );
  assert.equal(pointerExists, false, "sikertelen build esetén az active-generation.txt-nek nem kellene létrejönnie");
  await rm(dir, { recursive: true, force: true });
});

test("buildAndActivate: pathways.txt nélküli GTFS zip is sikeresen épül (pathwayCount 0, nem hiba)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dir;
  const zipPath = await makeGtfsZip(dir, { withPathways: false });
  const manifest = await buildAndActivate("bkkgtfs", zipPath);
  assert.equal(manifest.pathwayCount, 0);
  await rm(dir, { recursive: true, force: true });
});
