// VÉDETT ÚTVONAL — GPS watch életciklus (újracsatolás) + ellenőrzött natív indítás + debug-napló adatvédelem
//   node --test __tests__/vedett-route/gps-native-start-lifecycle.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensureNativeNavigationStarted } from "../../lib/vedett-route/native/nativeNavigationBridge.ts";
import { sanitizeNavDebugDetails } from "../../lib/vedett-route/navigation/navDebugLog.ts";

const read = (p: string) => readFileSync(p, "utf8");
const plan = { version: 1 as const, targets: [] };
const noSleep = async () => {};

function bridge(handler: (method: string) => unknown) {
  const calls: string[] = [];
  return {
    calls,
    win: {
      Capacitor: {
        isNativePlatform: () => true,
        nativePromise: async (_p: string, method: string) => {
          calls.push(method);
          const r = handler(method);
          if (r instanceof Error) throw r;
          return r;
        },
      },
    },
  };
}

describe("useGeolocation: a watch azonosító unmountkor nullázódik (újracsatolás után újraindítható)", () => {
  const src = read("lib/hooks/useGeolocation.ts");
  test("a cleanup clearWatch után watchIdRef.current = null", () => {
    const cleanup = src.slice(src.indexOf("return () => {"), src.indexOf("}, []);", src.indexOf("return () => {")));
    assert.match(cleanup, /navigator\.geolocation\.clearWatch\(watchIdRef\.current\);/);
    assert.match(cleanup, /watchIdRef\.current = null;/);
  });
  test("a frissességi védelem (maximumAge/timeout) változatlan", () => {
    assert.match(src, /enableHighAccuracy: true,\s*\n\s*timeout: 10_000,\s*\n\s*maximumAge: 5_000,/);
  });
  test("diagnosztika: indulás/megszűnés/fix-tény/hibakód — koordináta nélkül", () => {
    assert.match(src, /navDebugLog\("gps_watch_started"\)/);
    assert.match(src, /navDebugLog\("gps_watch_cleared", \{ reason: "unmount" \}\)/);
    assert.match(src, /navDebugLog\("gps_fix_received", \{ count: fixCountRef\.current \}\)/);
    assert.match(src, /navDebugLog\("gps_error", \{ code: err\?\.code \?\? null \}\)/);
    assert.doesNotMatch(src, /navDebugLog\([^)]*(latitude|longitude)/);
  });
});

describe("ellenőrzött natív indítás", () => {
  test("pluginhívás + tényleges getState().active=true -> started", async () => {
    const b = bridge((m) => (m === "getState" ? { active: true } : {}));
    assert.equal(await ensureNativeNavigationStarted(plan, { win: b.win, sleep: noSleep }), "started");
    assert.deepEqual(b.calls, ["start", "getState"]);
  });

  test("a pluginhívás sikere önmagában nem elég: inaktív szolgáltatás -> legfeljebb 3 próba, majd failed", async () => {
    const b = bridge((m) => (m === "getState" ? { active: false } : {}));
    assert.equal(await ensureNativeNavigationStarted(plan, { win: b.win, sleep: noSleep }), "failed");
    assert.deepEqual(b.calls, ["start", "getState", "start", "getState", "start", "getState"]);
  });

  test("második próbára elinduló szolgáltatás -> started", async () => {
    let n = 0;
    const b = bridge((m) => (m === "getState" ? { active: ++n >= 2 } : {}));
    assert.equal(await ensureNativeNavigationStarted(plan, { win: b.win, sleep: noSleep }), "started");
  });

  test("régi app (plugin nincs implementálva) / böngésző: azonnal unavailable, nincs újrapróba", async () => {
    const b = bridge(() => Object.assign(new Error("VedettNavigation plugin is not implemented on android"), { code: "UNIMPLEMENTED" }));
    assert.equal(await ensureNativeNavigationStarted(plan, { win: b.win, sleep: noSleep }), "unavailable");
    assert.deepEqual(b.calls, ["start"]);
    assert.equal(await ensureNativeNavigationStarted(plan, { win: {}, sleep: noSleep }), "unavailable");
  });

  test("elutasított indítás (pl. LOCATION_PERMISSION_MISSING) -> korlátozott újrapróba, nem végtelen", async () => {
    const b = bridge(() => new Error("LOCATION_PERMISSION_MISSING"));
    assert.equal(await ensureNativeNavigationStarted(plan, { win: b.win, sleep: noSleep }), "failed");
    assert.deepEqual(b.calls, ["start", "start", "start"]);
  });

  test("navigáció közben leállítva -> cancelled, nincs további hívás", async () => {
    let live = true;
    const b = bridge((m) => { if (m === "start") live = false; return {}; });
    assert.equal(await ensureNativeNavigationStarted(plan, { win: b.win, sleep: noSleep, shouldContinue: () => live }), "cancelled");
    assert.deepEqual(b.calls, ["start"]);
  });
});

describe("form bekötés: navigációnként egy indítási kör, újracsatoláskor visszaállított állapot", () => {
  const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
  test("ensureNativeNavigationStarted + keret + navigationMode-hoz kötött shouldContinue", () => {
    assert.match(form, /if \(nativeStartBudgetUsedRef\.current\) return;\s*\n\s*nativeStartBudgetUsedRef\.current = true;/);
    assert.match(form, /ensureNativeNavigationStarted\(plan, \{ shouldContinue: \(\) => navigationModeLiveRef\.current \}\)/);
    assert.match(form, /if \(result !== "started"\) nativeNavigationStartedRef\.current = false;/);
  });
  test("unmount: natív stop + refek nullázása (StrictMode/remount után újraindítható)", () => {
    assert.match(form, /if \(nativeNavigationStartedRef\.current\) void stopNativeNavigation\(\);\s*\n[\s\S]{0,120}nativeNavigationStartedRef\.current = false;\s*\n\s*nativeStartBudgetUsedRef\.current = false;/);
  });
});

describe("debug-napló adatvédelem", () => {
  test("koordináta-jellegű kulcsok és összetett értékek kiesnek", () => {
    assert.deepEqual(
      sanitizeNavDebugDetails({ count: 3, latitude: 47.5, lon: 19, accuracyMeters: 5, position: "x", reason: "stop", obj: {} as never }),
      { count: 3, reason: "stop" },
    );
  });
  test("natív szolgáltatás: debug napló csak debuggable buildben, koordináta nélkül; indítási hiba nem omlik össze", () => {
    const svc = read("vedett-utvonal-native/android/app/src/main/java/hu/vedettsarok/utvonal/navigation/NavigationLocationService.java");
    assert.match(svc, /FLAG_DEBUGGABLE\) != 0\) Log\.d\("VedettNav"/);
    assert.doesNotMatch(svc, /debug\([^;]*get(Latitude|Longitude)/);
    assert.match(svc, /catch \(RuntimeException e\) \{[\s\S]{0,400}startForeground FAILED[\s\S]{0,120}return START_NOT_STICKY;/);
  });
});
