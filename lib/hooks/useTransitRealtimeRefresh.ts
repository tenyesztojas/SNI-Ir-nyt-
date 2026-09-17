"use client";

// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH, 2026-09-16) — polling hook, ami
// a POST /api/vedett-route/realtime-refresh végpontot hívja, a
// realtimeRefreshGuard.ts PURE döntési logikája szerint (lásd ott a
// gate-elési feltételeket). A hívó (VedettUtvonalSearchForm.tsx) adja át a
// friss `sessionId`-t, ami reroute/rest-stop resume/navigáció-leállás esetén
// változik — ez a session/stale-response guard (Sprint 7.2, 8. pont),
// UGYANAZ a `sessionRef` mintázat, mint a meglévő automatikus reroute
// effektnél (lásd VedettUtvonalSearchForm.tsx rerouteSessionRef).
//
// Ez a hook SOHA nem hív setDisplayedJourney(newFullJourney)-t — csak az
// onUpdates callback-en keresztül adja tovább a kinyert frissítéseket, a
// hívó felelőssége a functional setDisplayedJourney(prev =>
// mergeRealtimeUpdates(prev, updates)) hívás (Sprint 7.2, 9. pont).

import { useEffect, useRef } from "react";
import {
  createInitialRealtimeRefreshGuardState,
  markRealtimeRefreshFinished,
  markRealtimeRefreshStarted,
  shouldStartRealtimeRefresh,
  TRANSIT_REALTIME_REFRESH_INTERVAL_MS,
  type RealtimeRefreshGuardState,
} from "@/lib/vedett-route/navigation/realtimeRefreshGuard";
import type { RealtimeLegUpdate, RealtimeRefreshIdentity } from "@/lib/vedett-route/realtimeRefresh/extractUpdates";

export { TRANSIT_REALTIME_REFRESH_INTERVAL_MS };

export interface TransitRealtimeRefreshContext {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  departAt: string;
  legs: RealtimeRefreshIdentity[];
}

export interface UseTransitRealtimeRefreshOptions {
  navigationActive: boolean;
  hasRelevantTransitLeg: boolean;
  hasRestStopOverride: boolean;
  isRerouting: boolean;
  // A hívó által építendő kontextus (Journey saját origin/destination/
  // departAt + a frissítendő TRANSIT lábak identitása). Ha null, a hook
  // sosem indít kérést (pl. nincs elég adat egy biztonságos lekérdezéshez).
  context: TransitRealtimeRefreshContext | null;
  // Reroute / rest-stop resume / navigáció-leállás / új session esetén ezt
  // az értéket a hívónak MEG KELL változtatnia — a hook egy késői válasz
  // esetén ezt ellenőrzi, mielőtt onUpdates-t hívná.
  sessionId: string | number;
  onUpdates: (updates: RealtimeLegUpdate[]) => void;
  intervalMs?: number;
}

export function useTransitRealtimeRefresh(options: UseTransitRealtimeRefreshOptions): void {
  const {
    navigationActive,
    hasRelevantTransitLeg,
    hasRestStopOverride,
    isRerouting,
    context,
    sessionId,
    onUpdates,
    intervalMs,
  } = options;

  const guardRef = useRef<RealtimeRefreshGuardState>(createInitialRealtimeRefreshGuardState());
  const sessionRef = useRef(sessionId);
  const onUpdatesRef = useRef(onUpdates);
  const contextRef = useRef(context);
  onUpdatesRef.current = onUpdates;
  contextRef.current = context;

  // Session váltás esetén (reroute/resume/stop) a guard állapotát is
  // visszaállítjuk — egy korábbi session in-flight kérése emiatt sem
  // blokkolhatja indokolatlanul az újat.
  if (sessionRef.current !== sessionId) {
    sessionRef.current = sessionId;
    guardRef.current = createInitialRealtimeRefreshGuardState();
  }

  const attempt = (justBecameVisible: boolean) => {
    const currentContext = contextRef.current;
    if (!currentContext) return;

    const decision = shouldStartRealtimeRefresh(guardRef.current, {
      navigationActive,
      documentVisible: typeof document === "undefined" ? true : document.visibilityState === "visible",
      hasRelevantTransitLeg,
      hasRestStopOverride,
      isRerouting,
      nowMs: Date.now(),
      intervalMs,
      justBecameVisible,
    });
    if (!decision.shouldRefresh) return;

    const attemptSessionId = sessionRef.current;
    guardRef.current = markRealtimeRefreshStarted(guardRef.current, Date.now());

    void (async () => {
      try {
        const response = await fetch("/api/vedett-route/realtime-refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: currentContext.from,
            to: currentContext.to,
            departAt: currentContext.departAt,
            legs: currentContext.legs,
          }),
        });
        const data = (await response.json().catch(() => null)) as { ok: true; updates: RealtimeLegUpdate[] } | { ok: false } | null;
        if (sessionRef.current !== attemptSessionId) return; // stale response, más session lett aktív
        if (data && data.ok && Array.isArray((data as { updates: RealtimeLegUpdate[] }).updates)) {
          const updates = (data as { updates: RealtimeLegUpdate[] }).updates;
          if (updates.length > 0) onUpdatesRef.current(updates);
        }
        // Hiba/malformed válasz esetén szándékosan csendben marad (Sprint
        // 7.2, 10. pont) — a navigáció, displayedJourney nem változik, a
        // következő polling ciklus újra próbálkozik.
      } catch {
        // Hálózati hiba: navigáció nem szakad meg, nincs user-facing hiba.
      } finally {
        if (sessionRef.current === attemptSessionId) {
          guardRef.current = markRealtimeRefreshFinished(guardRef.current);
        }
      }
    })();
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") attempt(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationActive, hasRelevantTransitLeg, hasRestStopOverride, isRerouting, sessionId, intervalMs]);

  useEffect(() => {
    const timer = setInterval(() => attempt(false), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationActive, hasRelevantTransitLeg, hasRestStopOverride, isRerouting, sessionId, intervalMs]);
}
