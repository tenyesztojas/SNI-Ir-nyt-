// Geocoding — a projektben már használt OpenStreetMap Nominatim szolgáltatás
// újrafelhasználása (lásd scripts/geocode-places.mjs), hogy ne vezessünk be
// második geocoding szolgáltatást indokolatlanul (16. pont).
//
// Nominatim használati feltételek: max. 1 kérés/másodperc, azonosító
// User-Agent szükséges. Az admin tesztfelület egyszeri, alkalmi lekérdezést
// küld (nem tömeges geokódolást), ez a szabályzatnak megfelel.
//
// GEOCODING HARDENING (2026-09-10, "Alacskai út 63" production audit) —
// BIZONYÍTOTT root cause: a korábbi implementáció `limit=1`-gyel, minden
// validáció nélkül fogadta el az ELSŐ Nominatim találatot. Egy road/highway
// szintű találatot (utca, de KONKRÉT házszám nélkül) ugyanúgy "pontos
// címként" kezelt, mint egy valódi, házszám-szintű találatot — ez adott
// rossz koordinátát a routingnak, amit a felhasználó félrevezető
// "Nem található útvonal..." hibaként élt meg (lásd a teljes audit
// jelentést). Ez a modul mostantól MINDEN geokódolt eredményhez egy explicit
// `quality`-t is rendel:
//
//   EXACT        — a találat ország/település/utca/házszám mind igazolható
//                  (a felhasználó házszámot is adott meg, és az EGYEZIK).
//   APPROXIMATE  — az utca/település igazolható, de a házszám NEM (vagy a
//                  felhasználó nem is adott meg házszámot) — pl. egy
//                  road/highway szintű Nominatim találat. Ez a koordináta
//                  SOSEM küldhető automatikusan a routingnak pontos célként
//                  (lásd route.ts) — a hívó felelőssége, hogy erre a
//                  minőségre külön, a felhasználó felé is jelzett ágat
//                  építsen (pl. térképes célpont-kijelölés).
//   NOT_FOUND    — nincs elfogadható találat semelyik próbált lekérdezésre
//                  sem (a null visszatérési érték, VÁLTOZATLANUL, mint
//                  korábban).
//
// A minőség-megállapítás SOSEM fuzzy-találgatás: más utcanevet, más
// települést vagy más házszámot SOSEM fogad el csendben — ezekben az
// esetekben az adott találatot egyszerűen elveti (lásd evaluateNominatimResult),
// és megy a következő találatra/próbálkozásra, vagy végül NOT_FOUND-ot ad.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "SNI-Iranytu-VedettUtvonal/1.0 (holvay.csaba@gmail.com)";

// Két egymást követő Nominatim-hívás közötti minimális várakozás — a
// Nominatim használati feltételeinek megfelelően (max. 1 kérés/másodperc).
// Csak akkor kerül alkalmazásra, ha az ELŐZŐ próbálkozás semmilyen
// elfogadható találatot nem adott (tehát a legtöbb keresésnél, ahol az
// első próbálkozás sikeres, ez egyáltalán nem fut).
const NOMINATIM_RATE_LIMIT_DELAY_MS = 1100;

export type GeocodeQuality = "EXACT" | "APPROXIMATE";

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  quality: GeocodeQuality;
}

// --- Nominatim nyers válasz alakja (addressdetails=1 mellett) ---

export interface NominatimAddressDetails {
  house_number?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  postcode?: string;
  country_code?: string;
}

export interface NominatimRawResult {
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  addresstype?: string;
  address?: NominatimAddressDetails;
}

// A felhasználó által (a meglévő buildStructuredAddress() kliens-oldali
// logikájával) beírt cím-string ELVÁRT komponensei — amit a geokódolt
// találatnak igazolnia kell EXACT-hoz. Lásd parseExpectedAddressComponents().
export interface ExpectedAddressComponents {
  city: string;
  districtOrPostalCode: string | null;
  streetName: string;
  houseNumber: string | null;
}

// --- Házszám/utcanév szétválasztás (konzervatív, nem fuzzy) ---
//
// A UI-ban az "Utca, házszám" EGY szabadszöveges mező (lásd
// VedettUtvonalSearchForm.tsx "street" mező, placeholder "pl. Kossuth
// Lajos utca 12."). A házszám a mező VÉGÉN, whitespace-szel elválasztva áll,
// opcionálisan egy "/A" / "/1" jellegű albontással, opcionális záró
// ponttal. A záró pont SOSEM okozhat hamis eltérést (4. pont) — ezért itt
// leválasztjuk, mielőtt bármilyen összehasonlítás történne.
export function splitStreetAndHouseNumber(street: string): { streetName: string; houseNumber: string | null } {
  const trimmed = street.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^(.*\S)\s+(\d+(?:\/[A-Za-z0-9])?)\.?$/);
  if (!match) return { streetName: trimmed, houseNumber: null };
  return { streetName: match[1].trim(), houseNumber: match[2] };
}

// Házszám normalizálása összehasonlításhoz — záró pont eltávolítva, "/"
// utáni betű nagybetűsítve, whitespace eltávolítva. Konzervatív: ha ezután
// sem egyezik pontosan, SOSEM tekintjük egyezőnek (nincs "közeli" házszám
// elfogadás).
export function normalizeHouseNumberForCompare(value: string): string {
  return value
    .trim()
    .replace(/\.$/, "")
    .replace(/\s+/g, "")
    .replace(/\/([a-z])$/i, (_m, letter: string) => `/${letter.toUpperCase()}`);
}

// Általános szöveg-normalizálás összehasonlításhoz (utcanév, település) —
// KIZÁRÓLAG kis-nagybetű/whitespace/záró-pont különbséget tüntet el, SOHA
// nem távolít el ékezetet és SOHA nem próbál "hasonló" nevet egyeztetni
// (5./7. pont: ne fuzzy találj ki másik utcát).
export function normalizeTextForCompare(value: string): string {
  return value.trim().replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase();
}

// --- Kerület/irányítószám normalizálás (9. pont) ---
//
// A cél: "18", "18.", "XVIII", "XVIII.", "XVIII. kerület" mind egyértelműen
// "XVIII. kerület"-té normalizálódjon (a fallback free-text lekérdezésekhez
// — SOHA nem a felhasználónak beírt/megjelenített értékhez, azt a UI
// változatlanul kezeli). Ha az érték pontosan 4 számjegy, az egy
// irányítószám — VÁLTOZATLANUL visszaadva, SOSEM konvertálva kerületté
// (egy kerülethez több irányítószám tartozhat, lásd spec).
const ROMAN_DISTRICTS = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
  "XXI", "XXII", "XXIII",
];

export function normalizeDistrictOrPostalCode(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) return trimmed; // irányítószám — változatlan, SOSEM kerületté konvertálva

  // "kerület" szó (és környező whitespace/pont) leválasztása, hogy a
  // maradék tiszta arab vagy római jelölés legyen.
  const core = trimmed.replace(/kerület\.?/i, "").trim().replace(/\.$/, "").trim();

  if (/^\d{1,2}$/.test(core)) {
    const n = Number(core);
    if (n >= 1 && n <= ROMAN_DISTRICTS.length) return `${ROMAN_DISTRICTS[n - 1]}. kerület`;
  }
  const romanCandidate = core.toUpperCase();
  if (ROMAN_DISTRICTS.includes(romanCandidate)) return `${romanCandidate}. kerület`;

  // Nem ismerhető fel biztonságosan — a bemenetet ÉRINTETLENÜL adjuk
  // vissza (SOHA nem találgatunk/dobunk el adatot).
  return trimmed;
}

// --- A kliens által épített cím-string visszafejtése (KIZÁRÓLAG a
// buildStructuredAddress() SAJÁT, ismert formátumára — lásd
// VedettUtvonalSearchForm.tsx) ---
//
// buildStructuredAddress() két alakot generálhat:
//   "<irányítószám> <város>, <utca, házszám>"        (4 számjegyű irányítószám esetén)
//   "<város>, <kerület/egyéb szöveg>, <utca, házszám>" (egyébként, ha a
//                                                        kerület mező nem üres)
//   "<város>, <utca, házszám>"                        (ha a kerület mező üres)
// Ez a függvény ugyanezt a szabályt fordítja vissza — NEM egy második,
// párhuzamos cím-elemző rendszer, hanem a MEGLÉVŐ formátum ismert
// dekompozíciója, hogy a szerver validálni tudja a Nominatim találatot.
export function parseExpectedAddressComponents(query: string): ExpectedAddressComponents {
  const segments = query
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (segments.length === 0) {
    return { city: "", districtOrPostalCode: null, streetName: "", houseNumber: null };
  }

  const streetSegment = segments[segments.length - 1];
  const { streetName, houseNumber } = splitStreetAndHouseNumber(streetSegment);

  const firstSegment = segments[0];
  const postalMatch = firstSegment.match(/^(\d{4})\s+(.+)$/);

  let city: string;
  let districtOrPostalCode: string | null = null;
  if (postalMatch) {
    districtOrPostalCode = postalMatch[1];
    city = postalMatch[2].trim();
  } else {
    city = firstSegment;
    if (segments.length >= 3) districtOrPostalCode = segments[1];
  }

  return { city, districtOrPostalCode, streetName, houseNumber };
}

// --- Egyetlen Nominatim találat kiértékelése ---
//
// Visszaadja a találat minőségét ("EXACT"/"APPROXIMATE"), vagy null-t, ha a
// találat NEM fogadható el az elvárt komponensekhez (más ország/település/
// utca — ezt egyszerűen elvetjük, SOHA nem "közelítjük" egy másik helyhez).
export function evaluateNominatimResult(
  result: NominatimRawResult,
  expected: ExpectedAddressComponents
): GeocodeQuality | null {
  const addr = result.address;
  if (!addr) return null;

  const countryOk = (addr.country_code ?? "").toLowerCase() === "hu";
  if (!countryOk) return null;

  const cityCandidates = [addr.city, addr.town, addr.village, addr.municipality, addr.suburb].filter(
    (v): v is string => Boolean(v)
  );
  const expectedCity = normalizeTextForCompare(expected.city);
  const cityOk = expectedCity.length > 0 && cityCandidates.some((c) => normalizeTextForCompare(c) === expectedCity);
  if (!cityOk) return null;

  const roadCandidate = addr.road ?? "";
  const roadOk =
    expected.streetName.length > 0 && normalizeTextForCompare(roadCandidate) === normalizeTextForCompare(expected.streetName);
  if (!roadOk) return null;

  // Road/highway szintű találat (nincs konkrét házszám) — SOHA nem EXACT,
  // ahogy egy hiányzó house_number mező sem (5./20. pont).
  if (!expected.houseNumber) return "APPROXIMATE";
  if (!addr.house_number) return "APPROXIMATE";

  const houseOk = normalizeHouseNumberForCompare(addr.house_number) === normalizeHouseNumberForCompare(expected.houseNumber);
  return houseOk ? "EXACT" : "APPROXIMATE";
}

// Több találat (limit=5) közül a LEGJOBB kiválasztása — ha van EXACT
// bármelyik pozícióban, azt választjuk (7. pont: egy korábbi APPROXIMATE
// találat SOHA nem előzi meg egy későbbi EXACT-et). Ha nincs EXACT, az
// első APPROXIMATE-et választjuk. Ha semmi sem fogadható el, null.
export function pickBestGeocodeMatch(
  results: NominatimRawResult[],
  expected: ExpectedAddressComponents
): { result: NominatimRawResult; quality: GeocodeQuality } | null {
  let bestApproximate: { result: NominatimRawResult; quality: GeocodeQuality } | null = null;
  for (const r of results) {
    const quality = evaluateNominatimResult(r, expected);
    if (quality === "EXACT") return { result: r, quality };
    if (quality === "APPROXIMATE" && !bestApproximate) bestApproximate = { result: r, quality };
  }
  return bestApproximate;
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

async function fetchNominatimResults(url: string): Promise<NominatimRawResult[]> {
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const data = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as NominatimRawResult[]) : [];
}

function buildStructuredQueryUrl(expected: ExpectedAddressComponents): string {
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("addressdetails", "1");
  params.set("limit", "5");
  params.set("countrycodes", "hu");
  const street = expected.houseNumber ? `${expected.streetName} ${expected.houseNumber}` : expected.streetName;
  if (street) params.set("street", street);
  if (expected.city) params.set("city", expected.city);
  if (expected.districtOrPostalCode && /^\d{4}$/.test(expected.districtOrPostalCode)) {
    params.set("postalcode", expected.districtOrPostalCode);
  }
  return `${NOMINATIM_URL}?${params.toString()}`;
}

function buildFreeTextQueryUrl(query: string): string {
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("addressdetails", "1");
  params.set("limit", "5");
  params.set("countrycodes", "hu");
  params.set("q", query);
  return `${NOMINATIM_URL}?${params.toString()}`;
}

// Determinisztikus, legfeljebb 3 lépéses fallback-lánc (8. pont) — SOHA nem
// végtelen retry, SOHA nem generál 10+ cím-variációt:
//   1. Nominatim STRUKTURÁLT lekérdezés (street=/city=/postalcode=) — a
//      legpontosabb forma, ha Nominatim saját address-parseréhez illik.
//   2. Az EREDETI, kliens által küldött free-text string (a korábbi, ma is
//      élő viselkedés — garantáltan nem regresszál semmit, ami eddig
//      működött).
//   3. Egy egyszerűsített free-text ("<utca, házszám>, <város>, Hungary"),
//      kerület/irányítószám nélkül — arra az esetre, ha a kerület-szöveg
//      zavarja Nominatim saját elemzését.
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const expected = parseExpectedAddressComponents(query);

  const attempts: string[] = [];
  attempts.push(buildStructuredQueryUrl(expected));
  attempts.push(buildFreeTextQueryUrl(query));
  if (expected.streetName) {
    // 3. lépés (8. pont): egyszerűsített free-text, kerület/irányítószám
    // NÉLKÜL — arra az esetre, ha épp a kerület-szöveg (vagy annak hiánya/
    // formája) zavarja Nominatim saját elemzését. A normalizeDistrictOrPostalCode()
    // itt szándékosan NEM kerül bele a query-be — a 9. pont szerinti
    // normalizált kerület a STRUKTURÁLT (1.) próbálkozásban már szerepelt
    // (postalcode= paraméterként, ha 4 számjegyű), itt a cél a lehető
        // legegyszerűbb, kerület-független alak.
    const simplifiedStreet = expected.houseNumber ? `${expected.streetName} ${expected.houseNumber}` : expected.streetName;
    attempts.push(buildFreeTextQueryUrl(`${simplifiedStreet}, ${expected.city}, Hungary`));
  }

  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, NOMINATIM_RATE_LIMIT_DELAY_MS));
    const results = await fetchNominatimResults(attempts[i]);
    if (results.length === 0) continue;
    const best = pickBestGeocodeMatch(results, expected);
    if (best) {
      return { name: best.result.display_name, lat: Number(best.result.lat), lon: Number(best.result.lon), quality: best.quality };
    }
  }

  return null;
}
