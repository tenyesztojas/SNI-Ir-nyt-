// VÉDETT ÚTVONAL — navigációs kártyák, ETA-felirat, admin diagnosztika felirat (forrásszint)
//   node --test __tests__/vedett-route/navigation-ui-stabilization.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const block = (marker: string) => {
  const i = form.indexOf(marker);
  assert.ok(i >= 0, marker);
  return form.slice(i, form.indexOf("</div>\n            )}", i));
};

describe("navigációs kártyák nem csúszhatnak az utasításkártya alá", () => {
  for (const id of ["transit-gps-loss-card", "earlier-departure-card"]) {
    test(`${id}: mért pozíció (12 px az utasítás alatt), z-30, görgethető, gombok elérhetők`, () => {
      const b = block(`data-testid="${id}"`);
      assert.match(b, /style=\{liveAlternativeCardLayout\}/);
      assert.match(b, /\bz-30\b/);
      assert.match(b, /overflow-y-auto/);
      assert.doesNotMatch(b, /top-\[4\.25rem\]|pointer-events-none/);
      assert.match(b, /<button/);
    });
  }
  test("az OFF_ROUTE sáv változatlan (az utasítás ilyenkor 11rem-re csúszik alá)", () => {
    assert.match(form, /pointer-events-none absolute left-1\/2 top-\[4\.25rem\] z-20/);
    assert.match(form, /routeProgress\.offRouteStatus === "OFF_ROUTE" \? "top-\[11rem\]" : "top-14"/);
  });
});

describe("ETA-felirat a számítás alapjához igazodik", () => {
  test("menetrendi/realtime, tervezett és GPS-alapú felirat", () => {
    assert.match(form, /navigationEtaResult\.basis === "TRANSIT_SCHEDULE"\s*\?\s*"Menetrend és valós idejű járatadatok alapján"/);
    assert.match(form, /"Az útiterv tervezett érkezése"/);
    assert.match(form, /"GPS-alapú útvonalhaladás becslése"/);
  });
});

describe("admin diagnosztika: aktuális állapot és előzmény külön", () => {
  test("a panel az aktuális ajánlat-állapotot és az előzményt külön mutatja", () => {
    const panel = read("components/vedett-utvonal/JourneyMonitorSimulationPanel.tsx");
    assert.match(panel, /Ajánlat most: \{currentOfferStatus \?\? "—"\}/);
    assert.match(panel, /Utolsó LA-folyamat \(előzmény\):/);
    assert.match(form, /currentOfferStatus=\{liveAlternativeOffer\.status\}/);
  });
});
