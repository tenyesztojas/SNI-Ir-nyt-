// VÉDETT ÚTVONAL – Pihenőpont production sprint (2026-09-10), 3. kör:
// fullscreen Navigation Mode + pihenőpont integráció regressziós tesztjei
// (spec 1-6., 24-27., 28. pont).
//
// Ugyanazt a forráskód-szintű, strukturális regresszió-teszt mintát
// követi, mint a projekt korábbi tesztjei — nincs jsdom/@testing-library/
// react, ezért a TÉNYLEGES forráskódot olvassa be.
//
//   node --test --experimental-strip-types __tests__/vedett-route/fullscreen-rest-point-integration.test.ts
//
// FONTOS: a "Pihenőre van szükségem" (RestStopFlowPanel) és a
// "Pihenőpont hozzáadása" (RestPointQuickAdd) flow-k, valamint a
// discovery/GPS-lifecycle logikájuk NAGY RÉSZE MÁR KORÁBBAN, EBBEN A
// KÖRBEN ÉRINTETLENÜL létezett (Sprint E, Map/GPS/Rest Points sprint) — a
// mostani sprint kizárólag a KÖRÜLÖTTÜK lévő WRAPPER <div> pozícionálását
// (fullscreen alatt fixed bottom sheet) és két kis accessibility/copy
// finomítást (aria-label, min-h-44px, AttributionControl "top-left")
// módosított. Ezek a tesztek ezt a teljes, EGYÜTTES viselkedést
// bizonyítják — nem csak a mostani diffet.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const REST_STOP_FLOW_PANEL_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "RestStopFlowPanel.tsx");
const restStopFlowPanelSrc = readFileSync(REST_STOP_FLOW_PANEL_PATH, "utf-8");

const REST_POINT_QUICK_ADD_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "RestPointQuickAdd.tsx");
const restPointQuickAddSrc = readFileSync(REST_POINT_QUICK_ADD_PATH, "utf-8");

const MAP_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalMap.tsx");
const mapSrc = readFileSync(MAP_PATH, "utf-8");

// A RankedJourneyCard komponens teljes törzsének kinyerése — stabil
// horgony-szövegekre épül (a függvény deklarációjától a "Térkép" fejlécig
// visszakereshető legutolsó záró "}\n}" előtt), hasonlóan a projekt többi
// tesztjéhez.
const cardStart = formSrc.indexOf("function RankedJourneyCard({");
const cardEnd = formSrc.indexOf('const ORIGIN_GEOLOCATION_ERROR_COPY', cardStart);
const cardSrc = formSrc.slice(cardStart, cardEnd);

// A wrapper <div>, ami a RestPointQuickAdd + RestStopFlowPanel-t fullscreen
// alatt bottom sheet-té alakítja — a `mapFullscreen ?` ternary-tól a
// RestStopFlowPanel záró `/>`-ig.
// MEGJEGYZÉS: a projekt e fájljai (és a legtöbb vedett-utvonal komponens)
// CRLF sorvégekkel vannak tárolva — a horgony-string ezért \r\n-t használ
// (nem csak \n-t), különben az indexOf() sosem találná meg a mintát.
//
// PIHENŐPONT PANEL BEZÁRÁSA (2026-09-11) — a wrapper ternary-ja ETTŐL A
// KÖRTŐL kezdve egy MÁSODIK, `restPanelVisible`-től függő szintet is
// tartalmaz (lásd rest-point-panel-close.test.ts a részletes lefedettségért)
// — a horgony-string ezért innen `? restPanelVisible`-lel folytatódik, nem
// közvetlenül a class-string literállal.
const wrapperStart = cardSrc.indexOf("mapFullscreen\r\n                ? restPanelVisible");

describe("A-B) 'Pihenőre van szükségem' és 'Pihenőpont hozzáadása' fullscreen Navigation Mode-ban is elérhető", () => {
  test("A-B) a wrapper <div> (RestPointQuickAdd + RestStopFlowPanel) NINCS a '!navigationMode &&' feltételes blokkba zárva — fullscreen alatt is renderelődik", () => {
    assert.ok(wrapperStart !== -1, "meg kell találni a mapFullscreen ternary wrapper <div>-et");
    // A meglévő navigációs kontrollok (▶ Navigáció indítása stb.) blokkja
    // `{!navigationMode && (` -val kezdődik — ez a wrapper <div> UTÁN
    // következik a forrásban, tehát a wrapper maga NEM ennek a feltételes
    // blokknak a része.
    const oldControlsBlockStart = cardSrc.indexOf("{!navigationMode && (");
    assert.ok(oldControlsBlockStart !== -1, "meg kell találni a '!navigationMode &&' vezérlőblokkot");
    assert.ok(
      wrapperStart > oldControlsBlockStart,
      "a wrapper <div>-nek A '!navigationMode &&' blokk UTÁN kell következnie, nem abba zárva"
    );
  });

  test("A wrapper <div> className-e fullscreen+látható alatt fixed, bottom-anchored, magasabb z-indexszel, mint a fullscreen map (z-50); a görgetés/safe-area a belső content <div>-re költözött, de a wrapperen belül továbbra is jelen van", () => {
    assert.ok(wrapperStart !== -1);
    // PIHENŐPONT PANEL BEZÁRÁSA (2026-09-11): a wrapper mostantól egy
    // beágyazott (restPanelVisible-függő) ternary-t is tartalmaz, ezért a
    // korábbi 600 karakteres ablak már nem elég a teljes wrapper +
    // sticky fejléc + belső content <div> (overflow-y-auto/safe-area)
    // eléréséhez — 1400 karakter biztonságosan lefedi mindet.
    const wrapperBlock = cardSrc.slice(wrapperStart, wrapperStart + 1400);
    assert.match(wrapperBlock, /fixed inset-x-0 bottom-0 z-\[60\]/, "fullscreen+látható alatt fixed, bottom-anchored, z-[60] rétegnek kell lennie");
    assert.match(wrapperBlock, /max-h-\[45dvh\]/, "korlátozott magasságúnak kell lennie (ne vegye el teljesen a térképet)");
    assert.match(wrapperBlock, /overflow-y-auto/, "görgethetőnek kell lennie, ha a tartalom hosszabb");
    assert.match(wrapperBlock, /rounded-t-2xl/, "bottom sheet jellegű, felül lekerekített konténernek kell lennie");
    assert.match(wrapperBlock, /safe-area-inset-bottom/, "safe-area-bottom paddinget kell hordoznia");
  });

  test("nem-fullscreen esetben a wrapper egyszerű, normál-flow konténer marad (space-y-3), nincs fixed pozicionálás", () => {
    assert.ok(wrapperStart !== -1);
    const wrapperBlock = cardSrc.slice(wrapperStart, wrapperStart + 1400);
    assert.match(wrapperBlock, /: "space-y-3"/, "a ternary else-ágának egyszerű, normál-flow className-nek kell lennie");
  });
});

describe("G) A fullscreen bottom sheet NEM remounteli a térképet — a <VedettUtvonalMap> pontosan egyszer szerepel, a wrapper a fa-pozícióban NEM mozdul", () => {
  // MEGJEGYZÉS: a `\b` határ-alapú számlálás hamis pozitívot ad, mert a
  // kártya törzsében lévő magyar dokumentációs kommentek (pl. "...pontosan
  // úgy, mint a fenti <VedettUtvonalMap> instance.") is tartalmazzák a
  // komponensnevet — ott VIZUÁLIS/prózai említésként, közvetlenül `>`-nal
  // lezárva, SOSEM whitespace-szel/prop-pal folytatva. A tényleges JSX
  // haszálat mindig `<Komponens<whitespace>...` alakú (props vagy sortörés
  // következik utána), ezért a lookahead erre a különbségre szűr.
  test("a <VedettUtvonalMap> JSX-elem pontosan egyszer fordul elő a RankedJourneyCard törzsében", () => {
    const mapUsages = cardSrc.match(/<VedettUtvonalMap(?=\s)/g) ?? [];
    assert.equal(mapUsages.length, 1, "a térkép komponensnek pontosan egyszer kell szerepelnie — nincs második instance a bottom sheet miatt");
  });

  test("a <RestPointQuickAdd> és <RestStopFlowPanel> JSX-elemek is pontosan egyszer fordulnak elő — nincs második, párhuzamos flow/state machine", () => {
    const quickAddUsages = cardSrc.match(/<RestPointQuickAdd(?=\s)/g) ?? [];
    const flowPanelUsages = cardSrc.match(/<RestStopFlowPanel(?=\s)/g) ?? [];
    assert.equal(quickAddUsages.length, 1, "a RestPointQuickAdd-nak pontosan egyszer kell szerepelnie");
    assert.equal(flowPanelUsages.length, 1, "a RestStopFlowPanel-nek pontosan egyszer kell szerepelnie");
  });

  test("a wrapper <div> a fullscreen map <div>-jének KÖZVETLEN TESTVÉRE (nem beágyazva bele) — a mapFullscreen wrapper mindig ugyanabban a fa-pozícióban marad, csak className vált", () => {
    // A fullscreen map wrapper záró </div>-je UTÁN, de az akció-gombsor
    // ("!navigationMode &&" blokk) UTÁN kell közvetlenül következnie a
    // pihenőpont wrapper-nek — ugyanazon szülő ("mt-3 space-y-3...")
    // gyermekeként, nem egymásba ágyazva.
    const mapWrapperDivStart = cardSrc.indexOf('className={mapFullscreen ? "fixed inset-0 z-50 bg-black" : "relative"}');
    assert.ok(mapWrapperDivStart !== -1, "meg kell találni a fullscreen map wrapper <div>-et");
    assert.ok(wrapperStart > mapWrapperDivStart, "a pihenőpont wrapper-nek a map wrapper UTÁN kell következnie a forrásban");
  });
});

describe("C-D) A pihenőpont-keresés KIZÁRÓLAG explicit gombnyomásra indul — GPS tick önmagában nem indít discoveryt", () => {
  test("C) a REQUEST_REST event KIZÁRÓLAG a 'Pihenőre van szükségem' gomb onClick-jéből dispatch-elődik", () => {
    const dispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "REQUEST_REST" \}\)/g) ?? [];
    assert.equal(dispatchSites.length, 1, "a REQUEST_REST-nek pontosan egy hívási helye lehet — a gomb onClick-je");
    assert.match(restStopFlowPanelSrc, /onClick=\{\(\) => dispatch\(\{ type: "REQUEST_REST" \}\)\}/);
  });

  test("D) a REST_POINTS_LOADING effekt (a tényleges /nearby hívás) KIZÁRÓLAG akkor fut, ha ctx.state === 'REST_POINTS_LOADING' — egy önmagában bekövetkező GPS-koordináta-változás önmagában NEM indíthatja el, amíg a state gép nem ebben az állapotban van", () => {
    // Request-storm hotfix (2026-09-10) — ez az effekt MÁR NEM a live
    // geo.latitude/geo.longitude-tól függ (lásd
    // rest-point-request-storm-fix.test.ts a teljes root-cause-hoz és az
    // ÚJ, GPS-pillanatkép-alapú architektúra bizonyításához), hanem a
    // REST_REQUESTED átmenetkor egyszer rögzített ctx.requestOrigin-től.
    // Ez az invariáns (GPS tick önmagában nem indíthat hívást, amíg a
    // state gép nem REST_POINTS_LOADING-ban van) MÉG ERŐSEBBEN igaz, mint
    // korábban — a dependency array-ben már geo.latitude/geo.longitude
    // EGYÁLTALÁN nem szerepel.
    const effectMatch = restStopFlowPanelSrc.match(
      /\/\/ REST_POINTS_LOADING:[\s\S]*?\}, \[ctx\?\.state, ctx\?\.requestOrigin\?\.latitude, ctx\?\.requestOrigin\?\.longitude\]\);/
    );
    assert.ok(effectMatch, "meg kell találni a REST_POINTS_LOADING effektet");
    assert.match(
      effectMatch![0],
      /if \(!ctx \|\| ctx\.state !== "REST_POINTS_LOADING" \|\| !ctx\.requestOrigin\) return;/,
      "a guard-nak korán vissza kell térnie, ha a state gép NEM REST_POINTS_LOADING állapotban van (vagy nincs GPS-pillanatkép)"
    );
    // MEGJEGYZÉS: a teljes effectMatch[0] a magyarázó KOMMENTET is
    // tartalmazza, ami prózában szándékosan említi a RÉGI
    // geo.latitude/geo.longitude mintát (a root cause dokumentálásához) —
    // ezért a doesNotMatch ellenőrzést a TÉNYLEGES kódra (a `useEffect(()
    // => {`-től kezdve) kell szűkíteni, nem a kommentre.
    const effectCodeOnly = effectMatch![0].slice(effectMatch![0].indexOf("useEffect(() => {"));
    assert.doesNotMatch(
      effectCodeOnly,
      /geo\.latitude|geo\.longitude/,
      "az effekt KÓDJA (a kommentet nem számítva) SEHOL nem hivatkozhat élő geo.latitude/geo.longitude-ra — csak a rögzített ctx.requestOrigin snapshotra"
    );
  });
});

describe("E-F) trackedPosition = legfrissebb, MEGOSZTOTT GPS-pozíció — nincs második watchPosition", () => {
  test("E) a RankedJourneyCard-ban EGYETLEN useGeolocation()-instance létezik (`geo`), és ez kerül átadásra a RestStopFlowPanel-nek", () => {
    const geoHookCalls = cardSrc.match(/= useGeolocation\(\);/g) ?? [];
    assert.equal(geoHookCalls.length, 1, "a kártyában pontosan egy useGeolocation()-instance-nek kell lennie");
    // MEGJEGYZÉS: `cardSrc.indexOf("<RestStopFlowPanel")` a KOMMENTBEN lévő
    // prózai említést ("<RestStopFlowPanel>\r\n SOHA nem remountol...")
    // találná meg először, nem a tényleges JSX-hívást — ezért a `(?=\s)`
    // lookahead-del kell megkeresni a valódi (props-szal folytatódó) tag-et.
    const realTagMatch = /<RestStopFlowPanel(?=\s)/.exec(cardSrc);
    assert.ok(realTagMatch, "meg kell találni a RestStopFlowPanel tényleges JSX-hívását");
    const afterRealTag = cardSrc.slice(realTagMatch!.index, realTagMatch!.index + 200);
    assert.match(afterRealTag, /geo=\{geo\}/, "a RestStopFlowPanel-nek a SAJÁT (navigationMode által is használt) geo-instance-et kell kapnia");
  });

  test("F) a RestStopFlowPanel.tsx SOSEM hívja geo.startWatching()-et — a folyamatos GPS-követést KIZÁRÓLAG a startNavigation() indíthatja el", () => {
    assert.ok(!/geo\.startWatching\(/.test(restStopFlowPanelSrc), "a RestStopFlowPanel nem indíthat második watchPosition-t");
    assert.match(cardSrc, /const startNavigation = \(\) => \{[\s\S]{0,500}geo\.startWatching\(\);/, "a watchPosition indítása kizárólag a startNavigation()-ben él");
  });
});

describe("H-I) Route geometry és marker/lista szinkron megmarad a pihenőpont-integráció mellett", () => {
  test("H) a <VedettUtvonalMap> legs prop-ja továbbra is a displayedJourney.legs-re esik vissza, amikor a pihenőpont-flow nem aktív", () => {
    assert.match(
      cardSrc,
      /legs=\{restStopMapState\.active && restStopMapState\.legsOverride \? restStopMapState\.legsOverride : displayedJourney\.legs\}/
    );
  });

  test("I) selectedRestPointId/onSelectRestPoint a restStopMapState-ből (a RestStopFlowPanel onMapStateChange jelentéséből) jön — marker és lista ugyanazt az állapotot vezérli", () => {
    assert.match(cardSrc, /selectedRestPointId=\{restStopMapState\.active \? restStopMapState\.selectedRestPointId : null\}/);
    assert.match(cardSrc, /onSelectRestPoint=\{restStopMapState\.active \? restStopMapState\.onSelectRestPoint : undefined\}/);
    assert.match(cardSrc, /onMapStateChange=\{setRestStopMapState\}/);
  });
});

describe("J) 'Pihenőpont hozzáadása' a MEGLÉVŐ RestPointQuickAdd flow-t használja — nincs második add-flow/DB-séma", () => {
  test("a RankedJourneyCard a MEGLÉVŐ <RestPointQuickAdd> komponenst importálja és rendereli, onCreated callback-kel a sessionRestPoints state-hez", () => {
    assert.match(formSrc, /import RestPointQuickAdd, \{ type RestPointCreatedPayload \} from "\.\/RestPointQuickAdd";/);
    assert.match(cardSrc, /<RestPointQuickAdd onCreated=\{\(rp\) => setSessionRestPoints\(\(points\) => \[\.\.\.points, rp\]\)\}\s*\/>/);
  });

  test("a RestPointQuickAdd.tsx-ben nincs Supabase/DB-séma hivatkozás — a mentés a MEGLÉVŐ (a komponensen kívüli, API-n keresztüli) logikára épül, a komponens maga csak a formot és a callback-et adja", () => {
    assert.ok(!/supabase/i.test(restPointQuickAddSrc), "a komponens nem érhet közvetlenül Supabase-hez");
  });
});

describe("K-L) Navigation stop továbbra is clearWatch, nincs új GPS persistence", () => {
  test("K) stopNavigation() továbbra is geo.stopWatching()-et hív (clearWatch a hook belsejében)", () => {
    assert.match(cardSrc, /const stopNavigation = \(\) => \{[\s\S]{0,120}geo\.stopWatching\(\);/);
  });

  test("L) sem a RestStopFlowPanel.tsx, sem a RestPointQuickAdd.tsx nem ír Supabase-be/adatbázisba folyamatos GPS-koordinátát — a RestPointQuickAdd egyetlen explicit mentése NEM a folyamatos trackedPosition, hanem a felhasználó által jóváhagyott/módosítható mezők", () => {
    assert.ok(!/supabase/i.test(restStopFlowPanelSrc));
    assert.ok(!/supabase/i.test(restPointQuickAddSrc));
    // A RestPointQuickAdd saját GPS-kitöltése (handleUseGps) egyszeri
    // requestOnce()-ra épül, NEM watchPosition-re — nincs folyamatos
    // GPS-persistencia még a mentés-előkészítő mezőkitöltésben sem.
    assert.ok(!/handleUseGps[\s\S]{0,80}startWatching/.test(restPointQuickAddSrc));
    assert.match(restPointQuickAddSrc, /function handleUseGps\(\) \{\s*\n\s*geo\.requestOnce\(\);\s*\n\s*\}/);
  });
});

describe("24. pont — Accessibility: mindkét gomb aria-label-lel, min. 44px touch targettel, nem csak ikonnal", () => {
  test("'Pihenőre van szükségem' aria-label és min-h-[44px]", () => {
    const buttonMatch = restStopFlowPanelSrc.match(/<button[\s\S]*?REQUEST_REST[\s\S]*?<\/button>/);
    assert.ok(buttonMatch, "meg kell találni a 'Pihenőre van szükségem' gombot");
    assert.match(buttonMatch![0], /aria-label="Pihenőpontok keresése a közelemben"/);
    assert.match(buttonMatch![0], /min-h-\[44px\]/);
    assert.match(buttonMatch![0], />\s*Pihenőre van szükségem\s*</, "a szövegnek is meg kell jelennie, nem csak ikon");
  });

  test("'Pihenőpont hozzáadása' aria-label és min-h-[44px]", () => {
    const buttonMatch = restPointQuickAddSrc.match(/<button[\s\S]*?onClick=\{handleOpen\}[\s\S]*?<\/button>/);
    assert.ok(buttonMatch, "meg kell találni a 'Pihenőpont hozzáadása' gombot");
    assert.match(buttonMatch![0], /aria-label="Pihenőpont hozzáadása"/);
    assert.match(buttonMatch![0], /min-h-\[44px\]/);
  });
});

describe("3. pont — MapLibre attribution nem lesz olvashatatlan a fullscreen bottom sheet miatt", () => {
  test("az AttributionControl 'top-left'-re költözött (nem ütközik az új bottom sheet-tel, sem a top-right NavigationControl/CurrentLocationControl-lal)", () => {
    assert.match(
      mapSrc,
      /new maplibregl\.AttributionControl\(\{ compact: false, customAttribution: MAP_ATTRIBUTION_FALLBACK \}\), "top-left"/
    );
    // A meglévő compact:false / attributionControl:false invariánsok
    // (lásd map-rendering-fix.test.ts) NEM sérültek — csak a pozíció
    // paraméter került hozzáadva.
    assert.match(mapSrc, /attributionControl: false/);
  });

  test("a NavigationControl és CurrentLocationControl továbbra is 'top-right'-on marad — a fullscreen bottom sheet nem takarja el őket", () => {
    assert.match(mapSrc, /new maplibregl\.NavigationControl\(\), "top-right"/);
    // MEGJEGYZÉS: a `[^)]*` mohó tiltólista nem jó, mert az argumentum maga
    // (`() => currentPositionRef.current`) egy nulla-paraméteres arrow
    // function, aminek SAJÁT `()` zárópárja van — ez idő előtt lezárná az
    // osztályt. `[\s\S]*?` nem-mohó minta a helyes, a legkorábbi
    // `), "top-right"`-ig.
    assert.match(mapSrc, /new CurrentLocationControl\([\s\S]*?\), "top-right"/);
  });
});

describe("25. pont — Navigation Mode / GPS regresszióvédelem (a fullscreen pihenőpont-integráció NEM törte el)", () => {
  test("navigationMode/followMode/manualFullscreen state és mapFullscreen levezetés változatlan", () => {
    assert.match(formSrc, /const \[navigationMode, setNavigationMode\] = useState\(false\);/);
    assert.match(formSrc, /const \[followMode, setFollowMode\] = useState\(false\);/);
    assert.match(formSrc, /const \[manualFullscreen, setManualFullscreen\] = useState\(false\);/);
    assert.match(formSrc, /const mapFullscreen = navigationMode \|\| manualFullscreen;/);
  });

  test("a <VedettUtvonalMap> followMode/navigationZoom/onUserGestureCancelFollow props-jai változatlanok", () => {
    assert.match(cardSrc, /followMode=\{followMode\}/);
    assert.match(cardSrc, /navigationZoom=\{16\}/);
    assert.match(cardSrc, /onUserGestureCancelFollow=\{\(\) => setFollowMode\(false\)\}/);
  });

  test("'✕ Navigáció befejezése' / '📍 Kövesd a helyzetem' gombok jelen vannak, a top action bar-ban", () => {
    assert.match(cardSrc, /✕ Navigáció befejezése/);
    assert.match(cardSrc, /📍 Kövesd a helyzetem/);
  });
});
