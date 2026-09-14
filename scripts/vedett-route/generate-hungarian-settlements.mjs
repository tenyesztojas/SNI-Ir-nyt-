#!/usr/bin/env node
// Védett Útvonal — magyar településlista generátor (Round 9.1, "település-
// adatforrás korrekció").
//
// FORRÁS: KSH (Központi Statisztikai Hivatal) Helységnévtár —
// hnt_letoltes_2025.xlsx (https://www.ksh.hu/docs/helysegnevtar/hnt_letoltes_2025.xlsx).
// Ez a szkript NEM közvetlenül a ksh.hu-ról olvas (az Anthropic sandbox
// hálózati allowlistje nem engedi a ksh.hu domaint), hanem a
// https://github.com/ferenci-tamas/IrszHnk repó CSV-jét használja, ami a
// README-je szerint EBBŐL a KSH-fájlból generálódik, kiegészítve a Magyar
// Posta irányítószám-adatbázisával — az IRÁNYÍTÓSZÁM-oszlopokat itt nem
// használjuk, csak a KSH Helységnévtár-eredetű település/megye mezőket
// (Helység.megnevezése, Helység.KSH.kódja, Vármegye.megnevezése).
//
// IDŐÁLLAPOT: a felhasznált IrszHnk.csv a forrás-repó README-je szerint a
// 2026-02-09-i KSH-állapotot tükrözi.
//
// MIT CSINÁL:
//   1) Letölti a CSV-t (vagy egy már letöltött másolatot használ, ha a
//      --input kapcsolóval megadjuk).
//   2) A "Helység.KSH.kódja" (egyedi KSH-azonosító) alapján deduplikál — a
//      forrás CSV irányítószám-soronként ismétli a településeket (egy
//      településhez több irányítószám is tartozhat), ezért egyszerű
//      névszűrés/sorszámlálás Budapest 23 kerületét 23 ÖNÁLLÓ "településnek"
//      mutatná, és a nem-Budapest településeket is duplikálná.
//   3) A 23 "Budapest NN. ker." KSH-kódot EGYETLEN "Budapest" rekorddá
//      vonja össze, county: null-lal (nincs "megye"/"vármegye" Budapestnek).
//   4) A "Vármegye.megnevezése" mezőt írja át a JSON "county" mezőjébe —
//      ez a KSH-forrásban is CSAK a megye nevét tartalmazza (pl. "Pest"),
//      "vármegye"/"megye" szó NÉLKÜL — a UI-nak/teszteknek ehhez KELL
//      hozzáfűznie a " megye" szót megjelenítéskor (lásd
//      lib/vedett-route/settlementSearch.ts formatSettlementCountyLabel()).
//   5) Ellenőrzi: pontosan 3155 rekord, nincs duplikált name, minden
//      Budapesttől eltérő rekordnak van megyéje, Budapest pontosan egyszer
//      szerepel county:null-lal, pontosan 19 egyedi (Budapestet nem
//      számítva) megye van.
//   6) Kiírja a data/hungarian-settlements.json fájlt, ábécérendben.
//
// FUTTATÁS:
//   node scripts/vedett-route/generate-hungarian-settlements.mjs
//   node scripts/vedett-route/generate-hungarian-settlements.mjs --input=/path/to/IrszHnk.csv
//
// A szkript NEM fut build/deploy közben — kézzel futtatandó, amikor a
// településlistát frissíteni kell egy újabb KSH-állapotra.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE_CSV_URL = "https://raw.githubusercontent.com/ferenci-tamas/IrszHnk/master/IrszHnk.csv";
const KSH_PRIMARY_SOURCE_URL = "https://www.ksh.hu/docs/helysegnevtar/hnt_letoltes_2025.xlsx";
const SOURCE_STATE_DATE = "2026-02-09";
const EXPECTED_SETTLEMENT_COUNT = 3155;
const EXPECTED_COUNTY_COUNT = 19;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "..", "data", "hungarian-settlements.json");

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function fetchCsv(inputPath) {
  if (inputPath) {
    return readFileSync(inputPath, "utf-8");
  }
  const res = await fetch(SOURCE_CSV_URL);
  if (!res.ok) throw new Error(`Nem sikerült letölteni a forrás CSV-t: ${res.status} ${res.statusText}`);
  return await res.text();
}

// Egyszerű, a forrás CSV szerkezetéhez illő ';'-elválasztott parser —
// idézőjelezett mezőket nem kell kezelnünk (a KSH Helységnévtár-CSV nem
// tartalmaz ';' vagy '"' karaktert a releváns mezőkben).
function parseCsv(text) {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r\n|\n/).filter((l) => l.length > 0);
  const header = lines[0].split(";");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";");
    const row = {};
    header.forEach((h, idx) => (row[h] = cells[idx] ?? ""));
    rows.push(row);
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv);
  return fetchCsv(args.input).then((csvText) => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) throw new Error("A forrás CSV üres vagy nem sikerült beolvasni.");

    const byKshCode = new Map();
    for (const row of rows) {
      const code = row["Helység.KSH.kódja"];
      const name = row["Helység.megnevezése"];
      const county = row["Vármegye.megnevezése"];
      if (!code || !name) continue;
      if (!byKshCode.has(code)) byKshCode.set(code, { name, county });
    }

    const budapestCodes = [...byKshCode.entries()].filter(([, v]) => v.name.startsWith("Budapest "));
    const nonBudapest = [...byKshCode.entries()].filter(([, v]) => !v.name.startsWith("Budapest "));

    if (budapestCodes.length !== 23) {
      throw new Error(`Váratlan budapesti kerület-szám a forrásban: ${budapestCodes.length} (23 elvárt)`);
    }

    const settlements = nonBudapest.map(([, v]) => ({ name: v.name, county: v.county }));
    settlements.push({ name: "Budapest", county: null });
    settlements.sort((a, b) => a.name.localeCompare(b.name, "hu"));

    // ── Integritás-ellenőrzések (lásd a Round 9.1 spec 5. pontját) ────────
    if (settlements.length !== EXPECTED_SETTLEMENT_COUNT) {
      throw new Error(`Rekordszám nem egyezik: ${settlements.length} (${EXPECTED_SETTLEMENT_COUNT} elvárt)`);
    }
    const names = settlements.map((s) => s.name);
    if (new Set(names).size !== names.length) {
      throw new Error("Duplikált településnév található a végleges listában.");
    }
    if (settlements.some((s) => !s.name || s.name.trim().length === 0)) {
      throw new Error("Üres name mezőt találtam.");
    }
    const budapestEntries = settlements.filter((s) => s.name === "Budapest");
    if (budapestEntries.length !== 1) {
      throw new Error(`Budapestnek pontosan egyszer kell szerepelnie, jelenleg: ${budapestEntries.length}`);
    }
    if (budapestEntries[0].county !== null) {
      throw new Error("Budapest county mezőjének null-nak kell lennie.");
    }
    const nonBudapestEntries = settlements.filter((s) => s.name !== "Budapest");
    if (nonBudapestEntries.some((s) => !s.county || s.county.trim().length === 0)) {
      throw new Error("Van olyan, Budapesttől eltérő rekord, amelynek nincs érvényes megyéje.");
    }
    if (nonBudapestEntries.some((s) => /vármegye/i.test(s.county) || /\bmegye\b/i.test(s.county))) {
      throw new Error("A county mező nem tartalmazhatja a 'megye'/'vármegye' szót — csak a megye nevét.");
    }
    const counties = new Set(nonBudapestEntries.map((s) => s.county));
    if (counties.size !== EXPECTED_COUNTY_COUNT) {
      throw new Error(`Megyék száma nem egyezik: ${counties.size} (${EXPECTED_COUNTY_COUNT} elvárt) — ${[...counties].sort().join(", ")}`);
    }
    if (settlements.some((s) => /^Budapest\s*\d/.test(s.name) || /ker\.?$/i.test(s.name))) {
      throw new Error("A listában budapesti kerület-szerű bejegyzés maradt — Budapestet EGY településként kell kezelni.");
    }

    writeFileSync(OUTPUT_PATH, JSON.stringify(settlements, null, 2) + "\n", "utf-8");
    console.log(`OK — ${settlements.length} település kiírva: ${OUTPUT_PATH}`);
    console.log(`Megyék száma (Budapest nélkül): ${counties.size}`);
    console.log(`Forrás: ${KSH_PRIMARY_SOURCE_URL} (KSH Helységnévtár, ${SOURCE_STATE_DATE}-i állapot, a ${SOURCE_CSV_URL} közvetítésével)`);
  });
}

main().catch((err) => {
  console.error("HIBA:", err.message);
  process.exitCode = 1;
});
