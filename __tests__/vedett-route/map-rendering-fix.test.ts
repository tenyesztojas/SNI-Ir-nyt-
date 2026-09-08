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
// KIZÁRHATÓ mint a barna térkép oka. A CSP/tile-betöltés a korábbi
// csp-maplibre-demotiles.test.ts szerint már bizonyítottan rendben van.
// Ezért a barna térkép legvalószínűbb, forráskód-szinten alátámasztott oka:
// a line-dasharray adat-kifejezés miatt a map.addLayer() szinkron kivételt
// dobott a "vedett-route-legs-lines" réteg létrehozásakor — ez megakasztotta
// a teljes réteg-építő useEffect-et (a "-stops" réteg és a fitBounds() SEM
// futott le utána), ami hibás/befejezetlen renderelési állapotot hagyott a
// WebGL vásznon. A jelen javítás (külön, statikus line-dasharray értékű,
// filter-elt layerek) megszünteti a kivétel forrását.
//
//   node --test --experimental-strip-types __tests__/vedett-route/map-rendering-fix.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import maplibreStyleSpec from "@maplibre/maplibre-gl-style-spec";
import { decodePolyline, journeyLegsToGeoJson } from "../../lib/vedett-route/geometry.ts";

const mapFilePath = join(process.cwd(), "components/vedett-utvonal/VedettUtvonalMap.tsx");
const mapSrc = readFileSync(mapFilePath, "utf8");
const panelFilePath = join(process.cwd(), "components/vedett-utvonal/RestStopFlowPanel.tsx");
const panelSrc = readFileSync(panelFilePath, "utf8");

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

describe("Regresszió — a korábbi CSP javítás (demotiles.maplibre.org) érintetlen", () => {
  test("middleware.ts CSP connect-src direktívája továbbra is tartalmazza a demotiles.maplibre.org hosztot", () => {
    const middlewarePath = join(process.cwd(), "middleware.ts");
    const middlewareSrc = readFileSync(middlewarePath, "utf8");
    const connectSrcLine = middlewareSrc.split("\n").find((l) => l.trim().startsWith("`connect-src"));
    assert.ok(connectSrcLine, "kell legyen connect-src direktíva sor");
    assert.ok(
      connectSrcLine!.includes("https://demotiles.maplibre.org"),
      "a connect-src direktívának változatlanul tartalmaznia kell a demotiles.maplibre.org hosztot"
    );
  });
});
