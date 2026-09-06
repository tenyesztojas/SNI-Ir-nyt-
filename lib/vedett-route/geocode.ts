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

// Ismert Node.js/undici hiba: ha ugyanahhoz a hosthoz (Nominatim) sok egymást
// követő kérés érkezik keep-alive kapcsolaton, a szerver oldali kapcsolat-
// lezárás időzítése egy belső undici parser assertion-t ("assert(!this.paused)")
// válthat ki, ami process-szintű, nem elkapható kivételként omlik össze
// (lásd pl. a 25 útvonalas route-matrix teszt futása közben tapasztalt
// AssertionError-t). A "Connection: close" fejléc kikényszeríti, hogy a
// kliens minden kérés után lezárja a socketet és ne próbálja újrahasználni,
// ami elkerüli ezt a hibás kódutat. Emellett egyetlen rövid újrapróbálkozás
// is történik hálózati hiba esetén, mert a Nominatim időnként átmenetileg
// (rate limit vagy hálózati ingadozás miatt) elutasít egy kérést.
async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Connection: "close" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (attempt >= 2) throw err;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchWithRetry(url, attempt + 1);
  }
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=hu&q=${encodeURIComponent(query)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  const first = data[0];
  if (!first) return null;
  return { name: first.display_name, lat: Number(first.lat), lon: Number(first.lon) };
}
