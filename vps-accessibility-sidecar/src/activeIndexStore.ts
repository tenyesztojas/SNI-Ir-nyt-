// VPS ACCESSIBILITY SIDECAR — in-memory aktív index tár, poll-alapú
// frissítéssel (Task C3, spec 9/12/13. pont).
//
// A sidecar induláskor (és utána rendszeres időközönként) beolvassa az
// active-generation.txt pointer fájlt, és amikor az MEGVÁLTOZIK, betölti
// az annak megfelelő generations/<hash>/accessibility-index.json-t a
// memóriába. HA a betöltés/validáció bármilyen okból sikertelen (hiányzó
// fájl, korrupt JSON, hiányos alak), a folyamat NEM cserél — a korábban
// betöltött (vagy "nincs adat") állapot marad érvényben, és a hiba csak
// logolásra kerül. A sidecar SOHA nem áll el/crashel egy hibás/hiányzó
// generation miatt (spec 15. pont "fail safe" elve — ez itt a
// szerver-oldali tükre).
//
// Miért polling, nem fájlrendszer-watch/szignál: egyszerűbb, kevésbé
// hibalehetőség-érzékeny egy kis footprintű sidecarban (nincs
// inotify-limit/watcher-leak kockázat), és a GTFS-frissítés eleve NEM
// egy másodperces-pontosságú esemény (heti/napi ciklus) — egy pár
// másodperces aktivációs késleltetés elhanyagolható.

import { readFile } from "node:fs/promises";
import type { AccessibilityIndex } from "./lib/accessibilityIndex.js";
import { activeGenerationPointerPath, indexPath, manifestPath, type AccessibilityManifest } from "./storageLayout.js";

export interface LoadedDataset {
  manifest: AccessibilityManifest;
  index: AccessibilityIndex;
}

// dataset -> jelenleg memóriában betöltött, ÉRVÉNYES állapot (vagy nincs
// bejegyzés, ha még soha nem sikerült semmit betölteni).
const loaded = new Map<string, LoadedDataset>();
// dataset -> az utoljára MEGKÍSÉRELT (nem feltétlenül sikeres) generation
// hash, hogy ne próbáljuk újra és újra ugyanazt a sikertelen betöltést
// minden poll-ciklusban feleslegesen logolni.
const lastAttemptedGeneration = new Map<string, string>();

async function tryLoadGeneration(dataset: string, generation: string): Promise<LoadedDataset | null> {
  try {
    const manifestRaw = await readFile(manifestPath(dataset, generation), "utf-8");
    const manifest = JSON.parse(manifestRaw) as AccessibilityManifest;
    const indexRaw = await readFile(indexPath(dataset, generation), "utf-8");
    const index = JSON.parse(indexRaw) as AccessibilityIndex;
    if (!index || typeof index !== "object" || !index.stopsById || !index.tripsById || !Array.isArray(index.pathways)) {
      return null;
    }
    if (!manifest || manifest.generation !== generation) return null;
    return { manifest, index };
  } catch {
    return null;
  }
}

/**
 * Egyetlen poll-ciklus egy adott dataset-re: elolvassa a pointer fájlt, és
 * ha a benne szereplő generation eltér a jelenleg memóriában lévőtől ÉS
 * eltér az utoljára (esetleg sikertelenül) megkísérelt generationtől,
 * megpróbálja betölteni. SOHA nem dob hibát.
 */
export async function pollDatasetOnce(dataset: string): Promise<void> {
  let pointerGeneration: string;
  try {
    pointerGeneration = (await readFile(activeGenerationPointerPath(dataset), "utf-8")).trim();
  } catch {
    return; // nincs pointer fájl (dataset még sosem lett build-elve ezen a gépen) — marad "nincs adat".
  }
  if (!pointerGeneration) return;

  const current = loaded.get(dataset);
  if (current?.manifest.generation === pointerGeneration) return; // már ez van betöltve
  if (lastAttemptedGeneration.get(dataset) === pointerGeneration && current) return; // már megpróbáltuk, sikertelen volt, van régebbi jó adat — ne próbálkozzunk minden ciklusban feleslegesen

  lastAttemptedGeneration.set(dataset, pointerGeneration);
  const result = await tryLoadGeneration(dataset, pointerGeneration);
  if (result) {
    loaded.set(dataset, result);
  }
  // Sikertelen betöltés esetén SZÁNDÉKOSAN nem törli a `loaded` meglévő
  // bejegyzését — a korábbi, jó generáció marad kiszolgálva.
}

export function getLoadedDataset(dataset: string): LoadedDataset | null {
  return loaded.get(dataset) ?? null;
}

/** Csak teszteléshez — a modul belső, memóriában tartott állapotának törlése. */
export function resetForTests(): void {
  loaded.clear();
  lastAttemptedGeneration.clear();
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling(datasets: string[], intervalMs: number): void {
  const tick = () => {
    for (const dataset of datasets) {
      pollDatasetOnce(dataset).catch(() => {
        // pollDatasetOnce elméletileg sosem dob, de védekezésből itt is elnyeljük.
      });
    }
  };
  tick(); // induláskor azonnal, ne kelljen az első intervallumra várni
  pollTimer = setInterval(tick, intervalMs);
}

export function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
