"use client";

// PWA install UX sprint (2026-09-10), spec 23./25. pont — "az install
// panel ne jelenjen meg az aktív Védett Útvonal Navigation Mode fölött; ha
// már nyitva van és Navigation Mode indul, záródjon/bevonuljon", és "ehhez
// NE hozz létre új globális routing state architektúrát, ha egyszerűbb
// meglévő módon megoldható".
//
// Ez a modul EGY minimális, szándékosan buta pub/sub — NEM Context/Redux/
// állapotkezelő, csak egy modul-szintű változó + egy window CustomEvent —
// mert a Navigation Mode állapota (RankedJourneyCard, VedettUtvonalSearchForm.tsx-
// ben) és a sitewide PWAInstallBanner (app/layout.tsx-ben, teljesen külön
// React-fán) között nincs közös szülő komponens, amin keresztül prop-ot
// lehetne adni. Ez a modul a legszűkebb, architektúra-mentes híd a kettő
// között.
//
// FONTOS — ez NEM GPS-adat és NEM érzékeny adat: kizárólag egy boolean
// jelzi, hogy éppen aktív-e a Navigation Mode UI, semmi mást nem hordoz.

const EVENT_NAME = "vedettsarok:navigation-mode-change";

let active = false;

export function setNavigationModeActive(next: boolean): void {
  if (active === next) return;
  active = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<{ active: boolean }>(EVENT_NAME, { detail: { active } }));
  }
}

export function isNavigationModeActive(): boolean {
  return active;
}

// Visszaadja a leiratkozó függvényt (React useEffect cleanup-hoz).
export function subscribeNavigationModeActive(listener: (active: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ active: boolean }>).detail;
    listener(detail.active);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
