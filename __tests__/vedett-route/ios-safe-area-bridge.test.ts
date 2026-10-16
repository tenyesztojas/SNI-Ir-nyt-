// VÉDETT ÚTVONAL — iOS safe-area lekérés: függő natív hívások korlátozása
//   node --test __tests__/vedett-route/ios-safe-area-bridge.test.ts
//
// A getSafeAreaInsets-et nem ismerő iOS-buildekben (<= 10) a Capacitor natív
// oldala nem válaszol, a Promise sosem teljesül. Ellenőrizzük, hogy ilyenkor
// legfeljebb egy natív hívás marad függőben, a v2 nem kapcsol be, és hogy
// böngészőben/Androidon natív hívás egyáltalán nem indul.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNativeSafeAreaLayout } from "../../lib/vedett-route/native/nativeNavigationBridge.ts";

const PENDING = Symbol("pending");
const settledOrPending = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<typeof PENDING>((r) => setTimeout(() => r(PENDING), 20))]);

const VALID = { safe: { top: 59, right: 0, bottom: 34, left: 0 }, adjusted: { top: 59, right: 0, bottom: 0, left: 0 } };

function mockWin(platform: "ios" | "android" | "web", respond: (method: string) => Promise<unknown>) {
  const calls: string[] = [];
  const win = {
    Capacitor: {
      isNativePlatform: () => platform !== "web",
      getPlatform: () => platform,
      nativePromise: (_plugin: string, method: string) => {
        calls.push(method);
        return respond(method);
      },
    },
  };
  return { win, calls };
}

describe("iOS getSafeAreaInsets — visszafelé kompatibilitás", () => {
  test("10-es build (a natív oldal nem válaszol): ismételt lekérésnél is csak EGY natív hívás, és nincs v2", async () => {
    const { win, calls } = mockWin("ios", () => new Promise(() => {}));
    const results = [1, 2, 3, 4, 5].map(() => getNativeSafeAreaLayout(win));
    for (const r of results) assert.equal(await settledOrPending(r), PENDING);
    assert.deepEqual(calls, ["getSafeAreaInsets"]);
  });

  test("régi build UNIMPLEMENTED elutasítással: null (v1), és nincs tartós tiltás", async () => {
    const { win, calls } = mockWin("ios", () => Promise.reject({ code: "UNIMPLEMENTED", message: "not implemented" }));
    assert.equal(await getNativeSafeAreaLayout(win), null);
    assert.equal(await getNativeSafeAreaLayout(win), null);
    assert.equal(calls.length, 2);
  });

  test("11-es build: egyidejű lekérések egy natív hívást osztanak meg; válasz után friss hívás indul (forgatás)", async () => {
    let n = 0;
    const { win, calls } = mockWin("ios", () => {
      n++;
      return Promise.resolve(VALID);
    });
    const [a, b] = await Promise.all([getNativeSafeAreaLayout(win), getNativeSafeAreaLayout(win)]);
    assert.deepEqual(a, VALID);
    assert.equal(a, b);
    assert.equal(n, 1);
    assert.deepEqual(await getNativeSafeAreaLayout(win), VALID);
    assert.deepEqual(calls, ["getSafeAreaInsets", "getSafeAreaInsets"]);
  });

  test("érvénytelen natív válasz: null (v1)", async () => {
    const { win } = mockWin("ios", () => Promise.resolve({ safe: { top: -1, right: 0, bottom: 0, left: 0 }, adjusted: VALID.adjusted }));
    assert.equal(await getNativeSafeAreaLayout(win), null);
  });

  test("Android és böngésző: natív hívás nem indul, eredmény null", async () => {
    for (const platform of ["android", "web"] as const) {
      const { win, calls } = mockWin(platform, () => Promise.resolve(VALID));
      assert.equal(await getNativeSafeAreaLayout(win), null);
      assert.equal(calls.length, 0, platform);
    }
    assert.equal(await getNativeSafeAreaLayout({}), null);
    assert.equal(await getNativeSafeAreaLayout(null), null);
  });

  test("hook: egyszerre legfeljebb egy lekérés, a közben jött eseményt a válasz után pótolja", () => {
    const src = readFileSync("lib/hooks/useIosNavigationLayout.ts", "utf8");
    assert.match(src, /if \(inflight\) \{\s*dirty = true;\s*return;\s*\}/);
    assert.match(src, /if \(dirty\) \{\s*dirty = false;\s*schedule\(\);\s*\}/);
  });
});
