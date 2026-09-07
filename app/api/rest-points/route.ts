// GET  /api/rest-points  — a hívó SAJÁT pihenőpontjai (RLS + explicit auth check)
// POST /api/rest-points  — új USER forrású, PRIVATE pihenőpont létrehozása
//
// Jogosultság: requireVedettRouteAccess() — jelenleg admin_only (ugyanaz a
// kapu, mint a Védett Útvonal minden más funkciója), a jövőben egyetlen
// konstans váltásával authenticated_users-re áll (lásd access.ts, config.ts).
// A tényleges cross-user védelmet ETTŐL FÜGGETLENÜL az RLS policy-k adják
// (lásd supabase/migrations/20260907_rest_points.sql) — az API-szintű check
// egy MÁSODIK védelmi réteg, nem az egyetlen.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restPointCreateSchema } from "@/lib/rest-points/schemas";
import { listOwnRestPoints, createRestPoint } from "@/lib/rest-points/queries";

export async function GET() {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  try {
    const restPoints = await listOwnRestPoints();
    return NextResponse.json({ ok: true, restPoints });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Ismeretlen hiba." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = restPointCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  try {
    const restPoint = await createRestPoint(auth.userId, parsed.data);
    return NextResponse.json({ ok: true, restPoint }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Ismeretlen hiba." },
      { status: 500 }
    );
  }
}
