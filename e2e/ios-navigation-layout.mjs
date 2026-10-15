// iOS navigációs elrendezés — automatizált elrendezési teszt (Chromium).
// Megnyitja a VALÓDI navigációs képernyőt (harness oldal + mockolt keresési
// API + mockolt GPS), majd több iPhone-méreten (álló + fekvő) méri:
//   - nincs vízszintes túllógás,
//   - minden kezelőelem a (szimulált) biztonsági területen belül van,
//   - a felső sáv, az utasításkártya, az ETA és a pihenőpont-gombok nem fedik egymást,
//   - a pihenőpont-gombok kattinthatók és a meglévő panelt nyitják.
// A natív iOS app safe-area képességét egy window.Capacitor álobjektum
// szimulálja (getSafeAreaInsets). FONTOS: ez Chromium-eredmény — a valódi
// WKWebView-viselkedést csak iOS-szimulátor/eszköz igazolja.
//
// Futtatás: BASE_URL=http://localhost:3000 node e2e/ios-navigation-layout.mjs
// (régi Swift-injekcióval együtt: INJECT_LEGACY_IOS_CSS=1)
// (opcionális: PW_CHROMIUM=/path/to/chromium)

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const HARNESS = `${BASE_URL}/vu-nav-layout-harness`;

// INJECT_LEGACY_IOS_CSS=1: a MEGLÉVŐ Swift CSS/JS-injekciót (VedettBridgeViewController.swift
// safeAreaScript) szó szerint beinjektáljuk dokumentum-kezdéskor, ahogy a WKUserScript
// teszi — csak a hosztnév-ellenőrzést hagyjuk el. Így bizonyítható, hogy a régi
// injekció NEM rontja el az új (v2) elrendezést, amíg el nem távolítjuk.
import { readFileSync } from "node:fs";
let LEGACY_SCRIPT = null;
if (process.env.INJECT_LEGACY_IOS_CSS === "1") {
  const swift = readFileSync(new URL("../vedett-utvonal-native/ios/App/App/Navigation/VedettBridgeViewController.swift", import.meta.url), "utf8");
  const start = swift.indexOf('let safeAreaScript = """');
  const body = swift.slice(swift.indexOf("\n", start) + 1, swift.indexOf('        """', start));
  LEGACY_SCRIPT = body.replace(/^.*location\.hostname !== 'www\.vedettsarok\.hu'.*$/m, "");
  if (!LEGACY_SCRIPT.includes("vedett-ios-safe-area")) throw new Error("A Swift injekció nem olvasható ki.");
}

const NOTCH_PORTRAIT = { safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const NOTCH_LANDSCAPE = { safe: { top: 0, right: 59, bottom: 21, left: 59 } };
const SE = { safe: { top: 20, right: 0, bottom: 0, left: 0 } };
const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

const DEVICES = [
  { name: "iPhone SE (1. gen) 320×568", width: 320, height: 568, ...SE },
  { name: "iPhone SE (2./3. gen) 375×667", width: 375, height: 667, ...SE },
  { name: "iPhone 13/14 390×844", width: 390, height: 844, ...NOTCH_PORTRAIT },
  { name: "iPhone 15 393×852", width: 393, height: 852, ...NOTCH_PORTRAIT },
  { name: "iPhone 15 Pro Max 430×932", width: 430, height: 932, ...NOTCH_PORTRAIT },
  { name: "iPhone 15 fekvő 852×393", width: 852, height: 393, ...NOTCH_LANDSCAPE },
  { name: "iPhone 15 Pro Max fekvő 932×430", width: 932, height: 430, ...NOTCH_LANDSCAPE },
];

function iso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function fixtureSearchResponse() {
  const journey = {
    totalDurationMinutes: 24,
    departureTime: iso(1),
    arrivalTime: iso(25),
    walkingMinutes: 6,
    waitingMinutes: 3,
    transfers: 0,
    realtimeAvailable: false,
    alerts: [],
    legs: [
      {
        mode: "WALK", fromName: "Deák Ferenc tér", toName: "Astoria M – nagyon hosszú megállónév a tördelés teszteléséhez",
        departureTime: iso(1), arrivalTime: iso(7), durationMinutes: 6, distanceMeters: 450, realtime: false,
        fromLat: 47.4979, fromLon: 19.0544, toLat: 47.4943, toLon: 19.0605,
      },
      {
        mode: "TRANSIT", transitMode: "TRAM", routeShortName: "47", headsign: "Budafok, Városház tér",
        fromName: "Astoria M – nagyon hosszú megállónév a tördelés teszteléséhez", toName: "Szent Gellért tér – Műegyetem M",
        departureTime: iso(10), arrivalTime: iso(25), durationMinutes: 15, realtime: false,
        fromLat: 47.4943, fromLon: 19.0605, toLat: 47.4839, toLon: 19.0532,
        intermediateStops: [{ name: "Kálvin tér M", lat: 47.4896, lon: 19.0617 }, { name: "Fővám tér M", lat: 47.4866, lon: 19.0586 }],
      },
    ],
  };
  return {
    ok: true,
    journeys: [{ journey, labels: ["FASTEST"], explanation: "Teszt útvonal." }],
    dataCoverage: { provider: "BKK", sensoryConfidenceAvg: 0, missingFactorsUnion: [], motisImportedAt: null },
    serviceAlerts: [],
  };
}

function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

async function runDevice(browser, device, { nativeIos }) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 47.4979, longitude: 19.0544, accuracy: 10 },
    permissions: ["geolocation"],
  });
  if (nativeIos) {
    const layout = { safe: device.safe, adjusted: ZERO };
    await context.addInitScript((l) => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => "ios",
        nativePromise: (plugin, method) =>
          plugin === "VedettNavigation" && method === "getSafeAreaInsets"
            ? Promise.resolve(l)
            : Promise.reject({ code: "UNIMPLEMENTED", message: "not implemented" }),
        addListener: () => ({ remove: () => {} }),
      };
    }, layout);
  }
  if (LEGACY_SCRIPT) await context.addInitScript(LEGACY_SCRIPT);
  const page = await context.newPage();
  await page.route("**/api/admin/vedett-utvonal/search", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureSearchResponse()) })
  );
  await page.route(/\/api\/(?!admin\/vedett-utvonal\/search).*/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) })
  );
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());

  const problems = [];
  await page.goto(HARNESS, { waitUntil: "domcontentloaded" });
  // Süti-tájékoztató (csak böngészőben jelenik meg) — a legszűkebb opció.
  await page.getByRole("button", { name: "Csak szükséges sütik" }).click({ timeout: 3000 }).catch(() => {});
  await page.getByRole("button", { name: "Útvonal keresése" }).first().click();
  await page.getByRole("button", { name: "Térkép megnyitása" }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Navigáció indítása/ }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Navigáció befejezése/ }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    const restButtons = [...document.querySelectorAll('button[aria-label="Pihenőpontok keresése a közelemben"], button[aria-label="Pihenőpont hozzáadása"]')]
      .filter((b) => b.getClientRects().length > 0);
    return {
      legacyInjected: Boolean(document.getElementById("vedett-ios-safe-area")),
      layout: document.querySelector("[data-vu-nav-layout]")?.getAttribute("data-vu-nav-layout") ?? null,
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      topBar: rect(document.querySelector("[data-vu-nav-top-bar]")),
      topBarButtons: [...document.querySelectorAll("[data-vu-nav-top-bar] button")].map(rect).filter(Boolean),
      instruction: rect(document.querySelector("[data-vu-nav-instruction]")),
      eta: rect([...document.querySelectorAll("[data-vu-nav-eta], div.absolute.bottom-3.left-3")].find((e) => e.getClientRects().length > 0)),
      restCtas: rect([...document.querySelectorAll("[data-vu-nav-rest-ctas], div.fixed.right-3")].find((e) => e.getClientRects().length > 0)),
      restButtons: restButtons.map(rect),
      mapControls: [...document.querySelectorAll(".maplibregl-ctrl-top-right .maplibregl-ctrl, .maplibregl-ctrl-top-left .maplibregl-ctrl")].map(rect).filter(Boolean),
    };
  });

  const safe = {
    left: device.safe.left, top: device.safe.top,
    right: device.width - device.safe.right, bottom: device.height - device.safe.bottom,
  };
  if (nativeIos && m.layout !== "ios-v2") problems.push(`v2 elrendezés nem kapcsolt be (layout=${m.layout})`);
  if (!nativeIos && m.layout !== null) problems.push(`v1 környezetben v2 kapcsolt be (${m.layout})`);
  if (LEGACY_SCRIPT && !m.legacyInjected) problems.push("a régi Swift-injekció nem futott le");
  if (m.scrollWidth > m.vw) problems.push(`vízszintes túllógás: scrollWidth ${m.scrollWidth} > ${m.vw}`);
  const named = { topBar: m.topBar, instruction: m.instruction, eta: m.eta, restCtas: m.restCtas };
  for (const [k, r] of Object.entries(named)) if (!r) problems.push(`hiányzó elem: ${k}`);
  if (m.restButtons.length !== 2) problems.push(`pihenőpont-gombok száma ${m.restButtons.length} (2 kell)`);
  if (nativeIos) {
    const all = { ...named, ...Object.fromEntries(m.restButtons.map((r, i) => [`restButton${i}`, r])), ...Object.fromEntries(m.topBarButtons.map((r, i) => [`topBarButton${i}`, r])) };
    for (const [k, r] of Object.entries(all)) {
      if (!r) continue;
      if (r.left < safe.left - 0.5 || r.right > safe.right + 0.5 || r.top < safe.top - 0.5 || r.bottom > safe.bottom + 0.5) {
        problems.push(`${k} kilóg a biztonsági területből: ${JSON.stringify(r)} vs ${JSON.stringify(safe)}`);
      }
    }
    for (const [i, c] of m.mapControls.entries())
      for (const [k, r] of Object.entries({ topBar: m.topBar, instruction: m.instruction, eta: m.eta, restCtas: m.restCtas }))
        if (r && overlaps(c, r)) problems.push(`átfedés: térképvezérlő#${i} × ${k}`);
    const keys = Object.keys(named);
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++)
        if (named[keys[i]] && named[keys[j]] && overlaps(named[keys[i]], named[keys[j]])) problems.push(`átfedés: ${keys[i]} × ${keys[j]}`);
  }

  // A pihenőpont-gomb valóban kattintható és a MEGLÉVŐ panelt nyitja.
  try {
    await page.getByRole("button", { name: "Pihenőpont hozzáadása" }).first().click({ timeout: 5000 });
    await page.getByRole("button", { name: "Pihenőpontok bezárása" }).waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Pihenőpontok bezárása" }).click();
    await page.getByRole("button", { name: "Pihenőpontok keresése a közelemben" }).first().click({ timeout: 5000 });
    await page.getByRole("button", { name: "Pihenőpontok bezárása" }).waitFor({ timeout: 5000 });
  } catch (e) {
    problems.push(`pihenőpont-gomb nem használható: ${String(e).split("\n")[0]}`);
  }

  if (process.env.SCREENSHOT_DIR) {
    await page.getByRole("button", { name: "Pihenőpontok bezárása" }).click().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${nativeIos ? "v2" : "v1"}${LEGACY_SCRIPT ? "-legacycss" : ""}-${device.width}x${device.height}.png` });
  }
  await context.close();
  return { device: device.name, mode: nativeIos ? "iOS natív (v2)" : "böngésző (v1)", problems, metrics: m };
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
for (const device of DEVICES) {
  for (const nativeIos of [true, false]) {
    let result;
    try {
      result = await runDevice(browser, device, { nativeIos });
    } catch (e) {
      result = { device: device.name, mode: nativeIos ? "iOS natív (v2)" : "böngésző (v1)", problems: [`hiba: ${String(e).split("\n")[0]}`] };
    }
    // v1 = a jelenlegi (változatlan) böngészős/Android elrendezés: csak
    // tájékoztató (regresszió-figyelés), nem buktatja a v2-tesztet.
    const ok = result.problems.length === 0;
    const critical = nativeIos || result.problems.some((p) => p.includes("v2 kapcsolt be"));
    if (!ok && critical) failed++;
    const tag = ok ? "OK  " : critical ? "FAIL" : "INFO";
    console.log(`${tag} ${result.mode} — ${result.device}${ok ? "" : "\n     - " + result.problems.join("\n     - ")}`);
  }
}
await browser.close();
console.log(`(régi Swift-injekció: ${LEGACY_SCRIPT ? "AKTÍV" : "nincs"})`);
console.log(failed === 0 ? "\nMinden elrendezési ellenőrzés sikeres." : `\n${failed} eset hibás.`);
process.exit(failed === 0 ? 0 : 1);
