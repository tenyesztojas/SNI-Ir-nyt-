// VédettSarok — Supabase Preview/Production elkülönítési őr tesztjei.
//   node --test --experimental-strip-types __tests__/supabase/env-guard.test.ts
// Valódi kulcs nincs a tesztben: a JWT-k aláíratlan, kitalált minták.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PREVIEW_SUPABASE_REF as TEST,
  PRODUCTION_SUPABASE_REF as PROD,
  assertSupabaseEnv,
  checkSupabaseEnv,
  decodeJwtPayload,
  isTestProject,
  SupabaseEnvError,
  resolveDeployEnv,
  type SupabaseEnvInput,
} from "../../lib/supabase/envGuard.ts";

const read = (p: string) => readFileSync(p, "utf8");
const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: object) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(payload)}.sig`;
const anonFor = (ref: string) => jwt({ iss: "supabase", ref, role: "anon" });
const serviceFor = (ref: string) => jwt({ iss: "supabase", ref, role: "service_role" });

const goodPreview = (o: Partial<SupabaseEnvInput> = {}): SupabaseEnvInput => ({
  signals: ["preview"],
  url: `https://${TEST}.supabase.co`,
  anonKey: anonFor(TEST),
  projectRef: TEST,
  serviceRoleKey: serviceFor(TEST),
  ...o,
});
const problems = (i: SupabaseEnvInput) => {
  const r = checkSupabaseEnv(i);
  return r.ok ? [] : r.problems;
};

describe("környezet felismerése", () => {
  test("a platform jelzése (VERCEL_ENV) elsőbbséget élvez", () => {
    assert.equal(resolveDeployEnv(["production", undefined, "preview"]), "production");
    assert.equal(resolveDeployEnv([undefined, undefined, "preview"]), "preview");
    assert.equal(resolveDeployEnv([undefined, "preview"]), "preview");
    assert.equal(resolveDeployEnv(["  Preview "]), "preview");
    assert.equal(resolveDeployEnv(["valami", undefined]), "unknown");
    assert.equal(resolveDeployEnv([]), "unknown");
  });

  test("production / development / ismeretlen: az őr nem ellenőriz (változatlan viselkedés)", () => {
    for (const s of [["production"], ["development"], []]) {
      const r = checkSupabaseEnv({ signals: s, url: `https://${PROD}.supabase.co`, anonKey: anonFor(PROD) });
      assert.equal(r.ok, true);
    }
  });
});

describe("Preview: csak a teszt-projekt", () => {
  test("helyes Preview-konfiguráció elfogadva (JWT és új formátumú kulcs is)", () => {
    assert.deepEqual(problems(goodPreview()), []);
    assert.deepEqual(problems(goodPreview({ anonKey: "sb_publishable_xxxxxxxx", serviceRoleKey: "sb_secret_yyyyyyyy" })), []);
    assert.deepEqual(problems(goodPreview({ projectRef: undefined, serviceRoleKey: undefined })), []);
  });

  test("production URL → leállás", () => {
    const p = problems(goodPreview({ url: `https://${PROD}.supabase.co` }));
    assert.ok(p.includes("preview_production_ref"));
    assert.ok(p.includes("preview_url_not_test_project"));
  });

  test("hiányzó / érvénytelen / idegen URL → leállás (nincs visszaesés)", () => {
    assert.deepEqual(problems(goodPreview({ url: undefined })), ["preview_url_missing"]);
    assert.deepEqual(problems(goodPreview({ url: "   " })), ["preview_url_missing"]);
    assert.deepEqual(problems(goodPreview({ url: "nem url" })), ["preview_url_invalid"]);
    assert.deepEqual(problems(goodPreview({ url: `http://${TEST}.supabase.co` })), ["preview_url_invalid"]);
    assert.deepEqual(problems(goodPreview({ url: "https://masik.supabase.co" })), ["preview_url_not_test_project"]);
    assert.deepEqual(problems(goodPreview({ url: `https://${TEST}.supabase.co.evil.example` })), ["preview_url_not_test_project"]);
  });

  test("anon kulcs: hiányzik, production, vagy titkos kulcs → leállás", () => {
    assert.deepEqual(problems(goodPreview({ anonKey: undefined })), ["preview_anon_key_missing"]);
    assert.deepEqual(problems(goodPreview({ anonKey: anonFor(PROD) })), ["preview_anon_key_wrong_project"]);
    assert.ok(problems(goodPreview({ anonKey: serviceFor(TEST) })).includes("preview_anon_key_secret"));
    assert.deepEqual(problems(goodPreview({ anonKey: "sb_secret_zzzz" })), ["preview_anon_key_secret"]);
  });

  test("projekt-ref eltérés → leállás", () => {
    assert.ok(problems(goodPreview({ projectRef: PROD })).includes("preview_project_ref_mismatch"));
    assert.ok(problems(goodPreview({ projectRef: PROD })).includes("preview_production_ref"));
  });

  test("service_role: production kulcs vagy rossz szerep → leállás; admin kliensnél kötelező", () => {
    assert.deepEqual(problems(goodPreview({ serviceRoleKey: serviceFor(PROD) })), ["preview_service_role_wrong_project"]);
    assert.deepEqual(problems(goodPreview({ serviceRoleKey: anonFor(TEST) })), ["preview_service_role_wrong_project"]);
    assert.deepEqual(problems(goodPreview({ serviceRoleKey: undefined, requireServiceRole: true })), ["preview_service_role_missing"]);
    assert.deepEqual(problems(goodPreview({ serviceRoleKey: undefined, requireServiceRole: false })), []);
  });

  test("JWT dekódolás: nem JWT → null, hibás base64 → null", () => {
    assert.equal(decodeJwtPayload("sb_publishable_x"), null);
    assert.equal(decodeJwtPayload("a.%%%.c"), null);
    assert.deepEqual(decodeJwtPayload(anonFor(TEST)), { iss: "supabase", ref: TEST, role: "anon" });
  });

  test("hibaszöveg nem tartalmaz titkot (csak kódokat ad vissza)", () => {
    const r = checkSupabaseEnv(goodPreview({ url: `https://${PROD}.supabase.co`, anonKey: anonFor(PROD), serviceRoleKey: serviceFor(PROD) }));
    assert.equal(r.ok, false);
    const text = JSON.stringify(r);
    assert.doesNotMatch(text, /eyJ|sb_secret|sb_publishable/);
  });
});

describe("futásidejű őr (process.env)", () => {
  test("Preview + production URL: assertSupabaseEnv kivételt dob; productionben nem", () => {
    const keys = ["VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV", "VEDETT_DEPLOY_ENV", "NEXT_PUBLIC_VEDETT_DEPLOY_ENV",
      "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROD}.supabase.co`;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonFor(PROD);
      process.env.VERCEL_ENV = "production";
      assert.doesNotThrow(() => assertSupabaseEnv({ withServiceRole: true }));
      process.env.VERCEL_ENV = "preview";
      assert.throws(() => assertSupabaseEnv(), SupabaseEnvError);
      delete process.env.VERCEL_ENV;
      process.env.VEDETT_DEPLOY_ENV = "preview";
      assert.throws(() => assertSupabaseEnv(), SupabaseEnvError);
      process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${TEST}.supabase.co`;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonFor(TEST);
      assert.doesNotThrow(() => assertSupabaseEnv());
      assert.throws(() => assertSupabaseEnv({ withServiceRole: true }), SupabaseEnvError);
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceFor(TEST);
      assert.doesNotThrow(() => assertSupabaseEnv({ withServiceRole: true }));
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe("bekötés (forráskód)", () => {
  test("mindhárom kliensgyár és a middleware az őrt hívja, mielőtt klienst hozna létre", () => {
    const server = read("lib/supabase/server.ts");
    assert.ok(server.indexOf("assertSupabaseEnv();") < server.indexOf("createServerClient(supabaseUrl"));
    const client = read("lib/supabase/client.ts");
    assert.ok(client.indexOf("assertSupabaseEnv();") < client.indexOf("return createBrowserClient("));
    const admin = read("lib/supabase/admin.ts");
    assert.ok(admin.indexOf("assertSupabaseEnv({ withServiceRole: true });") < admin.indexOf("return createClient("));
    const mw = read("middleware.ts");
    const guard = mw.indexOf("checkSupabaseEnv(readSupabaseEnv())");
    assert.ok(guard > 0 && guard < mw.indexOf("rateLimiter.check(") && guard < mw.indexOf("createServerClient(supabaseUrl"));
    assert.match(mw, /status: 503/);
  });

  test("a service_role kulcs nem NEXT_PUBLIC_ és nem kerül hibaüzenetbe", () => {
    const g = read("lib/supabase/envGuard.ts");
    assert.doesNotMatch(g, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_[A-Z_]*SECRET/);
    assert.match(g, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    const mw = read("middleware.ts");
    assert.match(mw, /supabaseEnv\.problems\.join\(","\)/);
  });

  test("a NEXT_PUBLIC_ változókra szó szerint hivatkozik (kliens buildbe beégethető)", () => {
    const g = read("lib/supabase/envGuard.ts");
    for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PROJECT_REF", "NEXT_PUBLIC_VERCEL_ENV", "NEXT_PUBLIC_VEDETT_DEPLOY_ENV"]) {
      assert.match(g, new RegExp(`process\\.env\\.${v}\\b`));
    }
  });
});

describe("önálló teszt Vercel-projekt (vedettsarok-family-test)", () => {
  const SITE = "https://vedettsarok-family-test.vercel.app";
  const goodTest = (o: Partial<SupabaseEnvInput> = {}): SupabaseEnvInput => ({
    signals: ["production"],
    testSignals: ["test", "test"],
    projectProductionUrls: ["vedettsarok-family-test.vercel.app"],
    url: `https://${TEST}.supabase.co`,
    anonKey: anonFor(TEST),
    projectRef: TEST,
    serviceRoleKey: serviceFor(TEST),
    siteUrl: SITE,
    appUrl: SITE,
    ...o,
  });
  const res = (i: SupabaseEnvInput) => checkSupabaseEnv(i);

  test("tesztmód felismerése: explicit „test” VAGY a Vercel-projekt production URL-je", () => {
    assert.equal(isTestProject({ testSignals: ["test"] }), true);
    assert.equal(isTestProject({ testSignals: [undefined, " TEST "] }), true);
    assert.equal(isTestProject({ projectProductionUrls: ["vedettsarok-family-test.vercel.app"] }), true);
    assert.equal(isTestProject({ projectProductionUrls: ["https://vedettsarok-family-test-holva.vercel.app"] }), true);
    assert.equal(isTestProject({ projectProductionUrls: ["sni-iranytu.vercel.app", "vedettsarok.hu"] }), false);
    assert.equal(isTestProject({ testSignals: ["preview", "production"] }), false);
    assert.equal(isTestProject({}), false);
  });

  test("a teszt-projekt PRODUCTION deploymentje is ellenőrzött (a VERCEL_ENV nem dönt)", () => {
    assert.deepEqual(res(goodTest()), { ok: true, env: "test" });
    for (const signals of [["production"], ["preview"], ["development"], []]) {
      const r = res(goodTest({ signals, url: `https://${PROD}.supabase.co` }));
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.env, "test");
    }
    // csak a platform-jelzés (explicit változó nélkül) is elég a tesztmódhoz
    const r2 = res(goodTest({ testSignals: [], url: `https://${PROD}.supabase.co` }));
    assert.equal(r2.ok, false);
  });

  test("production Supabase elutasítva (URL, anon, service_role, ref)", () => {
    const p = problems(goodTest({ url: `https://${PROD}.supabase.co`, anonKey: anonFor(PROD), serviceRoleKey: serviceFor(PROD), projectRef: PROD }));
    for (const code of ["preview_production_ref", "preview_url_not_test_project", "preview_anon_key_wrong_project", "preview_service_role_wrong_project", "preview_project_ref_mismatch"]) {
      assert.ok(p.includes(code as never), code);
    }
  });

  test("hiányzó tesztkulcsok és -azonosító elutasítva", () => {
    assert.ok(problems(goodTest({ anonKey: undefined })).includes("preview_anon_key_missing"));
    assert.ok(problems(goodTest({ url: undefined })).includes("preview_url_missing"));
    assert.deepEqual(problems(goodTest({ projectRef: undefined })), ["test_project_ref_missing"]);
    assert.deepEqual(problems(goodTest({ serviceRoleKey: undefined, requireServiceRole: true })), ["preview_service_role_missing"]);
  });

  test("NEXT_PUBLIC_SITE_URL: kötelező, https, nem az éles domain (nincs vedettsarok.hu-visszaesés)", () => {
    assert.deepEqual(problems(goodTest({ siteUrl: undefined })), ["test_site_url_missing"]);
    assert.deepEqual(problems(goodTest({ siteUrl: "http://vedettsarok-family-test.vercel.app" })), ["test_site_url_invalid"]);
    assert.deepEqual(problems(goodTest({ siteUrl: "nem url" })), ["test_site_url_invalid"]);
    for (const prod of ["https://vedettsarok.hu", "https://www.vedettsarok.hu/", "https://sni-iranytu.vercel.app"]) {
      assert.deepEqual(problems(goodTest({ siteUrl: prod })), ["test_site_url_production"], prod);
    }
  });

  test("a korábbi Preview-védelem és az éles projekt viselkedése változatlan", () => {
    // éles sni-iranytu production: nincs tesztjelzés → nem ellenőriz
    assert.deepEqual(checkSupabaseEnv({ signals: ["production"], projectProductionUrls: ["vedettsarok.hu"], url: `https://${PROD}.supabase.co`, anonKey: anonFor(PROD) }), { ok: true, env: "production" });
    // sni-iranytu Preview: a régi szabályok (site URL itt nem kötelező)
    assert.deepEqual(checkSupabaseEnv({ signals: ["preview"], url: `https://${TEST}.supabase.co`, anonKey: anonFor(TEST) }), { ok: true, env: "preview" });
    const r = checkSupabaseEnv({ signals: ["preview"], url: `https://${PROD}.supabase.co`, anonKey: anonFor(TEST) });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.env, "preview");
  });

  test("futásidő: VERCEL_ENV=production + VEDETT_DEPLOY_ENV=test + production URL → kivétel", () => {
    const keys = ["VERCEL_ENV", "NEXT_PUBLIC_VERCEL_ENV", "VEDETT_DEPLOY_ENV", "NEXT_PUBLIC_VEDETT_DEPLOY_ENV", "VERCEL_PROJECT_PRODUCTION_URL",
      "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PROJECT_REF",
      "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      process.env.VERCEL_ENV = "production";
      process.env.VEDETT_DEPLOY_ENV = "test";
      process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROD}.supabase.co`;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonFor(PROD);
      assert.throws(() => assertSupabaseEnv(), SupabaseEnvError);
      process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${TEST}.supabase.co`;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonFor(TEST);
      process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF = TEST;
      assert.throws(() => assertSupabaseEnv(), SupabaseEnvError); // site URL hiányzik
      process.env.NEXT_PUBLIC_SITE_URL = "https://vedettsarok-family-test.vercel.app";
      assert.throws(() => assertSupabaseEnv(), SupabaseEnvError); // app URL hiányzik
      process.env.NEXT_PUBLIC_APP_URL = "https://vedettsarok-family-test.vercel.app";
      assert.doesNotThrow(() => assertSupabaseEnv());
      assert.throws(() => assertSupabaseEnv({ withServiceRole: true }), SupabaseEnvError);
      process.env.SUPABASE_SERVICE_ROLE_KEY = serviceFor(TEST);
      assert.doesNotThrow(() => assertSupabaseEnv({ withServiceRole: true }));
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  test("a guard a tesztjelzőkre szó szerint hivatkozik (kliens buildbe is beég)", () => {
    const g = read("lib/supabase/envGuard.ts");
    for (const v of ["VEDETT_DEPLOY_ENV", "NEXT_PUBLIC_VEDETT_DEPLOY_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL"]) {
      assert.match(g, new RegExp(`process\\.env\\.${v}\\b`));
    }
  });
});

describe("90. lépés: új kulcsformátumok és teszt-URL-ek", () => {
  const SITE = "https://vedettsarok-family-test.vercel.app";
  const base = (o: Partial<SupabaseEnvInput> = {}): SupabaseEnvInput => ({
    signals: ["production"],
    testSignals: ["test", "test"],
    url: `https://${TEST}.supabase.co`,
    anonKey: "sb_publishable_TESZTminta",
    projectRef: TEST,
    serviceRoleKey: "sb_secret_TESZTminta",
    siteUrl: SITE,
    appUrl: SITE,
    ...o,
  });

  test("sb_publishable_ + sb_secret_ a teszt-URL-lel: elfogadva (a cél-projektet az URL dönti el)", () => {
    assert.deepEqual(checkSupabaseEnv(base()), { ok: true, env: "test" });
    assert.deepEqual(checkSupabaseEnv(base({ requireServiceRole: true })), { ok: true, env: "test" });
  });

  test("új formátumú kulcs éles URL-lel: elutasítva", () => {
    const p = problems(base({ url: `https://${PROD}.supabase.co` }));
    assert.ok(p.includes("preview_production_ref") && p.includes("preview_url_not_test_project"));
  });

  test("típuskeverés: titkos kulcs anonként, publishable kulcs service_role-ként elutasítva", () => {
    assert.deepEqual(problems(base({ anonKey: "sb_secret_TESZTminta" })), ["preview_anon_key_secret"]);
    assert.deepEqual(problems(base({ serviceRoleKey: "sb_publishable_TESZTminta" })), ["preview_service_role_wrong_project"]);
    // a régi Preview-szabály is szűri
    assert.deepEqual(problems({ signals: ["preview"], url: `https://${TEST}.supabase.co`, anonKey: "sb_publishable_x", serviceRoleKey: "sb_publishable_y" }), ["preview_service_role_wrong_project"]);
  });

  test("NEXT_PUBLIC_APP_URL: kötelező, https, nem éles domain (tesztmódban)", () => {
    assert.deepEqual(problems(base({ appUrl: undefined })), ["test_app_url_missing"]);
    assert.deepEqual(problems(base({ appUrl: "http://x.example" })), ["test_app_url_invalid"]);
    assert.deepEqual(problems(base({ appUrl: "https://vedettsarok.hu" })), ["test_app_url_production"]);
    assert.deepEqual(problems(base({ siteUrl: undefined, appUrl: undefined })), ["test_site_url_missing", "test_app_url_missing"]);
  });

  test("az éles sni-iranytu Preview-ban az app URL továbbra sem kötelező (változatlan)", () => {
    assert.deepEqual(checkSupabaseEnv({ signals: ["preview"], url: `https://${TEST}.supabase.co`, anonKey: anonFor(TEST) }), { ok: true, env: "preview" });
  });
});
