// VÉDETT ÚTVONAL — Mentett helyek v1. Pure függvények/sémák futásidőben,
// a DB/RLS/route/UI réteg strukturális (forráskód-szintű) ellenőrzéssel —
// élő Supabase itt nincs, az RLS tényleges viselkedését a migráció
// szövege alapján ellenőrizzük.
//
//   node --test --experimental-strip-types __tests__/vedett-route/saved-places.test.ts

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s--.*$/gm, "");

const migrationFile = readdirSync(join(ROOT, "supabase/migrations")).find((f) => f.endsWith("_saved_places.sql"))!;
const SQL = stripComments(read(`supabase/migrations/${migrationFile}`));

let schemas: any;
let adapt: any;
const TMP = join(ROOT, ".tmp-saved-places-test");

before(async () => {
  mkdirSync(TMP, { recursive: true });
  const rest = read("lib/rest-points/schemas.ts");
  writeFileSync(join(TMP, "rest.ts"), rest);
  const sch = read("lib/vedett-route/savedPlaces/schemas.ts").replace('"@/lib/rest-points/schemas"', '"./rest.ts"');
  writeFileSync(join(TMP, "schemas.ts"), sch);
  schemas = await import(pathToFileURL(join(TMP, "schemas.ts")).href);
  adapt = await import(pathToFileURL(resolve(ROOT, "lib/vedett-route/savedPlaces/adapt.ts")).href);
});
after(() => rmSync(TMP, { recursive: true, force: true }));

const valid = { displayName: "Otthon", address: "Budapest, Fő utca 1.", latitude: 47.5, longitude: 19.04 };

describe("saved places — validation", () => {
  test("valid input accepted", () => assert.ok(schemas.savedPlaceCreateSchema.safeParse(valid).success));
  test("arbitrary custom names work (not an enum)", () => {
    for (const n of ["Nagyi", "Edzés", "Orvos", "Apa", "Kedvenc bolt", "Otthon", "Munkahely", "Iskola"]) {
      assert.ok(schemas.savedPlaceCreateSchema.safeParse({ ...valid, displayName: n }).success, n);
    }
  });
  test("invalid coordinates rejected", () => {
    for (const bad of [{ latitude: 91 }, { latitude: -91 }, { longitude: 181 }, { longitude: -181 }, { latitude: NaN }, { latitude: "47" }]) {
      assert.equal(schemas.savedPlaceCreateSchema.safeParse({ ...valid, ...bad }).success, false);
    }
  });
  test("empty / too long name and address rejected", () => {
    assert.equal(schemas.savedPlaceCreateSchema.safeParse({ ...valid, displayName: "  " }).success, false);
    assert.equal(schemas.savedPlaceCreateSchema.safeParse({ ...valid, displayName: "x".repeat(61) }).success, false);
    assert.equal(schemas.savedPlaceCreateSchema.safeParse({ ...valid, address: "" }).success, false);
    assert.equal(schemas.savedPlaceCreateSchema.safeParse({ ...valid, address: "x".repeat(301) }).success, false);
  });
  test("client cannot inject user_id / extra fields", () => {
    assert.equal(schemas.savedPlaceCreateSchema.safeParse({ ...valid, user_id: "x" }).success, false);
  });
  test("rename schema", () => {
    assert.ok(schemas.savedPlaceRenameSchema.safeParse({ displayName: "Nagyi" }).success);
    assert.equal(schemas.savedPlaceRenameSchema.safeParse({ displayName: "" }).success, false);
  });
  test("limit constant is 20", () => assert.equal(schemas.SAVED_PLACES_LIMIT, 20));
});

describe("saved places — planner adapter", () => {
  const place = { address: "Budapest, Fő utca 1.", latitude: 47.5, longitude: 19.04 };
  test("uses stored coordinates as MAP_PICKED (no re-geocoding), for origin and destination alike", () => {
    const loc = adapt.savedPlaceToRouteLocation(place);
    assert.deepEqual(loc, { type: "MAP_PICKED", name: place.address, latitude: 47.5, longitude: 19.04 });
  });
  test("only resolved locations are savable", () => {
    assert.deepEqual(adapt.routeLocationToSavable({ type: "MAP_PICKED", name: "A", latitude: 1, longitude: 2 }), { address: "A", latitude: 1, longitude: 2 });
    assert.deepEqual(adapt.routeLocationToSavable({ type: "KNOWN_PLACE", name: "B", latitude: 1, longitude: 2 }), { address: "B", latitude: 1, longitude: 2 });
    assert.equal(adapt.routeLocationToSavable({ type: "MANUAL" }), null);
    assert.equal(adapt.routeLocationToSavable({ type: "CURRENT_LOCATION" }), null);
    assert.equal(adapt.routeLocationToSavable(null), null);
  });
});

describe("saved places — migration / RLS / limit (static)", () => {
  test("table, constraints, FK", () => {
    assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.saved_places/);
    assert.match(SQL, /user_id\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    assert.match(SQL, /latitude BETWEEN -90 AND 90/);
    assert.match(SQL, /longitude BETWEEN -180 AND 180/);
  });
  test("RLS enabled with four own-row policies for authenticated only", () => {
    assert.match(SQL, /ENABLE ROW LEVEL SECURITY/);
    for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.match(SQL, new RegExp(`FOR ${op} TO authenticated`));
    }
    assert.equal((SQL.match(/user_id = auth\.uid\(\)/g) ?? []).length >= 5, true);
    assert.doesNotMatch(SQL, /TO anon|TO public|USING \(true\)/i);
  });
  test("anonymous has zero access", () => assert.match(SQL, /REVOKE ALL ON public\.saved_places FROM anon/));
  test("20-place limit enforced in the database", () => {
    assert.match(SQL, /BEFORE INSERT ON public\.saved_places/);
    assert.match(SQL, /pg_advisory_xact_lock/);
    assert.match(SQL, />= 20/);
    assert.match(SQL, /saved_places_limit_reached/);
  });
});

describe("saved places — API (static)", () => {
  const list = stripComments(read("app/api/vedett-route/saved-places/route.ts"));
  const item = stripComments(read("app/api/vedett-route/saved-places/[id]/route.ts"));
  const queries = stripComments(read("lib/vedett-route/savedPlaces/queries.ts"));
  test("every handler requires an authenticated session (anonymous gets 401 via gate)", () => {
    assert.equal((list.match(/requireVedettRouteAccess\(\)/g) ?? []).length, 2);
    assert.equal((item.match(/requireVedettRouteAccess\(\)/g) ?? []).length, 2);
    assert.doesNotMatch(list + item, /requireVedettRoutePublicRead/);
  });
  test("handlers cover list/create/rename/delete", () => {
    assert.match(list, /export async function GET/);
    assert.match(list, /export async function POST/);
    assert.match(item, /export async function PATCH/);
    assert.match(item, /export async function DELETE/);
  });
  test("user-session client only; no service role; owner comes from the session", () => {
    assert.doesNotMatch(queries + list + item, /createAdminClient|service_role|SERVICE_ROLE/);
    assert.match(queries, /@\/lib\/supabase\/server/);
    assert.match(list, /createSavedPlace\(auth\.userId/);
    assert.doesNotMatch(list, /body\.user_?id|parsed\.data\.user_?id/);
  });
  test("other user's / unknown row => 404; limit => 409", () => {
    assert.match(item, /status: 404/);
    assert.match(list, /status: 409/);
  });
  test("no address/coordinate logging", () => {
    assert.doesNotMatch(queries + list + item, /console\./);
  });
});

describe("saved places — UI wiring (static)", () => {
  const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
  const panel = stripComments(read("components/vedett-utvonal/SavedPlacesPanel.tsx"));
  const page = read("app/vedett-utvonal/page.tsx");
  test("panel is wired into the existing planner state for origin and destination", () => {
    assert.match(form, /<SavedPlacesPanel/);
    assert.match(form, /onUseAsOrigin=\{\(p\) => \{[\s\S]*?setOrigin\(savedPlaceToRouteLocation\(p\)\);/);
    assert.match(form, /onUseAsDestination=\{\(p\) => \{[\s\S]*?setDestination\(savedPlaceToRouteLocation\(p\)\);/);
  });
  test("anonymous sees a CTA, not a management UI; no localStorage", () => {
    assert.match(panel, /if \(!isAuthenticated\)[\s\S]*?\/belepes\?next=/);
    assert.doesNotMatch(panel, /localStorage|sessionStorage/);
  });
  test("delete needs confirmation; touch targets >= 44px; suggestions only fill the input", () => {
    assert.match(panel, /Biztosan törlöd\?/);
    assert.match(panel, /min-h-\[44px\]/);
    assert.match(panel, /onClick=\{\(\) => setNewName\(s\)\}/);
  });
  test("explanatory copy mentions saved places", () => assert.match(page, /mentett helyeket/));
  test("anonymous basic routing remains public (saved places never gate planning)", () => {
    assert.match(form, /isAuthenticated\?: boolean/);
    assert.match(panel, /if \(!isAuthenticated\) \{\s*return/);
    assert.doesNotMatch(read("lib/vedett-route/searchRequestBuilder.ts"), /savedPlace|saved_places/i);
  });
});
