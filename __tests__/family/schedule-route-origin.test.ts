// VÉDETT CSALÁD -> VÉDETT ÚTVONAL — kiindulási hely mélylink + mentett helyek
//   node --test __tests__/family/schedule-route-origin.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildScheduleRouteHref } from "../../lib/family/scheduleLocation.ts";
import { routeDestinationDeepLinkSchema, routeOriginDeepLinkSchema } from "../../lib/vedett-route/schemas.ts";

const read = (p: string) => readFileSync(p, "utf8");
const base = { title: "Iskola", destinationLabel: "Iskola u. 1.", destinationLat: 47.5, destinationLon: 19.05 };

describe("napirend -> mélylink: indulási és célkoordináták", () => {
  test("érvényes kiindulási hely: külön originName/originLat/originLon, a cél name/lat/lon változatlan", () => {
    const href = buildScheduleRouteHref({ ...base, originLabel: "Otthon tér 2.", originLat: 47.48, originLon: 19.01 })!;
    const q = new URLSearchParams(href.split("?")[1]);
    assert.equal(q.get("name"), "Iskola u. 1.");
    assert.equal(q.get("lat"), "47.5");
    assert.equal(q.get("lon"), "19.05");
    assert.equal(q.get("originName"), "Otthon tér 2.");
    assert.equal(q.get("originLat"), "47.48");
    assert.equal(q.get("originLon"), "19.01");
  });
  test("koordináta nélküli / érvénytelen / névtelen kiindulás: nincs origin paraméter", () => {
    for (const o of [
      { originLabel: "Otthon", originLat: null, originLon: null },
      { originLabel: "Otthon", originLat: 95, originLon: 19 },
      { originLabel: "  ", originLat: 47.48, originLon: 19.01 },
      {},
    ]) {
      const href = buildScheduleRouteHref({ ...base, ...o })!;
      assert.doesNotMatch(href, /origin/);
    }
  });
  test("regresszió: a régi cél-mélylink formátuma bájtra azonos", () => {
    assert.equal(buildScheduleRouteHref(base), "/vedett-utvonal?name=Iskola+u.+1.&lat=47.5&lon=19.05");
  });
});

describe("Védett Útvonal: kiindulási hely fogadása", () => {
  test("routeOriginDeepLinkSchema a meglévő koordináta-validációval", () => {
    const ok = routeOriginDeepLinkSchema.safeParse({ originName: "Otthon", originLat: "47.48", originLon: "19.01" });
    assert.ok(ok.success);
    assert.equal(ok.success && ok.data.originLat, 47.48);
    for (const bad of [
      { originName: "Otthon", originLat: "abc", originLon: "19" },
      { originName: "Otthon", originLat: "91", originLon: "19" },
      { originName: " ", originLat: "47", originLon: "19" },
      {},
    ]) assert.equal(routeOriginDeepLinkSchema.safeParse(bad).success, false);
  });
  test("a cél-séma nem fogad origin kulcsokat célként (elkülönített paraméterek)", () => {
    assert.equal(routeDestinationDeepLinkSchema.safeParse({ originName: "a", originLat: "47", originLon: "19" }).success, false);
  });
  test("page.tsx: string-ellenőrzés + safeParse, a Workspace-en át a formig jut", () => {
    const page = read("app/vedett-utvonal/page.tsx");
    assert.match(page, /typeof originName !== "string" \|\| typeof originLat !== "string" \|\| typeof originLon !== "string"/);
    assert.match(page, /routeOriginDeepLinkSchema\.safeParse\(/);
    assert.match(page, /hasLevelAccess \? parseDeepLinkOrigin\(searchParams\) : null/);
    assert.match(page, /initialOrigin=\{initialOrigin\}/);
    const ws = read("components/vedett-utvonal/VedettUtvonalWorkspace.tsx");
    assert.match(ws, /initialOrigin=\{selectedPreset \? null : initialOrigin\}/);
  });
  test("form: initialOrigin MAP_PICKED típussal seedeli a „Honnan?” állapotot, egyébként a régi alapértelmezés", () => {
    const f = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(f, /useState<RouteOrigin>\(\s*initialOrigin\s*\?\s*\{ type: "MAP_PICKED", name: initialOrigin\.name/);
    assert.match(f, /: \{ type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: "" \}/);
  });
});

describe("ScheduleItemForm: saját mentett helyek", () => {
  test("a meglévő saved-places API-t és adaptert használja, cím + koordináta együtt", () => {
    const f = read("components/family/ScheduleItemForm.tsx");
    assert.match(f, /fetch\("\/api\/vedett-route\/saved-places"/);
    assert.match(f, /savedPlaceToRouteLocation\(place\)/);
    assert.match(f, /setText\(loc\.name\.slice\(0, 120\)\);\s*setCoords\(\{ lat: loc\.latitude, lon: loc\.longitude \}\)/);
    assert.equal((f.match(/savedPlaces=\{savedPlaces\}/g) ?? []).length, 2);
    assert.doesNotMatch(f, /console\./);
  });
});
