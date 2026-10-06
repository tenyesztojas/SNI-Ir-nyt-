"use client";

// VÉDETT ÚTVONAL — REALTIME COMMUNITY INTELLIGENCE — navigációs figyelmeztetés hook.
//
// Aktív navigáció alatt a MÁR ismert trip/route/szakasz kontextussal
// (buildCommunityReportContext) lekéri az aggregált közösségi állapotot,
// percenként és kontextusváltáskor. Csak azonosítókat küld — koordinátát nem.
// A megjelenítést hiszterézises tiszta függvény dönti el
// (selectNavigationCommunityWarning), így nem villog. Hiba esetén csendes.

import { useEffect, useRef, useState } from "react";
import type { CommunityReportTransitContext } from "@/lib/vedett-route/communityReports/context";
import { COMMUNITY_STATE_POLL_INTERVAL_MS } from "@/lib/vedett-route/communityReports/realtimeConfig";
import type { CommunityRealtimeState } from "@/lib/vedett-route/communityReports/realtimeEngine";
import {
  selectNavigationCommunityWarning,
  type NavigationCommunityWarning,
} from "@/lib/vedett-route/communityReports/navigationWarning";

export function useCommunityRealtimeWarning(
  enabled: boolean,
  context: CommunityReportTransitContext
): NavigationCommunityWarning | null {
  const [warning, setWarning] = useState<NavigationCommunityWarning | null>(null);
  const previousKindRef = useRef<NavigationCommunityWarning["kind"] | null>(null);
  const { tripId, routeId, fromStopId, toStopId } = context;
  const hasKey = Boolean(tripId || routeId);

  useEffect(() => {
    if (!enabled || !hasKey) {
      previousKindRef.current = null;
      setWarning(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/vedett-route/community-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, routeId, fromStopId, toStopId }),
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => null)) as { ok?: boolean; states?: CommunityRealtimeState[] } | null;
        if (cancelled || !data?.ok || !Array.isArray(data.states)) return;
        const next = selectNavigationCommunityWarning(data.states, previousKindRef.current);
        previousKindRef.current = next?.kind ?? null;
        setWarning((current) => (current?.kind === next?.kind ? current : next));
      } catch {
        // csendes: a navigációt nem zavarja
      }
    };
    void load();
    const timer = setInterval(load, COMMUNITY_STATE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, hasKey, tripId, routeId, fromStopId, toStopId]);

  return warning;
}
