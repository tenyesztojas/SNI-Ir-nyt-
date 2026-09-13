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
//
// PIHENŐPONT PANEL BEZÁRÁSA (2026-09-11) — a wrapper ternary-ja ETTŐL A
// KÖRTŐL kezdve egy MÁSODIK, `restPanelVisible`-től függő szintet is
// tartalmaz (lásd rest-point-panel-close.test.ts a részletes lefedettségért)
// — a horgony ezért innen `? restPanelVisible`-lel folytatódik, nem
// közvetlenül a class-string literállal.
//
// SORVÉGZŐDÉS-JAVÍTÁS (audit, "14 FAIL" release-gate kör) — a korábbi
// horgony egy PONTOS `"mapFullscreen\r\n                ? restPanelVisible"`
// string-literál volt, ami feltételezte, hogy MINDEN sortörés a fájlban
// CRLF (`\r\n`). A tényleges forrásban ez a konkrét szakasz (a
// restPanelVisible bevezetése óta) sima LF (`\n`) sortöréseket tartalmaz,
// miközben a fájl TÖBBI RÉSZE CRLF marad (kevert sorvégződés — ez ugyanaz
// a jelenség, amit a release gate `git diff --check` futása is jelez, csak
// figyelmeztetésként, nem hibaként). Emiatt a pontos CRLF-horgony SOSEM
// illeszkedett, `wrapperStart` mindig -1 volt, és mind a 4, ettől függő
// teszt hamisan bukott — NEM azért, mert a runtime viselkedés megváltozott
// (azt kézzel, a production forrás elolvasásával megerősítettük: a wrapper
// továbbra is a navigációs vezérlők UTÁN, a fullscreen map wrapper
// KÖZVETLEN testvéreként áll, a leírt className-ekkel). A horgony ezért
// mostantól egy `\r?\n` mintájú REGEXX, ami mindkét sorvég-stílust
// elfogadja, függetlenül attól, hogy a fájl mely része melyiket használja.
const wrapperAnchorMatch = cardSrc.match(/mapFullscreen\r?\n\s*\? restPanelVisible/);
const wrapperStart = wrapperAnchorMatch ? wrapperAnchorMatch.index! : -1;

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
  test("C) a REQUEST_REST event KIZÁRÓLAG a triggerRequestRest() megosztott függvényből dispatch-elődik, amit a hatodik kör óta EGYETLEN belépési pont — a külső CTA-t kiszolgáló externalRequestRestToken-effekt — hív", () => {
    // Hatodik kör ("ADD módból is tűnjön el a másik funkció CTA-ja") — a
    // panel SAJÁT belső idle-chooser gombja ("Pihenőre van szükségem")
    // TELJESEN ELTÁVOLÍTVA (lásd az "AN" leírót lent a teljes indoklásért),
    // ezért a triggerRequestRest()-nek innentől EGYETLEN hívási helye van:
    // a lenti externalRequestRestToken-effekt. A TÉNYLEGES
    // `dispatch({ type: "REQUEST_REST" })` hívás a forrásban továbbra is
    // PONTOSAN EGYSZER szerepel (triggerRequestRest törzsében) — nincs
    // második, párhuzamos állapotgép-esemény/átmenet.
    const dispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "REQUEST_REST" \}\)/g) ?? [];
    assert.equal(dispatchSites.length, 1, "a REQUEST_REST-nek pontosan egy TÉNYLEGES dispatch-hívási helye lehet — a megosztott triggerRequestRest() törzse");
    assert.match(
      restStopFlowPanelSrc,
      /function triggerRequestRest\(\) \{\s*\n\s*dispatch\(\{ type: "REQUEST_REST" \}\);\s*\n\s*\}/,
      "meg kell találni a megosztott triggerRequestRest() függvényt"
    );
    // A hatodik kör óta NINCS többé belső gomb, ami onClick={triggerRequestRest}-et hívna.
    assert.doesNotMatch(restStopFlowPanelSrc, /onClick=\{triggerRequestRest\}/, "a panelnek NINCS többé saját belső gombja, ami közvetlenül hívná a triggerRequestRest-et");
  });

  test("C2) a triggerRequestRest-nek a hatodik kör óta PONTOSAN EGY belépési pontja van a forrásban — a külső CTA-t kiszolgáló effekt (tényleges hívásként) —, nincs második/harmadik, ismeretlen belépési pont", () => {
    // Az externalRequestRestToken-effektben triggerRequestRest() egy
    // TÉNYLEGES hívás — ez az EGYETLEN belépési pont a hatodik kör óta.
    const invocationSites = restStopFlowPanelSrc.match(/^\s*triggerRequestRest\(\);\s*$/gm) ?? [];
    assert.equal(invocationSites.length, 1, `pontosan 1 tényleges triggerRequestRest() hívásnak kell lennie (a külső CTA effektjében), talált: ${invocationSites.length}`);
    // Referenciaként (onClick={triggerRequestRest}) sem fordulhat elő sehol —
    // az a korábbi (ötödik körig létező) belső gomb mintája volt.
    assert.doesNotMatch(restStopFlowPanelSrc, /onClick=\{triggerRequestRest\}/);
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
  test("[FRISSÍTVE, hatodik kör] a 'Pihenőre van szükségem' aria-label/min-h-[44px] gomb a hatodik kör óta KIZÁRÓLAG a szülő (VedettUtvonalSearchForm) külső CTA-jaként létezik — a RestStopFlowPanel-nek MÁR NINCS saját, belső ilyen gombja", () => {
    // Hatodik kör ("ADD módból is tűnjön el a másik funkció CTA-ja") —
    // korábban (ötödik körig) a panelnek IS volt egy saját, belső
    // aria-label="Pihenőpontok keresése a közelemben" gombja, ami ADD
    // módban is megjelent az add UI ALATT (ez volt a jelentett duplikáció).
    // Ez a gomb TELJESEN ELTÁVOLÍTVA a RestStopFlowPanel.tsx-ből — az
    // egyetlen ilyen aria-labelű, min-h-[44px] gomb mostantól a szülőben,
    // a "M-P"/"AA-AM" leírók által lefedett külső CTA-ként létezik.
    assert.doesNotMatch(restStopFlowPanelSrc, /aria-label="Pihenőpontok keresése a közelemben"/, "a RestStopFlowPanel-nek NINCS többé saját aria-label='Pihenőpontok keresése a közelemben' gombja");
    const externalBtnMatch = cardSrc.match(/<button[\s\S]{0,300}?onClick=\{handleRequestRestCta\}[\s\S]{0,500}?<\/button>/);
    assert.ok(externalBtnMatch, "meg kell találni a szülőben a külső 'Pihenőre van szükségem' CTA-t");
    assert.match(externalBtnMatch![0], /aria-label="Pihenőpontok keresése a közelemben"/);
    assert.match(externalBtnMatch![0], /min-h-\[44px\]/);
    assert.match(externalBtnMatch![0], />\s*Pihenőre van szükségem\s*</, "a szövegnek is meg kell jelennie, nem csak ikon");
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

// UX KORREKCIÓ (2026-09-13) — Navigation Mode / desktop: a korábbi EGYETLEN
// "Pihenőpont hozzáadása" lebegő CTA helyett desktopon (>= md) KÉT KÜLÖN,
// egymástól függetlenül elérhető gomb jelenik meg — "Pihenőre van
// szükségem" ÉS "Pihenőpont hozzáadása" — hogy a felhasználónak ne kelljen
// előbb megnyitnia a panelt ahhoz, hogy a MEGLÉVŐ rest-stop-flow-t (REQUEST_
// REST) elérje. Mobilon (< md) a viselkedés VÁLTOZATLAN: egyetlen
// "Pihenőpont hozzáadása" gomb, ugyanaz a régi handler. Sem a
// RestStopFlowPanel state machine-je, sem a GPS-snapshot/discovery/route-
// to-rest-point/RestPointQuickAdd mentés-logikája, sem a navigationMode/
// mapFullscreen/VedettUtvonalMap remount-viselkedés NEM módosult — ez
// KIZÁRÓLAG UI-wiring a MEGLÉVŐ REQUEST_REST eseményhez (lásd
// RestStopFlowPanel.tsx triggerRequestRest()/externalRequestRestToken).
const desktopCtaWrapperMatch = cardSrc.match(/\{mapFullscreen && !restPanelVisible && \([\s\S]{0,1200}?<\/div>\s*\)\}/);
const desktopCtaBlock = desktopCtaWrapperMatch ? desktopCtaWrapperMatch[0] : "";

describe("M-P) Desktop UX korrekció (2026-09-13) — 'Pihenőre van szükségem' ÉS 'Pihenőpont hozzáadása' desktopon KÜLÖN, közvetlenül elérhető CTA-ként", () => {
  test("A) desktop fullscreen alatt (mapFullscreen && !restPanelVisible) a 'Pihenőre van szükségem' ÉS a 'Pihenőpont hozzáadása' KÉT KÜLÖN <button> elemként van jelen, ugyanabban a lebegő wrapperben", () => {
    assert.ok(desktopCtaWrapperMatch, "meg kell találni a lebegő CTA wrapper <div>-et");
    const buttonCount = desktopCtaBlock.match(/<button(?=\s)/g) ?? [];
    assert.equal(buttonCount.length, 2, "pontosan 2 <button>-nak kell lennie a wrapperben — nem egy gomb, ami MÖGÖTT rejtve van a másik funkció");
    assert.match(desktopCtaBlock, />\s*Pihenőre van szükségem\s*</);
    assert.match(desktopCtaBlock, />\s*Pihenőpont hozzáadása\s*</);
  });

  test("B) 'Pihenőre van szükségem' a handleRequestRestCta()-n keresztül közvetlenül a MEGLÉVŐ rest-stop flow-t (RestStopFlowPanel triggerRequestRest -> REQUEST_REST) indítja — nem hoz létre új eseményt/state-et", () => {
    assert.match(desktopCtaBlock, /onClick=\{handleRequestRestCta\}/);
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch, "meg kell találni a handleRequestRestCta függvényt");
    assert.match(handlerMatch![0], /setRestPanelVisible\(true\)/, "a panelt is meg kell nyitnia, hogy a keresés eredménye látható legyen");
    assert.match(handlerMatch![0], /setRestRequestToken\(\(token\) => token \+ 1\)/, "a tokent kell increment-elnie, ami a RestStopFlowPanel-t a MEGLÉVŐ REQUEST_REST indítására készteti");
    // A token a RestStopFlowPanel externalRequestRestToken prop-jára fut be,
    // ami a MEGLÉVŐ triggerRequestRest()-en (és azon keresztül a MEGLÉVŐ
    // REQUEST_REST eseményen) fut át — lásd RestStopFlowPanel.tsx, illetve
    // a fenti "C"/"C2" teszteket a teljes bizonyításhoz.
    assert.match(cardSrc, /externalRequestRestToken=\{restRequestToken\}/);
    assert.match(restStopFlowPanelSrc, /externalRequestRestToken\?: number;/);
  });

  test("C) 'Pihenőpont hozzáadása' a MEGLÉVŐ handleAddRestPointCta()-n keresztül nyitja meg a quick-add flow-t — ötödik kör: a handler most már a restPanelMode-ot is 'ADD'-ra állítja, a panel megnyitásán túl nem hoz létre új eseményt/hálózati hívást", () => {
    const quickAddButtonMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(quickAddButtonMatch, "meg kell találni a 'Pihenőpont hozzáadása' gombot a desktop CTA wrapperben");
    assert.doesNotMatch(quickAddButtonMatch![0], /dispatch\(/);
    assert.doesNotMatch(quickAddButtonMatch![0], /REQUEST_REST/);
    assert.doesNotMatch(quickAddButtonMatch![0], /handleRequestRestCta/);
  });

  test("D) a két gomb EGYMÁSTÓL FÜGGETLEN — egyik onClick-je sem hivatkozik a másik gomb handlerére/feliratára, egyiknek a megnyomása sem feltétele a másik elérésének", () => {
    assert.ok(desktopCtaWrapperMatch);
    const requestRestBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleRequestRestCta\}[\s\S]{0,500}?<\/button>/);
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(requestRestBtnMatch && quickAddBtnMatch, "mindkét gombot meg kell találni külön-külön");
    assert.doesNotMatch(requestRestBtnMatch![0], /Pihenőpont hozzáadása/);
    assert.doesNotMatch(quickAddBtnMatch![0], /handleRequestRestCta/);
    // Mindkettő a SAJÁT, KÜLÖN handlerén keresztül, KÖZVETLENÜL (nem egymás
    // megnyitásán keresztül) nyitja meg a panelt — nincs olyan feltétel, ami
    // az egyik gomb interakcióját a másikétól tenné függővé.
    assert.match(requestRestBtnMatch![0], /handleRequestRestCta/);
    assert.match(quickAddBtnMatch![0], /handleAddRestPointCta/);
  });

  test("E) [FRISSÍTVE, mobil+PWA kör, 2026-09-13] mindkét gomb MINDEN viewporton (mobilon is) látható — a korábbi 'hidden ... md:flex' megoldás eltávolítva", () => {
    // Mobil + PWA kibővítés (2026-09-13, második kör) — a KORÁBBI kör a
    // 'Pihenőre van szükségem' desktop CTA-t 'hidden md:flex'-fel < md alatt
    // elrejtette; ez volt PONTOSAN az az extra lépés (a panel megnyitása,
    // hogy a MÁSIK funkciót is elérje), amit a mobil/PWA kör megszüntet.
    // Innentől EGYIK gomb classNamejában sincs semmilyen 'hidden'
    // breakpoint-gating.
    const requestRestBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleRequestRestCta\}[\s\S]{0,500}?<\/button>/);
    assert.ok(requestRestBtnMatch);
    assert.doesNotMatch(requestRestBtnMatch![0], /className="[^"]*hidden/, "a 'Pihenőre van szükségem' gomb mostantól MINDEN viewporton látható, nincs 'hidden' osztálya");
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(quickAddBtnMatch);
    assert.doesNotMatch(
      quickAddBtnMatch![0],
      /className="[^"]*hidden/,
      "a 'Pihenőpont hozzáadása' gombnak MINDEN breakpointon (mobilon is) láthatónak kell maradnia — nincs mobil regresszió"
    );
  });

  test("F) a <VedettUtvonalMap> továbbra is pontosan egyszer renderelődik — a két külön desktop CTA bevezetése nem hozott létre második térkép-instance-ot (lásd a 'G' leírót fent a teljes bizonyításhoz)", () => {
    const mapUsages = cardSrc.match(/<VedettUtvonalMap(?=\s)/g) ?? [];
    assert.equal(mapUsages.length, 1, "a térkép komponensnek pontosan egyszer kell szerepelnie a desktop CTA-korrekció után is");
  });

  test("[FRISSÍTVE, kontraszt-hotfix, 2026-09-13, harmadik kör] mindkét gomb legalább 44px magas (min-h-[44px]); 'Pihenőre van szükségem' elsődleges (bg-sni-brand-navy/text-white, WCAG AA-kompatibilis kontraszt), 'Pihenőpont hozzáadása' másodlagos (bg-white/border-sni-brand-teal/text-sni-brand-blue) vizuális súlyú — MINDKETTŐ valós tailwind.config.ts tokent használ", () => {
    const requestRestBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleRequestRestCta\}[\s\S]{0,500}?<\/button>/);
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(requestRestBtnMatch && quickAddBtnMatch);
    for (const btn of [requestRestBtnMatch![0], quickAddBtnMatch![0]]) {
      assert.match(btn, /min-h-\[44px\]/);
      assert.match(btn, /shadow-2xl/);
    }
    // KONTRASZT-HOTFIX (2026-09-13, harmadik kör) — "Pihenőre van szükségem"
    // — elsődleges: EREDETILEG bg-sni-brand-teal + fehér szöveg volt, ami
    // auditálva ~1.8:1 kontrasztot adott (NEM felel meg a WCAG AA 4.5:1
    // minimumnak normál méretű gombszövegre). A javítás bg-sni-brand-navy
    // (#123A5C, sötét navy) + fehér szöveg — ez messze a 4.5:1 fölötti
    // kontrasztot ad. A régi, nem-megfelelő kombináció NEM térhet vissza.
    assert.match(requestRestBtnMatch![0], /bg-sni-brand-navy/, "az elsődleges CTA-nak a WCAG AA-kompatibilis sni-brand-navy tokent kell használnia");
    assert.match(requestRestBtnMatch![0], /text-white/);
    assert.doesNotMatch(
      requestRestBtnMatch![0],
      /bg-sni-brand-teal(?!\/)/,
      "a bg-sni-brand-teal + text-white kombináció NEM térhet vissza — ez a korábban auditált, ~1.8:1 kontrasztú, WCAG AA-t nem teljesítő páros volt"
    );
    // Hover/focus a projekt MEGLÉVŐ, valós tokenjeire épül (ugyanaz a minta,
    // mint a .btn-primary/.btn-secondary osztályokban, app/globals.css).
    assert.match(requestRestBtnMatch![0], /hover:bg-sni-brand-blue/);
    assert.match(requestRestBtnMatch![0], /focus-visible:ring-sni-brand-teal/);
    // "Pihenőpont hozzáadása" — másodlagos: VÁLTOZATLAN, fehér háttér +
    // brand-teal szegély + brand-blue szöveg.
    assert.match(quickAddBtnMatch![0], /border-sni-brand-teal/);
    assert.match(quickAddBtnMatch![0], /bg-white/);
    assert.match(quickAddBtnMatch![0], /text-sni-brand-blue/);
  });

  test("a desktop/mobil CTA wrapper NEM használ nem létező tailwind tokent (pl. a korábbi 'sni-primary' hiba) — az EBBEN a blokkban szereplő ÖSSZES 'sni-' prefixű osztály a tailwind.config.ts-ben ténylegesen definiált színek egyike", () => {
    // MEGJEGYZÉS: a `sni-primary` token SAJNOS máshol, a fájl RÉGEBBI,
    // ehhez a feladathoz nem tartozó részein (pl. a szenzoros prioritás UX
    // blokkban) még KORÁBBRÓL, ettől a körtől FÜGGETLENÜL is előfordul — ezt
    // a jelen (UI-wiring only, "NE módosíts más funkciót" hatókörű) feladat
    // NEM hivatott javítani, ezért a doesNotMatch ellenőrzést SZŰKEN, a
    // MOST bevezetett desktop/mobil CTA wrapperre (desktopCtaBlock) kell
    // korlátozni, nem a teljes formSrc-re.
    assert.doesNotMatch(desktopCtaBlock, /sni-primary/, "a MOST bevezetett CTA wrapper nem használhatja a nem létező 'sni-primary' tokent");
    // A tailwind.config.ts a sni.{bg,blue,bluedark,green,greendark,beige,
    // text,warn,brand.{teal,blue,navy}} tokeneket definiálja — tehát az
    // ÉRVÉNYES osztálynevek: sni-bg, sni-blue, sni-bluedark, sni-green,
    // sni-greendark, sni-beige, sni-text, sni-warn, sni-brand-teal,
    // sni-brand-blue, sni-brand-navy.
    const validSniTokens = new Set([
      "sni-bg",
      "sni-blue",
      "sni-bluedark",
      "sni-green",
      "sni-greendark",
      "sni-beige",
      "sni-text",
      "sni-warn",
      "sni-brand-teal",
      "sni-brand-blue",
      "sni-brand-navy",
    ]);
    const desktopCtaSniTokenMatches = desktopCtaBlock.match(/\bsni-[a-z-]+\b/g) ?? [];
    for (const token of desktopCtaSniTokenMatches) {
      assert.ok(validSniTokens.has(token), `érvénytelen tailwind sni-token a desktop/mobil CTA blokkban: ${token}`);
    }
  });
});

// MOBIL + PWA KIBŐVÍTÉS (2026-09-13, második kör) — a fenti "M-P" leíró a
// desktop (>= md) kétgombos CTA-t vezette be; ez a kör ugyanazt a KÉT gombot
// (nincs duplikált mobil/desktop JSX-pár) minden viewporton elérhetővé
// teszi — a wrapper flex-iránya vált md-nél (flex-col mobilon, flex-row
// desktopon), a funkcionális wiring (handleRequestRestCta -> ... ->
// triggerRequestRest -> REQUEST_REST, illetve setRestPanelVisible(true) a
// quick-add flow-hoz) VÁLTOZATLAN. A lenti tesztek a felhasználó explicit
// A-J pontjait fedik le, egyenként megnevezve.
describe("Q-Z) Mobil + PWA kibővítés (2026-09-13, második kör) — 'Pihenőre van szükségem' ÉS 'Pihenőpont hozzáadása' minden viewporton közvetlenül elérhető", () => {
  test("A) mobil viewport logikában (a wrapper flex-col ága, md nélkül) is jelen van mindkét gomb — nincs md-hez kötött feltételes render", () => {
    assert.ok(desktopCtaWrapperMatch, "meg kell találni a wrapper <div>-et");
    // Egyik <button> JSX-ét sem előzi meg semmilyen `{... && (` feltétel a
    // wrapperen belül (az egyetlen külső feltétel a `mapFullscreen &&
    // !restPanelVisible`, ami MINDKÉT gombra egyformán vonatkozik — nincs
    // md-specifikus, csak az egyik gombot érintő feltételes JSX-ág).
    const innerConditionals = desktopCtaBlock.slice(desktopCtaBlock.indexOf("<div"));
    assert.doesNotMatch(innerConditionals, /\{[^}]*&&\s*\(/, "a wrapperen BELÜL nem lehet újabb feltételes JSX-ág (pl. csak md-nél renderelt gomb)");
    assert.match(desktopCtaBlock, />\s*Pihenőre van szükségem\s*</);
    assert.match(desktopCtaBlock, />\s*Pihenőpont hozzáadása\s*</);
  });

  test("B) nincs 'hidden md:flex' vagy bármilyen más, mobilon a 'Pihenőre van szükségem' CTA-t elrejtő responsive class a teljes wrapperben", () => {
    assert.doesNotMatch(desktopCtaBlock, /hidden md:flex/);
    assert.doesNotMatch(desktopCtaBlock, /\bhidden\b/, "a wrapperen BELÜL sehol nem szerepelhet 'hidden' osztály — mindkét gomb minden viewporton látható");
    // sm:hidden / max-md:hidden / stb. — bármilyen más, ugyanezt a célt
    // szolgáló, gombot elrejtő minta se legyen jelen.
    assert.doesNotMatch(desktopCtaBlock, /\bmd:hidden\b/);
    assert.doesNotMatch(desktopCtaBlock, /\bsm:hidden\b/);
  });

  test("C) a wrapper flex-iránya mobilon (alapértelmezett, md nélkül) flex-col — EGYMÁS ALATT —, md+ esetén továbbra is flex-row — EGYMÁS MELLETT", () => {
    assert.match(desktopCtaWrapperMatch![0], /className="fixed right-3 z-\[60\] flex flex-col items-end gap-2 md:flex-row md:items-center"/);
  });

  test("D) mindkét gomb legalább 44px magas (min-h-[44px]) — lásd a fenti 'M-P' vizuális tesztet is a teljes lefedettséghez", () => {
    const requestRestBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleRequestRestCta\}[\s\S]{0,500}?<\/button>/);
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(requestRestBtnMatch && quickAddBtnMatch);
    assert.match(requestRestBtnMatch![0], /min-h-\[44px\]/);
    assert.match(quickAddBtnMatch![0], /min-h-\[44px\]/);
  });

  test("E) 'Pihenőre van szükségem' mobilon/PWA-ban is a MEGLÉVŐ handleRequestRestCta() -> setRestPanelVisible(true) + restRequestToken increment -> RestStopFlowPanel externalRequestRestToken -> triggerRequestRest() -> REQUEST_REST láncot használja — nincs külön mobil-specifikus wiring", () => {
    // A wiring NEM viewport-függő JSX/kód-ág — ugyanaz az onClick={handleRequestRestCta}
    // fut le mobilon és desktopon is, mert a gomb egyetlen, közös JSX-elem
    // (nincs duplikált <button> mobil/desktop párban).
    assert.match(desktopCtaBlock, /onClick=\{handleRequestRestCta\}/);
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.match(handlerMatch![0], /setRestPanelVisible\(true\)/);
    assert.match(handlerMatch![0], /setRestRequestToken\(\(token\) => token \+ 1\)/);
    assert.match(cardSrc, /externalRequestRestToken=\{restRequestToken\}/);
    assert.match(restStopFlowPanelSrc, /externalRequestRestToken\?: number;/);
    assert.match(restStopFlowPanelSrc, /function triggerRequestRest\(\) \{\s*\n\s*dispatch\(\{ type: "REQUEST_REST" \}\);\s*\n\s*\}/);
  });

  test("F) 'Pihenőpont hozzáadása' mobilon/PWA-ban is a MEGLÉVŐ handleAddRestPointCta() hívást használja a quick-add flow megnyitásához — nincs dispatch/REQUEST_REST/fetch a gomb körül", () => {
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(quickAddBtnMatch);
    assert.match(quickAddBtnMatch![0], /onClick=\{handleAddRestPointCta\}/);
    assert.doesNotMatch(quickAddBtnMatch![0], /dispatch\(/);
    assert.doesNotMatch(quickAddBtnMatch![0], /REQUEST_REST/);
    assert.doesNotMatch(quickAddBtnMatch![0], /fetch\(/);
  });

  test("G) mobilon (és minden más viewporton) egyik action sem függ a másik megnyitásától — mindkét onClick KÖZVETLENÜL a saját handlerét hívja, egyik sem hivatkozik a másikra", () => {
    const requestRestBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleRequestRestCta\}[\s\S]{0,500}?<\/button>/);
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(requestRestBtnMatch && quickAddBtnMatch);
    // A "Pihenőre van szükségem" gomb blokkja NEM tartalmazhatja a másik
    // gomb aria-label-jét/feliratát (nincs beágyazás, nincs egymásra
    // hivatkozás), és fordítva.
    assert.doesNotMatch(requestRestBtnMatch![0], /Pihenőpont hozzáadása/);
    assert.doesNotMatch(quickAddBtnMatch![0], /handleRequestRestCta/);
    assert.doesNotMatch(quickAddBtnMatch![0], /Pihenőre van szükségem/);
  });

  test("H) PWA/fullscreen esetben a wrapper a fullscreen map (z-50) FÖLÖTT marad (z-[60]) és a MEGLÉVŐ safe-area mintát (env(safe-area-inset-bottom, 0px)) használja — nincs párhuzamos safe-area rendszer bevezetve", () => {
    assert.match(desktopCtaWrapperMatch![0], /z-\[60\]/);
    assert.match(desktopCtaWrapperMatch![0], /bottom: "calc\(env\(safe-area-inset-bottom, 0px\) \+ 12px\)"/);
    // Ugyanaz a minta, mint a "Bezárás" utáni content-padding-nél (feljebb) —
    // nincs második, eltérő safe-area képlet a fájlban.
    const safeAreaPatterns = formSrc.match(/env\(safe-area-inset-bottom, 0px\)/g) ?? [];
    assert.ok(safeAreaPatterns.length >= 2, "a safe-area mintának több helyen, KONZISZTENSEN kell megjelennie, nem egy elszigetelt, egyedi megoldásként");
    // A fullscreen map wrapper (z-50) a forrásban a mi wrapperünk (z-[60])
    // ELŐTT áll — tehát ez utóbbi valóban FÖLÉ kerül vizuálisan.
    const mapWrapperIdx = cardSrc.indexOf('className={mapFullscreen ? "fixed inset-0 z-50 bg-black" : "relative"}');
    assert.ok(mapWrapperIdx !== -1 && mapWrapperIdx < desktopCtaWrapperMatch!.index!);
  });

  test("I) a <VedettUtvonalMap> a mobil+PWA kibővítés után is pontosan egyszer renderelődik", () => {
    const mapUsages = cardSrc.match(/<VedettUtvonalMap(?=\s)/g) ?? [];
    assert.equal(mapUsages.length, 1);
  });

  test("J) a desktop (>= md) viselkedés nem regresszált — a wrapper továbbra is md:flex-row md:items-center-re vált, a gombok pozíciója (right-3, alul) és feliratai változatlanok", () => {
    assert.match(desktopCtaWrapperMatch![0], /md:flex-row md:items-center/);
    assert.match(desktopCtaWrapperMatch![0], /fixed right-3/);
    assert.match(desktopCtaBlock, />\s*Pihenőre van szükségem\s*</);
    assert.match(desktopCtaBlock, />\s*Pihenőpont hozzáadása\s*</);
  });
});

// UX HOTFIX (2026-09-13, negyedik kör, MÓDOSÍTVA az ötödik körben) —
// "duplikált CTA / idle-flash" javítás. ROOT CAUSE: a külső "Pihenőre van
// szükségem" gomb ugyanabban a React-batch-ben nyitotta meg a bottom
// sheetet ÉS increment-elte az externalRequestRestToken-t, de a
// triggerRequestRest() dispatch csak egy KÉSŐBBI (a festés UTÁN futó)
// effektben történt — emiatt a panel egy pillanatra a régi ROUTE_ACTIVE
// (idle) állapotával festődött ki, amiben EGYSZERRE látszott a
// RestStopFlowPanel saját "Pihenőre van szükségem" gombja ÉS a szülőben
// (akkor még feltétel nélkül mindig jelen lévő) RestPointQuickAdd
// "Pihenőpont hozzáadása" trigger gombja. A negyedik kör javítása egy
// `awaitingExternalRequestRest` React state-et vezetett be
// (useLayoutEffect-tel állítva, hogy a festés ELŐTT lefusson), ami elrejti
// a panel SAJÁT idle gombját és helyette loading szöveget mutat, amíg a
// MEGLÉVŐ effekt-lánc a MEGLÉVŐ REQUEST_REST eseményt dispatch-eli — ez a
// mechanizmus VÁLTOZATLANUL megmaradt, a lenti tesztek ezt fedik le. A
// RestPointQuickAdd trigger elrejtését viszont az ÖTÖDIK kör már NEM erre
// az átmeneti flagre, hanem a stabil `restPanelMode`-ra bízza — lásd az
// alábbi "AA-AM" leírót a teljes lefedettségért.
const loadingTextSourceMatch = restStopFlowPanelSrc.match(/\{\(ctx\.state === "REST_REQUESTED"[\s\S]{0,300}?<\/p>\s*\)\}/);

describe("R-Z2) UX HOTFIX (2026-09-13, negyedik kör) — a külső 'Pihenőre van szükségem' AZONNAL a REQUEST_REST flow-t indítja, a panel SAJÁT idle gombja SOSEM villan fel", () => {
  test("A) a külső 'Pihenőre van szükségem' → handleRequestRestCta → restRequestToken → externalRequestRestToken → awaitingExternalRequestRest → triggerRequestRest → MEGLÉVŐ REQUEST_REST lánc TELJES, megszakítás nélkül végigkövethető", () => {
    // handleRequestRestCta a szülőben (VedettUtvonalSearchForm.tsx).
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.match(handlerMatch![0], /setRestRequestToken\(\(token\) => token \+ 1\)/);
    assert.match(cardSrc, /externalRequestRestToken=\{restRequestToken\}/);
    // A panelban: externalRequestRestToken change -> awaitingExternalRequestRest -> triggerRequestRest() -> dispatch(REQUEST_REST).
    assert.match(restStopFlowPanelSrc, /setAwaitingExternalRequestRest\(true\)/);
    assert.match(
      restStopFlowPanelSrc,
      /if \(!awaitingExternalRequestRest\) return;\s*\n\s*if \(ctx\?\.state !== "ROUTE_ACTIVE"\) return;\s*\n\s*setAwaitingExternalRequestRest\(false\);\s*\n\s*triggerRequestRest\(\);/,
      "az awaiting flag-nek pontosan akkor kell triggerRequestRest()-et hívnia, amikor a state ROUTE_ACTIVE — utána azonnal false-ra kell állnia"
    );
    assert.match(restStopFlowPanelSrc, /function triggerRequestRest\(\) \{\s*\n\s*dispatch\(\{ type: "REQUEST_REST" \}\);\s*\n\s*\}/);
  });

  test("B) external request esetén a panel SAJÁT ('belső') idle gombja NEM jelenik meg köztes renderben — helyette azonnal a loading szöveg látszik", () => {
    // Hatodik kör óta a panel SAJÁT idle gombja TELJESEN el van távolítva a
    // forrásból (nem csak feltételesen rejtve) — lásd az "AN" leírót lent.
    assert.doesNotMatch(restStopFlowPanelSrc, /\{ctx\.state === "ROUTE_ACTIVE" && !awaitingExternalRequestRest && \(/);
    // A szülőben a RestPointQuickAdd trigger UI a stabil restPanelMode-tól
    // függ (lásd "AA-AM" leíró) — ez a teszt itt a loading szöveg
    // ROUTE_ACTIVE+awaiting köztes ágát ellenőrzi (villanás-mentesítés).
    assert.ok(loadingTextSourceMatch, "meg kell találni a loading szöveget renderelő feltételt");
    assert.match(loadingTextSourceMatch![0], /ctx\.state === "ROUTE_ACTIVE" && awaitingExternalRequestRest/);
  });

  test("C) nincs szükség második kattintásra — a triggerRequestRest() hívás a MEGLÉVŐ effekt-láncból, felhasználói interakció nélkül fut le, amint a state ROUTE_ACTIVE", () => {
    // A dispatch-hívás (triggerRequestRest teste) NEM egy onClick-ben, hanem
    // egy useEffect-ben él — tehát nem igényel újabb kattintást.
    const effectBlock = restStopFlowPanelSrc.match(/useEffect\(\(\) => \{\s*\n\s*if \(!awaitingExternalRequestRest\) return;[\s\S]*?\}, \[awaitingExternalRequestRest, ctx\?\.state\]\);/);
    assert.ok(effectBlock, "meg kell találni az awaiting-vezérelt effektet");
    assert.doesNotMatch(effectBlock![0], /onClick/);
  });

  test("D) a külső 'Pihenőpont hozzáadása' továbbra is a MEGLÉVŐ quick-add/panel flow-t (handleAddRestPointCta) nyitja — nincs externalRequestRestToken increment ezen az ágon", () => {
    const quickAddBtnMatch = desktopCtaBlock.match(/<button[\s\S]{0,300}?onClick=\{handleAddRestPointCta\}[\s\S]{0,300}?<\/button>/);
    assert.ok(quickAddBtnMatch);
    assert.doesNotMatch(quickAddBtnMatch![0], /restRequestToken/);
    const handlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch, "meg kell találni a handleAddRestPointCta függvényt");
    assert.doesNotMatch(handlerMatch![0], /restRequestToken/);
  });

  test("E) a két külső CTA egymástól FÜGGETLEN marad ebben a körben is — a handleRequestRestCta() nem hivatkozik a quick-add gombra/handlerre, és fordítva", () => {
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.doesNotMatch(handlerMatch![0], /handleAddRestPointCta/);
    assert.doesNotMatch(handlerMatch![0], /RestPointQuickAdd/);
    const addHandlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(addHandlerMatch);
    assert.doesNotMatch(addHandlerMatch![0], /handleRequestRestCta/);
    assert.doesNotMatch(addHandlerMatch![0], /setRestRequestToken/);
  });

  test("F) mobil/PWA és desktop ugyanazt a funkcionális wiringot használja — a handleRequestRestCta/restRequestToken/awaitingExternalRequestRest/triggerRequestRest lánc NEM viewport-függő (nincs md:/sm: prefixű feltétel a wiring körül)", () => {
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.doesNotMatch(handlerMatch![0], /\bmd:|\bsm:/, "a handler törzse nem tartalmazhat responsive (breakpoint-függő) logikát");
    // A RestStopFlowPanel awaiting-effektjei sem hivatkoznak semmilyen
    // viewport/breakpoint-jelre.
    assert.doesNotMatch(restStopFlowPanelSrc, /window\.matchMedia|innerWidth/);
  });

  test("G) a GPS-snapshot/nearby discovery (REST_POINTS_LOADING effekt) VÁLTOZATLANUL, pontosan egyszer indul — a hotfix nem adott hozzá második dispatch-elési vagy fetch-hívási helyet", () => {
    const nearbyFetchSites = restStopFlowPanelSrc.match(/postJson<\{ restPoints: RankedRestPoint\[\]/g) ?? [];
    assert.equal(nearbyFetchSites.length, 1, "a /nearby hívásnak pontosan egy helyen kell szerepelnie — a hotfix nem duplikálhatta");
    const startLoadingDispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "START_LOADING_REST_POINTS"/g) ?? [];
    assert.equal(startLoadingDispatchSites.length, 1, "a START_LOADING_REST_POINTS dispatch-nek pontosan egy helyen kell szerepelnie");
  });

  test("H) a <VedettUtvonalMap> a hotfix után is pontosan egyszer renderelődik — a wrapper <div> react-fa-pozíciója nem változott", () => {
    const mapUsages = cardSrc.match(/<VedettUtvonalMap(?=\s)/g) ?? [];
    assert.equal(mapUsages.length, 1);
  });

  test("I) a REQUEST_REST state-machine szemantikája VÁLTOZATLAN — a hotfix nem ad hozzá új eseménytípust/átmenetet, a triggerRequestRest() a MEGLÉVŐ, egyetlen dispatch-hívást használja", () => {
    const dispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "REQUEST_REST" \}\)/g) ?? [];
    assert.equal(dispatchSites.length, 1, "a REQUEST_REST-nek továbbra is pontosan egy TÉNYLEGES dispatch-hívási helye van — a triggerRequestRest() törzse");
    // Nincs új, "REQUEST_REST"-hez hasonló, önálló eseménytípus bevezetve.
    assert.doesNotMatch(restStopFlowPanelSrc, /type: "EXTERNAL_REQUEST_REST"/);
    assert.doesNotMatch(restStopFlowPanelSrc, /type: "AWAITING_REQUEST_REST"/);
  });
});

// UX HOTFIX (2026-09-13, ötödik kör) — "Rest Search és Rest Point Add mód
// teljes szétválasztása". Root cause: a negyedik kör `restRequestPending`
// flagje csak a köztes, klikk→REQUEST_REST ablakig élt — ahogy a keresés
// állapotgépe REST_POINTS_LOADING/READY-re lépett, a flag visszaállt
// false-ra, és a RestPointQuickAdd trigger (a "Pihenőpont hozzáadása"
// funkció) ÚJRA megjelent a már látható találati lista ALATT. A javítás
// egy STABIL, a panel TELJES megnyitott session-jére érvényes
// `restPanelMode` ("SEARCH" | "ADD") state a szülőben
// (VedettUtvonalSearchForm.tsx) — ez a panel megnyílásának OKÁT rögzíti, a
// keresés/betöltés/eredmény összes fázisában, nem csak egy rövid, átmeneti
// pillanatban. A lenti tesztek a felhasználó explicit A-M pontjait fedik
// le, egyenként megnevezve.
// Hatodik kör ("ADD módból is tűnjön el a másik funkció CTA-ja") — a
// `RestPanelMode` típus EGYETLEN forrásból, a RestStopFlowPanel.tsx-ből van
// importálva (nem egy helyi, csak a szülőben élő típus-deklaráció), mert a
// panelnek magának is ismernie kell a módot ahhoz, hogy a SAJÁT belső
// idle-chooser UI-ját is el tudja rejteni mindkét explicit módban.
const restPanelModeImportMatch = formSrc.match(/import RestStopFlowPanel, \{ type RestStopMapState, type RestPanelMode \} from "\.\/RestStopFlowPanel";/);
const restPanelModeStateMatch = formSrc.match(/const \[restPanelMode, setRestPanelMode\] = useState<RestPanelMode>\("ADD"\);/);
const stickyHeaderMatch = cardSrc.match(/<span className="text-sm font-semibold text-sni-text">[\s\S]{0,150}?<\/span>/);

describe("AA-AM) UX HOTFIX (2026-09-13, ötödik kör) — RestPanelMode: 'Pihenőre van szükségem' (SEARCH) és 'Pihenőpont hozzáadása' (ADD) teljes UI-szétválasztása", () => {
  test("A) a külső 'Pihenőre van szükségem' (handleRequestRestCta) restPanelMode-ot 'SEARCH'-re állítja, MIELŐTT a panel megnyílna", () => {
    assert.ok(restPanelModeImportMatch, "a RestPanelMode típust a RestStopFlowPanel.tsx-ből kell importálni (egyetlen forrás)");
    assert.ok(restPanelModeStateMatch, "meg kell találni a stabil restPanelMode state-et");
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.match(handlerMatch![0], /setRestPanelMode\("SEARCH"\)/, "handleRequestRestCta-nak SEARCH módra kell állítania a panelt");
  });

  test("B) SEARCH módban a <RestPointQuickAdd> EGYÁLTALÁN nem renderelődik — a feltétel restPanelMode === 'ADD'-hoz kötött, nem egy átmeneti flaghez", () => {
    assert.match(
      cardSrc,
      /\{restPanelMode === "ADD" && \(\s*\n\s*<RestPointQuickAdd onCreated=\{\(rp\) => setSessionRestPoints\(\(points\) => \[\.\.\.points, rp\]\)\} \/>\s*\n\s*\)\}/,
      "a RestPointQuickAdd-nak KIZÁRÓLAG restPanelMode === 'ADD' esetén szabad a JSX-fába kerülnie"
    );
    // A régi, csak átmenetileg védő restRequestPending-alapú CSS-hide minta
    // (state deklaráció + a RestPointQuickAdd wrapper `className={restRequestPending
    // ? "hidden" : undefined}` mintája) megszűnt — a szó a fájlban csak
    // TÖRTÉNETI dokumentáció-kommentekben maradhat (a korábbi kör
    // hiányosságának leírásaként), TÉNYLEGES kódként (state deklaráció/
    // className kifejezés) sehol nem szerepelhet.
    assert.doesNotMatch(cardSrc, /const \[restRequestPending, setRestRequestPending\]/);
    assert.doesNotMatch(cardSrc, /className=\{restRequestPending/);
  });

  test("C) SEARCH módban nincs 'Pihenőpont hozzáadása' feliratú CTA/gomb a panelen belül — a sticky fejléc címe SEARCH alatt NEM ez a szöveg", () => {
    assert.ok(stickyHeaderMatch, "meg kell találni a sticky fejléc <span> címét");
    assert.match(stickyHeaderMatch![0], /restPanelMode === "SEARCH" \? "Közeli pihenőhelyek" : "Pihenőpont hozzáadása"/);
  });

  test("D) SEARCH módban a sticky fejléc címe NEM 'Pihenőpont hozzáadása' — a feltétel a restPanelMode-tól függ, egy másik, keresésre utaló szöveget ad (pl. 'Közeli pihenőhelyek')", () => {
    assert.ok(stickyHeaderMatch);
    assert.match(stickyHeaderMatch![0], /"Közeli pihenőhelyek"/);
    assert.match(stickyHeaderMatch![0], /restPanelMode === "SEARCH"/);
  });

  test("E) a betöltés (REST_POINTS_LOADING) UTÁN a találati lista (REST_POINTS_READY) KÖZVETLENÜL megjelenik — a RestStopFlowPanel ehhez semmilyen restPanelMode-kapcsolt logikát nem igényel, a saját belső ctx.state-alapú renderje VÁLTOZATLAN", () => {
    assert.match(restStopFlowPanelSrc, /ctx\.state === "REST_POINTS_READY" && ctx\.rankedRestPoints/);
    // A RestStopFlowPanel props-interfésze és a komponens paraméterlistája
    // egyáltalán nem ismeri/fogadja a restPanelMode-ot — a szülő UI-döntés,
    // nem a panel állapotgépéé (a `restPanelMode` szó a fájlban legfeljebb
    // TÖRTÉNETI dokumentáció-kommentként fordulhat elő, TÉNYLEGES kódként —
    // prop/paraméter/state-ként — sehol).
    assert.doesNotMatch(restStopFlowPanelSrc, /restPanelMode\??:\s*RestPanelMode/);
    assert.doesNotMatch(restStopFlowPanelSrc, /\brestPanelMode,/);
    assert.doesNotMatch(restStopFlowPanelSrc, /const \[restPanelMode/);
  });

  test("F) 'Ide megyek' (route-to-rest-point CTA) VÁLTOZATLANUL jelen van és működik — ez a RestStopFlowPanel saját, restPanelMode-tól független belső logikája", () => {
    assert.match(restStopFlowPanelSrc, /Ide megyek/);
  });

  test("G) a külső 'Pihenőpont hozzáadása' (handleAddRestPointCta) restPanelMode-ot 'ADD'-ra állítja", () => {
    const handlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch, "meg kell találni a handleAddRestPointCta függvényt");
    assert.match(handlerMatch![0], /setRestPanelMode\("ADD"\)/);
    assert.match(handlerMatch![0], /setRestPanelVisible\(true\)/);
  });

  test("H) ADD módban a <RestPointQuickAdd> továbbra is elérhető — a feltétel (restPanelMode === 'ADD') igazra értékelődik ki, a komponens saját belső logikája/mentés-flow-ja nem módosult", () => {
    assert.match(cardSrc, /\{restPanelMode === "ADD" && \(/);
    assert.match(formSrc, /import RestPointQuickAdd, \{ type RestPointCreatedPayload \} from "\.\/RestPointQuickAdd";/);
  });

  test("I) a két mód EGYMÁSTÓL FÜGGETLEN — handleRequestRestCta és handleAddRestPointCta egyike sem hivatkozik a másikra", () => {
    const requestHandlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    const addHandlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(requestHandlerMatch && addHandlerMatch);
    assert.doesNotMatch(requestHandlerMatch![0], /handleAddRestPointCta/);
    assert.doesNotMatch(addHandlerMatch![0], /handleRequestRestCta/);
    assert.doesNotMatch(addHandlerMatch![0], /setRestRequestToken/);
  });

  test("J) a panel bezárása (handleCloseRestPanel) mindig 'ADD'-ra állítja vissza a restPanelMode-ot — a mód SOSEM maradhat 'beragadva' egy korábbi session-ből", () => {
    const closeHandlerMatch = formSrc.match(/const handleCloseRestPanel = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(closeHandlerMatch, "meg kell találni a handleCloseRestPanel függvényt");
    assert.match(closeHandlerMatch![0], /setRestPanelVisible\(false\)/);
    assert.match(closeHandlerMatch![0], /setRestPanelMode\("ADD"\)/);
    // A bezárás gombnak (✕) ezt a függvényt kell hívnia, nem egy inline setRestPanelVisible(false)-t.
    assert.match(cardSrc, /onClick=\{handleCloseRestPanel\}/);
    // startNavigation() (friss navigáció-indítás) szintén biztonságos alapállapotba állítja a módot.
    const startNavMatch = cardSrc.match(/const startNavigation = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(startNavMatch, "meg kell találni a startNavigation függvényt");
    assert.match(startNavMatch![0], /setRestPanelMode\("ADD"\)/);
  });

  test("K) a GPS-pillanatkép és a nearby-kérés pontosan egyszer indul SEARCH módban — a restPanelMode bevezetése nem hozott létre második dispatch-elési/fetch-hívási helyet", () => {
    const dispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "REQUEST_REST" \}\)/g) ?? [];
    assert.equal(dispatchSites.length, 1);
    const nearbyFetchSites = restStopFlowPanelSrc.match(/postJson<\{ restPoints: RankedRestPoint\[\]/g) ?? [];
    assert.equal(nearbyFetchSites.length, 1);
  });

  test("L) a <VedettUtvonalMap> a restPanelMode bevezetése után is pontosan egyszer renderelődik", () => {
    const mapUsages = cardSrc.match(/<VedettUtvonalMap(?=\s)/g) ?? [];
    assert.equal(mapUsages.length, 1);
  });

  test("M) a mód-logika NEM viewport-függő — sem handleRequestRestCta, sem handleAddRestPointCta, sem handleCloseRestPanel törzsében nincs md:/sm: prefixű breakpoint-feltétel; desktop és mobil/PWA ugyanazt a restPanelMode-ot használja", () => {
    const requestHandlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    const addHandlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    const closeHandlerMatch = formSrc.match(/const handleCloseRestPanel = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(requestHandlerMatch && addHandlerMatch && closeHandlerMatch);
    for (const handler of [requestHandlerMatch![0], addHandlerMatch![0], closeHandlerMatch![0]]) {
      assert.doesNotMatch(handler, /\bmd:|\bsm:/);
    }
  });

  test("a RestStopFlowPanel.tsx-ben a régi, transzens onExternalRequestRestPendingChange callback/prop TÉNYLEGESEN NYUGDÍJAZVA — a RestPointQuickAdd láthatóságát mostantól kizárólag a szülő stabil restPanelMode state-je dönti el", () => {
    // A szó (dokumentáció-kommentekben, a döntés indoklásaként) MARADHAT a
    // fájlban — TÉNYLEGES kódként (prop-deklaráció/destrukturált paraméter/
    // JSX-attribútum/callback-hívás) viszont sehol nem szerepelhet.
    assert.doesNotMatch(restStopFlowPanelSrc, /onExternalRequestRestPendingChange\?:/, "nem lehet prop-deklaráció a Props interface-ben");
    assert.doesNotMatch(restStopFlowPanelSrc, /\bonExternalRequestRestPendingChange,/, "nem lehet destrukturált paraméter a komponens szignatúrájában");
    assert.doesNotMatch(restStopFlowPanelSrc, /onExternalRequestRestPendingChange\?\.\(/, "nem hívódhat callback-ként");
    assert.doesNotMatch(cardSrc, /onExternalRequestRestPendingChange=\{/, "a szülő nem adhatja át ezt a JSX-propot a RestStopFlowPanel-nek");
    // Az awaitingExternalRequestRest mechanizmus MAGA (a panel saját idle
    // gombjának villanás-mentesítése) továbbra is aktív és változatlan marad.
    assert.match(restStopFlowPanelSrc, /awaitingExternalRequestRest/);
  });
});

// UX HOTFIX (2026-09-13, hatodik kör) — "ADD módból is tűnjön el a másik
// funkció CTA-ja". Root cause: az ötödik kör CSAK a szülőben
// (VedettUtvonalSearchForm) vezette be a stabil restPanelMode-ot, és azzal
// KIZÁRÓLAG a RestPointQuickAdd/sticky-fejléc láthatóságát döntötte el — a
// RestStopFlowPanel SAJÁT belső idle-chooser gombja ("Pihenőre van
// szükségem") ezt NEM ismerte, ezért ADD módban (külső "Pihenőpont
// hozzáadása") is tovább látszott az add UI ALATT. A javítás: a panel
// mostantól egy explicit, KÖTELEZŐ `mode: RestPanelMode` propot kap, és a
// SAJÁT belső idle-chooser gombját TELJESEN eltávolítottuk (mindkét explicit
// módban a döntés MÁR a szülőben, a külső CTA-k valamelyikének megnyomásával
// megtörtént). A lenti tesztek a felhasználó explicit A-L pontjait fedik le.
const restStopFlowPanelModeParamMatch = restStopFlowPanelSrc.match(/export default function RestStopFlowPanel\(\{[\s\S]{0,400}?\r?\n {2}mode,\r?\n\}: RestStopFlowPanelProps\)/);
const restStopFlowPanelJsxMatch = /<RestStopFlowPanel(?=\s)/.exec(cardSrc);
const restStopFlowPanelJsxBlock = restStopFlowPanelJsxMatch ? cardSrc.slice(restStopFlowPanelJsxMatch.index, restStopFlowPanelJsxMatch.index + 500) : "";

describe("AN-AY) UX HOTFIX (2026-09-13, hatodik kör) — a RestStopFlowPanel SAJÁT belső renderelése is a explicit mode propot követi, ADD módból is eltűnik a másik funkció döntőgombja", () => {
  test("A) a külső 'Pihenőre van szükségem' (handleRequestRestCta) restPanelMode-ot 'SEARCH'-re állítja, ez adódik át a panelnek mode propként", () => {
    const handlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.match(handlerMatch![0], /setRestPanelMode\("SEARCH"\)/);
    assert.match(restStopFlowPanelJsxBlock, /mode=\{restPanelMode\}/, "a RestStopFlowPanel-nek a szülő restPanelMode state-jét kell propként kapnia");
  });

  test("B) SEARCH módban nincs 'Pihenőpont hozzáadása' cím, CTA, sem belső chooser CTA — sem a szülőben (RestPointQuickAdd/fejléc), sem a panelben (saját idle gomb, ami TELJESEN el lett távolítva)", () => {
    assert.match(cardSrc, /\{restPanelMode === "ADD" && \(/, "a RestPointQuickAdd-nak restPanelMode === 'ADD'-hoz kell kötődnie");
    assert.doesNotMatch(restStopFlowPanelSrc, /aria-label="Pihenőpontok keresése a közelemben"/, "a panelnek NINCS saját belső 'Pihenőre van szükségem' döntőgombja SEMMILYEN módban");
    assert.doesNotMatch(restStopFlowPanelSrc, />\s*Pihenőre van szükségem\s*</, "a panel forrásában sehol nem jelenhet meg ez a szöveg gombként");
  });

  test("C) SEARCH mode alatt a nearby loading/találati lista VÁLTOZATLANUL megjelenik — a panel saját ctx.state-alapú renderje (REST_REQUESTED/REST_POINTS_LOADING/REST_POINTS_READY) nem függ a most bevezetett mode-tól", () => {
    assert.match(restStopFlowPanelSrc, /ctx\.state === "REST_REQUESTED" \|\|\s*\n\s*ctx\.state === "REST_POINTS_LOADING"/);
    assert.match(restStopFlowPanelSrc, /ctx\.state === "REST_POINTS_READY" && ctx\.rankedRestPoints/);
  });

  test("D) a külső 'Pihenőpont hozzáadása' (handleAddRestPointCta) restPanelMode-ot 'ADD'-ra állítja, ez adódik át a panelnek mode propként", () => {
    const handlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(handlerMatch);
    assert.match(handlerMatch![0], /setRestPanelMode\("ADD"\)/);
    assert.match(restStopFlowPanelJsxBlock, /mode=\{restPanelMode\}/);
  });

  test("E) ADD mode alatt VÁLTOZATLANUL van add UI / RestPointQuickAdd", () => {
    assert.match(cardSrc, /\{restPanelMode === "ADD" && \(\s*\n\s*<RestPointQuickAdd/);
  });

  test("F) ADD mode alatt NINCS 'Pihenőre van szükségem' belső CTA — ez a hatodik kör KÖZPONTI javítása: a panel SAJÁT belső idle-chooser gombja TELJESEN el lett távolítva a forrásból, tehát SEMMILYEN mode-ban (ADD-ban sem) nem tud megjelenni", () => {
    assert.ok(restStopFlowPanelModeParamMatch, "a RestStopFlowPanel-nek destrukturált 'mode' paraméterrel kell rendelkeznie");
    assert.doesNotMatch(restStopFlowPanelSrc, /onClick=\{triggerRequestRest\}/, "nincs többé olyan JSX-elem, ami közvetlenül hívná a triggerRequestRest-et");
    assert.doesNotMatch(restStopFlowPanelSrc, /\{ctx\.state === "ROUTE_ACTIVE" && !awaitingExternalRequestRest && \(/, "a korábbi (ötödik körig létező) idle-chooser JSX-ág megszűnt");
  });

  test("G) a két mód EGYMÁSTÓL FÜGGETLEN a panelben is — a mode prop olvasása KIZÁRÓLAG a loading-szöveg ROUTE_ACTIVE+awaiting ágát szűkíti SEARCH-re, semmilyen más ctx.state-ágat nem korlátoz egyik mód sem", () => {
    assert.match(restStopFlowPanelSrc, /mode === "SEARCH" && ctx\.state === "ROUTE_ACTIVE" && awaitingExternalRequestRest/);
    // A REST_POINTS_READY/REST_POINT_SELECTED/ROUTING_TO_REST_POINT/stb. ágak egyike sem hivatkozik mode-ra.
    const readyBlockMatch = restStopFlowPanelSrc.match(/\{ctx\.state === "REST_POINTS_READY" && ctx\.rankedRestPoints && \(([\s\S]*?)\n {6}\)\}/);
    assert.ok(readyBlockMatch, "meg kell találni a REST_POINTS_READY render-ágat");
    assert.doesNotMatch(readyBlockMatch![1], /\bmode\b/, "a találati lista renderelése nem függhet a mode-tól");
  });

  test("H) close/reset után a mód NEM ragad bent — handleCloseRestPanel és startNavigation is 'ADD'-ra állítja vissza restPanelMode-ot", () => {
    const closeHandlerMatch = formSrc.match(/const handleCloseRestPanel = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(closeHandlerMatch);
    assert.match(closeHandlerMatch![0], /setRestPanelMode\("ADD"\)/);
    const startNavMatch = cardSrc.match(/const startNavigation = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(startNavMatch);
    assert.match(startNavMatch![0], /setRestPanelMode\("ADD"\)/);
  });

  test("I) a REQUEST_REST esemény továbbra is PONTOSAN EGYSZER indul a SEARCH flow-ban — a mode prop bevezetése nem duplikálta/módosította a dispatch-hívást", () => {
    const dispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "REQUEST_REST" \}\)/g) ?? [];
    assert.equal(dispatchSites.length, 1);
    const invocationSites = restStopFlowPanelSrc.match(/^\s*triggerRequestRest\(\);\s*$/gm) ?? [];
    assert.equal(invocationSites.length, 1, "a triggerRequestRest()-nek a hatodik kör óta PONTOSAN EGY (a külső effektből jövő) hívási helye van");
  });

  test("J) a GPS-snapshot/nearby discovery logika VÁLTOZATLAN — a mode prop bevezetése nem érinti a REST_POINTS_LOADING effektet vagy a /nearby hívást", () => {
    const nearbyFetchSites = restStopFlowPanelSrc.match(/postJson<\{ restPoints: RankedRestPoint\[\]/g) ?? [];
    assert.equal(nearbyFetchSites.length, 1);
    const startLoadingDispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "START_LOADING_REST_POINTS"/g) ?? [];
    assert.equal(startLoadingDispatchSites.length, 1);
    assert.doesNotMatch(restStopFlowPanelSrc, /mode[\s\S]{0,60}postJson|postJson[\s\S]{0,60}mode/, "a /nearby hívás guard-ja nem hivatkozhat a mode-ra");
  });

  test("K) a <VedettUtvonalMap> a mode prop bevezetése után is pontosan egyszer renderelődik — nincs remount", () => {
    const mapUsages = cardSrc.match(/<VedettUtvonalMap(?=\s)/g) ?? [];
    assert.equal(mapUsages.length, 1);
  });

  test("L) desktop és mobil/PWA ugyanazt a mode-logikát használja — a mode prop átadása és a handlerek nem viewport-függők (nincs md:/sm: prefixű feltétel körülöttük)", () => {
    assert.doesNotMatch(restStopFlowPanelJsxBlock, /\bmd:|\bsm:/);
    const requestHandlerMatch = formSrc.match(/const handleRequestRestCta = \(\) => \{[\s\S]*?\n {2}\};/);
    const addHandlerMatch = formSrc.match(/const handleAddRestPointCta = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(requestHandlerMatch && addHandlerMatch);
    assert.doesNotMatch(requestHandlerMatch![0], /\bmd:|\bsm:/);
    assert.doesNotMatch(addHandlerMatch![0], /\bmd:|\bsm:/);
  });
});
