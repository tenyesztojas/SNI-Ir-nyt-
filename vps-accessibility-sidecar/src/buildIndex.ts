// VPS ACCESSIBILITY SIDECAR — index build + safe activation CLI
// (Task C3, spec 12/13/24. pont).
//
// Használat (VPS-en, a canonical zip mellett):
//   node dist/buildIndex.js bkkgtfs /srv/vedett-route/input/bkk_gtfs.zip
//
// Folyamat (spec 12/13. pont — "atomic index build", "GTFS update safe
// activation"):
//   1. GTFS zip beolvasása, SHA256 generation-hash számítása (16 hex
//      karakter, UGYANAZ a konvenció, mint a Next.js oldali
//      staticFileProvider.ts computeGtfsZipGeneration()-je — szándékosan
//      NEM egy új, eltérő hash-hosszúság/algoritmus).
//   2. Ha EZ a generation már létezik (generations/<hash>/ már megvan) —
//      nincs semmi új dolog, csak aktiváljuk (idempotens: ugyanazt a zipet
//      kétszer futtatva nem hibázik, nem épít feleslegesen újra).
//   3. Egyébként: index építése a MEGLÉVŐ, változatlan
//      buildAccessibilityIndexFromGtfsZip()-pel (lib/accessibilityIndex.ts
//      — a fő repo C2 logikájának szinkronizált másolata, lásd annak
//      fejléce) — EZ a lépés NEM ír fájlt, tiszta függvény.
//   4. Manifest + index JSON írása egy ÚJ generations/<hash>/ könyvtárba,
//      KIZÁRÓLAG temp fájlba írva, majd rename()-elve (POSIX atomikus egy
//      fájlrendszeren belül) — egy félbeszakadt írás SOHA nem hagy
//      korrupt/részleges generációt.
//   5. VALIDÁCIÓ: a frissen írt fájlok visszaolvasása és alak-ellenőrzése,
//      MIELŐTT aktiválnánk.
//   6. Csak SIKERES validáció után: az active-generation.txt pointer
//      ATOMIKUS (temp+rename) frissítése az új hash-re.
//   7. HIBA ESETÉN (bármelyik lépésnél): a folyamat nonzero exit code-dal
//      leáll, az active-generation.txt-hez NEM ÉR HOZZÁ — a korábbi,
//      működő generáció marad aktív (spec 13. pont: "sikertelen build: a
//      korábbi jó index maradjon aktív").
//
// Ez a script SOHA nem törli egy korábbi generation könyvtárát (spec 13.
// pont) — kézi/rollback célra minden korábbi build megmarad a lemezen.

import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { buildAccessibilityIndexFromGtfsZip, type AccessibilityIndex } from "./lib/accessibilityIndex.js";
import type { TransitProviderId } from "./lib/types.js";
import {
  generationDir,
  generationsDir,
  manifestPath,
  indexPath,
  activeGenerationPointerPath,
  type AccessibilityManifest,
} from "./storageLayout.js";

// DATASET -> PROVIDER REGISZTER (spec 19. pont) — UGYANAZ a mintája, mint a
// Next.js oldali motisIdNormalization.ts KNOWN_MOTIS_DATASET_TAGS-je (és a
// SZÁNDÉKOSAN egyező kulcsok: a dataset-kulcs itt is a MOTIS dataset-tag,
// pl. "bkkgtfs"). Ez a manifest "provider" mezőjéhez kell (ember-olvasható
// diagnosztika, spec 20. pont) — FONTOS: ez NEM a MOTIS-kompozit-ID
// normalizáláshoz kell (azt a sidecar sosem végzi, lásd
// accessibilityLookupClient.ts fejléce), csak a manifest metaadatához. Egy
// ismeretlen dataset esetén a provider mező a dataset-kulcsra esik vissza
// (sosem dob hibát, sosem crashel egy új, még nem regisztrált dataset
// miatt — spec 19. pont).
const DATASET_PROVIDERS: Record<string, TransitProviderId> = {
  bkkgtfs: "BKK",
};

function resolveProvider(dataset: string): TransitProviderId {
  return DATASET_PROVIDERS[dataset] ?? (dataset as TransitProviderId);
}

function computeGeneration(buffer: Buffer): string {
  // UGYANAZ a konvenció (sha256, 16 hex karakter), mint a Next.js oldali
  // staticFileProvider.ts computeGtfsZipGeneration()-je — szándékosan nem
  // egy külön/eltérő hash-forma, hogy a két oldal generation-stringjei
  // emberi szemmel is összevethetők legyenek egy jövőbeli, közös
  // manifest-alapú szinkron-mechanizmusban (lásd a feature riport "feed
  // generation" nyitott pontja).
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteJson(finalPath: string, data: unknown): Promise<void> {
  const dir = path.dirname(finalPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(finalPath)}.${randomUUID()}.tmp`);
  await writeFile(tmpPath, JSON.stringify(data));
  await rename(tmpPath, finalPath);
}

async function validateWrittenIndex(dataset: string, generation: string): Promise<AccessibilityIndex> {
  const raw = await readFile(indexPath(dataset, generation), "utf-8");
  const parsed = JSON.parse(raw) as AccessibilityIndex;
  if (!parsed || typeof parsed !== "object" || !parsed.stopsById || !parsed.tripsById || !Array.isArray(parsed.pathways)) {
    throw new Error("Az újonnan írt accessibility-index.json validációja sikertelen (hiányos alak).");
  }
  return parsed;
}

export async function buildAndActivate(dataset: string, gtfsZipPath: string): Promise<AccessibilityManifest> {
  const buffer = await readFile(gtfsZipPath);
  const generation = computeGeneration(buffer);
  const dir = generationDir(dataset, generation);

  const alreadyBuilt = await pathExists(manifestPath(dataset, generation));
  if (!alreadyBuilt) {
    await mkdir(generationsDir(dataset), { recursive: true });
    const index = buildAccessibilityIndexFromGtfsZip(buffer, resolveProvider(dataset), generation);
    const manifest: AccessibilityManifest = {
      provider: index.provider,
      dataset,
      generation,
      builtAt: index.builtAt,
      stopCount: Object.keys(index.stopsById).length,
      tripCount: Object.keys(index.tripsById).length,
      pathwayCount: index.pathways.length,
      sourceZipBytes: buffer.byteLength,
    };
    try {
      await atomicWriteJson(indexPath(dataset, generation), index);
      await atomicWriteJson(manifestPath(dataset, generation), manifest);
      await validateWrittenIndex(dataset, generation); // lépés 5: validáció AKTIVÁLÁS ELŐTT
    } catch (err) {
      // Takarítás: egy félig írt, SOHA nem aktivált generation könyvtár
      // eltávolítása — de az active-generation.txt-hez itt sem nyúlunk.
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  // Lépés 6: AKTIVÁLÁS — kizárólag validált generation esetén, atomikusan.
  const pointerPath = activeGenerationPointerPath(dataset);
  const tmpPointer = path.join(path.dirname(pointerPath), `.active-generation.${randomUUID()}.tmp`);
  await mkdir(path.dirname(pointerPath), { recursive: true });
  await writeFile(tmpPointer, generation);
  await rename(tmpPointer, pointerPath);

  const manifestRaw = await readFile(manifestPath(dataset, generation), "utf-8");
  return JSON.parse(manifestRaw) as AccessibilityManifest;
}

// CLI belépési pont — csak akkor fut, ha közvetlenül hívják (nem amikor
// tesztből importálják a buildAndActivate()-et).
const isDirectCliRun = process.argv[1] && process.argv[1].endsWith("buildIndex.js");
if (isDirectCliRun) {
  const [, , dataset, zipPath] = process.argv;
  if (!dataset || !zipPath) {
    console.error("Használat: node dist/buildIndex.js <dataset> <gtfs-zip-path>");
    process.exit(1);
  }
  buildAndActivate(dataset, zipPath)
    .then((manifest) => {
      console.log(JSON.stringify({ ok: true, manifest }));
    })
    .catch((err) => {
      console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      process.exit(1);
    });
}
