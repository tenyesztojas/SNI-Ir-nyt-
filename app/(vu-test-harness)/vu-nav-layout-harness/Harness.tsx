"use client";

// FEJLESZTŐI TESZT-HARNESS — a VALÓDI VedettUtvonalSearchForm, fix teszt-
// útvonallal. `?autostart=1` esetén (iOS-szimulátoros CI-hez, ahol nincs
// kattintó tesztrobot) a keresési API-t a böngészőben mockolja, magától
// megnyitja a navigációs képernyőt, és egy mérési sávot jelenít meg
// (túllógás / átfedés), amely a képernyőképen olvasható. Productionben 404.

import { useEffect, useState } from "react";
import VedettUtvonalSearchForm from "@/components/vedett-utvonal/VedettUtvonalSearchForm";

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

function measure(): string[] {
  const problems: string[] = [];
  const rect = (sel: string) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0);
    return el ? el.getBoundingClientRect() : null;
  };
  if (document.documentElement.scrollWidth > window.innerWidth) problems.push(`túllógás ${document.documentElement.scrollWidth}>${window.innerWidth}`);
  const items: Record<string, DOMRect | null> = {
    felso: rect("[data-vu-nav-top-bar]"),
    utasitas: rect("[data-vu-nav-instruction]"),
    eta: rect("[data-vu-nav-eta], div.absolute.bottom-3.left-3"),
    piheno: rect("[data-vu-nav-rest-ctas], div.fixed.right-3"),
  };
  [...document.querySelectorAll(".maplibregl-ctrl")].forEach((c, i) => (items[`terkep${i}`] = c.getBoundingClientRect()));
  const keys = Object.keys(items);
  for (const k of keys) {
    const r = items[k];
    if (!r) continue;
    if (r.left < -0.5 || r.right > window.innerWidth + 0.5 || r.top < -0.5 || r.bottom > window.innerHeight + 0.5) problems.push(`${k} kilóg`);
  }
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = items[keys[i]];
      const b = items[keys[j]];
      if (a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)
        problems.push(`átfedés ${keys[i]}×${keys[j]}`);
    }
  return problems;
}

export default function Harness() {
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autostart") !== "1") return;
    installFetchMock();
    installGeolocationMock();
    // React StrictMode (dev) kétszer futtatja az effektet — a sorozat egyszer fusson.
    const w = window as unknown as { __vuHarnessStarted?: boolean };
    if (w.__vuHarnessStarted) return;
    w.__vuHarnessStarted = true;
    (async () => {
      // A süti-tájékoztatóra a legszűkebb választ adjuk (ha megjelenik).
      await clickButton((t) => t === "Csak szükséges sütik", 3000);
      await clickButton((t) => t === "Útvonal keresése");
      await clickButton((t) => t === "Térkép megnyitása");
      await clickButton((t) => t.includes("Navigáció indítása"));
      await new Promise((r) => setTimeout(r, 4000));
      const layout = document.querySelector("[data-vu-nav-layout]")?.getAttribute("data-vu-nav-layout") ?? "v1";
      const problems = measure();
      setReport(`${layout} · ${window.innerWidth}×${window.innerHeight} · ${problems.length ? problems.join(", ") : "ELRENDEZÉS OK"}`);
    })();
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
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[100] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded bg-fuchsia-700/90 p-2 text-center text-xs font-bold text-white">
          {report}
        </div>
      )}
    </div>
  );
}
