// Sprint E.1 hotfix (2026-09-08), frissítve az Egyetlen Megosztott Térkép
// UX módosításnál (2026-09-09), ÉS a Mobil navigációs UX / Explicit
// Navigation Mode sprintnél (2026-09-10) — pihenőpont-jelölt térkép
// fitBounds/zoom regresszió-tesztjei.
//
// STAGING BUG, amit ez a teszt eredetileg lefedett: a pihenőpont-jelölt
// nézet (korábban legs=[] jellel jelezve, egy KÜLÖN térkép-instance-on) a
// hardcode-olt alapértelmezett Budapest/zoom:12 nézeten ragadt. Az
// Egyetlen Megosztott Térkép módosítás (2026-09-09) óta MÁR NEM legs=[]
// jelzi a pihenőpont-fókuszt (hiszen egyetlen közös térkép egyszerre kapja
// a valós route legs-et ÉS a pihenőpont-jelölteket) — helyette egy
// explicit `restPointFocusMode` prop dönti el, melyik fitBounds-viselkedés
// legyen aktív.
//
// FRISSÍTÉS (2026-09-10, Explicit Navigation Mode): a Navigation Mode
// bevezetett egy ÚJ, harmadik kamera-tulajdonost — a followMode-alapú
// folyamatos GPS-follow easeTo()-t (lásd VedettUtvonalMap.tsx follow-
// effektje). Amíg followMode=true, SEM a route-fitBounds, SEM a
// pihenőpont-fitBounds nem futhat, mert mindkettő versengne a follow-
// effekt easeTo() hívásával a kameráért. Ez a régi, kizárólag
// restPointFocusMode-ra épülő tesztek exact-regexeit elavulttá tette (a
// forráskód immár helyesen egy ÚJ, legitim `!followMode` feltétellel és
// deps-tétellel bővült mindkét fitBounds-effektben) — ez a fájl NEM a
// production kódot módosítja (az auditálva helyesnek bizonyult, lásd a
// Navigation Mode feladat végső jelentését), hanem a teszteket frissíti,
// hogy az INVARIÁNSOKAT ellenőrizzék (nem egyetlen pontos szöveges
// implementációt), és emiatt CRLF/LF-, whitespace/indentation- és
// dependency-sorrend-független módon.
//
// Ez a teszt forráskód-szinten (nem DOM/böngésző-környezetben,
// konzisztensen a repo többi VedettUtvonalMap tesztjével, lásd
// map-rendering-fix.test.ts) ellenőrzi, hogy:
//   1) létezik egy KÜLÖN, restPointFocusMode-ra korlátozott effekt, amely
//      a currentPosition + restPoints alapján fitBounds-ol,
//   2) a padding/maxZoom paraméterek a specifikációnak megfelelőek
//      (padding ~40-60px, maxZoom ~16-17),
//   3) a függőséglista NEM a restPoints/currentPosition referenciákra,
//      hanem stabil, levezetett primitívekre iratkozik fel (elkerülve az
//      irreleváns rerenderekre — pl. lista-hover — való újra-pásztázást),
//      followMode-dal kibővítve, mint ÚJ, legitim primitív dependency,
//   4) a MEGLÉVŐ route-geometria fitBounds effekt (padding:48, maxZoom:17)
//      VÁLTOZATLAN maradt restPointFocusMode=false ÉS followMode=false
//      esetén — nincs regresszió, csak egy ÚJ feltétellel bővült
//      (!restPointFocusMode ÉS !followMode),
//   5) followMode=true esetén SEM a route-, SEM a pihenőpont-fitBounds nem
//      futhat — a kamerát ilyenkor kizárólag a follow-effekt (easeTo)
//      birtokolja, a két régi effekt nem versenyezhet vele.
//
//   node --test --experimental-strip-types __tests__/vedett-route/rest-point-map-fitbounds.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalMap.tsx");
const src = readFileSync(SRC_PATH, "utf-8");

// Kis segédfüggvény — egy "}, [a, b, c]);" alakú React useEffect deps-
// klózból kinyeri a tagokat, sorrend- és whitespace-függetlenül, hogy a
// tesztek NE egy pontos szöveges implementációhoz, hanem a tényleges
// TARTALOMHOZ (mely primitívek szerepelnek) kössenek.
function parseDeps(depsClauseText: string): string[] {
  const openIdx = depsClauseText.indexOf("[");
  const closeIdx = depsClauseText.indexOf("]", openIdx);
  assert.ok(openIdx !== -1 && closeIdx !== -1, "nem található '[...]' deps tömb a megadott szövegben");
  return depsClauseText
    .slice(openIdx + 1, closeIdx)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// A route-geometria effekt (a fenti, "journeyLegsToGeoJson(legs)"-szel
// induló) TELJES blokkjának kinyerése a fitBounds-hívásától a deps-klóz
// végéig — stabil, szemantikus horgony-szövegekre (nem a teljes blokk egy
// darab, törékeny nagy regexére) épül.
const routeEffectStart = src.indexOf("const geojson = journeyLegsToGeoJson(legs);");
assert.ok(routeEffectStart !== -1, "nem található a route-geometria effekt kezdete (journeyLegsToGeoJson hívás)");
const routeFitBoundsCallIdx = src.indexOf("map.fitBounds(bounds, {", routeEffectStart);
assert.ok(routeFitBoundsCallIdx !== -1, "nem található a route-geometria fitBounds hívása");
const routeDepsClauseStart = src.indexOf("}, [", routeFitBoundsCallIdx);
assert.ok(routeDepsClauseStart !== -1, "nem található a route-effekt deps klóza a fitBounds hívás után");
const routeDepsClauseEnd = src.indexOf(");", routeDepsClauseStart) + 2;
const routeEffectBlock = src.slice(routeEffectStart, routeDepsClauseEnd);

// A pihenőpont-fitBounds effekt TELJES blokkjának kinyerése — a
// "if (!restPointFocusMode) return;" korai return-től (ez a sor
// KIZÁRÓLAG ebben az effektben szerepel, a route-effekt guard-ja egy
// összetett feltétel része, nem ez az önálló sor) a saját deps-klóz
// végéig.
const restPointGuardStart = src.indexOf("if (!restPointFocusMode) return;");
assert.ok(restPointGuardStart !== -1, "nem található a pihenőpont-fitBounds effekt 'if (!restPointFocusMode) return;' korai return-je");
const restPointFitBoundsCallIdx = src.indexOf("map.fitBounds(bounds, {", restPointGuardStart);
assert.ok(restPointFitBoundsCallIdx !== -1, "nem található a pihenőpont-fitBounds hívása");
const restPointDepsClauseStart = src.indexOf("}, [", restPointFitBoundsCallIdx);
assert.ok(restPointDepsClauseStart !== -1, "nem található a pihenőpont-effekt deps klóza a fitBounds hívás után");
const restPointDepsClauseEnd = src.indexOf(");", restPointDepsClauseStart) + 2;
const restPointEffectBlock = src.slice(restPointGuardStart, restPointDepsClauseEnd);

describe("VedettUtvonalMap.tsx — route-geometria fitBounds effekt (padding:48, maxZoom:17)", () => {
  test("van egy restPointFocusMode-ra korlátozott, KÜLÖN effekt (nem a route-geometria effekten belül)", () => {
    assert.match(
      src,
      /if \(!restPointFocusMode\) return;/,
      "kell egy explicit korai return, ami restPointFocusMode=false esetén nem futtatja a pihenőpont-fitBounds logikát"
    );
  });

  test("a route-geometria fitBounds HÍVÁSA explicit !restPointFocusMode ÉS !followMode feltétellel van őrizve — a két másik kamera-tulajdonos (pihenőpont-fókusz, Navigation Mode follow) idején nem futhat", () => {
    const guardMatch = routeEffectBlock.match(/if \(([^)]*)\)\s*\{\s*\n\s*map\.fitBounds\(bounds,/);
    assert.ok(guardMatch, "nem található a route fitBounds hívást közvetlenül megelőző if-feltétel");
    const condition = guardMatch![1];
    assert.match(condition, /hasCoords/, "a feltételnek tartalmaznia kell a hasCoords ellenőrzést");
    assert.match(condition, /!restPointFocusMode/, "a feltételnek ki kell zárnia a pihenőpont-fókusz módot");
    assert.match(condition, /!followMode/, "a feltételnek ki kell zárnia a Navigation Mode follow-módot (különben versengene a follow-effekt easeTo()-jával)");
  });

  test("REGRESSZIÓ: a route-geometria fitBounds hívás paraméterei (padding:48, maxZoom:17, duration:300) VÁLTOZATLANOK maradtak", () => {
    const paramsMatch = routeEffectBlock.match(/map\.fitBounds\(bounds,\s*\{\s*padding:\s*(\d+),\s*maxZoom:\s*(\d+),\s*duration:\s*(\d+)\s*\}\);/);
    assert.ok(paramsMatch, "nem található a route fitBounds hívás padding/maxZoom/duration paraméterekkel");
    assert.equal(Number(paramsMatch![1]), 48, "a route-nézet padding-jének 48-nak kell maradnia (nincs regresszió)");
    assert.equal(Number(paramsMatch![2]), 17, "a route-nézet maxZoom-jának 17-nek kell maradnia (nincs regresszió)");
    assert.equal(Number(paramsMatch![3]), 300, "a route-nézet duration-jének 300-nak kell maradnia (nincs regresszió)");
  });

  test("a route-effekt deps tömbje tartalmazza a szükséges primitíveket (legs, mapReady, restPointFocusMode, followMode) — sorrendtől függetlenül", () => {
    const deps = parseDeps(routeEffectBlock.slice(routeEffectBlock.lastIndexOf("}, [")));
    for (const required of ["legs", "mapReady", "restPointFocusMode", "followMode"]) {
      assert.ok(deps.includes(required), `a route-effekt deps tömbjének tartalmaznia kell '${required}'-t, jelenleg: [${deps.join(", ")}]`);
    }
  });

  test("a route-geometria RAJZOLÁSA (addSource/addLayer) followMode-tól FÜGGETLENÜL, feltétel nélkül lefut — csak a KAMERA (fitBounds) kapcsol ki followMode/restPointFocusMode alatt (spec 13. pont, 'route stays visible')", () => {
    const addSourceIdx = routeEffectBlock.indexOf("map.addSource(sourceId");
    const guardIdx = routeEffectBlock.search(/if \([^)]*hasCoords[^)]*\)\s*\{\s*\n\s*map\.fitBounds/);
    assert.ok(addSourceIdx !== -1, "az addSource hívásnak a route-effektben kell lennie");
    assert.ok(guardIdx !== -1, "a fitBounds-guard-nak a route-effektben kell lennie");
    assert.ok(addSourceIdx < guardIdx, "az útvonal-rétegek felépítésének a kamera-fitBounds guard ELŐTT, feltétel nélkül kell lefutnia");
  });
});

describe("VedettUtvonalMap.tsx — pihenőpont-jelölt nézet fitBounds/zoom (Sprint E.1 hotfix, Egyetlen Megosztott Térkép + Navigation Mode frissítés)", () => {
  test("a currentPosition ÉS a restPoints is bekerül a bounds-ba", () => {
    assert.match(restPointEffectBlock, /bounds\.extend\(\[currentLon as number, currentLat as number\]\)/);
    assert.match(restPointEffectBlock, /for \(const rp of restPoints\)[\s\S]{0,60}bounds\.extend\(\[rp\.longitude, rp\.latitude\]\);/);
  });

  test("a pihenőpont-fitBounds hívás padding/maxZoom a specifikációnak megfelelő (padding 40-60px, maxZoom 16-17)", () => {
    const match = restPointEffectBlock.match(/map\.fitBounds\(bounds,\s*\{\s*padding:\s*(\d+),\s*maxZoom:\s*(\d+),\s*duration:\s*(\d+)\s*\}\);/);
    assert.ok(match, "meg kell találni a pihenőpont-fitBounds hívást padding/maxZoom/duration paraméterekkel");
    const padding = Number(match![1]);
    const maxZoom = Number(match![2]);
    assert.ok(padding >= 40 && padding <= 60, `padding ${padding} nincs a spec szerinti 40-60px tartományban`);
    assert.ok(maxZoom >= 16 && maxZoom <= 17, `maxZoom ${maxZoom} nincs a spec szerinti 16-17 tartományban`);
  });

  test("0 találat ÉS nincs GPS-pozíció esetén a nézethez NEM nyúl (korai return, nincs városnézetre ugrás)", () => {
    assert.match(
      restPointEffectBlock,
      /if \(!hasCurrentPosition && restPoints\.length === 0\) \{[\s\S]{0,300}?return;\s*\}/,
      "0 találat + hiányzó GPS esetén a kódnak explicit korai return-nel kell kihagynia a fitBounds hívást"
    );
  });

  test("ÚJ (Navigation Mode): a pihenőpont-fitBounds effekt EXPLICIT korai return-nel kihagyja magát, amíg followMode=true — a follow-effekt easeTo()-ja ilyenkor a kamera egyetlen tulajdonosa", () => {
    // A guard-nak a restPointFocusMode-ellenőrzés UTÁN, de a hasCurrentPosition-számítás ELŐTT kell futnia.
    const restPointFocusGuardIdx = restPointEffectBlock.indexOf("if (!restPointFocusMode) return;");
    const followModeGuardIdx = restPointEffectBlock.indexOf("if (followMode) return;");
    const hasCurrentPositionIdx = restPointEffectBlock.indexOf("const hasCurrentPosition");
    assert.ok(followModeGuardIdx !== -1, "a pihenőpont-fitBounds effektnek explicit 'if (followMode) return;' korai return-nel kell rendelkeznie");
    assert.ok(
      restPointFocusGuardIdx < followModeGuardIdx && followModeGuardIdx < hasCurrentPositionIdx,
      "a followMode guard-nak a restPointFocusMode-guard UTÁN és a bounds-számítás ELŐTT kell futnia"
    );
  });

  test("STABIL, PRIMITÍV függőségek: a restPoints/currentPosition props NYERS referenciái NEM szerepelnek a deps tömbben — csak a levezetett primitívek (+ az ÚJ followMode)", () => {
    const deps = parseDeps(restPointEffectBlock.slice(restPointEffectBlock.lastIndexOf("}, [")));

    for (const required of ["restPointFocusMode", "mapReady", "restPointIdsKey", "currentLat", "currentLon", "followMode"]) {
      assert.ok(deps.includes(required), `a pihenőpont-fitBounds effekt deps tömbjének tartalmaznia kell '${required}'-t, jelenleg: [${deps.join(", ")}]`);
    }

    // A "restPoints" / "currentPosition" PONTOS (nem részleges) egyezés
    // tilos — restPointIdsKey/restPointFocusMode tartalmazza a "restPoint"
    // szótövet, de ezek NEM a nyers props-referenciák, ezért a tiltásnak
    // egzakt tag-egyezésen kell alapulnia, nem substring-keresésen.
    assert.ok(!deps.includes("restPoints"), `a deps tömb nem tartalmazhatja a nyers 'restPoints' referenciát, jelenleg: [${deps.join(", ")}]`);
    assert.ok(!deps.includes("currentPosition"), `a deps tömb nem tartalmazhatja a nyers 'currentPosition' referenciát, jelenleg: [${deps.join(", ")}]`);

    // A levezetett kulcsok maguk a komponens törzsében, primitív értékként jönnek létre.
    assert.match(
      src,
      /const restPointIdsKey = restPointFocusMode \? restPoints\.map\(\(rp\) => rp\.id\)\.join\(","\) : "";/,
      "restPointIdsKey-nek a restPoints id-jeiből levezetett, stabil string kulcsnak kell lennie"
    );
    assert.match(src, /const currentLat = currentPosition\?\.latitude;/);
    assert.match(src, /const currentLon = currentPosition\?\.longitude;/);
  });

  test("Egyetlen Megosztott Térkép: restPointFocusMode prop létezik, alapértéke false (visszafelé kompatibilis a régi route-fitBounds viselkedéssel)", () => {
    assert.match(src, /restPointFocusMode\?: boolean;/, "a VedettUtvonalMapProps-nak tartalmaznia kell egy opcionális restPointFocusMode mezőt");
    assert.match(
      src,
      /restPointFocusMode = false,/,
      "restPointFocusMode alapértéke false kell legyen, hogy a meglévő (nem pihenőpont-fókuszú) hívók változatlanul működjenek"
    );
  });

  test("ÚJ (Navigation Mode): followMode prop létezik, alapértéke false — a meglévő (Navigation Mode nélküli) hívási helyeken a viselkedés byte-pontosan a régi marad", () => {
    assert.match(src, /followMode\?: boolean;/, "a VedettUtvonalMapProps-nak tartalmaznia kell egy opcionális followMode mezőt");
    assert.match(src, /followMode = false,/, "followMode alapértéke false kell legyen, hogy a Navigation Mode nélküli hívók változatlanul működjenek");
  });

  test("marker/lista hover-szinkron (selectedRestPointId / onSelectRestPoint) a marker-effektben érintetlen maradt", () => {
    assert.match(
      src,
      /\}, \[restPoints, mapReady, selectedRestPointId, onSelectRestPoint\]\);/,
      "a rest-point marker effekt deps-ének (hover/klikk szinkronhoz szükséges selectedRestPointId/onSelectRestPoint) változatlannak kell maradnia"
    );
  });
});
