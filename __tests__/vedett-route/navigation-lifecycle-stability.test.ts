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

    // NAVIGATION FOUNDATION (2026-09-17, GPS FIX FRESHNESS) — a
    // routeNavigationPosition useMemo SZÁNDÉKOSAN bővült a gpsFixUsable
    // dependencyvel (lásd gpsFixGate.ts): egy STALE/INVALID vagy pending
    // reacquisition alatt lévő GPS-fix nem adhat tovább pozíciót a route
    // progress motornak. A régi assertion ("[currentPosition]," pontosan
    // ez a tartalom) ezt a dokumentált bővítést hibásan buktatta — az
    // alábbi a memoizáltság invariánsát ellenőrzi (a dependency-lista
    // TÉNYLEGESEN mindkét, a visszaadott értéket befolyásoló bemenetet
    // tartalmazza), nem a lista byte-pontos tartalmát.
    const memoBlock = formSrc.match(/const routeNavigationPosition = useMemo\(\s*\(\)[\s\S]*?\n\s{2}\);/)?.[0] ?? "";
    assert.ok(memoBlock.length > 0, "a routeNavigationPosition useMemo teljes blokkja megtalálható");

    const depsMatch = memoBlock.match(/\[[^\]]*\]/);
    assert.ok(depsMatch, "a useMemo dependency-listája megtalálható");
    const deps = depsMatch[0];

    assert.match(deps, /\bcurrentPosition\b/, "currentPosition szerepel a dependency-listában");
    assert.match(deps, /\bgpsFixUsable\b/, "gpsFixUsable szerepel a dependency-listában");
  });

  test("a hook explicit active paramétert kap", () => {
    assert.match(hookSrc, /active = true,/);
    // TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — a hívó
    // (VedettUtvonalSearchForm.tsx) `navigationMode` UTÁN a hook ÚJ, additív
    // `resetToken` (routeProgressResetToken) paraméterét is átadja (a régi
    // "navigationMode a hívás UTOLSÓ argumentuma" regex ezt a dokumentált
    // bővítést hibásan buktatta) — az invariáns, hogy `navigationMode` a
    // hook `active` paraméterének felel meg, VÁLTOZATLAN.
    assert.match(formSrc, /navigationMode,\s*routeProgressResetToken,\s*\);/);
  });

  test("inaktív navigációban GPS-fix nem futtat route progress számítást", () => {
    assert.match(hookSrc, /if \(!active \|\| !position \|\| routeCoordinates\.length < 2\) return;/);
  });

  test("route vagy active session-váltás reseteli az előző progress állapotot", () => {
    assert.match(hookSrc, /previousRef\.current = null;/);
    // TRANSIT GPS LOSS SPRINT (2026-09-21) — a reset-effekt SZÁNDÉKOSAN
    // bővült egy additív `resetToken` dependencyvel (lásd useRouteNavigation.ts
    // fejlécét: force-reset a transit-GPS-loss "Igen" válaszra) — a régi,
    // "pontosan [routeCoordinates, active]" regex ezt a dokumentált bővítést
    // hibásan buktatta. Az invariáns (route/active váltás resetel) VÁLTOZATLAN.
    assert.match(hookSrc, /\[routeCoordinates, active, resetToken\]/);
  });

  test("az update effect active változásra is reagál", () => {
    assert.match(hookSrc, /\[active, position, routeCoordinates,/);
  });
});
