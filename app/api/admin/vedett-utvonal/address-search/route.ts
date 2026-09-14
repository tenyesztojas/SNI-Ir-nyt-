// POST /api/admin/vedett-utvonal/address-search
//
// MAPBOX SEARCH BOX AUTOCOMPLETE (2026-09-14, "kredittakarékos sprint —
// Mapbox Search Box autocomplete"). A transit (és car) cím-autocomplete
// providere Nominatimról a Mapbox Search Box `/suggest` végpontjára
// váltott — a Nominatim ÖNMAGÁBAN nem adott megfelelő PREFIX-alapú
// autocomplete-et (pl. "szab" nem adott "Szabadság út" találatot, csak a
// (majdnem) teljes utcanévnél). A MEGLÉVŐ Nominatim geocoder
// (lib/vedett-route/geocode.ts: searchPlaceCandidates/geocodeAddress)
// VÁLTOZATLAN marad — a normál routing-geokódolás továbbra is azt
// használja, EZ a végpont csak nem hívja többé (ez volt az egyetlen
// hívóhelye).
//
// A Mapbox access tokent a MEGLÉVŐ szerveroldali MAPBOX_ACCESS_TOKEN env
// variable-ből olvassuk (UGYANAZ env var, mint a /car-route végponton) —
// SOSEM küldjük vissza a kliensnek, SOSEM hardcode-oljuk. Ha a token
// hiányzik, a Mapbox hibázik, vagy timeoutol: 200 OK + ÜRES tömb — az
// autocomplete hibája SOSEM blokkolhatja a kézi címbevitelt/routingot.
//
// QUERY: a hívó (useAddressAutocomplete.ts) a MEGLÉVŐ `city`/
// `postalOrDistrict` mezőt is átadja — ha van város, a Mapboxnak küldött
// keresési szöveg "<q>, <city>[, <postalOrDistrict>]" (pl.
// "szab, Budaörs") — lásd buildMapboxSuggestSearchText(). language=hu,
// limit=5, country=hu, session_token A KLIENS ÁLTAL generált, egy
// autocomplete-interakción belül stabil tokenje — ez a végpont SOHA nem
// generál új sessiont, csak továbbadja.
//
// PREFIX HARDENING + a Mapbox-mezőkből épített label: lásd
// lib/vedett-route/addressAutocompleteMapbox.ts (processMapboxSuggestFeatures)
// — ez a TISZTA, Next.js-mentes segédmodul, amit a teszt is közvetlenül
// importálhat (a route.ts maga a "next/server" importja miatt nem
// futtatható közvetlenül node --test alatt, a projekt meglévő
// mintájának megfelelően).
//
// KÖRÖN KÍVÜL (szándékosan nem része ennek a sprintnek): Mapbox Search JS
// SDK, npm dependency, cache, analytics, teljes routing-refaktor — a
// kiválasztott javaslat pontos koordinátája a MEGLÉVŐ (kis, önálló)
// /api/admin/vedett-utvonal/address-retrieve végponton kérhető le, de a
// MOTIS transit routing továbbra is a MEGLÉVŐ cím-szöveg alapú útját
// használja (nincs bekötve).

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { buildMapboxSuggestSearchText, processMapboxSuggestFeatures, type MapboxSuggestFeature } from "@/lib/vedett-route/addressAutocompleteMapbox";

const MAPBOX_SUGGEST_URL = "https://api.mapbox.com/search/searchbox/v1/suggest";

function optionalStringField(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const q = (optionalStringField(body, "q") ?? "").trim();
  const city = optionalStringField(body, "city")?.trim();
  const postalOrDistrict = optionalStringField(body, "postalOrDistrict")?.trim();
  const sessionToken = optionalStringField(body, "sessionToken")?.trim();

  // Minimum 3 karakter — VÁLTOZATLAN szabály. Session token nélkül sem
  // hívjuk a Mapboxot (a Search Box API session-alapú).
  if (q.length < 3 || !sessionToken) {
    return NextResponse.json([]);
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json([]);
  }

  const searchText = buildMapboxSuggestSearchText(q, city, postalOrDistrict);

  const params = new URLSearchParams();
  params.set("q", searchText);
  params.set("session_token", sessionToken);
  params.set("access_token", accessToken);
  params.set("language", "hu");
  params.set("limit", "5");
  params.set("country", "hu");

  let mapboxResponse: Response;
  try {
    mapboxResponse = await fetch(`${MAPBOX_SUGGEST_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return NextResponse.json([]);
  }

  if (!mapboxResponse.ok) {
    return NextResponse.json([]);
  }

  const data: unknown = await mapboxResponse.json().catch(() => null);
  const rawSuggestions = (data as { suggestions?: MapboxSuggestFeature[] } | null)?.suggestions ?? [];

  const suggestions = processMapboxSuggestFeatures(rawSuggestions, q, sessionToken, 5);

  return NextResponse.json(suggestions);
}
