// VPS ACCESSIBILITY SIDECAR — SZINKRONIZÁLT MÁSOLAT (Task C3, 2026-09-11).
// FORRÁS IGAZSÁG: lib/vedett-route/gtfsCsv.ts a fő Next.js repóban.
// Ez a fájl SZÁNDÉKOSAN egy külön, önálló Node folyamatba (a VPS-en futó
// accessibility sidecarba) kerül — NEM a Next.js app importálja élesben —
// ezért ide egy KARBANTARTOTT, a fő repóval szinkronban tartandó MÁSOLAT
// kerül (nem egy build-time symlink/npm workspace, mert a sidecar önálló
// deploy-egység). Bármilyen jövőbeli módosítás a fő repo gtfsCsv.ts-ében
// EZT a fájlt is frissítendővé teszi — lásd a deployment terv "sidecar
// fájlok szinkronban tartása" szakaszát.
//
// Minimális, függőségmentes GTFS CSV-sor-parser.
//
// A GTFS statikus fájlok (stops.txt, trips.txt, pathways.txt, stb.) az
// RFC 4180 CSV-alakot követik: idézőjelbe zárt mezők, amelyek TARTALMAZHATNAK
// vesszőt/sortörést/idézőjelet (dupla idézőjellel escape-elve). A projekt
// KORÁBBI, staticFileProvider.ts-beli parseFeedInfo()-ja EGY SORRA (a
// feed_info.txt egyetlen adat-sorára) egy egyszerű split(",")-öt használt —
// ez NEM alkalmas a nagy, sok-soros stops.txt/trips.txt/pathways.txt fájlokra,
// amikben (pl. megálló-nevekben) előfordulhat idézőjelbe zárt vessző. Ez a
// modul egy VALÓDI, idézőjel-tudatos CSV-sor-parsert ad, amit az
// accessibility-index építő (accessibilityIndex.ts) használ.

/** Egyetlen CSV-sor mezőkre bontása, RFC 4180 idézőjel-szabályokkal. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * Egy teljes GTFS CSV-fájl-tartalom (stops.txt/trips.txt/pathways.txt, stb.)
 * beolvasása objektumok tömbjeként, a fejléc-sor mezőneveivel kulcsolva.
 * Üres sorokat kihagyja. A BOM-ot (ha van) eltávolítja a fejléc első
 * mezőjéről — néhány GTFS export UTF-8 BOM-mal kezdi a fájlt.
 */
export function parseGtfsCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headerLine = lines[0].replace(/^﻿/, "");
  const headers = parseCsvLine(headerLine);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 1 && values[0] === "") continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = values[idx] ?? ""));
    rows.push(row);
  }
  return rows;
}

/** GTFS opcionális numerikus mező biztonságos beolvasása — üres/hibás string esetén undefined, SOSEM 0 (ami félrevezető lenne). */
export function parseOptionalGtfsInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : undefined;
}
