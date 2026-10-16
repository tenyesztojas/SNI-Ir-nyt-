// iOS NATÍV NAVIGÁCIÓS ELRENDEZÉS v2 — egység- és forrásszintű tesztek.
// A valódi elrendezést (átfedés, túllógás) a Playwright-teszt méri
// (e2e/ios-navigation-layout.spec.ts); valódi WKWebView-viselkedést csak
// iOS-szimulátor / eszköz igazol.
//   node --test __tests__/vedett-route/ios-navigation-layout-v2.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getNativeSafeAreaLayout,
  isIosNativePlatform,
  parseNativeSafeAreaLayout,
  residualSafeAreaInsets,
} from "../../lib/vedett-route/native/nativeNavigationBridge.ts";

const read = (p: string) => readFileSync(p, "utf8");
const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const swiftPlugin = read("vedett-utvonal-native/ios/App/App/Navigation/VedettNavigationPlugin.swift");
const swiftInjection = read("vedett-utvonal-native/ios/App/App/Navigation/VedettBridgeViewController.swift");

const layout = {
  safe: { top: 59, right: 0, bottom: 34, left: 0 },
  adjusted: { top: 59, right: 0, bottom: 0, left: 0 },
};
const fakeWin = (platform: string, impl: (p: string, m: string) => Promise<unknown>) => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, nativePromise: impl },
});

describe("egység: natív safe-area adatok", () => {
  test("érvényes válasz feldolgozása; hibás/hiányos/irreális értékek elutasítva", () => {
    assert.deepEqual(parseNativeSafeAreaLayout(layout), layout);
    assert.equal(parseNativeSafeAreaLayout(null), null);
    assert.equal(parseNativeSafeAreaLayout({ safe: layout.safe }), null);
    assert.equal(parseNativeSafeAreaLayout({ ...layout, safe: { ...layout.safe, top: -1 } }), null);
    assert.equal(parseNativeSafeAreaLayout({ ...layout, safe: { ...layout.safe, top: 9999 } }), null);
    assert.equal(parseNativeSafeAreaLayout({ ...layout, safe: { ...layout.safe, top: "59" } }), null);
  });
  test("a WKWebView által már levont inset nem számolódik kétszer", () => {
    assert.deepEqual(residualSafeAreaInsets(layout), { top: 0, right: 0, bottom: 34, left: 0 });
    assert.deepEqual(
      residualSafeAreaInsets({ safe: { top: 0, right: 59, bottom: 21, left: 59 }, adjusted: { top: 0, right: 0, bottom: 0, left: 0 } }),
      { top: 0, right: 59, bottom: 21, left: 59 }
    );
  });
  test("kapcsoló: csak natív iOS + létező getSafeAreaInsets → elrendezés; web/Android/régi build → null", async () => {
    const ok = fakeWin("ios", async (p, m) => (p === "VedettNavigation" && m === "getSafeAreaInsets" ? layout : {}));
    assert.equal(isIosNativePlatform(ok), true);
    assert.deepEqual(await getNativeSafeAreaLayout(ok), layout);
    let androidCalled = false;
    const android = fakeWin("android", async () => {
      androidCalled = true;
      return layout;
    });
    assert.equal(await getNativeSafeAreaLayout(android), null);
    assert.equal(androidCalled, false, "Androidon a natív metódus meg sem hívódik");
    const oldBuild = fakeWin("ios", async () => {
      throw { code: "UNIMPLEMENTED", message: "not implemented" };
    });
    assert.equal(await getNativeSafeAreaLayout(oldBuild), null);
    assert.equal(await getNativeSafeAreaLayout({}), null);
    assert.equal(await getNativeSafeAreaLayout(fakeWin("ios", async () => ({ safe: {} }))), null);
  });
});

describe("forrás: v1 változatlan, v2 elkülönített", () => {
  test("v1 ETA és pihenőpont-gombok literálisan megmaradnak, csak v2-ben rejtve", () => {
    assert.match(form, /\{!navLayoutV2 && \(\s*<>\s*\{navigationMode && navigationEta && \(\s*<div className="absolute bottom-3 left-3 z-10 w-\[42vw\]/);
    assert.match(form, /\{!navLayoutV2 && \(\s*<>\s*\{mapFullscreen && !restPanelVisible && !communityReportOpen && \(\s*<div\s+className="fixed right-3 z-\[60\]/);
  });
  test("v2 csak natív képesség alapján kapcsol; nincs UA- vagy viewport-találgatás", () => {
    assert.match(form, /const navLayoutV2 = iosNavLayout\.enabled && mapFullscreen;/);
    const hook = read("lib/hooks/useIosNavigationLayout.ts");
    assert.doesNotMatch(hook, /userAgent|viewport/);
    assert.match(hook, /window\.removeEventListener\("resize", schedule\)/);
  });
  test("v2 egy flex-oszlop: térképterület (flex-1) + alsó sáv; ugyanaz a konténer, a térkép egyszer szerepel", () => {
    assert.match(form, /navLayoutV2 \? "fixed inset-0 z-50 flex flex-col"/);
    assert.match(form, /navLayoutV2 \? "relative min-h-0 flex-1 overflow-hidden[^"]*" : "contents"/);
    assert.match(form, /data-vu-nav-bottom-bar=""/);
    assert.equal((form.match(/<VedettUtvonalMap(?=\s)/g) ?? []).length, 1);
  });
  test("a v2 elemei NEM illeszkednek a régi Swift CSS-injekció szelektoraira (nincs ütközés az eltávolításig)", () => {
    const v2Outer = "fixed inset-0 z-50 flex flex-col".split(" ");
    assert.ok(!v2Outer.includes("bg-black"), "div.fixed.inset-0.z-50.bg-black nem illeszkedhet");
    const bar = form.slice(form.indexOf('data-vu-nav-bottom-bar=""'), form.indexOf('data-vu-nav-bottom-bar=""') + 4000);
    assert.doesNotMatch(bar, /fixed right-3|absolute bottom-3 left-3/);
    assert.match(swiftInjection, /div\.fixed\.inset-0\.z-50\.bg-black/, "a régi injekció még bent van (eltávolítás csak eszközös igazolás után)");
  });
  test("Swift: getSafeAreaInsets regisztrálva, safe + adjusted értékeket ad", () => {
    assert.match(swiftPlugin, /CAPPluginMethod\(name: "getSafeAreaInsets", returnType: CAPPluginReturnPromise\)/);
    assert.match(swiftPlugin, /let safe = view\.safeAreaInsets/);
    assert.match(swiftPlugin, /let adjusted = scrollView\.adjustedContentInset/);
  });
});

describe("forrás: szimulátoros tesztkörnyezet elkülönítése", () => {
  const wf = read(".github/workflows/ios-simulator-layout.yml");
  const harnessPage = read("app/(vu-test-harness)/vu-nav-layout-harness/page.tsx");
  test("tesztoldal: MINDEN környezetben 404, kivéve VU_LAYOUT_HARNESS=1; Vercel productionben mindig 404; noindex", () => {
    assert.match(harnessPage, /if \(process\.env\.VU_LAYOUT_HARNESS !== "1"\) notFound\(\);/);
    assert.match(harnessPage, /process\.env\.VERCEL_ENV === "production"\) notFound\(\);/);
    assert.match(harnessPage, /robots: \{ index: false, follow: false \}/);
    assert.match(harnessPage, /export const dynamic = "force-dynamic";/);
    assert.match(wf, /VU_LAYOUT_HARNESS: "1"/);
  });
  test("workflow: kézi indítás vagy push KIZÁRÓLAG a feature branchen; helyi szerver; nincs feltöltés / verzióemelés / production URL", () => {
    assert.match(wf, /workflow_dispatch:/);
    assert.match(wf, /push:\s*\n\s*branches:\s*\n\s*- fix\/ios-testflight-tts-layout\s*\n\s*paths:/);
    assert.doesNotMatch(wf, /- main\b|^\s*(pull_request|schedule):/m);
    assert.match(wf, /HARNESS_URL: http:\/\/localhost:3000\/vu-nav-layout-harness/);
    const code = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    assert.doesNotMatch(code, /altool|upload-app|app-store-connect|agvtool|fastlane|pilot|CURRENT_PROJECT_VERSION=/i);
    assert.match(code, /if grep -q "www\.vedettsarok\.hu" "\$APP_PATH\/capacitor\.config\.json"; then/);
  });
});

describe("szimulátoros gépi riport-ellenőrzés", async () => {
  const { evaluateReport } = await import("../../e2e/assert-simulator-report.mjs");
  const rect = { left: 10, top: 70, right: 100, bottom: 120, width: 90, height: 50 };
  const good = {
    schema: 1, ok: true, problems: [], layout: "ios-v2",
    native: { platformIos: true, ok: true, raw: { safe: { top: 59, right: 0, bottom: 34, left: 0 }, adjusted: { top: 0, right: 0, bottom: 0, left: 0 } } },
    viewport: { orientation: "portrait", innerWidth: 393, innerHeight: 852, scrollWidth: 393 },
    rects: { topBar: rect, instruction: rect, eta: rect, bottomBar: rect },
    restButtons: { restNeed: rect, restAdd: rect },
    mapControls: [rect], restFlowOk: true,
    nativeCalls: [{ method: "start", outcome: "suppressed" }, { method: "VedettNavigation.getSafeAreaInsets", outcome: "passed" }],
  };
  test("hibátlan riport → nincs hiba", () => {
    assert.deepEqual(evaluateReport(good, { orientation: "portrait" }), []);
  });
  test("sikertelen getSafeAreaInsets, v1 elrendezés, rossz tájolás, mérési hiba → mind hibát ad", () => {
    assert.ok(evaluateReport({ ...good, native: { platformIos: true, ok: false, raw: null } }, { orientation: "portrait" }).some((f: string) => f.includes("getSafeAreaInsets")));
    assert.ok(evaluateReport({ ...good, layout: "v1" }, { orientation: "portrait" }).some((f: string) => f.includes("ios-v2")));
    assert.ok(evaluateReport(good, { orientation: "landscape" }).some((f: string) => f.includes("tájolás")));
    assert.ok(evaluateReport({ ...good, ok: false, problems: ["átfedés: topBar × mapControl0"] }, { orientation: "portrait" }).some((f: string) => f.includes("átfedés")));
    assert.ok(evaluateReport({ ...good, restButtons: { restNeed: rect, restAdd: null } }, { orientation: "portrait" }).some((f: string) => f.includes("restAdd")));
    assert.ok(evaluateReport({ ...good, nativeCalls: [{ method: "start", outcome: "passed" }] }, { orientation: "portrait" }).some((f: string) => f.includes("értesítési")));
    assert.ok(evaluateReport(null, { orientation: "portrait" }).length > 0);
  });
  test("tesztoldal: a natív navigációs start elkülönítve, a getSafeAreaInsets átengedve; riport-végpont csak CI-ben", () => {
    const h = read("app/(vu-test-harness)/vu-nav-layout-harness/Harness.tsx");
    assert.match(h, /const PASS_THROUGH = new Set\(\["getSafeAreaInsets"\]\);/);
    assert.match(h, /plugin === "VedettNavigation" && !PASS_THROUGH\.has\(method\)/);
    const route = read("app/(vu-test-harness)/vu-nav-layout-harness/report/route.ts");
    assert.match(route, /if \(process\.env\.VU_LAYOUT_HARNESS !== "1"\) return notFound\(\);/);
    assert.match(route, /if \(process\.env\.VERCEL_ENV === "production"\) return notFound\(\);/);
    assert.match(route, /export function GET\(\) \{\s*return notFound\(\);/);
  });
  test("szimulátoros futtató: ≥4 álló + 1 fekvő, gépi ellenőrzés, hibánál 1-es kilépési kód", () => {
    const sh = read("e2e/ios-simulator-run.sh");
    const wf = read(".github/workflows/ios-simulator-layout.yml");
    assert.match(sh, /MIN_PORTRAIT=4/);
    assert.match(sh, /node "\$ASSERT" "\$OUT\/reports\/\$NAME-portrait" portrait "\$DEVICE" \|\| FAIL=1/);
    assert.match(sh, /node "\$ASSERT" "\$OUT\/reports\/\$LAST_NAME-landscape" landscape/);
    assert.match(sh, /exit \$FAIL/);
    assert.match(wf, /e2e\/ios-simulator-run\.sh/);
    assert.match(wf, /VU_LAYOUT_REPORT_DIR: \/tmp\/vu-layout-reports/);
  });
});
