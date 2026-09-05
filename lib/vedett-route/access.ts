// Védett Útvonal — server-side authorization helper.
//
// Ugyanazt a mintát követi, mint a projekt meglévő admin API route-jai
// (lásd app/api/admin/pwa-stats/route.ts, app/api/admin/programok/[id]/route.ts):
// 1) supabase.auth.getUser() — van-e bejelentkezett felhasználó,
// 2) profiles.role === "admin" — a service-role kliensen keresztül, hogy
//    RLS ne torzítsa el az eredményt.
//
// Ezt a helpert kell hívnia MINDEN Védett Útvonal API route-nak, mielőtt
// bármilyen adatot visszaadna. Nem admin / nincs bejelentkezve esetén 403-at
// ad vissza — sosem 200-at "üres" adattal, mert az szivárogtatná a funkció
// létezését.

import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isVedettRouteFeatureEnabled } from "./config.ts";

export type VedettRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Csak azt ellenőrzi, hogy a hívó bejelentkezett admin-e. Nem nézi a feature
 * flaget — ezt szándékosan különítjük el, hogy az admin diagnosztikai
 * (státusz) végpont akkor is elérhető legyen adminnak, ha a flag ki van
 * kapcsolva (különben soha nem lehetne látni, MIÉRT nem működik a funkció).
 */
export async function requireVedettRouteAdmin(): Promise<VedettRouteAuthResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}

/**
 * Admin ÉS feature flag ellenőrzés együtt — ezt kell hívnia minden
 * funkcionális (nem diagnosztikai) Védett Útvonal végpontnak: keresés,
 * GTFS frissítés, stb.
 */
export async function requireVedettRouteAccess(): Promise<VedettRouteAuthResult> {
  const adminCheck = await requireVedettRouteAdmin();
  if (!adminCheck.ok) return adminCheck;

  if (!isVedettRouteFeatureEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Feature disabled", message: "A Védett Útvonal funkció jelenleg ki van kapcsolva." },
        { status: 403 }
      ),
    };
  }

  return adminCheck;
}
