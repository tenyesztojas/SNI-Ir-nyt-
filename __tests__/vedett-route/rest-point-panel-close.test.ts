// VÉDETT ÚTVONAL — PIHENŐPONT PANEL BEZÁRÁSA (2026-09-11)
//
// A production fizikai teszt (Kelenföld) kimutatta, hogy a fullscreen
// navigációban megnyitott pihenőpont bottom sheetnek (RestPointQuickAdd +
// RestStopFlowPanel, lásd VedettUtvonalSearchForm.tsx RankedJourneyCard)
// KORÁBBAN nem volt semmilyen bezárási lehetősége — a sheet mindig látható
// volt, és a felhasználó nem tudott visszatérni a teljes képernyős
// navigációhoz. A javítás egy TISZTÁN UI-szintű `restPanelVisible`
// state-et vezet be a RankedJourneyCard komponensben — SZÁNDÉKOSAN NEM a
// rest-stop-flow state machine-ben (lib/vedett-route/restStopFlow/
// stateMachine.ts marad teljesen érintetlen, lásd rest-stop-flow-state-
// machine.test.ts) — ami a sheet CSS-láthatóságát ("hidden" osztály)
// kapcsolja, a benne élő komponenseket SOHA nem unmountolja.
//
// Nincs jsdom/@testing-library/react ebben a projektben — a projekt már
// meglévő mintáját követve (lásd fullscreen-rest-point-integration.test.ts
// fejléce) forráskód-szintű, strukturális regresszió-tesztekkel fedjük le
// a viselkedést: a KAPCSOLÓDÓ KÓD (state-változó neve, handler-tartalom,
// JSX-szerkezet) tényleges meglétét és helyes elszigeteltségét ellenőrizzük.
//
// UX-FRISSÍTÉS (2026-09-11, második kör): a `restPanelVisible` alapértéke
// — és a startNavigation() reset-je — true-ról false-ra változott. Minden
// friss navigáció-indítás ZÁRT pihenőpont-panellel indul: a teljes
// képernyős térkép az elsődleges nézet, a kompakt "Pihenőpont hozzáadása"
// gomb rögtön elérhető, és csak explicit kattintásra nyílik meg a panel.
// A zárás/nyitás/GPS/journey-érintetlenség szabályai (lásd lentebb)
// változatlanok — ez KIZÁRÓLAG a kezdő láthatósági érték módosítása.
//
//   node --test __tests__/vedett-route/rest-point-panel-close.test.ts

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

const STATE_MACHINE_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "restStopFlow", "stateMachine.ts");
const stateMachineSrc = readFileSync(STATE_MACHINE_PATH, "utf-8");

const cardStart = formSrc.indexOf("function RankedJourneyCard({");
const cardEnd = formSrc.indexOf("const ORIGIN_GEOLOCATION_ERROR_COPY", cardStart);
const cardSrc = formSrc.slice(cardStart, cardEnd);

describe("1) Alap felfedezhetőség — restPanelVisible state + Bezárás gomb létezik, aria-label és 44x44 touch target", () => {
  test("restPanelVisible UI-state deklarálva, alapértéke false (friss navigáció ZÁRT pihenőpont-panellel indul, UX-frissítés 2026-09-11)", () => {
    assert.match(cardSrc, /const \[restPanelVisible, setRestPanelVisible\] = useState\(false\);/);
  });

  test("a Bezárás gomb aria-label='Pihenőpontok bezárása', legalább 44x44 px, és a restPanelVisible-t false-ra állítja", () => {
    const closeButtonMatch = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/);
    assert.ok(closeButtonMatch, "meg kell találni a Bezárás gombot");
    assert.match(closeButtonMatch![0], /aria-label="Pihenőpontok bezárása"/);
    assert.match(closeButtonMatch![0], /min-h-\[44px\]/);
    assert.match(closeButtonMatch![0], /min-w-\[44px\]/);
  });

  test("a panel fejléce sticky, hogy hosszú lista görgetése után is elérhető maradjon", () => {
    const headerMatch = cardSrc.match(/<div className="sticky top-0[\s\S]{0,700}?<\/div>/);
    assert.ok(headerMatch, "meg kell találni a sticky fejléc <div>-et");
    assert.match(headerMatch![0], /setRestPanelVisible\(false\)/);
  });

  test("startNavigation() UTÁN a panel ZÁRT — a startNavigation() törzse explicit setRestPanelVisible(false)-t hív, nem true-t", () => {
    const startNavMatch = cardSrc.match(/const startNavigation = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(startNavMatch, "meg kell találni a startNavigation() függvényt");
    assert.match(startNavMatch![0], /setRestPanelVisible\(false\)/);
    assert.doesNotMatch(startNavMatch![0], /setRestPanelVisible\(true\)/);
  });

  test("fullscreenben a kompakt 'Pihenőpont hozzáadása' gomb elérhető, amíg a panel zárva van — a friss navigáció (restPanelVisible alapértéke false) UTÁN rögtön látható, mivel a gomb feltétele KIZÁRÓLAG mapFullscreen && !restPanelVisible", () => {
    assert.match(cardSrc, /\{mapFullscreen && !restPanelVisible && \(/);
    const reopenButtonMatch = cardSrc.match(/\{mapFullscreen && !restPanelVisible && \([\s\S]{0,500}?<\/button>\s*\)\}/);
    assert.ok(reopenButtonMatch, "meg kell találni a kompakt 'Pihenőpont hozzáadása' gombot");
    assert.match(reopenButtonMatch![0], />\s*Pihenőpont hozzáadása\s*</);
  });
});

describe("2) A Bezárás gomb handlere KIZÁRÓLAG restPanelVisible-t állít — semmi mást nem hív", () => {
  test("a Bezárás gomb onClick-je egyetlen, inline arrow function, ami KIZÁRÓLAG setRestPanelVisible(false)-t hívja", () => {
    // Az onClick={() => setRestPanelVisible(false)} egy egysoros, KIZÁRÓLAG
    // ezt az egy hívást tartalmazó arrow function — ha bármi mást is
        // hívna (dispatch, setNavigationMode, geo.stopWatching, stb.), az
    // onClick body-nak több utasítást kellene tartalmaznia zárójelek
    // között, ami itt strukturálisan kizárt (nincs `{ ... }` blokk-test,
    // csak egyetlen kifejezés).
    assert.match(cardSrc, /onClick=\{\(\) => setRestPanelVisible\(false\)\}/);
  });

  test("a Bezárás gomb NEM hívja a stateMachine.ts semelyik eseményét (nincs dispatch/CANCEL_REST_STOP/RESET_TO_ROUTE_ACTIVE a Bezárás gomb környékén)", () => {
    const closeButtonBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.ok(closeButtonBlock.length > 0);
    assert.doesNotMatch(closeButtonBlock, /dispatch\(/);
    assert.doesNotMatch(closeButtonBlock, /CANCEL_REST_STOP/);
    assert.doesNotMatch(closeButtonBlock, /RESET_TO_ROUTE_ACTIVE/);
  });

  test("2. teszt: Bezárás után GPS watch NEM áll le — a Bezárás gomb környékén nincs geo.stopWatching()/clearWatch hívás", () => {
    const closeButtonBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.doesNotMatch(closeButtonBlock, /geo\.stopWatching/);
  });

  test("3. teszt: Bezárás után route/journey megmarad — a Bezárás gomb környékén nincs setDisplayedJourney/setRestStopMapState hívás", () => {
    const closeButtonBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.doesNotMatch(closeButtonBlock, /setDisplayedJourney/);
    assert.doesNotMatch(closeButtonBlock, /setRestStopMapState/);
  });

  test("4. teszt: Bezárás után followMode NEM resetelődik — a Bezárás gomb környékén nincs setFollowMode/setNavigationMode hívás", () => {
    const closeButtonBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.doesNotMatch(closeButtonBlock, /setFollowMode/);
    assert.doesNotMatch(closeButtonBlock, /setNavigationMode/);
  });

  test("a Bezárás gomb környékén nincs új keresést indító hívás (fetch/nearby)", () => {
    const closeButtonBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.doesNotMatch(closeButtonBlock, /fetch\(/);
    assert.doesNotMatch(closeButtonBlock, /rest-stops\/nearby/);
  });
});

describe("3) A bottom sheet TARTALMA (RestPointQuickAdd + RestStopFlowPanel) SOSEM unmountol a Bezárás/Megnyitás váltásakor — csak CSS-lel (hidden) tűnik el", () => {
  test("fullscreen alatt a wrapper <div> className-e restPanelVisible === false esetén 'hidden'-re vált (display:none), nem feltételes JSX-unmount", () => {
    assert.match(cardSrc, /mapFullscreen\r?\n\s*\? restPanelVisible\r?\n\s*\? "fixed[^"]*"\r?\n\s*: "hidden"\r?\n\s*: "space-y-3"/);
  });

  test("a <RestPointQuickAdd> és <RestStopFlowPanel> JSX-elemek a wrapper <div>-en BELÜL, feltétel nélkül (nem `{restPanelVisible && (...)}` blokkban) szerepelnek — a CSS 'hidden' osztály takarja el őket, nem egy feltételes render", () => {
    const quickAddMatch = /<RestPointQuickAdd(?=\s)/.exec(cardSrc);
    const flowPanelMatch = /<RestStopFlowPanel(?=\s)/.exec(cardSrc);
    assert.ok(quickAddMatch && flowPanelMatch);
    // Semelyik `{restPanelVisible &&` feltételes JSX-wrapper nem
    // veheti körbe a két komponenst — ha így lenne, a state machine és a
    // belső useState-ek elveszhetnének egy Bezárás/Megnyitás váltás során.
    assert.doesNotMatch(cardSrc, /\{restPanelVisible && \(/);
  });
});

describe("5) Visszanyitás — a MEGLÉVŐ 'Pihenőpont hozzáadása' funkcióval bármikor újranyitható, új nearby request nélkül", () => {
  test("bezárt állapotban (mapFullscreen && !restPanelVisible) egy 'Pihenőpont hozzáadása' feliratú, min. 44px gomb jelenik meg, ami restPanelVisible-t true-ra állítja", () => {
    const reopenButtonMatch = cardSrc.match(/\{mapFullscreen && !restPanelVisible && \([\s\S]{0,500}?<\/button>\s*\)\}/);
    assert.ok(reopenButtonMatch, "meg kell találni a visszanyitó gombot");
    assert.match(reopenButtonMatch![0], /onClick=\{\(\) => setRestPanelVisible\(true\)\}/);
    assert.match(reopenButtonMatch![0], /aria-label="Pihenőpont hozzáadása"/);
    assert.match(reopenButtonMatch![0], /min-h-\[44px\]/);
    assert.match(reopenButtonMatch![0], />\s*Pihenőpont hozzáadása\s*</);
  });

  test("a visszanyitó gomb handlere KIZÁRÓLAG setRestPanelVisible(true)-t hívja — nem indít dispatch-et/REQUEST_REST-et/fetch-et", () => {
    assert.match(cardSrc, /onClick=\{\(\) => setRestPanelVisible\(true\)\}/);
    const reopenBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(true\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.doesNotMatch(reopenBlock, /dispatch\(/);
    assert.doesNotMatch(reopenBlock, /REQUEST_REST/);
    assert.doesNotMatch(reopenBlock, /fetch\(/);
  });

  test("a meglévő explicit REST_REQUESTED szabály (a keresés KIZÁRÓLAG a 'Pihenőre van szükségem' gomb onClick-jéből indul) érintetlen marad", () => {
    const dispatchSites = restStopFlowPanelSrc.match(/dispatch\(\{ type: "REQUEST_REST" \}\)/g) ?? [];
    assert.equal(dispatchSites.length, 1, "a REQUEST_REST-nek pontosan egy hívási helye lehet — a gomb onClick-je, a panel bezárása/megnyitása ezt nem érinti");
  });
});

describe("6) Keresés közben Bezárás — async válasz SOSEM nyitja vissza automatikusan a panelt", () => {
  test("setRestPanelVisible(...) KIZÁRÓLAG a deklarációban, startNavigation()-ben, a Bezárás gombban és a visszanyitó gombban hívódik — sehol egy async effekt/callback belsejében", () => {
    const allCalls = cardSrc.match(/setRestPanelVisible\((?:true|false)\)/g) ?? [];
    // 1) useState kezdőérték melletti (nem hívás, csak deklaráció — nem
    //    számít bele ebbe a regexbe), 2) startNavigation() reset, 3) Bezárás
    //    gomb (false), 4) visszanyitó gomb (true) — összesen 3 TÉNYLEGES
    //    hívás (a deklaráció maga `useState(true)`, nem `setRestPanelVisible(...)`
    //    hívás, ezért nem szerepel ebben a listában).
    assert.equal(allCalls.length, 3, `pontosan 3 setRestPanelVisible(...) hívásnak kell lennie a forrásban (talált: ${allCalls.length})`);
  });

  test("a RestStopFlowPanel.tsx és RestPointQuickAdd.tsx SEHOL nem hivatkozik restPanelVisible-re — az async /nearby, /route-to-rest-point, /resume hívások eredménye nem érheti el és nem módosíthatja ezt a UI-state-et", () => {
    assert.doesNotMatch(restStopFlowPanelSrc, /restPanelVisible/);
    assert.doesNotMatch(restPointQuickAddSrc, /restPanelVisible/);
  });

  test("a RankedJourneyCard-ban setRestPanelVisible egyetlen useEffect-en/async függvényen BELÜL sem hívódik (nincs .then/await utáni setRestPanelVisible)", () => {
    // Az összes setRestPanelVisible hívás közvetlenül onClick handlerben
    // vagy a szinkron startNavigation() függvénytörzsben él — sehol egy
    // `useEffect(` vagy `async` blokk belsejében, amit egy async
    // /nearby-/route-to-rest-point-/resume-válasz futtathatna.
    const effectBlocks = cardSrc.match(/useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) ?? [];
    for (const block of effectBlocks) {
      assert.doesNotMatch(block, /setRestPanelVisible/, "setRestPanelVisible nem hívódhat useEffect belsejéből");
    }
  });
});

describe("7) Bezárás nem indít új MOTIS/rest-stops keresést", () => {
  test("a teljes RankedJourneyCard forrásban a 'rest-stops/nearby' fetch-hívás KIZÁRÓLAG a RestStopFlowPanel.tsx-ben él (a bezárás/megnyitás logika a RankedJourneyCard-ban nem ismer ilyen végpontot)", () => {
    assert.doesNotMatch(cardSrc, /rest-stops\/nearby/);
    assert.match(restStopFlowPanelSrc, /\/api\/vedett-route\/rest-stops\/nearby/);
  });
});

describe("8) 'NAVIGÁCIÓ BEFEJEZÉSE' továbbra is külön, teljes funkció — nem keveredik a panel bezárásával", () => {
  test("stopNavigation() továbbra is setNavigationMode(false) + setFollowMode(false) + geo.stopWatching()-et hív, és ez A '✕ Navigáció befejezése' gomb onClick-je, NEM a pihenőpont-panel Bezárás gombja", () => {
    assert.match(
      cardSrc,
      /const stopNavigation = \(\) => \{\s*\n\s*setNavigationMode\(false\);\s*\n\s*setFollowMode\(false\);\s*\n\s*geo\.stopWatching\(\);\s*\n\s*\};/
    );
    assert.match(cardSrc, /onClick=\{stopNavigation\}[\s\S]{0,80}✕ Navigáció befejezése/);
  });

  test("a stopNavigation() és a pihenőpont-panel Bezárás gombja (setRestPanelVisible(false)) EGYMÁSTÓL FÜGGETLEN — a stopNavigation() törzse nem hivatkozik restPanelVisible-re, a Bezárás gomb pedig nem hívja a stopNavigation()-t", () => {
    const stopNavMatch = cardSrc.match(/const stopNavigation = \(\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(stopNavMatch);
    assert.doesNotMatch(stopNavMatch![0], /restPanelVisible/);
    const closeButtonBlock = cardSrc.match(/<button[\s\S]{0,300}?setRestPanelVisible\(false\)[\s\S]{0,300}?<\/button>/)?.[0] ?? "";
    assert.doesNotMatch(closeButtonBlock, /stopNavigation/);
  });

  test("a rest-stop-flow state machine (stateMachine.ts) forrása változatlanul SEM 'REST_PANEL_CLOSED', SEM restPanelVisible fogalmat nem ismer — a panel bezárása tudatosan NEM lett a state machine része (minimális módosítás elve)", () => {
    assert.doesNotMatch(stateMachineSrc, /REST_PANEL_CLOSED/);
    assert.doesNotMatch(stateMachineSrc, /restPanelVisible/);
  });
});
