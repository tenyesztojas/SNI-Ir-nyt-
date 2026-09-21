// VÉDETT ÚTVONAL — dedikált, elkülönített service worker (2026-09-21,
// "SW TAKEOVER FIX" kör). Kizárólag a PWA installability-hez és a scope
// takeoverhöz szükséges minimum: install -> skipWaiting(), activate ->
// clients.claim(), fetch -> pass-through/no-op (NINCS cache-stratégia,
// nem cache-el semmit — navigáció/API/realtime válasz érintetlen).
//
// A clients.claim() teszi lehetővé, hogy ha a /vedett-utvonal dokumentumot
// korábban a root /sw.js ("/" scope) kontrollálta, az új, dedikált worker
// aktiválása után AZONNAL átvegye a vezérlést (takeover) — külön
// unregister/törlés nélkül, a root SW-t máshol nem érinti.
//
// Scope: "/vedett-utvonal/" (lásd a regisztrációt app/layout.tsx-ben) — a
// root VédettSarok /sw.js ezen a route-családon NEM regisztrálódik, hogy a
// két registration ne versenyezzen egymással.

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  // Pass-through/no-op: nincs cache-olvasás/-írás, a kérés a böngésző
  // alapértelmezett hálózati kezeléséhez kerül (nincs válasz-felülírás).
});
