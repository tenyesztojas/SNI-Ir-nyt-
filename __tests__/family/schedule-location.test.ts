// VÉDETT CSALÁD — napirendi helyszín-koordináták + Védett Útvonal mélylink
//   node --test __tests__/family/schedule-location.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScheduleRouteHref, hasValidCoordinates, parseCoordinatePair } from "../../lib/family/scheduleLocation.ts";

const read = (p: string) => readFileSync(p, "utf8");

describe("koordinátapár feldolgozása", () => {
  test("üres pár = nincs koordináta (régi / kézzel írt cím)", () => {
    assert.deepEqual(parseCoordinatePair("", ""), { ok: true, lat: null, lon: null });
    assert.deepEqual(parseCoordinatePair(null, undefined), { ok: true, lat: null, lon: null });
  });
  test("érvényes pár", () => {
    assert.deepEqual(parseCoordinatePair("47.4979", "19.0402"), { ok: true, lat: 47.4979, lon: 19.0402 });
  });
  test("fél pár / nem szám / tartományon kívül -> hiba", () => {
    for (const [a, b] of [["47.5", ""], ["", "19"], ["abc", "19"], ["95", "19"], ["47", "181"]]) {
      assert.equal(parseCoordinatePair(a, b).ok, false, `${a},${b}`);
    }
  });
});

describe("Útvonal megtervezése mélylink", () => {
  const base = { title: "Iskola", destinationLabel: "Iskola u. 1., Budapest", destinationLat: 47.5, destinationLon: 19.05 };
  test("érvényes célkoordinátával a meglévő ?name=&lat=&lon= formátum", () => {
    const href = buildScheduleRouteHref(base)!;
    const u = new URL(href, "https://x.hu");
    assert.equal(u.pathname, "/vedett-utvonal");
    assert.equal(u.searchParams.get("name"), "Iskola u. 1., Budapest");
    assert.equal(u.searchParams.get("lat"), "47.5");
    assert.equal(u.searchParams.get("lon"), "19.05");
  });
  test("koordináta nélkül (csak szöveges cím) nincs link — nincs kitalált koordináta", () => {
    assert.equal(buildScheduleRouteHref({ ...base, destinationLat: null, destinationLon: null }), null);
    assert.equal(buildScheduleRouteHref({ ...base, destinationLat: 47.5, destinationLon: null }), null);
    assert.equal(buildScheduleRouteHref({ ...base, destinationLat: 99, destinationLon: 19 }), null);
    assert.equal(hasValidCoordinates(NaN, 19), false);
  });
});

describe("bekötés", () => {
  test("űrlap: meglévő címkereső, kézi átírás törli a koordinátát", () => {
    const f = read("components/family/ScheduleItemForm.tsx");
    assert.match(f, /useAddressAutocomplete\(text, !focused \|\| coords !== null\)/);
    assert.match(f, /onChange=\{\(e\) => \{\s*\n\s*setText\(e\.target\.value\);\s*\n\s*setCoords\(null\);/);
    for (const n of ["originLat", "originLon", "destinationLat", "destinationLon"]) assert.match(f, new RegExp(`Name="${n}"`));
  });
  test("szerverakció: a meglévő RPC-paraméterekbe, címke nélkül nincs koordináta", () => {
    const a = read("lib/actions/family.ts");
    assert.equal((a.match(/p_destination_lat: destinationLabelRaw \? destinationCoords\.lat : null,/g) ?? []).length, 2);
    assert.equal((a.match(/if \(!destinationCoords\.ok\) return \{ error: destinationCoords\.error \};/g) ?? []).length, 2);
  });
  test("adatlekérdezés: koordináták a select-ben és a nézetben", () => {
    const d = read("lib/family/data.ts");
    assert.equal((d.match(/origin_lat, origin_lon, destination_label, destination_lat, destination_lon, is_active/g) ?? []).length, 2);
    assert.equal((d.match(/destinationLat: row\.destination_lat \?\? null,/g) ?? []).length, 2);
  });
});
