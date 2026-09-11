// VPS ACCESSIBILITY SIDECAR — SZINKRONIZÁLT MÁSOLAT (Task C3, 2026-09-11).
// FORRÁS IGAZSÁG: lib/vedett-route/accessibilityIndex.ts a fő Next.js
// repóban. Lásd gtfsCsv.ts fejléce ugyanitt a másolat-stratégia
// indoklásáért. EGYETLEN eltérés a fő repo verziójától: a `TransitProviderId`
// import a helyi, minimális `./types.ts` shimből jön (lásd ott), nem a
// teljes Next.js `lib/vedett-route/types.ts`-ből — ez a modul saját belső
// logikáját NEM módosítja.
//
// VÉDETT ÚTVONAL — CANONICAL ACCESSIBILITY INDEX (2026-09-11, Task C2)
//
// Providerfüggetlen, a NYERS GTFS statikus feedből (stops.txt/trips.txt/
// pathways.txt) épített, queryelhető modell. Ez a fájl KIZÁRÓLAG a
// PARSZOLÁS/MODELL logikát tartalmazza (tiszta függvények, nincs
// fájlrendszer-hozzáférés) — a TÁROLÁS/ÚJRAÉPÍTÉS integrációja a
// providers/staticFileProvider.ts-ben él (lásd annak fejlécét a runtime
// storage döntésért).
//
// KŐKEMÉNY SZABÁLY: ez a modul SOSEM tárol be kézzel semmilyen konkrét
// (pl. a jelenlegi BKK feedből megfigyelt) adatot a forráskódba — az
// index KIZÁRÓLAG a ténylegesen átadott GTFS zip tartalmából épül.

import AdmZip from "adm-zip";
import { parseGtfsCsv, parseOptionalGtfsInt } from "./gtfsCsv.js";
import type { TransitProviderId } from "./types.js";

// --- Minimum mezők (spec 3. pont) -------------------------------------

export interface StopAccessibilityIndexEntry {
  stopId: string;
  parentStation?: string;
  /** Nyers GTFS wheelchair_boarding érték — a klasszifikáció (0/üres=UNKNOWN) az accessibility.ts felelőssége, itt csak tároljuk. */
  wheelchairBoarding?: number;
}

export interface TripAccessibilityIndexEntry {
  tripId: string;
  /** Nyers GTFS wheelchair_accessible érték. */
  wheelchairAccessible?: number;
}

export interface PathwayAccessibilityIndexEntry {
  pathwayId: string;
  fromStopId: string;
  toStopId: string;
  pathwayMode: number;
  isBidirectional: boolean;
  traversalTime?: number;
}

export interface AccessibilityIndex {
  provider: TransitProviderId;
  /**
   * A GTFS zip-hez kötött generáció-azonosító (lásd staticFileProvider.ts
   * "FEED FRESHNESS" szakasza) — NEM a MOTIS saját feed-generációja (azt
   * ez a repo nem látja, lásd a feature riport "maradt runtime
   * bizonytalanságok" pontját), hanem KIZÁRÓLAG ennek az indexnek a saját,
   * a bemeneti zip tartalmából (méret+mtime vagy hash) származó verziója.
   */
  generation: string;
  builtAt: string; // ISO timestamp
  stopsById: Record<string, StopAccessibilityIndexEntry>;
  tripsById: Record<string, TripAccessibilityIndexEntry>;
  pathways: PathwayAccessibilityIndexEntry[];
}

/**
 * A GTFS zip PARSZOLÁSA egy AccessibilityIndex-szé. Tiszta függvény —
 * NEM ír fájlt, NEM tud a cache-könyvtár szerkezetéről. stops.txt/trips.txt
 * a projekt jelenlegi REQUIRED_GTFS_FILES listája szerint mindig jelen
 * vannak egy már validált feltöltésben (lásd staticFileProvider.ts) — a
 * pathways.txt OPCIONÁLIS (a jelenlegi BKK feedben van, de sem a GTFS
 * spec, sem ez a projekt nem követeli meg minden feednél); ha hiányzik,
 * a pathways tömb üres, ami az accessibility.ts pathway-gráf logikájában
 * helyesen UNKNOWN-t eredményez minden station-belső kapcsolatra.
 * levels.txt jelenleg (a BKK feedben) NINCS jelen — ez a parser ezt a
 * fájlt még NEM dolgozza fel (lásd a feature riport "maradt runtime
 * bizonytalanság" pontja: ha egy jövőbeli feed levels.txt-et is hoz, a
 * pathway-gráf szint-tudatossá bővítendő).
 */
export function buildAccessibilityIndexFromGtfsZip(
  zipBuffer: Buffer,
  provider: TransitProviderId,
  generation: string
): AccessibilityIndex {
  const zip = new AdmZip(zipBuffer);

  const stopsById: Record<string, StopAccessibilityIndexEntry> = {};
  const stopsEntry = zip.getEntry("stops.txt");
  if (stopsEntry) {
    const rows = parseGtfsCsv(stopsEntry.getData().toString("utf-8"));
    for (const row of rows) {
      const stopId = row.stop_id;
      if (!stopId) continue; // védekező — egy stop_id nélküli sor nem használható, kihagyjuk (nem dobunk hibát az egész feldolgozásra)
      stopsById[stopId] = {
        stopId,
        parentStation: row.parent_station || undefined,
        wheelchairBoarding: parseOptionalGtfsInt(row.wheelchair_boarding),
      };
    }
  }

  const tripsById: Record<string, TripAccessibilityIndexEntry> = {};
  const tripsEntry = zip.getEntry("trips.txt");
  if (tripsEntry) {
    const rows = parseGtfsCsv(tripsEntry.getData().toString("utf-8"));
    for (const row of rows) {
      const tripId = row.trip_id;
      if (!tripId) continue;
      tripsById[tripId] = {
        tripId,
        wheelchairAccessible: parseOptionalGtfsInt(row.wheelchair_accessible),
      };
    }
  }

  const pathways: PathwayAccessibilityIndexEntry[] = [];
  const pathwaysEntry = zip.getEntry("pathways.txt");
  if (pathwaysEntry) {
    const rows = parseGtfsCsv(pathwaysEntry.getData().toString("utf-8"));
    for (const row of rows) {
      const pathwayId = row.pathway_id;
      const fromStopId = row.from_stop_id;
      const toStopId = row.to_stop_id;
      const modeRaw = parseOptionalGtfsInt(row.pathway_mode);
      // pathway_id/from_stop_id/to_stop_id/pathway_mode a GTFS spec szerint
      // KÖTELEZŐ mezők a pathways.txt-ben — egy ezeket nélkülöző sor
      // hibásan formázott, defenzíven kihagyjuk (nem dobunk hibát az egész
      // ingestre, de ezt a sort sem tudjuk használni a gráfban).
      if (!pathwayId || !fromStopId || !toStopId || modeRaw === undefined) continue;
      pathways.push({
        pathwayId,
        fromStopId,
        toStopId,
        pathwayMode: modeRaw,
        // GTFS spec: is_bidirectional 0 = egyirányú (from->to), 1 = kétirányú.
        // Hiányzó/érvénytelen mező esetén a spec szerinti alapértelmezés (1,
        // kétirányú) helyett INKÁBB a konzervatívabb egyirányú (false)
        // értéket választjuk — ha bizonytalan, ne állítsunk fel egy
        // esetleg nem létező visszafelé irányú accessible edge-et.
        isBidirectional: row.is_bidirectional === "1",
        traversalTime: parseOptionalGtfsInt(row.traversal_time),
      });
    }
  }

  return {
    provider,
    generation,
    builtAt: new Date().toISOString(),
    stopsById,
    tripsById,
    pathways,
  };
}
