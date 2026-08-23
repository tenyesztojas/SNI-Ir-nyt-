// Geocoding — a projektben már használt OpenStreetMap Nominatim szolgáltatás
// újrafelhasználása (lásd scripts/geocode-places.mjs), hogy ne vezessünk be
// második geocoding szolgáltatást indokolatlanul (16. pont).
//
// Nominatim használati feltételek: max. 1 kérés/másodperc, azonosító
// User-Agent szükséges. Az admin tesztfelület egyszeri, alkalmi lekérdezést
// küld (nem tömeges geokódolást), ez a szabályzatnak megfelel.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "SNI-Iranytu-VedettUtvonal/1.0 (holvay.csaba@gmail.com)";

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=hu&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  const first = data[0];
  if (!first) return null;
  return { name: first.display_name, lat: Number(first.lat), lon: Number(first.lon) };
}
