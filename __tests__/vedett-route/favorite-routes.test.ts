// VÉDETT ÚTVONAL — Kedvenc útvonalak (2026-09-09) — regressziós tesztek a
// specifikáció S-AK tesztlistájához.
//
// Ugyanazt a mintát követi, mint a projekt már meglévő vedett-route
// tesztjei: a "use client"/next-server fájlok (route.ts-ek, queries.ts,
// migráció, komponensek) plain `node --test` alatt Next.js bundler nélkül
// nem futtathatók/renderelhetők — ezért forráskód-szintű, strukturális
// regresszió-tesztekkel fedjük le. A KÉT pure, DB/HTTP-mentes függvényt
// (buildDefaultFavoriteName, isSameFavoritePreset) VISZONT valóban
// futásidőben teszteljük: a forrásból dinamikusan kinyerve és kiértékelve
// (ugyanaz a extractFunctionSource-minta, mint
// structured-address-and-sensory-ux.test.ts-ben).
//
//   node --test --experimental-strip-types __tests__/vedett-route/favorite-routes.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// A migráció fájlnevét NEM hardcode-oljuk (2026-09-09, utólagos javítás) —
// a timestamp-prefixet a projekt Supabase migration-version ütközés
// elkerülése miatt bármikor átnevezheti (lásd pl. a "20260909_..." ->
// "20260909210500_..." rename-et, amikor egy MÁSIK 20260909 prefixű
// migráció is létrejött ugyanabban a mappában). A teszt ezért a
// migrációs mappában keresi meg AZT AZ EGY fájlt, amelynek neve
// "_vedett_route_favorites.sql"-re végződik — ez egyszerre:
//   - túléli egy legitim migration-rename-et (nincs hardcode-olt timestamp),
//   - ÉS védi azt az invariánst, hogy pontosan egy favorites migráció
//     létezhet (ha kettő lenne, az saga hiba, amit a teszt jelezni fog).
const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "supabase", "migrations");
const MIGRATION_SUFFIX = "_vedett_route_favorites.sql";
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(MIGRATION_SUFFIX));

describe("KEDVENC ÚTVONALAK — migrációs fájl megtalálása (nem hardcode-olt timestamp)", () => {
  test("pontosan egy Védett Útvonal favorites migráció létezik a supabase/migrations mappában", () => {
    assert.equal(
      migrationFiles.length,
      1,
      `pontosan egy "${MIGRATION_SUFFIX}" végű migrációs fájl várt, talált: ${JSON.stringify(migrationFiles)}`
    );
  });
});

const MIGRATION_PATH = join(MIGRATIONS_DIR, migrationFiles[0] ?? MIGRATION_SUFFIX);
const TYPES_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "favorites", "types.ts");
const SCHEMAS_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "favorites", "schemas.ts");
const QUERIES_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "favorites", "queries.ts");
const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "vedett-route", "favorites", "route.ts");
const ID_ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "vedett-route", "favorites", "[id]", "route.ts");
const PANEL_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "FavoriteRoutesPanel.tsx");
const WORKSPACE_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalWorkspace.tsx");
const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");

const migrationSrc = readFileSync(MIGRATION_PATH, "utf-8");
const typesSrc = readFileSync(TYPES_PATH, "utf-8");
const schemasSrc = readFileSync(SCHEMAS_PATH, "utf-8");
const queriesSrc = readFileSync(QUERIES_PATH, "utf-8");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");
const idRouteSrc = readFileSync(ID_ROUTE_PATH, "utf-8");
const panelSrc = readFileSync(PANEL_PATH, "utf-8");
const workspaceSrc = readFileSync(WORKSPACE_PATH, "utf-8");
const formSrc = readFileSync(FORM_PATH, "utf-8");

// --- ugyanaz az extractFunctionSource-minta, mint
// structured-address-and-sensory-ux.test.ts-ben ---
function extractFunctionSource(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error(`nem található a függvény: ${signature}`);
  if (!signature.endsWith("{")) throw new Error("a signature-nek a törzset nyitó '{' karakterrel kell végződnie");
  const braceStart = start + signature.length - 1;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`nem sikerült megtalálni a függvény végét: ${signature}`);
}

function stripKnownTypeAnnotations(src: string): string {
  return src
    .replace(/\(input: FavoriteRouteCreateInput\)/, "(input)")
    .replace(/\(a: FavoriteRoute, b: FavoriteRouteCreateInput\)/, "(a, b)")
    .replace(/: \(keyof FavoriteRoute\["weights"\]\)\[\]/, "")
    .replace(/\): string \{/, ") {")
    .replace(/\): boolean \{/, ") {");
}

const buildDefaultFavoriteNameSrc = stripKnownTypeAnnotations(
  extractFunctionSource(queriesSrc, "export function buildDefaultFavoriteName(input: FavoriteRouteCreateInput): string {").replace(
    "export function",
    "function"
  )
);
// eslint-disable-next-line no-new-func
const buildDefaultFavoriteName = new Function(`${buildDefaultFavoriteNameSrc}\nreturn buildDefaultFavoriteName;`)();

const isSameFavoritePresetSrc = stripKnownTypeAnnotations(
  extractFunctionSource(queriesSrc, "export function isSameFavoritePreset(a: FavoriteRoute, b: FavoriteRouteCreateInput): boolean {").replace(
    "export function",
    "function"
  )
);
// eslint-disable-next-line no-new-func
const isSameFavoritePreset = new Function(`${isSameFavoritePresetSrc}\nreturn isSameFavoritePreset;`)();

describe("KEDVENC ÚTVONALAK — buildDefaultFavoriteName() (spec 21. pont: 'Ne használj AI-t')", () => {
  test("MANUAL induló + KNOWN_PLACE cél esetén 'utca → helynév' formátumú, determinisztikus javaslatot ad", () => {
    const name = buildDefaultFavoriteName({
      originMode: "MANUAL",
      originManual: { city: "Budapest", districtOrPostalCode: "XIII.", street: "Váci út 1." },
      destinationMode: "KNOWN_PLACE",
      destinationKnownPlace: { name: "Munkahely", latitude: 47.5, longitude: 19.05, placeId: null },
      weights: { transfers: 1, modeSwitches: 1, underground: 1, walking: 1, duration: 1, waiting: 1 },
    });
    assert.equal(name, "Váci út 1. → Munkahely");
  });

  test("CURRENT_LOCATION induló esetén az induló szegmens mindig 'Aktuális helyzetem'", () => {
    const name = buildDefaultFavoriteName({
      originMode: "CURRENT_LOCATION",
      destinationMode: "MANUAL",
      destinationManual: { city: "Budapest", districtOrPostalCode: "V.", street: "Kossuth tér" },
      weights: { transfers: 1, modeSwitches: 1, underground: 1, walking: 1, duration: 1, waiting: 1 },
    });
    assert.equal(name, "Aktuális helyzetem → Kossuth tér");
  });

  test("hívásonként ugyanarra a bemenetre ugyanazt adja (determinisztikus, nem AI-alapú)", () => {
    const input = {
      originMode: "MANUAL",
      originManual: { city: "Budapest", districtOrPostalCode: "XIII.", street: "Váci út 1." },
      destinationMode: "MANUAL",
      destinationManual: { city: "Budapest", districtOrPostalCode: "V.", street: "Kossuth tér" },
      weights: { transfers: 1, modeSwitches: 1, underground: 1, walking: 1, duration: 1, waiting: 1 },
    };
    assert.equal(buildDefaultFavoriteName(input), buildDefaultFavoriteName(input));
  });
});

describe("Z) szenzoros prioritások (0/1/2) megmaradnak — isSameFavoritePreset() súly-összehasonlítás", () => {
  const baseFavorite = {
    id: "f1",
    userId: "u1",
    name: "Otthon → Munkahely",
    originMode: "MANUAL",
    originManual: { city: "Budapest", districtOrPostalCode: "XIII.", street: "Váci út 1." },
    destinationMode: "MANUAL",
    destinationManual: { city: "Budapest", districtOrPostalCode: "V.", street: "Kossuth tér" },
    destinationKnownPlace: null,
    weights: { transfers: 2, modeSwitches: 0, underground: 1, walking: 1, duration: 2, waiting: 0 },
    createdAt: "",
    updatedAt: "",
  } as const;

  test("azonos preset (origin+destination+weights) esetén true-t ad", () => {
    assert.equal(
      isSameFavoritePreset(baseFavorite, {
        originMode: "MANUAL",
        originManual: { city: "Budapest", districtOrPostalCode: "XIII.", street: "Váci út 1." },
        destinationMode: "MANUAL",
        destinationManual: { city: "Budapest", districtOrPostalCode: "V.", street: "Kossuth tér" },
        weights: { transfers: 2, modeSwitches: 0, underground: 1, walking: 1, duration: 2, waiting: 0 },
      }),
      true
    );
  });

  test("egyetlen súly (pl. transfers) eltérése esetén FALSE-t ad — a 0/1/2 pontosan összevetve", () => {
    assert.equal(
      isSameFavoritePreset(baseFavorite, {
        originMode: "MANUAL",
        originManual: { city: "Budapest", districtOrPostalCode: "XIII.", street: "Váci út 1." },
        destinationMode: "MANUAL",
        destinationManual: { city: "Budapest", districtOrPostalCode: "V.", street: "Kossuth tér" },
        weights: { transfers: 1, modeSwitches: 0, underground: 1, walking: 1, duration: 2, waiting: 0 },
      }),
      false
    );
  });

  test("AH) eltérő cím (más útvonal) esetén FALSE-t ad, akkor is ha a súlyok egyeznek", () => {
    assert.equal(
      isSameFavoritePreset(baseFavorite, {
        originMode: "MANUAL",
        originManual: { city: "Debrecen", districtOrPostalCode: "4024", street: "Piac utca 1." },
        destinationMode: "MANUAL",
        destinationManual: { city: "Budapest", districtOrPostalCode: "V.", street: "Kossuth tér" },
        weights: { transfers: 2, modeSwitches: 0, underground: 1, walking: 1, duration: 2, waiting: 0 },
      }),
      false
    );
  });
});

describe("AE) GPS PRIVACY — a séma STRUKTURÁLISAN nem képes pillanatnyi koordinátát tárolni CURRENT_LOCATION esetén", () => {
  test("a migráció NEM definiál origin_latitude/origin_longitude OSZLOPOT (a szó a GPS PRIVACY magyarázó megjegyzésben előfordulhat, de tényleges 'oszlopnév TÍPUS' deklaráció sehol)", () => {
    assert.doesNotMatch(migrationSrc, /^\s*origin_latitude\s+DOUBLE PRECISION/m);
    assert.doesNotMatch(migrationSrc, /^\s*origin_longitude\s+DOUBLE PRECISION/m);
  });

  test("origin_shape CHECK constraint CURRENT_LOCATION esetén minden strukturált cím-mezőt NULL-ra kényszerít", () => {
    assert.match(migrationSrc, /origin_mode = 'CURRENT_LOCATION'\s*\n\s*AND origin_city IS NULL AND origin_district_or_postal_code IS NULL AND origin_street IS NULL/);
  });

  test("a queries.ts createFavoriteRoute() CURRENT_LOCATION esetén sosem küld koordinátát — csak origin_mode kerül mentésre", () => {
    const insertBlock = queriesSrc.slice(queriesSrc.indexOf(".insert({"), queriesSrc.indexOf(".select(\"*\")\n    .single();"));
    assert.doesNotMatch(insertBlock, /origin_latitude/);
    assert.doesNotMatch(insertBlock, /origin_longitude/);
  });
});

describe("AF/AG) CURRENT_LOCATION kedvenc betöltése NEM indít automatikus GPS-kérést", () => {
  test("a form pendingFavoriteOriginLabel state-je CSAK a szándékot jelzi, nem kér le pozíciót automatikusan", () => {
    assert.match(
      formSrc,
      /const \[pendingFavoriteOriginLabel, setPendingFavoriteOriginLabel\] = useState<string \| null>\(/
    );
    assert.match(formSrc, /initialFavoritePreset && initialFavoritePreset\.originMode === "CURRENT_LOCATION" \? "Aktuális helyzetem" : null/);
  });

  test("a pendingFavoriteOriginLabel jelzés mellett explicit 'Aktuális helyzetem' kattintásra utaló szöveg jelenik meg, nem automatikus kérés", () => {
    assert.match(formSrc, /kattints az "Aktuális helyzetem" gombra/);
  });
});

describe("W/X) MANUAL origin/destination strukturáltan mentve — Y) KNOWN_PLACE cél id/label/koordináta megmarad", () => {
  test("a migráció origin_city/origin_district_or_postal_code/origin_street oszlopokat használ (nem egy szabad 'address' stringet)", () => {
    assert.match(migrationSrc, /origin_city TEXT NULL/);
    assert.match(migrationSrc, /origin_district_or_postal_code TEXT NULL/);
    assert.match(migrationSrc, /origin_street TEXT NULL/);
  });

  test("a migráció destination_latitude/destination_longitude/destination_label/destination_place_id oszlopokat tartalmaz a KNOWN_PLACE módhoz", () => {
    assert.match(migrationSrc, /destination_latitude DOUBLE PRECISION NULL/);
    assert.match(migrationSrc, /destination_longitude DOUBLE PRECISION NULL/);
    assert.match(migrationSrc, /destination_label TEXT NULL/);
    assert.match(migrationSrc, /destination_place_id TEXT NULL/);
  });

  test("mapFavoriteRouteRow() a destination_place_id-t (placeId) is megőrzi a KNOWN_PLACE ágon", () => {
    assert.match(typesSrc, /placeId: row\.destination_place_id/);
  });

  test("destination_place_id-nek NINCS FK constraint a places táblára (csak referencia célú, nem geokódol újra)", () => {
    assert.doesNotMatch(migrationSrc, /destination_place_id TEXT NULL REFERENCES/);
  });
});

describe("Z) weights validáció — mind a 6 kulcs kötelező, PONTOSAN 0/1/2", () => {
  test("favoriteWeightsSchema mind a 6 kulcsot a weightValueSchema (0|1|2 literál union) validálja", () => {
    assert.match(schemasSrc, /const weightValueSchema = z\.union\(\[z\.literal\(0\), z\.literal\(1\), z\.literal\(2\)\]\);/);
    for (const key of ["transfers", "modeSwitches", "underground", "walking", "duration", "waiting"]) {
      assert.match(schemasSrc, new RegExp(`${key}: weightValueSchema`));
    }
  });
});

// DB-INTEGRITÁSI HARDENING (2026-09-09, security/data-integrity audit UTÁN)
// — a migrációt MÉG NEM alkalmaztuk Supabase-ben; ezek a tesztek a még nem
// alkalmazott SQL FORRÁSÁT ellenőrzik strukturálisan. A négy hardening
// CHECK constraint valós PostgreSQL 16 ellen (lokális `psql`, stub
// auth.users/auth.uid() séma) tényleges INSERT-ekkel is le lett futtatva
// ennek a körnek a részeként (nem csak szintaktikai ellenőrzés) — minden
// elvárt eset (extra kulcs, hiányzó kulcs, string "1", 0.5, 3, null,
// tömb helyett objektum, üres/whitespace-only MANUAL cím-mezők, KNOWN_PLACE
// üres label, MANUAL melletti destination_place_id, CURRENT_LOCATION
// melletti lingering cím-mező) valóban elutasításra került, és minden
// legitim eset (teljes MANUAL, KNOWN_PLACE place_id NÉLKÜL, CURRENT_LOCATION
// üres cím-mezőkkel) valóban sikeresen beszúrható volt.
describe("DB-szintű weights CHECK — defense-in-depth (nem helyettesíti, nem gyengíti a Zod-ot)", () => {
  test("a weights CHECK megköveteli, hogy jsonb_typeof(weights) = 'object' legyen (tömb/szám/string/bool/null kizárva)", () => {
    assert.match(migrationSrc, /CONSTRAINT vedett_route_favorites_weights_valid CHECK \(\s*\n\s*jsonb_typeof\(weights\) = 'object'/);
  });

  test("mind a 6 kulcs kötelező jelenléte a `?&` ARRAY operátorral van kikényszerítve", () => {
    assert.match(
      migrationSrc,
      /AND weights \?& ARRAY\[\s*\n\s*'transfers',\s*\n\s*'modeSwitches',\s*\n\s*'underground',\s*\n\s*'walking',\s*\n\s*'duration',\s*\n\s*'waiting'\s*\n\s*\]/
    );
  });

  test("extra kulcs kizárva — subquery-mentes jsonb_build_object() egyenlőség-vizsgálat (a CHECK constraint NEM tartalmazhat subselectet PostgreSQL-ben)", () => {
    // Fontos regresszió-védelem: egy `(SELECT count(*) FROM
    // jsonb_object_keys(weights)) = 6`-szerű subselect szintaktikailag
    // helyesnek tűnne, de PostgreSQL-ben "cannot use subquery in check
    // constraint" hibával elbukna éles alkalmazáskor — ez a teszt azt
    // védi, hogy a constraint SOSEM kerüljön vissza egy subquery-alapú
    // formára.
    assert.doesNotMatch(migrationSrc, /CHECK\s*\([\s\S]{0,600}SELECT[\s\S]{0,200}FROM jsonb_object_keys/);
    assert.match(
      migrationSrc,
      /AND weights = jsonb_build_object\(\s*\n\s*'transfers', weights->'transfers',/
    );
  });

  test("minden egyes kulcs értéke szó szerint a '0'/'1'/'2' JSONB szám egyike (mind a 6 kulcsra)", () => {
    for (const key of ["transfers", "modeSwitches", "underground", "walking", "duration", "waiting"]) {
      assert.match(
        migrationSrc,
        new RegExp(`weights->'${key}' IN \\('0'::jsonb, '1'::jsonb, '2'::jsonb\\)`)
      );
    }
  });

  test("az app-oldali Zod validáció (favoriteWeightsSchema) NEM módosult — a DB constraint csak MÁSODIK réteg", () => {
    assert.match(schemasSrc, /const weightValueSchema = z\.union\(\[z\.literal\(0\), z\.literal\(1\), z\.literal\(2\)\]\);/);
  });
});

describe("MANUAL cím-mezők — üres string TILTVA (nem csak IS NOT NULL, hanem trim()-elt nem-üres tartalom)", () => {
  test("MANUAL origin mindhárom mezője NULLIF(trim(...), '') IS NOT NULL formában védett", () => {
    for (const col of ["origin_city", "origin_district_or_postal_code", "origin_street"]) {
      assert.match(migrationSrc, new RegExp(`NULLIF\\(trim\\(${col}\\), ''\\) IS NOT NULL`));
    }
  });

  test("MANUAL destination mindhárom mezője NULLIF(trim(...), '') IS NOT NULL formában védett", () => {
    for (const col of ["destination_city", "destination_district_or_postal_code", "destination_street"]) {
      assert.match(migrationSrc, new RegExp(`NULLIF\\(trim\\(${col}\\), ''\\) IS NOT NULL`));
    }
  });

  test("KNOWN_PLACE destination_label sem lehet üres string", () => {
    assert.match(migrationSrc, /NULLIF\(trim\(destination_label\), ''\) IS NOT NULL/);
  });
});

describe("destination_place_id — mode-védelem (MANUAL mellett NULL, KNOWN_PLACE mellett opcionális)", () => {
  test("MANUAL destination ág explicit megköveteli destination_place_id IS NULL", () => {
    assert.match(
      migrationSrc,
      /destination_mode = 'MANUAL'\s*\n[\s\S]{0,400}AND destination_place_id IS NULL/
    );
  });

  test("KNOWN_PLACE destination ág NEM ír elő semmit destination_place_id-re (opcionális marad — egy deep link name+lat+lon-nal is legitim)", () => {
    const knownPlaceBranchMatch = migrationSrc.match(/destination_mode = 'KNOWN_PLACE'[\s\S]{0,400}?\n\s*\)\s*\n\s*\),/);
    assert.ok(knownPlaceBranchMatch, "meg kell találni a KNOWN_PLACE ágat a destination_shape constraintben");
    assert.doesNotMatch(knownPlaceBranchMatch![0], /destination_place_id/);
  });
});

describe("CURRENT_LOCATION — a GPS privacy invariáns változatlan (audit után is)", () => {
  test("továbbra sincs origin_latitude/origin_longitude OSZLOP a migrációban", () => {
    assert.doesNotMatch(migrationSrc, /^\s*origin_latitude\s+DOUBLE PRECISION/m);
    assert.doesNotMatch(migrationSrc, /^\s*origin_longitude\s+DOUBLE PRECISION/m);
  });

  test("CURRENT_LOCATION esetén az origin_shape constraint továbbra is mindhárom cím-mezőt NULL-ra kényszeríti", () => {
    assert.match(
      migrationSrc,
      /origin_mode = 'CURRENT_LOCATION'\s*\n\s*AND origin_city IS NULL AND origin_district_or_postal_code IS NULL AND origin_street IS NULL/
    );
  });
});

describe("RLS policy-k — auditálás UTÁN is változatlanul auth.uid()-hoz kötöttek, nincs public/shared policy, nincs UNIQUE", () => {
  test("mind a 4 policy (SELECT/INSERT/UPDATE/DELETE) auth.uid()-hoz kötött, DROP POLICY IF EXISTS-szel idempotens", () => {
    for (const policy of ["own_select", "own_insert", "own_update", "own_delete"]) {
      assert.match(migrationSrc, new RegExp(`DROP POLICY IF EXISTS "vedett_route_favorites_${policy}" ON vedett_route_favorites;`));
    }
    assert.match(migrationSrc, /USING \(user_id = auth\.uid\(\)\);/);
    assert.match(migrationSrc, /WITH CHECK \(user_id = auth\.uid\(\)\);/);
  });

  test("nincs globális UNIQUE constraint és nincs public/shared SELECT policy az auditálás után sem", () => {
    assert.doesNotMatch(migrationSrc, /UNIQUE\s*\(/);
    assert.equal((migrationSrc.match(/FOR SELECT/g) ?? []).length, 1);
  });

  test("a trigger function explicit search_path-tal védett, és NEM SECURITY DEFINER (a szó a magyarázó megjegyzésben, a döntést indokolva előfordulhat, de tényleges 'SECURITY DEFINER' függvény-attribútum sehol)", () => {
    assert.match(migrationSrc, /RETURNS TRIGGER\s*\n\s*SET search_path = public, pg_temp/);
    assert.doesNotMatch(migrationSrc, /\)\s*\n(RETURNS[\s\S]{0,200})?SECURITY DEFINER/);
    assert.doesNotMatch(migrationSrc, /^\s*SECURITY DEFINER\s*$/m);
  });
});

describe("AA/AB) kedvenc betöltése visszaállítja az induló/cél presetet és a szenzoros súlyokat", () => {
  test("az origin useState fallback-ágban a preset MANUAL city/districtOrPostalCode/street mezőit veszi át", () => {
    assert.match(
      formSrc,
      /initialFavoritePreset && initialFavoritePreset\.originMode === "MANUAL" && initialFavoritePreset\.originManual/
    );
  });

  test("a weights useState a preset weights mezőjét veszi át (?? a régi, változatlan alapértékre esik vissza)", () => {
    assert.match(formSrc, /useState<PersonalizationWeights>\(\s*\n\s*initialFavoritePreset\?\.weights \?\? \{/);
  });
});

describe("AC/AD) a kedvenc megnyitása NEM tölt vissza elavult journey-t — mindig friss keresést igényel", () => {
  test("VedettUtvonalWorkspace a kedvenc kiválasztásakor egy ÚJ 'key' prop-pal remounttolja a formot (nem imperatív state-frissítéssel)", () => {
    assert.match(workspaceSrc, /key=\{selectedPreset\?\.key \?\? "initial"\}/);
    assert.match(workspaceSrc, /setSelectedPreset\(\(prev\) => \(\{ key: \(prev\?\.key \?\? 0\) \+ 1, preset \}\)\);/);
  });

  test("a form 'result' (kiszámolt journey) state-je a komponens saját, kezdetben null/üres state-je — egy friss mountnál MINDIG üresen indul, nincs presetből visszatöltött journey-mező", () => {
    // A FavoriteRoutePreset típus (queries.ts/types.ts) SEHOL nem tartalmaz
    // journey/result/departAt/realtime mezőt — csak preset-adatokat.
    assert.doesNotMatch(typesSrc, /journey|departAt|realtime|delay/i);
  });

  test("FavoriteRoutesPanel az 'Útvonal megtervezése' gombon a preset-et adja át onSelect-nek, NEM egy konkrét route-eredményt", () => {
    assert.match(panelSrc, /onClick=\{\(\) => onSelect\(toPreset\(favorite\)\)\}/);
  });
});

describe("S) mentés bejelentkezett felhasználónak — a user_id SOSEM kliensből érkezik", () => {
  test("a POST route requireVedettRouteAccess()-t hív ELŐSZÖR, és auth.userId-t ad tovább createFavoriteRoute()-nak (nem a body-ból)", () => {
    assert.match(routeSrc, /const auth = await requireVedettRouteAccess\(\);\s*\n\s*if \(!auth\.ok\) return auth\.response;/);
    assert.match(routeSrc, /createFavoriteRoute\(auth\.userId, parsed\.data\)/);
    assert.doesNotMatch(routeSrc, /user_id: (body|parsed\.data)\./);
  });

  test("createFavoriteRoute() a user_id mezőt kizárólag a hívó (userId) paraméterből tölti, sosem a validált input mezőiből", () => {
    assert.match(queriesSrc, /export async function createFavoriteRoute\(userId: string, input: FavoriteRouteCreateInput\)/);
    assert.match(queriesSrc, /user_id: userId,/);
  });
});

describe("T/U/V) más felhasználó kedvence SOSEM olvasható/módosítható/törölhető — RLS a végső védelmi réteg", () => {
  test("RLS bekapcsolva és mind a 4 policy auth.uid()-hoz kötve (SELECT/INSERT/UPDATE/DELETE)", () => {
    assert.match(migrationSrc, /ALTER TABLE vedett_route_favorites ENABLE ROW LEVEL SECURITY;/);
    assert.match(migrationSrc, /CREATE POLICY "vedett_route_favorites_own_select"\s*\n\s*ON vedett_route_favorites FOR SELECT\s*\n\s*USING \(user_id = auth\.uid\(\)\);/);
    assert.match(migrationSrc, /CREATE POLICY "vedett_route_favorites_own_insert"\s*\n\s*ON vedett_route_favorites FOR INSERT\s*\n\s*WITH CHECK \(user_id = auth\.uid\(\)\);/);
    assert.match(migrationSrc, /CREATE POLICY "vedett_route_favorites_own_update"\s*\n\s*ON vedett_route_favorites FOR UPDATE\s*\n\s*USING \(user_id = auth\.uid\(\)\)\s*\n\s*WITH CHECK \(user_id = auth\.uid\(\)\);/);
    assert.match(migrationSrc, /CREATE POLICY "vedett_route_favorites_own_delete"\s*\n\s*ON vedett_route_favorites FOR DELETE\s*\n\s*USING \(user_id = auth\.uid\(\)\);/);
  });

  test("nincs olyan SELECT policy, ami MÁS felhasználó sorát is engedné olvasni", () => {
    const selectPolicies = (migrationSrc.match(/FOR SELECT/g) ?? []).length;
    assert.equal(selectPolicies, 1, "pontosan egy SELECT policy legyen, a saját-sor policy — nincs megosztás/publikus kedvenc ebben a körben");
  });

  test("renameOwnFavoriteRoute/deleteOwnFavoriteRoute app-kódja NEM ad ki tényleges .eq(\"user_id\", ...) SZŰRÉST a lekérdezés-láncban — a jogosultságot az RLS dönti el (nulla sor = nem található)", () => {
    // A .eq("user_id"-t kereső, ÁLLÍTÓ minta (valódi hívás) sehol nem
    // szerepel — csak a NEGÁLÓ magyarázó megjegyzésben ("Nincs
    // .eq(\"user_id\"..."), amit a második asserttel külön ellenőrzünk.
    assert.doesNotMatch(queriesSrc, /\.update\(patch\)\.eq\("user_id"/);
    assert.doesNotMatch(queriesSrc, /\.update\(\{ name \}\)\s*\n\s*\.eq\("user_id"/);
    assert.doesNotMatch(queriesSrc, /\.delete\(\)\.eq\("user_id"/);
    assert.match(queriesSrc, /\/\/ Nincs \.eq\("user_id", userId\) — SZÁNDÉKOSAN nem az app kód dönti el a/);
    assert.match(queriesSrc, /maybeSingle\(\);\s*\n\s*\n\s*if \(error\) throw new Error\(`Kedvenc útvonal átnevezése sikertelen/);
  });

  test("PATCH/DELETE route 404-et ad, ha a sor nem található/nem a hívóé — NEM 403-at (nem szivárogtatja mások adatának létezését)", () => {
    assert.match(idRouteSrc, /return NextResponse\.json\(\{ ok: false, message: "A kedvenc útvonal nem található\." \}, \{ status: 404 \}\);/);
    assert.doesNotMatch(idRouteSrc, /status: 403/);
  });
});

describe("AH) duplikáció — kulturált válasz, NEM globális UNIQUE constraint", () => {
  test("nincs globális UNIQUE constraint a táblán (a szó csak a döntést magyarázó megjegyzésben fordul elő, tényleges 'UNIQUE (' / 'CREATE UNIQUE INDEX' SQL-konstrukció sehol)", () => {
    assert.doesNotMatch(migrationSrc, /UNIQUE\s*\(/);
    assert.doesNotMatch(migrationSrc, /CREATE UNIQUE INDEX/);
    assert.doesNotMatch(migrationSrc, /CONSTRAINT \w+ UNIQUE/);
  });

  test("a POST route 409-cel és a specifikáció szerinti magyar szöveggel válaszol duplikáció esetén, user-scope-olt ellenőrzéssel", () => {
    assert.match(routeSrc, /message: "Ez az útvonal már a kedvenceid között van\."/);
    assert.match(routeSrc, /status: 409/);
    assert.match(routeSrc, /findDuplicateFavoriteRoute\(parsed\.data\)/);
  });
});

describe("AI/AJ) saját kedvenc törölhető, törlés után eltűnik a listából", () => {
  test("a panel törlés-megerősítés UI-ja a specifikáció szövegével kér megerősítést", () => {
    assert.match(panelSrc, /Biztosan törlöd ezt a kedvenc útvonalat\?/);
  });

  test("sikeres törlés után a favorites state-ből kiszűrődik a törölt elem (nem újra-fetch, azonnali UI-frissítés)", () => {
    assert.match(panelSrc, /setFavorites\(\(prev\) => \(prev \? prev\.filter\(\(f\) => f\.id !== id\) : prev\)\);/);
  });

  test("a DELETE route valódi DELETE-et küld (nincs soft-delete/is_deleted mező bevezetve)", () => {
    assert.match(idRouteSrc, /deleteOwnFavoriteRoute\(id\)/);
    assert.match(queriesSrc, /\.from\("vedett_route_favorites"\)\.delete\(\)\.eq\("id", id\)/);
    assert.doesNotMatch(migrationSrc, /is_deleted|deleted_at/);
  });
});

describe("AK) be nem jelentkezett felhasználó nem érheti el a kedvenc CRUD-ot", () => {
  test("mind a négy handler (GET/POST/PATCH/DELETE) ELSŐ sora a requireVedettRouteAccess() guard", () => {
    for (const src of [routeSrc, idRouteSrc]) {
      const handlerCount = (src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length;
      const guardCount = (src.match(/const auth = await requireVedettRouteAccess\(\);/g) ?? []).length;
      assert.equal(guardCount, handlerCount, "minden exportált handlernek saját requireVedettRouteAccess() hívása van");
    }
  });

  test("nincs külön pilot_access kapu vagy admin-only ellenőrzés a favorites route-okban — ugyanaz a meglévő kapu, mint a többi Védett Útvonal végponton (a 'pilot_access' szó a fejlécben, a döntést magyarázó megjegyzésben előfordulhat, de tényleges hívás/import sehol)", () => {
    assert.doesNotMatch(routeSrc, /requireVedettRouteAdmin\(\)|requireVedettRouteBetaAccess\(\)/);
    assert.doesNotMatch(idRouteSrc, /requireVedettRouteAdmin\(\)|requireVedettRouteBetaAccess\(\)/);
    assert.doesNotMatch(routeSrc, /\.pilot_access|pilotAccess/);
    assert.doesNotMatch(idRouteSrc, /\.pilot_access|pilotAccess/);
  });
});

describe("29. pont — üres állapot szövege", () => {
  test("a panel a specifikáció szerinti üres-állapot szöveget és segédszöveget jeleníti meg", () => {
    assert.match(panelSrc, /Kedvenc útvonalaid itt jelennek majd meg\./);
    assert.match(
      panelSrc,
      /Mentsd el a gyakran használt útvonalaidat, így legközelebb nem kell újra megadnod az indulási és érkezési helyet\./
    );
  });
});

describe("33. pont — scope-határ: NINCS megosztás/publikus/családi kedvenc, NINCS route history/AI-ajánlás ebben a körben", () => {
  test("a panel/queries/migráció sehol nem tartalmaz megosztás, publikus lista vagy AI-ajánlás logikát", () => {
    for (const src of [panelSrc, queriesSrc, migrationSrc, workspaceSrc]) {
      assert.doesNotMatch(src, /shared_with|is_public|family_favorite|ai_recommend/i);
    }
  });
});
