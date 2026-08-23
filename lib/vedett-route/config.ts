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
export const VEDETT_ROUTE_CACHE = {
  staticGtfsMaxAgeSeconds: Number(process.env.VEDETT_GTFS_STATIC_MAX_AGE_SECONDS ?? 24 * 60 * 60),
  realtimeMaxAgeSeconds: Number(process.env.VEDETT_GTFS_REALTIME_MAX_AGE_SECONDS ?? 20),
};
