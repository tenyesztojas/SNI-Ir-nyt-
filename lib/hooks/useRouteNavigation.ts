"use client";

import { useEffect, useRef, useState } from "react";
import { createInitialRouteProgress, updateRouteProgress } from "@/lib/vedett-route/navigation/routeProgress";
import type { NavigationCoordinate, NavigationPosition, RouteProgressOptions, RouteProgressState } from "@/lib/vedett-route/navigation/types";

export function useRouteNavigation(
  routeCoordinates: readonly NavigationCoordinate[],
  position: NavigationPosition | null,
  options: RouteProgressOptions = {},
  active = true,
  // TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — opcionális,
  // additív paraméter (alapértéke 0 -> a MEGLÉVŐ hívási helyeken byte-ra a
  // régi viselkedés). A hívó (VedettUtvonalSearchForm.tsx) ennek increment-
  // jével tudja explicit force-resetelni a hook belső állapotát (törli a
  // felgyűlt OFF_ROUTE-bizonyítékot/consecutiveOffRouteFixes-t) UGYANAZZAL a
  // MÁR MEGLÉVŐ reset-mechanizmussal, mint a route-/active-váltás — nincs
  // új állapotgép, csak egy plusz "reset-jel" ugyanahhoz az effekthez.
  resetToken = 0,
): RouteProgressState {
  const [state, setState] = useState<RouteProgressState>(() => createInitialRouteProgress());
  const previousRef = useRef<RouteProgressState | null>(null);

  useEffect(() => {
    previousRef.current = null;
    setState(createInitialRouteProgress());
  }, [routeCoordinates, active, resetToken]);

  useEffect(() => {
    if (!active || !position || routeCoordinates.length < 2) return;
    const next = updateRouteProgress(routeCoordinates, position, previousRef.current, options);
    previousRef.current = next;
    setState(next);
  }, [active, position, routeCoordinates, options.onRouteThresholdMeters, options.offRouteThresholdMeters, options.offRouteConfirmFixes, options.backwardToleranceMeters, options.routeDurationSeconds]);

  return state;
}
