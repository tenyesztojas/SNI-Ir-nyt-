// Védett Útvonal — STARTUP PERFORMANCE (2026-10-03): lazy MapLibre, betöltő héj,
// natív splash. Statikus forrás-regressziós tesztek.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
// kommentek nélkül (a magyarázó kommentek szavai ne adjanak téves találatot)
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const ws = read("components/vedett-utvonal/VedettUtvonalWorkspace.tsx");
const layout = read("app/layout.tsx");
const loading = read("app/vedett-utvonal/loading.tsx");
const nativeCfg = read("vedett-utvonal-native/capacitor.config.ts");
const nativePkg = read("vedett-utvonal-native/package.json");
const styles = read("vedett-utvonal-native/android/app/src/main/res/values/styles.xml");

describe("MapLibre nem része az induló chunknak", () => {
  test("a workspace dynamic({ssr:false})-szel tölti a térképet, nincs statikus import", () => {
    assert.doesNotMatch(ws, /^import VedettUtvonalMap from/m);
    assert.match(ws, /const VedettUtvonalMap = dynamic\(\(\) => import\("\.\/VedettUtvonalMap"\), \{ ssr: false \}\)/);
    assert.match(ws, /import dynamic from "next\/dynamic"/);
    assert.doesNotMatch(code(ws), /maplibre-gl/);
  });
  test("a workspace a térképet továbbra is ugyanúgy használja (autós ág)", () => {
    assert.match(ws, /<VedettUtvonalMap\s+legs=\{\[\]\}\s+carRouteGeometry=\{selectedCarRoute\.geometry\}/);
  });
  test("a térkép komponens érintetlen", () => {
    assert.match(read("components/vedett-utvonal/VedettUtvonalMap.tsx"), /import maplibregl from "maplibre-gl"/);
  });
});

describe("loading.tsx héj", () => {
  test("könnyű: saját logó, 'Védett Útvonal' + 'Betöltés…'", () => {
    assert.match(loading, /Védett Útvonal/);
    assert.match(loading, /Betöltés…/);
    assert.match(loading, /\/vedett-utvonal-logo-icon\.png/);
    assert.ok(existsSync("public/vedett-utvonal-logo-icon.png"));
  });
  test("nincs benne térkép, Supabase, kliens JS vagy külső kérés", () => {
    assert.doesNotMatch(code(loading), /use client|maplibre|supabase|useEffect|useState|fetch\(|https?:\/\//i);
    assert.doesNotMatch(code(loading), /^import /m);
  });
});

describe("natív splash hide (head script)", () => {
  test("csak a natív ágban hívja a SplashScreen.hide-ot a meglévő hídon át", () => {
    const native = layout.indexOf("indexOf('VedettUtvonalNative')>-1");
    const hide = layout.indexOf("nativePromise('SplashScreen','hide'");
    const ret = layout.indexOf("return}", native);
    const reg = layout.indexOf("serviceWorker.register('/sw.js')");
    assert.ok(native > 0 && hide > native && hide < ret && ret < reg, "a hide a natív ágban, a return előtt");
  });
  test("csendben hibázik, ha a híd/plugin nincs; first-contentful-paint + load triggerek", () => {
    assert.match(layout, /typeof c\.nativePromise==='function'/);
    assert.match(layout, /\.catch\(function\(\)\{\}\)/);
    assert.match(layout, /e\.name==='first-contentful-paint'\)h\(\)/);
    assert.match(layout, /window\.addEventListener\('load',h\)/);
  });
  test("a root build nem importál Capacitor csomagot", () => {
    assert.doesNotMatch(layout, /from ["']@capacitor/);
    assert.doesNotMatch(read("package.json"), /@capacitor/);
  });
  test("normál böngésző: SW regisztráció változatlan", () => {
    assert.match(layout, /window\.addEventListener\('load',function\(\)\{navigator\.serviceWorker\.register\('\/sw\.js'\)\}\)/);
  });
});

describe("natív projekt: splash konfiguráció", () => {
  test("a plugin csak a natív csomagban van", () => {
    assert.match(nativePkg, /"@capacitor\/splash-screen"/);
  });
  test("maximum idő + autohide: soha nem ragadhat be; háttér #F3F4F6; nincs spinner", () => {
    assert.match(nativeCfg, /launchShowDuration: 4000/);
    assert.match(nativeCfg, /launchAutoHide: true/);
    assert.match(nativeCfg, /showSpinner: false/);
    assert.match(nativeCfg, /backgroundColor: '#F3F4F6'/);
  });
  test("Android 12+ splash téma: háttér + logó + postSplashScreenTheme", () => {
    assert.match(styles, /windowSplashScreenBackground">#F3F4F6/);
    assert.match(styles, /windowSplashScreenAnimatedIcon">@drawable\/ic_splash_logo/);
    assert.match(styles, /postSplashScreenTheme">@style\/AppTheme\.NoActionBar/);
    assert.ok(existsSync("vedett-utvonal-native/android/app/src/main/res/drawable-nodpi/ic_splash_logo.png"));
  });
  test("a regisztrált natív pluginok: App, Browser, Geolocation, SplashScreen", () => {
    const g = read("vedett-utvonal-native/android/capacitor.settings.gradle");
    for (const p of ["capacitor-app", "capacitor-browser", "capacitor-geolocation", "capacitor-splash-screen"]) {
      assert.match(g, new RegExp(`include ':${p}'`));
    }
  });
  test("a root tsconfig továbbra is kizárja a natív projektet", () => {
    assert.match(read("tsconfig.json"), /"vedett-utvonal-native"/);
  });
});
