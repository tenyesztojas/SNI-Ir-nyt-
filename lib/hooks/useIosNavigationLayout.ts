"use client";

// iOS NATÍV NAVIGÁCIÓS ELRENDEZÉS v2 — képesség-alapú kapcsoló.
// enabled=true KIZÁRÓLAG akkor, ha a natív iOS app getSafeAreaInsets
// metódusa érvényes választ ad (lásd nativeNavigationBridge.ts). Minden más
// környezetben (web, Android, régi iOS-build) enabled=false, és a meglévő
// elrendezés bájtra azonos marad. Forgatásnál/átméretezésnél frissít.

import { useEffect, useState } from "react";
import {
  getNativeSafeAreaLayout,
  isIosNativePlatform,
  residualSafeAreaInsets,
  type EdgeInsets,
  type NativeSafeAreaLayout,
} from "@/lib/vedett-route/native/nativeNavigationBridge";

const ZERO: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function sameLayout(a: NativeSafeAreaLayout | null, b: NativeSafeAreaLayout): boolean {
  if (!a) return false;
  return (["top", "right", "bottom", "left"] as const).every(
    (k) => a.safe[k] === b.safe[k] && a.adjusted[k] === b.adjusted[k]
  );
}

export function useIosNavigationLayout(): { enabled: boolean; insets: EdgeInsets } {
  const [layout, setLayout] = useState<NativeSafeAreaLayout | null>(null);

  useEffect(() => {
    if (!isIosNativePlatform()) return;
    let cancelled = false;
    let frame = 0;
    const refresh = () => {
      void getNativeSafeAreaLayout().then((next) => {
        if (!cancelled && next) setLayout((prev) => (sameLayout(prev, next) ? prev : next));
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    refresh();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, []);

  return { enabled: layout !== null, insets: layout ? residualSafeAreaInsets(layout) : ZERO };
}
