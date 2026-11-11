// VÉDETT ÚTVONAL — alkalmazásletöltési linkek EGYETLEN forrása (2026-10-09,
// App Store-aktiválás: 2026-11-05).
//
// Minden letöltési jelzés (főoldali kártya, /vedett-utvonal aloldal) ezt
// használja a components/vedett-utvonal/AppDownloadBadges.tsx komponensen
// keresztül — URL-t és megjelenítési döntést máshol NEM duplikálunk.
//
// - Google Play: az Android-app ÉLES, hivatalos listája (fix URL, változatlan).
// - App Store: az iOS-app ÉLES, hivatalos listája (fix URL).
// - Áruházi jelvények: public/badges/ alatt, az átadott PNG-k változatlanul
//   (mindkettő 612×169 px; a komponens fix magassággal, arányosan jeleníti meg).

export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=hu.vedettsarok.utvonal";

export const APP_STORE_URL = "https://apps.apple.com/hu/app/védett-útvonal/id6821697394?l=hu";

/** Hivatalos jelvényképek (public/ alatti útvonal) és eredeti pixelméretük. */
export const STORE_BADGE_IMAGES = {
  googlePlay: { src: "/badges/google_play_badge.png", width: 612, height: 169 },
  appStore: { src: "/badges/apple_app_store_badge.png", width: 612, height: 169 },
} as const;

export interface StoreBadgeImage {
  src: string;
  width: number;
  height: number;
}

export interface StoreLink {
  href: string;
  badge: StoreBadgeImage;
  /** Akadálymentes név (a jelvény képe angol feliratú, ezért a név magyar). */
  label: string;
}

export interface VedettAppStoreLinks {
  googlePlay: StoreLink;
  appStore: StoreLink;
}

export const STORE_LABELS = {
  googlePlay: "Letöltés a Google Playből",
  appStore: "Letöltés az App Store-ból",
} as const;

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

export function getVedettAppStoreLinks(): VedettAppStoreLinks {
  return {
    googlePlay: { href: GOOGLE_PLAY_URL, badge: STORE_BADGE_IMAGES.googlePlay, label: STORE_LABELS.googlePlay },
    appStore: { href: APP_STORE_URL, badge: STORE_BADGE_IMAGES.appStore, label: STORE_LABELS.appStore },
  };
}
