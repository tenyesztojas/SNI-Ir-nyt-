import { NextRequest, NextResponse } from "next/server";
import { parseDocxBuffer } from "@/lib/academy/docx-parser";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Nincs fájl." }, { status: 400 });
    }

    if (!file.name.endsWith(".docx")) {
      return NextResponse.json({ ok: false, error: "Csak .docx fájl fogadható el." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "A fájl mérete nem haladhatja meg a 10 MB-ot." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = parseDocxBuffer(buffer);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[docx-upload]", err);
    return NextResponse.json(
      { ok: false, error: "DOCX feldolgozása sikertelen." },
      { status: 500 }
    );
  }
}
