// PATCH  /api/rest-points/[id] — saját pihenőpont frissítése
// DELETE /api/rest-points/[id] — saját pihenőpont törlése
//
// Lásd app/api/rest-points/route.ts fejléce a jogosultsági rétegekről.
// A cross-user írás/törlés az RLS szintjén van tiltva (nem csak itt) —
// ha a hívott sor nem a hívóé, az UPDATE/DELETE nulla sort érint, amit
// itt 404-ként adunk vissza (nem 403-ként, hogy ne szivárogtassuk, hogy a
// sor létezik-e valaki másnál).

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restPointUpdateSchema } from "@/lib/rest-points/schemas";
import { updateOwnRestPoint, deleteOwnRestPoint } from "@/lib/rest-points/queries";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = restPointUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  try {
    const updated = await updateOwnRestPoint(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ ok: false, message: "A pihenőpont nem található." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, restPoint: updated });
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
    const deleted = await deleteOwnRestPoint(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, message: "A pihenőpont nem található." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Ismeretlen hiba." },
      { status: 500 }
    );
  }
}
