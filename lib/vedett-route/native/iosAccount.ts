// VÉDETT ÚTVONAL — iOS natív fiókkezelés (App Review 5.1.1(v) fióktörlés).
//
// A Capacitor iOS (8.x, WebViewDelegationHandler.decidePolicyFor) egy teljes
// oldalas navigációt csak akkor tart a WebView-ban, ha az URL a server.url-lel
// (https://www.vedettsarok.hu/vedett-utvonal) KEZDŐDIK; minden mást a
// rendszer-Safariban nyit meg (ahol a felhasználó nincs bejelentkezve). Ezért a
// natív fiókoldal és a törlés utáni cél is a /vedett-utvonal előtagon belül van.
//
// A platformot a natív híd (window.Capacitor) adja, NEM a User-Agent: a webes
// böngészőben és Androidon a link nem jelenik meg (változatlan viselkedés).

export const VEDETT_UTVONAL_ACCOUNT_PATH = "/vedett-utvonal/fiok";
export const VEDETT_UTVONAL_AFTER_DELETE_PATH = "/vedett-utvonal";
export const VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH = "/belepes?next=%2Fvedett-utvonal%2Ffiok";

interface PlatformBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

/** Igaz, ha a kód a natív iOS Védett Útvonal app WebView-jában fut. */
export function isIosNativeApp(win: unknown = typeof window === "undefined" ? null : window): boolean {
  const cap = (win as { Capacitor?: PlatformBridge } | null)?.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || typeof cap.getPlatform !== "function") return false;
  try {
    return cap.isNativePlatform() === true && cap.getPlatform() === "ios";
  } catch {
    return false;
  }
}
