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
import type { CommunityLegContext } from "@/lib/vedett-route/communityReports/communityRouting";
import type { CommunityLoadEvaluation } from "@/lib/vedett-route/communityReports/expectedLoadEngine";
import { chunkContexts } from "@/lib/vedett-route/communityReports/communityRouting";
import { adaptPublicLoadEvaluation, contextsKey, type PublicLoadEvaluation } from "@/lib/vedett-route/communityReports/communityMonitor";

/**
 * DYNAMIC SENSORY REROUTING (2026-10-06) — opcionális aktív-útvonal monitor.
 * UGYANAZT a percenkénti timert és láthatóság-ellenőrzést használja, mint a
 * figyelmeztetés (nincs második, független polling loop). Szakaszváltáskor
 * (a hátralévő kontextusok kulcsa változik) azonnal frissít. Csak azonosítókat
 * és tervezett indulási időt küld — koordinátát nem.
 */
export interface CommunityRouteMonitorOptions {
  enabled: boolean;
  contexts: readonly CommunityLegContext[];
  onEvaluations: (evaluations: Map<string, CommunityLoadEvaluation>) => void;
}

async function fetchRemainingLoad(contexts: readonly CommunityLegContext[]): Promise<Map<string, CommunityLoadEvaluation> | null> {
  const out = new Map<string, CommunityLoadEvaluation>();
  for (const chunk of chunkContexts(contexts)) {
    const response = await fetch("/api/vedett-route/community-load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contexts: chunk.map((c) => ({ routeId: c.routeId, tripId: c.tripId, fromStopId: c.fromStopId, toStopId: c.toStopId, departureTime: c.departureTime })),
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { ok?: boolean; results?: (PublicLoadEvaluation & { index: number })[] } | null;
    if (!data?.ok || !Array.isArray(data.results) || data.results.length !== chunk.length) return null;
    data.results.forEach((result, i) => out.set(chunk[i].key, adaptPublicLoadEvaluation(result)));
  }
  return out;
}

export function useCommunityRealtimeWarning(
  enabled: boolean,
  context: CommunityReportTransitContext,
  monitor?: CommunityRouteMonitorOptions
): NavigationCommunityWarning | null {
  const [warning, setWarning] = useState<NavigationCommunityWarning | null>(null);
  const previousKindRef = useRef<NavigationCommunityWarning["kind"] | null>(null);
  const { tripId, routeId, fromStopId, toStopId } = context;
  const hasKey = Boolean(tripId || routeId);
  const monitorEnabled = Boolean(enabled && monitor?.enabled && monitor.contexts.length > 0);
  const monitorKey = monitorEnabled && monitor ? contextsKey(monitor.contexts) : "";
  const monitorRef = useRef(monitor);
  monitorRef.current = monitor;

  useEffect(() => {
    if (!enabled || (!hasKey && !monitorEnabled)) {
      previousKindRef.current = null;
      setWarning(null);
      return;
    }
    let cancelled = false;
    let monitorInFlight = false;
    const loadMonitor = async () => {
      const current = monitorRef.current;
      if (!monitorEnabled || !current || monitorInFlight) return;
      monitorInFlight = true;
      try {
        const evaluations = await fetchRemainingLoad(current.contexts);
        if (!cancelled && evaluations) current.onEvaluations(evaluations);
      } catch {
        // csendes: a navigáció zavartalanul folytatódik
      } finally {
        monitorInFlight = false;
      }
    };
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadMonitor();
      if (!hasKey) return;
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
  }, [enabled, hasKey, tripId, routeId, fromStopId, toStopId, monitorEnabled, monitorKey]);

  return warning;
}
