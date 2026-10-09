// VÉDETT ÚTVONAL — alkalmazásletöltési linkek EGYETLEN forrása (2026-10-09).
//
// Minden letöltési jelzés (főoldali kártya, /vedett-utvonal aloldal) ezt
// használja a components/vedett-utvonal/AppDownloadBadges.tsx komponensen
// keresztül — URL-t és megjelenítési döntést máshol NEM duplikálunk.
//
// - Google Play: az Android-app ÉLES, hivatalos listája (fix URL).
// - App Store: az iOS-app MÉG NEM jelent meg. URL-t nem találunk ki: amíg a
//   VEDETT_UTVONAL_APP_STORE_URL env változó nincs beállítva (vagy nem
//   érvényes apps.apple.com https URL), a gomb "Hamarosan iPhone-ra is"
//   jelzés, NEM link. Az éles URL beállításakor (szerver-oldali env, a
//   force-dynamic oldalak futásidőben olvassák) a gomb kattinthatóvá válik.
// - Hivatalos jelvényképek: ha a public/badges/ mappába bekerül a gyártó
//   által kiadott, VÁLTOZTATÁS NÉLKÜLI jelvényfájl, az útvonalát itt kell
//   megadni; addig a komponens logó nélküli, szöveges gombot mutat.

export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=hu.vedettsarok.utvonal";

export const APP_STORE_URL_ENV = "VEDETT_UTVONAL_APP_STORE_URL";

/** Hivatalos jelvényképek (public/ alatti útvonal) — null: szöveges gomb. */
export const STORE_BADGE_IMAGES: { googlePlay: string | null; appStore: string | null } = {
  googlePlay: null, // pl. "/badges/google-play-badge-hu.png"
  appStore: null, // pl. "/badges/app-store-badge-hu.svg"
};

export type StoreLink =
  | { status: "available"; href: string; badgeSrc: string | null }
  | { status: "coming_soon"; badgeSrc: string | null };

export interface VedettAppStoreLinks {
  googlePlay: StoreLink;
  appStore: StoreLink;
}

/** Csak valódi, https apps.apple.com alkalmazás-URL fogadható el. */
export function normalizeAppStoreUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "apps.apple.com") return null;
    if (!/\/app\/(?:[^/]+\/)?id\d+\/?$/.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getVedettAppStoreLinks(
  env: Record<string, string | undefined> = process.env
): VedettAppStoreLinks {
  const appStoreUrl = normalizeAppStoreUrl(env[APP_STORE_URL_ENV]);
  return {
    googlePlay: { status: "available", href: GOOGLE_PLAY_URL, badgeSrc: STORE_BADGE_IMAGES.googlePlay },
    appStore: appStoreUrl
      ? { status: "available", href: appStoreUrl, badgeSrc: STORE_BADGE_IMAGES.appStore }
      : { status: "coming_soon", badgeSrc: null },
  };
}
