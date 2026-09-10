// VÉDETT ÚTVONAL — KRITIKUS PRODUCTION BUG: rest-point request-storm javítás
// regressziós tesztje (2026-09-10).
//
// ROOT CAUSE (bizonyítva, nem feltételezve — lásd a jelentést): a
// RestStopFlowPanel.tsx REST_POINTS_LOADING useEffect-je KORÁBBAN
// [ctx?.state, geo.latitude, geo.longitude]-tól függött. Navigation Mode
// alatt a watchPosition folyamatosan frissíti geo.latitude/geo.longitude-ot,
// és mivel ctx.state csak a fetch LEZÁRULÁSAKOR vált (READY/ERROR), MINDEN
// egyes GPS-tick — ami a fetch még folyamatban léte alatt érkezik — egy ÚJ
// effect-futást, és ezzel egy ÚJ /nearby hívást indított. Ez okozta a
// production log-okban látott tömeges overpass_timeout/overpass_http_429
// kéréseket, és a saját /nearby rate limiter 429-es válaszát.
//
// A JAVÍTÁS: a GPS-koordinátát KIZÁRÓLAG a REST_REQUESTED ->
// REST_POINTS_LOADING átmenet pillanatában, EGYETLEN alkalommal olvassuk le
// (pillanatkép / snapshot), és ezt tároljuk a context.requestOrigin mezőben
// (lásd lib/vedett-route/restStopFlow/types.ts és stateMachine.ts). A
// REST_POINTS_LOADING effect ETTŐL FÜGGVE hívja a /nearby-t, sosem a live
// geo.latitude/geo.longitude-tól — így egy explicit "Pihenőre van
// szükségem" kattintás pontosan EGY hálózati hívást indít, függetlenül attól,
// hány GPS-tick érkezik közben.
//
// Ugyanazt a forráskód-szintű, strukturális regresszió-teszt mintát követi
// a WIRING (useEffect deps / fetch body) bizonyítására, mint a projekt
// korábbi tesztjei (nincs jsdom/@testing-library/react) — DE a
// state-machine-szintű állítások (A, D, E, G, H) a VALÓDI, futó
// transitionRestStopFlow reducert hívják, tényleges viselkedésként, nem
// csak szöveges egyezésként.
//
//   node --test --experimental-strip-types __tests__/vedett-route/rest-point-request-storm-fix.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInitialRestStopFlowContext, transitionRestStopFlow } from "../../lib/vedett-route/restStopFlow/stateMachine.ts";

const PANEL_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "RestStopFlowPanel.tsx");
const panelSrc = readFileSync(PANEL_PATH, "utf-8");

const ORIGINAL_DESTINATION = { name: "Astoria", lat: 47.4952, lon: 19.0616 };
const ORIGINAL_DEPART_AT = "2026-09-07T10:00:00.000Z";

function apply(ctx: ReturnType<typeof createInitialRestStopFlowContext>, event: Parameters<typeof transitionRestStopFlow>[1]) {
  const result = transitionRestStopFlow(ctx, event);
  assert.equal(result.ok, true, `váratlan hiba a(z) "${event.type}" eseménynél`);
  return result.ok ? result.context : ctx;
}

// A REST_POINTS_LOADING useEffect teljes törzsének kinyerése — stabil
// horgony-string-ekre épül. A projekt fájljai CRLF sorvégekkel vannak
// tárolva.
const loadingEffectStart = panelSrc.indexOf("// REST_POINTS_LOADING: a /nearby végpont hívása.");
assert.ok(loadingEffectStart !== -1, "meg kell találni a REST_POINTS_LOADING effect kommentjét");
const loadingEffectEnd = panelSrc.indexOf(
  "// ROUTING_TO_REST_POINT: a /route-to-rest-point végpont hívása.",
  loadingEffectStart
);
assert.ok(loadingEffectEnd !== -1, "meg kell találni a KÖVETKEZŐ (ROUTING_TO_REST_POINT) effect kommentjét, mint záró horgonyt");
const loadingEffectSrc = panelSrc.slice(loadingEffectStart, loadingEffectEnd);

// A REST_REQUESTED useEffect teljes törzsének kinyerése.
const requestedEffectStart = panelSrc.indexOf("// REST_REQUESTED: szükségünk van egy ismert pozícióra a rangsoroláshoz.");
assert.ok(requestedEffectStart !== -1, "meg kell találni a REST_REQUESTED effect kommentjét");
const requestedEffectEnd = panelSrc.indexOf("// REST_POINTS_LOADING: a /nearby végpont hívása.", requestedEffectStart);
const requestedEffectSrc = panelSrc.slice(requestedEffectStart, requestedEffectEnd);

describe("B/F/I) A REST_POINTS_LOADING effect strukturálisan a GPS-pillanatképtől (requestOrigin) függ, NEM a live geo koordinátáktól", () => {
  test("B) a REST_REQUESTED effect a GPS-t EGYETLEN alkalommal olvassa le, és pillanatképként (requestOrigin) adja át az állapotgépnek", () => {
    assert.match(
      requestedEffectSrc,
      /dispatch\(\{\s*type:\s*"START_LOADING_REST_POINTS",\s*requestOrigin:\s*\{\s*latitude:\s*geo\.latitude,\s*longitude:\s*geo\.longitude\s*\}\s*\}\)/,
      "a START_LOADING_REST_POINTS dispatch-nek requestOrigin: { latitude: geo.latitude, longitude: geo.longitude } payloadot kell hordoznia"
    );
  });

  test("F/I) a REST_POINTS_LOADING effect dependency array-je NEM tartalmazza a geo.latitude/geo.longitude-ot — csak ctx.state és ctx.requestOrigin mezőket", () => {
    assert.match(
      loadingEffectSrc,
      /\}, \[ctx\?\.state, ctx\?\.requestOrigin\?\.latitude, ctx\?\.requestOrigin\?\.longitude\]\);/,
      "a dependency array-nek [ctx?.state, ctx?.requestOrigin?.latitude, ctx?.requestOrigin?.longitude]-nak kell lennie"
    );
    assert.doesNotMatch(
      loadingEffectSrc,
      /\[ctx\?\.state, geo\.latitude, geo\.longitude\]/,
      "a RÉGI, hibás dependency array (élő GPS-től függő) NEM maradhat a forrásban"
    );
  });

  test("F) a /nearby fetch body a ctx.requestOrigin-ből destruktúrázott latitude/longitude-ot használja, NEM a live geo.latitude/geo.longitude-ot", () => {
    assert.match(
      loadingEffectSrc,
      /const \{ latitude, longitude \} = ctx\.requestOrigin;/,
      "a snapshotot a ctx.requestOrigin-ből kell destruktúrázni"
    );
    assert.match(
      loadingEffectSrc,
      /currentPosition:\s*\{\s*lat:\s*latitude,\s*lon:\s*longitude\s*\}/,
      "a /nearby hívásnak a destruktúrázott (snapshot) latitude/longitude-ot kell elküldenie"
    );
    // A postJson hívás körüli teljes blokkban SEHOL nem szabad élő
    // geo.latitude/geo.longitude hivatkozásnak lennie (csak a snapshot
    // változóknak) — ez a "GPS-tick nem indíthat új hívást" invariáns
    // forráskód-szintű bizonyítéka.
    const fetchCallStart = loadingEffectSrc.indexOf("await postJson<");
    const fetchCallEnd = loadingEffectSrc.indexOf(");", fetchCallStart) + 2;
    const fetchCallBlock = loadingEffectSrc.slice(fetchCallStart, fetchCallEnd);
    assert.doesNotMatch(fetchCallBlock, /geo\.latitude/, "a fetch hívásban nem szabad élő geo.latitude-ot használni");
    assert.doesNotMatch(fetchCallBlock, /geo\.longitude/, "a fetch hívásban nem szabad élő geo.longitude-ot használni");
  });

  test("a REST_POINTS_LOADING effect guardja megköveteli a ctx.requestOrigin meglétét (nem csak a state-et)", () => {
    assert.match(
      loadingEffectSrc,
      /if \(!ctx \|\| ctx\.state !== "REST_POINTS_LOADING" \|\| !ctx\.requestOrigin\) return;/,
      "a guard-nak explicit ellenőriznie kell, hogy ctx.requestOrigin létezik"
    );
  });

  test("C) a REST_POINTS_LOADING effect törzsében pontosan EGY /nearby postJson hívás létezik (forráskód-szinten, nem ciklusban/timer-ben)", () => {
    const occurrences = loadingEffectSrc.match(/postJson</g) ?? [];
    assert.equal(occurrences.length, 1, "pontosan egy postJson<...> hívásnak kell lennie ebben az effect-ben");
    assert.doesNotMatch(loadingEffectSrc, /setInterval|setTimeout/, "az effect nem tartalmazhat timer-alapú ismételt hívást");
  });
});

describe("A/D/E/G/H) Az állapotgép VALÓS, futó viselkedése — GPS-pillanatkép és a duplikált betöltés elleni védelem", () => {
  test("A) explicit REQUEST_REST -> START_LOADING_REST_POINTS a REST_POINTS_LOADING állapotba visz, és rögzíti az ELSŐ GPS-pillanatképet", () => {
    let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
    ctx = apply(ctx, { type: "REQUEST_REST" });
    assert.equal(ctx.state, "REST_REQUESTED");
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 47.1, longitude: 19.1 } });
    assert.equal(ctx.state, "REST_POINTS_LOADING");
    assert.deepEqual(ctx.requestOrigin, { latitude: 47.1, longitude: 19.1 });
  });

  test("D/E) míg REST_POINTS_LOADING állapotban vagyunk, egy MÁSODIK START_LOADING_REST_POINTS esemény (amit egy GPS-tick indítana, ha a régi hibás kód még élne) ÉRVÉNYTELEN — a requestOrigin nem cserélhető ki egy folyamatban lévő betöltés alatt", () => {
    let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
    ctx = apply(ctx, { type: "REQUEST_REST" });
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 47.1, longitude: 19.1 } });
    // Szimulált GPS-tick-ek — ha a régi, hibás kód még élne, ezek mind egy
    // ÚJ /nearby hívást indítanának. Az állapotgép szintjén ez egy MÁSODIK
    // START_LOADING_REST_POINTS eseményként jelenne meg.
    for (let i = 0; i < 20; i++) {
      const result = transitionRestStopFlow(ctx, {
        type: "START_LOADING_REST_POINTS",
        requestOrigin: { latitude: 47.1 + i * 0.0001, longitude: 19.1 + i * 0.0001 },
      });
      assert.equal(result.ok, false, "egy második START_LOADING_REST_POINTS-nak érvénytelennek kell lennie REST_POINTS_LOADING közben");
      assert.deepEqual(result.context.requestOrigin, { latitude: 47.1, longitude: 19.1 }, "a requestOrigin-nek VÁLTOZATLANNAK kell maradnia");
    }
    assert.equal(ctx.state, "REST_POINTS_LOADING");
  });

  test("G) CANCEL_REST_STOP után a requestOrigin törlődik, egy ÚJ ciklus friss pillanatképet vesz fel", () => {
    let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
    ctx = apply(ctx, { type: "REQUEST_REST" });
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 47.1, longitude: 19.1 } });
    ctx = apply(ctx, { type: "CANCEL_REST_STOP" });
    assert.equal(ctx.state, "ROUTE_ACTIVE");
    assert.equal(ctx.requestOrigin, undefined, "a requestOrigin-t törölni kell megszakításkor");

    ctx = apply(ctx, { type: "REQUEST_REST" });
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 47.9, longitude: 19.9 } });
    assert.deepEqual(ctx.requestOrigin, { latitude: 47.9, longitude: 19.9 }, "az ÚJ ciklusnak friss (más) pillanatképet kell felvennie");
  });

  test("RESET_TO_ROUTE_ACTIVE (ERROR-ból) is törli a requestOrigin-t", () => {
    let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
    ctx = apply(ctx, { type: "REQUEST_REST" });
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 47.1, longitude: 19.1 } });
    ctx = apply(ctx, { type: "REST_POINTS_LOAD_FAILED", reason: "REST_POINT_LOAD_FAILED", message: "x" });
    assert.equal(ctx.state, "ERROR");
    ctx = apply(ctx, { type: "RESET_TO_ROUTE_ACTIVE" });
    assert.equal(ctx.requestOrigin, undefined);
  });

  test("H) két KÜLÖN, explicit ciklus két, EGYMÁSTÓL FÜGGETLEN pillanatképet vesz fel (két hívásnak megfelelően)", () => {
    let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
    ctx = apply(ctx, { type: "REQUEST_REST" });
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 1, longitude: 1 } });
    const firstOrigin = ctx.requestOrigin;
    ctx = apply(ctx, {
      type: "REST_POINTS_LOADED",
      restPoints: [],
    });
    ctx = apply(ctx, { type: "CANCEL_REST_STOP" });

    ctx = apply(ctx, { type: "REQUEST_REST" });
    ctx = apply(ctx, { type: "START_LOADING_REST_POINTS", requestOrigin: { latitude: 2, longitude: 2 } });
    const secondOrigin = ctx.requestOrigin;

    assert.deepEqual(firstOrigin, { latitude: 1, longitude: 1 });
    assert.deepEqual(secondOrigin, { latitude: 2, longitude: 2 });
    assert.notDeepEqual(firstOrigin, secondOrigin, "a két ciklusnak KÜLÖNBÖZŐ pillanatképet kell vennie");
  });
});
