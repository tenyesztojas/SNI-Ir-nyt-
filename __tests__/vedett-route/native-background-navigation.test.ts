// VÉDETT ÚTVONAL — Android háttérnavigációs MVP (webes oldal + natív forrás-szerződés)
//   node --test __tests__/vedett-route/native-background-navigation.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildNativeAlertPlan } from "../../lib/vedett-route/navigation/nativeAlertPlan.ts";
import {
  getNativeNavigationState,
  startNativeNavigation,
  stopNativeNavigation,
  updateNativeNavigationPlan,
} from "../../lib/vedett-route/native/nativeNavigationBridge.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

const read = (p: string) => readFileSync(p, "utf8");
const NATIVE = "vedett-utvonal-native/android/app/src/main/";
const journey = {
  departureTime: "2026-10-10T10:00:00Z",
  arrivalTime: "2026-10-10T10:40:00Z",
  fingerprint: "fp",
  legs: [
    { mode: "WALK", fromName: "Otthon", toName: "Deák tér", durationMinutes: 5 },
    {
      mode: "TRANSIT", routeShortName: "M2", fromName: "Deák tér", toName: "Astoria", durationMinutes: 3,
      toLat: 47.4935, toLon: 19.0605, scheduledArrivalTime: "2026-10-10T10:10:00Z",
      intermediateStops: [{ name: "X", lat: 47.4950, lon: 19.0580 }, { name: "Y" }],
    },
    { mode: "TRANSIT", routeShortName: "7", fromName: "Astoria", toName: "Blaha", durationMinutes: 4, toLat: 47.4965, toLon: 19.07, arrivalTime: "2026-10-10T10:20:00Z" },
    { mode: "TRANSIT", routeShortName: "9", fromName: "Blaha", toName: "Nincs koordináta", durationMinutes: 4 },
    { mode: "WALK", fromName: "Blaha", toName: "Cél", durationMinutes: 5, toLat: 47.5, toLon: 19.08 },
  ],
} as unknown as Journey;

describe("figyelmeztetési terv (minimális, sorrendhelyes)", () => {
  test("csak közösségi közlekedési leszállások, sorrendben, koordinátával, előző megállóval és tervezett érkezéssel", () => {
    const plan = buildNativeAlertPlan(journey, 0);
    assert.equal(plan.version, 1);
    assert.deepEqual(plan.targets.map((t) => t.stopName), ["Astoria", "Blaha"]);
    assert.deepEqual([plan.targets[0].prevLat, plan.targets[0].prevLon], [47.495, 19.058]);
    assert.equal(plan.targets[0].scheduledArrivalMs, Date.parse("2026-10-10T10:10:00Z"));
    assert.equal(plan.targets[1].prevLat, undefined);
    assert.equal(plan.targets[1].scheduledArrivalMs, Date.parse("2026-10-10T10:20:00Z"));
  });

  test("az aktív szakasz előtti leszállások kimaradnak; az azonosító stabil (újratervezésnél nem riaszt újra)", () => {
    assert.deepEqual(buildNativeAlertPlan(journey, 2).targets.map((t) => t.stopName), ["Blaha"]);
    assert.equal(buildNativeAlertPlan(journey, 0).targets[1].id, buildNativeAlertPlan(journey, 2).targets[0].id);
  });

  test("a terv nem tartalmaz felhasználói pozíciót, útvonal-geometriát vagy azonosítót", () => {
    const keys = new Set(buildNativeAlertPlan(journey).targets.flatMap((t) => Object.keys(t)));
    assert.deepEqual([...keys].sort(), ["id", "lat", "lon", "prevLat", "prevLon", "scheduledArrivalMs", "stopName"]);
  });
});

describe("híd: fail-open (böngésző, iOS, régi app plugin nélkül)", () => {
  test("nincs Capacitor / nem natív: minden hívás false/null, kivétel nélkül", async () => {
    const plan = buildNativeAlertPlan(journey);
    assert.equal(await startNativeNavigation(plan, {}), false);
    assert.equal(await startNativeNavigation(plan, { Capacitor: { isNativePlatform: () => false, nativePromise: async () => ({}) } }), false);
    assert.equal(await getNativeNavigationState({}), null);
  });

  test("plugin hiányzik (régi app) / engedély hiányzik: a hiba elnyelve, false", async () => {
    const win = { Capacitor: { isNativePlatform: () => true, nativePromise: async () => { throw new Error("not implemented"); } } };
    assert.equal(await startNativeNavigation(buildNativeAlertPlan(journey), win), false);
    assert.equal(await stopNativeNavigation(win), false);
  });

  test("natív plugin elérhető: a megfelelő metódusok, a terv a `plan` mezőben", async () => {
    const calls: unknown[][] = [];
    const win = { Capacitor: { isNativePlatform: () => true, nativePromise: async (...a: unknown[]) => { calls.push(a); return a[1] === "getState" ? { active: false, stoppedByUser: true } : undefined; } } };
    const plan = buildNativeAlertPlan(journey);
    assert.equal(await startNativeNavigation(plan, win), true);
    assert.equal(await updateNativeNavigationPlan(plan, win), true);
    assert.deepEqual(await getNativeNavigationState(win), { active: false, stoppedByUser: true });
    assert.equal(await stopNativeNavigation(win), true);
    assert.deepEqual(calls.map((c) => [c[0], c[1]]), [["VedettNavigation", "start"], ["VedettNavigation", "updatePlan"], ["VedettNavigation", "getState"], ["VedettNavigation", "stop"]]);
    assert.deepEqual((calls[0][2] as { plan: unknown }).plan, plan);
  });
});

describe("webes bekötés: egy állapot, csak kifejezett indításra", () => {
  const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
  const effect = form.slice(form.indexOf("const geoHasFix = geo.latitude !== null;"), form.indexOf("}, [navigationMode, displayedJourney, geoHasFix, nativePlanFromLegIndex]);"));

  test("indítás csak navigationMode alatt és helyengedély (első fix) után; leállításkor stop", () => {
    assert.match(effect, /if \(!navigationMode\) \{\s*\n\s*nativeStartBudgetUsedRef\.current = false;\s*\n\s*if \(nativeNavigationStartedRef\.current\) \{\s*\n\s*nativeNavigationStartedRef\.current = false;\s*\n\s*void stopNativeNavigation\(\);/);
    assert.match(effect, /if \(!geoHasFix\) return;/);
    // 2026-10-10: ellenőrzött (getState) indítás, korlátozott újrapróbával.
    assert.match(effect, /ensureNativeNavigationStarted\(plan,/);
    assert.match(effect, /updateNativeNavigationPlan\(plan\)/);
    assert.match(form, /useEffect\(\s*\n\s*\(\) => \(\) => \{\s*\n\s*if \(nativeNavigationStartedRef\.current\) void stopNativeNavigation\(\);/);
  });

  test("értesítésből leállítva -> a webes navigáció is a meglévő stopNavigation()-nal áll le", () => {
    assert.match(form, /if \(state\?\.stoppedByUser && navigationModeRef\.current && nativeNavigationStartedRef\.current\) \{\s*\n\s*stopNavigationRef\.current\?\.\(\);/);
  });

  test("helyadat nem kerül analitikába a natív ágon", () => {
    assert.doesNotMatch(read("lib/vedett-route/native/nativeNavigationBridge.ts"), /trackVedettRouteEvent|gtag/);
    assert.doesNotMatch(effect, /trackVedettRouteEvent/);
  });
});

describe("natív forrás-szerződés (Android)", () => {
  const manifest = read(NATIVE + "AndroidManifest.xml");
  const service = read(NATIVE + "java/hu/vedettsarok/utvonal/navigation/NavigationLocationService.java");
  const plugin = read(NATIVE + "java/hu/vedettsarok/utvonal/navigation/VedettNavigationPlugin.java");

  test("location típusú FGS, szükséges jogosultságok, háttérbeli hely NINCS", () => {
    assert.match(manifest, /android:name="\.navigation\.NavigationLocationService"[\s\S]{0,120}android:foregroundServiceType="location"/);
    for (const p of ["FOREGROUND_SERVICE", "FOREGROUND_SERVICE_LOCATION", "POST_NOTIFICATIONS", "ACCESS_FINE_LOCATION"]) {
      assert.match(manifest, new RegExp(`android\\.permission\\.${p}"`), p);
    }
    assert.doesNotMatch(manifest.replace(/<!--[\s\S]*?-->/g, ""), /ACCESS_BACKGROUND_LOCATION/);
  });

  test("service: Leállítás művelet, nem sticky, 6 órás plafon, app-bezáráskor leáll, helyadatot nem küld", () => {
    assert.match(service, /addAction\(0, "Leállítás", stopPi\)/);
    assert.match(service, /return START_NOT_STICKY;/);
    assert.match(service, /MAX_SESSION_MS = 6L \* 60 \* 60 \* 1000/);
    assert.match(service, /public void onTaskRemoved/);
    assert.match(service, /FOREGROUND_SERVICE_TYPE_LOCATION/);
    assert.doesNotMatch(service, /HttpURLConnection|OkHttp|URL\(|analytics/i);
  });

  test("plugin: helyengedély nélkül nem indul; regisztrálva a MainActivity-ben", () => {
    assert.match(plugin, /call\.reject\("LOCATION_PERMISSION_MISSING"\)/);
    assert.match(plugin, /@CapacitorPlugin\(name = "VedettNavigation"\)/);
    assert.match(read(NATIVE + "java/hu/vedettsarok/utvonal/MainActivity.java"), /registerPlugin\(VedettNavigationPlugin\.class\);\s*\n\s*super\.onCreate/);
  });
});

describe("2026-10-10 célzott javítások", () => {
  const leg = (over: Record<string, unknown>) => ({ mode: "TRANSIT", fromName: "A", toName: "B", durationMinutes: 5, toLat: 47.5, toLon: 19.0, ...over });
  const j = (legs: unknown[]) => ({ departureTime: "x", arrivalTime: "y", legs }) as unknown as Journey;

  test("realtime érkezésiidő-változás nem ad új azonosítót (nincs dupla riasztás)", () => {
    const a = buildNativeAlertPlan(j([leg({ tripId: "t1", arrivalTime: "2026-10-10T10:00:00Z" })])).targets[0].id;
    const b = buildNativeAlertPlan(j([leg({ tripId: "t1", arrivalTime: "2026-10-10T10:07:00Z" })])).targets[0].id;
    assert.equal(a, b);
  });

  test("különböző szakaszok (más járat / más felszállás) nem olvadnak össze", () => {
    const ids = buildNativeAlertPlan(j([
      leg({ tripId: "t1" }),
      leg({ tripId: "t2" }),
      leg({ routeShortName: "7", fromName: "A" }),
      leg({ routeShortName: "7", fromName: "C" }),
    ])).targets.map((t) => t.id);
    assert.equal(new Set(ids).size, 4);
  });

  test("az aktív szakasz előrelépése frissíti a tervet; null vagy visszalépés nem", () => {
    const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(form, /if \(typeof activeLegIndex === "number" && activeLegIndex > nativePlanLegRef\.current\.index\)/);
    assert.match(form, /buildNativeAlertPlan\(displayedJourney, nativePlanFromLegIndex\)/);
    assert.match(form, /\}, \[navigationMode, displayedJourney, geoHasFix, nativePlanFromLegIndex\]\);/);
  });

  test("setPlan nem nullázza a GPS-kiesési időzítést", () => {
    const eng = read("vedett-utvonal-native/android/app/src/main/java/hu/vedettsarok/utvonal/navigation/AlertEngine.java");
    const setPlan = eng.slice(eng.indexOf("public synchronized void setPlan"), eng.indexOf("public synchronized Set<String> firedIds"));
    assert.doesNotMatch(setPlan, /lastUsableFixMs\s*=|startedAtMs\s*=/);
  });
});
