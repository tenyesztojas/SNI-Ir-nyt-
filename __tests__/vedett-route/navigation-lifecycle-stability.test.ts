import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const formSrc = fs.readFileSync(path.join(root, "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const hookSrc = fs.readFileSync(path.join(root, "lib/hooks/useRouteNavigation.ts"), "utf8");

describe("Navigation lifecycle stability", () => {
  test("currentPosition memoizált, ezért változatlan GPS-fix nem gyárt új objektumreferenciát", () => {
    assert.match(formSrc, /const currentPosition = useMemo\(/);

    // SPRINT 7.1 UTÓKÖR (BOARDED SAFETY REVIEW után) — audit: a currentPosition
    // objektum a Sprint 7.1-ben bővült egy ÚJ mezővel (geo.accuracyMeters, a
    // WALK→TRANSIT boundary resolverhez), ezért a useMemo dependency-listája
    // is bővült. A régi assertion ("geo.timestampMs" a lista UTOLSÓ eleme)
    // ezt a SZÁNDÉKOS, dokumentált bővítést hibásan buktatta — a lifecycle
    // invariáns (változatlan GPS-fix -> nincs új objektumreferencia) VÁLTOZATLANUL
    // igaz, mert (a) minden, a visszaadott objektumban tényleges mezőt viselő
    // geo.* érték benne van a dependency-listában (tehát azonos primitívek ->
    // ugyanaz a memoizált referencia), és (b) NINCS indokolatlan, teljes `geo`
    // objektum-szintű dependency, ami minden rendernél új referenciát okozna
    // (a `geo` objektum maga minden geolokáció-eseménynél új referenciát kap a
    // useGeolocation() hookban, tehát object-szintű dependency aláásná a
    // memoizálást). Az alábbi assertionök ezt a SZEMANTIKAI invariánst
    // ellenőrzik, nem egy byte-pontos, a mezők sorrendjéhez/számához kötött
    // regexet — így egy jövőbeli, ugyanígy dokumentált mezőbővítés nem fogja
    // feleslegesen buktatni ezt a tesztet.
    const memoBlock = formSrc.match(/const currentPosition = useMemo\(\s*\(\)[\s\S]*?\n\s{2}\);/)?.[0] ?? "";
    assert.ok(memoBlock.length > 0, "a currentPosition useMemo teljes blokkja megtalálható");

    const depsMatch = memoBlock.match(/\[\s*geo\.[^\]]*\]/);
    assert.ok(depsMatch, "a useMemo dependency-listája (geo.* mezőkből) megtalálható");
    const deps = depsMatch[0];

    // Minden GPS-mező, ami TÉNYLEGESEN része a visszaadott currentPosition
    // objektumnak, szerepel a dependency-listában is.
    for (const field of ["geo.status", "geo.latitude", "geo.longitude", "geo.headingDegrees", "geo.speedMetersPerSecond", "geo.timestampMs", "geo.accuracyMeters"]) {
      assert.match(deps, new RegExp(field.replace(".", "\\.")), `${field} szerepel a dependency-listában`);
    }

    // Nincs indokolatlan, teljes "geo" objektum-szintű dependency (csak a
    // "geo.mező" alakú, granuláris bejegyzések engedettek).
    assert.doesNotMatch(deps, /\[\s*geo\s*,/, "nincs `geo` mint önálló, objektum-szintű dependency a lista elején");
    assert.doesNotMatch(deps, /,\s*geo\s*,/, "nincs `geo` mint önálló, objektum-szintű dependency a lista közepén");
    assert.doesNotMatch(deps, /,\s*geo\s*\]/, "nincs `geo` mint önálló, objektum-szintű dependency a lista végén");
  });

  test("routeNavigationPosition is memoizált", () => {
    assert.match(formSrc, /const routeNavigationPosition = useMemo\(/);
    assert.match(formSrc, /\[currentPosition\],\s*\);/);
  });

  test("a hook explicit active paramétert kap", () => {
    assert.match(hookSrc, /active = true,/);
    assert.match(formSrc, /navigationMode,\s*\);/);
  });

  test("inaktív navigációban GPS-fix nem futtat route progress számítást", () => {
    assert.match(hookSrc, /if \(!active \|\| !position \|\| routeCoordinates\.length < 2\) return;/);
  });

  test("route vagy active session-váltás reseteli az előző progress állapotot", () => {
    assert.match(hookSrc, /previousRef\.current = null;/);
    assert.match(hookSrc, /\[routeCoordinates, active\]/);
  });

  test("az update effect active változásra is reagál", () => {
    assert.match(hookSrc, /\[active, position, routeCoordinates,/);
  });
});
