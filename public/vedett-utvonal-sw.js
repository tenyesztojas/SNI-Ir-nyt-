// VÉDETT ÚTVONAL — dedikált, elkülönített service worker (2026-09-21).
// Kizárólag a PWA installability-hez szükséges minimum: install/activate/
// fetch. NINCS agresszív cache-stratégia — a fetch handler NEM cache-el
// navigációs, API vagy realtime válaszokat, kizárólag a saját statikus
// shell-eszközeit (manifest + ikonok) preacheli, a navigáció mindig a
// hálózatra megy (nincs offline fallback-veszély).
//
// Scope: "/vedett-utvonal/" (lásd a regisztrációt app/layout.tsx-ben) — a
// root VédettSarok /sw.js ("/" scope) ezen a route-családon NEM
// regisztrálódik, hogy a két registration ne versenyezzen egymással.
const CACHE = "vedett-utvonal-v1";

const PRECACHE = [
  "/manifest-vedett-utvonal.json",
  "/vedett-utvonal-icon-192.png",
  "/vedett-utvonal-icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Navigáció (route-váltás) MINDIG a hálózatra megy — nincs cache
  // beavatkozás, hogy semmilyen cache-stratégia ne veszélyeztesse a
  // navigációt. API/realtime kérésekbe sem szólunk bele: csak a saját
  // statikus shell-eszközeit szolgálja ki cache-ből, azt is csak
  // fallbackként hálózati hiba esetén.
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") return;

  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (!PRECACHE.includes(url.pathname)) return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
