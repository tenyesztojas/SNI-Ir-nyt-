#!/usr/bin/env node
/**
 * check-old-key-revoked.mjs
 *
 * BIZTONSÁGI ELLENŐRZÉS a kulcsrotáció után.
 *
 * A generate-motis-rt-config.mjs minden futtatás előtt biztonsági mentést
 * készít a config.yml aktuális állapotáról (motis-data/config.yml.bak).
 * Mivel a kulcsrotáció előtti generálás a RÉGI (kompromittált) kulcsot
 * írta bele a configba, a LEGUTÓBBI .bak fájl ezt a régi kulcsot
 * tartalmazza. Ez a script kiolvassa onnan a régi kulcsot, egyetlen
 * hívást indít vele a BKK API-hoz, és ELLENŐRZI, hogy a kulcs már
 * vissza lett-e vonva — de a kulcs ÉRTÉKÉT SOHA nem írja ki, sem
 * sikeres, sem sikertelen hívás esetén.
 *
 * FUTTATÁS:
 *   node scripts/vedett-route/check-old-key-revoked.mjs
 *
 * Utána (ha a régi kulcs már vissza van vonva) BÁTRAN törölhető a
 * motis-data/config.yml.bak fájl, mert az is a régi kulcsot tartalmazza.
 */

import fs from "node:fs";
import path from "node:path";

const BAK_PATH = path.join(process.cwd(), "motis-data", "config.yml.bak");

function main() {
  if (!fs.existsSync(BAK_PATH)) {
    console.error("Nem található a motis-data/config.yml.bak fájl — nem tudjuk kiolvasni a régi kulcsot.");
    process.exit(1);
  }

  const content = fs.readFileSync(BAK_PATH, "utf-8");
  const match = content.match(/TripUpdates\.pb\?key=([^\s&"']+)/);
  if (!match) {
    console.log("A .bak fájlban nem található kulcsos TripUpdates URL — lehet, hogy ez a fájl a kulcsrotáció ELŐTTI, kulcs nélküli állapotot tartalmazza (nem a régi kulcsot). Ez esetben nincs mit ellenőrizni ezzel a scripttel.");
    process.exit(0);
  }

  const oldKey = match[1];
  const url = `https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full/TripUpdates.pb?key=${oldKey}`;

  fetch(url, { cache: "no-store" })
    .then((res) => {
      if (res.status === 401 || res.status === 403) {
        console.log(`RÉGI KULCS ELLENŐRZÉS: PASS — a régi kulcs vissza van vonva (HTTP ${res.status}).`);
        process.exit(0);
      } else if (res.ok) {
        console.log(`RÉGI KULCS ELLENŐRZÉS: FAIL — a régi kulcs MÉG MINDIG AKTÍV (HTTP ${res.status}). Vond vissza a BKK OpenData portálon!`);
        process.exit(1);
      } else {
        console.log(`RÉGI KULCS ELLENŐRZÉS: BIZONYTALAN — váratlan HTTP válasz (${res.status}), nem egyértelmű, hogy ez visszavonást jelent-e.`);
        process.exit(2);
      }
    })
    .catch((err) => {
      console.log(`RÉGI KULCS ELLENŐRZÉS: BIZONYTALAN — hálózati hiba történt (${err instanceof Error ? err.message : String(err)}), nem tudjuk megállapítani a kulcs állapotát.`);
      process.exit(2);
    });
}

main();
