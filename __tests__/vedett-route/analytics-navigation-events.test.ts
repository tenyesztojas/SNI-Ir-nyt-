// VÉDETT ÚTVONAL — GA4 oldalcím-adatvédelem + navigációs események (2026-10-09)
//   node --test __tests__/vedett-route/analytics-navigation-events.test.ts

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyAnalyticsConsent,
  buildSanitizedPageFields,
  sendSanitizedPageView,
} from "../../lib/analytics/consent.ts";
import {
  ALLOWED_EVENT_PARAMS,
  VEDETT_ROUTE_EVENTS,
  buildEventParams,
  createNavigationEventOnceGate,
  hasRouteStructureChanged,
  isAnalyticsSuppressedPath,
  markNavigationEventOnce,
  toRankBucket,
  trackVedettRouteEvent,
} from "../../lib/vedett-route/analytics.ts";

const read = (p: string) => readFileSync(p, "utf8");
const formSrc = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const DEEP = { origin: "https://www.vedettsarok.hu", pathname: "/vedett-utvonal", search: "?name=Kedvenc%20K%C3%A1v%C3%A9z%C3%B3&lat=47.49&lon=19.05", hash: "#x", href: "https://www.vedettsarok.hu/vedett-utvonal?name=Kedvenc&lat=47.49&lon=19.05#x" };

function storage(consent?: string) {
  const m = new Map<string, string>(consent ? [["vs-analytics-consent", consent]] : []);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("1) GA4 oldalcím-adatvédelem", () => {
  test("csak domain + útvonal; query, fragment, helynév, koordináta nem; page_title fix, referrer üres", () => {
    const f = buildSanitizedPageFields(DEEP);
    assert.deepEqual(f, { page_location: "https://www.vedettsarok.hu/vedett-utvonal", page_referrer: "", page_title: "VédettSarok" });
    assert.doesNotMatch(JSON.stringify(f), /\?|#|lat=|lon=|47\.49|19\.05|Kedvenc/);
    assert.equal(buildSanitizedPageFields({ origin: "https://x.hu", pathname: "/a?b=1#c" }).page_location, "https://x.hu/a");
    assert.equal(buildSanitizedPageFields(null).page_location, "/");
  });

  test("granted: config ELŐTT `set` rögzíti a sanitizált mezőket (a bővített mérés automatikus eseményeire is)", () => {
    const win: any = { location: DEEP };
    const doc: any = { head: { appendChild() {} }, createElement: () => ({}), cookie: "" };
    applyAnalyticsConsent("granted", { win, doc, measurementId: "G-TEST" });
    const dl = win.dataLayer.map((a: any) => Array.from(a));
    const setIdx = dl.findIndex((a: any) => a[0] === "set");
    const cfgIdx = dl.findIndex((a: any) => a[0] === "config");
    assert.ok(setIdx >= 0 && setIdx < cfgIdx);
    for (const entry of [dl[setIdx][1], dl[cfgIdx][2]]) {
      assert.equal(entry.page_location, "https://www.vedettsarok.hu/vedett-utvonal");
      assert.equal(entry.page_referrer, "");
      assert.equal(entry.page_title, "VédettSarok");
    }
    assert.doesNotMatch(JSON.stringify(dl), /lat=|lon=|Kedvenc|47\.49/);
  });

  test("kliensoldali oldalváltás: sanitizált set + page_view; hozzájárulás nélkül NO-OP", () => {
    const calls: unknown[][] = [];
    const win: any = { location: DEEP, gtag: (...a: unknown[]) => calls.push(a) };
    assert.equal(sendSanitizedPageView(win, storage()), false);
    assert.equal(sendSanitizedPageView(win, storage("denied")), false);
    assert.equal(calls.length, 0);
    assert.equal(sendSanitizedPageView(win, storage("granted")), true);
    assert.deepEqual(calls.map((c) => c[0] === "event" ? c.slice(0, 2) : c.slice(0, 1)), [["set"], ["event", "page_view"]]);
    assert.doesNotMatch(JSON.stringify(calls), /lat=|lon=|Kedvenc|\?|#/);
  });

  test("AnalyticsConsent: útvonal-váltáskor (nem az első renderkor) küld sanitizált page_view-t", () => {
    const ui = read("components/analytics/AnalyticsConsent.tsx");
    assert.match(ui, /const pathname = usePathname\(\);/);
    assert.match(ui, /if \(lastPathnameRef\.current === null\) \{\s*\n\s*lastPathnameRef\.current = pathname;\s*\n\s*return;/);
    assert.match(ui, /sendSanitizedPageView\(window\);/);
    assert.doesNotMatch(read("lib/analytics/consent.ts"), /location\.(search|hash|href)/);
  });
});

describe("2) új események, zárt paraméterek", () => {
  test("az új események a whitelistben; a régiek megmaradtak", () => {
    for (const e of ["route_selected", "navigation_completed", "navigation_resumed", "navigation_rerouted", "navigation_error", "route_search", "navigation_started", "navigation_finished"]) {
      assert.ok((VEDETT_ROUTE_EVENTS as readonly string[]).includes(e), e);
    }
    assert.deepEqual([...ALLOWED_EVENT_PARAMS], ["platform", "auth_state", "result", "rank_bucket", "reroute_type", "error_type"]);
  });

  test("buildEventParams: csak zárt értékek; ismeretlen érték és tiltott mező kiesik", () => {
    assert.deepEqual(buildEventParams({ platform: "android", authState: "anonymous", rerouteType: "automatic" }), {
      platform: "android", auth_state: "anonymous", reroute_type: "automatic",
    });
    const p = buildEventParams({
      platform: "web", authState: "anonymous",
      rerouteType: "Deák tér" as never, errorType: "TypeError: x at 47.4,19.0" as never, rankBucket: "17" as never,
      latitude: 47.5, address: "Fő utca 1", placeName: "Kávézó", query: "otthon", tripId: "t1", userId: "u", message: "boom",
    } as never);
    assert.deepEqual(Object.keys(p).sort(), ["auth_state", "platform"]);
  });

  test("toRankBucket", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 9, -1, NaN].map(toRankBucket), ["1", "2", "3", "4", "5+", "5+", "5+", "5+"]);
  });

  test("navigation_finished (leállítás) és navigation_completed (érkezés) külön kiváltási pont", () => {
    const stop = formSrc.match(/const stopNavigation = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(stop, /"navigation_finished"/);
    assert.doesNotMatch(stop, /navigation_completed/);
    assert.match(formSrc, /if \(navigationInstructionForDisplay\?\.kind !== "ARRIVE"\) return;\s*\n\s*if \(!markNavigationEventOnce\(navigationAnalyticsGateRef\.current, "completed"\)\) return;\s*\n\s*trackVedettRouteEvent\("navigation_completed"/);
    assert.match(formSrc, /if \(!navigationMode \|\| !gpsFixUsable\) return;\s*\n\s*if \(navigationInstructionForDisplay\?\.kind !== "ARRIVE"\)/);
  });

  test("route_selected csak kinyitáskor; navigation_resumed a 'Folytatom' után", () => {
    assert.match(formSrc, /if \(openIndex !== i\) \{\s*\n\s*trackVedettRouteEvent\("route_selected", \{[\s\S]{0,120}rankBucket: toRankBucket\(i\)/);
    const accept = formSrc.match(/const handleAcceptNavigationResume = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(accept, /setResumedNavigationSession\(fresh\);\s*\n\s*trackVedettRouteEvent\("navigation_resumed"/);
  });
});

describe("3) újratervezés: csak sikeres, tényleges útvonalváltás", () => {
  test("automatikus: csak a sikeres (data.ok) ágon; hibán navigation_error", () => {
    assert.match(formSrc, /if \(data\.ok\) \{\s*\n\s*setDisplayedJourney\(data\.journey\);\s*\n\s*trackNavigationRerouted\("automatic"\);/);
    assert.equal((formSrc.match(/trackNavigationErrorOnce\("reroute_failed"\);/g) ?? []).length, 2);
  });

  test("élő alternatíva és korábbi indulás: az útvonal tényleges cseréje után", () => {
    assert.match(formSrc, /setDisplayedJourney\(accepted\.acceptedJourney\);\s*\n\s*bumpNavigationSession\(\);\s*\n\s*trackNavigationRerouted\("live_alternative"\);/);
    assert.match(formSrc, /setDisplayedJourney\(stored\.journey\);\s*\n\s*bumpNavigationSession\(\);\s*\n\s*trackNavigationRerouted\("earlier_departure"\);/);
  });

  test("pihenő utáni folytatás: csak megváltozott útvonal-szerkezetnél", () => {
    assert.match(formSrc, /if \(hasRouteStructureChanged\(displayedJourney, nextJourney\)\) trackNavigationRerouted\("rest_stop"\);/);
    const t = (line: string, from = "A") => ({ mode: "TRANSIT", routeShortName: line, fromName: from, toName: "B" });
    const w = (from: string) => ({ mode: "WALK", fromName: from, toName: "A" });
    assert.equal(hasRouteStructureChanged({ legs: [w("Otthon"), t("M2")] }, { legs: [w("Aktuális helyzet"), t("M2")] }), false);
    assert.equal(hasRouteStructureChanged({ legs: [t("M2")] }, { legs: [t("4")] }), true);
    assert.equal(hasRouteStructureChanged({ legs: [t("M2")] }, { legs: [t("M2", "C")] }), true);
    assert.equal(hasRouteStructureChanged(null, { legs: [] }), false);
  });
});

describe("4) duplikációvédelem", () => {
  test("egyszeri kapu: első true, utána false; új kapu (új navigáció) újra enged", () => {
    const g = createNavigationEventOnceGate();
    assert.equal(markNavigationEventOnce(g, "completed"), true);
    assert.equal(markNavigationEventOnce(g, "completed"), false); // GPS-ingadozás
    assert.equal(markNavigationEventOnce(g, "error:gps_unavailable"), true);
    assert.equal(markNavigationEventOnce(createNavigationEventOnceGate(), "completed"), true);
  });

  test("a visszaállítás nem küld navigation_started-et, csak új kaput nyit", () => {
    const restore = formSrc.match(/const restorePersistedNavigation = \(persisted: PersistedNavigationSession\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.doesNotMatch(restore, /trackVedettRouteEvent\(|"navigation_started"/);
    assert.match(restore, /navigationAnalyticsGateRef\.current = createNavigationEventOnceGate\(\);/);
    assert.equal((formSrc.match(/"navigation_started"/g) ?? []).length, 1);
    const start = formSrc.match(/const startNavigation = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    assert.match(start, /"navigation_started"[\s\S]*navigationAnalyticsGateRef\.current = createNavigationEventOnceGate\(\);/);
  });

  test("hibák: zárt típus, munkamenetenként egyszer, nyers üzenet nélkül", () => {
    assert.match(formSrc, /const trackNavigationErrorOnce = \(errorType: AnalyticsNavigationErrorType\) => \{\s*\n\s*if \(!markNavigationEventOnce\(navigationAnalyticsGateRef\.current, `error:\$\{errorType\}`\)\) return;/);
    assert.match(formSrc, /if \(geo\.status === "denied"\) trackNavigationErrorOnce\("gps_permission_denied"\);/);
    assert.match(formSrc, /trackNavigationErrorOnce\("speech_failed"\);/);
    assert.doesNotMatch(formSrc, /trackVedettRouteEvent\([^)]*(errorMessage|lastErrorMessage|message)/);
  });
});

describe("5) admin diagnosztika és szimuláció kizárása", () => {
  const original = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  test("isAnalyticsSuppressedPath", () => {
    assert.equal(isAnalyticsSuppressedPath("/admin/vedett-utvonal"), true);
    assert.equal(isAnalyticsSuppressedPath("/admin"), true);
    assert.equal(isAnalyticsSuppressedPath("/vedett-utvonal"), false);
    assert.equal(isAnalyticsSuppressedPath("/administrator-nem-admin"), false);
  });

  test("/admin útvonalon hozzájárulás mellett sem megy ki Védett Útvonal esemény; felhasználói oldalon igen", () => {
    const calls: unknown[][] = [];
    const mk = (pathname: string) => ({
      localStorage: storage("granted"),
      navigator: { userAgent: "Mozilla/5.0 VedettUtvonalNative/0.1 Android" },
      location: { pathname },
      gtag: (...a: unknown[]) => calls.push(a),
    });
    (globalThis as { window?: unknown }).window = mk("/admin/vedett-utvonal");
    trackVedettRouteEvent("navigation_rerouted", { authState: "authenticated", rerouteType: "automatic" });
    assert.equal(calls.length, 0);
    (globalThis as { window?: unknown }).window = mk("/vedett-utvonal");
    trackVedettRouteEvent("navigation_rerouted", { authState: "authenticated", rerouteType: "automatic" });
    assert.deepEqual(calls, [["event", "navigation_rerouted", { platform: "android", auth_state: "authenticated", reroute_type: "automatic" }]]);
  });
});

describe("6) adatkezelési tájékoztató", () => {
  test("az új eseménykategóriák és a domain+útvonal szabály szerepel", () => {
    const t = read("app/adatkezelesi-tajekoztato/page.tsx");
    assert.match(t, /célhoz érkezés felismerése, egy korábbi navigáció folytatása, az útvonal újratervezése/);
    assert.match(t, /csak a webcím domainjét és útvonalát kapja meg/);
    assert.match(t, /helynevet, keresési szöveget, járat- vagy útvonalazonosítót/);
  });
});
