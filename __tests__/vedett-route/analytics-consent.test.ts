// GA4 consent regressziós tesztek.
//   node --test --experimental-strip-types __tests__/vedett-route/analytics-consent.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const consent: any = await import(pathToFileURL(resolve(ROOT, "lib/analytics/consent.ts")).href);
const analytics: any = await import(pathToFileURL(resolve(ROOT, "lib/vedett-route/analytics.ts")).href);
const ID = "G-T748C867DW";

function mkStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
function mkEnv(cookie = "") {
  const scripts: any[] = [];
  const doc: any = {
    cookieJar: cookie,
    writes: [] as string[],
    head: { appendChild: (s: any) => scripts.push(s) },
    createElement: () => ({}),
    get cookie() { return this.cookieJar; },
    set cookie(v: string) { this.writes.push(v); },
  };
  const win: any = { location: { origin: "https://www.vedettsarok.hu", pathname: "/vedett-utvonal", hostname: "www.vedettsarok.hu" }, navigator: { userAgent: "x" } };
  return { win, doc, scripts, env: { win, doc, measurementId: ID } };
}

describe("consent state + GA loading", () => {
  test("1. unset -> GA script not loaded, no config", () => {
    const e = mkEnv();
    assert.equal(consent.readAnalyticsConsent(mkStorage()), "unset");
    consent.applyAnalyticsConsent("unset", e.env);
    assert.equal(e.scripts.length, 0);
    assert.equal(e.win.dataLayer, undefined);
    assert.equal(e.win.gtag, undefined);
  });
  test("2. denied -> GA script not loaded", () => {
    const e = mkEnv();
    consent.applyAnalyticsConsent("denied", e.env);
    assert.equal(e.scripts.length, 0);
    assert.equal(e.win.dataLayer, undefined);
  });
  test("3. granted -> script loads once, consent signals + config privacy", () => {
    const e = mkEnv();
    consent.applyAnalyticsConsent("granted", e.env);
    consent.applyAnalyticsConsent("granted", e.env);
    assert.equal(e.scripts.length, 1);
    assert.match(e.scripts[0].src, new RegExp(`gtag/js\\?id=${ID}$`));
    const dl = e.win.dataLayer.map((a: any) => Array.from(a));
    assert.deepEqual(dl[0].slice(0, 2), ["consent", "default"]);
    assert.deepEqual(dl[0][2], { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    const cfg = dl.find((a: any) => a[0] === "config");
    assert.equal(cfg[1], ID);
    assert.deepEqual(cfg[2], { page_location: "https://www.vedettsarok.hu/vedett-utvonal", page_referrer: "" });
  });
  test("7. granted -> denied stops sending and clears only GA cookies", () => {
    const e = mkEnv("_ga=1; _ga_T748C867DW=2; sb-access-token=secret; vu_native=1");
    consent.applyAnalyticsConsent("granted", e.env);
    consent.applyAnalyticsConsent("denied", e.env);
    assert.equal(e.win[`ga-disable-${ID}`], true);
    assert.equal(e.win.gtag, undefined);
    const last = e.win.dataLayer.map((a: any) => Array.from(a)).pop();
    assert.deepEqual(last.slice(0, 2), ["consent", "update"]);
    assert.equal(last[2].analytics_storage, "denied");
    const cleared = e.doc.writes.join("\n");
    assert.match(cleared, /_ga=; /);
    assert.match(cleared, /_ga_T748C867DW=; /);
    assert.doesNotMatch(cleared, /sb-access-token|vu_native/);
  });
});

describe("analytics helper is fail-closed", () => {
  function setup(stored?: string) {
    const calls: any[] = [];
    (globalThis as any).window = {
      localStorage: mkStorage(stored ? { "vs-analytics-consent": stored } : {}),
      navigator: { userAgent: "Mozilla/5.0" },
      gtag: (...a: any[]) => calls.push(a),
    };
    return calls;
  }
  test("4. unset -> NO-OP", () => {
    const c = setup();
    analytics.trackVedettRouteEvent("vedett_route_open", { authState: "anonymous" });
    assert.equal(c.length, 0);
  });
  test("5. denied -> NO-OP", () => {
    const c = setup("denied");
    analytics.trackVedettRouteEvent("vedett_route_open", { authState: "anonymous" });
    assert.equal(c.length, 0);
  });
  test("6. granted -> whitelisted event works", () => {
    const c = setup("granted");
    analytics.trackVedettRouteEvent("route_search_success", { authState: "authenticated", result: "success" });
    assert.equal(c.length, 1);
    assert.deepEqual(c[0], ["event", "route_search_success", { platform: "web", auth_state: "authenticated", result: "success" }]);
  });
  test("9. helper still takes no coordinates/address/email/user id", () => {
    const p = analytics.buildEventParams({ platform: "web", authState: "anonymous", latitude: 1, address: "a", email: "e", userId: "u" } as any);
    assert.deepEqual(Object.keys(p).sort(), ["auth_state", "platform"]);
  });
  test("no throw without window / broken storage", () => {
    delete (globalThis as any).window;
    analytics.trackVedettRouteEvent("vedett_route_open", { authState: "anonymous" });
    (globalThis as any).window = { get localStorage() { throw new Error("x"); }, navigator: {} };
    analytics.trackVedettRouteEvent("vedett_route_open", { authState: "anonymous" });
    delete (globalThis as any).window;
  });
});

describe("storage + UI", () => {
  test("8. consent storage holds only granted/denied", () => {
    const st = mkStorage();
    consent.writeAnalyticsConsent("granted", st);
    assert.deepEqual([...st.m.entries()], [["vs-analytics-consent", "granted"]]);
    consent.writeAnalyticsConsent("denied", st);
    assert.deepEqual([...st.m.entries()], [["vs-analytics-consent", "denied"]]);
    assert.equal(consent.readAnalyticsConsent(mkStorage({ "vs-analytics-consent": "a@b.hu" })), "unset");
    assert.equal(consent.ANALYTICS_CONSENT_KEY, "vs-analytics-consent");
    assert.match(read("lib/vedett-route/analytics.ts"), /"vs-analytics-consent"/);
  });
  test("10. UI offers both choices equally, no checkbox, privacy link, settings entry", () => {
    const ui = read("components/analytics/AnalyticsConsent.tsx");
    assert.match(ui, /Analitikai sütik elfogadása/);
    assert.match(ui, /Csak szükséges sütik/);
    assert.match(ui, /href="\/adatkezelesi-tajekoztato"/);
    assert.doesNotMatch(ui, /type="checkbox"|defaultChecked/);
    assert.doesNotMatch(ui, /névtelen/i);
    assert.match(read("components/Footer.tsx"), /AnalyticsSettingsButton/);
    assert.match(read("app/adatkezelesi-tajekoztato/page.tsx"), /AnalyticsSettingsButton/);
  });
  test("layout no longer loads GA unconditionally", () => {
    const layout = strip(read("app/layout.tsx"));
    assert.doesNotMatch(layout, /googletagmanager|gtag\(/);
    assert.match(layout, /AnalyticsConsent measurementId="G-T748C867DW"/);
  });
});
