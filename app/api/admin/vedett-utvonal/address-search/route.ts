// POST /api/admin/vedett-utvonal/address-search
//
// CÍM AUTOCOMPLETE (2026-09-14, "cím-bevitel UX" sprint). Admin ÉS feature
// flag védett (requireVedettRouteAccess — UGYANAZ a gate, mint a többi
// VédettÚtvonal végponton). Bemenet: a felhasználó ÁLTAL EDDIG BEÍRT
// szöveg (legalább 3 karakter — rövidebb esetén nincs Nominatim-hívás,
// egyszerűen üres listát adunk vissza). A MEGLÉVŐ geocoder modul
// searchPlaceCandidates() függvényét hívja (lib/vedett-route/geocode.ts) —
// NEM egy második geocoding szolgáltatás, a MEGLÉVŐ Nominatim
// free-text lekérdezést és normalizálást használja fel.
//
// A válasz KIZÁRÓLAG egy tömb, legfeljebb 5 elemmel: [{label, lat, lon}].
// Hálózati/Nominatim hiba esetén is 200 OK + üres tömb — az autocomplete
// hibája SOSEM blokkolhatja a normál, kézi címbevitelt/routingot.
//
// KÖRÖN KÍVÜL (szándékosan nem része ennek a sprintnek): Mapbox Search SDK,
// fuzzy matching, lokális címadatbázis, cache, analytics, keyboard
// navigáció, teljes accessibility refaktor.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { searchPlaceCandidates } from "@/lib/vedett-route/geocode";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const q = typeof (body as { q?: unknown } | null)?.q === "string" ? ((body as { q: string }).q) : "";

  const candidates = await searchPlaceCandidates(q).catch(() => []);

  return NextResponse.json(
    candidates.map((c) => ({
      label: c.secondary ? `${c.displayName}, ${c.secondary}` : c.displayName,
      lat: c.lat,
      lon: c.lon,
    }))
  );
}
