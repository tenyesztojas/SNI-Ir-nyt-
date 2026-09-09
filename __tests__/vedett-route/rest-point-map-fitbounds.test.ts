// Sprint E.1 hotfix (2026-09-08), frissítve az Egyetlen Megosztott Térkép
// UX módosításnál (2026-09-09) — pihenőpont-jelölt térkép fitBounds/zoom
// regresszió-tesztjei.
//
// STAGING BUG, amit ez a teszt eredetileg lefedett: a pihenőpont-jelölt
// nézet (korábban legs=[] jellel jelezve, egy KÜLÖN térkép-instance-on) a
// hardcode-olt alapértelmezett Budapest/zoom:12 nézeten ragadt. Az
// Egyetlen Megosztott Térkép módosítás (2026-09-09) óta MÁR NEM legs=[]
// jelzi a pihenőpont-fókuszt (hiszen egyetlen közös térkép egyszerre kapja
// a valós route legs-et ÉS a pihenőpont-jelölteket) — helyette egy
// explicit `restPointFocusMode` prop dönti el, melyik fitBounds-viselkedés
// legyen aktív. Ez a teszt forráskód-szinten (nem DOM/böngésző-
// környezetben, konzisztensen a repo többi VedettUtvonalMap tesztjével,
// lásd map-rendering-fix.test.ts) ellenőrzi, hogy:
//   1) létezik egy KÜLÖN, restPointFocusMode-ra korlátozott effekt, amely
//      a currentPosition + restPoints alapján fitBounds-ol,
//   2) a padding/maxZoom paraméterek a specifikációnak megfelelőek
//      (padding ~40-60px, maxZoom ~16-17),
//   3) a függőséglista NEM a restPoints/currentPosition referenciákra,
//      hanem stabil, levezetett primitívekre iratkozik fel (elkerülve az
//      irreleváns rerenderekre — pl. lista-hover — való újra-pásztázást),
//   4) a MEGLÉVŐ route-geometria fitBounds effekt (padding:48, maxZoom:17)
//      VÁLTOZATLAN maradt restPointFocusMode=false esetén — nincs
//      regresszió, csak egy ÚJ feltétellel bővült (!restPointFocusMode).
//
//   node --test --experimental-strip-types __tests__/vedett-route/rest-point-map-fitbounds.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalMap.tsx");
const src = readFileSync(SRC_PATH, "utf-8");

describe("VedettUtvonalMap.tsx — pihenőpont-jelölt nézet fitBounds/zoom (Sprint E.1 hotfix, Egyetlen Megosztott Térkép frissítés)", () => {
  test("van egy restPointFocusMode-ra korlátozott, KÜLÖN effekt (nem a route-geometria effekten belül)", () => {
    assert.match(
      src,
      /if \(!restPointFocusMode\) return;/,
      "kell egy explicit korai return, ami restPointFocusMode=false esetén nem futtatja a pihenőpont-fitBounds logikát"
    );
  });

  test("a route-geometria fitBounds effekt restPointFocusMode=true esetén NEM hívja a fitBounds-ot (a két effekt nem versenghet a nézetért)", () => {
    assert.match(
      src,
      /if \(hasCoords && !restPointFocusMode\) \{\s*\n\s*map\.fitBounds\(bounds, \{ padding: 48, maxZoom: 17, duration: 300 \}\);\s*\n\s*\}\s*\n\s*\}, \[legs, mapReady, restPointFocusMode\]\);/,
      "a route-geometria fitBounds hívásnak explicit !restPointFocusMode feltétellel kell rendelkeznie, és restPointFocusMode-nak a deps között kell szerepelnie"
    );
  });

  test("a currentPosition ÉS a restPoints is bekerül a bounds-ba", () => {
    assert.match(src, /bounds\.extend\(\[currentLon as number, currentLat as number\]\)/);
    assert.match(src, /for \(const rp of restPoints\) \{\s*bounds\.extend\(\[rp\.longitude, rp\.latitude\]\);/);
  });

  test("a pihenőpont-fitBounds hívás padding/maxZoom a specifikációnak megfelelő (padding 40-60px, maxZoom 16-17)", () => {
    const match = src.match(/map\.fitBounds\(bounds, \{ padding: (\d+), maxZoom: (\d+), duration: (\d+) \}\);\s*\n\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\n\s*\}, \[restPointFocusMode, mapReady, restPointIdsKey, currentLat, currentLon\]\);/);
    assert.ok(match, "meg kell találni a pihenőpont-fitBounds hívást a restPointFocusMode/restPointIdsKey/currentLat/currentLon deps-szel");
    const padding = Number(match![1]);
    const maxZoom = Number(match![2]);
    assert.ok(padding >= 40 && padding <= 60, `padding ${padding} nincs a spec szerinti 40-60px tartományban`);
    assert.ok(maxZoom >= 16 && maxZoom <= 17, `maxZoom ${maxZoom} nincs a spec szerinti 16-17 tartományban`);
  });

  test("0 találat ÉS nincs GPS-pozíció esetén a nézethez NEM nyúl (korai return, nincs városnézetre ugrás)", () => {
    assert.match(
      src,
      /if \(!hasCurrentPosition && restPoints\.length === 0\) \{[\s\S]{0,300}?return;\s*\}/,
      "0 találat + hiányzó GPS esetén a kódnak explicit korai return-nel kell kihagynia a fitBounds hívást"
    );
  });

  test("STABIL, PRIMITÍV függőségek: a restPoints/currentPosition props referenciái NEM szerepelnek közvetlenül a deps tömbben", () => {
    const depsMatch = src.match(/\}, \[restPointFocusMode, mapReady, restPointIdsKey, currentLat, currentLon\]\);/);
    assert.ok(depsMatch, "a pihenőpont-fitBounds effekt deps tömbjének levezetett primitíveket kell tartalmaznia, nem a nyers restPoints/currentPosition referenciákat");

    // A levezetett kulcsok maguk a komponens törzsében, primitív értékként jönnek létre.
    assert.match(
      src,
      /const restPointIdsKey = restPointFocusMode \? restPoints\.map\(\(rp\) => rp\.id\)\.join\(","\) : "";/,
      "restPointIdsKey-nek a restPoints id-jeiből levezetett, stabil string kulcsnak kell lennie"
    );
    assert.match(src, /const currentLat = currentPosition\?\.latitude;/);
    assert.match(src, /const currentLon = currentPosition\?\.longitude;/);
  });

  test("REGRESSZIÓ: a meglévő route-geometria fitBounds effekt (padding:48, maxZoom:17) restPointFocusMode=false esetén változatlan maradt", () => {
    assert.match(
      src,
      /if \(hasCoords && !restPointFocusMode\) \{\s*\n\s*map\.fitBounds\(bounds, \{ padding: 48, maxZoom: 17, duration: 300 \}\);\s*\n\s*\}\s*\n\s*\}, \[legs, mapReady, restPointFocusMode\]\);/,
      "a route-geometria fitBounds effekt paraméterei nem regresszálhattak a pihenőpont-fitBounds javítás bevezetésével — csak egy explicit !restPointFocusMode feltétellel bővült"
    );
  });

  test("Egyetlen Megosztott Térkép: restPointFocusMode prop létezik, alapértéke false (visszafelé kompatibilis a régi route-fitBounds viselkedéssel)", () => {
    assert.match(src, /restPointFocusMode\?: boolean;/, "a VedettUtvonalMapProps-nak tartalmaznia kell egy opcionális restPointFocusMode mezőt");
    assert.match(
      src,
      /restPointFocusMode = false,/,
      "restPointFocusMode alapértéke false kell legyen, hogy a meglévő (nem pihenőpont-fókuszú) hívók változatlanul működjenek"
    );
  });

  test("marker/lista hover-szinkron (selectedRestPointId / onSelectRestPoint) a marker-effektben érintetlen maradt", () => {
    assert.match(
      src,
      /\}, \[restPoints, mapReady, selectedRestPointId, onSelectRestPoint\]\);/,
      "a rest-point marker effekt deps-ének (hover/klikk szinkronhoz szükséges selectedRestPointId/onSelectRestPoint) változatlannak kell maradnia"
    );
  });
});
