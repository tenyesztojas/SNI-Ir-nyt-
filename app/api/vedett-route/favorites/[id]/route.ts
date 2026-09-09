// PATCH  /api/vedett-route/favorites/[id] — saját kedvenc útvonal átnevezése
// DELETE /api/vedett-route/favorites/[id] — saját kedvenc útvonal törlése
//
// Lásd app/api/vedett-route/favorites/route.ts fejléce a jogosultsági
// rétegekről. A cross-user írás/törlés az RLS szintjén van tiltva (nem
// csak itt) — ha a hívott sor nem a hívóé, az UPDATE/DELETE nulla sort
// érint, amit itt 404-ként adunk vissza (nem 403-ként, hogy ne
// szivárogtassuk, hogy a sor létezik-e valaki másnál) — UGYANAZ a minta,
// mint app/api/rest-points/[id]/route.ts.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { favoriteRouteRenameSchema } from "@/lib/vedett-route/favorites/schemas";
import { renameOwnFavoriteRoute, deleteOwnFavoriteRoute } from "@/lib/vedett-route/favorites/queries";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = favoriteRouteRenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  try {
    const renamed = await renameOwnFavoriteRoute(id, parsed.data.name);
    if (!renamed) {
      return NextResponse.json({ ok: false, message: "A kedvenc útvonal nem található." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, favorite: renamed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Ismeretlen hiba." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const deleted = await deleteOwnFavoriteRoute(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, message: "A kedvenc útvonal nem található." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Ismeretlen hiba." },
      { status: 500 }
    );
  }
}
