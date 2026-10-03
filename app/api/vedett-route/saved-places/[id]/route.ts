// PATCH  /api/vedett-route/saved-places/[id] — átnevezés (RLS: csak saját)
// DELETE /api/vedett-route/saved-places/[id] — törlés (RLS: csak saját)
// Más felhasználó sora = 404 (nem szivárogtatjuk a létezését).

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { savedPlaceRenameSchema } from "@/lib/vedett-route/savedPlaces/schemas";
import { deleteOwnSavedPlace, renameOwnSavedPlace } from "@/lib/vedett-route/savedPlaces/queries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ ok: false, message: "A mentett hely nem található." }, { status: 404 });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const body = await request.json().catch(() => null);
  const parsed = savedPlaceRenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." }, { status: 400 });
  }

  try {
    const place = await renameOwnSavedPlace(id, parsed.data.displayName);
    if (!place) return notFound();
    return NextResponse.json({ ok: true, place });
  } catch {
    return NextResponse.json({ ok: false, message: "Az átnevezés sikertelen." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  try {
    const deleted = await deleteOwnSavedPlace(id);
    if (!deleted) return notFound();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: "A törlés sikertelen." }, { status: 500 });
  }
}
