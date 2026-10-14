"use client";

// Egyetlen, láthatóság-tudatos időzítő: rejtett lapon NEM ütemez (nincs
// felesleges munka/lekérdezés), visszatéréskor azonnal fut, unmountkor leáll.
// A delayMs minden futás után újraszámolódik (pl. perchatárra igazítás).

import { useEffect, useRef } from "react";

export function useVisibleTick(onTick: () => void, delayMs: () => number, options: { immediate?: boolean } = {}) {
  const tickRef = useRef(onTick);
  const delayRef = useRef(delayMs);
  tickRef.current = onTick;
  delayRef.current = delayMs;
  const immediate = options.immediate ?? true;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (stopped || document.visibilityState === "hidden") return;
      timer = setTimeout(run, delayRef.current());
    };
    const run = () => {
      if (stopped) return;
      if (document.visibilityState !== "hidden") tickRef.current();
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
      else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    if (immediate) run();
    else schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [immediate]);
}

// Következő perchatárig hátralévő idő (+50 ms tartalék).
export function msUntilNextMinute(nowMs: number = Date.now()): number {
  return 60_000 - (nowMs % 60_000) + 50;
}
