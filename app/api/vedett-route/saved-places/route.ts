// GET  /api/vedett-route/saved-places — a hívó SAJÁT mentett helyei (RLS)
// POST /api/vedett-route/saved-places — új mentett hely (max 20, DB trigger kényszeríti)
//
// Privát helyadat: nem logolunk címet/koordinátát, service-role nincs.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { savedPlaceCreateSchema } from "@/lib/vedett-route/savedPlaces/schemas";
import { createSavedPlace, listOwnSavedPlaces, SavedPlacesLimitError } from "@/lib/vedett-route/savedPlaces/queries";

export async function GET() {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  try {
    const places = await listOwnSavedPlaces();
    return NextResponse.json({ ok: true, places });
  } catch {
    return NextResponse.json({ ok: false, message: "A mentett helyek betöltése sikertelen." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = savedPlaceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." }, { status: 400 });
  }

  try {
    const place = await createSavedPlace(auth.userId, parsed.data);
    return NextResponse.json({ ok: true, place }, { status: 201 });
  } catch (err) {
    if (err instanceof SavedPlacesLimitError) {
      return NextResponse.json(
        { ok: false, limitReached: true, message: "Legfeljebb 20 helyet menthetsz. Törölj egyet, mielőtt újat mentenél." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, message: "A hely mentése sikertelen." }, { status: 500 });
  }
}
