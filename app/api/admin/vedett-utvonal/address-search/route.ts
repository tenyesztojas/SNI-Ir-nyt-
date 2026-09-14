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
// A válasz KIZÁRÓLAG egy tömb, legfeljebb 5 elemmel:
// [{label, lat, lon, city?, postcode?, district?}]. A `label` már a
// searchPlaceCandidates()-ben felépített, megjelenítésre kész szöveg
// (irányítószám + település[ + kerület] + utca — lásd
// toAddressAutocompleteCandidate a geocode.ts-ben). TELEPÜLÉS-ÉRZÉKENY
// RANGSOROLÁS (2026-09-14): a searchPlaceCandidates() a query-ből
// felismert település-kontextussal egyező találatokat (és Budapestet,
// alapértelmezett prioritásként) előre sorolja — ez a végpont csak
// továbbadja a MÁR rangsorolt/normalizált listát. Hálózati/Nominatim hiba
// esetén is 200 OK + üres tömb — az autocomplete hibája SOSEM blokkolhatja
// a normál, kézi címbevitelt/routingot.
//
// EXPLICIT VÁROS/KERÜLET (2026-09-14, "transit külön Város mező" hardening)
// — a bemenet opcionálisan `city`/`postalOrDistrict`-et is hordozhat (a
// transit UI külön Város és Irányítószám/kerület mezőjéből, lásd
// VedettUtvonalSearchForm.tsx) — ezeket VÁLTOZATLANUL adjuk tovább a
// searchPlaceCandidates()-nek, ami magában a Nominatim-kérésben (nem csak
// utólagos rangsorolással) a megadott városra korlátozza a keresést. Az
// autós ág (VedettUtvonalWorkspace.tsx) ezeket nem küldi — ott a régi,
// csak-query viselkedés marad.
//
// KÖRÖN KÍVÜL (szándékosan nem része ennek a sprintnek): Mapbox Search SDK,
// fuzzy matching, lokális címadatbázis, cache, analytics, keyboard
// navigáció, teljes accessibility refaktor.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { searchPlaceCandidates } from "@/lib/vedett-route/geocode";

function optionalStringField(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const q = optionalStringField(body, "q") ?? "";
  const city = optionalStringField(body, "city");
  const postalOrDistrict = optionalStringField(body, "postalOrDistrict");

  const candidates = await searchPlaceCandidates(q, { city, postalOrDistrict }).catch(() => []);

  return NextResponse.json(candidates);
}
