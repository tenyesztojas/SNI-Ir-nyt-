// Védett Útvonal — konfiguráció és feature flag kezelés.
//
// FONTOS: ez a fájl kizárólag szerver oldalon fut (Server Component / Route
// Handler / Server Action). Semmi innen nem kerülhet a kliens bundle-be.
// A BKK_API_KEY-t emiatt sosem exportáljuk objektumként a kliens felé —
// csak a providerek olvassák közvetlenül process.env-ből, szükség szerint.

export type VedettRouteAccessLevel = "admin_only" | "authenticated_users" | "beta_testers" | "public";

// PUBLIKUS, REGISZTRÁLT FELHASZNÁLÓI BÉTA (2026-09-09, korábbi zárt béta
// szakasz után) — a Védett Útvonal mostantól BÁRMELY bejelentkezett,
// regisztrált felhasználó számára elérhető, KIJELENTKEZETT/anonim látogató
// számára NEM (lásd access.ts requireVedettRouteAccess() ->
// requireVedettRouteAuthenticated()). Ez a korábban előkészített
// "authenticated_users" szint most VÁLIK AKTÍVVÁ — a korábbi "beta_testers"
// (admin VAGY explicit `vedett_route_beta` pilot_access grant) szakasz
// lezárult; a grant-alapú infrastruktúra (lásd VEDETT_ROUTE_BETA_FEATURE_KEY,
// app/admin/tesztelok) VÁLTOZATLANUL megmarad backwards compatibility és a
// más pilot modulok (vedett-jelzes, vedett-partner, vedettmunka) miatt, de a
// Védett Útvonal hozzáférése többé NEM függ tőle. A "public" szint továbbra
// sem aktív — az egy jövőbeli, anonim-hozzáférésű release döntés esetén
// kapcsolható be (egyetlen sor módosítása, a route/API/RLS réteg már
// felkészült rá, lásd access.ts switch ága).
//
// FONTOS: ez a konstans A JOGOSULTSÁGI MODELLT írja le — TELJESEN FÜGGETLEN
// a VEDETT_ROUTE_ENABLED globális kill switch-től (lásd
// isVedettRouteFeatureEnabled() lent). A kettő EGYÜTT dönt: a feature flag
// nélkül SENKI (admin sem) nem fér hozzá; a feature flaggel EGYÜTT ez a
// konstans dönti el, hogy a bekapcsolt funkción belül KIK (jelenleg: minden
// bejelentkezett felhasználó).
export const VEDETT_ROUTE_ACCESS_LEVEL: VedettRouteAccessLevel = "authenticated_users";

// A "profiles.pilot_access" tömbben tárolt kulcs, amivel egy admin egy
// felhasználót Védett Útvonal béta-tesztelővé tehet (lásd
// app/admin/tesztelok — ez a KORÁBBAN MÁR LÉTEZŐ, más pilot modulokhoz
// (vedett-jelzes, vedett-partner, vedettmunka) is használt generikus
// feature-access mechanizmus, amit ITT ÚJRAHASZNÁLUNK, NEM egy új,
// párhuzamos permission-rendszert építünk — lásd a végső audit riportban
// az "EXISTING PERMISSION SYSTEM REUSED" sort).
export const VEDETT_ROUTE_BETA_FEATURE_KEY = "vedett_route_beta";

export function isVedettRouteFeatureEnabled(): boolean {
  return process.env.VEDETT_ROUTE_ENABLED === "true";
}

export function isBkkApiKeyConfigured(): boolean {
  return Boolean(process.env.BKK_API_KEY && process.env.BKK_API_KEY.trim().length > 0);
}

// LEGACY / FEJLESZTŐI KÖZVETLEN MOTIS ELÉRÉS.
//
// Ez a mechanizmus a Sprint 2/Map-GPS sprint idején volt az EGYETLEN út a
// MOTIS-hoz, amikor a Next.js szerver és a MOTIS Docker konténer ugyanazon
// a gépen/Docker hálózaton futott (lásd docs/vedett-route/PRODUCTION_DEPLOYMENT.md
// korábbi állapota). Az "VPS → Staging Integration Gate" sprint (2026-09-07)
// óta ez KIZÁRÓLAG fejlesztői gépen, NEM production környezetben használható —
// lásd getRouteServiceConfig() lent az éles útvonalért.
//
// FAIL CLOSED SZABÁLY: production-ben (process.env.NODE_ENV === "production")
// ez a függvény MINDIG null-t ad vissza, MÉG AKKOR IS, ha a MOTIS_BASE_URL env
// változó véletlenül be van állítva — hogy egy elfelejtett/rosszul másolt
// fejlesztői env változó soha ne nyithasson közvetlen (route service és auth
// nélküli) utat a MOTIS-hoz production-ben.
export function getLegacyDirectMotisBaseUrl(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const url = process.env.MOTIS_BASE_URL;
  return url && url.trim().length > 0 ? url.trim() : null;
}

// Visszafelé kompatibilis alias — lásd docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md
// "A) Audit" szakasza a régi getMotisBaseUrl() hívóhelyeinek listájáért.
export function getMotisBaseUrl(): string | null {
  return getLegacyDirectMotisBaseUrl();
}

// ÉLES ÚTVONAL (VPS → Staging Integration Gate, 2026-09-07): a Next.js
// szerver (jellemzően Vercel-en fut, NEM a VPS-en) soha nem éri el
// közvetlenül a MOTIS 127.0.0.1:8080/8081 portjait — azok szándékosan
// nem publikusak (lásd docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md
// architektúra szabályok). Helyette egy, a VPS-en futó, HTTPS-en publikált,
// szerver-oldali auth tokennel védett "route service"-t hív, ami belül
// reverse-proxyol a localhost:8081 MOTIS-ra.
//
// ROUTE_SERVICE_URL és ROUTE_SERVICE_AUTH_TOKEN EGYÜTT kötelezőek — ha
// bármelyik hiányzik, a routing FAIL CLOSED: "nincs konfigurálva", SOHA
// nem esik vissza csendben egy kevésbé biztonságos útvonalra.
export interface RouteServiceConfig {
  baseUrl: string;
  authToken: string;
  timeoutMs: number;
}

const DEFAULT_ROUTE_SERVICE_TIMEOUT_MS = 8_000;
const MAX_ROUTE_SERVICE_TIMEOUT_MS = 25_000; // Vercel function timeout alatt kell maradnia

export function getRouteServiceConfig(): RouteServiceConfig | null {
  const baseUrl = process.env.ROUTE_SERVICE_URL?.trim();
  const authToken = process.env.ROUTE_SERVICE_AUTH_TOKEN?.trim();
  if (!baseUrl || !authToken) return null;

  // Védelmi háló: a route service URL-nek HTTPS-nek kell lennie (kivéve
  // explicit localhost fejlesztői teszt), hogy az auth token soha ne
  // utazzon titkosítatlan csatornán.
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl);
  if (!baseUrl.startsWith("https://") && !isLocalhost) {
    return null;
  }

  const rawTimeout = Number(process.env.ROUTE_SERVICE_TIMEOUT_MS ?? DEFAULT_ROUTE_SERVICE_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.min(rawTimeout, MAX_ROUTE_SERVICE_TIMEOUT_MS)
      : DEFAULT_ROUTE_SERVICE_TIMEOUT_MS;

  return { baseUrl, authToken, timeoutMs };
}

// Cache-időtartamok (másodpercben), konfigurálhatóan — 30. pont.
//
// realtimeMaxAgeSeconds (15. pont, BKK Realtime integráció): a MOTIS
// realtime polling intervalluma 15 másodperc (lásd
// scripts/vedett-route/generate-motis-rt-config.mjs). A BKK GTFS-RT
// feedek publikálási késleltetése és a MOTIS poll-ciklusa miatt egy
// friss adatpont "kora" ténylegesen 0-30+ másodperc között mozoghat
// pusztán a rendszeres frissítési ciklusból adódóan, hálózati vagy
// feed-oldali csúszás nélkül is. A korábbi 20 másodperces alapérték túl
// szigorú lett volna (rendszeresen "stale"-nek jelölte volna a valójában
// friss adatot) — 90 másodpercre emeltük (kb. 6x a poll intervallum),
// hogy a normál poll-ciklus ingadozása ne okozzon hamis "elavult" jelzést,
// miközben egy ténylegesen megszakadt/elakadt feedet (percekig nem
// frissülő FeedHeader.timestamp) továbbra is helyesen "stale"-nek jelöl.
export const VEDETT_ROUTE_CACHE = {
  staticGtfsMaxAgeSeconds: Number(process.env.VEDETT_GTFS_STATIC_MAX_AGE_SECONDS ?? 24 * 60 * 60),
  realtimeMaxAgeSeconds: Number(process.env.VEDETT_GTFS_REALTIME_MAX_AGE_SECONDS ?? 90),
};
