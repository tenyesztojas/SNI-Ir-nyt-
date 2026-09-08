// components/vedett-utvonal/VedettUtvonalMap.tsx — "brown map" / line-dasharray
// hiba javításának regresszió-tesztjei (2026-09-08).
//
// ROOT CAUSE 1 (bizonyítva, nem feltételezve): a MapLibre GL JS style-spec
// (@maplibre/maplibre-gl-style-spec, ugyanaz a csomag, amit a maplibre-gl
// futásidejűleg is használ a map.addLayer() validációjához) szerint a
// "line-dasharray" paint tulajdonság NEM támogat adat-vezérelt ("get"-alapú)
// kifejezést — ezt a lenti tesztek a valós spec-csomaggal, nem feltételezéssel
// igazolják (supportsPropertyExpression === false).
//
// ROOT CAUSE 2 (a "barna térkép" tünet): a koordináta-sorrend audit (lásd
// lent) bizonyítja, hogy a teljes lánc — journeyLegsToGeoJson,
// VedettUtvonalMap.tsx marker/center/fitBounds kód, RestStopFlowPanel.tsx,
// a 3 rest-stop API végpont — MINDENÜTT helyes [lng, lat] sorrendet használ
// (Budapest lon≈19, lat≈47.5 — sosem fordítva). A koordináta-sorrend tehát
// KIZÁRHATÓ mint a barna térkép oka. A CSP/tile-betöltés a
// __tests__/vedett-route/csp-openfreemap-basemap.test.ts szerint már
// bizonyítottan rendben van. Ezért a barna térkép legvalószínűbb,
// forráskód-szinten alátámasztott oka: a line-dasharray adat-kifejezés
// miatt a map.addLayer() szinkron kivételt dobott a
// "vedett-route-legs-lines" réteg létrehozásakor — ez megakasztotta a
// teljes réteg-építő useEffect-et (a "-stops" réteg és a fitBounds() SEM
// futott le utána), ami hibás/befejezetlen renderelési állapotot hagyott a
// WebGL vásznon. A jelen javítás (külön, statikus line-dasharray értékű,
// filter-elt layerek) megszünteti a kivétel forrását.
//
// FRISSÍTVE (2026-09-08, valódi utcai OSM-alaptérkép feladat): a
// demotiles.maplibre.org-ot az OpenFreeMap Liberty váltotta le (lásd
// lib/vedett-route/mapStyle.ts) — az alábbi tesztek ezt is lefedik
// (MAP_STYLE_URL használat, a régi hardcode-olt MAP_STYLE eltűnése, route
// layer az alaptérkép felett, route_color normalizálás/"#" invalid
// fallback).
//
//   node --test --experimental-strip-types __tests__/vedett-route/map-rendering-fix.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import maplibreStyleSpec from "@maplibre/maplibre-gl-style-spec";
import { decodePolyline, journeyLegsToGeoJson, normalizeRouteColor } from "../../lib/vedett-route/geometry.ts";
import { MAP_STYLE_URL, DEFAULT_MAP_STYLE_URL } from "../../lib/vedett-route/mapStyle.ts";

const mapFilePath = join(process.cwd(), "components/vedett-utvonal/VedettUtvonalMap.tsx");
const mapSrc = readFileSync(mapFilePath, "utf8");
const panelFilePath = join(process.cwd(), "components/vedett-utvonal/RestStopFlowPanel.tsx");
const panelSrc = readFileSync(panelFilePath, "utf8");
const mapStyleFilePath = join(process.cwd(), "lib/vedett-route/mapStyle.ts");
const mapStyleSrc = readFileSync(mapStyleFilePath, "utf8");

// Budapest referencia (a feladat kérése szerint): lon ≈ 19, lat ≈ 47.
const BUDAPEST_LON_RANGE: [number, number] = [18.5, 19.5];
const BUDAPEST_LAT_RANGE: [number, number] = [47.2, 47.7];

function assertLngLat(coord: [number, number], label: string) {
  const [lng, lat] = coord;
  assert.ok(
    lng > BUDAPEST_LON_RANGE[0] && lng < BUDAPEST_LON_RANGE[1],
    `${label}: az első koordináta (${lng}) Budapest longitude tartományában (~19) kell legyen — [lng, lat] sorrend`
  );
  assert.ok(
    lat > BUDAPEST_LAT_RANGE[0] && lat < BUDAPEST_LAT_RANGE[1],
    `${label}: a második koordináta (${lat}) Budapest latitude tartományában (~47) kell legyen — [lng, lat] sorrend`
  );
}

describe("ROOT CAUSE 1 — line-dasharray data expression támogatás (valós MapLibre style-spec)", () => {
  test("a line-dasharray paint tulajdonság NEM támogat adat-vezérelt ('get') kifejezést a telepített MapLibre verzióban", () => {
    const dasharraySpec = (maplibreStyleSpec as any).latest.paint_line["line-dasharray"];
    assert.equal(
      (maplibreStyleSpec as any).supportsPropertyExpression(dasharraySpec),
      false,
      "ha ez a teszt megbukik, a telepített MapLibre verzió már támogatja a data-driven line-dasharray-t, és az eredeti kód is helyes lett volna"
    );
  });

  test("a line-width és line-color paint tulajdonságok TÁMOGATNAK adat-vezérelt kifejezést (kontraszt — ezért maradhattak változatlanok)", () => {
    const widthSpec = (maplibreStyleSpec as any).latest.paint_line["line-width"];
    const colorSpec = (maplibreStyleSpec as any).latest.paint_line["line-color"];
    assert.equal((maplibreStyleSpec as any).supportsPropertyExpression(widthSpec), true);
    assert.equal((maplibreStyleSpec as any).supportsPropertyExpression(colorSpec), true);
  });

  test("VedettUtvonalMap.tsx forráskódja NEM tartalmaz 'get'-alapú kifejezést a line-dasharray értékeként", () => {
    // Konkrétan azt keressük, hogy a "line-dasharray" kulcs értéke sosem
    // egy ["match", ["get", ... vagy ["case", ["get", ... mintázatú tömb —
    // csak statikus szám-tömb (pl. [2, 2]) engedélyezett.
    const dasharrayLines = mapSrc
      .split("\n")
      .filter((l) => l.includes('"line-dasharray"'));
    assert.ok(dasharrayLines.length >= 1, "legalább egy line-dasharray beállításnak lennie kell");
    for (const line of dasharrayLines) {
      assert.ok(
        !/"line-dasharray":\s*\[\s*"(match|case|interpolate|step)"/.test(line) && !line.includes('["get"'),
        `a line-dasharray sor nem tartalmazhat adat-vezérelt kifejezést: ${line.trim()}`
      );
    }
  });

  test("a route-legs vonal réteg két külön, mód szerint filter-elt layerre van bontva (WALK szaggatott, tranzit folytonos)", () => {
    assert.ok(mapSrc.includes('id: `${sourceId}-lines-walk`'), "kell legyen külön WALK layer");
    assert.ok(mapSrc.includes('id: `${sourceId}-lines-transit`'), "kell legyen külön tranzit layer");
    assert.ok(
      mapSrc.includes('["==", ["get", "mode"], "WALK"]'),
      "a WALK layernek mode==WALK filter-rel kell szűrnie"
    );
    assert.ok(
      mapSrc.includes('["!=", ["get", "mode"], "WALK"]'),
      "a tranzit layernek mode!=WALK filter-rel kell szűrnie"
    );
  });

  test("a try/catch NEM használt a réteg-építés elrejtésére, és a route layer nincs teljesen letiltva", () => {
    // Explicit tiltás (a feladat 2. pontja): a hibát nem szabad try/catch-csel
    // elnyelni, és a teljes route layert nem szabad kikapcsolni.
    const buildRouteLayerSection = mapSrc.slice(
      mapSrc.indexOf("Útvonal-geometria rajzolása"),
      mapSrc.indexOf("Aktuális GPS-pozíció marker")
    );
    assert.ok(!buildRouteLayerSection.includes("try {"), "a route-layer építő blokk nem rejtheti el a hibát try/catch-csel");
    assert.ok(buildRouteLayerSection.includes("map.addLayer("), "a route layernek ténylegesen létre kell jönnie");
  });
});

describe("ROOT CAUSE 2 vizsgálat — koordináta-sorrend audit ([lng, lat], sosem [lat, lng])", () => {
  test("decodePolyline + journeyLegsToGeoJson: a kimeneti GeoJSON koordináták [lon, lat] sorrendben vannak", () => {
    const encoded = "qv_ryAaq}ic@Pr@`Ae@jKyD|KmFhOmK~^{\\|f@ub@~PuSdN}RnL{RnLg[rIy\\`DwSlGu]|B}RfAgQfAkUPqT?gQa@gLgA}MqQw|AaMwu@QJPK_q@scEkb@}}B_ZqxA}V{jAQX";
    const points = decodePolyline(encoded, 6);
    assert.ok(points.length > 5);
    const geojson = journeyLegsToGeoJson([
      { mode: "TRANSIT", transitMode: "SUBWAY", geometryEncoded: encoded, geometryPrecision: 6 },
    ]);
    const line = geojson.features.find((f) => f.geometry.type === "LineString");
    assert.ok(line, "kell legyen LineString feature");
    const coords = (line!.geometry as GeoJSON.LineString).coordinates as [number, number][];
    for (const c of coords) assertLngLat(c, "journeyLegsToGeoJson LineString koordináta");
  });

  test("journeyLegsToGeoJson: fallback egyenes (nincs geometria) is [lon, lat] sorrendű", () => {
    const geojson = journeyLegsToGeoJson([
      { mode: "WALK", fromLat: 47.4979, fromLon: 19.0402, toLat: 47.51, toLon: 19.06 },
    ]);
    const line = geojson.features.find((f) => f.geometry.type === "LineString");
    const coords = (line!.geometry as GeoJSON.LineString).coordinates as [number, number][];
    for (const c of coords) assertLngLat(c, "fallback LineString koordináta");
  });

  test("journeyLegsToGeoJson: intermediateStops Point koordinátái [lon, lat] sorrendűek", () => {
    const geojson = journeyLegsToGeoJson([
      {
        mode: "TRANSIT",
        fromLat: 47.5,
        fromLon: 19.05,
        toLat: 47.51,
        toLon: 19.06,
        intermediateStops: [{ name: "Astoria", lat: 47.4948, lon: 19.0625 }],
      },
    ]);
    const point = geojson.features.find((f) => f.geometry.type === "Point");
    assertLngLat((point!.geometry as GeoJSON.Point).coordinates as [number, number], "intermediateStops Point koordináta");
  });

  test("VedettUtvonalMap.tsx: a térkép 'center' konstansa [lng, lat] sorrendű (Budapest lon≈19, lat≈47.5)", () => {
    const match = mapSrc.match(/center:\s*\[([\d.]+),\s*([\d.]+)\]/);
    assert.ok(match, "a center konstansnak megtalálhatónak kell lennie");
    const lng = Number(match![1]);
    const lat = Number(match![2]);
    assertLngLat([lng, lat], "map center konstans");
  });

  test("VedettUtvonalMap.tsx: a GPS 'currentPosition' marker .setLngLat([longitude, latitude]) sorrendben hívja — nem [latitude, longitude]", () => {
    assert.ok(
      mapSrc.includes(".setLngLat([currentPosition.longitude, currentPosition.latitude])"),
      "a currentPosition markernek longitude-ot kell először átadnia (MapLibre [lng, lat] konvenció)"
    );
    assert.ok(
      !mapSrc.includes(".setLngLat([currentPosition.latitude, currentPosition.longitude])"),
      "SOSEM szabad felcserélt [lat, lng] sorrendet használni"
    );
  });

  test("VedettUtvonalMap.tsx: a pihenőpont marker .setLngLat([rp.longitude, rp.latitude]) sorrendben hívja", () => {
    assert.ok(
      mapSrc.includes(".setLngLat([rp.longitude, rp.latitude])"),
      "a pihenőpont markernek longitude-ot kell először átadnia"
    );
    assert.ok(
      !mapSrc.includes(".setLngLat([rp.latitude, rp.longitude])"),
      "SOSEM szabad felcserélt [lat, lng] sorrendet használni a pihenőpont markernél"
    );
  });

  test("VedettUtvonalMap.tsx: fitBounds a GeoJSON feature-ök koordinátáival dolgozik közvetlenül (nincs külön lat/lng felcserélés)", () => {
    const nezetIdx = mapSrc.indexOf("Nézet ráigazítása");
    const fitBoundsSection = mapSrc.slice(nezetIdx, mapSrc.indexOf("map.fitBounds(bounds", nezetIdx) + 200);
    assert.ok(fitBoundsSection.includes("bounds.extend(coord)"), "a bounds-nak közvetlenül a GeoJSON koordinátát kell használnia felcserélés nélkül");
    assert.ok(!/\[coord\[1\],\s*coord\[0\]\]/.test(fitBoundsSection), "nem szabad a koordináta-komponenseket felcserélve újraépíteni");
  });

  test("RestStopFlowPanel.tsx: a GPS pozíciót és a kiválasztott pihenőpontot mindenhol explicit { lat, lon } / { latitude, longitude } néven adja tovább, sosem csupasz [a, b] tömbként", () => {
    // A csupasz [szám, szám] tömb API-hívásban rejtett felcserélési kockázatot
    // hordozna — ez a komponens mindenhol elnevezett mezőket használ, ez a
    // teszt bizonyítja, hogy ez így is marad.
    assert.ok(
      panelSrc.includes("currentPosition: { lat: geo.latitude, lon: geo.longitude }"),
      "a /nearby és /route-to-rest-point hívásoknak explicit { lat, lon } objektumot kell küldeniük"
    );
    assert.ok(
      !/currentPosition:\s*\[/.test(panelSrc),
      "a currentPosition sosem lehet csupasz tömb (koordináta-sorrend kockázat)"
    );
  });
});

describe("Regresszió — a CSP javítás (OpenFreeMap, dinamikus host) érintetlen", () => {
  test("middleware.ts CSP connect-src direktívája a mapStyleHost változóból bővül (nem hardcode-olt demotiles hoszttal)", () => {
    const middlewarePath = join(process.cwd(), "middleware.ts");
    const middlewareSrc = readFileSync(middlewarePath, "utf8");
    const connectSrcLine = middlewareSrc.split("\n").find((l) => l.trim().startsWith("`connect-src"));
    assert.ok(connectSrcLine, "kell legyen connect-src direktíva sor");
    assert.ok(
      connectSrcLine!.includes("${mapStyleHost"),
      "a connect-src direktívának a mapStyleHost változóból kell interpolálnia, nem hardcode-olt hoszttal"
    );
    assert.ok(
      !connectSrcLine!.includes("demotiles.maplibre.org"),
      "a connect-src direktíva nem hivatkozhat többé a demotiles hosztra"
    );
  });
});

describe("Staging alaptérkép — MAP_STYLE_URL (OpenFreeMap Liberty)", () => {
  test("lib/vedett-route/mapStyle.ts alapértelmezett style URL-je az OpenFreeMap Liberty", () => {
    assert.equal(DEFAULT_MAP_STYLE_URL, "https://tiles.openfreemap.org/styles/liberty");
  });

  test("env override hiányában MAP_STYLE_URL === DEFAULT_MAP_STYLE_URL", () => {
    if (!process.env.NEXT_PUBLIC_VEDETT_MAP_STYLE_URL) {
      assert.equal(MAP_STYLE_URL, DEFAULT_MAP_STYLE_URL);
    }
  });

  test("VedettUtvonalMap.tsx a MAP_STYLE_URL-t importálja a mapStyle.ts-ből, NEM hardcode-ol style URL-t", () => {
    assert.ok(
      mapSrc.includes('import { MAP_STYLE_URL, MAP_ATTRIBUTION_FALLBACK } from "@/lib/vedett-route/mapStyle"'),
      "a style URL-nek a központi mapStyle.ts-ből kell jönnie"
    );
    assert.ok(mapSrc.includes("style: MAP_STYLE_URL"), "a Map konstruktornak a MAP_STYLE_URL konstanst kell használnia");
    assert.ok(
      !mapSrc.includes('"https://demotiles.maplibre.org/style.json"'),
      "nem térhet vissza a régi, helyben hardcode-olt demotiles style URL string literál"
    );
  });

  test("mapStyle.ts nem tartalmaz secret-et (csak publikus URL/attribution konstansokat exportál)", () => {
    const hasSecretEnvRef = /process\.env\.\w*(SECRET|TOKEN|KEY)\b/i.test(mapStyleSrc);
    assert.equal(hasSecretEnvRef, false, "mapStyle.ts nem hivatkozhat secret env változóra");
  });

  test("Attribution: a térkép explicit, NEM összecsukott (compact: false) AttributionControl-t használ", () => {
    assert.ok(
      mapSrc.includes("attributionControl: false"),
      "a Map konstruktornak ki kell kapcsolnia az alapértelmezett attribution control-t"
    );
    assert.ok(
      mapSrc.includes("new maplibregl.AttributionControl({ compact: false"),
      "explicit, compact:false AttributionControl-nak kell hozzáadva lennie -- az attribution SOSEM lehet elrejtve"
    );
  });
});

describe("Route overlay -- layer order az alaptérkép FÖLÖTT", () => {
  test("a saját route/stop rétegek addLayer() hívásai NEM adnak meg beforeId-t -- a MapLibre így a rétegsor tetejére teszi őket, az OpenFreeMap Liberty alaptérkép rétegei FÖLÉ", () => {
    const routeLayerSection = mapSrc.slice(mapSrc.indexOf("Útvonal-geometria rajzolása"), mapSrc.indexOf("Nézet ráigazítása"));
    const layerIdFragments = ["-lines-walk`", "-lines-transit`", "-stops`"];
    for (const fragment of layerIdFragments) {
      assert.ok(routeLayerSection.includes(fragment), `hiányzó layer id minta a route-layer szekcióban: ${fragment}`);
    }
    // A döntő ellenőrzés: az addLayer hívásoknak KIZÁRÓLAG egyetlen
    // objektum argumentumuk van -- ha valaha egy második, string
    // (beforeId) argumentum kerülne be, az a réteget NEM a rétegsor
    // tetejére, hanem egy meglévő réteg alá helyezné.
    const addLayerCallsWithSecondArg = routeLayerSection.match(/map\.addLayer\(\{[^)]*\},\s*["'`]/g) ?? [];
    assert.equal(
      addLayerCallsWithSecondArg.length,
      0,
      "egyik addLayer hívás sem kaphat beforeId (második) argumentumot -- a route rétegeknek a rétegsor tetején kell maradniuk"
    );
  });
});

describe("Route color -- 'Could not parse color from value #' javítás (normalizeRouteColor)", () => {
  test("valós, '#' nélküli GTFS route_color (009FE3) normalizálva #009FE3-ra", () => {
    assert.equal(normalizeRouteColor("009FE3"), "#009FE3");
  });

  test("már '#'-fel kezdődő route_color nem duplázódik meg", () => {
    assert.equal(normalizeRouteColor("#22C55E"), "#22C55E");
  });

  test("üres string ('') esetén undefined (alkalmazás-default aktiválódik, SOSEM csupasz '#')", () => {
    assert.equal(normalizeRouteColor(""), undefined);
  });

  test("csupasz '#' esetén undefined", () => {
    assert.equal(normalizeRouteColor("#"), undefined);
  });

  test("undefined/null bemenetre undefined-ot ad, nem dob kivételt", () => {
    assert.doesNotThrow(() => {
      assert.equal(normalizeRouteColor(undefined), undefined);
      assert.equal(normalizeRouteColor(null), undefined);
    });
  });

  test("érvénytelen hosszúságú/nem-hex bemenetre undefined (pl. rövid vagy nem hex karaktereket tartalmazó string)", () => {
    assert.equal(normalizeRouteColor("ZZZZZZ"), undefined);
    assert.equal(normalizeRouteColor("ABC"), undefined);
    assert.equal(normalizeRouteColor("1234567"), undefined);
  });

  test("journeyLegsToGeoJson: érvényes routeColor esetén a GeoJSON feature properties tartalmazza a normalizált #RRGGBB színt", () => {
    const geojson = journeyLegsToGeoJson([
      { mode: "TRANSIT", transitMode: "BUS", routeColor: "009FE3", fromLat: 47.5, fromLon: 19.05, toLat: 47.51, toLon: 19.06 },
    ]);
    const line = geojson.features.find((f) => f.geometry.type === "LineString");
    assert.equal(line?.properties?.routeColor, "#009FE3");
  });

  test("journeyLegsToGeoJson: üres routeColor esetén a routeColor kulcs EGYÁLTALÁN NEM kerül be a properties-be (nem null, nem csupasz '#')", () => {
    const geojson = journeyLegsToGeoJson([
      { mode: "TRANSIT", transitMode: "BUS", routeColor: "", fromLat: 47.5, fromLon: 19.05, toLat: 47.51, toLon: 19.06 },
    ]);
    const line = geojson.features.find((f) => f.geometry.type === "LineString");
    assert.ok(line && !("routeColor" in (line.properties ?? {})), "üres routeColor esetén a kulcs nem lehet jelen");
  });

  test("journeyLegsToGeoJson: csupasz '#' routeColor esetén szintén nem kerül be a kulcs", () => {
    const geojson = journeyLegsToGeoJson([
      { mode: "TRANSIT", transitMode: "BUS", routeColor: "#", fromLat: 47.5, fromLon: 19.05, toLat: 47.51, toLon: 19.06 },
    ]);
    const line = geojson.features.find((f) => f.geometry.type === "LineString");
    assert.ok(line && !("routeColor" in (line.properties ?? {})), "csupasz '#' routeColor esetén a kulcs nem lehet jelen");
  });

  test("VedettUtvonalMap.tsx line-color kifejezései NEM használnak többé concat-ot a '#' összefűzésére (a színt már normalizálva kapja a geometry.ts-ből)", () => {
    const codeLinesWithConcat = mapSrc
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .filter((l) => l.includes('["concat", "#"'));
    assert.equal(
      codeLinesWithConcat.length,
      0,
      "a concat-alapú '#' összefűzés (tényleges kódban, nem kommentben) eltávolításra került -- a routeColor már normalizálva érkezik"
    );
  });

  test("VedettUtvonalMap.tsx: hiányzó routeColor esetén a WALK layer MODE_COLOR.WALK-ot használ default-ként (nem a tranzit RAIL színt)", () => {
    assert.ok(
      mapSrc.includes('["case", ["has", "routeColor"], ["get", "routeColor"], MODE_COLOR.WALK]'),
      "a WALK layer default színének MODE_COLOR.WALK-nak kell lennie"
    );
  });
});
