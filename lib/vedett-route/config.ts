// Védett Útvonal — konfiguráció és feature flag kezelés.
//
// FONTOS: ez a fájl kizárólag szerver oldalon fut (Server Component / Route
// Handler / Server Action). Semmi innen nem kerülhet a kliens bundle-be.
// A BKK_API_KEY-t emiatt sosem exportáljuk objektumként a kliens felé —
// csak a providerek olvassák közvetlenül process.env-ből, szükség szerint.

export type VedettRouteAccessLevel = "admin_only" | "beta_testers" | "public";

// Jelenlegi hozzáférési szint — Fázis 1-ben mindig admin_only.
// A későbbi fázisokban ez konfigurálhatóvá válhat (pl. env változóból),
// de amíg nincs explicit publikus release döntés, kódból van lezárva.
export const VEDETT_ROUTE_ACCESS_LEVEL: VedettRouteAccessLevel = "admin_only";

export function isVedettRouteFeatureEnabled(): boolean {
  return process.env.VEDETT_ROUTE_ENABLED === "true";
}

export function isBkkApiKeyConfigured(): boolean {
  return Boolean(process.env.BKK_API_KEY && process.env.BKK_API_KEY.trim().length > 0);
}

export function getMotisBaseUrl(): string | null {
  const url = process.env.MOTIS_BASE_URL;
  return url && url.trim().length > 0 ? url.trim() : null;
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
