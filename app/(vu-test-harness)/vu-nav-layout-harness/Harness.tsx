"use client";

// FEJLESZTŐI TESZT-HARNESS — a VALÓDI VedettUtvonalSearchForm, fix teszt-
// útvonallal. `?autostart=1` esetén (iOS-szimulátoros CI-hez, ahol nincs
// kattintó tesztrobot) a keresést és a GPS-t mockolja, magától megnyitja a
// navigációs képernyőt, megméri az elrendezést, a mérési adatokat JSON-ként
// elküldi a helyi szervernek (/vu-nav-layout-harness/report — a CI ebből
// dönt), és a képernyőképhez egy összegző sávot is mutat. Productionben 404.

import { useEffect, useState } from "react";
import VedettUtvonalSearchForm from "@/components/vedett-utvonal/VedettUtvonalSearchForm";
import {
  getNativeSafeAreaLayout,
  isIosNativePlatform,
  residualSafeAreaInsets,
  type EdgeInsets,
  type NativeSafeAreaLayout,
} from "@/lib/vedett-route/native/nativeNavigationBridge";

function iso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function fixtureSearchResponse() {
  return {
    ok: true,
    journeys: [
      {
        labels: ["FASTEST"],
        explanation: "Teszt útvonal.",
        journey: {
          totalDurationMinutes: 24, departureTime: iso(1), arrivalTime: iso(25), walkingMinutes: 6, waitingMinutes: 3,
          transfers: 0, realtimeAvailable: false, alerts: [],
          legs: [
            { mode: "WALK", fromName: "Deák Ferenc tér", toName: "Astoria M – nagyon hosszú megállónév a tördelés teszteléséhez",
              departureTime: iso(1), arrivalTime: iso(7), durationMinutes: 6, distanceMeters: 450, realtime: false,
              fromLat: 47.4979, fromLon: 19.0544, toLat: 47.4943, toLon: 19.0605 },
            { mode: "TRANSIT", transitMode: "TRAM", routeShortName: "47", headsign: "Budafok, Városház tér",
              fromName: "Astoria M – nagyon hosszú megállónév a tördelés teszteléséhez", toName: "Szent Gellért tér – Műegyetem M",
              departureTime: iso(10), arrivalTime: iso(25), durationMinutes: 15, realtime: false,
              fromLat: 47.4943, fromLon: 19.0605, toLat: 47.4839, toLon: 19.0532 },
          ],
        },
      },
    ],
    dataCoverage: { provider: "BKK", sensoryConfidenceAvg: 0, missingFactorsUnion: [], motisImportedAt: null },
    serviceAlerts: [],
  };
}

// Szimulátorban a WKWebView saját helyhozzáférés-kérdése modális ablakot
// nyitna (CI-ben nincs, aki elfogadja) — autostart módban fix teszthelyet adunk.
function installGeolocationMock() {
  const pos = {
    coords: { latitude: 47.4979, longitude: 19.0544, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition;
  const geo = {
    getCurrentPosition: (ok: PositionCallback) => setTimeout(() => ok({ ...pos, timestamp: Date.now() } as GeolocationPosition), 50),
    watchPosition: (ok: PositionCallback) => {
      const id = window.setInterval(() => ok({ ...pos, timestamp: Date.now() } as GeolocationPosition), 1000);
      setTimeout(() => ok({ ...pos, timestamp: Date.now() } as GeolocationPosition), 50);
      return id;
    },
    clearWatch: (id: number) => window.clearInterval(id),
  };
  try {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: geo });
  } catch {
    // ha nem felülírható, a natív kérdés jelenik meg — a képernyőképen látszik
  }
}

function installFetchMock() {
  const w = window as unknown as { __vuHarnessFetch?: boolean };
  if (w.__vuHarnessFetch) return;
  w.__vuHarnessFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/admin/vedett-utvonal/search")) {
      return Promise.resolve(new Response(JSON.stringify(fixtureSearchResponse()), { headers: { "Content-Type": "application/json" } }));
    }
    if (url.includes("/api/")) {
      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { headers: { "Content-Type": "application/json" } }));
    }
    return original(input, init);
  };
}

async function clickButton(match: (text: string) => boolean, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = [...document.querySelectorAll("button")].find((b) => match((b.textContent ?? "").trim()) && b.getClientRects().length > 0);
    if (btn) {
      btn.click();
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function waitFor(check: () => boolean, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// --- Natív hívások elkülönítése (CSAK a tesztoldalon, autostart módban) ---
// A VedettNavigation.start natívan értesítési engedélyt kér
// (NavigationNotifications.requestPermission), ami a szimulátorban modális
// rendszerablakot nyit, és eltakarja a képernyőt. A tesztoldal ezért a
// navigációs MOTOR natív hívásait (start/updatePlan/…) „régi build”
// válasszal (UNIMPLEMENTED) zárja le — a web ilyenkor fail-open a saját
// navigációjával fut tovább. A getSafeAreaInsets VÁLTOZATLANUL a natív
// pluginhoz megy (ezt méri a teszt). Az éles app és az éles web nem érintett.
type NativeCallLog = { method: string; outcome: "passed" | "suppressed" };
const nativeCalls: NativeCallLog[] = [];
const PASS_THROUGH = new Set(["getSafeAreaInsets"]);

function isolateNativeNavigationCalls(): boolean {
  const cap = (window as unknown as { Capacitor?: { nativePromise?: (p: string, m: string, o?: unknown) => Promise<unknown> } }).Capacitor;
  if (!cap || typeof cap.nativePromise !== "function") return false;
  const original = cap.nativePromise.bind(cap);
  cap.nativePromise = (plugin: string, method: string, options?: unknown) => {
    if (plugin === "VedettNavigation" && !PASS_THROUGH.has(method)) {
      nativeCalls.push({ method, outcome: "suppressed" });
      return Promise.reject({ code: "UNIMPLEMENTED", message: "suppressed by layout test harness" });
    }
    nativeCalls.push({ method: `${plugin}.${method}`, outcome: "passed" });
    return original(plugin, method, options);
  };
  return true;
}

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const toRect = (el: Element | null | undefined): Rect | null => {
  if (!el || el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};
const overlaps = (a: Rect, b: Rect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

type LayoutReport = {
  schema: 1;
  phase: string;
  ok: boolean;
  problems: string[];
  layout: string;
  native: { platformIos: boolean; ok: boolean; raw: unknown; residual: EdgeInsets | null; error?: string };
  viewport: { innerWidth: number; innerHeight: number; screenWidth: number; screenHeight: number; visualViewport: { width: number; height: number } | null; dpr: number; orientation: "portrait" | "landscape"; scrollWidth: number };
  safeRect: Rect;
  rects: Record<string, Rect | null>;
  restButtons: Record<string, Rect | null>;
  mapControls: Rect[];
  restFlowOk: boolean | null;
  nativeCalls: NativeCallLog[];
  userAgent: string;
  at: string;
};

async function measure(phase: string, restFlowOk: boolean | null): Promise<LayoutReport> {
  const problems: string[] = [];
  let raw: unknown = null;
  let nativeError: string | undefined;
  let native: NativeSafeAreaLayout | null = null;
  const platformIos = isIosNativePlatform();
  try {
    native = await getNativeSafeAreaLayout();
    raw = native;
  } catch (e) {
    nativeError = String(e);
  }
  if (!platformIos) problems.push("nem natív iOS platform (window.Capacitor.getPlatform() !== 'ios')");
  if (!native) problems.push("getSafeAreaInsets natív hívás sikertelen vagy érvénytelen választ adott");
  const residual = native ? residualSafeAreaInsets(native) : null;
  const layout = document.querySelector("[data-vu-nav-layout]")?.getAttribute("data-vu-nav-layout") ?? "v1";
  if (layout !== "ios-v2") problems.push(`az elrendezés nem ios-v2 (${layout})`);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ins = residual ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const safeRect: Rect = { left: ins.left, top: ins.top, right: vw - ins.right, bottom: vh - ins.bottom, width: vw - ins.left - ins.right, height: vh - ins.top - ins.bottom };
  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth > vw) problems.push(`vízszintes túllógás: scrollWidth ${scrollWidth} > ${vw}`);

  const rects: Record<string, Rect | null> = {
    topBar: toRect(document.querySelector("[data-vu-nav-top-bar]")),
    instruction: toRect(document.querySelector("[data-vu-nav-instruction]")),
    eta: toRect(document.querySelector("[data-vu-nav-eta]")),
    bottomBar: toRect(document.querySelector("[data-vu-nav-bottom-bar]")),
  };
  const restButtons: Record<string, Rect | null> = {
    restNeed: toRect([...document.querySelectorAll('[data-vu-nav-bottom-bar] button[aria-label="Pihenőpontok keresése a közelemben"]')][0]),
    restAdd: toRect([...document.querySelectorAll('[data-vu-nav-bottom-bar] button[aria-label="Pihenőpont hozzáadása"]')][0]),
  };
  const topBarButtons = [...document.querySelectorAll("[data-vu-nav-top-bar] button")].map(toRect).filter((r): r is Rect => r !== null);
  const mapControls = [...document.querySelectorAll(".maplibregl-ctrl")].map(toRect).filter((r): r is Rect => r !== null);

  for (const [k, r] of Object.entries({ ...rects, ...restButtons })) if (!r) problems.push(`hiányzó elem: ${k}`);
  if (topBarButtons.length === 0) problems.push("hiányzó elem: felső sáv gombjai");
  if (mapControls.length === 0) problems.push("hiányzó elem: térképvezérlők");

  const inside = (name: string, r: Rect) => {
    if (r.left < safeRect.left - 0.5 || r.right > safeRect.right + 0.5 || r.top < safeRect.top - 0.5 || r.bottom > safeRect.bottom + 0.5)
      problems.push(`${name} kilóg a biztonsági területből`);
  };
  // Az alsó sáv TÁROLÓJA szándékosan a képernyő aljáig ér (háttér a home-
  // indikátor mögött, a tartalma belső paddinggel a biztonsági területen
  // belül) — ezért a tároló helyett a TARTALMÁT (ETA, gombok) ellenőrizzük.
  const checked: Array<[string, Rect]> = [];
  for (const [k, r] of Object.entries({ ...rects, ...restButtons })) if (r && k !== "bottomBar") checked.push([k, r]);
  topBarButtons.forEach((r, i) => checked.push([`topBarButton${i}`, r]));
  mapControls.forEach((r, i) => checked.push([`mapControl${i}`, r]));
  checked.forEach(([k, r]) => inside(k, r));

  // Átfedés: minden független elempár (a tartalmazó sávokat a saját
  // gyermekeikkel nem vetjük össze).
  const independent: Array<[string, Rect]> = [];
  for (const k of ["topBar", "instruction", "eta"]) if (rects[k]) independent.push([k, rects[k] as Rect]);
  for (const k of ["restNeed", "restAdd"]) if (restButtons[k]) independent.push([k, restButtons[k] as Rect]);
  mapControls.forEach((r, i) => independent.push([`mapControl${i}`, r]));
  for (let i = 0; i < independent.length; i++)
    for (let j = i + 1; j < independent.length; j++)
      if (overlaps(independent[i][1], independent[j][1])) problems.push(`átfedés: ${independent[i][0]} × ${independent[j][0]}`);

  if (restFlowOk === false) problems.push("a pihenőpont-gomb nem nyitotta meg a meglévő panelt");

  return {
    schema: 1,
    phase,
    ok: problems.length === 0,
    problems,
    layout,
    native: { platformIos, ok: native !== null, raw, residual, ...(nativeError ? { error: nativeError } : {}) },
    viewport: {
      innerWidth: vw, innerHeight: vh, screenWidth: window.screen.width, screenHeight: window.screen.height,
      visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height } : null,
      dpr: window.devicePixelRatio, orientation: vw > vh ? "landscape" : "portrait", scrollWidth,
    },
    safeRect,
    rects: { ...rects, ...Object.fromEntries(topBarButtons.map((r, i) => [`topBarButton${i}`, r])) },
    restButtons,
    mapControls,
    restFlowOk,
    nativeCalls: [...nativeCalls],
    userAgent: navigator.userAgent,
    at: new Date().toISOString(),
  };
}

async function postReport(report: LayoutReport) {
  try {
    await fetch("/vu-nav-layout-harness/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
  } catch {
    // a riport hiánya a CI-ben hibának számít (időtúllépés) — itt nincs teendő
  }
}

// A meglévő pihenőpont-panel valóban megnyílik-e a gombbal (majd bezárjuk).
async function checkRestFlow(): Promise<boolean> {
  const btn = document.querySelector<HTMLButtonElement>('[data-vu-nav-bottom-bar] button[aria-label="Pihenőpont hozzáadása"]');
  if (!btn) return false;
  btn.click();
  const opened = await waitFor(() => Boolean(document.querySelector('button[aria-label="Pihenőpontok bezárása"]')), 8000);
  document.querySelector<HTMLButtonElement>('button[aria-label="Pihenőpontok bezárása"]')?.click();
  await waitFor(() => Boolean(document.querySelector("[data-vu-nav-bottom-bar] [data-vu-nav-rest-ctas]")), 8000);
  return opened;
}

export default function Harness() {
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autostart") !== "1") return;
    // React StrictMode (dev) kétszer futtatja az effektet — a sorozat egyszer fusson.
    const w = window as unknown as { __vuHarnessStarted?: boolean };
    if (w.__vuHarnessStarted) return;
    w.__vuHarnessStarted = true;
    installFetchMock();
    installGeolocationMock();
    isolateNativeNavigationCalls();
    let lastOrientation = "";
    const run = async (phase: string, withRestFlow: boolean) => {
      const restFlowOk = withRestFlow ? await checkRestFlow() : null;
      await new Promise((r) => setTimeout(r, 800));
      const report = await measure(phase, restFlowOk);
      lastOrientation = report.viewport.orientation;
      await postReport(report);
      setReport(`${report.layout} · ${report.viewport.innerWidth}×${report.viewport.innerHeight} · ${report.ok ? "ELRENDEZÉS OK" : report.problems.join(", ")}`);
    };
    (async () => {
      // A süti-tájékoztatóra a legszűkebb választ adjuk (ha megjelenik).
      await clickButton((t) => t === "Csak szükséges sütik", 3000);
      await clickButton((t) => t === "Útvonal keresése");
      await clickButton((t) => t === "Térkép megnyitása");
      await clickButton((t) => t.includes("Navigáció indítása"));
      await waitFor(() => Boolean(document.querySelector("[data-vu-nav-layout], [data-vu-nav-top-bar]")), 15_000);
      await new Promise((r) => setTimeout(r, 4000));
      await run("initial", true);
    })();
    // Forgatás után (pl. fekvő teszt) újramérés és új riport.
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
        if (orientation !== lastOrientation) void run(`after-resize-${orientation}`, false);
      }, 3000);
    };
    window.addEventListener("resize", onResize);
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-3">
      <VedettUtvonalSearchForm
        disabled={false}
        isAuthenticated={false}
        initialOrigin={{ name: "Deák Ferenc tér", latitude: 47.4979, longitude: 19.0544 }}
        initialDestination={{ name: "Szent Gellért tér – a teszt kedvéért hosszú megállónév", latitude: 47.4839, longitude: 19.0532 }}
      />
      {report && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[100] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded bg-fuchsia-700/80 p-2 text-center text-xs font-bold text-white">
          {report}
        </div>
      )}
    </div>
  );
}
