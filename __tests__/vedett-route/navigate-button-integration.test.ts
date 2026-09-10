// VÉDETT ÚTVONAL — Védett Helyek "Navigálj oda" integráció (2026-09-09)
//
// Regressziós tesztek a specifikáció A-L tesztlistájához. Ugyanazt a
// mintát követi, mint a projekt már meglévő vedett-route tesztjei: a
// NavigateButton.tsx "use client" React komponens és az app/*/page.tsx
// szerver komponensek (next/link, next/navigation importokkal) plain
// `node --test` alatt, Next.js bundler nélkül nem futtathatók/renderel-
// hetők — ezért a UI-integrációt forráskód-szintű, strukturális
// regresszió-tesztekkel fedjük le. A validációs sémát (lib/vedett-route/
// schemas.ts) VISZONT valóban futásidőben teszteljük, mert az egy pure,
// zod-alapú modul, nincs benne next/* import.
//
//   node --test __tests__/vedett-route/navigate-button-integration.test.ts
//
// LEFEDETTSÉG:
//   A) budapesti hely -> Védett Útvonal opció megjelenik
//   B) nem budapesti hely -> Védett Útvonal opció nem jelenik meg
//   C) VEDETT_ROUTE_ENABLED=false -> opció nem jelenik meg
//   D) meglévő navigációs opciók nem tűnnek el
//   E) Védett Útvonal link /vedett-utvonal-ra mutat
//   F) destination neve átadásra kerül
//   G) ismert koordináta esetén lat/lon átadásra kerül
//   H) invalid query param nem okoz crash-t
//   I) deep link után a destination mező előre ki van töltve
//   J) current-location origin továbbra is külön user action
//   K) nincs új GPS persistence/logging
//   L) nincs saját auth/pilot_access logika a NavigateButtonban

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { journeySearchSchema, routeDestinationDeepLinkSchema } from "../../lib/vedett-route/schemas.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const NAVIGATE_BUTTON_PATH = join(ROOT, "components", "NavigateButton.tsx");
const PLACE_SLUG_PAGE_PATH = join(ROOT, "app", "helyek", "[slug]", "page.tsx");
const VEDETT_UTVONAL_PAGE_PATH = join(ROOT, "app", "vedett-utvonal", "page.tsx");
const SEARCH_FORM_PATH = join(ROOT, "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const SEARCH_ROUTE_PATH = join(ROOT, "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
const DATA_PATH = join(ROOT, "lib", "data.ts");
const HOME_PAGE_PATH = join(ROOT, "app", "page.tsx");

const navigateButtonSrc = readFileSync(NAVIGATE_BUTTON_PATH, "utf-8");
const placeSlugPageSrc = readFileSync(PLACE_SLUG_PAGE_PATH, "utf-8");
const vedettUtvonalPageSrc = readFileSync(VEDETT_UTVONAL_PAGE_PATH, "utf-8");
const searchFormSrc = readFileSync(SEARCH_FORM_PATH, "utf-8");
const searchRouteSrc = readFileSync(SEARCH_ROUTE_PATH, "utf-8");
const dataSrc = readFileSync(DATA_PATH, "utf-8");
const homePageSrc = readFileSync(HOME_PAGE_PATH, "utf-8");

describe("Budapest-detektálás — strukturált `city` mező, nincs törékeny substring hack", () => {
  test("isBudapestPlace() a MEGLÉVŐ citiesFromPlaces() normalizálásával egyező szabályt (city.startsWith('Budapest')) használ — nincs második, párhuzamos Budapest-detektáló logika", () => {
    assert.match(dataSrc, /export function isBudapestPlace\(place: Pick<Place, "city">\): boolean \{/);
    assert.match(dataSrc, /return place\.city\.startsWith\("Budapest"\);/);
  });

  test("nem koordináta-alapú (bounding box) a Budapest-detektálás elsődlegesen — a city mező élvez elsőbbséget", () => {
    assert.doesNotMatch(dataSrc, /isBudapestPlace[\s\S]{0,200}(bbox|bounds|47\.\d|19\.\d)/);
  });
});

describe("A/B/C) app/helyek/[slug]/page.tsx — mikor jelenik meg a Védett Útvonal opció", () => {
  test("A/B) a vedettUtvonalHref kiszámítása isBudapestPlace(place)-t használ — Budapesten kívüli helynél a feltétel false, tehát az opció nem jelenik meg", () => {
    assert.match(placeSlugPageSrc, /isBudapestPlace\(place\)/);
  });

  test("C) a vedettUtvonalHref kiszámítása isVedettRouteFeatureEnabled()-t is megköveteli — VEDETT_ROUTE_ENABLED=false esetén az opció nem jelenik meg", () => {
    const idx = placeSlugPageSrc.indexOf("const vedettUtvonalHref =");
    assert.ok(idx !== -1, "a vedettUtvonalHref definíciónak léteznie kell");
    const block = placeSlugPageSrc.slice(idx, idx + 500);
    assert.match(block, /isVedettRouteFeatureEnabled\(\)/);
    assert.match(block, /isBudapestPlace\(place\)/);
    // A két feltételnek ÉS kapcsolatban kell lennie (nem VAGY) — a
    // kifejezés egyetlen && lánc kell legyen mindkét check között.
    const enabledIdx = block.indexOf("isVedettRouteFeatureEnabled()");
    const budapestIdx = block.indexOf("isBudapestPlace(place)");
    const between = block.slice(Math.min(enabledIdx, budapestIdx), Math.max(enabledIdx, budapestIdx));
    assert.ok(!/\|\|/.test(between), "a flag és a Budapest-check között ÉS (&&) kapcsolatnak kell lennie, nem VAGY-nak");
  });

  test("nincs ismert lat/lon esetén sem jelenhet meg az opció (a feltétel a koordináták meglétét is megköveteli)", () => {
    const idx = placeSlugPageSrc.indexOf("const vedettUtvonalHref =");
    const block = placeSlugPageSrc.slice(idx, idx + 500);
    assert.match(block, /typeof place\.latitude === "number"/);
    assert.match(block, /typeof place\.longitude === "number"/);
  });
});

describe("D) meglévő navigációs opciók nem tűnnek el", () => {
  test("Google Maps, Waze és Apple Maps linkek FELTÉTEL NÉLKÜL (nem a vedettUtvonalHref ágon belül) jelen vannak a NavigateButton forrásában", () => {
    assert.match(navigateButtonSrc, /googleMapsUrl/);
    assert.match(navigateButtonSrc, /wazeUrl/);
    assert.match(navigateButtonSrc, /appleMapsUrl/);
    // A három meglévő <a> tag nem esik a `{vedettUtvonalHref && (...)}`
    // feltételes blokkba — külön, azon KÍVÜLI JSX-elemek.
    const conditionalBlockMatch = navigateButtonSrc.match(/\{vedettUtvonalHref && \([\s\S]*?\)\}/);
    assert.ok(conditionalBlockMatch, "a Védett Útvonal opciónak feltételes blokkban kell lennie");
    assert.doesNotMatch(conditionalBlockMatch![0], /googleMapsUrl|wazeUrl|appleMapsUrl/);
  });
});

describe("E/F/G) a deep link összeállítása — link cél, név, koordináták átadása", () => {
  test("E) a Védett Útvonal link '/vedett-utvonal?'-lal kezdődik", () => {
    assert.match(placeSlugPageSrc, /`\/vedett-utvonal\?\$\{new URLSearchParams\(/);
  });

  test("F) a hely NEVE átadásra kerül a 'name' paraméterben", () => {
    assert.match(placeSlugPageSrc, /name:\s*place\.name/);
  });

  test("G) a hely koordinátája átadásra kerül 'lat'/'lon' paraméterekben", () => {
    assert.match(placeSlugPageSrc, /lat:\s*String\(place\.latitude\)/);
    assert.match(placeSlugPageSrc, /lon:\s*String\(place\.longitude\)/);
  });

  test("a NavigateButton a kész linket kapja meg propként — nem maga állítja össze (nincs duplikált linképítő logika)", () => {
    assert.match(navigateButtonSrc, /vedettUtvonalHref\?:\s*string \| null/);
    assert.doesNotMatch(navigateButtonSrc, /URLSearchParams/);
  });
});

describe("H) invalid query param nem okoz crash-t — routeDestinationDeepLinkSchema", () => {
  test("érvényes name/lat/lon (string query paraméterek) átmennek a validáción", () => {
    const result = routeDestinationDeepLinkSchema.safeParse({
      name: "Csodák Palotája",
      lat: "47.4979",
      lon: "19.0402",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(typeof result.data.lat, "number");
      assert.equal(typeof result.data.lon, "number");
    }
  });

  test("nem numerikus lat/lon (pl. 'abc') safeParse hibát ad, NEM dob kivételt", () => {
    assert.doesNotThrow(() => {
      const result = routeDestinationDeepLinkSchema.safeParse({ name: "X", lat: "abc", lon: "def" });
      assert.equal(result.success, false);
    });
  });

  test("tartományon kívüli koordináta (latitude > 90) elutasításra kerül", () => {
    const result = routeDestinationDeepLinkSchema.safeParse({ name: "X", lat: "91", lon: "19" });
    assert.equal(result.success, false);
  });

  test("hiányzó mezők (üres objektum) safeParse hibát adnak, NEM dobnak kivételt", () => {
    assert.doesNotThrow(() => {
      const result = routeDestinationDeepLinkSchema.safeParse({});
      assert.equal(result.success, false);
    });
  });

  test("teljesen hiányzó/null bemenet safeParse hibát ad, NEM dob kivételt", () => {
    assert.doesNotThrow(() => {
      const result = routeDestinationDeepLinkSchema.safeParse(null);
      assert.equal(result.success, false);
    });
  });

  test("app/vedett-utvonal/page.tsx a searchParams-ot safeParse-en keresztül dolgozza fel — nincs kivétel-dobó .parse() hívás, ami crash-elhetne", () => {
    assert.match(vedettUtvonalPageSrc, /routeDestinationDeepLinkSchema\.safeParse\(/);
    assert.doesNotMatch(vedettUtvonalPageSrc, /routeDestinationDeepLinkSchema\.parse\(/);
  });

  test("app/vedett-utvonal/page.tsx csak string típusú (nem tömb) query paramétereket fogad el, mielőtt a séma futna", () => {
    assert.match(vedettUtvonalPageSrc, /typeof name !== "string" \|\| typeof lat !== "string" \|\| typeof lon !== "string"/);
  });
});

describe("I) deep link után a destination mező előre ki van töltve — VedettUtvonalSearchForm.tsx", () => {
  test("a form initialDestination propot fogad el, és azzal seedeli a destination state-et KNOWN_PLACE módban", () => {
    assert.match(searchFormSrc, /initialDestination = null/);
    assert.match(searchFormSrc, /type:\s*"KNOWN_PLACE"/);
    assert.match(searchFormSrc, /useState<RouteDestination>\(\s*initialDestination/);
  });

  test("a 'Hová?' input value-ja KNOWN_PLACE módban a hely nevét mutatja, nem egy üres mezőt", () => {
    // Strukturált címbevitel (2026-09-XX) óta a MANUAL célhely három
    // mezőre bomlik (Város/Irányítószám vagy kerület/Utca, házszám), de a
    // KNOWN_PLACE ág KÜLÖN, feltételes JSX-ágként megmaradt: egyetlen
    // mező, előretöltve a hely nevével — nincs újbóli geokódolás.
    // Geocoding hardening (2026-09-10) óta ez a feltételes ág a térképen
    // kijelölt (MAP_PICKED) célt is lefedi — ugyanaz az input, ugyanaz a
    // value={destination.name}, csak a jóváhagyás mögötti eredet más
    // (lásd a belső KNOWN_PLACE-vs-MAP_PICKED segítő szöveg elágazást).
    const knownPlaceBranchMatch = searchFormSrc.match(/destination\.type === "KNOWN_PLACE" \|\| destination\.type === "MAP_PICKED" \? \([\s\S]{0,800}?\) : \(/);
    assert.ok(knownPlaceBranchMatch, "meg kell találni a destination.type === \"KNOWN_PLACE\" || \"MAP_PICKED\" feltételes JSX-ágat");
    assert.match(knownPlaceBranchMatch![0], /value=\{destination\.name\}/);
  });

  test("kézi gépelés a 'Hová?' mezőbe (KNOWN_PLACE nézetben) VISSZAÁLLÍTJA MANUAL módra (nem marad benne egy elavult koordináta, ha a user módosítja a célt)", () => {
    // A régi, egyetlen handleDestinationChange helyett a KNOWN_PLACE
    // nézet mezője handleDestinationOverrideChange-et hív — az invariáns
    // ugyanaz: kézi gépelés AZONNAL MANUAL módra vált, koordináta nem
    // marad érvényben.
    const fnMatch = searchFormSrc.match(/function handleDestinationOverrideChange\(value: string\) \{[\s\S]*?\n  \}/);
    assert.ok(fnMatch, "handleDestinationOverrideChange függvénynek léteznie kell");
    assert.match(fnMatch![0], /setDestination\(\{ type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: value \}\);/);
  });

  test("submit esetén KNOWN_PLACE destination toCoordinates+toName-t küld, MANUAL destination sima 'to' stringet — mindkettő a journeySearchSchema-val validált alakban", () => {
    assert.match(searchFormSrc, /destination\.type === "KNOWN_PLACE"/);
    assert.match(searchFormSrc, /toCoordinates:\s*\{\s*latitude:\s*destination\.latitude,\s*longitude:\s*destination\.longitude\s*\}/);
    assert.match(searchFormSrc, /toName:\s*destination\.name/);
  });
});

describe("J) current-location origin továbbra is külön user action — a destination-integráció nem indít automatikus GPS-kérést", () => {
  test("originGeo.requestOnce() KIZÁRÓLAG a handleUseCurrentLocation() függvényen belül, egy button onClick mögött hívódik — nincs mount-time useEffect, ami automatikusan GPS-t kérne", () => {
    // MEGJEGYZÉS (audit, 2026-09-10): a korábbi `/\.requestOnce\(\)/g`
    // (identifier-prefix NÉLKÜLI) számlálás hamis pozitívot adott — a
    // fullscreen pihenőpont-integráció (3. kör) egy dokumentációs
    // kommentje ("...hívna geo.requestOnce()-t, ha geo.status ===
    // \"idle\"...") a RestStopFlowPanel.tsx-beli, MÁSIK `geo` változóra
    // hivatkozva prózaként tartalmazza a "geo.requestOnce()" szó szerinti
    // részletet — ez a substring-egyezés emelte a számlálót helytelenül
    // 1-ről 2-re, valós második hívás NÉLKÜL (PowerShell
    // `Select-String -Pattern 'originGeo\.requestOnce\(\)'` a valódi
    // forrásban egyetlen találatot ad). A javított teszt ezért:
    //   1) az IDENTIFIER-SPECIFIKUS `originGeo\.requestOnce\(\)` mintára
    //      számol (ez a komment "geo.requestOnce()" szövegére NEM illik,
    //      mert más az azonosító előtag),
    //   2) explicit bizonyítja, hogy a hívás a handleUseCurrentLocation()
    //      függvényen BELÜL van,
    //   3) explicit bizonyítja, hogy EGYETLEN useEffect blokk sem
    //      tartalmaz originGeo.requestOnce() hívást (tehát nincs
    //      mount-time vagy bármilyen más, useEffect-alapú automatikus
    //      GPS-kérés — ez az invariáns, amit a teszt ténylegesen bizonyítani
    //      hivatott, nem a nyers substring-szám).
    const originGeoRequestOnceCalls = searchFormSrc.match(/originGeo\.requestOnce\(\)/g) ?? [];
    assert.equal(
      originGeoRequestOnceCalls.length,
      1,
      "az originGeo.requestOnce()-nek pontosan egyszer kell előfordulnia a forrásban"
    );

    const fnMatch = searchFormSrc.match(/function handleUseCurrentLocation\(\) \{[\s\S]*?\n  \}/);
    assert.ok(fnMatch, "handleUseCurrentLocation() függvénynek léteznie kell");
    assert.match(
      fnMatch![0],
      /originGeo\.requestOnce\(\);/,
      "a handleUseCurrentLocation()-nek explicit hívnia kell az originGeo.requestOnce()-t"
    );

    // Minden useEffect(...) blokk kigyűjtése (a `}, [` mintáig, ami a
    // dependency-listát vezeti be) — egyik sem tartalmazhatja az
    // originGeo.requestOnce() hívást, mert az kizárólag explicit user
    // action-ből (a fenti handleUseCurrentLocation()-ből) hívódhat.
    const useEffectBlocks = searchFormSrc.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g) ?? [];
    assert.ok(useEffectBlocks.length > 0, "legalább egy useEffect blokknak léteznie kell a fájlban (szanity check)");
    for (const block of useEffectBlocks) {
      assert.doesNotMatch(
        block,
        /originGeo\.requestOnce\(/,
        "egyetlen useEffect blokk sem hívhatja automatikusan az originGeo.requestOnce()-t — a GPS-kérés kizárólag explicit user action-ből indulhat"
      );
    }
  });

  test("a destination KNOWN_PLACE inicializálása (initialDestination-ből) NEM hív semmilyen geolocation/GPS API-t — pusztán useState kezdőérték", () => {
    const useStateBlockMatch = searchFormSrc.match(/const \[destination, setDestination\] = useState<RouteDestination>\([\s\S]*?\n  \);/);
    assert.ok(useStateBlockMatch, "a destination useState inicializálásának léteznie kell");
    assert.doesNotMatch(useStateBlockMatch![0], /geolocation|requestOnce|navigator\./i);
  });
});

describe("K) nincs új GPS persistence/logging a Védett Hely integráció fájljaiban", () => {
  test("sem a NavigateButton, sem a page.tsx-ek, sem a search form nem ír GPS/koordináta adatot perzisztens tárolóba vagy analytics/logging hívásba", () => {
    for (const src of [navigateButtonSrc, placeSlugPageSrc, vedettUtvonalPageSrc]) {
      assert.ok(
        !/localStorage|sessionStorage|navigator\.geolocation|analytics|vedettRouteLog\(.*latitude/i.test(src)
      );
    }
  });

  test("a search route.ts toCoordinates ága csak átadja a koordinátát az orchestratornak — nem ír külön logot/perzisztenciát a toCoordinates körül", () => {
    assert.match(searchRouteSrc, /toCoordinates\s*\?\s*Promise\.resolve/);
  });
});

describe("L) nincs saját auth/pilot_access logika a NavigateButtonban", () => {
  test("NavigateButton.tsx nem hivatkozik role/pilot_access/admin/auth fogalmakra — a Props kommentje szerint ez SZÁNDÉKOSAN a hívó (szerver komponens) döntése", () => {
    assert.doesNotMatch(
      navigateButtonSrc,
      /pilotAccess|pilot_access|isAdmin|requireVedettRoute|createAdminClient|supabase|useSession|isCurrentUserAdmin/i
    );
  });

  test("a Védett Útvonal link kattintásra a KÖZÖS /vedett-utvonal oldalra navigál — az dönt a bejelentkezésről (requireVedettRouteAuthenticated / redirect), a NavigateButton csak egy Next.js <Link>-et renderel", () => {
    assert.match(navigateButtonSrc, /import Link from "next\/link";/);
    assert.match(navigateButtonSrc, /<Link\s+href=\{vedettUtvonalHref\}/);
  });

  test("app/vedett-utvonal/page.tsx-en a bejelentkezés-ellenőrzés VÁLTOZATLANUL a KÖZÖS getCurrentUserAndProfile()+redirect('/belepes') mintát követi — a Védett Hely integráció nem ad hozzá egy második, párhuzamos auth-ágat", () => {
    assert.match(vedettUtvonalPageSrc, /if \(!user\) \{\s*redirect\("\/belepes"\);/);
  });
});

describe("Főoldali hero — ugyanaz a globális feature flag, nincs új flag", () => {
  test("a főoldali Védett Útvonal hero isVedettRouteFeatureEnabled()-t importálja a MEGLÉVŐ lib/vedett-route/config.ts-ből, nem hoz létre új flaget", () => {
    assert.match(homePageSrc, /import \{ isVedettRouteFeatureEnabled \} from "@\/lib\/vedett-route\/config";/);
    assert.match(homePageSrc, /const vedettRouteEnabled = isVedettRouteFeatureEnabled\(\);/);
  });

  test("a hero szekció a vedettRouteEnabled feltétel MÖGÖTT renderelődik (nem CSS-sel van elrejtve kikapcsolt flag esetén)", () => {
    assert.match(homePageSrc, /\{vedettRouteEnabled && \(/);
  });

  test("a hero CTA a /vedett-utvonal oldalra mutat", () => {
    const heroIdx = homePageSrc.indexOf("VÉDETT ÚTVONAL HERO");
    assert.ok(heroIdx !== -1);
    const heroBlock = homePageSrc.slice(heroIdx, heroIdx + 3000);
    assert.match(heroBlock, /href="\/vedett-utvonal"/);
  });
});

describe("journeySearchSchema — to/toCoordinates szimmetrikus a from/fromCoordinates mintával (regresszió a meglévő from-tesztekre)", () => {
  test("toCoordinates önmagában (to nélkül) érvényes", () => {
    const result = journeySearchSchema.safeParse({
      from: "Deák Ferenc tér",
      toCoordinates: { latitude: 47.5, longitude: 19.05 },
    });
    assert.equal(result.success, true);
  });

  test("to ÉS toCoordinates EGYSZERRE megadva elutasításra kerül", () => {
    const result = journeySearchSchema.safeParse({
      from: "Deák Ferenc tér",
      to: "Kelenföld",
      toCoordinates: { latitude: 47.5, longitude: 19.05 },
    });
    assert.equal(result.success, false);
  });

  test("sem to, sem toCoordinates nincs megadva -> elutasításra kerül", () => {
    const result = journeySearchSchema.safeParse({ from: "Deák Ferenc tér" });
    assert.equal(result.success, false);
  });

  test("a meglévő, szabadszöveges 'to' keresés továbbra is (regresszió nélkül) működik", () => {
    const result = journeySearchSchema.safeParse({
      from: "Budapest, Deák Ferenc tér",
      to: "Budapest, Kelenföldi pályaudvar",
    });
    assert.equal(result.success, true);
  });
});
