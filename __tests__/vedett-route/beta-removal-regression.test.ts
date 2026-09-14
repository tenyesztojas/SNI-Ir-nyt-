// VÉDETT ÚTVONAL — "Béta" megjelölés teljes eltávolítása (Round 9,
// "UX-fejlesztés, főoldali kiemelés és a Béta megjelölés eltávolítása" kör,
// C) rész) — SZÉLES, de NEM TÚL SZÉLES regressziós védőháló.
//
// A spec explicit figyelmeztetése: "Ne készíts túl széles olyan tesztet,
// amely technikai forráskódbeli feature flag vagy komment miatt hibázik.
// User-facing renderelt tartalmat ellenőrizz." Ezért ez a teszt a
// forrásból:
//   1) kivágja a // és /* */ kommenteket (a dokumentációs, a régi
//      szöveget/badge-et magyarázó kommentek MARADHATNAK — azok nem
//      jelennek meg a felhasználónak),
//   2) kivágja a "vedett_route_beta" technikai/belső azonosítót (ez a
//      profiles.pilot_access grant-kulcs neve — lásd
//      lib/vedett-route/config.ts VEDETT_ROUTE_BETA_FEATURE_KEY — a spec
//      kifejezetten megengedi, hogy technikai/belső azonosítók
//      megtartsák a "beta" szót, ha valódi technikai szerepük van),
// és a MARADÉK forrásban keres "béta"/"beta"/"BÉTA" előfordulást az öt fő,
// ténylegesen felhasználónak megjelenő Védett Útvonal komponensben.
//
//   node --test __tests__/vedett-route/beta-removal-regression.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

// A "béta" szó minden elvárt alakja (spec szerint): "Béta", "Beta", "BÉTA"
// — kis/nagybetűtől függetlenül "b(é|e)ta".
const BETA_WORD_PATTERN = /b[ée]ta/i;

function stripNonUserFacingContent(src: string): string {
  return src
    // Blokk-kommentek.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Sor-kommentek — de NEM egy "https://"-szerű URL-ben (a "//" előtt
    // NEM állhat ':', különben egy URL-t csonkítanánk le kommentnek nézve).
    .replace(/(?<!:)\/\/.*$/gm, "")
    // Technikai/belső azonosítók — a profiles.pilot_access grant-kulcs
    // neve, a régi (jelenleg NEM aktív) hozzáférési szint literálja, és az
    // őket kezelő függvénynevek (lásd lib/vedett-route/config.ts
    // VEDETT_ROUTE_BETA_FEATURE_KEY/VedettRouteAccessLevel és access.ts
    // hasVedettRouteBetaAccess()/requireVedettRouteBetaAccess()) — a spec
    // explicit engedélyezi a megtartásukat, mert VALÓDI technikai szerepük
    // van, és SOSEM jelennek meg felhasználónak látható szövegként.
    .replace(/vedett_route_beta/g, "")
    .replace(/beta_testers/g, "")
    .replace(/hasVedettRouteBetaAccess/g, "")
    .replace(/requireVedettRouteBetaAccess/g, "")
    .replace(/VEDETT_ROUTE_BETA_FEATURE_KEY/g, "");
}

const USER_FACING_VEDETT_UTVONAL_FILES = [
  ["components/HeaderClient.tsx", "főmenü + mobilmenü"],
  ["components/NavigateButton.tsx", "Védett Hely 'Navigálj oda' dropdown"],
  ["app/vedett-utvonal/page.tsx", "Védett Útvonal oldal hero + státusz-üzenetek"],
  ["app/page.tsx", "főoldali Védett Útvonal kiemelt blokk"],
  ["components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "keresőform"],
] as const;

describe("BÉTA regresszió — a Védett Útvonal fő user-facing komponenseiben nem jelenik meg 'Béta'/'Beta'/'BÉTA'", () => {
  for (const [relPath, description] of USER_FACING_VEDETT_UTVONAL_FILES) {
    test(`${relPath} (${description}) — a kommentektől és a technikai 'vedett_route_beta' azonosítótól megtisztított forrásban NINCS 'béta'/'beta'/'BÉTA' előfordulás`, () => {
      const src = readFileSync(join(ROOT, relPath), "utf-8");
      const cleaned = stripNonUserFacingContent(src);
      const match = cleaned.match(BETA_WORD_PATTERN);
      assert.equal(
        match,
        null,
        `'${relPath}' (${description}) még tartalmaz egy user-facing 'béta' előfordulást a megtisztított forrásban: ${match ? JSON.stringify(match[0]) : ""}`
      );
    });
  }

  test("a stripNonUserFacingContent() helper NEM vág le egy 'https://' URL-t komment-ként (önteszt a hamis pozitívok ellen)", () => {
    const sample = 'const url = "https://example.com/béta";';
    const cleaned = stripNonUserFacingContent(sample);
    // A "https://" utáni rész NEM tűnhet el — ha a helper hibásan
    // kommentnek nézné a "//"-t, az egész sor vége (a "béta" is) eltűnne,
    // és a teszt hamisan "tisztának" látná a forrást.
    assert.match(cleaned, /https:\/\/example\.com\/béta/);
  });

  test("a stripNonUserFacingContent() helper VALÓDI komment-béta szót levág (önteszt)", () => {
    const sample = "// ez egy régi béta komment\nconst x = 1;";
    const cleaned = stripNonUserFacingContent(sample);
    assert.doesNotMatch(cleaned, BETA_WORD_PATTERN);
  });

  test("a stripNonUserFacingContent() helper a 'vedett_route_beta' technikai azonosítót eltávolítja, de egy VALÓDI, körülötte álló user-facing 'béta' szót nem rejtene el (önteszt)", () => {
    const sample = 'const x = "vedett_route_beta"; const label = "Béta";';
    const cleaned = stripNonUserFacingContent(sample);
    assert.match(cleaned, BETA_WORD_PATTERN, "a valódi user-facing 'Béta' szónak MARADNIA kell a technikai azonosító eltávolítása után is");
  });
});
