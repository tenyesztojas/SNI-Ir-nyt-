// GET  /api/vedett-route/favorites  — a hívó SAJÁT kedvenc útvonalai (RLS + explicit auth check)
// POST /api/vedett-route/favorites  — új kedvenc útvonal (route preset) mentése
//
// Jogosultság: requireVedettRouteAccess() — UGYANAZ a kapu, mint a Védett
// Útvonal minden más funkciója (jelenleg "authenticated_users", lásd
// config.ts) — NEM készítünk külön pilot_access kaput vagy admin-only
// favorites API-t (spec 30. pont). A tényleges cross-user védelmet ETTŐL
// FÜGGETLENÜL az RLS policy-k adják (lásd
// supabase/migrations/20260909_vedett_route_favorites.sql) — az API-
// szintű check egy MÁSODIK védelmi réteg, nem az egyetlen.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { favoriteRouteCreateSchema } from "@/lib/vedett-route/favorites/schemas";
import { listOwnFavoriteRoutes, createFavoriteRoute, findDuplicateFavoriteRoute } from "@/lib/vedett-route/favorites/queries";

export async function GET() {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  try {
    const favorites = await listOwnFavoriteRoutes();
    return NextResponse.json({ ok: true, favorites });
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
  const parsed = favoriteRouteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  try {
    // Duplikáció-ellenőrzés (spec 24. pont) — user-scope (listOwnFavoriteRoutes
    // az RLS miatt már csak a hívó saját sorait adja vissza), NEM egy
    // globális UNIQUE constraint. Kulturált válasz, nem hiba.
    const duplicate = await findDuplicateFavoriteRoute(parsed.data);
    if (duplicate) {
      return NextResponse.json(
        { ok: false, duplicate: true, message: "Ez az útvonal már a kedvenceid között van.", favorite: duplicate },
        { status: 409 }
      );
    }

    const favorite = await createFavoriteRoute(auth.userId, parsed.data);
    return NextResponse.json({ ok: true, favorite }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Ismeretlen hiba." },
      { status: 500 }
    );
  }
}
