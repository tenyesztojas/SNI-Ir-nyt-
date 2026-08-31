/**
 * DOCX parser – adm-zip alapon (mammoth nem elérhető)
 * A DOCX fájl ZIP archívum; word/document.xml tartalmazza a fő szöveget.
 * Heading 1 → Module, Heading 2 → Lesson, Heading 3 → heading block,
 * Normal paragraph → paragraph block, lista → bullet/numbered list block
 */

import AdmZip from "adm-zip";
import type { DocxImportResult, ParsedDocxModule, ParsedDocxLesson, ParsedBlock, ContentBlockType } from "./types";

// ── XML segédfüggvények ──────────────────────────────────────────────────────

/** Egy XML tag tartalmát adja vissza (belső szöveg) */
function extractTagContent(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/** Szöveg kinyerése <w:t> elemekből */
function extractText(paraXml: string): string {
  const parts = extractTagContent(paraXml, "w:t");
  return parts
    .map((t) => t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
    .join("")
    .trim();
}

/** Stílus azonosítója az adott bekezdéshez */
function getParagraphStyle(paraXml: string): string {
  const styleMatch = paraXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
  return styleMatch ? styleMatch[1] : "Normal";
}

/** Lista azonosítója */
function getNumId(paraXml: string): string | null {
  const numMatch = paraXml.match(/<w:numId\s+w:val="(\d+)"/);
  return numMatch ? numMatch[1] : null;
}

/** Lista típusa (bullet vs numbered) */
function getNumFmt(paraXml: string, numFmtMap: Map<string, string>): "bullet" | "numbered" {
  const numId = getNumId(paraXml);
  if (!numId) return "bullet";
  const fmt = numFmtMap.get(numId) ?? "bullet";
  return fmt === "decimal" ? "numbered" : "bullet";
}

/** Félkövér-e a bekezdés (első run alapján) */
function hasBold(paraXml: string): boolean {
  return /<w:b\s*\/>|<w:b>/.test(paraXml);
}

// ── Táblázat parsere ─────────────────────────────────────────────────────────

function parseTable(tableXml: string): { headers: string[]; rows: string[][] } {
  const rowsXml = extractTagContent(tableXml, "w:tr");
  if (rowsXml.length === 0) return { headers: [], rows: [] };

  const allRows = rowsXml.map((r) =>
    extractTagContent(r, "w:tc").map((cell) => extractText(cell))
  );

  const headers = allRows[0] ?? [];
  const rows = allRows.slice(1);
  return { headers, rows };
}

// ── numbering.xml feldolgozása ────────────────────────────────────────────────

function parseNumberingFmts(numberingXml: string): Map<string, string> {
  const map = new Map<string, string>();
  // abstractNumId → numFmt
  const abstractNums = [...numberingXml.matchAll(/<w:abstractNum\s+w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g)];
  const abstractFmtMap = new Map<string, string>();

  for (const an of abstractNums) {
    const absId = an[1];
    const fmtMatch = an[0].match(/<w:numFmt\s+w:val="([^"]+)"/);
    if (fmtMatch) abstractFmtMap.set(absId, fmtMatch[1]);
  }

  // numId → abstractNumId
  const nums = [...numberingXml.matchAll(/<w:num\s+w:numId="(\d+)"[\s\S]*?<\/w:num>/g)];
  for (const n of nums) {
    const numId = n[1];
    const absMatch = n[0].match(/<w:abstractNumId\s+w:val="(\d+)"/);
    if (absMatch) {
      const fmt = abstractFmtMap.get(absMatch[1]) ?? "bullet";
      map.set(numId, fmt);
    }
  }

  return map;
}

// ── Fő parser ─────────────────────────────────────────────────────────────────

export function parseDocxBuffer(buffer: Buffer): DocxImportResult {
  const warnings: string[] = [];
  const modules: ParsedDocxModule[] = [];

  let docXml = "";
  let numberingXml = "";

  try {
    const zip = new AdmZip(buffer);
    const docEntry = zip.getEntry("word/document.xml");
    if (!docEntry) {
      return { modules: [], warnings: ["word/document.xml nem található a fájlban."] };
    }
    docXml = docEntry.getData().toString("utf-8");

    const numEntry = zip.getEntry("word/numbering.xml");
    if (numEntry) {
      numberingXml = numEntry.getData().toString("utf-8");
    }
  } catch {
    return { modules: [], warnings: ["A fájl nem olvasható vagy érvénytelen DOCX formátum."] };
  }

  // Lista formátumok kinyerése
  const numFmtMap = numberingXml ? parseNumberingFmts(numberingXml) : new Map<string, string>();

  // Bekezdések kinyerése
  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) {
    return { modules: [], warnings: ["Üres dokumentum vagy nem feldolgozható struktúra."] };
  }

  const bodyXml = bodyMatch[1];

  // Bekezdések és táblázatok szétválasztása
  const elements: { type: "para" | "table"; xml: string }[] = [];
  const elementRe = /(<w:p[\s>][\s\S]*?<\/w:p>|<w:tbl[\s>][\s\S]*?<\/w:tbl>)/g;
  let em;
  while ((em = elementRe.exec(bodyXml)) !== null) {
    const xml = em[1];
    if (xml.startsWith("<w:tbl")) {
      elements.push({ type: "table", xml });
    } else {
      elements.push({ type: "para", xml });
    }
  }

  // Feldolgozás
  let currentModule: ParsedDocxModule | null = null;
  let currentLesson: ParsedDocxLesson | null = null;
  let listBuffer: { type: "bullet" | "numbered"; items: string[] } | null = null;

  function flushList() {
    if (!listBuffer || !currentLesson) return;
    const blockType: ContentBlockType =
      listBuffer.type === "numbered" ? "numbered_list" : "bullet_list";
    currentLesson.blocks.push({
      type: blockType,
      content: { items: listBuffer.items },
      order: currentLesson.blocks.length,
    });
    listBuffer = null;
  }

  function addBlock(lesson: ParsedDocxLesson, type: ContentBlockType, content: Record<string, unknown>) {
    lesson.blocks.push({ type, content, order: lesson.blocks.length });
  }

  for (const el of elements) {
    if (el.type === "table") {
      flushList();
      if (currentLesson) {
        const tableData = parseTable(el.xml);
        if (tableData.headers.length > 0 || tableData.rows.length > 0) {
          addBlock(currentLesson, "table", tableData);
        }
      }
      continue;
    }

    // Bekezdés
    const style = getParagraphStyle(el.xml);
    const text = extractText(el.xml);
    const numId = getNumId(el.xml);

    // Lista elem?
    if (numId) {
      const listType = getNumFmt(el.xml, numFmtMap);
      if (text) {
        if (!listBuffer) {
          listBuffer = { type: listType, items: [] };
        }
        listBuffer.items.push(text);
      }
      continue;
    }

    // Lista vége
    flushList();

    if (!text) continue;

    const styleLower = style.toLowerCase();

    // Heading 1 → új modul
    if (styleLower.includes("heading1") || styleLower.includes("1. szint") || style === "Heading1") {
      currentModule = { title: text, lessons: [] };
      modules.push(currentModule);
      currentLesson = null;
      continue;
    }

    // Heading 2 → új lecke
    if (styleLower.includes("heading2") || styleLower.includes("2. szint") || style === "Heading2") {
      if (!currentModule) {
        currentModule = { title: "1. Modul", lessons: [] };
        modules.push(currentModule);
        warnings.push("Heading 2 modul nélkül: automatikus modul létrehozva.");
      }
      currentLesson = { title: text, blocks: [] };
      currentModule.lessons.push(currentLesson);
      continue;
    }

    // Heading 3 → heading blokk
    if (styleLower.includes("heading3") || styleLower.includes("3. szint") || style === "Heading3") {
      if (!currentLesson) {
        warnings.push(`Heading 3 lecke nélkül: "${text}" kihagyva.`);
        continue;
      }
      addBlock(currentLesson, "heading", { text, level: 3 });
      continue;
    }

    // Normál bekezdés
    if (currentLesson) {
      addBlock(currentLesson, "paragraph", { text });
    } else if (currentModule) {
      // Modul szintű bekezdés → első lecke vagy elvetés
      warnings.push(`Modul szintű szöveg (nem leckéhez rendelve): "${text.slice(0, 60)}"`);
    }
    // Ha nincs modul sem: elvetjük
  }

  flushList();

  if (modules.length === 0) {
    warnings.push("Nem sikerült modulokat azonosítani. Ellenőrizd a Heading 1 és Heading 2 stílusokat a Word dokumentumban.");
  }

  return { modules, warnings };
}
