// VÉDETT ÚTVONAL — MOBIL NAVIGÁCIÓS UX sprint, "Csak a Navigation Mode /
// GPS / fullscreen térkép most" kör — regresszió-tesztek az 5-14. pontra
// (Explicit Navigation Mode, Fullscreen Mobile Map, Manual Fullscreen
// Button, Foreground GPS Tracking, WatchPosition Lifecycle, Map Follow
// Mode, User Pan/Zoom, Navigation Start UX, Route Stays Visible, Map
// Performance).
//
// Ugyanazt a forráskód-szintű, strukturális regresszió-teszt mintát követi,
// mint a projekt már meglévő tesztjei (lásd single-shared-map-and-current-
// location.test.ts fejléce) — nincs jsdom/@testing-library/react, ezért a
// TÉNYLEGES forráskódot olvassa be és a specifikáció szerinti strukturális
// garanciákat ellenőrzi.
//
//   node --test --experimental-strip-types __tests__/vedett-route/navigation-mode.test.ts
//
// MEGJEGYZÉS a betűzésről: ez a kör KIZÁRÓLAG a felhasználó explicit
// választása szerinti Navigation Mode/GPS/fullscreen alkört fedi le (a
// slider, Kelenföld/pihenőpont, Favorites CTA, walking, PWA-install
// alkörök egy KÉSŐBBI körre lettek halasztva, lásd a beszélgetés
// összefoglalóját) — a lenti teszt-blokkok ehhez a szűkített körhöz
// tartozó invariánsokat fedik le, betűzve, de a teljes 49-szekciós
// eredeti specifikáció betű-tartalom leképezése nélkül (azt csak az
// eredeti spec-szöveg birtokában lehetne szó szerint reprodukálni).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const MAP_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalMap.tsx");

const formSrc = readFileSync(FORM_PATH, "utf-8");
const mapSrc = readFileSync(MAP_PATH, "utf-8");

describe("I) Explicit Navigation Mode — SOHA nem automatikus", () => {
  test("navigationMode state létezik, alapértelmezett false", () => {
    assert.match(formSrc, /const \[navigationMode, setNavigationMode\] = useState\(false\);/);
  });

  test("a '▶ Navigáció indítása' gomb a KIZÁRÓLAGOS belépési pont a navigationMode-ba", () => {
    assert.match(formSrc, /▶ Navigáció indítása/);
    // A gomb onClick-je startNavigation — nincs más setNavigationMode(true) hívás sehol a fájlban.
    const setTrueMatches = formSrc.match(/setNavigationMode\(true\)/g) ?? [];
    assert.equal(setTrueMatches.length, 1, "setNavigationMode(true) KIZÁRÓLAG a startNavigation()-ban futhat, semmilyen automatikus/mount-effektben");
  });

  test("startNavigation() explicit user-akcióra hívja geo.startWatching()-et, nem valamilyen effektből/mountból", () => {
    assert.match(
      formSrc,
      /const startNavigation = \(\) => \{\s*\n\s*setNavigationMode\(true\);\s*\n\s*setFollowMode\(true\);\s*\n\s*setManualFullscreen\(false\);[\s\S]{0,120}?geo\.startWatching\(\);\s*\n\s*\};/
    );
  });
});

describe("J) Fullscreen Mobile Map — CSS-fixed fullscreen, nem Fullscreen API", () => {
  test("mapFullscreen = navigationMode || manualFullscreen", () => {
    assert.match(formSrc, /const mapFullscreen = navigationMode \|\| manualFullscreen;/);
  });

  test("fullscreen alatt position:fixed; inset:0 + 100dvh — NEM a natív Fullscreen API-t használja (iOS/PWA kompatibilitás)", () => {
    assert.match(formSrc, /mapFullscreen \? "fixed inset-0 z-50 bg-black" : "relative"/);
    assert.match(formSrc, /mapFullscreen \? \{ height: "100dvh" \} : undefined/);
    assert.ok(!/requestFullscreen\(/.test(formSrc), "nem szabad a natív Fullscreen API-t használni — CSS-fixed fullscreen a helyes, iOS/PWA-kompatibilis megoldás");
  });

  test("a <VedettUtvonalMap> KONTÉNERE (a fixed/relative div) mindig ugyanaz a DOM-elem — nincs feltételesen be/kirendert wrapper (no remount a fullscreen váltásnál)", () => {
    // A `{mapFullscreen ? ... : ...}` MINDIG egy div-et rendel (nem `{mapFullscreen && <div>...}`),
    // tehát a benne élő <VedettUtvonalMap> instance nem veszik el fullscreen be/kikapcsoláskor.
    assert.match(
      formSrc,
      /<div\s*\n\s*className=\{mapFullscreen \? "fixed inset-0 z-50 bg-black" : "relative"\}\s*\n\s*style=\{mapFullscreen \? \{ height: "100dvh" \} : undefined\}\s*\n\s*>/
    );
  });
});

describe("K) Manual Fullscreen Button — GPS-től független", () => {
  test("'⛶ Teljes képernyő' gomb létezik és KÜLÖN state-et (manualFullscreen) állít, nem navigationMode-ot", () => {
    assert.match(formSrc, /⛶ Teljes képernyő/);
    assert.match(formSrc, /onClick=\{\(\) => setManualFullscreen\(true\)\}/);
  });

  test("a manuális teljes képernyő gomb NEM hívja geo.startWatching()-et (nem indít GPS-követést)", () => {
    const buttonIdx = formSrc.indexOf("⛶ Teljes képernyő");
    assert.ok(buttonIdx !== -1);
    const buttonLineStart = formSrc.lastIndexOf("<button", buttonIdx);
    const buttonLineEnd = formSrc.indexOf("</button>", buttonIdx);
    const buttonJsx = formSrc.slice(buttonLineStart, buttonLineEnd);
    assert.ok(!/startWatching/.test(buttonJsx), "a manuális fullscreen gomb önmagában NEM indíthat GPS-követést");
  });

  test("VedettUtvonalMap.tsx: ResizeObserver kötelező map.resize()-t hív a konténer méretváltozására (fullscreen váltás CSS-mérete)", () => {
    assert.match(mapSrc, /new ResizeObserver\(\(\) => \{\s*\n\s*map\.resize\(\);\s*\n\s*\}\);/);
    assert.match(mapSrc, /resizeObserver\.observe\(containerRef\.current\);/);
    assert.match(mapSrc, /resizeObserver\?\.disconnect\(\);/, "cleanup-ban a ResizeObserver-t is le kell választani, ne szivárogjon");
  });
});

describe("L) Foreground GPS Tracking — csak explicit indítású watchPosition", () => {
  test("a useGeolocation() hook-ot használja (nincs párhuzamos, saját watchPosition implementáció a Navigation Mode-hoz)", () => {
    assert.match(formSrc, /const geo = useGeolocation\(\);/);
    assert.ok(!/navigator\.geolocation\.watchPosition/.test(formSrc), "a form/kártya sosem hívhat közvetlenül navigator.geolocation-t — mindig a useGeolocation() hook API-ján keresztül");
  });

  test("useGeolocation.ts: a watchPosition explicit enableHighAccuracy/timeout/maximumAge paramokkal indul, csak startWatching()-ből (nem automatikusan)", () => {
    const hookPath = join(import.meta.dirname, "..", "..", "lib", "hooks", "useGeolocation.ts");
    const hookSrc = readFileSync(hookPath, "utf-8");
    assert.match(hookSrc, /const startWatching = useCallback\(\(\) => \{/);
    assert.match(hookSrc, /watchIdRef\.current = navigator\.geolocation\.watchPosition\(handleSuccess, handleError, \{/);
  });
});

describe("M) WatchPosition Lifecycle — mandatory clearWatch minden leállási úton", () => {
  test("stopNavigation() mindig meghívja geo.stopWatching()-et és nullázza a navigationMode/followMode state-eket", () => {
    assert.match(
      formSrc,
      /const stopNavigation = \(\) => \{\s*\n\s*setNavigationMode\(false\);\s*\n\s*setFollowMode\(false\);\s*\n\s*geo\.stopWatching\(\);\s*\n\s*\};/
    );
  });

  test("a kártya BEZÁRÁSA (isOpen -> false) navigáció közben explicit leállítja a GPS-követést — a useEffect erre külön ügyel", () => {
    assert.match(
      formSrc,
      /useEffect\(\(\) => \{\s*\n\s*if \(!isOpen && navigationMode\) \{\s*\n\s*setNavigationMode\(false\);\s*\n\s*setFollowMode\(false\);\s*\n\s*geo\.stopWatching\(\);\s*\n\s*\}\s*\n[\s\S]{0,80}?\}, \[isOpen\]\);/
    );
  });

  test("useGeolocation.ts: unmountkor is garantált a clearWatch (a hook saját cleanup-effektje) — ez a Navigation Mode-tól függetlenül is fennáll, nem regresszált", () => {
    const hookPath = join(import.meta.dirname, "..", "..", "lib", "hooks", "useGeolocation.ts");
    const hookSrc = readFileSync(hookPath, "utf-8");
    assert.match(hookSrc, /useEffect\(\(\) => \{\s*\n\s*return \(\) => \{\s*\n\s*if \(watchIdRef\.current !== null && isGeolocationSupported\(\)\) \{\s*\n\s*navigator\.geolocation\.clearWatch\(watchIdRef\.current\);/);
  });
});

describe("N) Map Follow Mode — folyamatos easeTo követés navigációs zoomra", () => {
  test("VedettUtvonalMap.tsx: followMode/navigationZoom/onUserGestureCancelFollow propok léteznek, alapértelmezett followMode=false (backward-compat)", () => {
    assert.match(mapSrc, /followMode\?: boolean;/);
    assert.match(mapSrc, /navigationZoom\?: number;/);
    assert.match(mapSrc, /onUserGestureCancelFollow\?: \(\) => void;/);
    assert.match(mapSrc, /followMode = false, navigationZoom = 16, onUserGestureCancelFollow/);
  });

  test("a follow-effekt easeTo-t használ (sima animáció), NEM jumpTo/flyTo-t, és a navigationZoom propot adja át zoom-nak", () => {
    assert.match(
      mapSrc,
      /if \(!followMode\) return;\s*\n\s*if \(typeof currentLat !== "number" \|\| typeof currentLon !== "number"\) return;\s*\n\s*map\.easeTo\(\{ center: \[currentLon, currentLat\], zoom: navigationZoom, duration: 400 \}\);/
    );
  });

  test("a route-fitBounds ÉS a pihenőpont-fókusz fitBounds effektek is followMode alatt kikapcsolnak, nehogy versengjenek a kamerával a follow-effekttel", () => {
    assert.match(mapSrc, /if \(hasCoords && !restPointFocusMode && !followMode\) \{/);
    assert.match(mapSrc, /if \(followMode\) return;\s*\n\s*\n\s*const hasCurrentPosition/);
  });
});

describe("O) User Pan/Zoom — csak VALÓDI felhasználói gesztus szakítja meg a follow-módot", () => {
  test("a dragstart/zoomstart/rotatestart/pitchstart eseményeken originalEvent-et vizsgál — programozott easeTo/fitBounds sosem szakítja meg a follow-ot", () => {
    assert.match(
      mapSrc,
      /const handlePossibleUserGesture = \(e: \{ originalEvent\?: unknown \}\) => \{\s*\n\s*if \(e\.originalEvent\) \{\s*\n\s*onUserGestureCancelFollowRef\.current\?\.\(\);\s*\n\s*\}\s*\n\s*\};/
    );
    assert.match(mapSrc, /map\.on\("dragstart", handlePossibleUserGesture\);/);
    assert.match(mapSrc, /map\.on\("zoomstart", handlePossibleUserGesture\);/);
    assert.match(mapSrc, /map\.on\("rotatestart", handlePossibleUserGesture\);/);
    assert.match(mapSrc, /map\.on\("pitchstart", handlePossibleUserGesture\);/);
  });

  test("a callback egy reffel a legfrissebb closure-t hívja (nincs elavult onUserGestureCancelFollow a listener regisztrálásakor rögzítve)", () => {
    assert.match(mapSrc, /const onUserGestureCancelFollowRef = useRef\(onUserGestureCancelFollow\);/);
    assert.match(mapSrc, /onUserGestureCancelFollowRef\.current = onUserGestureCancelFollow;/);
  });

  test("VedettUtvonalSearchForm.tsx: a gesztus-megszakítás setFollowMode(false)-ra fut, és 'Kövesd a helyzetem' gomb jelenik meg followMode=false alatt navigáció közben", () => {
    assert.match(formSrc, /onUserGestureCancelFollow=\{\(\) => setFollowMode\(false\)\}/);
    assert.match(formSrc, /\{navigationMode && !followMode && \(/);
    assert.match(formSrc, /📍 Kövesd a helyzetem/);
  });
});

describe("P) Navigation Start UX — 'Helyzet meghatározása…' és kulturált engedély-elutasítás", () => {
  test("navigáció közben, amíg geo.status === 'requesting', 'Helyzet meghatározása…' jelenik meg", () => {
    assert.match(formSrc, /navigationMode && geo\.status === "requesting" && \(\s*\n\s*<span[^>]*>Helyzet meghatározása…<\/span>/);
  });

  test("navigáció közben engedély-elutasításra kulturált magyar szöveg jelenik meg, nem nyers technikai hiba", () => {
    assert.match(formSrc, /navigationMode && geo\.status === "denied" && \(/);
    assert.match(formSrc, /A navigációhoz engedélyezd a helymeghatározást a böngésződben\./);
  });

  test("'✕ Navigáció befejezése' gomb mindig elérhető navigáció közben (a felhasználó bármikor kiléphet)", () => {
    assert.match(formSrc, /\{navigationMode \? \(\s*\n\s*<button type="button" onClick=\{stopNavigation\} className="btn-secondary bg-white text-xs shadow">\s*\n\s*✕ Navigáció befejezése/);
  });
});

describe("Q) Route Stays Visible / Map Performance — nincs remount, nincs GPS-tick-re induló adatlekérés", () => {
  test("PONTOSAN EGY <VedettUtvonalMap> JSX hívás marad (a Navigation Mode nem hoz létre második instance-ot)", () => {
    const matches = formSrc.match(/<VedettUtvonalMap\s/g) ?? [];
    assert.equal(matches.length, 1, "a Navigation Mode a MEGLÉVŐ egyetlen <VedettUtvonalMap> instance-ot bővíti props-okkal, nem hoz létre másikat");
  });

  test("a <VedettUtvonalMap> hívás megkapja a legs/restPoints propokat VÁLTOZATLAN forrásból (displayedJourney/restStopMapState) navigációs módban is — a route nem tűnik el", () => {
    const mapCallMatch = formSrc.match(/<VedettUtvonalMap\s/);
    const mapCallStart = mapCallMatch!.index!;
    const mapCallEnd = formSrc.indexOf("/>", mapCallStart);
    const mapCallProps = formSrc.slice(mapCallStart, mapCallEnd);
    assert.match(mapCallProps, /legs=\{restStopMapState\.active && restStopMapState\.legsOverride \? restStopMapState\.legsOverride : displayedJourney\.legs\}/);
    assert.match(mapCallProps, /followMode=\{followMode\}/);
    assert.match(mapCallProps, /navigationZoom=\{16\}/);
  });

  test("VedettUtvonalMap.tsx: a route-geometria rajzolása (addSource/addLayer) followMode-tól FÜGGETLENÜL mindig lefut — csak a KAMERA (fitBounds) kapcsol ki followMode alatt", () => {
    const followGuardIdx = mapSrc.indexOf("if (hasCoords && !restPointFocusMode && !followMode)");
    const addSourceIdx = mapSrc.indexOf("map.addSource(sourceId");
    assert.ok(addSourceIdx !== -1 && followGuardIdx !== -1 && addSourceIdx < followGuardIdx, "az addSource/addLayer hívásoknak a followMode-fitBounds guard ELŐTT kell futniuk, feltétel nélkül");
  });

  test("GPS-tick (currentPosition/geo state változás) sehol nem indít favorite-reload/route-search/rest-point-discovery hívást a kártyában — a geo csak a marker/kamera propokba folyik", () => {
    assert.ok(!/geo\.(latitude|longitude|status)[\s\S]{0,80}?fetch\(/.test(formSrc), "a geo state változása sosem indíthat közvetlen fetch()-et a kártyában");
    assert.ok(!/useEffect\(\(\) => \{[\s\S]{0,200}?fetch\([\s\S]{0,200}?\}, \[.*geo\.(latitude|longitude)/.test(formSrc), "nem szabad olyan effektnek lennie, ami geo.latitude/longitude változására hálózati hívást indít");
  });
});

describe("R) mutual exclusivity — a régi 'Aktuális hely megjelenítése' vezérlők és az új navigációs gombok nem keverednek össze", () => {
  test("a régi GPS-toggle és a manuális fullscreen/navigáció gombok csak !navigationMode alatt látszanak (nincs redundáns/ütköző UI navigáció közben)", () => {
    assert.match(
      formSrc,
      /<div className="flex flex-wrap items-center gap-2">\s*\n\s*\{!navigationMode && \(\s*\n\s*<>\s*\n\s*<button type="button" onClick=\{geo\.startWatching\}/
    );
  });

  test("a denied/unavailable/timeout GPS-hibaszövegek a régi (nem navigációs) UI-ban is csak !navigationMode alatt jelennek meg (a fullscreen overlay saját, navigációra szabott hibaszövegeket ad)", () => {
    assert.match(formSrc, /\{!navigationMode && geo\.status === "denied" && <span/);
    assert.match(formSrc, /\{!navigationMode && \(geo\.status === "unavailable" \|\| geo\.status === "timeout"\) && \(/);
  });
});

describe("S) GPS privacy — a Navigation Mode sem tör a meglévő szabályokon", () => {
  test("a Navigation Mode kódja sehol nem hív vedettRouteLog()-ot vagy console.log()-ot GPS-koordinátával", () => {
    assert.ok(!/vedettRouteLog\(/.test(formSrc));
    const consoleLogMatches = formSrc.match(/console\.log\(/g) ?? [];
    assert.equal(consoleLogMatches.length, 0, "a form sehol nem logolhat console.log()-gal (GPS-koordináta soha nem kerülhet konzolra)");
  });

  test("a Navigation Mode nem ír Supabase-be/adatbázisba semmilyen GPS-adatot (a form továbbra sem ér el közvetlenül Supabase-hez)", () => {
    assert.ok(!/supabase/i.test(formSrc));
  });

  test("navigationMode/followMode/manualFullscreen KIZÁRÓLAG useState — nincs localStorage/sessionStorage írás a Navigation Mode kódjában", () => {
    assert.ok(!/localStorage\.setItem/.test(formSrc));
    assert.ok(!/sessionStorage\.setItem/.test(formSrc));
  });
});
