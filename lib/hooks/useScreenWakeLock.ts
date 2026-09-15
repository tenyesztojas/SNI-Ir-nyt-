"use client";

import { useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keeps the display awake while `active` is true when supported.
 * Wake Lock is progressive enhancement: failures never block navigation.
 */
export function useScreenWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    let disposed = false;

    const releaseCurrent = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel) return;
      try {
        await sentinel.release();
      } catch {
        // Best-effort cleanup only.
      }
    };

    const requestWakeLock = async () => {
      if (!active || disposed || document.visibilityState !== "visible") return;
      if (sentinelRef.current && sentinelRef.current.released !== true) return;

      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock?.request) return;

      try {
        const sentinel = await wakeLock.request("screen");
        if (disposed || generationRef.current !== generation || !active) {
          try {
            await sentinel.release();
          } catch {
            // Best-effort stale-request cleanup.
          }
          return;
        }

        sentinelRef.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Browser denial, policy or battery saver must not break navigation.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };

    if (active) {
      void requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    } else {
      void releaseCurrent();
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseCurrent();
    };
  }, [active]);
}
