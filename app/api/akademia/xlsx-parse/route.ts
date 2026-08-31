import { NextResponse } from "next/server";
import AdmZip from "adm-zip";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/akademia/xlsx-parse
 * Fogad egy .xlsx fájlt (multipart/form-data, field: "file"),
 * visszaadja a sorok tömbjét: string[][] (első oszloptól kezdve).
 *
 * Elvárt oszlopok: Vezetéknév | Keresztnév | Email | Telephely | Munkakör
 * Az első sor fejléc-sor is lehet — a kliens dönti el.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "Nincs fájl." }, { status: 400 });

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json({ error: "Csak .xlsx fájl fogadható el." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "A fájl mérete legfeljebb 5 MB lehet." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const zip = new AdmZip(buffer);

    // ── 1. Shared strings ────────────────────────────────────────
    const sharedStrings: string[] = [];
    const ssEntry = zip.getEntry("xl/sharedStrings.xml");
    if (ssEntry) {
      const ssXml = ssEntry.getData().toString("utf-8");
      // <si><t>value</t></si>  or  <si><r><t>val</t></r><r><t>val2</t></r></si>
      const siRegex = /<si>([\s\S]*?)<\/si>/g;
      let siMatch: RegExpExecArray | null;
      while ((siMatch = siRegex.exec(ssXml)) !== null) {
        const inner = siMatch[1];
        // collect all <t> text nodes in this <si>
        const tRegex = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
        let tMatch: RegExpExecArray | null;
        let text = "";
        while ((tMatch = tRegex.exec(inner)) !== null) {
          text += tMatch[1];
        }
        sharedStrings.push(text);
      }
    }

    // ── 2. Worksheet ────────────────────────────────────────────
    // Try sheet1.xml; fall back to first available sheet
    let wsEntry = zip.getEntry("xl/worksheets/sheet1.xml");
    if (!wsEntry) {
      const entries = zip.getEntries();
      wsEntry = entries.find((e) => e.entryName.startsWith("xl/worksheets/sheet") && e.entryName.endsWith(".xml")) ?? null;
    }
    if (!wsEntry) return NextResponse.json({ error: "Nem olvasható az Excel fájl." }, { status: 400 });

    const wsXml = wsEntry.getData().toString("utf-8");

    // ── 3. Parse rows ────────────────────────────────────────────
    function colLetterToIndex(col: string): number {
      let idx = 0;
      for (let i = 0; i < col.length; i++) {
        idx = idx * 26 + (col.charCodeAt(i) - 64);
      }
      return idx - 1; // 0-based
    }

    const rows: string[][] = [];
    const rowRegex = /<row\s[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(wsXml)) !== null) {
      const rowNum = parseInt(rowMatch[1], 10); // 1-based
      const rowContent = rowMatch[2];
      const cells: Record<number, string> = {};
      let maxCol = 0;

      const cellRegex = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const attrs = cellMatch[1];
        const cellInner = cellMatch[2];

        // Cell ref like A1, B2, AA3
        const refMatch = /r="([A-Z]+)\d+"/.exec(attrs);
        if (!refMatch) continue;
        const colIdx = colLetterToIndex(refMatch[1]);

        // Cell type
        const tMatch = /t="([^"]*)"/.exec(attrs);
        const cellType = tMatch?.[1] ?? "";

        // Value
        const vMatch = /<v>([^<]*)<\/v>/.exec(cellInner);
        // Inline string
        const isMatch = /<is>[\s\S]*?<t>([^<]*)<\/t>[\s\S]*?<\/is>/.exec(cellInner);

        let value = "";
        if (isMatch) {
          value = isMatch[1];
        } else if (vMatch) {
          if (cellType === "s") {
            // shared string index
            const idx = parseInt(vMatch[1], 10);
            value = sharedStrings[idx] ?? "";
          } else if (cellType === "str" || cellType === "inlineStr") {
            value = vMatch[1];
          } else {
            // number or date — keep as string
            value = vMatch[1];
          }
        }

        cells[colIdx] = value;
        if (colIdx > maxCol) maxCol = colIdx;
      }

      if (Object.keys(cells).length === 0) continue;

      const row: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        row.push(cells[c] ?? "");
      }
      rows.push(row);
    }

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    console.error("xlsx-parse hiba:", err);
    return NextResponse.json({ error: "Nem sikerült az Excel fájl feldolgozása." }, { status: 500 });
  }
}
