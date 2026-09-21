"use client";

// VÉDETT ÚTVONAL NAVIGATION-ONLY PWA sprint (2026-09-21), 12. pont —
// KIZÁRÓLAG a MEGLÉVŐ GA4-et (gtag, lásd app/layout.tsx) használja, NEM
// épít új analytics rendszert / nem nyúl a Supabase pwa_stats táblához
// (az séma-migráció nélkül kockázatos lenne). Egyetlen felelőssége: a
// Védett Útvonal PWA shell megnyitásakor egy GA4 eseményt küld, a
// tényleges telepített-standalone állapot szerint megkülönböztetve —
// hogy a normál böngészős használat SOHA ne számítson tévesen PWA-nak.

import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function VedettUtvonalPwaAnalytics() {
  useEffect(() => {
    const standalone = isStandaloneDisplay();
    window.gtag?.("event", "vedett_utvonal_shell_view", {
      app_surface: standalone ? "vedett_utvonal_pwa" : "vedett_utvonal_web",
    });
  }, []);

  return null;
}
