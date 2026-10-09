// HÁTTÉRNAVIGÁCIÓS TÁJÉKOZTATÁS (2026-10-09) — a Védett Útvonal csak
// előtérben követ (nincs háttérbeli helymeghatározás / foreground service,
// lásd AndroidManifest.xml). Navigáció indításakor (vagy visszaállításakor)
// egy rövid, nem blokkoló tájékoztatás jelenik meg. Nem ismétlődik
// indokolatlanul: navigációs munkamenetenként legfeljebb egyszer, néhány
// másodperc után magától eltűnik, és az "Értem" után többé nem jelenik meg
// (best-effort localStorage, hibánál fail-open = megjelenik).

export const BACKGROUND_NAVIGATION_NOTICE_TEXT =
  "A folyamatos navigációhoz tartsd nyitva az alkalmazást. Lezárt képernyőnél vagy másik alkalmazás használatakor a követés szünetelhet.";
export const BACKGROUND_NAVIGATION_NOTICE_ACK_KEY = "vedett-route:background-navigation-notice-ack:v1";
export const BACKGROUND_NAVIGATION_NOTICE_AUTO_HIDE_MS = 12_000;

export function loadBackgroundNavigationNoticeAcknowledged(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BACKGROUND_NAVIGATION_NOTICE_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveBackgroundNavigationNoticeAcknowledged(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BACKGROUND_NAVIGATION_NOTICE_ACK_KEY, "1");
  } catch {
    // no-op
  }
}

/** Navigáció (újra)indulásakor kell-e megjeleníteni. */
export function shouldShowBackgroundNavigationNotice(input: { navigationActive: boolean; acknowledged: boolean }): boolean {
  return input.navigationActive && !input.acknowledged;
}
