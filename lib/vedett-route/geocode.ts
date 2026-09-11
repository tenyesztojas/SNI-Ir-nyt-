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
//                  (a felhasználó házszámot is adott meg, és az EGYEZIK),
//                  VAGY a találat egy konkrét, nevesített OSM hely/POI/
//                  állomás (lásd GEOCODING GENERALIZÁCIÓ lent) — mindkét
//                  eset routing-biztos koordinátát ad.
//   APPROXIMATE  — az utca/település igazolható, de a házszám NEM (vagy a
//                  felhasználó nem is adott meg házszámot) — pl. egy
//                  road/highway szintű Nominatim találat, KONKRÉT nevesített
//                  hely-azonosság nélkül. Ez a koordináta SOSEM küldhető
//                  automatikusan a routingnak pontos célként (lásd route.ts)
//                  — a hívó felelőssége, hogy erre a minőségre külön, a
//                  felhasználó felé is jelzett ágat építsen (pl. térképes
//                  célpont-kijelölés).
//   NOT_FOUND    — nincs elfogadható találat semelyik próbált lekérdezésre
//                  sem (a null visszatérési érték, VÁLTOZATLANUL, mint
//                  korábban).
//
// A minőség-megállapítás SOSEM fuzzy-találgatás: más utcanevet, más
// települést vagy más házszámot SOSEM fogad el csendben — ezekben az
// esetekben az adott találatot egyszerűen elveti (lásd evaluateNominatimResult),
// és megy a következő találatra/próbálkozásra, vagy végül NOT_FOUND-ot ad.
//
// GEOCODING GENERALIZÁCIÓ (2026-09-11, "csak klasszikus postai cím"
// production audit) — BIZONYÍTOTT root cause: az `evaluateNominatimResult`
// KIZÁRÓLAG cím-jellegű találatokat (addr.city + addr.road egyezés) fogadott
// el — egy nevesített OSM helynek/POI-nak/állomásnak/térnek (pl. "Deák tér",
// "Etele Plaza", "Kelenföld vasútállomás", "Astoria") NEM volt elfogadási
// útja, mert ezeknél a saját nevük NEM az addr.road mezőben él, hanem a
// display_name/namedetails.name mezőben, és gyakran addr.road-juk is
// hiányzik vagy más (a POI "road" mezője, ha van, egy MELLETTE lévő utcát
// jelöl, nem saját magát). Emellett `parseExpectedAddressComponents` egy
// vessző nélküli, egyszavas szabadszöveges keresésnél (pl. "Deák tér")
// ÉRTELMETLEN city/street felbontást adott (mindkettő a teljes bemenetre
// állt) — ez azonban NEM okoz hibát, mert a lenti POI-elfogadási ág
// (isBareRoadOnlyResult / scoreNamedPlaceResult / pickBestNamedPlaceMatch)
// SOSEM az `expected.city`-re épül, hanem KIZÁRÓLAG a nevesített hely saját
// nevének (namedetails.name / display_name első szegmense) a keresett
// szöveghez viszonyított egyezésére.
//
// A megoldás ELVE (a specifikáció szerint, NEM névegyezés-alapú hardcoded
// POI-lista): ha a Nominatim egy KONKRÉT, nevesített OSM objektumot ad
// vissza — bármilyen class/type (place, railway, public_transport, amenity,
// shop, tourism, leisure, office, historic, building, egyéb nevesített POI)
// —, ÉS ez NEM egy puszta, ház­szám nélküli road/highway-szegmens (lásd
// isBareRoadOnlyResult), ÉS a találat SAJÁT NEVE kellően közel áll a
// keresett szöveghez (pontos egyezés vagy egyik-a-másik-prefixe — SOSEM
// fuzzy/hasonlósági találgatás, ugyanaz a konzervatív elv, mint a cím-
// egyeztetésnél), AKKOR ez egy elfogadható, routing-biztos ("EXACT" minőségű
// wire-értékkel jelzett) hely — a "POI ≠ közelítő cím" megkülönböztetés
// pontosan ez: egy nevesített hely saját létezése MÁS bizonyíték, mint egy
// utca-egyezés hiányzó házszámmal.
//
// Házszám-levágásos fallback (pl. "Deák tér 85", "Etele Plaza 12",
// "Kelenföld vasútállomás 3"): a MEGLÉVŐ splitStreetAndHouseNumber() már
// eddig is levágta a végén álló, házszám-alakú tokent — ez a POI-elfogadási
// ág mindig a levágott `expected.streetName`-hez (SOHA a nyers, házszámot
// is tartalmazó szöveghez) hasonlítja a találat nevét. Emiatt a
// "Rákóczi út 999" eset NEM válik hamisan elfogadottá: a 999-es házszám
// nélküli "Rákóczi út" találat `isBareRoadOnlyResult` szerint puszta út,
// a POI-ág explicit kizárja — ez marad APPROXIMATE, ahogy korábban is.
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
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

// --- Nominatim nyers válasz alakja (addressdetails=1, namedetails=1 mellett) ---

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

// A Nominatim `namedetails=1` paraméterrel adott, a hely SAJÁT nevét (és
// esetleges nyelvi variánsait, pl. `name:hu`/`name:en`) tartalmazó mező — ez
// a POI-elfogadási ág elsődleges forrása a hely nevéhez (megbízhatóbb, mint
// a display_name vesszős felsorolásának első szegmense, amikor jelen van).
export interface NominatimNameDetails {
  name?: string;
  [key: string]: string | undefined;
}

export interface NominatimRawResult {
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  addresstype?: string;
  // Nominatim relevancia-pontszáma (0-1), ha a válasz tartalmazza — a
  // rangsoroláshoz használt, KIEGÉSZÍTŐ (nem kizárólagos) szempont, lásd
  // scoreNamedPlaceResult.
  importance?: number;
  namedetails?: NominatimNameDetails;
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
// Lajos utca 12." — VAGY egy nevesített hely, pl. "Deák tér", "Etele
// Plaza", ha a Város/Kerület mezők üresen maradnak, lásd
// isManualAddressComplete). A házszám a mező VÉGÉN, whitespace-szel
// elválasztva áll, opcionálisan egy "/A" / "/1" jellegű albontással,
// opcionális záró ponttal. A záró pont SOSEM okozhat hamis eltérést (4.
// pont) — ezért itt leválasztjuk, mielőtt bármilyen összehasonlítás
// történne. UGYANEZ a levágás szolgál a POI-k házszám-szerű utótagjának
// levágásához is (pl. "Deák tér 85" -> "Deák tér") — nincs külön, második
// levágó logika a POI-khoz, a MEGLÉVŐ, cím-célra írt függvény újrahasznált.
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

// Általános szöveg-normalizálás összehasonlításhoz (utcanév, település,
// nevesített hely neve) — KIZÁRÓLAG kis-nagybetű/whitespace/záró-pont
// különbséget tüntet el, SOHA nem távolít el ékezetet és SOHA nem próbál
// "hasonló" nevet egyeztetni (5./7. pont: ne fuzzy találj ki másik
// utcát/helyet).
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
// buildStructuredAddress() három alakot generálhat:
//   "<irányítószám> <város>, <utca, házszám>"        (4 számjegyű irányítószám esetén)
//   "<város>, <kerület/egyéb szöveg>, <utca, házszám>" (egyébként, ha a
//                                                        kerület mező nem üres)
//   "<város>, <utca, házszám>"                        (ha a kerület mező üres)
// Ez a függvény ugyanezt a szabályt fordítja vissza — NEM egy második,
// párhuzamos cím-elemző rendszer, hanem a MEGLÉVŐ formátum ismert
// dekompozíciója, hogy a szerver validálni tudja a Nominatim találatot.
//
// GEOCODING GENERALIZÁCIÓ (2026-09-11) — a kerület-komponenst mostantól a
// MEGLÉVŐ normalizeDistrictOrPostalCode()-on átfuttatva tároljuk (kanonikus
// "XVIII. kerület" alakban), hogy "VIII"/"Viii"/"8" stb. a lenti free-text
// lekérdezésekben (lásd buildCanonicalFreeTextQuery) MINDIG ugyanazt az
// egyértelmű formát kapja — ez SOHA nem érinti a UI-ban megjelenő/tárolt
// eredeti értéket (az csak itt, a geokódoláshoz készül).  Egy szabad-
// szöveges (kerület/város nélküli, pl. "Deák tér") keresésnél a
// districtOrPostalCode marad `null`.
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
    if (segments.length >= 3) districtOrPostalCode = normalizeDistrictOrPostalCode(segments[1]);
  }

  return { city, districtOrPostalCode, streetName, houseNumber };
}

// --- Egyetlen Nominatim találat kiértékelése (KLASSZIKUS CÍM-EGYEZÉS) ---
//
// Visszaadja a találat minőségét ("EXACT"/"APPROXIMATE"), vagy null-t, ha a
// találat NEM fogadható el az elvárt komponensekhez (más ország/település/
// utca — ezt egyszerűen elvetjük, SOHA nem "közelítjük" egy másik helyhez).
//
// FONTOS: ez a függvény KIZÁRÓLAG a cím-egyezés (város+utca[+házszám])
// útját írja le — VÁLTOZATLAN a 2026-09-10-es hardening óta. A nevesített
// OSM hely/POI/állomás elfogadási útja EGY MÁSIK, ÖNÁLLÓ függvény
// (scoreNamedPlaceResult/pickBestNamedPlaceMatch, lent) — ez a
// szétválasztás pontosan az, ami a "POI ≠ közelítő cím" megkülönböztetést
// (3. pont) kódszinten kikényszeríti: egyik út SOHA nem helyettesíti vagy
// gyengíti a másikat.
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

// --- Nevesített OSM hely/POI/állomás elfogadási útja (GEOCODING
// GENERALIZÁCIÓ, 2026-09-11) ---
//
// Ez a modul NEM tart hardcoded listát konkrét helynevekről (pl. "Kelenföld",
// "Etele Plaza", "Aréna Plaza") — ehelyett a Nominatim válasz SAJÁT,
// strukturált mezőire (addresstype/class, namedetails/display_name,
// address.*, opcionálisan importance) épít, teljesen általánosan, bármilyen
// OSM class/type-ra (place, railway, public_transport, amenity, shop,
// tourism, leisure, office, historic, building, egyéb nevesített POI).

// Konzervatívan felismerhető "puszta út/highway-szegmens" osztályok —
// KIZÁRÓLAG arra szolgálnak, hogy egy házszám nélküli road-találatot NE
// engedjünk automatikusan nevesített helyként elfogadni (ez adná vissza a
// pontosan azt a hibát, amit a 2026-09-10-es hardening már kizárt: egy
// utca-szegmens SOSEM lehet automatikusan "pontos cél"). Ez NEM egy
// elfogadási whitelist (2. pont: "egy hardcoded class/type whitelist nem
// lehet a KIZÁRÓLAGOS elfogadási kapu") — épp ellenkezőleg, ez egy SZŰK,
// kizárási feltétel: MINDEN MÁS class/type/addresstype (nevesített hely,
// POI, állomás, tér, stb.) átmegy ezen a szűrőn, és a lenti
// scoreNamedPlaceResult dönt a névegyezés alapján.
export function isBareRoadOnlyResult(result: NominatimRawResult): boolean {
  // Ha VAN konkrét házszám a találatban, az már definíció szerint nem
  // "puszta" út-szegmens — ez a cím-egyeztető úton (evaluateNominatimResult)
  // amúgy is helyesen kezelt eset, ide nem is kellene eljutnia, de a
  // védekezés itt is helyes.
  if (result.address?.house_number) return false;
  const addresstype = (result.addresstype ?? "").toLowerCase();
  if (addresstype === "road") return true;
  // Ha az addresstype hiányzik (nem minden Nominatim válasz adja meg), a
  // class="highway" a legjobb elérhető jelzés egy puszta útszegmensre.
  const klass = (result.class ?? "").toLowerCase();
  if (!addresstype && klass === "highway") return true;
  return false;
}

// A találat SAJÁT NEVE — elsődlegesen a namedetails.name (ha a Nominatim
// válasz namedetails=1 mellett adja), másodlagosan a display_name vesszős
// felsorolásának ELSŐ szegmense (a találat maga, nem a település/ország
// rész). Ez a "saját név", amit a keresett szöveghez hasonlítunk — SOHA nem
// az addr.road mezőt (ami egy POI esetén jellemzően a MELLETTE lévő utcát
// jelöli, nem a POI saját nevét).
export function getResultPrimaryName(result: NominatimRawResult): string {
  const fromNameDetails = result.namedetails?.name;
  if (fromNameDetails && fromNameDetails.trim().length > 0) return fromNameDetails.trim();
  return (result.display_name ?? "").split(",")[0]?.trim() ?? "";
}

// Egyetlen találat pontszáma nevesített helyként a `query` szöveghez
// viszonyítva — vagy `null`, ha a találat EGYÁLTALÁN NEM fogadható el
// nevesített helyként (puszta út, más ország, vagy a neve túl távol áll a
// keresett szövegtől). A pontszám SOHA nem fuzzy-hasonlóság — kizárólag
// PONTOS egyezés vagy prefix-egyezés (a keresett szöveg a találat neve
// eleje, vagy fordítva — pl. "Kelenföld" keresés "Kelenföld vasútállomás"
// találatra, vagy "Deák tér" keresés "Deák Ferenc tér" találatra) adhat
// pontot; egy MÁSIK, hasonló nevű, de eltérő hely SOHA nem kap pontot (6.
// pont: "Astoria" ne oldódjon fel egy távoli, csak véletlenül hasonló nevű
// találatra).
export function scoreNamedPlaceResult(result: NominatimRawResult, query: string): number | null {
  if (isBareRoadOnlyResult(result)) return null;
  if (!result.lat || !result.lon) return null;
  if (Number.isNaN(Number(result.lat)) || Number.isNaN(Number(result.lon))) return null;

  const addr = result.address;
  if (addr && addr.country_code && addr.country_code.toLowerCase() !== "hu") return null;

  const primaryName = getResultPrimaryName(result);
  const normalizedPrimary = normalizeTextForCompare(primaryName);
  const normalizedQuery = normalizeTextForCompare(query);
  if (!normalizedPrimary || !normalizedQuery) return null;

  let score: number;
  if (normalizedPrimary === normalizedQuery) {
    score = 100;
  } else if (normalizedPrimary.startsWith(`${normalizedQuery} `) || normalizedQuery.startsWith(`${normalizedPrimary} `)) {
    // Szó-határon vett prefix-egyezés (pl. "Kelenföld" <-> "Kelenföld
    // vasútállomás") — SOSEM puszta karakterlánc-prefix (ami "Deák" <->
    // "Deáki utca"-t is hamisan egyeztetné).
    score = 60;
  } else {
    return null;
  }

  const cityCandidates = [addr?.city, addr?.town, addr?.village, addr?.municipality, addr?.suburb].filter(
    (v): v is string => Boolean(v)
  );
  if (cityCandidates.some((c) => normalizeTextForCompare(c) === "budapest")) score += 10;

  if (typeof result.importance === "number" && !Number.isNaN(result.importance)) {
    score += result.importance * 5;
  }

  return score;
}

// GEOCODING KORREKCIÓ (2026-09-11, C4.1, "többértelmű találatok" pont) —
// eddig egy közeli/egyenálló pontszámú találat-pár egyszerűen `null`-ra
// esett vissza (biztonságos, de gyenge UX: a felhasználó egy generikus
// "nem található" hibát kapott, holott a rendszer VALÓJÁBAN tudta, hogy
// TÖBB reális jelölt közül kellene választani). Az alábbi
// classifyNamedPlaceCandidates() ezt egy KÜLÖN, EXPLICIT "AMBIGUOUS"
// állapotként adja tovább, a jelölt-listával együtt — determinisztikus,
// tesztelhető küszöbbel (AMBIGUOUS_SCORE_GAP_THRESHOLD), SOHA nem fuzzy
// találgatással.
export interface NamedPlaceClassification {
  status: "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND";
  // RESOLVED esetén pontosan egy elem; AMBIGUOUS esetén a legjobb (max 5)
  // jelölt, pontszám szerint csökkenő sorrendben; NOT_FOUND esetén üres.
  candidates: NominatimRawResult[];
}

export const AMBIGUOUS_SCORE_GAP_THRESHOLD = 10;
export const MAX_AMBIGUOUS_CANDIDATES = 5;

// Több találat közül a nevesített hely(ek) kiválasztása, EXPLICIT
// RESOLVED/AMBIGUOUS/NOT_FOUND minősítéssel:
//   - NOT_FOUND: egyetlen találat sem fogadható el nevesített helyként
//     (lásd scoreNamedPlaceResult — pl. csak puszta út/highway van, vagy
//     semelyik név nem egyezik).
//   - RESOLVED: pontosan egy elfogadható találat van, VAGY a legjobb
//     találat pontszáma legalább AMBIGUOUS_SCORE_GAP_THRESHOLD-dal
//     meghaladja a második legjobbét — ez egy EGYÉRTELMŰ, biztonságos
//     győztes (pl. "Astoria" Budapest-kontextussal egy Budapest-kontextus
//     nélküli, azonos nevű találat ELLEN — a Budapest-bónusz önmagában
//     elegendő különbség).
//   - AMBIGUOUS: két vagy több találat pontszáma túl közel van egymáshoz
//     (a küszöbnél kisebb a különbség, VALÓDI egyenállást is beleértve) —
//     a hívó a legjobb (max MAX_AMBIGUOUS_CANDIDATES) jelöltet kapja
//     vissza, SOHA nem egy találgatott végleges választ.
// A küszöb egy egyszerű, determinisztikus szám — NEM fuzzy/hasonlósági
// logika, és NEM egyetlen konkrét helynévre hangolt (2./6. pont).
export function classifyNamedPlaceCandidates(results: NominatimRawResult[], query: string): NamedPlaceClassification {
  const scored = results
    .map((result) => ({ result, score: scoreNamedPlaceResult(result, query) }))
    .filter((s): s is { result: NominatimRawResult; score: number } => s.score !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: "NOT_FOUND", candidates: [] };
  if (scored.length === 1) return { status: "RESOLVED", candidates: [scored[0].result] };

  const gap = scored[0].score - scored[1].score;
  if (gap >= AMBIGUOUS_SCORE_GAP_THRESHOLD) {
    return { status: "RESOLVED", candidates: [scored[0].result] };
  }
  return { status: "AMBIGUOUS", candidates: scored.slice(0, MAX_AMBIGUOUS_CANDIDATES).map((s) => s.result) };
}

// Több találat közül a LEGJOBB nevesített hely kiválasztása — VÁLTOZATLAN
// KÜLSŐ SZERZŐDÉS (2026-09-10 óta): pontos győztes esetén a találatot adja
// vissza, egyébként (nincs elfogadható találat, VAGY a legjobbak túl közel
// vannak egymáshoz — ideértve a valódi egyenállást is) `null`-t ad, a
// találgatás helyett. Belsőleg mostantól a fenti classifyNamedPlaceCandidates()-re
// épül (ugyanaz az egységes RESOLVED/AMBIGUOUS/NOT_FOUND logika), hogy két
// külön, egymástól elcsúszható szabály SOHA ne élhessen egymás mellett.
export function pickBestNamedPlaceMatch(results: NominatimRawResult[], query: string): NominatimRawResult | null {
  const classification = classifyNamedPlaceCandidates(results, query);
  return classification.status === "RESOLVED" ? classification.candidates[0] : null;
}

// --- Többértelmű találatok — kliensnek adható, MINIMÁLIS jelölt-alak ---
//
// A kliens SOHA nem kap nyers Nominatim objektumot (osm_id/class/type/
// address.* stb.) — csak ennyit, ami egy egyszerű választólistához kell.
// `secondary` egy egyszerű, magyar, EMBERI helyinformáció (kerület/
// település), SOHA nem nyers OSM class/type string.
export interface GeocodePlaceCandidate {
  displayName: string;
  lat: number;
  lon: number;
  secondary?: string;
}

// A "másodlagos" helyinformáció — kizárólag addr.suburb/addr.city (vagy
// town/village) mezőkből, sosem class/type-ból. Hiányukban `undefined`
// (a kliens ilyenkor egyszerűen nem jelenít meg második sort).
function buildCandidateSecondaryLabel(result: NominatimRawResult): string | undefined {
  const addr = result.address;
  const parts = [addr?.suburb, addr?.city ?? addr?.town ?? addr?.village].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (parts.length === 0) return undefined;
  // Ne ismételjük a mezőt, ha suburb és city véletlenül azonos szöveg.
  const deduped = parts.filter((v, i) => parts.indexOf(v) === i);
  return deduped.join(", ");
}

export function toPlaceCandidate(result: NominatimRawResult): GeocodePlaceCandidate {
  const displayName = getResultPrimaryName(result) || result.display_name;
  return {
    displayName,
    lat: Number(result.lat),
    lon: Number(result.lon),
    secondary: buildCandidateSecondaryLabel(result),
  };
}

// Egy már RESOLVED/AMBIGUOUS geokódolt válasz — a geocodeAddress() ÚJ,
// bővített visszatérési típusának a "többértelmű" ága. Szándékosan NEM egy
// harmadik GeocodeQuality-érték (a meglévő EXACT/APPROXIMATE wire-szerződés
// VÁLTOZATLAN marad mindenhol, ahol egyetlen eredmény van) — ez egy KÜLÖN,
// megkülönböztethető alak (`ambiguous: true`), amit a route.ts egy explicit
// type guarddal (lásd isAmbiguousGeocodeResult) different ágra irányít,
// MIELŐTT a `.quality` mezőhöz egyáltalán hozzáférne.
export interface AmbiguousGeocodeResult {
  ambiguous: true;
  candidates: GeocodePlaceCandidate[];
}

export function isAmbiguousGeocodeResult(
  value: GeocodeResult | AmbiguousGeocodeResult
): value is AmbiguousGeocodeResult {
  return (value as AmbiguousGeocodeResult).ambiguous === true;
}

// A kanonikus (normalizált kerülettel összeállított) free-text lekérdezés —
// ugyanazt a formázási szabályt követi, mint a kliens buildStructuredAddress()
// függvénye, de a MÁR normalizált (normalizeDistrictOrPostalCode())
// districtOrPostalCode-ból, hogy egy félreérthető rövid kerület-jelölés
// (pl. bare "8") a Nominatim felé küldött szövegben SOHA ne maradjon
// kétértelmű. Ha nincs kerület-komponens (szabadszöveges POI-keresés,
// pl. "Deák tér"), egyszerűen a város+utca (vagy csak utca) marad.
export function buildCanonicalFreeTextQuery(expected: ExpectedAddressComponents): string {
  const street = expected.houseNumber ? `${expected.streetName} ${expected.houseNumber}` : expected.streetName;
  const districtPart =
    expected.districtOrPostalCode && !/^\d{4}$/.test(expected.districtOrPostalCode) ? expected.districtOrPostalCode : null;
  const cityLine = [expected.city, districtPart].filter(Boolean).join(", ");
  return [cityLine, street].filter(Boolean).join(", ");
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
  // GEOCODING GENERALIZÁCIÓ (2026-09-11, 10. pont) — a namedetails=1
  // KIEGÉSZÍTŐ mezőt ad a válaszban (a hely saját neve, nyelvi variánsokkal)
  // — nem növeli a kérésszámot, csak a MEGLÉVŐ kérés válaszának
  // tartalmát bővíti, ezért nem sérti a "ne növeljük indokolatlanul a
  // kérésszámot" elvet.
  params.set("namedetails", "1");
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
  params.set("namedetails", "1");
  params.set("limit", "5");
  params.set("countrycodes", "hu");
  params.set("q", query);
  return `${NOMINATIM_URL}?${params.toString()}`;
}

// Determinisztikus, legfeljebb 4 lépéses fallback-lánc (8. pont) — SOHA nem
// végtelen retry, SOHA nem generál 10+ cím-variációt:
//   1. Nominatim STRUKTURÁLT lekérdezés (street=/city=/postalcode=) — a
//      legpontosabb forma, ha Nominatim saját address-parseréhez illik.
//   2. Az EREDETI, kliens által küldött free-text string (a korábbi, ma is
//      élő viselkedés — garantáltan nem regresszál semmit, ami eddig
//      működött).
//   3. GEOCODING GENERALIZÁCIÓ (2026-09-11, 5. pont) — a KANONIKUS
//      (normalizált kerülettel összeállított) free-text lekérdezés, csak ha
//      ez ELTÉR az eredeti szövegtől (pl. "VIII"/"Viii"/"8" helyett
//      "VIII. kerület") — enélkül egy bare kerület-jelölés zavarhatja
//      Nominatim saját szövegértelmezését.
//   4. Egy egyszerűsített free-text ("<utca, házszám>, <város>, Hungary"),
//      kerület/irányítószám nélkül — arra az esetre, ha épp a kerület-szöveg
//      zavarja Nominatim saját elemzését.
//
// MINDEN lépésnél KÉT elfogadási utat próbálunk a kapott találatokra: a
// klasszikus cím-egyezést (pickBestGeocodeMatch — VÁLTOZATLAN, 2026-09-10
// óta) ÉS a nevesített hely/POI elfogadást (classifyNamedPlaceCandidates —
// bővítve, C4.1). Az első, amelyik RESOLVED/AMBIGUOUS eredményt ad, dönt —
// ez garantálja, hogy egy valódi cím-egyezés (pl. ahol a házszám dönt
// EXACT/APPROXIMATE között) SOHA nem "csúszik át" véletlenül a POI-útra.
//
// GEOCODING KORREKCIÓ (2026-09-11, C4.1) — a visszatérési típus bővült egy
// `AmbiguousGeocodeResult` ággal: ha egy adott lekérdezési lépésen belül
// TÖBB, egymáshoz közeli pontszámú nevesített hely-jelölt van (lásd
// classifyNamedPlaceCandidates), a függvény AZONNAL ezt a jelölt-listát adja
// vissza a hívónak (route.ts) — SOHA nem próbál egy KÉSŐBBI, egyszerűsített
// lekérdezéssel "megkerülni" egy már felismert többértelműséget (ez
// biztonságosabb és kiszámíthatóbb, mint tovább próbálkozni). A klasszikus
// cím-egyezés (pickBestGeocodeMatch) útja VÁLTOZATLAN — sosem ad
// AMBIGUOUS-t, ahogy korábban sem.
export async function geocodeAddress(query: string): Promise<GeocodeResult | AmbiguousGeocodeResult | null> {
  const expected = parseExpectedAddressComponents(query);
  // A POI-elfogadás MINDIG a házszám nélküli, saját nevet hordozó
  // szegmenshez hasonlít — sosem a nyers, házszámot is tartalmazó
  // szöveghez (lásd a fájl fejléce: "Rákóczi út 999" ne váljon hamisan
  // elfogadottá).
  const poiQuery = expected.streetName || query;

  const attempts: string[] = [];
  attempts.push(buildStructuredQueryUrl(expected));
  attempts.push(buildFreeTextQueryUrl(query));
  const canonicalQuery = buildCanonicalFreeTextQuery(expected);
  if (canonicalQuery && canonicalQuery !== query) {
    attempts.push(buildFreeTextQueryUrl(canonicalQuery));
  }
  if (expected.streetName) {
    // 4. lépés (8. pont): egyszerűsített free-text, kerület/irányítószám
    // NÉLKÜL — arra az esetre, ha épp a kerület-szöveg (vagy annak hiánya/
    // formája) zavarja Nominatim saját elemzését. A normalizeDistrictOrPostalCode()
    // itt szándékosan NEM kerül bele a query-be — a 9. pont szerinti
    // normalizált kerület a STRUKTURÁLT (1.) és a KANONIKUS (3.)
    // próbálkozásban már szerepelt, itt a cél a lehető legegyszerűbb,
    // kerület-független alak.
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

    const classification = classifyNamedPlaceCandidates(results, poiQuery);
    if (classification.status === "RESOLVED") {
      const winner = classification.candidates[0];
      return { name: getResultPrimaryName(winner) || winner.display_name, lat: Number(winner.lat), lon: Number(winner.lon), quality: "EXACT" };
    }
    if (classification.status === "AMBIGUOUS") {
      return { ambiguous: true, candidates: classification.candidates.map(toPlaceCandidate) };
    }
    // NOT_FOUND ezen a lépésen — folytatjuk a következő próbálkozással.
  }

  return null;
}
