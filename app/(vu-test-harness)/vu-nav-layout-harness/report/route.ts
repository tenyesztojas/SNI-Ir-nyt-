// FEJLESZTŐI TESZT-HARNESS — a szimulátoros mérés gépi riportjának fogadása.
// CSAK a CI-futtatón él: VU_LAYOUT_HARNESS=1 ÉS VU_LAYOUT_REPORT_DIR kell
// hozzá; minden más környezetben (és Vercel productionben mindig) 404.
// A riportot egy új JSON-fájlba írja a megadott könyvtárba; nem olvas, nem
// ad vissza adatot, nem érint adatbázist.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 256 * 1024;

function notFound() {
  return new Response(null, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.VU_LAYOUT_HARNESS !== "1") return notFound();
  if (process.env.VERCEL_ENV === "production") return notFound();
  const dir = process.env.VU_LAYOUT_REPORT_DIR;
  if (!dir || !path.isAbsolute(dir)) return notFound();

  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { schema?: unknown }).schema !== 1) {
    return new Response(null, { status: 400 });
  }
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `report-${Date.now()}-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify(parsed, null, 2), "utf8");
  return Response.json({ ok: true });
}

export function GET() {
  return notFound();
}
