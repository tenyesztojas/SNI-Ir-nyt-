// POST /api/admin/vedett-utvonal/gtfs-upload
//
// Admin ÉS feature flag védett. A MÁV vasút és MÁV/Volán busz GTFS statikus
// feedjeinek NINCS dokumentált, kulcsos OpenData API-ja (ellentétben a
// BKK-val) — ezért ezt a projekt tulajdonosa manuálisan szerzi be, és ezen a
// végponton tölti fel adminként. A végpont validálja, hogy a feltöltött zip
// valóban GTFS statikus struktúrájú-e, mielőtt elmentené.
//
// multipart/form-data mezők:
//   provider: "MAV_RAIL" | "MAV_BUS"
//   file: a GTFS zip

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { ingestUploadedGtfsZip } from "@/lib/vedett-route/providers/staticFileProvider";

const PROVIDER_DIR_NAMES: Record<string, string> = {
  MAV_RAIL: "mav_rail",
  MAV_BUS: "mav_bus",
};

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB — bőven elég egy országos GTFS-nek is

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ ok: false, message: "Érvénytelen kérés (multipart/form-data szükséges)." }, { status: 400 });
  }

  const providerId = formData.get("provider");
  const file = formData.get("file");

  if (typeof providerId !== "string" || !PROVIDER_DIR_NAMES[providerId]) {
    return NextResponse.json(
      { ok: false, message: "A 'provider' mező hiányzik vagy érvénytelen (MAV_RAIL vagy MAV_BUS lehet)." },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "A 'file' mező hiányzik." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, message: "A fájl túl nagy (max. 200 MB)." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await ingestUploadedGtfsZip(PROVIDER_DIR_NAMES[providerId], buffer);
    return NextResponse.json({
      ok: true,
      provider: providerId,
      lastUpdated: result.lastUpdated,
      feedVersion: result.feedVersion,
      feedInfo: result.validation.feedInfo ?? null,
      entryCount: result.validation.entryNames.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ismeretlen hiba a feldolgozás közben.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
