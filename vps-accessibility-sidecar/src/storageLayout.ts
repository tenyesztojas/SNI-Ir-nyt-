// VPS ACCESSIBILITY SIDECAR — tárolási elrendezés (Task C3, spec 6/12/13. pont).
//
// /srv/vedett-route/accessibility/<dataset>/
//   generations/<generationHash>/manifest.json
//   generations/<generationHash>/accessibility-index.json
//   active-generation.txt          <- CSAK a jelenleg aktív generation hash-t
//                                     tartalmazza, atomikusan (temp+rename) írva
//
// A generations/<hash>/ könyvtárakat a build script SOHA nem törli
// automatikusan (spec 13. pont: "ne töröld az előző működő generációt
// előbb") — kézi/külön GC egy jövőbeli kör feladata, ha a lemezhasználat
// indokolja.
//
// Az ACCESSIBILITY_DATA_ROOT env változó felülírhatja a gyökeret (pl.
// helyi teszteléshez egy tmp könyvtárra) — production alapértéke
// "/srv/vedett-route/accessibility", ami MEGEGYEZIK a canonical BKK GTFS
// zip melletti "/srv/vedett-route/input/" testvér-könyvtárral (spec 0/4. pont).

import path from "node:path";

export function accessibilityDataRoot(): string {
  return process.env.ACCESSIBILITY_DATA_ROOT?.trim() || "/srv/vedett-route/accessibility";
}

export function datasetDir(dataset: string): string {
  return path.join(accessibilityDataRoot(), dataset);
}

export function generationsDir(dataset: string): string {
  return path.join(datasetDir(dataset), "generations");
}

export function generationDir(dataset: string, generation: string): string {
  return path.join(generationsDir(dataset), generation);
}

export function activeGenerationPointerPath(dataset: string): string {
  return path.join(datasetDir(dataset), "active-generation.txt");
}

export function manifestPath(dataset: string, generation: string): string {
  return path.join(generationDir(dataset, generation), "manifest.json");
}

export function indexPath(dataset: string, generation: string): string {
  return path.join(generationDir(dataset, generation), "accessibility-index.json");
}

export interface AccessibilityManifest {
  provider: string;
  dataset: string;
  generation: string;
  builtAt: string;
  stopCount: number;
  tripCount: number;
  pathwayCount: number;
  /** A bemeneti GTFS zip mérete byte-ban — csak diagnosztikai/observability célra (spec 20. pont), soha nem tartalmaz koordinátát/secretet. */
  sourceZipBytes: number;
}
